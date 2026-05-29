# alembic/env.py
"""
Alembic 迁移环境配置

支持 SQLite (开发) 和 PostgreSQL (生产) 两种数据库。
从 alembic.ini 读取 sqlalchemy.url，也可通过环境变量 DATABASE_URL 覆盖。

用法:
    alembic revision --autogenerate -m "描述"   # 自动生成迁移
    alembic upgrade head                         # 升级到最新
    alembic downgrade -1                         # 回退一个版本
"""

import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# 将 backend 目录加入 Python 路径
_backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, _backend_dir)

# 加载应用模型元数据
from app.core.database import Base
from app.models.models import (  # noqa: F401 — 确保所有模型被导入
    PhysicalShelf,
    LogicalShelf,
    PhysicalLogicalMapping,
    BookMetadata,
    LogicalShelfBook,
    SyncLog,
    ActivityLog,
    ImportTask,
    NfcWriteTask,
)

config = context.config

# 支持环境变量覆盖数据库 URL
_database_url = os.getenv("DATABASE_URL", "")
if _database_url:
    config.set_main_option("sqlalchemy.url", _database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """离线模式：生成 SQL 脚本，不连接数据库"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # SQLite 不支持 ALTER，使用 batch 模式
        render_as_batch="sqlite" in url,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """在线模式：直接连接数据库执行迁移"""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        url = config.get_main_option("sqlalchemy.url")
        is_sqlite = "sqlite" in url if url else False

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # SQLite 使用 batch 模式以支持 ALTER TABLE
            render_as_batch=is_sqlite,
            # PostgreSQL 使用事务模式
            transaction_per_migration=not is_sqlite,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
