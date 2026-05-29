#!/usr/bin/env python3
"""
SQLite → PostgreSQL 数据迁移脚本

用法:
    python migrate_to_postgresql.py --dry-run
    python migrate_to_postgresql.py
    python migrate_to_postgresql.py \\
        --source sqlite+aiosqlite:///./bookshelf.db \\
        --target postgresql+asyncpg://user:pass@localhost:5432/bookshelf

前置条件:
    1. PostgreSQL 已安装并运行 (docker compose up -d)
    2. 目标数据库已创建
    3. pip install asyncpg
"""
import os
import sys
import json
import argparse
from datetime import datetime
from typing import Any, Dict, List

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="SQLite → PostgreSQL 数据迁移")
    p.add_argument("--dry-run", action="store_true", help="预览模式，不实际写入")
    p.add_argument("--source", help="源 SQLite 数据库 URL")
    p.add_argument("--target", help="目标 PostgreSQL 数据库 URL")
    return p.parse_args()


def get_source_url(args) -> str:
    return args.source or "sqlite+aiosqlite:///./bookshelf.db"


def get_target_url(args) -> str:
    return args.target or os.getenv(
        "PG_TARGET_URL", "postgresql+asyncpg://bookshelf:bookshelf@localhost:5432/bookshelf"
    )


def create_source_engine(url: str):
    from sqlalchemy import create_engine
    return create_engine(url.replace("sqlite+aiosqlite:///", "sqlite:///"))


def create_target_engine(url: str):
    from sqlalchemy import create_engine
    return create_engine(url.replace("+asyncpg", ""))


# ==================== 表名获取 ====================


def get_tables(source_engine) -> List[str]:
    """从 SQLite 直接获取用户表名列表"""
    excluded = {"sqlite_sequence", "alembic_version"}
    with source_engine.connect() as conn:
        from sqlalchemy import text
        rows = conn.execute(text(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ))
        return [r[0] for r in rows.fetchall() if r[0] not in excluded]


# ==================== 数据导出 ====================


def export_data(engine, table_names: List[str]) -> Dict[str, List[Dict]]:
    """从 SQLite 按表名导出数据"""
    from sqlalchemy import text as sa_text

    data = {}
    with engine.connect() as conn:
        for table_name in table_names:
            try:
                rows = conn.execute(sa_text(f"SELECT * FROM \"{table_name}\""))
                table_data = []
                for row in rows:
                    mapped = dict(row._mapping)
                    clean = {}
                    for k, v in mapped.items():
                        if isinstance(v, datetime):
                            v = v.isoformat()
                        elif isinstance(v, bytes):
                            v = v.decode("utf-8", errors="replace")
                        clean[k] = v
                    table_data.append(clean)
                data[table_name] = table_data
                print(f"  ✓ {table_name}: {len(table_data)} 行")
            except Exception as e:
                print(f"  ⚠ {table_name}: 导出失败 ({e})")
    return data


# ==================== 数据导入 ====================


