"""书架 CRUD 操作 — 纯数据库原子操作

所有函数接收 db: Session 作为第一参数，不包含业务逻辑判断。
"""

from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc

from app.models.models import (
    LogicalShelf, LogicalShelfBook, BookMetadata,
    PhysicalShelf, PhysicalLogicalMapping,
)
from app.utils.sort_mappings import SHELF_LIST_SORT, SHELF_BOOK_SORT


# ═══════════════════════════════════════════
# 书架 CRUD
# ═══════════════════════════════════════════

def get_active_shelves(
    db: Session,
    search: Optional[str] = None,
    sort_by: str = "created_at",
    order: str = "desc",
) -> List[LogicalShelf]:
    """获取所有激活的逻辑书架（支持搜索和排序）"""
    query = db.query(LogicalShelf).filter(LogicalShelf.is_active == True)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            LogicalShelf.shelf_name.ilike(search_term)
            | LogicalShelf.description.ilike(search_term)
        )

    sort_column = SHELF_LIST_SORT.get(sort_by, LogicalShelf.created_at)
    if order == "asc":
        query = query.order_by(asc(sort_column))
    else:
        query = query.order_by(desc(sort_column))

    return query.all()


def get_shelf_by_id(db: Session, shelf_id: int) -> Optional[LogicalShelf]:
    """按 ID 获取逻辑书架"""
    return db.query(LogicalShelf).filter(
        LogicalShelf.logical_shelf_id == shelf_id,
        LogicalShelf.is_active == True,
    ).first()


def get_shelf_by_name(db: Session, name: str) -> Optional[LogicalShelf]:
    """按名称获取激活状态的逻辑书架"""
    return db.query(LogicalShelf).filter(
        LogicalShelf.shelf_name == name,
        LogicalShelf.is_active == True,
    ).first()


def create_shelf(db: Session, name: str, description: Optional[str] = None) -> LogicalShelf:
    """创建逻辑书架"""
    shelf = LogicalShelf(shelf_name=name, description=description, is_active=True)
    db.add(shelf)
    db.commit()
    db.refresh(shelf)
    return shelf


def update_shelf(db: Session, shelf: LogicalShelf, name: str, description: Optional[str] = None) -> LogicalShelf:
    """更新书架名称和描述"""
    shelf.shelf_name = name
    shelf.description = description
    db.commit()
    db.refresh(shelf)
    return shelf


def soft_delete_shelf(db: Session, shelf: LogicalShelf) -> str:
    """软删除书架"""
    name = shelf.shelf_name
    shelf.is_active = False
    db.commit()
    return name


def get_book_count_per_shelf(db: Session, shelf_ids: List[int]) -> dict:
    """批量获取每个书架的图书数量"""
    if not shelf_ids:
        return {}
    counts = (
        db.query(
            LogicalShelfBook.logical_shelf_id,
            func.count(LogicalShelfBook.id).label("cnt"),
        )
        .filter(
            LogicalShelfBook.logical_shelf_id.in_(shelf_ids),
            LogicalShelfBook.status == "in_shelf",
        )
        .group_by(LogicalShelfBook.logical_shelf_id)
        .all()
    )
    return {row.logical_shelf_id: row.cnt for row in counts}


def get_physical_mappings_for_shelves(db: Session, shelf_ids: List[int]) -> dict:
    """批量获取书架到物理书架的映射"""
    if not shelf_ids:
        return {}
    mappings = (
        db.query(PhysicalLogicalMapping, PhysicalShelf)
        .join(
            PhysicalShelf,
            PhysicalLogicalMapping.physical_shelf_id == PhysicalShelf.physical_shelf_id,
        )
        .filter(
            PhysicalLogicalMapping.logical_shelf_id.in_(shelf_ids),
            PhysicalLogicalMapping.is_active == True,
        )
        .all()
    )
    result = {}
    for mapping, physical in mappings:
        result[mapping.logical_shelf_id] = {
            "physical_shelf_id": physical.physical_shelf_id,
            "location_code": physical.location_code,
            "location_name": physical.location_name,
        }
    return result


# ═══════════════════════════════════════════
# 书架-图书关联 CRUD
# ═══════════════════════════════════════════

