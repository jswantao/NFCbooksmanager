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

from loguru import logger
from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from sqlalchemy.pool import StaticPool, QueuePool

from .config import settings


# ==================== 数据库类型判断 ====================

is_sqlite: bool = settings.is_sqlite
is_postgresql: bool = settings.is_postgresql


def _sync_url() -> str:
    """
    获取同步数据库引擎 URL

    SQLite：sqlite+aiosqlite:///... → sqlite:///...
    PostgreSQL / 其他：保持不变
    """
    if is_sqlite:
        return settings.DATABASE_URL.replace("sqlite+aiosqlite:///", "sqlite:///")
    return settings.DATABASE_URL


def _async_url() -> str:
    """
    获取异步数据库引擎 URL

    SQLite：确保使用 aiosqlite 驱动
    PostgreSQL：确保使用 asyncpg 驱动
    其他：保持不变
    """
    url = settings.DATABASE_URL
    if is_postgresql:
        if "+asyncpg" not in url:
            return url.replace("postgresql://", "postgresql+asyncpg://")
        return url
    if is_sqlite and "aiosqlite" not in url:
        return url.replace("sqlite:///", "sqlite+aiosqlite:///")
    return url


def _engine_kwargs() -> dict:
    """
    获取数据库引擎配置参数

    SQLite:
    - check_same_thread=False: 允许多线程访问
    - StaticPool: 静态连接池

    PostgreSQL:
    - pool_size + max_overflow: 连接池动态管理
    - QueuePool: 队列连接池
    - pool_pre_ping=True: 连接前检测可用性
    - pool_recycle: 连接回收时间（1 小时）
    - connect_args: server_settings 设置 search_path
    """
    if is_sqlite:
        return {
            "connect_args": {"check_same_thread": False},
            "poolclass": StaticPool,
        }

    if is_postgresql:
        kwargs: dict = {
            "pool_size": settings.DATABASE_POOL_SIZE,
            "max_overflow": settings.DATABASE_POOL_MAX_OVERFLOW,
            "poolclass": QueuePool,
            "pool_pre_ping": True,
            "pool_recycle": 3600,
        }
        # 设置 PostgreSQL search_path
        if settings.PG_SCHEMA and settings.PG_SCHEMA != "public":
            kwargs["connect_args"] = {
                "server_settings": {"search_path": settings.PG_SCHEMA}
            }
        return kwargs

    # 其他数据库
    return {
        "pool_size": settings.DATABASE_POOL_SIZE,
        "poolclass": QueuePool,
        "pool_pre_ping": True,
        "pool_recycle": 3600,
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

if is_sqlite:
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
                logger.warning(f"PRAGMA 执行失败 ({description}): {e}")
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
    2. PostgreSQL：确保 pg_trgm 扩展已启用
    3. 根据 ORM 模型定义创建所有未存在的表
    """
    # SQLite 需要确保目录存在
    if is_sqlite:
        db_dir = os.path.dirname(settings.database_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)

    # PostgreSQL 扩展
    if is_postgresql:
        _setup_postgresql_extensions()

    # 创建所有表
    Base.metadata.create_all(bind=sync_engine)

    table_count = len(Base.metadata.tables)
    db_label = "PostgreSQL" if is_postgresql else "SQLite"
    logger.info(f"数据库初始化完成 ({db_label}, {table_count} 张表)")


def _setup_postgresql_extensions() -> None:
    """
    启用 PostgreSQL 必要扩展并创建 GIN 索引

    - pg_trgm: 三字组模糊匹配，为 ILIKE 查询提供 GIN 索引加速
    - ix_books_fts: 全文搜索 GIN 索引（tsvector）
    - ix_books_title_trgm: 标题三字组 GIN 索引
    """
    try:
        with get_db_context() as db:
            db.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
            db.commit()
        logger.info("PostgreSQL 扩展已就绪 (pg_trgm)")
    except Exception as e:
        logger.warning(f"PostgreSQL pg_trgm 扩展启用失败 (非阻塞): {e}")
        return

    # 全文搜索 GIN 索引（安全创建，已存在则跳过）
    try:
        with get_db_context() as db:
            db.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_books_fts ON book_metadata "
                "USING gin(to_tsvector('simple', "
                "coalesce(title,'') || ' ' || coalesce(author,'') || ' ' || "
                "coalesce(publisher,'') || ' ' || coalesce(series,'') || ' ' || "
                "coalesce(summary,'') || ' ' || coalesce(original_title,'')))"
            ))
            db.commit()
        logger.info("PostgreSQL 全文搜索索引已就绪 (ix_books_fts)")
    except Exception as e:
        logger.warning(f"全文搜索索引创建失败 (非阻塞): {e}")

    # 标题三字组 GIN 索引
    try:
        with get_db_context() as db:
            db.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_books_title_trgm ON book_metadata "
                "USING gin(title gin_trgm_ops)"
            ))
            db.commit()
        logger.info("PostgreSQL 三字组索引已就绪 (ix_books_title_trgm)")
    except Exception as e:
        logger.warning(f"三字组索引创建失败 (非阻塞): {e}")


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
    start_time = time.perf_counter()
    try:
        with get_db_context() as db:
            db.execute(text("SELECT 1"))
        response_time = round((time.perf_counter() - start_time) * 1000, 2)
        return {
            "status": "healthy",
            "response_time_ms": response_time,
        }
    except Exception as e:
        response_time = round((time.perf_counter() - start_time) * 1000, 2)
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
        "type": "SQLite" if is_sqlite else "PostgreSQL",
    }

    # SQLite 文件大小统计
    if is_sqlite and os.path.exists(settings.database_path):
        size_bytes = os.path.getsize(settings.database_path)
        if size_bytes < 1024 * 1024:
            stats["size"] = f"{size_bytes / 1024:.1f} KB"
        else:
            stats["size"] = f"{size_bytes / (1024 * 1024):.1f} MB"

    # 表数量统计
    try:
        with get_db_context() as db:
            if is_postgresql:
                result = db.execute(
                    text(
                        "SELECT COUNT(*) FROM information_schema.tables "
                        "WHERE table_schema = :schema"
                    ),
                    {"schema": settings.PG_SCHEMA},
                )
                stats["tables"] = result.scalar()
                # 数据库总大小
                size_result = db.execute(
                    text("SELECT pg_database_size(current_database())")
                )
                pg_size = size_result.scalar()
                if pg_size:
                    stats["size"] = (
                        f"{pg_size / (1024*1024):.1f} MB"
                        if pg_size > 1024 * 1024
                        else f"{pg_size / 1024:.0f} KB"
                    )
            else:
                # SQLite
                result = db.execute(
                    text(
                        "SELECT COUNT(*) FROM sqlite_master "
                        "WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                    )
                )
                stats["tables"] = result.scalar()
    except Exception as e:
        logger.warning(f"统计信息获取失败: {e}")

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
    # 异步引擎由 main.py lifespan 通过 await async_engine.dispose() 关闭
    logger.info("同步连接已关闭")


# ==================== 异步安全工具 ====================

async def run_sync_db(func, *args, **kwargs):
    """
    在异步路由中安全执行同步数据库操作

    将同步的 SQLAlchemy Session 操作放入线程池执行，
    避免阻塞 FastAPI 的事件循环。

    Args:
        func: 同步函数，接收 SyncSession 并返回结果
        *args, **kwargs: 传递给 func 的参数

    Returns:
        func 的返回值
    """
    import asyncio
    return await asyncio.to_thread(func, *args, **kwargs)


class _SyncDbWrapper:
    """同步数据库操作的线程池包装器 — 供 async_db_session 使用"""

    def __init__(self):
        self.db = SyncSessionLocal()

    def close(self):
        self.db.close()

    def rollback(self):
        self.db.rollback()

    def commit(self):
        self.db.commit()


async def run_sync_db_block(func) -> any:
    """
    在线程池中执行完整的同步数据库操作块

    自动管理 session 生命周期（创建、提交、回滚、关闭）。
    适合封装包含多个查询+提交的完整业务逻辑。

    用法：
        def _do_write(data):
            db = SyncSessionLocal()
            try:
                db.add(record)
                db.commit()
                return record.id
            except:
                db.rollback()
                raise
            finally:
                db.close()

        new_id = await run_sync_db_block(_do_write)

    Args:
        func: 无参数的同步函数，内部管理自己的 session

    Returns:
        func 的返回值
    """
    import asyncio
    return await asyncio.to_thread(func)