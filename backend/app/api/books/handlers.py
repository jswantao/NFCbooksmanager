"""图书管理 — 业务逻辑编排层 (< 300 行)

编排数据库操作、外部服务调用、请求/响应映射。
不直接操作 SQL 或注册路由。
"""

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import asyncio

from loguru import logger
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import (
    BookMetadata, LogicalShelfBook, BookStatus as _BS,
    BookSource, SyncStatus,
)
from app.schemas import (
    BookSyncRequest, BookSyncResponse, BookInShelf,
    BookDetailResponse, BookCreateManualRequest, BookUpdateManualRequest,
    ApiResponse,
)
from app.core.dependencies import get_douban_service
from app.services.douban_service import DoubanService
from app.utils.activity_logger import log_activity
from app.utils.helpers import clean_isbn
from app.utils.sort_mappings import SHELF_BOOK_SORT

from app.api.books import crud

# 图书元数据字段列表
BOOK_METADATA_FIELDS = [
    "title", "author", "translator", "publisher", "publish_date",
    "cover_url", "summary", "pages", "price", "binding",
    "original_title", "series", "rating", "douban_url",
]


# ═══════════════════════════════════════════
# 列表查询
# ═══════════════════════════════════════════

def list_books(
    db: Session, search: Optional[str] = None,
    sort_by: str = "created_at", order: str = "desc",
    limit: int = 100, offset: int = 0,
):
    """获取全部图书列表（含筛选）"""
    return crud.query_all_books(
        db, search=search, sort_by=sort_by, order=order,
        limit=limit, offset=offset,
    )


def get_all_books(
    db: Session, sort_by: str = "created_at", order: str = "desc",
    limit: int = 100, offset: int = 0,
    source: Optional[str] = None, search: Optional[str] = None,
    shelf_id: Optional[int] = None,
) -> Dict[str, Any]:
    return crud.query_all_books(
        db, sort_by=sort_by, order=order, limit=limit, offset=offset,
        source=source, search=search, shelf_id=shelf_id,
    )


def search_books_handler(db: Session, keyword: str) -> List[dict]:
    books = crud.search_books(db, keyword)
    return [
        {"book_id": b.book_id, "title": b.title, "author": b.author,
         "isbn": b.isbn or "", "cover_url": b.cover_url, "rating": b.rating}
        for b in books
    ]


# ═══════════════════════════════════════════
# 图书墙
# ═══════════════════════════════════════════

def get_book_wall(
    db: Session, shelf_id: Optional[int] = None,
    sort_by: str = "added_at", order: str = "desc",
    limit: int = 50, offset: int = 0,
) -> Dict[str, Any]:
    from sqlalchemy import func, desc, asc
    from app.models.models import LogicalShelf, LogicalShelfBook, BookMetadata, BookStatus

    if shelf_id is not None:
        sub = (
            db.query(
                LogicalShelfBook.book_id,
                func.min(LogicalShelfBook.sort_order).label("sort_order"),
                LogicalShelfBook.added_at.label("added_at"),
            )
            .filter(
                LogicalShelfBook.logical_shelf_id == shelf_id,
                LogicalShelfBook.status == BookStatus.IN_SHELF.value,
            )
            .group_by(LogicalShelfBook.book_id)
            .subquery("shelf_books")
        )
        query = (
            db.query(BookMetadata, LogicalShelf.shelf_name, LogicalShelf.logical_shelf_id)
            .select_from(BookMetadata)
            .join(sub, BookMetadata.book_id == sub.c.book_id)
            .outerjoin(LogicalShelf, LogicalShelf.logical_shelf_id == shelf_id)
        )
    else:
        active = crud._build_active_shelf_subquery(db)
        query = (
            db.query(BookMetadata, LogicalShelf.shelf_name, LogicalShelf.logical_shelf_id)
            .select_from(BookMetadata)
            .outerjoin(active, BookMetadata.book_id == active.c.book_id)
            .outerjoin(LogicalShelf, active.c.shelf_id == LogicalShelf.logical_shelf_id)
        )

    from app.utils.sort_mappings import BOOK_LIST_SORT
    sort_col = BOOK_LIST_SORT.get(sort_by, BookMetadata.created_at)
    query = query.order_by(desc(sort_col) if order == "desc" else asc(sort_col))

    total = query.count()
    rows = query.offset(offset).limit(limit).all()

    books = []
    for book, shelf_name, shelf_id_val in rows:
        books.append({
            "book_id": book.book_id, "isbn": book.isbn or "",
            "title": book.title or "", "author": book.author,
            "cover_url": book.cover_url, "rating": book.rating,
            "source": book.source or "manual", "publisher": book.publisher,
            "publish_date": book.publish_date, "price": book.price,
            "binding": book.binding, "shelf_name": shelf_name,
            "shelf_id": shelf_id_val,
            "added_at": book.created_at.isoformat() if book.created_at else None,
        })
    return {"total": total, "limit": limit, "offset": offset,
            "has_more": (offset + limit) < total, "books": books}


