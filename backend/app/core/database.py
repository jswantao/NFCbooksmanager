# backend/app/core/database.py
"""
数据库引擎与会话管理模块

负责：
- 创建 SQLAlchemy 同步和异步引擎
- 管理数据库连接池
- 提供同步/异步会话工厂
- 数据库初始化、健康检查和统计

支持数据库：
- SQLite（开发/小型部署）：使用 aiosqlite 异步驱动
- PostgreSQL（生产环境）：使用 asyncpg 异步驱动

SQLite 特殊配置：
- 启用外键约束（PRAGMA foreign_keys=ON）
- WAL 日志模式提升并发性能
- 忙等待超时 5 秒处理并发写入冲突
"""

import os
import time
from typing import Generator, Dict, Any
from contextlib import contextmanager

from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from sqlalchemy.pool import StaticPool, QueuePool

from .config import settings


# ==================== 数据库类型判断 ====================

def _is_sqlite() -> bool:
    """
    判断当前使用的数据库是否为 SQLite
    
    通过检查 DATABASE_URL 中是否包含 'sqlite' 关键字判断。
    
    Returns:
        True 表示使用 SQLite，False 表示使用其他数据库（如 PostgreSQL）
    """
    return "sqlite" in settings.DATABASE_URL.lower()


def _sync_url() -> str:
    """
    获取同步数据库引擎 URL
    
    SQLite：sqlite+aiosqlite:///... → sqlite:///...
    其他数据库：保持不变
    """
    return settings.DATABASE_URL.replace("sqlite+aiosqlite:///", "sqlite:///")


def _async_url() -> str:
    """
    获取异步数据库引擎 URL
    
    SQLite：sqlite:///... → sqlite+aiosqlite:///...
    其他数据库：保持不变
    """
    url = settings.DATABASE_URL
    if "aiosqlite" in url or "asyncpg" in url:
        return url
    return url.replace("sqlite:///", "sqlite+aiosqlite:///")


def _engine_kwargs() -> dict:
    """
    获取数据库引擎配置参数
    
    根据数据库类型返回不同的连接池配置：
    
    SQLite:
    - check_same_thread=False: 允许多线程访问（FastAPI 异步需要）
    - StaticPool: 静态连接池（SQLite 不支持连接复用）
    
    PostgreSQL / 其他:
    - pool_size: 连接池大小
    - QueuePool: 队列连接池
    - pool_pre_ping=True: 连接前检测可用性
    - pool_recycle: 连接回收时间（1 小时）
    
    Returns:
        引擎参数字典
    """
    if _is_sqlite():
        return {
            "connect_args": {"check_same_thread": False},
            "poolclass": StaticPool,
        }

    # 非 SQLite 数据库（PostgreSQL 等）
    return {
        "pool_size": settings.DATABASE_POOL_SIZE,
        "poolclass": QueuePool,
        "pool_pre_ping": True,      # 连接前 ping 检测
        "pool_recycle": 3600,        # 连接 1 小时后回收
    }


# ==================== 创建数据库引擎 ====================

# 同步引擎（用于数据库初始化、种子数据等同步操作）
sync_engine = create_engine(
    _sync_url(),
    echo=settings.DATABASE_ECHO,
    **_engine_kwargs(),
)

# 异步引擎（用于 FastAPI 异步请求处理）
async_engine = create_async_engine(
    _async_url(),
    echo=settings.DATABASE_ECHO,
    **_engine_kwargs(),
)

# 同步会话工厂
SyncSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=sync_engine,
)

# 异步会话工厂
AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,  # 提交后不过期对象，避免懒加载异常
)


# ==================== SQLite 特殊配置 ====================

