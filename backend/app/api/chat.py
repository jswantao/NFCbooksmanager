# backend/app/api/chat.py
"""
AI 智能搜索 API

提供：
- 自然语言图书搜索 (POST /search)
- 图书详情 (GET /book/{book_id})
- 相似推荐 (GET /book/{book_id}/similar)
- 知识库导出 (GET /export)
- 全量对账 (POST /reconcile)
- 同步状态 (GET /sync/status)
- 同步日志 (GET /sync/logs)

所有端点无需认证，供 n8n 和内网调用。
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.chat import (
    ChatSearchRequest,
    ChatSearchResponse,
    ChatBookDetailResponse,
    ChatExportResponse,
)
from app.models.models import BookMetadata
from app.services.chat_service import (
    search_local_books,
    get_book_detail,
    get_similar_books,
    export_books_for_knowledge_base,
)

router = APIRouter()


# ==================== 搜索 ====================

@router.post("/search", response_model=ChatSearchResponse, summary="自然语言图书搜索")
def chat_search(request: ChatSearchRequest, db: Session = Depends(get_db)):
    """
    多维度自然语言图书检索。

    支持模糊描述搜索，如"日本文学的书"、"去年买的白色封面小说" 等。
    在 title/author/publisher/series/summary/original_title 六个字段加权匹配。
    """
    result = search_local_books(db, request.query, request.limit)
    return ChatSearchResponse(**result)


# ==================== 图书详情 ====================

@router.get("/book/{book_id}", response_model=ChatBookDetailResponse, summary="获取图书详情")
def chat_get_book(book_id: int, db: Session = Depends(get_db)):
    """获取单本图书的完整信息（含所在书架和物理位置）。"""
    detail = get_book_detail(db, book_id)
    if not detail:
        raise HTTPException(status_code=404, detail="图书不存在")
    return ChatBookDetailResponse(**detail)


# ==================== 相似推荐 ====================

@router.get("/book/{book_id}/similar", summary="相似图书推荐")
def chat_get_similar(book_id: int, limit: int = Query(default=5, ge=1, le=20), db: Session = Depends(get_db)):
    """
    基于图书特征推荐相似馆藏。

    匹配规则：同作者(3分) + 同出版社(2分) + 同系列(1分)。
    按总分降序，最多返回 limit 本。
    """
    detail = get_book_detail(db, book_id)
    if not detail:
        raise HTTPException(status_code=404, detail="图书不存在")

    similar = get_similar_books(db, book_id, limit)
    return {
        "book": detail,
        "similar_books": similar,
        "total_similar": len(similar),
    }