def get_shelf_books(
    db: Session,
    shelf_id: int,
    sort_by: str = "sort_order",
    order: str = "asc",
) -> List[Tuple[LogicalShelfBook, BookMetadata]]:
    """获取书架中的图书列表（带排序）"""
    sort_column = SHELF_BOOK_SORT.get(sort_by, LogicalShelfBook.sort_order)
    if order == "desc":
        sort_column = desc(sort_column)
    else:
        sort_column = asc(sort_column)

    return (
        db.query(LogicalShelfBook, BookMetadata)
        .join(BookMetadata, BookMetadata.book_id == LogicalShelfBook.book_id)
        .filter(
            LogicalShelfBook.logical_shelf_id == shelf_id,
            LogicalShelfBook.status == "in_shelf",
        )
        .order_by(sort_column)
        .all()
    )


def get_shelf_book_by_book_id(
    db: Session, shelf_id: int, book_id: int
) -> Optional[LogicalShelfBook]:
    """获取书架中的特定图书关联"""
    return db.query(LogicalShelfBook).filter(
        LogicalShelfBook.logical_shelf_id == shelf_id,
        LogicalShelfBook.book_id == book_id,
        LogicalShelfBook.status == "in_shelf",
    ).first()


def get_shelf_book_by_index(
    db: Session, shelf_id: int, index: int
) -> Optional[Tuple[LogicalShelfBook, BookMetadata]]:
    """按序号获取书架中的图书（1-based index）"""
    items = get_shelf_books(db, shelf_id)
    if 0 <= index - 1 < len(items):
        return items[index - 1]
    return None


def find_existing_shelf_book(
    db: Session, shelf_id: int, book_id: int, include_deleted: bool = False
) -> Optional[LogicalShelfBook]:
    """查找书架中的图书关联（可选包含已删除）"""
    query = db.query(LogicalShelfBook).filter(
        LogicalShelfBook.logical_shelf_id == shelf_id,
        LogicalShelfBook.book_id == book_id,
    )
    if not include_deleted:
        query = query.filter(LogicalShelfBook.status == "in_shelf")
    return query.first()


def add_book_to_shelf(
    db: Session, shelf_id: int, book_id: int, sort_order: int = 0, note: Optional[str] = None
) -> LogicalShelfBook:
    """添加图书到书架"""
    shelf_book = LogicalShelfBook(
        logical_shelf_id=shelf_id,
        book_id=book_id,
        sort_order=sort_order,
        note=note,
        status="in_shelf",
    )
    db.add(shelf_book)
    db.commit()
    db.refresh(shelf_book)
    return shelf_book


def restore_deleted_shelf_book(db: Session, shelf_book: LogicalShelfBook, note: Optional[str] = None) -> LogicalShelfBook:
    """恢复已删除的书架-图书关联"""
    shelf_book.status = "in_shelf"
    if note:
        shelf_book.note = note
    shelf_book.updated_at = func.now()
    db.commit()
    db.refresh(shelf_book)
    return shelf_book


def remove_book_from_shelf(db: Session, shelf_book: LogicalShelfBook) -> None:
    """软删除书架中的图书关联"""
    shelf_book.status = "removed"
    db.commit()


def move_book_to_shelf(
    db: Session, shelf_book: LogicalShelfBook, target_shelf_id: int, position: Optional[str] = None
) -> LogicalShelfBook:
    """将图书移动到目标书架"""
    shelf_book.logical_shelf_id = target_shelf_id
    if position:
        shelf_book.position = position
    db.commit()
    db.refresh(shelf_book)
    return shelf_book


def update_book_sort_order(db: Session, shelf_book: LogicalShelfBook, sort_order: int) -> LogicalShelfBook:
    """更新图书在书架中的排序"""
    shelf_book.sort_order = sort_order
    db.commit()
    db.refresh(shelf_book)
    return shelf_book


def update_book_in_shelf(
    db: Session,
    shelf_book: LogicalShelfBook,
    position: Optional[str] = None,
    sort_order: Optional[int] = None,
) -> LogicalShelfBook:
    """更新书架中图书的位置/排序"""
    if position is not None:
        shelf_book.position = position
    if sort_order is not None:
        shelf_book.sort_order = sort_order
    db.commit()
    db.refresh(shelf_book)
    return shelf_book


def check_shelf_empty(db: Session, shelf_id: int) -> bool:
    """检查书架是否为空（无在架图书）"""
    count = db.query(LogicalShelfBook).filter(
        LogicalShelfBook.logical_shelf_id == shelf_id,
        LogicalShelfBook.status == "in_shelf",
    ).count()
    return count == 0
