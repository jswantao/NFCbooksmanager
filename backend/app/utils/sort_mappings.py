# backend/app/utils/sort_mappings.py
"""排序字段映射 — 消除 books.py / shelves.py 中的重复定义"""

from sqlalchemy import func, case
from sqlalchemy.types import Float

from app.models.models import BookMetadata, LogicalShelf, LogicalShelfBook


def _rating_case():
    """评分排序表达式：空值视为 0，其余 CAST 为 Float"""
    return case(
        (BookMetadata.rating == None, 0),
        (BookMetadata.rating == "", 0),
        else_=func.cast(BookMetadata.rating, Float),
    )


# 图书全列表排序
BOOK_LIST_SORT = {
    "created_at": BookMetadata.created_at,
    "added_at": BookMetadata.created_at,     # 别名：映射到 created_at
    "updated_at": BookMetadata.updated_at,
    "title": BookMetadata.title,
    "author": BookMetadata.author,
    "rating": _rating_case(),
}

# 书架内图书排序
SHELF_BOOK_SORT = {
    "sort_order": LogicalShelfBook.sort_order,
    "added_at": LogicalShelfBook.created_at,  # LogicalShelfBook 无 added_at 列，使用 created_at
    "created_at": BookMetadata.created_at,
    "updated_at": BookMetadata.updated_at,
    "title": BookMetadata.title,
    "author": BookMetadata.author,
    "rating": _rating_case(),
}

# 书架列表排序
SHELF_LIST_SORT = {
    "created_at": LogicalShelf.created_at,
    "updated_at": LogicalShelf.updated_at,
    "shelf_name": LogicalShelf.shelf_name,
}
