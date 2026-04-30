# backend/app/main.py
"""
书房管理系统 - FastAPI 应用入口

基于三级模式架构：
- 外模式：NFC 交互层 (nfc_bridge)
- 中间模式：映射转换层 (mapping, shelves)
- 内模式：数据存储层 (books, admin, import_api)

应用生命周期：
1. 启动阶段：验证配置 → 初始化数据库 → 加载种子数据
2. 运行阶段：处理 API 请求，记录响应时间
3. 关闭阶段：安全关闭所有数据库连接

技术栈：
- Web 框架：FastAPI
- 数据库：SQLAlchemy + SQLite (开发) / PostgreSQL (生产)
- 异步支持：uvicorn + asyncio
- 文档：Swagger UI + ReDoc
"""

import time
import traceback
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html

# 导入 API 路由模块（按三级模式分层）
from app.api import (
    nfc_bridge,    # 外模式：NFC 读写与物理书架交互
    mapping,       # 中间模式：物理-逻辑书架映射解析
    shelves,       # 中间模式：逻辑书架与图书列表
    books,         # 内模式：图书元数据 CRUD 与豆瓣同步
    admin,         # 内模式：管理仪表盘与统计
    images,        # 工具：图片处理服务
    config_api,    # 工具：系统配置管理
    import_api,    # 工具：批量导入处理
)

# 导入核心配置和数据库模块
from app.core.config import settings, validate_config_on_startup
from app.core.database import (
    init_db,
    close_all_connections,
    check_database_health,
    get_database_stats,
    SyncSessionLocal
)


# ==================== 应用生命周期管理 ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI 应用生命周期管理器
    
    启动流程（按顺序执行）：
    1. 打印启动横幅，显示应用名称和版本
    2. 验证配置完整性（检查必要配置项是否存在）
    3. 初始化数据库表结构（创建不存在的表）
    4. 加载种子数据（演示/测试用初始数据）
    5. 输出启动成功信息及访问地址
    
    关闭流程：
    1. 打印关闭横幅
    2. 安全关闭所有数据库连接池
    3. 输出关闭完成信息
    
    异常处理：
    - 数据库初始化失败：打印警告但不阻止启动（可能数据库不可用）
    - 种子数据加载失败：打印警告但不阻止启动（非关键数据）
    """
    # ========== 启动阶段 ==========
    print(f"\n{'='*60}")
    print(f"🚀 {settings.APP_NAME} v{settings.APP_VERSION} 启动中...")
    print(f"{'='*60}")
    
    # 1. 验证配置
    validate_config_on_startup()
    
    # 2. 初始化数据库表
    try:
        init_db()
        print("[Startup] ✅ 数据库表初始化完成")
    except Exception as e:
        print(f"[Startup] ⚠️  数据库初始化失败: {e}")
        print("[Startup]    应用将以降级模式运行，数据库功能可能不可用")
    
    # 3. 加载种子数据（仅开发/演示环境）
    try:
        db = SyncSessionLocal()
        from app.core.seed import seed_database
        seed_database(db)
        db.close()
        print("[Startup] ✅ 种子数据初始化完成")
    except Exception as e:
        print(f"[Startup] ⚠️  种子数据初始化失败: {e}")
        print("[Startup]    这不影响正常使用，系统将以空数据状态启动")
    
    # 4. 启动完成
    print(f"[Startup] ✅ 启动成功")
    print(f"[Startup]    API 地址: http://{settings.HOST}:{settings.PORT}")
    print(f"[Startup]    API 文档: http://{settings.HOST}:{settings.PORT}/docs")
    print(f"[Startup]    健康检查: http://{settings.HOST}:{settings.PORT}/health")
    print(f"{'='*60}\n")
    
    # ========== 运行阶段 ==========
    yield  # 应用在此处运行，处理所有请求
    
    # ========== 关闭阶段 ==========
    print(f"\n{'='*60}")
    print(f"🛑 {settings.APP_NAME} 正在关闭...")
    print(f"{'='*60}")
    
    close_all_connections()
    print(f"[Shutdown] ✅ 数据库连接已安全关闭")
    print(f"{'='*60}\n")


# ==================== FastAPI 应用实例 ====================

app = FastAPI(
    # 基本信息
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    
    # API 描述（显示在 Swagger 文档顶部）
    description="""## 📚 书房管理系统 API