if _is_sqlite():
    @event.listens_for(sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        """
        SQLite 连接事件处理
        
        在每个新连接上执行 PRAGMA 配置：
        - foreign_keys=ON: 启用外键约束（SQLite 默认关闭）
        - journal_mode=WAL: 使用 Write-Ahead Logging 提升并发读写性能
        - synchronous=NORMAL: 平衡写入安全性与性能
        - cache_size=-20000: 设置 20MB 缓存（负值表示 KB 单位）
        - busy_timeout=5000: 遇到锁时等待 5 秒再重试
        
        注意：
        - 这些配置仅对当前连接生效
        - WAL 模式下读取不阻塞写入，写入不阻塞读取
        """
        cursor = dbapi_connection.cursor()
        pragma_statements = [
            ("PRAGMA foreign_keys=ON", "启用外键约束"),
            ("PRAGMA journal_mode=WAL", "启用 WAL 日志模式"),
            ("PRAGMA synchronous=NORMAL", "设置同步模式"),
            ("PRAGMA cache_size=-20000", "设置 20MB 缓存"),
            ("PRAGMA busy_timeout=5000", "设置忙等待超时 5 秒"),
        ]
        for sql, description in pragma_statements:
            try:
                cursor.execute(sql)
            except Exception as e:
                print(f"[Database] ⚠️  PRAGMA 执行失败 ({description}): {e}")
        cursor.close()


# ==================== ORM 基类 ====================

Base = declarative_base()
"""
SQLAlchemy ORM 基类

所有数据模型均继承此类，用于：
- 注册模型到元数据
- 自动创建/更新表结构
- 关联关系管理
"""


# ==================== 会话获取方法 ====================

def get_db() -> Generator[Session, None, None]:
    """
    获取同步数据库会话（生成器模式）
    
    用于 FastAPI 依赖注入，自动管理会话生命周期：
    - 请求开始：创建新会话
    - 请求结束：自动关闭会话
    
    使用方式：
        @app.get("/items")
        def get_items(db: Session = Depends(get_db)):
            return db.query(Item).all()
    
    Yields:
        SQLAlchemy 同步 Session 对象
    """
    db = SyncSessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context():
    """
    获取同步数据库会话（上下文管理器模式）
    
    用于非 FastAPI 依赖注入场景（如脚本、后台任务），
    支持 with 语句自动管理会话生命周期。
    
    使用方式：
        with get_db_context() as db:
            result = db.execute(...)
    
    Yields:
        SQLAlchemy 同步 Session 对象
    """
    db = SyncSessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==================== 数据库管理方法 ====================

def init_db() -> None:
    """
    初始化数据库
    
    执行步骤：
    1. SQLite：确保数据库文件所在目录存在
    2. 根据 ORM 模型定义创建所有未存在的表
    
    注意：
    - 使用 create_all 而非 migration，适合开发和小型部署
    - 生产环境建议使用 Alembic 进行数据库迁移管理
    - 不会删除或修改已存在的表
    """
    # SQLite 需要确保目录存在
    if _is_sqlite():
        db_dir = os.path.dirname(settings.database_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)

    # 创建所有表
    Base.metadata.create_all(bind=sync_engine)

    # 统计创建的表数量
    table_count = len(Base.metadata.tables)
    print(f"[Database] ✅ 表创建完成 ({table_count} 张表)")


def check_database_health() -> Dict[str, Any]:
    """
    数据库健康检查
    
    通过执行简单的 SELECT 1 查询验证数据库连接可用性，
    同时测量响应时间。
    
    Returns:
        健康状态字典：
        {
            "status": "healthy" | "unhealthy",
            "response_time_ms": 响应时间（毫秒）,
            "error": 错误信息（仅不健康时）
        }
    
    用途：
    - /health 端点的数据源
    - 监控告警
    - 运维巡检
    """
    start_time = time.time()
    try:
        with get_db_context() as db:
            db.execute(text("SELECT 1"))
        response_time = round((time.time() - start_time) * 1000, 2)
        return {
            "status": "healthy",
            "response_time_ms": response_time,
        }
    except Exception as e:
        response_time = round((time.time() - start_time) * 1000, 2)
        return {
            "status": "unhealthy",
            "error": str(e),
            "response_time_ms": response_time,
        }


def get_database_stats() -> Dict[str, Any]:
    """
    获取数据库统计信息
    
    SQLite:
    - 数据库文件大小（KB/MB）
    - 表数量
    
    PostgreSQL:
    - 数据库类型标识
    
    Returns:
        统计信息字典
    
    用途：
    - /health 端点的附加信息
    - 仪表盘数据展示
    """
    stats = {
        "type": "SQLite" if _is_sqlite() else "PostgreSQL",
    }

    # SQLite 文件大小统计
    if _is_sqlite() and os.path.exists(settings.database_path):
        size_bytes = os.path.getsize(settings.database_path)
        if size_bytes < 1024 * 1024:
            stats["size"] = f"{size_bytes / 1024:.1f} KB"
        else:
            stats["size"] = f"{size_bytes / (1024 * 1024):.1f} MB"

    # 表数量统计
    try:
        with get_db_context() as db:
            if _is_sqlite():
                result = db.execute(
                    text(
                        "SELECT COUNT(*) FROM sqlite_master "
                        "WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                    )
                )
                stats["tables"] = result.scalar()
            else:
                # PostgreSQL 使用 information_schema
                result = db.execute(
                    text(
                        "SELECT COUNT(*) FROM information_schema.tables "
                        "WHERE table_schema = 'public'"
                    )
                )
                stats["tables"] = result.scalar()
    except Exception as e:
        print(f"[Database] ⚠️  统计信息获取失败: {e}")

    return stats


def close_all_connections() -> None:
    """
    关闭所有数据库连接
    
    在应用关闭时调用，释放连接池中的所有连接。
    确保：
    - 未提交事务被回滚
    - 连接被正确释放回操作系统
    - 无连接泄漏
    
    调用时机：
    - FastAPI lifespan 关闭阶段
    - 优雅关闭流程
    """
    sync_engine.dispose()
    print("[Database] ✅ 所有连接已关闭")