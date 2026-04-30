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

import logging
from typing import Optional, Dict, Any, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, case, or_
from sqlalchemy.types import Float

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
from app.schemas.schemas import (
    BookSyncRequest,
    BookSyncResponse,
    BookInShelf,
    BookDetailResponse,
    BookCreateManualRequest,
    BookUpdateManualRequest,
    ApiResponse,
)
from app.services.douban_service import DoubanService

logger = logging.getLogger(__name__)
router = APIRouter()

# 全局豆瓣服务实例（单例模式，复用缓存和统计）
douban_service = DoubanService()

# 图书元数据字段列表（用于批量属性赋值）
BOOK_METADATA_FIELDS = [
    "title", "author", "translator", "publisher", "publish_date",
    "cover_url", "summary", "pages", "price", "binding",
    "original_title", "series", "rating", "douban_url",
]


# ==================== 豆瓣同步 ====================

@router.post("/sync", response_model=BookSyncResponse, summary="根据 ISBN 同步豆瓣数据")
async def sync_book(
    req: BookSyncRequest,
    db: Session = Depends(get_db),
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
    isbn = req.isbn.strip().replace("-", "").replace(" ", "")
    
    # 检查本地是否已存在
    existing_book = (
        db.query(BookMetadata)
        .filter(BookMetadata.isbn == isbn)
        .first()
    )
    
    # 调用豆瓣服务搜索
    douban_data = await douban_service.search_by_isbn(isbn)
    
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
        book.last_sync_at = datetime.utcnow()
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
        description="排序字段: created_at / added_at / title / author / rating"
    ),
    order: str = Query("desc", description="排序方向: asc / desc"),
    limit: int = Query(50, ge=1, le=200, description="每页数量"),
    offset: int = Query(0, ge=0, description="偏移量（分页起始位置）"),
    source: Optional[str] = Query(None, description="按来源筛选: douban / manual / isbn / nfc"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    获取所有图书列表（包括未上架的）
    
    功能：
    - 获取所有图书，包括那些未分配到任何书架的图书
    - 支持按来源筛选（豆瓣/手动/ISBN/NFC）
    - 支持排序和分页
    - 对于在架图书，包含书架名称；未在架图书的 shelf_name 为 null
    
    数据来源：BookMetadata（左外连接 LogicalShelfBook 和 LogicalShelf）
    
    Args:
        sort_by: 排序字段（created_at=添加时间/added_at=上架时间/title=书名/author=作者/rating=评分）
        order: 排序方向
        limit: 每页数量
        offset: 偏移量
        source: 按来源筛选（可选）
    
    Returns:
        包含图书列表、总数、分页信息的字典
    """
    # 构建基础查询：使用左外连接，获取所有图书及其可能的书架信息
    query = (
        db.query(BookMetadata, LogicalShelfBook, LogicalShelf)
        .outerjoin(
            LogicalShelfBook,
            (BookMetadata.book_id == LogicalShelfBook.book_id) &
            (LogicalShelfBook.status == BookStatus.IN_SHELF.value),
        )
        .outerjoin(
            LogicalShelf,
            LogicalShelfBook.logical_shelf_id == LogicalShelf.logical_shelf_id,
        )
    )
    
    # 按来源筛选（可选）
    if source:
        query = query.filter(BookMetadata.source == source)
    
    # 计算总数
    total = query.count()
    
    # 排序字段映射（支持多个排序字段）
    sort_mapping = {
        "created_at": BookMetadata.created_at,
        "added_at": LogicalShelfBook.added_at,  # 对未上架的图书，此字段为 NULL
        "title": BookMetadata.title,
        "author": BookMetadata.author,
        "rating": case(
            (BookMetadata.rating == None, 0),
            (BookMetadata.rating == "", 0),
            else_=func.cast(BookMetadata.rating, Float),
        ),
    }
    sort_column = sort_mapping.get(sort_by, BookMetadata.created_at)
    
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
    
    # 排序字段映射（使用 CASE WHEN 处理评分为空的特殊情况）
    sort_mapping = {
        "added_at": LogicalShelfBook.added_at,
        "title": BookMetadata.title,
        "author": BookMetadata.author,
        "rating": case(
            (BookMetadata.rating == None, 0),
            (BookMetadata.rating == "", 0),
            else_=func.cast(BookMetadata.rating, Float),
        ),
    }
    sort_column = sort_mapping.get(sort_by, LogicalShelfBook.added_at)
    
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

@router.post("/manual", response_model=ApiResponse, summary="手动录入图书")
async def create_book_manual(
    req: BookCreateManualRequest = Body(...),
    db: Session = Depends(get_db),
) -> ApiResponse:
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
    isbn = req.isbn.strip().replace("-", "").replace(" ", "")
    
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
        source=BookSource.MANUAL.value,
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

@router.put("/{book_id}/manual", response_model=ApiResponse, summary="手动更新图书信息")
async def update_book_manual(
    book_id: int,
    req: BookUpdateManualRequest = Body(...),
    db: Session = Depends(get_db),
) -> ApiResponse:
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
        book.updated_at = datetime.utcnow()
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
    
    在以下字段中进行模糊匹配（ILIKE，不区分大小写）：
    - 书名 (title)
    - 作者 (author)
    - ISBN (isbn)
    - 译者 (translator)
    - 出版社 (publisher)
    
    返回结果包含摘要预览（超过 100 字截断）。
    
    Args:
        keyword: 搜索关键词
        limit: 返回结果数量上限
    
    Returns:
        匹配的图书列表（简要信息）
    """
    search_pattern = f"%{keyword}%"
    
    books = (
        db.query(BookMetadata)
        .filter(
            or_(
                BookMetadata.title.ilike(search_pattern),
                BookMetadata.author.ilike(search_pattern),
                BookMetadata.isbn.ilike(search_pattern),
                BookMetadata.translator.ilike(search_pattern),
                BookMetadata.publisher.ilike(search_pattern),
            )
        )
        .limit(limit)
        .all()
    )
    
    return [
        {
            "book_id": book.book_id,
            "isbn": book.isbn,
            "title": book.title,
            "author": book.author,
            "translator": book.translator,
            "publisher": book.publisher,
            "cover_url": book.cover_url,
            "rating": book.rating,
            "source": book.source,
            "summary": (
                f"{book.summary[:100]}..."
                if book.summary and len(book.summary) > 100
                else book.summary
            ),
        }
        for book in books
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

@router.delete("/{book_id}", response_model=ApiResponse, summary="删除图书")
async def delete_book(
    book_id: int,
    db: Session = Depends(get_db),
) -> ApiResponse:
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