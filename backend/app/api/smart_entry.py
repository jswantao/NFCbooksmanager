# backend/app/api/smart_entry.py
"""
智能录入与信息补全 API

提供：
- POST /ocr            : 从文本/图片中提取 ISBN
- POST /isbn-lookup    : 多源 ISBN 查询
- POST /auto-fill      : 根据 ISBN 自动填充表单
- POST /detect-missing : 检测图书缺失字段
- POST /enrich/{id}    : 自动补全单本图书
- POST /batch-enrich   : 批量自动补全
- GET  /missing-books  : 列出信息不完整的图书
- POST /upload-image   : 上传图书封面图片进行 ISBN 识别
"""

import uuid
import asyncio
from pathlib import Path

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session

from app.core.database import get_db, SyncSessionLocal
from app.schemas.smart_entry import (
    OCRExtractRequest,
    OCRExtractResponse,
    ISBNLookupRequest,
    ISBNLookupResponse,
    AutoFillRequest,
    AutoFillResponse,
    EnrichBookResponse,
    BatchEnrichRequest,
    BatchEnrichResponse,
    MissingFieldsResult,
    MissingBooksListResponse,
    ImageUploadResponse,
)
from app.services.smart_entry_service import (
    extract_isbn_from_image_text,
    extract_isbn_from_barcode,
    isbn_lookup,
    auto_fill_form,
    detect_missing_fields,
    enrich_book,
    batch_enrich_books,
    find_books_with_missing_fields,
)

router = APIRouter()

# 上传图片大小限制: 5MB
MAX_UPLOAD_SIZE = 5 * 1024 * 1024
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


# ==================== 图书搜索 ====================

class SmartEntrySearchBody(BaseModel):
    query: str
    limit: int = 10


@router.post("/search", summary="在智能录入上下文中搜索图书")
def smart_entry_search(
    body: SmartEntrySearchBody,
    db: Session = Depends(get_db),
):
    """
    搜索馆藏图书，用于智能录入流程中的图书查重和查找。

    接受 JSON body: {"query": "三体", "limit": 5}
    返回匹配的图书列表（书名、作者、ISBN、评分等）。
    """
    from app.services.chat_service import search_local_books
    result = search_local_books(db, body.query, body.limit)
    return result


# ==================== OCR ISBN 提取 ====================

@router.post("/ocr", response_model=OCRExtractResponse, summary="从文本中提取 ISBN")
def extract_isbn_from_text(req: OCRExtractRequest):
    """
    从多模态模型返回的 OCR 文本中提取 ISBN。

    支持格式：
    - ISBN-13: 978-7-5490-2168-0, 9787549021680
    - ISBN-10: 7549021687
    - 带前缀: ISBN: 9787549021680
    """
    isbn = extract_isbn_from_image_text(req.text)
    if isbn:
        return OCRExtractResponse(success=True, isbn=isbn, message=f"成功提取 ISBN: {isbn}")

    # 尝试查找所有可能的候选
    import re
    candidates = re.findall(r'\b(?:\d{9}[\dXx]|\d{13})\b', req.text)
    candidates = [c for c in candidates if len(c) >= 10]

    return OCRExtractResponse(
        success=False,
        isbn=None,
        candidates=candidates[:5],
        message="未能从文本中提取到有效的 ISBN，请确认图片清晰度或手动输入",
    )


# ==================== 多源 ISBN 查询 ====================

@router.post("/isbn-lookup", response_model=ISBNLookupResponse, summary="多源 ISBN 查询")
async def lookup_isbn(req: ISBNLookupRequest):
    """
    多源查询图书信息：豆瓣 → Google Books → OpenLibrary 降级。

    返回第一个匹配数据源的完整图书元数据。
    """
    result = await isbn_lookup(req.isbn)
    return ISBNLookupResponse(**result)


# ==================== 自动填充表单 ====================

@router.post("/auto-fill", response_model=AutoFillResponse, summary="根据 ISBN 自动填充录入表单")
async def auto_fill(req: AutoFillRequest):
    """
    根据 ISBN 自动填充图书录入表单。

    调用外部数据源查询图书元数据，返回可预填充的表单数据。
    用户确认后通过 /api/books/manual 保存。
    """
    result = await auto_fill_form(req.isbn, req.title)
    return AutoFillResponse(**result)


