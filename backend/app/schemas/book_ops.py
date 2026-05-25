# backend/app/schemas/book_ops.py
"""图书操作相关 Pydantic 模型"""

from typing import Optional
from pydantic import Field
from app.schemas.common import AppSchema


class BookSyncRequest(AppSchema):
    """图书同步请求"""
    isbn: str = Field(..., min_length=10, max_length=13, description="要同步的图书 ISBN", examples=["9787544291163"])


class BookSyncResponse(AppSchema):
    """图书同步响应"""
    success: bool = Field(..., description="同步是否成功")
    book: Optional['BookInShelf'] = Field(None, description="同步后的图书数据")
    message: str = Field(..., description="同步结果描述")


class BookAddToShelfRequest(AppSchema):
    """图书添加到书架请求"""
    book_id: int = Field(..., description="要添加的图书 ID")
    sort_order: int = Field(0, description="在书架中的排序位置")
    note: Optional[str] = Field(None, description="私人备注，如阅读心得")


class BookAddToShelfResponse(AppSchema):
    """图书添加到书架响应"""
    success: bool = Field(..., description="添加是否成功")
    message: str = Field(..., description="操作结果描述")
    shelf_book_id: Optional[int] = Field(None, description="关联记录 ID")


class BookSearchRequest(AppSchema):
    """图书搜索请求"""
    keyword: str = Field(..., min_length=1, max_length=200, description="搜索关键词")
    shelf_id: Optional[int] = Field(None, description="限定在指定书架中搜索")
    page: int = Field(1, ge=1, description="页码")
    page_size: int = Field(20, ge=1, le=100, description="每页条数")