基于三级模式架构的智能书房管理系统，通过 NFC 技术连接实体书架与数字信息。

### 🏗️ 架构层次
| 层次 | 模块 | 职责 |
|------|------|------|
| **外模式** | NFC 桥接 | 物理书架与 NFC 标签的读写交互 |
| **中间模式** | 映射 & 书架 | 物理位置到逻辑书架的数据转换 |
| **内模式** | 图书 & 同步 | 元数据存储与豆瓣数据源集成 |

### 🔗 数据流向
NFC 标签读取 → 位置编码解析 → 逻辑书架查询 → 图书元数据展示

### 📖 使用指南
1. 首先配置豆瓣 Cookie (`/api/config/cookie`)
2. 创建物理书架并绑定 NFC 标签 (`/api/nfc/write`)
3. 创建逻辑书架并与物理书架映射 (`/api/mapping`)
4. 通过 ISBN 同步豆瓣数据 (`/api/books/sync`)
5. 扫描 NFC 标签即可自动跳转对应书架
""",
    
    # 生命周期管理
    lifespan=lifespan,
    
    # 禁用默认文档路由（使用自定义文档路由 /docs 和 /redoc）
    docs_url=None,
    redoc_url=None,
    
    # OpenAPI 信息
    openapi_tags=[
        {"name": "📱 NFC", "description": "NFC 标签读写操作 - 物理世界入口"},
        {"name": "🔗 映射", "description": "物理-逻辑书架映射管理 - 中间模式核心"},
        {"name": "📚 书架", "description": "逻辑书架与图书列表 - 前端展示核心"},
        {"name": "📖 图书", "description": "图书元数据 CRUD 与豆瓣同步 - 内模式核心"},
        {"name": "⚙️ 管理", "description": "仪表盘统计与系统监控"},
        {"name": "🖼️ 图片", "description": "图书封面图片处理服务"},
        {"name": "🔧 配置", "description": "系统配置与 Cookie 管理"},
        {"name": "📥 导入", "description": "批量导入 Excel/CSV 图书数据"},
    ],
)


# ==================== 中间件配置 ====================

# --- CORS (跨域资源共享) ---
if settings.DEBUG:
    # 开发环境：允许所有来源，方便前后端联调
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=600,  # 预检请求缓存时间（秒）
    )
else:
    # 生产环境：仅允许配置的白名单来源
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=[
            "GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"
        ],
        allow_headers=["*"],
        max_age=600,
    )

# --- GZip 压缩 ---
# 对大于 1000 字节的响应体进行压缩，减少网络传输量
app.add_middleware(GZipMiddleware, minimum_size=1000)


# --- 请求处理时间记录 ---
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """
    为每个 HTTP 响应添加处理时间头
    
    功能：
    - 记录每个请求的处理耗时
    - 将耗时添加到响应头 X-Process-Time 中
    - 用于性能监控和慢请求排查
    
    注意：
    - 此中间件在所有其他中间件之后执行
    - 时间包含整个请求处理链路（路由 → 业务逻辑 → 数据库 → 序列化）
    """
    start_time = time.time()
    
    # 执行后续中间件和路由处理
    response = await call_next(request)
    
    # 计算处理时间并添加到响应头
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = f"{process_time:.4f}s"
    
    return response


# ==================== 全局异常处理 ====================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    全局未捕获异常处理器
    
    处理所有未被路由级异常处理器捕获的异常，
    确保 API 始终返回 JSON 格式的错误响应，而不崩溃。
    
    行为：
    - 开发模式 (DEBUG=True)：返回详细错误信息和堆栈跟踪
    - 生产模式 (DEBUG=False)：仅返回通用错误消息，避免泄露内部细节
    
    响应格式：
    {
        "success": false,
        "message": "错误描述",
        "path": "/请求路径"
    }
    """
    # 开发环境打印详细错误信息
    if settings.DEBUG:
        print(f"\n{'='*60}")
        print(f"[Global Error] {request.method} {request.url.path}")
        print(f"[Global Error] 异常类型: {type(exc).__name__}")
        print(f"[Global Error] 异常信息: {str(exc)}")
        print(f"{'='*60}")
        traceback.print_exc()
    
    # 返回统一格式的错误响应
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": str(exc) if settings.DEBUG else "服务器内部错误，请稍后重试",
            "path": request.url.path,
        }
    )


