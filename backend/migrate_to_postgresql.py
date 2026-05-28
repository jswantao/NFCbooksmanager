#!/usr/bin/env python3
"""
SQLite → PostgreSQL 数据迁移脚本

用法:
    # 预览模式（不实际写入）
    python migrate_to_postgresql.py --dry-run

    # 正式迁移
    python migrate_to_postgresql.py

    # 指定源和目标
    python migrate_to_postgresql.py \\
        --source sqlite+aiosqlite:///./bookshelf.db \\
        --target postgresql+asyncpg://user:pass@localhost:5432/bookshelf

前置条件:
    1. PostgreSQL 已安装并运行
    2. 目标数据库已创建（如: CREATE DATABASE bookshelf;）
    3. pip install asyncpg (已包含在 requirements.txt)
"""
import os
import sys
import json
import argparse
from datetime import datetime
from typing import Any, Dict, List

# 确保 backend 在 Python 路径中
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="SQLite → PostgreSQL 数据迁移",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s --dry-run          # 预览模式
  %(prog)s                     # 正式迁移
  %(prog)s --source sqlite+aiosqlite:///./bookshelf.db --target postgresql+asyncpg://user:pass@localhost:5432/bookshelf
        """,
    )
    p.add_argument("--dry-run", action="store_true", help="预览模式，不实际写入")
    p.add_argument("--source", help="源 SQLite 数据库 URL（默认从 .env 读取）")
    p.add_argument("--target", help="目标 PostgreSQL 数据库 URL")
    return p.parse_args()


def get_source_url(args) -> str:
    if args.source:
        return args.source
    from app.core.config import get_settings
    settings = get_settings()
    if settings.is_sqlite:
        return settings.DATABASE_URL
    return "sqlite+aiosqlite:///./bookshelf.db"


def get_target_url(args) -> str:
    if args.target:
        return args.target
    return os.getenv(
        "PG_TARGET_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/bookshelf",
    )


def create_source_engine(url: str):
    """创建 SQLite 同步引擎"""
    from sqlalchemy import create_engine
    sync_url = url.replace("sqlite+aiosqlite:///", "sqlite:///")
    return create_engine(sync_url)


def create_target_engine(url: str):
    """创建 PostgreSQL 同步引擎"""
    from sqlalchemy import create_engine
    sync_url = url.replace("+asyncpg", "")
    return create_engine(sync_url)


def get_tables():
    """获取需要迁移的表列表（排除系统表）"""
    from app.core.database import Base
    excluded = {"sqlite_sequence", "alembic_version"}
    return [t for t in Base.metadata.sorted_tables if t.name not in excluded]


def export_data(engine, tables) -> Dict[str, List[Dict]]:
    """从 SQLite 导出所有表数据"""
    from sqlalchemy import text as sa_text

    data = {}
    with engine.connect() as conn:
        for table in tables:
            try:
                rows = conn.execute(sa_text(f"SELECT * FROM {table.name}"))
                columns = [c.name for c in table.columns]
                table_data = []
                for row in rows:
                    row_dict = {}
                    for i, col_name in enumerate(columns):
                        val = row[i]
                        # 特殊类型转换
                        if isinstance(val, datetime):
                            val = val.isoformat()
                        elif isinstance(val, bytes):
                            val = val.decode("utf-8", errors="replace")
                        row_dict[col_name] = val
                    table_data.append(row_dict)
                data[table.name] = table_data
                print(f"  ✓ {table.name}: {len(table_data)} 行")
            except Exception as e:
                print(f"  ⚠ {table.name}: 导出失败 ({e})")
    return data


def import_data(engine, data, dry_run: bool) -> Dict[str, int]:
    """导入数据到 PostgreSQL"""
    from sqlalchemy import text as sa_text

    stats: Dict[str, int] = {}
    with engine.connect() as conn:
        # 禁用外键约束以允许任意顺序插入
        conn.execute(sa_text("SET session_replication_role = 'replica'"))
        conn.commit()

        try:
            for table_name, rows in data.items():
                if not rows:
                    stats[table_name] = 0
                    continue

                count = 0
                for row in rows:
                    columns = list(row.keys())
                    placeholders = [f":{c}" for c in columns]
                    sql = (
                        f"INSERT INTO {table_name} "
                        f"({', '.join(columns)}) "
                        f"VALUES ({', '.join(placeholders)}) "
                        f"ON CONFLICT DO NOTHING"
                    )
                    try:
                        if not dry_run:
                            conn.execute(sa_text(sql), row)
                        count += 1
                    except Exception as e:
                        print(f"    ⚠ 跳过行 [{table_name}]: {e}")
                stats[table_name] = count
                print(f"  ✓ {table_name}: {count} 行导入")

            if not dry_run:
                conn.commit()
        finally:
            conn.execute(sa_text("SET session_replication_role = 'origin'"))
            conn.commit()

    return stats


def reset_sequences(engine, tables) -> None:
    """重置 PostgreSQL 自增序列"""
    from sqlalchemy import text as sa_text
    with engine.connect() as conn:
        for table in tables:
            pk_cols = [c.name for c in table.primary_key.columns]
            if len(pk_cols) == 1:
                try:
                    conn.execute(sa_text(
                        "SELECT setval(pg_get_serial_sequence(:tbl, :col), "
                        "COALESCE((SELECT MAX({col}) FROM {tbl}), 1))"
                        .format(col=pk_cols[0], tbl=table.name),
                    ))
                    conn.commit()
                except Exception:
                    pass
        print("  ✓ 序列已重置")


def main():
    args = parse_args()
    source_url = get_source_url(args)
    target_url = get_target_url(args)

    print(f"源数据库: {source_url}")
    print(f"目标数据库: {target_url}")
    print(f"模式: {'预览 (dry-run)' if args.dry_run else '正式迁移'}")
    print()

    # 初始化 Source 引擎并加载模型
    from app.core.database import Base
    source_engine = create_source_engine(source_url)

    print("[1/4] 分析表结构...")
    tables = get_tables()
    print(f"  共 {len(tables)} 张表需要迁移")
    for t in tables:
        print(f"    - {t.name} ({len(t.columns)} 列)")

    print("\n[2/4] 导出 SQLite 数据...")
    data = export_data(source_engine, tables)
    total_rows = sum(len(v) for v in data.values())
    print(f"  总计: {total_rows} 行")

    print("\n[3/4] 导入 PostgreSQL...")
    target_engine = create_target_engine(target_url)

    # 先创建表结构
    if not args.dry_run:
        Base.metadata.create_all(bind=target_engine)
        print("  ✓ 表结构已创建")

    stats = import_data(target_engine, data, args.dry_run)
    total_imported = sum(stats.values())
    print(f"  总计: {total_imported} 行")

    if not args.dry_run:
        print("\n[4/4] 重置序列...")
        reset_sequences(target_engine, tables)

    print(f"\n迁移{'预览' if args.dry_run else ''}完成！")
    if not args.dry_run:
        print("请更新 backend/.env 中的 DATABASE_URL:")
        print(f"  DATABASE_URL={target_url}")

    source_engine.dispose()
    if not args.dry_run:
        target_engine.dispose()


if __name__ == "__main__":
    main()
