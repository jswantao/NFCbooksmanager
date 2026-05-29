# backend/app/main.py
# 确保 setup_logging 在 lifespan 中正确调用

import time
import os
import sys
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from loguru import logger

from app.api import mapping, shelves, books, admin, images, config_api, import_api, nfc_bridge, nedb_import
from app.api import physical_shelves, backup, chat, smart_entry
from app.core.config import get_settings, validate_config_on_startup
from app.core.database import (
    init_db, close_all_connections,
    check_database_health, get_database_stats,
    SyncSessionLocal
)

# 模块级配置单例（通过 DI 函数获取，确保唯一实例）
_config = get_settings()


def setup_logging():
    """配置 loguru 日志系统"""
    s = get_settings()
    logger.remove()

    log_config = s.get_log_config()

    # 1. 控制台输出
    logger.add(
        sys.stderr,
        level=log_config["level"],
        format="<green>{time:HH:mm:ss}</green> | "
               "<level>{level: <8}</level> | "
               "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
               "<level>{message}</level>",
        colorize=True,
        diagnose=log_config["diagnose"],
        backtrace=log_config["backtrace"],
    )

    # 2. 确保日志目录存在
    log_dir = Path(s.LOG_FILE).parent
    log_dir.mkdir(parents=True, exist_ok=True)

    # 3. 文件输出（delay=True 避免 Windows 多进程文件锁冲突）
    logger.add(
        s.LOG_FILE,
        level=log_config["level"],
        format=log_config["format"],
        rotation=log_config["rotation"],
        retention=log_config["retention"],
        compression="gz",
        diagnose=log_config["diagnose"],
        backtrace=log_config["backtrace"],
        enqueue=log_config["enqueue"],
        encoding="utf-8",
        delay=True,
    )

    error_log = str(Path(s.LOG_FILE).with_name('app.error.log'))
    logger.add(
        error_log,
        level="ERROR",
        format=log_config["format"],
        rotation=log_config["rotation"],
        retention=log_config["retention"],
        compression="gz",
        diagnose=True,
        backtrace=True,
        enqueue=log_config["enqueue"],
        encoding="utf-8",
        delay=True,
    )

    logger.info(f"日志系统已初始化 | 文件: {s.LOG_FILE} | 错误: {error_log}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    setup_logging()
    logger.info(f"{'='*60}")
    logger.info(f"[START] {s.APP_NAME} v{s.APP_VERSION} 启动中...")
    logger.info(f"{'='*60}")

    validate_config_on_startup()

    try:
        init_db()
        logger.info("[Startup] [OK] 数据库表初始化完成")
    except Exception as e:
        logger.error(f"[Startup] [ERROR] 数据库初始化失败: {e}")

    db = SyncSessionLocal()
    try:
        from app.core.seed import seed_database
        seed_database(db)
        logger.info("[Startup] [OK] 种子数据初始化完成")
    except Exception as e:
        logger.warning(f"[Startup] [WARN] 种子数据初始化失败: {e}")
    finally:
        db.close()

    logger.info(f"[Startup] [OK] http://{s.HOST}:{s.PORT} | /docs | /health")
    logger.info(f"{'='*60}")

    # 启动内存监控任务（每 30 分钟记录一次内存使用基线）
    _memory_monitor_task = asyncio.create_task(_memory_monitor_loop())
    logger.info("[Startup] 内存监控任务已启动")

    # 启动封面缓存定时清理任务
    cache_cleanup_task = None
    if s.IMAGE_CACHE_ENABLED:
        cache_cleanup_task = asyncio.create_task(_image_cache_cleanup_loop())
        logger.info("[Startup] 封面缓存清理任务已启动")

    # 启动自动备份定时任务
    _backup_task = None
    if s.BACKUP_AUTO_ENABLED:
        _backup_task = asyncio.create_task(_scheduled_backup_loop())
        logger.info(f"[Startup] 自动备份任务已启动 (间隔: {s.BACKUP_AUTO_INTERVAL_HOURS}h)")

    # 启动 Dify 知识库每日对账任务
    _reconcile_task = None
    if s.dify_configured:
        _reconcile_task = asyncio.create_task(_scheduled_reconciliation_loop())
        logger.info("[Startup] Dify 知识库对账任务已启动 (每日 3:00)")

    yield

    # 停止清理任务
    if _memory_monitor_task:
        _memory_monitor_task.cancel()
        try:
            await _memory_monitor_task
        except asyncio.CancelledError:
            pass
    if cache_cleanup_task:
        cache_cleanup_task.cancel()
        try:
            await cache_cleanup_task
        except asyncio.CancelledError:
            pass

    # 停止备份任务
    if _backup_task:
        _backup_task.cancel()
        try:
            await _backup_task
        except asyncio.CancelledError:
            pass

    # 停止对账任务
    if _reconcile_task:
        _reconcile_task.cancel()
        try:
            await _reconcile_task
        except asyncio.CancelledError:
            pass

    logger.info(f"{'='*60}")
    logger.info(f"[STOP] {s.APP_NAME} 正在关闭...")
    logger.info(f"{'='*60}")
    close_all_connections()
    # 异步引擎需要在事件循环中关闭
    from app.core.database import async_engine
    if async_engine:
        await async_engine.dispose()
    logger.info("[Shutdown] [OK] 已安全关闭")
    logger.info(f"{'='*60}")


async def _memory_monitor_loop() -> None:
    """后台内存监控：每 30 分钟记录进程内存使用基线"""
    import os as _os
    try:
        import psutil
        _has_psutil = True
    except ImportError:
        _has_psutil = False
        logger.info("psutil 未安装，内存监控使用基础模式")

    while True:
        try:
            await asyncio.sleep(1800)  # 30 分钟
            if _has_psutil:
                proc = psutil.Process(_os.getpid())
                mem = proc.memory_info()
                logger.info(
                    f"[Memory] RSS={mem.rss / 1024 / 1024:.1f}MB "
                    f"VMS={mem.vms / 1024 / 1024:.1f}MB "
                    f"CPU={proc.cpu_percent(interval=0.1):.1f}%"
                )
            else:
                logger.info("[Memory] psutil 未安装，跳过详细监控")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"[Memory] 监控异常: {e}")


