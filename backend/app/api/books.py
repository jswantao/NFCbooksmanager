# backend/app/api/books.py
"""
图书管理 API - 内模式核心接口

提供图书元数据的完整 CRUD 操作和豆瓣数据同步功能。

核心端点：
- POST   /sync          : 根据 ISBN 从豆瓣同步图书数据
- GET    /wall          : 图书墙展示（分页、排序、筛选）
- POST   /manual        : 手动录入图书
- PUT    /{id}/manual   : 手动更新图书信息
- GET    /search        : 图书搜索（按书名/作者/ISBN）
- GET    /{id}          : 图书详情
- DELETE /{id}          : 删除图书

数据流向：
1. 豆瓣同步：ISBN → DoubanService.search_by_isbn() → 解析 → 写入 BookMetadata
2. 手动录入：表单数据 → 校验 ISBN 唯一性 → 写入 BookMetadata → 可选添加到书架
3. 图书墙：LogicalShelfBook + BookMetadata 联合查询 → 分页排序返回

注意事项：
- ISBN 为全局唯一约束，同步和手动录入均需校验
- 同步使用豆瓣多策略搜索（直链 → API → 搜索 → OpenLibrary）
- 删除图书会级联删除书架关联和同步日志
"""

from typing import Optional, Dict, Any, List, Union
from datetime import datetime, timezone

import asyncio

from pydantic import BaseModel as _SchemaModel
from loguru import logger

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, or_

from app.core.database import get_db
from app.models.models import (
    BookMetadata,
    LogicalShelf,
    LogicalShelfBook,
    BookStatus,
    BookSource,
    SyncLog,
    SyncStatus,
)
from app.schemas import (
    BookSyncRequest,
    BookSyncResponse,
    BookInShelf,
    BookDetailResponse,
    BookCreateManualRequest,
    BookUpdateManualRequest,
    ApiResponse,
)
from app.core.dependencies import get_douban_service
from app.services.douban_service import DoubanService
from app.utils.activity_logger import log_activity
from app.utils.helpers import clean_isbn
from app.utils.sort_mappings import BOOK_LIST_SORT, SHELF_BOOK_SORT

router = APIRouter()

# 图书元数据字段列表（用于批量属性赋值）
BOOK_METADATA_FIELDS = [
    "title", "author", "translator", "publisher", "publish_date",
    "cover_url", "summary", "pages", "price", "binding",
    "original_title", "series", "rating", "douban_url",
]


# ==================== 图书列表 ====================

