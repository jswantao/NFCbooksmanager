# backend/app/schemas/shelf.py
"""书架相关 Pydantic 模型"""

from typing import Optional, List
from pydantic import Field, ConfigDict
from app.schemas.common import AppSchema


class ShelfCreateRequest(AppSchema):
    """逻辑书架创建请求"""
    shelf_name: str = Field(..., min_length=1, max_length=200, description="逻辑书架名称", examples=["文学小说", "技术书籍"])
    description: Optional[str] = Field(None, max_length=500, description="书架描述")


class ShelfUpdateRequest(AppSchema):
    """逻辑书架更新请求"""
    shelf_name: Optional[str] = Field(None, min_length=1, max_length=200, description="书架名称")
    description: Optional[str] = Field(None, max_length=500, description="书架描述")


class ShelfInfoResponse(AppSchema):
    """逻辑书架基本信息响应"""
    logical_shelf_id: int = Field(..., description="逻辑书架唯一标识")
    shelf_name: str = Field(..., description="书架名称")
    description: Optional[str] = Field(None, description="书架描述")
    book_count: int = Field(0, description="当前在架图书数量")
    physical_location: Optional[str] = Field(None, description="关联的物理位置名称")
    physical_code: Optional[str] = Field(None, description="关联的物理位置编码")
    recent_cover: Optional[str] = Field(None, description="最近添加图书的封面 URL")
    created_at: Optional[str] = Field(None, description="创建时间 (ISO 格式)")
    updated_at: Optional[str] = Field(None, description="最后更新时间 (ISO 格式)")

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={"example": {"logical_shelf_id": 1, "shelf_name": "文学小说", "description": "...", "book_count": 42, "physical_location": "书房-左侧-第3层", "created_at": "2025-01-15T10:30:00"}}
    )


class ShelfBooksResponse(AppSchema):
    """逻辑书架完整响应（含图书列表）"""
    logical_shelf_id: int = Field(..., description="逻辑书架唯一标识")
    shelf_name: str = Field(..., description="书架名称")
    description: Optional[str] = Field(None, description="书架描述")
    physical_info: Optional['MappingResolveResponse'] = Field(None, description="物理位置映射信息")
    books: List['BookInShelf'] = Field(default_factory=list, description="书架中的图书列表")
    total_count: int = Field(0, description="书架中图书总数")

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={"example": {"logical_shelf_id": 1, "shelf_name": "文学小说", "books": [], "total_count": 42}}
    )