async def _image_cache_cleanup_loop() -> None:
    """后台定时清理过期封面缓存文件"""
    cleanup_interval = 3600  # 每小时检查一次
    while True:
        try:
            await asyncio.sleep(cleanup_interval)
            if not _config.IMAGE_CACHE_ENABLED:
                continue

            cache_dir = _config.image_cache_dir_path
            if not cache_dir.exists():
                continue

            now = time.time()
            max_age = _config.IMAGE_CACHE_MAX_AGE
            deleted = 0
            kept = 0

            for f in cache_dir.iterdir():
                if not f.is_file():
                    continue
                try:
                    age = now - f.stat().st_mtime
                    if age > max_age:
                        f.unlink()
                        deleted += 1
                    else:
                        kept += 1
                except OSError:
                    pass

            if deleted > 0:
                logger.info(f"封面缓存清理: 删除 {deleted} 个过期文件, 保留 {kept} 个")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"封面缓存清理异常: {e}")


async def _scheduled_backup_loop() -> None:
    """后台定时自动备份（可选 WebDAV 同步）"""
    s = get_settings()
    interval = s.BACKUP_AUTO_INTERVAL_HOURS * 3600
    # 首次启动后等待 5 分钟再执行第一次备份
    await asyncio.sleep(300)
    while True:
        try:
            from app.services.backup_service import run_scheduled_backup
            await run_scheduled_backup()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"自动备份失败: {e}")
        await asyncio.sleep(interval)