@router.get("/", summary="获取全部图书列表")
def list_books(
    limit: int = Query(default=100, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    sort_by: str = Query(default="created_at", pattern=r"^(created_at|title|author|rating)$"),
    sort_order: str = Query(default="desc", pattern=r"^(asc|desc)$"),
    db: Session = Depends(get_db),
):
    """
    分页获取全部图书列表。

    支持按创建时间、书名、作者、评分排序。
    默认按创建时间倒序（最新在前），limit=100。
    """
    sort_col = getattr(BookMetadata, sort_by, BookMetadata.created_at)
    if sort_order == "asc":
        sort_col = sort_col.asc()
    else:
        sort_col = sort_col.desc()

    total = db.query(func.count(BookMetadata.book_id)).scalar() or 0
    books = (
        db.query(BookMetadata)
        .order_by(sort_col)
        .offset(offset)
        .limit(limit)
        .all()
    )

    books_data = [
        {
            "book_id": b.book_id,
            "isbn": b.isbn,
            "title": b.title,
            "author": b.author,
            "translator": b.translator,
            "publisher": b.publisher,
            "publish_date": b.publish_date,
            "cover_url": b.cover_url,
            "local_cover_path": b.local_cover_path,
            "summary": b.summary,
            "source": b.source,
            "sort_order": 0,
            "pages": b.pages,
            "price": b.price,
            "binding": b.binding,
            "original_title": b.original_title,
            "series": b.series,
            "rating": b.rating,
            "douban_url": b.douban_url,
            "created_at": b.created_at.isoformat() if b.created_at else None,
            "updated_at": b.updated_at.isoformat() if b.updated_at else None,
        }
        for b in books
    ]

    return {
        "books": books_data,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": (offset + limit) < total,
    }


# ==================== 豆瓣同步 ====================

@router.post("/sync", response_model=BookSyncResponse, summary="根据 ISBN 同步豆瓣数据")
async def sync_book(
    req: BookSyncRequest,
    db: Session = Depends(get_db),
    douban_svc: DoubanService = Depends(get_douban_service),
) -> BookSyncResponse:
    """
    根据 ISBN 从豆瓣获取图书元数据并同步到本地数据库
    
    处理流程：
    1. 清洗 ISBN（移除连字符和空格）
    2. 检查本地是否已存在（已存在则更新，不存在则创建）
    3. 调用豆瓣服务多策略搜索
    4. 成功：更新所有元数据字段，标记 source=douban，更新 last_sync_at
    5. 失败但有本地数据：返回本地数据 + 提示信息
    6. 完全失败：返回 404 错误
    
    异常场景：
    - ISBN 在豆瓣不存在 → 404 错误
    - 豆瓣访问被拦截 → 根据策略自动降级
    - 网络超时 → 返回错误信息
    
    Args:
        req: 包含待同步 ISBN 的请求体
    
    Returns:
        同步结果和图书数据
    """
    # 清洗 ISBN
    isbn = clean_isbn(req.isbn)
    
    # 检查本地是否已存在
    existing_book = (
        db.query(BookMetadata)
        .filter(BookMetadata.isbn == isbn)
        .first()
    )
    
    # 调用豆瓣服务搜索
    douban_data = await douban_svc.search_by_isbn(isbn)
    
    if douban_data:
        # 获取或创建图书记录
        book = existing_book or BookMetadata(
            isbn=isbn,
            title="",
            source=BookSource.DOUBAN.value,
        )
        
        if not existing_book:
            db.add(book)
        
        # 批量更新元数据字段
        for field in BOOK_METADATA_FIELDS:
            if value := douban_data.get(field):
                setattr(book, field, value)
        
        # 更新同步状态
        book.source = BookSource.DOUBAN.value
        book.last_sync_at = datetime.now(timezone.utc)
        book.sync_status = SyncStatus.SUCCESS.value
        
        db.commit()
        db.refresh(book)
        
        message = "豆瓣数据已更新" if existing_book else "已创建并同步豆瓣数据"
        return _build_sync_response(book, message)
    
    # 豆瓣未找到，但本地已有数据
    if existing_book:
        return _build_sync_response(existing_book, "豆瓣未找到，使用本地现有数据")
    
    # 完全无法获取
    raise HTTPException(
        status_code=404,
        detail=f"未找到 ISBN {isbn} 的图书信息，请检查 ISBN 是否正确或尝试手动录入",
    )


# ==================== 获取所有图书（包括未上架）====================

@router.get("/all", summary="获取所有图书列表（包括未上架的）")
async def get_all_books(
    sort_by: str = Query(
        "created_at",
        description="排序字段: created_at / title / author / rating"
    ),
    order: str = Query("desc", description="排序方向: asc / desc"),
    limit: int = Query(100, ge=1, le=5000, description="每页数量（默认 500）"),
    offset: int = Query(0, ge=0, description="偏移量（分页起始位置）"),
    source: Optional[str] = Query(None, description="按来源筛选: douban / manual / isbn / nfc"),
    search: Optional[str] = Query(None, description="搜索书名/作者/ISBN/出版社"),
    shelf_id: Optional[int] = Query(None, description="按所在书架 ID 筛选"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """获取所有图书列表（包括未上架的），默认每页 500 条，上限 5000 条。"""
    # ---- 步骤 1：构建子查询，获取每本书当前所在书架信息 ----
    # 使用子查询获取每本书第一个 in_shelf 关联的书架信息
    # 如果一本书在多个书架中，只取第一个（避免主查询出现重复行）
    active_shelf_sub = (
        db.query(
            LogicalShelfBook.book_id,
            func.min(LogicalShelfBook.logical_shelf_id).label("shelf_id"),
        )
        .filter(LogicalShelfBook.status == BookStatus.IN_SHELF.value)
        .group_by(LogicalShelfBook.book_id)
        .subquery("active_shelf")
    )
    
    # ---- 步骤 2：构建主查询 ----
    # 从 BookMetadata 出发，LEFT JOIN 子查询获取书架信息
    query = (
        db.query(
            BookMetadata,
            LogicalShelf.shelf_name,
            LogicalShelf.logical_shelf_id,
        )
        .select_from(BookMetadata)
        .outerjoin(
            active_shelf_sub,
            BookMetadata.book_id == active_shelf_sub.c.book_id,
        )
        .outerjoin(
            LogicalShelf,
            active_shelf_sub.c.shelf_id == LogicalShelf.logical_shelf_id,
        )
    )
    
    # ---- 步骤 3：筛选条件 ----
    
    # 按来源筛选
    if source:
        query = query.filter(BookMetadata.source == source)
    
    # 全文搜索
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                BookMetadata.title.ilike(search_term),
                BookMetadata.author.ilike(search_term),
                BookMetadata.isbn.ilike(search_term),
                BookMetadata.publisher.ilike(search_term),
            )
        )
    
    # 按书架筛选
    if shelf_id is not None:
        query = query.filter(
            active_shelf_sub.c.shelf_id == shelf_id
        )
    
    # ---- 步骤 4：排序 ----
    sort_column = BOOK_LIST_SORT.get(sort_by, BookMetadata.created_at)
    
    query = query.order_by(
        desc(sort_column) if order == "desc" else asc(sort_column)
    )
    
    # ---- 步骤 5：计算总数和分页 ----
    total = query.count()
    rows = query.offset(offset).limit(limit).all()
    
    # ---- 步骤 6：构建响应 ----
    books = []
    for book, shelf_name, shelf_id_val in rows:
        books.append({
            "book_id": book.book_id,
            "isbn": book.isbn or "",
            "title": book.title or "",
            "author": book.author,
            "cover_url": book.cover_url,
            "rating": book.rating,
            "source": book.source or "manual",
            "publisher": book.publisher,
            "publish_date": book.publish_date,
            "price": book.price,
            "binding": book.binding,
            "shelf_name": shelf_name,
            "shelf_id": shelf_id_val,
            "added_at": (
                book.created_at.isoformat()
                if book.created_at else None
            ),
        })
    
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": (offset + limit) < total,
        "books": books,
    }