# ═══════════════════════════════════════════
# 豆瓣同步
# ═══════════════════════════════════════════

def _build_sync_response(book, synced: bool) -> Dict[str, Any]:
    shelf_name, shelf_id = crud.get_book_shelf_info(
        book.shelf_books[0].logical_shelf_id if hasattr(book, 'shelf_books') and book.shelf_books else None
    ) if False else (None, None)  # will be resolved below
    return {
        "book_id": book.book_id, "isbn": book.isbn or "",
        "title": book.title or "", "author": book.author,
        "publisher": book.publisher, "rating": book.rating,
        "cover_url": book.cover_url, "synced": synced,
        "shelf_name": shelf_name, "synced_at": datetime.now(timezone.utc).isoformat(),
    }


async def sync_book_by_isbn(
    db: Session, isbn: str, douban_svc: DoubanService = None,
) -> Dict[str, Any]:
    """根据 ISBN 从豆瓣同步图书数据"""
    cleaned = clean_isbn(isbn)
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"无效的 ISBN: {isbn}")

    if douban_svc is None:
        douban_svc = get_douban_service()

    existing = crud.get_book_by_isbn(db, cleaned)

    try:
        douban_data = await douban_svc.search_by_isbn(cleaned)
    except Exception as e:
        logger.warning(f"豆瓣搜索失败 [{cleaned}]: {e}")
        if existing:
            return _build_sync_response(existing, False)
        raise HTTPException(status_code=502, detail=f"豆瓣搜索失败: {e}")

    if not douban_data or not douban_data.get("title"):
        if existing:
            return _build_sync_response(existing, False)
        raise HTTPException(status_code=404, detail=f"未在豆瓣找到 ISBN: {isbn}")

    if existing:
        if existing.source != BookSource.DOUBAN.value:
            existing.source = BookSource.DOUBAN.value
        fields_updated = []
        for field in BOOK_METADATA_FIELDS:
            if value := douban_data.get(field):
                setattr(existing, field, value)
                fields_updated.append(field)
        existing.last_sync_at = datetime.now(timezone.utc)
        existing.sync_status = SyncStatus.SUCCESS.value
        crud.update_book_fields(db, existing, {f: douban_data.get(f) for f in BOOK_METADATA_FIELDS})
        log_activity(db, action="sync_douban", entity_type="book", entity_id=existing.book_id,
                     detail={"isbn": cleaned, "fields_updated": fields_updated})
        return _build_sync_response(existing, True)

    book = crud.create_book(
        db, isbn=cleaned, title=douban_data.get("title", f"ISBN:{cleaned}"),
        author=douban_data.get("author"), publisher=douban_data.get("publisher"),
        cover_url=douban_data.get("cover_url"), rating=douban_data.get("rating"),
        summary=douban_data.get("summary"), source=BookSource.DOUBAN.value,
        last_sync_at=datetime.now(timezone.utc),
        sync_status=SyncStatus.SUCCESS.value,
    )
    log_activity(db, action="sync_douban", entity_type="book", entity_id=book.book_id,
                 detail={"isbn": cleaned, "title": book.title})
    return _build_sync_response(book, True)