def import_data(engine, data: Dict[str, List[Dict]], dry_run: bool) -> Dict:
    """导入数据到 PostgreSQL，自动清洗类型不匹配"""
    from sqlalchemy import text as sa_text

    # PG 列约束
    _STR_LIMITS = {
        "series": 200, "original_title": 300, "rating": 10,
        "publisher": 200, "translator": 300, "binding": 50,
    }
    _BOOL_FIELDS = {"is_active", "is_purchased"}

    def _clean(row: dict) -> dict:
        out = {}
        for k, v in row.items():
            if v is None:
                out[k] = None
                continue
            # 字符串清洗
            if isinstance(v, str):
                v = v.strip()
                if k in _STR_LIMITS and len(v) > _STR_LIMITS[k]:
                    v = v[:_STR_LIMITS[k]]
                if k == "price":
                    v = v.replace("元", "").strip()
            # 整数字段空串 → None
            if k in ("pages", "bookPages", "total", "completed", "success", "failed", "synced", "skipped") and v == "":
                out[k] = None
                continue
            # 布尔字段转换
            if k in _BOOL_FIELDS:
                out[k] = True if v in (1, "1") else False if v in (0, "0") else bool(v)
                continue
            out[k] = v
        return out

    stats = {"ok": 0, "skip": 0, "fail": 0}
    with engine.connect() as conn:
        conn.execute(sa_text("SET session_replication_role = 'replica'"))
        conn.commit()

        try:
            for table_name, rows in data.items():
                if not rows:
                    continue

                ok = 0
                for row in rows:
                    cleaned = _clean(row)
                    cols = list(cleaned.keys())
                    ph = [f":{c}" for c in cols]
                    sql = sa_text(
                        f"INSERT INTO \"{table_name}\" "
                        f"({', '.join(cols)}) "
                        f"VALUES ({', '.join(ph)}) "
                        f"ON CONFLICT DO NOTHING"
                    )
                    try:
                        if not dry_run:
                            conn.execute(sql, cleaned)
                            conn.commit()
                        ok += 1
                    except Exception as e:
                        conn.rollback()
                        isbn_hint = cleaned.get("isbn", cleaned.get("task_id", "")[:20])
                        print(f"    ⚠ [{table_name}] {isbn_hint}: {e}")
                        stats["fail"] += 1
                stats["ok"] += ok
                print(f"  ✓ {table_name}: {ok} 行")
        finally:
            conn.execute(sa_text("SET session_replication_role = 'origin'"))
            conn.commit()

    return stats


# ==================== 序列重置 ====================


def reset_sequences(engine, data: Dict[str, List[Dict]]) -> None:
    """重置 PG 自增序列（仅对成功导入的表）"""
    from sqlalchemy import text as sa_text
    with engine.connect() as conn:
        for table_name, rows in data.items():
            if not rows:
                continue
            try:
                conn.execute(sa_text(
                    f"SELECT setval(pg_get_serial_sequence('{table_name}', "
                    f"'(SELECT column_name FROM information_schema.columns "
                    f"WHERE table_name='{table_name}' AND column_default LIKE 'nextval%')'), "
                    f"COALESCE((SELECT MAX(id) FROM \"{table_name}\"), 1))"
                ))
                conn.commit()
            except Exception:
                pass
        print("  ✓ 序列已重置")


# ==================== 主流程 ====================


def main():
    args = parse_args()
    source_url = get_source_url(args)
    target_url = get_target_url(args)

    print(f"源: {source_url}")
    print(f"目标: {target_url}")
    print(f"模式: {'预览' if args.dry_run else '正式迁移'}\n")

    source_engine = create_source_engine(source_url)

    # [1] 获取表名
    print("[1/4] 分析表结构...")
    table_names = get_tables(source_engine)
    print(f"  共 {len(table_names)} 张表: {table_names}")

    # [2] 导出
    print("\n[2/4] 导出 SQLite 数据...")
    data = export_data(source_engine, table_names)
    total = sum(len(v) for v in data.values())
    print(f"  总计: {total} 行")

    # [3] 导入
    print("\n[3/4] 导入 PostgreSQL...")
    target_engine = create_target_engine(target_url)

    if not args.dry_run:
        from app.core.database import Base
        Base.metadata.create_all(bind=target_engine)
        print("  ✓ 表结构已创建 (create_all)")

    stats = import_data(target_engine, data, args.dry_run)
    print(f"  成功: {stats['ok']}, 跳过: {stats['skip']}, 失败: {stats['fail']}")

    # [4] 序列
    if not args.dry_run:
        print("\n[4/4] 重置序列...")
        reset_sequences(target_engine, data)

    print(f"\n迁移{'预览' if args.dry_run else '完成'}！")
    if not args.dry_run:
        print(f"请确认 .env: DATABASE_URL={target_url}")

    source_engine.dispose()
    if not args.dry_run:
        target_engine.dispose()


if __name__ == "__main__":
    main()
