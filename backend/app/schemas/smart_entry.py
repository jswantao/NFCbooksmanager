# backend/app/schemas/smart_entry.py
"""智能录入与信息补全 — Pydantic 模型"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

from app.schemas.common import AppSchema


# ==================== ISBN 提取 ====================

class OCRExtractRequest(AppSchema):
    """OCR ISBN 提取请求 — 多模态模型提取后的文本"""
    text: str = Field(..., min_length=1, description="从图片中识别到的文本（多模态模型输出）")


class OCRExtractResponse(AppSchema):
    success: bool = True
    isbn: Optional[str] = None
    candidates: List[str] = Field(default_factory=list, description="所有匹配到的候选 ISBN")
    message: str = ""


# ==================== ISBN 查询 ====================

class ISBNLookupRequest(AppSchema):
    isbn: str = Field(..., min_length=1, description="要查询的 ISBN (10或13位)")


class ISBNLookupResponse(AppSchema):
    success: bool = True
    data: Optional[Dict[str, Any]] = None
    source: str = ""
    message: str = ""


# ==================== 表单自动填充 ====================

class AutoFillRequest(AppSchema):
    isbn: str = Field(..., min_length=1, description="ISBN")
    title: str = Field(default="", description="可选的书名提示")


class AutoFillFormData(AppSchema):
    isbn: Optional[str] = None
    title: Optional[str] = None
    author: Optional[str] = None
    translator: Optional[str] = None
    publisher: Optional[str] = None
    publish_date: Optional[str] = None
    cover_url: Optional[str] = None
    summary: Optional[str] = None
    pages: Optional[str] = None
    price: Optional[str] = None
    binding: Optional[str] = None
    original_title: Optional[str] = None
    series: Optional[str] = None
    rating: Optional[str] = None
    douban_url: Optional[str] = None
    source: Optional[str] = None


class AutoFillResponse(AppSchema):
    success: bool = True
    form_data: Optional[Dict[str, Any]] = None
    source: str = ""
    message: str = ""


# ==================== 信息补全 ====================

class MissingFieldsResult(AppSchema):
    book_id: int
    isbn: Optional[str] = None
    title: str = ""
    missing_fields: List[str] = Field(default_factory=list)
    filled_fields: List[str] = Field(default_factory=list)
    completeness: float = 0.0
    critical_missing: List[str] = Field(default_factory=list)
    suggestion: str = ""


class EnrichBookResponse(AppSchema):
    success: bool = True
    message: str = ""
    filled_fields: List[str] = Field(default_factory=list)
    skipped_fields: List[str] = Field(default_factory=list)
    completeness: float = 0.0
    lookup_source: str = ""


class BatchEnrichRequest(AppSchema):
    book_ids: List[int] = Field(..., min_length=1, max_length=100)


class BatchEnrichResultItem(AppSchema):
    book_id: int = 0
    title: str = ""
    filled: List[str] = Field(default_factory=list)
    skipped: List[str] = Field(default_factory=list)
    success: bool = False


class BatchEnrichResponse(AppSchema):
    success: bool = True
    total: int = 0
    enriched: int = 0
    failed: int = 0
    results: List[Dict[str, Any]] = Field(default_factory=list)
    message: str = ""


class MissingBooksListItem(AppSchema):
    book_id: int
    isbn: Optional[str] = None
    title: str = ""
    missing_fields: List[str] = Field(default_factory=list)
    completeness: float = 0.0
    suggestion: str = ""


class MissingBooksListResponse(AppSchema):
    books: List[Dict[str, Any]] = Field(default_factory=list)
    total: int = 0
    message: str = ""


# ==================== 图片上传 ====================

class ImageUploadResponse(AppSchema):
    success: bool = True
    isbn: Optional[str] = None
    barcode_detected: bool = False
    message: str = ""
    file_path: str = ""
