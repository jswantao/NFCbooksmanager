"""书架管理 API 路由 — 仅路由注册、参数校验、调用 handlers"""

from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas import (
    ShelfBooksResponse, BookInShelf,
    BookAddToShelfRequest, BookAddToShelfResponse,
    ShelfInfoResponse, ShelfCreateRequest, ShelfUpdateRequest,
    ApiResponse,
)
from app.api.shelves import handlers

router = APIRouter()


# ═══════════════════════════════════════════
# 书架 CRUD
# ═══════════════════════════════════════════

@router.get("/", response_model=List[ShelfInfoResponse], summary="获取书架列表")
async def list_shelves(
    search: Optional[str] = Query(None, description="搜索书架名称或描述"),
    sort_by: str = Query("created_at", description="排序: created_at / updated_at / shelf_name"),
    order: str = Query("desc", description="排序方向: asc / desc"),
    db: Session = Depends(get_db),
) -> List[ShelfInfoResponse]:
    return handlers.list_shelves(db, search=search, sort_by=sort_by, order=order)


@router.post("/", response_model=ApiResponse[dict], summary="创建逻辑书架")
async def create_shelf(
    req: ShelfCreateRequest,
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    result = handlers.create_shelf(db, req.shelf_name, req.description)
    return ApiResponse(code=0, data=result, message="书架创建成功")


@router.get("/{logical_shelf_id}", response_model=ApiResponse[ShelfInfoResponse], summary="获取书架详情")
async def get_shelf_detail(
    logical_shelf_id: int,
    db: Session = Depends(get_db),
) -> ApiResponse[ShelfInfoResponse]:
    result = handlers.get_shelf_detail(db, logical_shelf_id)
    return ApiResponse(code=0, data=result, message="ok")


@router.put("/{logical_shelf_id}", response_model=ApiResponse[dict], summary="更新书架")
async def update_shelf(
    logical_shelf_id: int,
    req: ShelfUpdateRequest,
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    result = handlers.update_shelf(db, logical_shelf_id, req.shelf_name, req.description)
    return ApiResponse(code=0, data=result, message="书架已更新")


@router.delete("/{logical_shelf_id}", response_model=ApiResponse[dict], summary="删除书架")
async def delete_shelf(
    logical_shelf_id: int,
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    result = handlers.delete_shelf(db, logical_shelf_id)
    return ApiResponse(code=0, data=result, message="ok")


# ═══════════════════════════════════════════
# 书架图书操作
# ═══════════════════════════════════════════

@router.get("/{logical_shelf_id}/books", response_model=ApiResponse[ShelfBooksResponse], summary="获取书架图书")
async def list_shelf_books(
    logical_shelf_id: int,
    sort_by: str = Query("sort_order", description="排序: sort_order / title / author / added_at / rating"),
    order: str = Query("asc", description="排序方向: asc / desc"),
    db: Session = Depends(get_db),
) -> ApiResponse[ShelfBooksResponse]:
    result = handlers.get_shelf_books(db, logical_shelf_id, sort_by=sort_by, order=order)
    return ApiResponse(code=0, data=result, message="ok")


@router.post("/{logical_shelf_id}/books", response_model=ApiResponse[BookAddToShelfResponse], summary="添加图书到书架")
async def add_book_to_shelf(
    logical_shelf_id: int,
    req: BookAddToShelfRequest,
    db: Session = Depends(get_db),
) -> ApiResponse[BookAddToShelfResponse]:
    result = handlers.add_book_to_shelf(
        db, logical_shelf_id, req.book_id, req.sort_order, req.note
    )
    return ApiResponse(code=0, data=result, message="图书已添加到书架")


@router.delete("/{logical_shelf_id}/books/{book_id}", response_model=ApiResponse[dict], summary="从书架移除图书")
async def remove_book_from_shelf(
    logical_shelf_id: int,
    book_id: int,
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    result = handlers.remove_book_from_shelf(db, logical_shelf_id, book_id)
    return ApiResponse(code=0, data=result, message="ok")


@router.put("/{logical_shelf_id}/books/{book_id}/move", response_model=ApiResponse[dict], summary="移动图书")
async def move_book(
    logical_shelf_id: int,
    book_id: int,
    target_shelf_id: int = Query(..., description="目标书架ID"),
    position: Optional[str] = Query(None, description="新位置"),
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    result = handlers.move_book(db, logical_shelf_id, book_id, target_shelf_id, position)
    return ApiResponse(code=0, data=result, message="ok")


@router.put("/{logical_shelf_id}/books/{book_id}/sort", response_model=ApiResponse[dict], summary="更新图书排序")
async def update_sort(
    logical_shelf_id: int,
    book_id: int,
    sort_order: int = Query(..., description="排序值"),
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    result = handlers.update_sort_order(db, logical_shelf_id, book_id, sort_order)
    return ApiResponse(code=0, data=result, message="ok")


# ═══════════════════════════════════════════
# 索引操作
# ═══════════════════════════════════════════

@router.get("/{logical_shelf_id}/books/index/{index}", summary="按序号获取图书")
async def get_book_by_index(
    logical_shelf_id: int,
    index: int,
    db: Session = Depends(get_db),
) -> ApiResponse[BookInShelf]:
    result = handlers.get_book_by_index(db, logical_shelf_id, index)
    return ApiResponse(code=0, data=result, message="ok")


@router.put("/{logical_shelf_id}/books/index/{index}", response_model=ApiResponse[dict], summary="按序号更新图书")
async def update_book_by_index(
    logical_shelf_id: int,
    index: int,
    position: Optional[str] = Query(None),
    sort_order: Optional[int] = Query(None),
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    result = handlers.update_book_by_index(db, logical_shelf_id, index, position, sort_order)
    return ApiResponse(code=0, data=result, message="ok")


@router.delete("/{logical_shelf_id}/books/index/{index}", response_model=ApiResponse[dict], summary="按序号移除图书")
async def delete_book_by_index(
    logical_shelf_id: int,
    index: int,
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    result = handlers.delete_book_by_index(db, logical_shelf_id, index)
    return ApiResponse(code=0, data=result, message="ok")