async def _scheduled_reconciliation_loop() -> None:
    """每日凌晨 3:00 执行 Dify 知识库全量对账"""
    from datetime import datetime, timezone
    while True:
        try:
            now = datetime.now(timezone.utc)
            # 计算到明日凌晨 3:00 的秒数
            next_run = now.replace(hour=19, minute=0, second=0, microsecond=0)  # UTC 19:00 = CST 3:00
            if next_run <= now:
                from datetime import timedelta
                next_run += timedelta(days=1)
            delay = (next_run - now).total_seconds()
            logger.info(f"Dify 对账任务: 下次执行 {next_run.isoformat()} (等待 {delay:.0f}s)")
            await asyncio.sleep(delay)

            from app.services.dify_sync_service import get_dify_sync_service
            sync = get_dify_sync_service()
            if sync.enabled:
                result = await sync.full_reconciliation()
                logger.info(f"Dify 每日对账完成: {result}")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Dify 对账任务异常: {e}")
            await asyncio.sleep(3600)


app = FastAPI(
    title=_config.APP_NAME,
    version=_config.APP_VERSION,
    description="书房管理系统 API",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
)

# 静态文件服务（本地封面上传）
_uploads_dir = Path("uploads")
_uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# CORS
if _config.DEBUG:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_config.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["*"],
    )

app.add_middleware(GZipMiddleware, minimum_size=500)


# 不需要审计日志的路径前缀
_SKIP_AUDIT_PREFIXES = ("/health", "/ping", "/api/images/proxy", "/docs", "/redoc", "/openapi.json")


@app.middleware("http")
async def audit_request_middleware(request: Request, call_next):
    """请求审计中间件：记录所有 API 请求的方法、路径、状态码和耗时"""
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start

    response.headers["X-Process-Time"] = f"{elapsed:.4f}s"

    path = request.url.path
    if not any(path.startswith(p) for p in _SKIP_AUDIT_PREFIXES):
        status = response.status_code
        method = request.method
        level = "INFO" if status < 400 else ("WARNING" if status < 500 else "ERROR")
        logger.log(
            level,
            f"[{method}] {path} → {status} ({elapsed:.3f}s)",
        )

    return response


@app.get("/docs", include_in_schema=False)
async def swagger():
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{_config.APP_NAME} - API 文档",
    )


@app.get("/redoc", include_in_schema=False)
async def redoc():
    return get_redoc_html(
        openapi_url=app.openapi_url,
        title=f"{_config.APP_NAME} - API 文档",
    )


# 路由注册
app.include_router(nfc_bridge.router, prefix="/api/nfc", tags=["📱 NFC"])
app.include_router(mapping.router, prefix="/api/mapping", tags=["🔗 映射"])
app.include_router(shelves.router, prefix="/api/shelves", tags=["📚 书架"])
app.include_router(books.router, prefix="/api/books", tags=["📖 图书"])
app.include_router(admin.router, prefix="/api/admin", tags=["⚙️ 管理"])
app.include_router(images.router, prefix="/api/images", tags=["🖼️ 图片"])
app.include_router(config_api.router, prefix="/api/config", tags=["🔧 配置"])
app.include_router(import_api.router, prefix="/api/import", tags=["📥 导入"])
app.include_router(nedb_import.router, prefix="/api/import", tags=["📥 NeDB导入"])
app.include_router(
    physical_shelves.router,
    prefix="/api/physical-shelves",
    tags=["🏗️ 物理书架"],
)
app.include_router(backup.router, prefix="/api/backup", tags=["💾 备份"])
app.include_router(chat.router, prefix="/api/chat", tags=["🤖 AI 助手"])
app.include_router(smart_entry.router, prefix="/api/smart-entry", tags=["✨ 智能录入"])


@app.get("/")
async def root():
    return {
        "name": _config.APP_NAME,
        "version": _config.APP_VERSION,
        "status": "running",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health():
    db = check_database_health()
    return {
        "status": "healthy" if db["status"] == "healthy" else "degraded",
        "version": _config.APP_VERSION,
        "database": db,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
    }


@app.get("/ping")
async def ping():
    return {"ping": "pong", "timestamp": time.time()}