# ==================== 自定义文档路由 ====================

@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui():
    """
    Swagger UI 交互式 API 文档
    
    配置优化：
    - defaultModelsExpandDepth: -1 → 默认折叠所有 Schema 模型
    - docExpansion: "list" → 默认展开标签列表
    - filter: True → 启用搜索过滤功能
    """
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{settings.APP_NAME} - API 交互文档",
        swagger_ui_parameters={
            "defaultModelsExpandDepth": -1,
            "docExpansion": "list",
            "filter": True,
        },
    )


@app.get("/redoc", include_in_schema=False)
async def custom_redoc():
    """
    ReDoc 美化版 API 文档
    
    提供更适合阅读和打印的 API 文档格式。
    """
    return get_redoc_html(
        openapi_url=app.openapi_url,
        title=f"{settings.APP_NAME} - API 参考文档",
    )


# ==================== 路由注册 ====================

# 按三级模式架构分层注册路由

# --- 外模式（NFC 交互层）---
app.include_router(
    nfc_bridge.router,
    prefix="/api/nfc",
    tags=["📱 NFC"],
)

# --- 中间模式（映射转换层）---
app.include_router(
    mapping.router,
    prefix="/api/mapping",
    tags=["🔗 映射"],
)
app.include_router(
    shelves.router,
    prefix="/api/shelves",
    tags=["📚 书架"],
)

# --- 内模式（数据存储层）---
app.include_router(
    books.router,
    prefix="/api/books",
    tags=["📖 图书"],
)
app.include_router(
    admin.router,
    prefix="/api/admin",
    tags=["⚙️ 管理"],
)

# --- 工具服务 ---
app.include_router(
    images.router,
    prefix="/api/images",
    tags=["🖼️ 图片"],
)
app.include_router(
    config_api.router,
    prefix="/api/config",
    tags=["🔧 配置"],
)
app.include_router(
    import_api.router,
    prefix="/api/import",
    tags=["📥 导入"],
)


# ==================== 基础端点 ====================

@app.get("/", summary="系统根路径")
async def root() -> Dict[str, Any]:
    """
    系统根路径 - 返回基本信息
    
    用于快速验证系统是否正在运行。
    
    Returns:
        包含应用名称、版本、运行状态和文档链接
    """
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health", summary="健康检查")
async def health_check() -> Dict[str, Any]:
    """
    系统健康检查端点
    
    检查项：
    - 应用运行状态
    - 数据库连接状态和统计信息
    
    Returns:
        健康状态报告：
        - healthy: 所有组件正常
        - degraded: 部分组件异常（如数据库不可用）
    
    用途：
    - 负载均衡器健康探测
    - 监控系统告警
    - 运维手动检查
    """
    # 检查数据库健康状态
    db_health = check_database_health()
    
    # 根据数据库状态判断整体健康状态
    overall_status = "healthy" if db_health["status"] == "healthy" else "degraded"
    
    return {
        "status": overall_status,
        "version": settings.APP_VERSION,
        "database": db_health,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
    }


@app.get("/ping", summary="存活探针")
async def ping() -> Dict[str, Any]:
    """
    简单存活探针
    
    最轻量级的健康检查，仅验证应用进程是否在运行。
    不检查任何外部依赖（如数据库）。
    
    Returns:
        ping-pong 响应和当前时间戳
    
    用途：
    - Kubernetes liveness probe
    - Docker healthcheck
    - 简单连通性测试
    """
    return {
        "ping": "pong",
        "timestamp": time.time(),
    }


# ==================== 调试端点（仅开发环境） ====================

if settings.DEBUG:
    @app.get("/debug/config", include_in_schema=False, summary="查看配置（仅开发）")
    async def debug_config():
        """
        查看当前应用配置（仅开发环境可用）
        
        ⚠️ 生产环境自动禁用此端点
        """
        return {
            "app_name": settings.APP_NAME,
            "app_version": settings.APP_VERSION,
            "debug": settings.DEBUG,
            "host": settings.HOST,
            "port": settings.PORT,
            "database_url": settings.DATABASE_URL.split("@")[-1] if "@" in settings.DATABASE_URL else "***",
            "cors_origins": settings.cors_origins_list,
        }