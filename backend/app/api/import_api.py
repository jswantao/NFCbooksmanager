"""向后兼容 — 导入 API 已重构为三层架构

路由端点已迁移到 import_api/ (router + handlers + crud)。
后台任务 _run_import_task 保留在此文件中供动态导入。
"""

from app.api.import_api.router import router

__all__ = ["router", "_run_import_task"]

# ==================== 后台导入任务（保留） ====================
# _run_import_task 在 router.py 中通过 from app.api.import_api import _run_import_task 动态导入
# 保留在此以避免循环导入

import json
import asyncio
from datetime import datetime, timezone
from typing import Optional, List
from loguru import logger
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.models import (
    BookMetadata, LogicalShelfBook, BookStatus, BookSource,
    ImportTask, ImportStatus,
)
from app.core.dependencies import get_douban_service


async def _run_import_task(
    task_id: str, isbns: List[str], existing_isbns: set,
    shelf_id: Optional[int], auto_sync: bool, sync_delay: float,
    duplicate_resolution: str = "skip",
) -> None:
    """后台异步执行导入任务 — 支持 skip/update/keep 三种重复处理策略"""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(ImportTask).filter(ImportTask.task_id == task_id))
            task = result.scalar_one_or_none()
            if not task:
                logger.error(f"任务不存在: {task_id[:8]}...")
                return

            task.status = ImportStatus.RUNNING.value
            task.started_at = datetime.now(timezone.utc)
            await db.commit()

            results, errors = [], []
            for i, isbn in enumerate(isbns):
                await db.refresh(task)
                if task.status == ImportStatus.CANCELLED.value:
                    break

                is_existing = isbn in existing_isbns

                try:
                    if is_existing:
                        if duplicate_resolution == "skip":
                            task.skipped += 1
                            results.append({"index": i + 1, "isbn": isbn, "status": "skipped", "message": "已存在，跳过"})
                        elif duplicate_resolution == "update":
                            book_query = await db.execute(select(BookMetadata).filter(BookMetadata.isbn == isbn))
                            book = book_query.scalar_one_or_none()
                            if not book:
                                task.skipped += 1
                                results.append({"index": i + 1, "isbn": isbn, "status": "skipped", "message": "已存在但查询失败"})
                                await db.commit()
                                continue
                            synced = False
                            if auto_sync:
                                try:
                                    douban_svc = get_douban_service()
                                    douban_data = await douban_svc.search_by_isbn(isbn)
                                    if douban_data and douban_data.get("title"):
                                        for field in ("title", "author", "cover_url", "publisher", "rating"):
                                            if value := douban_data.get(field):
                                                setattr(book, field, value)
                                        book.source = BookSource.DOUBAN.value
                                        synced = True
                                        task.synced += 1
                                except Exception as e:
                                    logger.warning(f"豆瓣同步失败 [{isbn}]: {e}")
                            await db.commit()
                            task.success += 1
                            results.append({"index": i + 1, "isbn": isbn, "status": "updated", "title": book.title, "synced": synced})
                        else:  # keep
                            book_query = await db.execute(select(BookMetadata).filter(BookMetadata.isbn == isbn))
                            orig_book = book_query.scalar_one_or_none()
                            copy_isbn = f"DUP{isbn[3:13]}"
                            dup_check = await db.execute(select(BookMetadata).filter(BookMetadata.isbn == copy_isbn))
                            if dup_check.scalar_one_or_none():
                                copy_isbn = f"DUP{isbn[3:9]}{isbn[9:12]}{i % 10}"
                            copy_title = f"{orig_book.title}（副本）" if orig_book and orig_book.title else f"ISBN:{isbn}（副本）"
                            copy_book = BookMetadata(
                                isbn=copy_isbn, title=copy_title,
                                author=orig_book.author if orig_book else None,
                                publisher=orig_book.publisher if orig_book else None,
                                cover_url=orig_book.cover_url if orig_book else None,
                                source=BookSource.MANUAL.value,
                            )
                            db.add(copy_book)
                            await db.commit()
                            if shelf_id:
                                shelf_book = LogicalShelfBook(logical_shelf_id=shelf_id, book_id=copy_book.book_id, status=BookStatus.IN_SHELF.value)
                                db.add(shelf_book)
                                await db.commit()
                            task.success += 1
                            results.append({"index": i + 1, "isbn": copy_isbn, "status": "success", "title": copy_book.title, "message": f"副本创建（原 ISBN: {isbn}）"})
                    else:
                        book = BookMetadata(isbn=isbn, title=f"ISBN:{isbn}", source=BookSource.MANUAL.value)
                        db.add(book)
                        await db.commit()
                        await db.refresh(book)
                        synced = False
                        if auto_sync:
                            try:
                                douban_svc = get_douban_service()
                                douban_data = await douban_svc.search_by_isbn(isbn)
                                if douban_data and douban_data.get("title"):
                                    for field in ("title", "author", "cover_url", "publisher", "rating"):
                                        if value := douban_data.get(field):
                                            setattr(book, field, value)
                                    book.source = BookSource.DOUBAN.value
                                    synced = True
                                    task.synced += 1
                                    await db.commit()
                            except Exception as e:
                                logger.warning(f"豆瓣同步失败 [{isbn}]: {e}")
                        if shelf_id:
                            shelf_book = LogicalShelfBook(logical_shelf_id=shelf_id, book_id=book.book_id, status=BookStatus.IN_SHELF.value)
                            db.add(shelf_book)
                            await db.commit()
                        task.success += 1
                        results.append({"index": i + 1, "isbn": isbn, "status": "success", "title": book.title, "synced": synced})
                except Exception as process_error:
                    task.failed += 1
                    error_msg = str(process_error)[:200]
                    results.append({"index": i + 1, "isbn": isbn, "status": "failed", "message": error_msg})
                    errors.append({"index": i + 1, "isbn": isbn, "error": error_msg})
                    await db.rollback()

                task.completed = i + 1
                if (i + 1) % 50 == 0 or (i + 1) == len(isbns):
                    task.results = json.dumps(results, ensure_ascii=False)
                    task.errors = json.dumps(errors, ensure_ascii=False)
                await db.commit()
                if sync_delay > 0:
                    await asyncio.sleep(sync_delay)

            task.status = ImportStatus.COMPLETED.value
            task.finished_at = datetime.now(timezone.utc)
            await db.commit()
            logger.info(f"导入任务完成: {task_id[:8]}... | 成功: {task.success} | 跳过: {task.skipped} | 失败: {task.failed}")

    except Exception as e:
        logger.error(f"导入任务异常: {task_id[:8]}... | {e}")
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(ImportTask).filter(ImportTask.task_id == task_id))
                task = result.scalar_one_or_none()
                if task:
                    task.status = ImportStatus.FAILED.value
                    task.error = str(e)[:500]
                    task.finished_at = datetime.now(timezone.utc)
                    await db.commit()
        except Exception:
            pass