# ==================== 缺失字段检测 ====================

@router.post("/detect-missing/{book_id}", response_model=MissingFieldsResult, summary="检测图书缺失字段")
def detect_missing(book_id: int, db: Session = Depends(get_db)):
    """分析单本图书的信息完整度，返回缺失字段列表和补全建议。"""
    result = detect_missing_fields(db, book_id)
    return MissingFieldsResult(**result)


# ==================== 自动补全单本 ====================

@router.post("/enrich/{book_id}", response_model=EnrichBookResponse, summary="自动补全图书信息")
async def enrich_single_book(book_id: int):
    """
    自动补全单本图书的缺失信息。

    通过 ISBN 查询外部数据源，填充缺失字段。
    成功后记录变更。
    """
    db = SyncSessionLocal()
    try:
        result = await enrich_book(db, book_id)

        return EnrichBookResponse(**result)
    finally:
        db.close()


# ==================== 批量自动补全 ====================

@router.post("/batch-enrich", response_model=BatchEnrichResponse, summary="批量自动补全")
async def batch_enrich(req: BatchEnrichRequest):
    """批量自动补全多本图书的缺失信息。"""
    db = SyncSessionLocal()
    try:
        result = await batch_enrich_books(db, req.book_ids)
        return BatchEnrichResponse(**result)
    finally:
        db.close()


# ==================== 查询信息不完整的图书 ====================

@router.get("/missing-books", response_model=MissingBooksListResponse, summary="列出信息不完整的图书")
def list_missing_books(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """查找信息不完整的馆藏图书（按完整度升序排列）。"""
    books = find_books_with_missing_fields(db, limit)
    return MissingBooksListResponse(
        books=books,
        total=len(books),
        message=f"找到 {len(books)} 本信息不完整的图书" if books else "所有图书信息已完整",
    )


# ==================== 图片上传 + ISBN 识别 ====================

@router.post("/upload-image", response_model=ImageUploadResponse, summary="上传封面图片进行 ISBN 识别")
async def upload_for_isbn(file: UploadFile = File(...)):
    """
    上传图书封面或 ISBN 条形码图片，自动提取 ISBN。

    支持两种识别方式：
    1. 条形码扫描（pyzbar，需安装相关依赖）
    2. 后端提取失败时返回图片路径，供多模态模型处理

    Args:
        file: 图片文件 (jpg/png/webp/bmp, 最大 5MB)

    Returns:
        提取到的 ISBN 或错误信息
    """
    # 校验文件扩展名
    ext = Path(file.filename).suffix.lower() if file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的图片格式: {ext}，支持 {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # 读取文件内容
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail=f"图片不能超过 5MB，当前 {len(contents) / 1024 / 1024:.1f}MB")

    # 尝试条形码识别
    isbn = extract_isbn_from_barcode(contents)
    if isbn:
        # 保存图片用于后续参考
        _save_uploaded_image(contents, ext, isbn)
        return ImageUploadResponse(
            success=True,
            isbn=isbn,
            barcode_detected=True,
            message=f"条形码识别成功: {isbn}",
            file_path="",
        )

    # 保存图片供后续手动处理
    file_path = _save_uploaded_image(contents, ext)
    return ImageUploadResponse(
        success=False,
        isbn=None,
        barcode_detected=False,
        message="未能从图片中识别到 ISBN 条形码。请使用多模态模型识别封面文字，或手动输入 ISBN。",
        file_path=file_path,
    )


def _save_uploaded_image(contents: bytes, ext: str, prefix: str = "") -> str:
    """保存上传的图片到 uploads/smart-entry/ 目录"""
    upload_dir = Path("uploads/smart-entry")
    upload_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{prefix}_{uuid.uuid4().hex[:10]}{ext}" if prefix else f"{uuid.uuid4().hex[:16]}{ext}"
    filepath = upload_dir / filename
    with open(filepath, "wb") as f:
        f.write(contents)

    return str(filepath)
