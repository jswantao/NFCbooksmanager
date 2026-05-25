# backend/app/schemas/common.py
"""通用 Pydantic 模型与基类"""

from typing import Optional, List, Any, TypeVar, Generic
from pydantic import BaseModel, Field, ConfigDict

T = TypeVar('T')

class AppSchema(BaseModel):
    """应用级 Schema 基类，统一 ORM 序列化配置"""
    model_config = ConfigDict(from_attributes=True)


class ApiResponse(AppSchema, Generic[T]):
    """统一 API 响应格式（泛型）

    用法：
        ApiResponse[None]          — 纯状态响应（无数据体）
        ApiResponse[BookSchema]    — 返回单个对象
        ApiResponse[List[dict]]    — 返回列表
    """
    success: bool = Field(True, description="请求是否成功")
    message: str = Field("操作成功", description="响应消息")
    data: Optional[T] = Field(None, description="响应数据")

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {"success": True, "message": "操作成功", "data": {"id": 1, "name": "示例"}}
        }
    )


class PaginatedResponse(AppSchema, Generic[T]):
    """分页响应模型（泛型）

    用法：
        PaginatedResponse[BookInShelf]  — 分页图书列表
        PaginatedResponse[ShelfInfo]    — 分页书架列表
    """
    items: List[T] = Field(default_factory=list, description="当前页数据列表")
    total: int = Field(0, description="数据总条数")
    page: int = Field(1, description="当前页码")
    page_size: int = Field(20, description="每页条数")
    total_pages: int = Field(0, description="总页数")
