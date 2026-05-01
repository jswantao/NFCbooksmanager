# backend/app/main.py
# 确保 setup_logging 在 lifespan 中正确调用

import time
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from loguru import logger

from app.api import mapping, shelves, books, admin, images, config_api, import_api, nfc_bridge
from app.api import physical_shelves
from app.core.config import settings, validate_config_on_startup
from app.core.database import (
    init_db, close_all_connections,
    check_database_health, get_database_stats,
    SyncSessionLocal
)


def setup_logging():
    """配置 loguru 日志系统"""
    logger.remove()

    log_config = settings.get_log_config()

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
    log_dir = Path(settings.LOG_FILE).parent
    log_dir.mkdir(parents=True, exist_ok=True)

    # 3. 文件输出
    logger.add(
        settings.LOG_FILE,
        level=log_config["level"],
        format=log_config["format"],
        rotation=log_config["rotation"],
        retention=log_config["retention"],
        compression="gz",
        diagnose=log_config["diagnose"],
        backtrace=log_config["backtrace"],
        enqueue=log_config["enqueue"],
        encoding="utf-8",
    )

    error_log = str(Path(settings.LOG_FILE).with_name('app.error.log'))
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
    )

    logger.info(f"日志系统已初始化 | 文件: {settings.LOG_FILE} | 错误: {error_log}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info(f"{'='*60}")
    logger.info(f"🚀 {settings.APP_NAME} v{settings.APP_VERSION} 启动中...")
    logger.info(f"{'='*60}")

    validate_config_on_startup()

    try:
        init_db()
        logger.info("[Startup] ✅ 数据库表初始化完成")
    except Exception as e:
        logger.error(f"[Startup] ❌ 数据库初始化失败: {e}")

    try:
        db = SyncSessionLocal()
        from app.core.seed import seed_database
        seed_database(db)
        db.close()
        logger.info("[Startup] ✅ 种子数据初始化完成")
    except Exception as e:
        logger.warning(f"[Startup] ⚠️ 种子数据初始化失败: {e}")

    logger.info(f"[Startup] ✅ http://{settings.HOST}:{settings.PORT} | /docs | /health")
    logger.info(f"{'='*60}")
    yield
    logger.info(f"{'='*60}")
    logger.info(f"🛑 {settings.APP_NAME} 正在关闭...")
    logger.info(f"{'='*60}")
    close_all_connections()
    logger.info("[Shutdown] ✅ 已安全关闭")
    logger.info(f"{'='*60}")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="书房管理系统 API",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
)

# CORS
if settings.DEBUG:
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
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["*"],
    )

app.add_middleware(GZipMiddleware, minimum_size=500)


@app.middleware("http")
async def add_process_time(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    response.headers["X-Process-Time"] = f"{time.time() - start:.4f}s"
    return response


@app.get("/docs", include_in_schema=False)
async def swagger():
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{settings.APP_NAME} - API 文档",
    )


@app.get("/redoc", include_in_schema=False)
async def redoc():
    return get_redoc_html(
        openapi_url=app.openapi_url,
        title=f"{settings.APP_NAME} - API 文档",
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
app.include_router(
    physical_shelves.router,
    prefix="/api/physical-shelves",
    tags=["🏗️ 物理书架"],
)


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health():
    db = check_database_health()
    return {
        "status": "healthy" if db["status"] == "healthy" else "degraded",
        "version": settings.APP_VERSION,
        "database": db,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
    }


@app.get("/ping")
async def ping():
    return {"ping": "pong", "timestamp": time.time()}