# ═══════════════════════════════════════════
# 手动 CRUD
# ═══════════════════════════════════════════

def create_book_manual(
    db: Session, req: BookCreateManualRequest,
) -> dict:
    isbn = clean_isbn(req.isbn) if req.isbn else None
    if isbn:
        existing = crud.get_book_by_isbn(db, isbn)
        if existing:
            raise HTTPException(status_code=409, detail=f"ISBN {isbn} 已存在 (book_id={existing.book_id})")

    book = crud.create_book(
        db, isbn=isbn or f"MANUAL-{datetime.now(timezone.utc).timestamp():.0f}",
        title=req.title, author=req.author, publisher=req.publisher,
        cover_url=req.cover_url, summary=req.summary,
        pages=req.pages, price=req.price, binding=req.binding,
        source=BookSource.MANUAL.value,
    )

    if req.shelf_id:
        crud.add_book_to_shelf(db, book.book_id, req.shelf_id)

    log_activity(db, action="create_book", entity_type="book", entity_id=book.book_id,
                 detail={"isbn": isbn, "title": book.title})
    return {"book_id": book.book_id, "isbn": book.isbn or "", "title": book.title or ""}


def update_book_manual(db: Session, book_id: int, req: BookUpdateManualRequest) -> dict:
    book = crud.get_book_by_id(db, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="图书不存在")

    update_data = req.model_dump(exclude_unset=True, exclude={"shelf_id"})
    crud.update_book_fields(db, book, update_data)

    if hasattr(req, 'shelf_id') and req.shelf_id:
        crud.add_book_to_shelf(db, book.book_id, req.shelf_id)

    log_activity(db, action="update_book", entity_type="book", entity_id=book.book_id,
                 detail={"fields": list(update_data.keys())})
    return {
        "book_id": book.book_id, "title": book.title or "",
        "updated_fields": list(update_data.keys()),
    }


def get_book_detail(db: Session, book_id: int) -> dict:
    book = crud.get_book_by_id(db, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="图书不存在")

    shelf_name, logical_shelf_id = crud.get_book_shelf_info(db, book_id)
    latest_sync = crud.get_latest_sync_log(db, book_id)

    return {
        "book_id": book.book_id, "isbn": book.isbn or "", "title": book.title or "",
        "author": book.author, "translator": book.translator,
        "publisher": book.publisher, "publish_date": book.publish_date,
        "cover_url": book.cover_url, "local_cover_path": book.local_cover_path,
        "summary": book.summary, "pages": book.pages, "price": book.price,
        "binding": book.binding, "original_title": book.original_title,
        "series": book.series, "rating": book.rating, "douban_url": book.douban_url,
        "douban_id": book.douban_id, "douban_rating": book.douban_rating,
        "personal_rating": book.personal_rating, "purchase_date": book.purchase_date,
        "purchase_price": book.purchase_price, "purchase_channel": book.purchase_channel,
        "reading_status": book.reading_status, "tags": book.tags,
        "author_intro": book.author_intro,
        "source": book.source, "shelf_name": shelf_name,
        "shelf_id": logical_shelf_id,
        "last_sync_at": book.last_sync_at.isoformat() if book.last_sync_at else None,
        "latest_sync": {"status": latest_sync.status, "synced_fields": latest_sync.synced_fields}
            if latest_sync else None,
        "created_at": book.created_at.isoformat() if book.created_at else None,
        "updated_at": book.updated_at.isoformat() if book.updated_at else None,
    }


def delete_book_handler(db: Session, book_id: int) -> dict:
    book = crud.get_book_by_id(db, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="图书不存在")

    title = book.title
    crud.delete_book(db, book)
    log_activity(db, action="delete_book", entity_type="book", entity_id=book_id,
                 detail={"title": title})
    return {"book_id": book_id, "title": title or ""}
