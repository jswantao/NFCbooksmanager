"""图书管理 — 数据库原子操作层 (< 300 行)

所有函数仅执行数据库查询/写入，不包含业务逻辑、不依赖外部服务。
"""

from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, or_
from loguru import logger

from app.models.models import (
    BookMetadata, LogicalShelf, LogicalShelfBook,
    BookStatus, BookSource, SyncLog, SyncStatus,
)
from app.utils.sort_mappings import BOOK_LIST_SORT, SHELF_BOOK_SORT


# ═══════════════════════════════════════════
# 查询构建
# ═══════════════════════════════════════════

def _build_active_shelf_subquery(db: Session):
    """构建活跃书架子查询 — 每本书取第一个 in_shelf 的书架"""
    return (
        db.query(
            LogicalShelfBook.book_id,
            func.min(LogicalShelfBook.logical_shelf_id).label("shelf_id"),
        )
        .filter(LogicalShelfBook.status == BookStatus.IN_SHELF.value)
        .group_by(LogicalShelfBook.book_id)
        .subquery("active_shelf")
    )


def _build_books_base_query(db: Session):
    """构建图书列表基础查询（JOIN 书架信息）"""
    active = _build_active_shelf_subquery(db)
    return (
        db.query(BookMetadata, LogicalShelf.shelf_name, LogicalShelf.logical_shelf_id)
        .select_from(BookMetadata)
        .outerjoin(active, BookMetadata.book_id == active.c.book_id)
        .outerjoin(LogicalShelf, active.c.shelf_id == LogicalShelf.logical_shelf_id)
    )


def query_all_books(
    db: Session,
    sort_by: str = "created_at",
    order: str = "desc",
    limit: int = 100,
    offset: int = 0,
    source: Optional[str] = None,
    search: Optional[str] = None,
    shelf_id: Optional[int] = None,
) -> Dict[str, Any]:
    """查询全部图书（含未上架），分页+筛选+排序"""
    query = _build_books_base_query(db)
    active = _build_active_shelf_subquery(db)

    if source:
        query = query.filter(BookMetadata.source == source)
    if search:
        term = f"%{search}%"
        query = query.filter(or_(
            BookMetadata.title.ilike(term),
            BookMetadata.author.ilike(term),
            BookMetadata.isbn.ilike(term),
            BookMetadata.publisher.ilike(term),
        ))
    if shelf_id is not None:
        query = query.filter(active.c.shelf_id == shelf_id)

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
# 单条 CRUD
# ═══════════════════════════════════════════

def get_book_by_id(db: Session, book_id: int) -> Optional[BookMetadata]:
    return db.query(BookMetadata).filter(BookMetadata.book_id == book_id).first()


def get_book_by_isbn(db: Session, isbn: str) -> Optional[BookMetadata]:
    return db.query(BookMetadata).filter(BookMetadata.isbn == isbn).first()


def create_book(db: Session, **fields) -> BookMetadata:
    book = BookMetadata(**fields)
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


def update_book_fields(db: Session, book: BookMetadata, fields: Dict[str, Any]) -> BookMetadata:
    for key, value in fields.items():
        if value is not None:
            setattr(book, key, value)
    book.updated_at = db.query(func.now()).scalar()  # type: ignore[assignment]
    db.commit()
    db.refresh(book)
    return book


def delete_book(db: Session, book: BookMetadata) -> None:
    db.delete(book)
    db.commit()


def search_books(db: Session, keyword: str, limit: int = 20) -> List[BookMetadata]:
    term = f"%{keyword}%"
    return (
        db.query(BookMetadata)
        .filter(or_(
            BookMetadata.title.ilike(term),
            BookMetadata.author.ilike(term),
            BookMetadata.isbn.ilike(term),
            BookMetadata.publisher.ilike(term),
        ))
        .order_by(BookMetadata.title)
        .limit(limit)
        .all()
    )


# ═══════════════════════════════════════════
# 书架关联
# ═══════════════════════════════════════════

def add_book_to_shelf(
    db: Session, book_id: int, shelf_id: int,
    sort_order: Optional[int] = None, note: Optional[str] = None
) -> LogicalShelfBook:
    existing = (
        db.query(LogicalShelfBook)
        .filter(
            LogicalShelfBook.book_id == book_id,
            LogicalShelfBook.logical_shelf_id == shelf_id,
        )
        .first()
    )
    if existing:
        existing.status = BookStatus.IN_SHELF.value
        db.commit()
        return existing

    if sort_order is None:
        max_order = (
            db.query(func.max(LogicalShelfBook.sort_order))
            .filter(LogicalShelfBook.logical_shelf_id == shelf_id)
            .scalar()
        )
        sort_order = (max_order or 0) + 1

    entry = LogicalShelfBook(
        logical_shelf_id=shelf_id, book_id=book_id,
        sort_order=sort_order, note=note,
        status=BookStatus.IN_SHELF.value,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get_book_shelf_info(db: Session, book_id: int) -> Tuple[Optional[str], Optional[int]]:
    row = (
        db.query(LogicalShelf.shelf_name, LogicalShelf.logical_shelf_id)
        .join(LogicalShelfBook, LogicalShelf.logical_shelf_id == LogicalShelfBook.logical_shelf_id)
        .filter(LogicalShelfBook.book_id == book_id, LogicalShelfBook.status == BookStatus.IN_SHELF.value)
        .first()
    )
    if row:
        return row.shelf_name, row.logical_shelf_id
    return None, None


# ═══════════════════════════════════════════
# 同步日志
# ═══════════════════════════════════════════

def create_sync_log(
    db: Session, book_id: int, synced_fields: List[str] = None,
    status: str = "success", error: Optional[str] = None
) -> SyncLog:
    log_entry = SyncLog(
        book_id=book_id, synced_fields=synced_fields or [],
        status=status, error=error,
    )
    db.add(log_entry)
    db.commit()
    return log_entry


def get_latest_sync_log(db: Session, book_id: int) -> Optional[SyncLog]:
    return (
        db.query(SyncLog)
        .filter(SyncLog.book_id == book_id)
        .order_by(desc(SyncLog.created_at))
        .first()
    )