# ==================== 图书墙 ====================

@router.get("/wall", summary="获取图书墙数据")
async def get_book_wall(
    shelf_id: Optional[int] = Query(
        None,
        description="按书架 ID 筛选，不传则返回所有书架"
    ),
    sort_by: str = Query(
        "added_at",
        description="排序字段: added_at / title / author / rating"
    ),
    order: str = Query("desc", description="排序方向: asc / desc"),
    limit: int = Query(50, ge=1, le=200, description="每页数量"),
    offset: int = Query(0, ge=0, description="偏移量（分页起始位置）"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    获取图书墙视图数据
    
    图书墙展示所有在架图书的封面和信息，支持：
    - 按书架筛选
    - 按添加时间/书名/作者/评分排序
    - 分页加载
    
    数据来源：LogicalShelfBook（在架状态）JOIN BookMetadata JOIN LogicalShelf
    
    评分排序特殊处理：
    - 使用 CASE WHEN 将 NULL/空字符串评分排到最后
    - 使用 CAST 将评分字符串转为浮点数排序
    
    Args:
        shelf_id: 书架 ID 筛选
        sort_by: 排序字段
        order: 排序方向
        limit: 每页数量
        offset: 偏移量
    
    Returns:
        包含图书列表、总数、分页信息的字典
    """
    # 构建基础查询：三表 JOIN
    query = (
        db.query(BookMetadata, LogicalShelfBook, LogicalShelf)
        .select_from(BookMetadata)
        .join(
            LogicalShelfBook,
            BookMetadata.book_id == LogicalShelfBook.book_id,
        )
        .join(
            LogicalShelf,
            LogicalShelfBook.logical_shelf_id == LogicalShelf.logical_shelf_id,
        )
        .filter(LogicalShelfBook.status == BookStatus.IN_SHELF.value)
    )
    
    # 可选书架筛选
    if shelf_id:
        query = query.filter(LogicalShelf.logical_shelf_id == shelf_id)
    
    # 计算总数
    total = query.count()
    
    # 排序字段映射（从共享模块导入）
    sort_column = SHELF_BOOK_SORT.get(sort_by, LogicalShelfBook.added_at)
    
    # 应用排序
    query = query.order_by(
        desc(sort_column) if order == "desc" else asc(sort_column)
    )
    
    # 分页查询
    rows = query.offset(offset).limit(limit).all()
    
    # 构建响应数据
    books = []
    for book, shelf_book, shelf in rows:
        books.append({
            "book_id": book.book_id,
            "isbn": book.isbn or "",
            "title": book.title or "",
            "author": book.author,
            "cover_url": book.cover_url,
            "rating": book.rating,
            "source": book.source or "manual",
            "publisher": book.publisher,
            "publish_date": book.publish_date,
            "price": book.price,
            "shelf_name": shelf.shelf_name if shelf else None,
            "shelf_id": shelf.logical_shelf_id if shelf else None,
            "added_at": (
                shelf_book.added_at.isoformat()
                if shelf_book.added_at else None
            ),
        })
    
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": (offset + limit) < total,
        "books": books,
    }


# ==================== 手动录入 ====================

class _ManualResult(_SchemaModel):
    book_id: int
    shelf_book_id: Optional[int] = None


@router.post("/manual", summary="手动录入图书")
async def create_book_manual(
    req: BookCreateManualRequest = Body(...),
    db: Session = Depends(get_db),
) -> ApiResponse[_ManualResult]:
    """
    手动录入图书元数据
    
    用于豆瓣同步失败或无 ISBN 图书的录入。
    
    处理流程：
    1. 清洗并校验 ISBN 唯一性
    2. 创建 BookMetadata 记录（source=manual）
    3. 可选：自动添加到指定书架
    
    业务规则：
    - ISBN 必须唯一，重复 ISBN 返回 400 错误
    - shelf_id 可选，传入则自动创建书架关联
    
    Args:
        req: 图书元数据和可选书架信息
    
    Returns:
        创建结果和图书 ID
    
    Raises:
        HTTPException 400: ISBN 已存在
    """
    # 清洗 ISBN
    isbn = clean_isbn(req.isbn)
    
    # 检查 ISBN 唯一性
    if (
        db.query(BookMetadata)
        .filter(BookMetadata.isbn == isbn)
        .first()
    ):
        raise HTTPException(
            status_code=400,
            detail=f"ISBN {isbn} 已存在，请使用同步功能更新或检查是否重复录入",
        )
    
    # 创建图书记录
    field_values = {
        field: (
            value.strip()
            if isinstance(value, str)
            else value
        )
        for field in BOOK_METADATA_FIELDS
        if (value := getattr(req, field, None))
    }
    
    book = BookMetadata(
        isbn=isbn,
        source=req.source,
        **field_values,
    )
    db.add(book)
    db.commit()
    db.refresh(book)
    
    # 可选：添加到书架
    shelf_book_id = None
    if req.shelf_id:
        target_shelf = (
            db.query(LogicalShelf)
            .filter(
                LogicalShelf.logical_shelf_id == req.shelf_id,
                LogicalShelf.is_active == True,
            )
            .first()
        )
        if target_shelf:
            shelf_book = LogicalShelfBook(
                logical_shelf_id=req.shelf_id,
                book_id=book.book_id,
                sort_order=req.sort_order,
                status=BookStatus.IN_SHELF.value,
            )
            db.add(shelf_book)
            db.commit()
            shelf_book_id = shelf_book.id

    return ApiResponse(
        success=True,
        message=f"《{book.title}》已录入",
        data={
            "book_id": book.book_id,
            "shelf_book_id": shelf_book_id,
        },
    )


# ==================== 手动更新 ====================

@router.put("/{book_id}/manual", summary="手动更新图书信息")
async def update_book_manual(
    book_id: int,
    req: BookUpdateManualRequest = Body(...),
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    """
    手动更新图书元数据
    
    支持部分更新：仅更新请求中传入的非空字段。
    更新后自动标记 source=manual（表示用户手动修改过）。
    
    Args:
        book_id: 图书 ID
        req: 要更新的字段（仅传入需要修改的字段）
    
    Returns:
        更新结果和修改的字段列表
    
    Raises:
        HTTPException 404: 图书不存在
    """
    # 查找图书
    book = (
        db.query(BookMetadata)
        .filter(BookMetadata.book_id == book_id)
        .first()
    )
    if not book:
        raise HTTPException(status_code=404, detail="图书不存在")
    
    # 仅更新传入的非空字段
    updated_fields = []
    update_data = req.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        if value is not None:
            # 字符串字段去除首尾空白
            clean_value = value.strip() if isinstance(value, str) else value
            setattr(book, field, clean_value)
            updated_fields.append(field)
    
    # 标记为手动修改
    if updated_fields:
        book.source = BookSource.MANUAL.value
        book.updated_at = datetime.now(timezone.utc)
        db.commit()

    return ApiResponse(
        success=True,
        message=f"《{book.title}》已更新",
        data={"updated_fields": updated_fields},
    )


# ==================== 图书搜索 ====================

@router.get("/search", summary="搜索图书")
async def search_books(
    keyword: str = Query(
        ...,
        min_length=1,
        description="搜索关键词，匹配书名/作者/ISBN/译者/出版社",
    ),
    limit: int = Query(20, ge=1, le=100, description="返回数量"),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """
    图书全文搜索

    根据数据库类型自动选择最优搜索策略：
    - PostgreSQL: tsvector 全文搜索 (ts_rank 排序 + ts_headline 摘要)
    - SQLite: 多字段 ILIKE 模糊匹配

    Args:
        keyword: 搜索关键词
        limit: 返回结果数量上限

    Returns:
        匹配的图书列表（简要信息 + 相关性评分）
    """
    from app.services.search_service import SearchService
    result = SearchService.search_books_flexible(db, keyword, limit)
    return [
        {
            "book_id": r["book_id"],
            "isbn": r["isbn"],
            "title": r["title"],
            "author": r["author"],
            "translator": r.get("translator", ""),
            "publisher": r["publisher"],
            "cover_url": r["cover_url"],
            "rating": r["rating"],
            "source": r.get("source", ""),
            "summary": r.get("summary", ""),
            "relevance_score": r.get("relevance_score", 0),
        }
        for r in result["results"]
    ]


# ==================== 图书详情 ====================

@router.get("/{book_id}", response_model=BookDetailResponse, summary="获取图书详情")
async def get_book_detail(
    book_id: int,
    db: Session = Depends(get_db),
) -> BookDetailResponse:
    """
    获取图书完整元数据和当前书架信息
    
    包含内容：
    - 完整图书元数据（所有字段）
    - 当前所在书架（如果在架）
    - 书架中的排序位置和加入时间
    
    Args:
        book_id: 图书 ID
    
    Returns:
        图书详情响应
    
    Raises:
        HTTPException 404: 图书不存在
    """
    book = (
        db.query(BookMetadata)
        .filter(BookMetadata.book_id == book_id)
        .first()
    )
    if not book:
        raise HTTPException(status_code=404, detail="图书不存在")
    
    # 查询当前所在书架
    shelf_info = (
        db.query(LogicalShelfBook, LogicalShelf)
        .join(
            LogicalShelf,
            LogicalShelfBook.logical_shelf_id == LogicalShelf.logical_shelf_id,
        )
        .filter(
            LogicalShelfBook.book_id == book_id,
            LogicalShelfBook.status == BookStatus.IN_SHELF.value,
            LogicalShelf.is_active == True,
        )
        .first()
    )
    
    return BookDetailResponse(
        book_id=book.book_id,
        isbn=book.isbn,
        title=book.title,
        author=book.author,
        translator=book.translator,
        publisher=book.publisher,
        publish_date=book.publish_date,
        cover_url=book.cover_url,
        summary=book.summary,
        pages=book.pages,
        price=book.price,
        binding=book.binding,
        original_title=book.original_title,
        series=book.series,
        rating=book.rating,
        douban_url=book.douban_url,
        source=book.source,
        last_sync_at=book.last_sync_at.isoformat() if book.last_sync_at else None,
        created_at=book.created_at.isoformat() if book.created_at else None,
        updated_at=book.updated_at.isoformat() if book.updated_at else None,
        shelf_name=shelf_info[1].shelf_name if shelf_info else None,
        shelf_id=shelf_info[1].logical_shelf_id if shelf_info else None,
        sort_order=shelf_info[0].sort_order if shelf_info else None,
        added_at=(
            shelf_info[0].added_at.isoformat()
            if shelf_info and shelf_info[0].added_at
            else None
        ),
    )


# ==================== 删除图书 ====================

@router.delete("/{book_id}", summary="删除图书")
async def delete_book(
    book_id: int,
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    """
    删除图书及其所有关联数据
    
    级联删除：
    - 书架关联记录 (LogicalShelfBook)
    - 同步日志 (SyncLog)
    - 图书元数据 (BookMetadata)
    
    注意：此操作不可逆，请谨慎使用。
    
    Args:
        book_id: 图书 ID
    
    Returns:
        删除结果
    
    Raises:
        HTTPException 404: 图书不存在
    """
    book = (
        db.query(BookMetadata)
        .filter(BookMetadata.book_id == book_id)
        .first()
    )
    if not book:
        raise HTTPException(status_code=404, detail="图书不存在")
    
    book_title = book.title
    
    # 级联删除关联数据
    db.query(LogicalShelfBook).filter(
        LogicalShelfBook.book_id == book_id
    ).delete()
    db.query(SyncLog).filter(
        SyncLog.book_id == book_id
    ).delete()
    
    # 删除图书本身
    db.delete(book)
    db.commit()

    return ApiResponse(
        success=True,
        message=f"《{book_title}》已删除",
    )


# ==================== 辅助函数 ====================

def _build_sync_response(
    book: BookMetadata,
    message: str,
) -> BookSyncResponse:
    """
    构建同步响应对象
    
    对摘要进行截断处理（超过 200 字符时显示前 200 字符 + "..."）。
    
    Args:
        book: 图书 ORM 对象
        message: 响应消息
    
    Returns:
        BookSyncResponse 对象
    """
    summary = book.summary
    if summary and len(summary) > 200:
        summary = summary[:200] + "..."
    
    return BookSyncResponse(
        success=True,
        book=BookInShelf(
            book_id=book.book_id,
            isbn=book.isbn or "",
            title=book.title or "",
            author=book.author,
            translator=book.translator,
            publisher=book.publisher,
            publish_date=book.publish_date,
            cover_url=book.cover_url,
            summary=summary,
            pages=book.pages,
            price=book.price,
            binding=book.binding,
            original_title=book.original_title,
            series=book.series,
            rating=book.rating,
            douban_url=book.douban_url,
            source=book.source or "manual",
            sort_order=0,
        ),
        message=message,
    )


# ==================== 统一操作入口 ====================

@router.post("/action", summary="统一图书操作入口")
async def book_action(
    action: str = Query(..., description="操作类型: get / update / delete / smart_delete"),
    global_book_id: Optional[str] = Query(None, description="全局图书ID (B-xxx)"),
    shelf_id: Optional[str] = Query(None, description="书架ID (S-xxx)"),
    shelf_book_index: Optional[int] = Query(None, description="书架内序号"),
    data: Optional[Dict[str, Any]] = Body(None, description="更新数据"),
    db: Session = Depends(get_db),
):
    """
    统一图书操作入口，支持两种 BookReference 定位方式。

    全局 ID 优先：如果提供了 global_book_id，使用全局定位
    否则使用 shelf_id + shelf_book_index 定位

    操作类型:
    - get: 获取图书详情
    - update: 更新图书信息（需要 data 参数）
    - delete: 删除图书（清理所有映射）
    - smart_delete: 智能删除（书架引用只移除映射，全局引用彻底删除）
    """
    # ---- 解析 BookReference ----
    book = None
    if global_book_id:
        numeric_id = int(''.join(c for c in global_book_id if c.isdigit()))
        book = db.query(BookMetadata).filter(BookMetadata.book_id == numeric_id).first()
    elif shelf_id and shelf_book_index:
        shelf_numeric = int(''.join(c for c in shelf_id if c.isdigit()))
        shelf_book = (
            db.query(LogicalShelfBook)
            .filter(
                LogicalShelfBook.logical_shelf_id == shelf_numeric,
                LogicalShelfBook.status == BookStatus.IN_SHELF.value,
            )
            .order_by(LogicalShelfBook.sort_order)
            .offset(shelf_book_index - 1)
            .limit(1)
            .first()
        )
        if shelf_book:
            book = shelf_book.book

    if not book:
        ref_desc = f"global={global_book_id}" if global_book_id else f"shelf={shelf_id}/idx={shelf_book_index}"
        raise HTTPException(status_code=404, detail=f"图书不存在: {ref_desc}")

    # ---- 执行操作 ----
    if action == "get":
        return {
            "book_id": book.book_id,
            "global_book_id": f"B-{str(book.book_id).zfill(8)}",
            "title": book.title, "author": book.author, "isbn": book.isbn,
            "cover_url": book.cover_url, "publisher": book.publisher,
            "pages": book.pages, "rating": book.rating, "source": book.source,
        }

    if action == "update":
        if not data:
            raise HTTPException(status_code=400, detail="更新操作需要 data 参数")
        for field, value in data.items():
            if hasattr(book, field) and value is not None:
                setattr(book, field, value)
        db.commit()
        db.refresh(book)
        return ApiResponse(success=True, message="已更新", data={"book_id": book.book_id})

    if action == "delete":
        book_id = book.book_id
        book_title = book.title
        db.delete(book)
        db.commit()
        log_activity(db, action='delete_book', entity_type='book',
                     entity_id=book_id, detail={'title': book_title})
        return ApiResponse(success=True, message=f"《{book_title}》已删除")

    if action == "smart_delete":
        if global_book_id:
            return await book_action("delete", global_book_id, None, None, None, db)
        else:
            if shelf_book:
                db.delete(shelf_book)
                db.commit()
                return ApiResponse(success=True, message="已从书架移除", data={"deleted": False, "removed": True})

    raise HTTPException(status_code=400, detail=f"不支持的操作: {action}")