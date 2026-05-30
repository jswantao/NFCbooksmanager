"""图书管理 API 路由 — 仅路由注册、参数校验、调用 handlers (< 200 行)"""

from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_douban_service
from app.schemas import (
    BookSyncResponse, BookDetailResponse,
    BookCreateManualRequest, BookUpdateManualRequest,
    ApiResponse,
)
from app.api.books import handlers

router = APIRouter()


# ═══════════════════════════════════════════
# 列表与搜索
# ═══════════════════════════════════════════

@router.get("/", summary="获取全部图书列表")
def list_books(
    search: Optional[str] = Query(None), sort_by: str = Query("created_at"),
    order: str = Query("desc"), limit: int = Query(100, ge=1, le=5000),
    offset: int = Query(0, ge=0), db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return handlers.list_books(db, search=search, sort_by=sort_by, order=order, limit=limit, offset=offset)


@router.get("/all", summary="获取所有图书列表（包括未上架的）")
async def get_all_books(
    sort_by: str = Query("created_at"), order: str = Query("desc"),
    limit: int = Query(100, ge=1, le=5000), offset: int = Query(0, ge=0),
    source: Optional[str] = Query(None), search: Optional[str] = Query(None),
    shelf_id: Optional[int] = Query(None), db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return handlers.get_all_books(db, sort_by=sort_by, order=order, limit=limit,
                                  offset=offset, source=source, search=search, shelf_id=shelf_id)


@router.get("/wall", summary="获取图书墙数据")
async def get_book_wall(
    shelf_id: Optional[int] = Query(None), sort_by: str = Query("added_at"),
    order: str = Query("desc"), limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0), db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return handlers.get_book_wall(db, shelf_id=shelf_id, sort_by=sort_by, order=order,
                                  limit=limit, offset=offset)


@router.get("/search", summary="搜索图书")
async def search_books(
    keyword: str = Query(..., min_length=1, description="搜索关键词"), db: Session = Depends(get_db),
):
    """搜索图书，按书名/作者/ISBN 模糊匹配"""
    return handlers.search_books_handler(db, keyword)


# ═══════════════════════════════════════════
# 豆瓣同步
# ═══════════════════════════════════════════

@router.post("/sync", response_model=BookSyncResponse, summary="根据 ISBN 同步豆瓣数据")
async def sync_book(
    isbn: str = Body(..., embed=True, description="图书 ISBN"),
    db: Session = Depends(get_db),
    douban_svc=Depends(get_douban_service),
) -> BookSyncResponse:
    result = await handlers.sync_book_by_isbn(db, isbn, douban_svc)
    return BookSyncResponse(**result)


# ═══════════════════════════════════════════
# 手动 CRUD
# ═══════════════════════════════════════════

@router.post("/manual", summary="手动录入图书")
async def create_book_manual(
    req: BookCreateManualRequest, db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    result = handlers.create_book_manual(db, req)
    return ApiResponse(code=0, data=result, message="图书录入成功")


@router.put("/{book_id}/manual", summary="手动更新图书信息")
async def update_book_manual(
    book_id: int, req: BookUpdateManualRequest, db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    result = handlers.update_book_manual(db, book_id, req)
    return ApiResponse(code=0, data=result, message="图书已更新")


# ═══════════════════════════════════════════
# 单条操作
# ═══════════════════════════════════════════

@router.get("/{book_id}", response_model=BookDetailResponse, summary="获取图书详情")
async def get_book_detail(book_id: int, db: Session = Depends(get_db)) -> BookDetailResponse:
    result = handlers.get_book_detail(db, book_id)
    return BookDetailResponse(**result)


@router.delete("/{book_id}", summary="删除图书")
async def delete_book(book_id: int, db: Session = Depends(get_db)) -> ApiResponse[dict]:
    result = handlers.delete_book_handler(db, book_id)
    return ApiResponse(code=0, data=result, message="图书已删除")


# ═══════════════════════════════════════════
# 统一操作入口
# ═══════════════════════════════════════════

@router.post("/action", summary="统一图书操作入口")
async def book_action(
    book_id: int = Body(..., embed=True), action: str = Body(..., embed=True),
    shelf_id: Optional[int] = Body(None, embed=True), db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    from app.api.books import crud
    book = crud.get_book_by_id(db, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="图书不存在")

    if action == "add_to_shelf":
        if not shelf_id:
            raise HTTPException(status_code=400, detail="缺少 shelf_id")
        crud.add_book_to_shelf(db, book_id, shelf_id)
        return ApiResponse(code=0, message="已添加到书架")
    elif action == "remove_from_shelf":
        crud.delete_book(db, book)
        return ApiResponse(code=0, message="已从书架移除")
    else:
        raise HTTPException(status_code=400, detail=f"不支持的操作: {action}")
