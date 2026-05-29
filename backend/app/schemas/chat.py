# backend/app/schemas/chat.py
"""AI 聊天与搜索相关 Pydantic 模型。"""

from typing import Optional, List, Any
from pydantic import BaseModel, Field

from app.schemas.common import AppSchema


# ==================== 搜索 ====================

class ChatSearchRequest(AppSchema):
    query: str = Field(..., min_length=1, description="用户自然语言查询")
    limit: int = Field(default=10, ge=1, le=50, description="返回结果数量上限")


class ChatSearchResult(AppSchema):
    book_id: int
    isbn: Optional[str] = None
    title: str
    author: Optional[str] = None
    publisher: Optional[str] = None
    cover_url: Optional[str] = None
    rating: Optional[str] = None
    summary: Optional[str] = None
    shelf_names: List[str] = Field(default_factory=list)
    relevance_score: float = 0.0


class ChatSearchResponse(AppSchema):
    results: List[ChatSearchResult] = Field(default_factory=list)
    total: int = 0
    query_understanding: str = ""


# ==================== 图书详情 ====================

class ChatBookShelfInfo(AppSchema):
    logical_shelf_id: int
    shelf_name: str
    physical_location: Optional[str] = None


class ChatBookDetailResponse(AppSchema):
    book_id: int
    isbn: Optional[str] = None
    title: str
    author: Optional[str] = None
    translator: Optional[str] = None
    publisher: Optional[str] = None
    publish_date: Optional[str] = None
    pages: Optional[int] = None
    price: Optional[str] = None
    binding: Optional[str] = None
    series: Optional[str] = None
    original_title: Optional[str] = None
    rating: Optional[str] = None
    summary: Optional[str] = None
    cover_url: Optional[str] = None
    source: str = "manual"
    shelves: List[ChatBookShelfInfo] = Field(default_factory=list)


# ==================== 导出 ====================

class ChatExportResponse(AppSchema):
    success: bool = True
    exported_count: int = 0
    file_path: str = ""


# ==================== 同步状态 ====================

class DifySyncStatusResponse(AppSchema):
    today_success: int = 0
    today_failed: int = 0
    pending: int = 0
    last_sync_time: Optional[str] = None
    success_rate: float = 100.0
    healthy: bool = True


class DifySyncLogItem(AppSchema):
    id: int
    book_id: int
    operation: str
    status: str
    dify_document_id: Optional[str] = None
    content_hash: Optional[str] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class DifySyncLogListResponse(AppSchema):
    logs: List[DifySyncLogItem] = Field(default_factory=list)
    total: int = 0


# ==================== 对账 ====================

class ReconciliationResponse(AppSchema):
    success: bool = True
    total_books: int = 0
    synced: int = 0
    repaired: int = 0
    deleted_orphans: int = 0
    errors: int = 0
    message: str = ""
