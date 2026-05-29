#!/usr/bin/env python3
"""
图片路径清洗脚本

将 book_metadata 表中的 cover_url 和 local_cover_path 规范化：
- Windows 绝对路径 → cache/images/ 相对路径（同时复制文件）
- 裸文件名 → 保持原样（前端 getBestCoverUrl 负责补全 /uploads/ 前缀）
- HTTP URL → 保持原样
- /uploads/ 或 /api/ 路径 → 保持原样

用法:
    python clean_image_paths.py --dry-run     # 预览模式
    python clean_image_paths.py               # 执行清洗
"""

import os
import sys
import shutil
import argparse
import sqlite3
import re
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

DB_PATH = os.path.join(os.path.dirname(__file__), "bookshelf.db")
CACHE_DIR = Path(os.path.dirname(__file__)) / "cache" / "images"
UPLOADS_DIR = Path(os.path.dirname(__file__)) / "uploads"
APP_CACHE = Path(os.path.dirname(__file__)) / "app" / "cache" / "images"


def normalize_path(url: str) -> tuple[str, str | None]:
    """
    规范化单条图片路径。

    Returns:
        (规范化后的路径, 源文件路径或 None)
    """
    if not url:
        return url, None

    # HTTP URL / 已规范的相对路径 → 不变
    if url.startswith("http://") or url.startswith("https://"):
        return url, None
    if url.startswith("/uploads/") or url.startswith("/api/"):
        return url, None
    if url.startswith("cache/") or url.startswith("uploads/"):
        return url, None

    # Windows 绝对路径
    if re.match(r"^[A-Za-z]:[/\\]", url):
        basename = os.path.basename(url)
        if not basename or not re.search(r"\.(jpg|png|jpeg|webp)$", basename, re.IGNORECASE):
            return "", None

        # 在已知位置查找源文件
        candidates = [
            Path(url),                     # 原始绝对路径
            APP_CACHE / basename,          # app/cache/images/
            CACHE_DIR / basename,          # cache/images/
            UPLOADS_DIR / basename,        # uploads/
            UPLOADS_DIR / "nedb" / basename,  # uploads/nedb/
            UPLOADS_DIR / "covers" / basename,  # uploads/covers/
        ]
        for src in candidates:
            if src.exists() and src.is_file():
                return f"cache/images/{basename}", str(src)

        # 源文件未找到，仍清理路径（文件可能已丢失）
        return f"cache/images/{basename}", None

    # 裸文件名（如 book_xxx.jpg, abc123.jpg）
    if not url.startswith("/") and not url.startswith("cache/") and not url.startswith("uploads/"):
        # 尝试在 uploads/ 下查找
        candidates = [
            UPLOADS_DIR / url,
            UPLOADS_DIR / "nedb" / url,
            UPLOADS_DIR / "covers" / url,
            CACHE_DIR / url,
            APP_CACHE / url,
        ]
        for src in candidates:
            if src.exists() and src.is_file():
                # 复制到 cache/images/ 统一管理
                return f"cache/images/{os.path.basename(url)}", str(src)

        # 源文件未找到，保持原样（前端会尝试 /uploads/ 前缀）
        return url, None

    return url, None


def clean_database(dry_run: bool = True) -> None:
    """清洗 book_metadata 表中的图片路径"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # 查找需要清洗的记录
    cur.execute("""
        SELECT book_id, isbn, title, cover_url, local_cover_path
        FROM book_metadata
        WHERE cover_url IS NOT NULL AND cover_url != ''
    """)
    rows = cur.fetchall()

    updates = []
    copies = []
    unchanged = 0

    for row in rows:
        old_url = row["cover_url"]
        new_url, src_file = normalize_path(old_url)

        if new_url == old_url:
            unchanged += 1
            continue

        updates.append((new_url, src_file, row["book_id"], row["isbn"], row["title"] or "?", old_url))
        if src_file:
            copies.append((src_file, new_url))

    # 显示统计
    print(f"总记录: {len(rows)}")
    print(f"无需变更: {unchanged}")
    print(f"需要更新: {len(updates)}")
    print(f"  其中可复制文件: {len(copies)}")
    print(f"  文件丢失(仅清理路径): {len(updates) - len(copies)}")
    print()

    if not updates:
        print("无需清洗。")
        conn.close()
        return

    # 显示样本
    print("变更样本 (前 10 条):")
    for new_url, src_file, book_id, isbn, title, old_url in updates[:10]:
        status = "可复制" if src_file else "文件丢失"
        print(f"  [{status}] ISBN={isbn} | {title[:20]}")
        print(f"    旧: {old_url[:80]}")
        print(f"    新: {new_url}")
    print()

    if dry_run:
        print("[预览模式] 未实际修改数据库。使用 --execute 执行。")
        conn.close()
        return

    # 执行更新
    print("开始执行...")

    # 复制文件
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    copied = 0
    for src_file, new_url in copies:
        dst = CACHE_DIR / os.path.basename(new_url)
        if not dst.exists():
            try:
                shutil.copy2(src_file, dst)
                copied += 1
            except Exception as e:
                print(f"  复制失败: {src_file} → {dst}: {e}")

    print(f"已复制 {copied} 个文件到 {CACHE_DIR}")

    # 更新数据库
    for new_url, src_file, book_id, isbn, title, old_url in updates:
        cur.execute(
            "UPDATE book_metadata SET cover_url = ? WHERE book_id = ?",
            (new_url, book_id),
        )

    conn.commit()
    print(f"已更新 {len(updates)} 条数据库记录")

    # 验证
    cur.execute("SELECT COUNT(*) FROM book_metadata WHERE cover_url GLOB '[A-Za-z]:*'")
    remaining = cur.fetchone()[0]
    print(f"剩余 Windows 绝对路径: {remaining} 条")

    conn.close()
    print("\n清洗完成！")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="清洗 book_metadata 图片路径")
    p.add_argument("--dry-run", action="store_true", default=True,
                   help="预览模式（默认），不实际修改")
    p.add_argument("--execute", action="store_false", dest="dry_run",
                   help="执行清洗")
    args = p.parse_args()

    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    clean_database(dry_run=args.dry_run)
