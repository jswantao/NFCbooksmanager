# backend/app/api/shelves.py
"""
书架管理 API - 中间模式核心接口

管理逻辑书架的 CRUD 和图书关联操作。

核心端点：
- GET    /                          : 列出所有逻辑书架
- POST   /                          : 创建逻辑书架
- GET    /{id}                      : 获取书架详情
- PUT    /{id}                      : 更新书架信息
- DELETE /{id}                      : 删除书架（软删除）
- GET    /{id}/books                : 获取书架的图书列表
- POST   /{id}/books                : 添加图书到书架
- DELETE /{id}/books/{book_id}      : 从书架移除图书
- PUT    /{id}/books/{book_id}/move : 移动图书到其他书架
- PUT    /{id}/books/{book_id}/sort : 更新图书排序

数据流向：
逻辑书架 → JOIN LogicalShelfBook → JOIN BookMetadata → 返回图书列表
同时通过 PhysicalLogicalMapping 获取物理位置信息

业务规则：
- 删除书架前需确保书架为空（无在架图书）
- 同一图书不可重复添加到同一书架（检测恢复已删除记录）
- 书架名称需唯一（激活状态下）
"""

from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, case

from app.core.database import get_db
from app.models.models import (
    LogicalShelf,
    LogicalShelfBook,
    BookMetadata,
    PhysicalShelf,
    PhysicalLogicalMapping,
    BookStatus,
)
from app.schemas.schemas import (
    ShelfBooksResponse,
    BookInShelf,
    BookAddToShelfRequest,
    BookAddToShelfResponse,
    MappingResolveResponse,
    ShelfInfoResponse,
    ShelfCreateRequest,
    ShelfUpdateRequest,
    ApiResponse,
)

router = APIRouter()


# ==================== 书架列表 ====================

@router.get("/", response_model=List[ShelfInfoResponse], summary="获取书架列表")
async def list_shelves(
    search: Optional[str] = Query(
        None,
        description="搜索书架名称或描述",
    ),
    sort_by: str = Query(
        "created_at",
        description="排序字段: created_at / updated_at / shelf_name",
    ),
    order: str = Query("desc", description="排序方向: asc / desc"),
    db: Session = Depends(get_db),
) -> List[ShelfInfoResponse]:
    """
    获取所有激活的逻辑书架列表
    
    支持：
    - 按名称/描述搜索（ILIKE，不区分大小写）
    - 按创建时间/更新时间/名称排序
    - 批量查询统计信息（避免 N+1 查询）
    
    统计优化：
    - 使用 GROUP BY 批量统计每个书架的图书数量
    - 使用 JOIN 批量获取物理映射信息
    
    Args:
        search: 搜索关键词
        sort_by: 排序字段
        order: 排序方向
        db: 数据库会话
    
    Returns:
        书架列表（含图书数量和物理位置信息）
    """
    # 基础查询：仅激活书架
    query = db.query(LogicalShelf).filter(LogicalShelf.is_active == True)
    
    # 搜索过滤
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            LogicalShelf.shelf_name.ilike(search_term)
            | LogicalShelf.description.ilike(search_term)
        )
    
    # 排序
    sort_mapping = {
        "created_at": LogicalShelf.created_at,
        "updated_at": LogicalShelf.updated_at,
        "shelf_name": LogicalShelf.shelf_name,
    }
    sort_column = sort_mapping.get(sort_by, LogicalShelf.created_at)
    query = query.order_by(
        asc(sort_column) if order == "asc" else desc(sort_column)
    )
    
    shelves = query.all()
    shelf_ids = [s.logical_shelf_id for s in shelves]
    
    # 批量统计图书数量
    book_counts: Dict[int, int] = {}
    if shelf_ids:
        count_results = (
            db.query(
                LogicalShelfBook.logical_shelf_id,
                func.count(LogicalShelfBook.id).label("count"),
            )
            .filter(
                LogicalShelfBook.logical_shelf_id.in_(shelf_ids),
                LogicalShelfBook.status == BookStatus.IN_SHELF.value,
            )
            .group_by(LogicalShelfBook.logical_shelf_id)
            .all()
        )
        book_counts = {
            row.logical_shelf_id: row.count for row in count_results
        }
    
    # 批量获取物理映射信息
    mappings: Dict[int, Dict[str, Any]] = {}
    if shelf_ids:
        mapping_results = (
            db.query(
                PhysicalLogicalMapping.logical_shelf_id,
                PhysicalLogicalMapping.mapping_type,
                PhysicalShelf.location_name,
                PhysicalShelf.location_code,
            )
            .join(
                PhysicalShelf,
                PhysicalLogicalMapping.physical_shelf_id == PhysicalShelf.physical_shelf_id,
            )
            .filter(
                PhysicalLogicalMapping.logical_shelf_id.in_(shelf_ids),
                PhysicalLogicalMapping.is_active == True,
            )
            .all()
        )
        mappings = {
            row.logical_shelf_id: {
                "location_name": row.location_name,
                "location_code": row.location_code,
                "mapping_type": row.mapping_type,
            }
            for row in mapping_results
        }
    
    # 构建响应
    result = []
    for shelf in shelves:
        mapping_info = mappings.get(shelf.logical_shelf_id)
        result.append(
            ShelfInfoResponse(
                logical_shelf_id=shelf.logical_shelf_id,
                shelf_name=shelf.shelf_name,
                description=shelf.description,
                book_count=book_counts.get(shelf.logical_shelf_id, 0),
                physical_location=(
                    mapping_info["location_name"] if mapping_info else None
                ),
                physical_code=(
                    mapping_info["location_code"] if mapping_info else None
                ),
                recent_cover=None,
                created_at=(
                    shelf.created_at.isoformat()
                    if shelf.created_at else None
                ),
                updated_at=(
                    shelf.updated_at.isoformat()
                    if shelf.updated_at else None
                ),
            )
        )
    
    return result


# ==================== 创建书架 ====================

@router.post("/", response_model=ApiResponse, summary="创建逻辑书架")
async def create_shelf(
    request: ShelfCreateRequest,
    db: Session = Depends(get_db),
) -> ApiResponse:
    """
    创建新的逻辑书架
    
    业务规则：
    - 书架名称在激活书架中必须唯一
    - 自动去除名称和描述的首尾空白
    
    Args:
        request: 书架名称和描述
        db: 数据库会话
    
    Returns:
        创建结果和书架 ID
    
    Raises:
        HTTPException 400: 同名书架已存在
    """
    # 检查名称唯一性
    existing = (
        db.query(LogicalShelf)
        .filter(
            LogicalShelf.shelf_name == request.shelf_name.strip(),
            LogicalShelf.is_active == True,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"书架「{request.shelf_name}」已存在",
        )
    
    # 创建书架
    shelf = LogicalShelf(
        shelf_name=request.shelf_name.strip(),
        description=(
            request.description.strip()
            if request.description else None
        ),
        is_active=True,
    )
    db.add(shelf)
    db.commit()
    db.refresh(shelf)
    
    return ApiResponse(
        success=True,
        message=f"书架「{shelf.shelf_name}」创建成功",
        data={"logical_shelf_id": shelf.logical_shelf_id},
    )


# ==================== 书架详情 ====================

@router.get(
    "/{logical_shelf_id}",
    response_model=ShelfInfoResponse,
    summary="获取书架详情",
)
async def get_shelf_detail(
    logical_shelf_id: int,
    db: Session = Depends(get_db),
) -> ShelfInfoResponse:
    """
    获取单个逻辑书架的详细信息
    
    包含图书数量统计。
    
    Args:
        logical_shelf_id: 书架 ID
        db: 数据库会话
    
    Returns:
        书架详情
    
    Raises:
        HTTPException 404: 书架不存在
    """
    shelf = (
        db.query(LogicalShelf)
        .filter(
            LogicalShelf.logical_shelf_id == logical_shelf_id,
            LogicalShelf.is_active == True,
        )
        .first()
    )
    if not shelf:
        raise HTTPException(status_code=404, detail="书架不存在")
    
    # 统计图书数量
    book_count = (
        db.query(func.count(LogicalShelfBook.id))
        .filter(
            LogicalShelfBook.logical_shelf_id == logical_shelf_id,
            LogicalShelfBook.status == BookStatus.IN_SHELF.value,
        )
        .scalar() or 0
    )
    
    return ShelfInfoResponse(
        logical_shelf_id=shelf.logical_shelf_id,
        shelf_name=shelf.shelf_name,
        description=shelf.description,
        book_count=book_count,
        created_at=shelf.created_at.isoformat() if shelf.created_at else None,
        updated_at=shelf.updated_at.isoformat() if shelf.updated_at else None,
    )


# ==================== 更新书架 ====================

@router.put(
    "/{logical_shelf_id}",
    response_model=ApiResponse,
    summary="更新书架信息",
)
async def update_shelf(
    logical_shelf_id: int,
    request: ShelfUpdateRequest,
    db: Session = Depends(get_db),
) -> ApiResponse:
    """
    更新书架名称或描述
    
    支持部分更新：仅传入需要修改的字段。
    更新名称时检查唯一性（排除自身）。
    
    Args:
        logical_shelf_id: 书架 ID
        request: 要更新的字段
        db: 数据库会话
    
    Returns:
        更新结果
    
    Raises:
        HTTPException 404: 书架不存在
        HTTPException 400: 名称与其他书架重复
    """
    shelf = (
        db.query(LogicalShelf)
        .filter(
            LogicalShelf.logical_shelf_id == logical_shelf_id,
            LogicalShelf.is_active == True,
        )
        .first()
    )
    if not shelf:
        raise HTTPException(status_code=404, detail="书架不存在")
    
    # 更新名称（检查唯一性）
    if request.shelf_name is not None:
        name_conflict = (
            db.query(LogicalShelf)
            .filter(
                LogicalShelf.shelf_name == request.shelf_name.strip(),
                LogicalShelf.logical_shelf_id != logical_shelf_id,
                LogicalShelf.is_active == True,
            )
            .first()
        )
        if name_conflict:
            raise HTTPException(
                status_code=400,
                detail=f"书架「{request.shelf_name}」已存在",
            )
        shelf.shelf_name = request.shelf_name.strip()
    
    # 更新描述
    if request.description is not None:
        shelf.description = (
            request.description.strip()
            if request.description else None
        )
    
    shelf.updated_at = datetime.utcnow()
    db.commit()
    
    return ApiResponse(
        success=True,
        message=f"书架「{shelf.shelf_name}」已更新",
    )


# ==================== 删除书架 ====================

@router.delete(
    "/{logical_shelf_id}",
    response_model=ApiResponse,
    summary="删除书架（软删除）",
)
async def delete_shelf(
    logical_shelf_id: int,
    db: Session = Depends(get_db),
) -> ApiResponse:
    """
    软删除逻辑书架
    
    业务规则：
    - 仅当书架中无在架图书时允许删除
    - 有图书时提示先移除或移动图书
    - 软删除：is_active=False，保留历史数据
    
    Args:
        logical_shelf_id: 书架 ID
        db: 数据库会话
    
    Returns:
        删除结果
    
    Raises:
        HTTPException 404: 书架不存在
        HTTPException 400: 书架非空，不允许删除
    """
    shelf = (
        db.query(LogicalShelf)
        .filter(
            LogicalShelf.logical_shelf_id == logical_shelf_id,
            LogicalShelf.is_active == True,
        )
        .first()
    )
    if not shelf:
        raise HTTPException(status_code=404, detail="书架不存在")
    
    # 检查是否为空
    book_count = (
        db.query(func.count(LogicalShelfBook.id))
        .filter(
            LogicalShelfBook.logical_shelf_id == logical_shelf_id,
            LogicalShelfBook.status == BookStatus.IN_SHELF.value,
        )
        .scalar() or 0
    )
    if book_count > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                f"书架中还有 {book_count} 本图书，"
                f"请先移除或移动图书后再删除书架"
            ),
        )
    
    shelf_name = shelf.shelf_name
    shelf.is_active = False
    shelf.updated_at = datetime.utcnow()
    db.commit()
    
    return ApiResponse(
        success=True,
        message=f"书架「{shelf_name}」已删除",
    )


# ==================== 获取书架图书 ====================

@router.get(
    "/{logical_shelf_id}/books",
    response_model=ShelfBooksResponse,
    summary="获取书架图书列表",
)
async def get_shelf_books(
    logical_shelf_id: int,
    sort_by: str = Query(
        "sort_order",
        description="排序: sort_order / title / author / added_at / rating",
    ),
    order: str = Query("asc", description="排序方向: asc / desc"),
    search: Optional[str] = Query(None, description="在书架内搜索图书"),
    db: Session = Depends(get_db),
) -> ShelfBooksResponse:
    """
    获取逻辑书架的完整信息及其包含的图书列表
    
    包含内容：
    - 书架基本信息（名称、描述）
    - 物理位置映射信息（如果有 NFC 绑定）
    - 图书列表（支持排序和搜索）
    
    评分排序特殊处理：
    - 使用 CASE WHEN 将 NULL/空评分排到最后
    
    Args:
        logical_shelf_id: 书架 ID
        sort_by: 排序字段
        order: 排序方向
        search: 搜索关键词
        db: 数据库会话
    
    Returns:
        书架完整信息和图书列表
    
    Raises:
        HTTPException 404: 书架不存在
    """
    # 验证书架存在
    logical_shelf = (
        db.query(LogicalShelf)
        .filter(
            LogicalShelf.logical_shelf_id == logical_shelf_id,
            LogicalShelf.is_active == True,
        )
        .first()
    )
    if not logical_shelf:
        raise HTTPException(status_code=404, detail="逻辑书架不存在")
    
    # 查询书架中的图书
    query = (
        db.query(LogicalShelfBook, BookMetadata)
        .join(
            BookMetadata,
            LogicalShelfBook.book_id == BookMetadata.book_id,
        )
        .filter(
            LogicalShelfBook.logical_shelf_id == logical_shelf_id,
            LogicalShelfBook.status == BookStatus.IN_SHELF.value,
        )
    )
    
    # 书架内搜索
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            BookMetadata.title.ilike(search_term)
            | BookMetadata.author.ilike(search_term)
            | BookMetadata.isbn.ilike(search_term)
            | BookMetadata.publisher.ilike(search_term)
        )
    
    # 排序
    sort_mapping = {
        "sort_order": LogicalShelfBook.sort_order,
        "title": BookMetadata.title,
        "author": BookMetadata.author,
        "added_at": LogicalShelfBook.added_at,
        "rating": case(
            (BookMetadata.rating == None, 0),
            else_=func.cast(BookMetadata.rating, func.Float),
        ),
    }
    sort_column = sort_mapping.get(sort_by, LogicalShelfBook.sort_order)
    query = query.order_by(
        desc(sort_column) if order == "desc" else asc(sort_column)
    )
    
    shelf_books = query.all()
    
    # 构建图书列表
    books = []
    for shelf_book, book in shelf_books:
        summary = book.summary
        if summary and len(summary) > 200:
            summary = summary[:200] + "..."
        
        books.append(
            BookInShelf(
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
                sort_order=shelf_book.sort_order,
                added_at=(
                    shelf_book.added_at.isoformat()
                    if shelf_book.added_at else None
                ),
                shelf_name=logical_shelf.shelf_name,
                shelf_id=logical_shelf.logical_shelf_id,
            )
        )
    
    # 获取物理映射信息
    physical_info = None
    mapping = (
        db.query(PhysicalLogicalMapping)
        .filter(
            PhysicalLogicalMapping.logical_shelf_id == logical_shelf_id,
            PhysicalLogicalMapping.is_active == True,
        )
        .first()
    )
    if mapping:
        physical_shelf = (
            db.query(PhysicalShelf)
            .filter(
                PhysicalShelf.physical_shelf_id == mapping.physical_shelf_id,
            )
            .first()
        )
        if physical_shelf:
            physical_info = MappingResolveResponse(
                logical_shelf_id=logical_shelf.logical_shelf_id,
                logical_shelf_name=logical_shelf.shelf_name,
                physical_location=physical_shelf.location_name,
                mapping_type=mapping.mapping_type,
                version=mapping.version,
            )
    
    return ShelfBooksResponse(
        logical_shelf_id=logical_shelf.logical_shelf_id,
        shelf_name=logical_shelf.shelf_name,
        description=logical_shelf.description,
        physical_info=physical_info,
        books=books,
        total_count=len(books),
    )


# ==================== 添加图书到书架 ====================

@router.post(
    "/{logical_shelf_id}/books",
    response_model=BookAddToShelfResponse,
    summary="添加图书到书架",
)
async def add_book_to_shelf(
    logical_shelf_id: int,
    request: BookAddToShelfRequest,
    db: Session = Depends(get_db),
) -> BookAddToShelfResponse:
    """
    将已有图书添加到指定逻辑书架
    
    支持恢复已删除记录：
    - 如果图书之前在此书架被移除（status=removed），自动恢复
    - 如果是新添加，创建新的关联记录
    
    业务规则：
    - 同一图书不可重复添加（in_shelf 状态）
    - 恢复旧记录时保留原 sort_order
    
    Args:
        logical_shelf_id: 书架 ID
        request: 图书 ID 和排序信息
        db: 数据库会话
    
    Returns:
        添加结果
    
    Raises:
        HTTPException 404: 书架或图书不存在
        HTTPException 400: 图书已在此书架中
    """
    # 验证书架存在
    logical_shelf = (
        db.query(LogicalShelf)
        .filter(
            LogicalShelf.logical_shelf_id == logical_shelf_id,
            LogicalShelf.is_active == True,
        )
        .first()
    )
    if not logical_shelf:
        raise HTTPException(status_code=404, detail="逻辑书架不存在")
    
    # 验证图书存在
    book = (
        db.query(BookMetadata)
        .filter(BookMetadata.book_id == request.book_id)
        .first()
    )
    if not book:
        raise HTTPException(status_code=404, detail="图书不存在")
    
    # 检查是否已在书架中
    existing = (
        db.query(LogicalShelfBook)
        .filter(
            LogicalShelfBook.logical_shelf_id == logical_shelf_id,
            LogicalShelfBook.book_id == request.book_id,
            LogicalShelfBook.status == BookStatus.IN_SHELF.value,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"《{book.title}》已在此书架中",
        )
    
    # 检查是否有已删除记录（恢复）
    deleted = (
        db.query(LogicalShelfBook)
        .filter(
            LogicalShelfBook.logical_shelf_id == logical_shelf_id,
            LogicalShelfBook.book_id == request.book_id,
            LogicalShelfBook.status == BookStatus.REMOVED.value,
        )
        .first()
    )
    if deleted:
        deleted.status = BookStatus.IN_SHELF.value
        deleted.sort_order = request.sort_order
        deleted.note = request.note
        deleted.updated_at = datetime.utcnow()
        db.commit()
        return BookAddToShelfResponse(
            success=True,
            message=f"《{book.title}》已恢复到书架",
            shelf_book_id=deleted.id,
        )
    
    # 创建新关联
    shelf_book = LogicalShelfBook(
        logical_shelf_id=logical_shelf_id,
        book_id=request.book_id,
        sort_order=request.sort_order,
        status=BookStatus.IN_SHELF.value,
        note=request.note,
    )
    db.add(shelf_book)
    db.commit()
    db.refresh(shelf_book)
    
    return BookAddToShelfResponse(
        success=True,
        message=f"《{book.title}》已添加到书架「{logical_shelf.shelf_name}」",
        shelf_book_id=shelf_book.id,
    )


# ==================== 从书架移除图书 ====================

@router.delete(
    "/{logical_shelf_id}/books/{book_id}",
    response_model=ApiResponse,
    summary="从书架移除图书",
)
async def remove_book_from_shelf(
    logical_shelf_id: int,
    book_id: int,
    db: Session = Depends(get_db),
) -> ApiResponse:
    """
    从书架中移除图书（软删除）
    
    将关联记录状态设为 removed，保留历史记录。
    
    Args:
        logical_shelf_id: 书架 ID
        book_id: 图书 ID
        db: 数据库会话
    
    Returns:
        移除结果
    
    Raises:
        HTTPException 404: 图书不在书架中
    """
    shelf_book = (
        db.query(LogicalShelfBook)
        .filter(
            LogicalShelfBook.logical_shelf_id == logical_shelf_id,
            LogicalShelfBook.book_id == book_id,
            LogicalShelfBook.status == BookStatus.IN_SHELF.value,
        )
        .first()
    )
    if not shelf_book:
        raise HTTPException(status_code=404, detail="该图书不在书架中")
    
    book = (
        db.query(BookMetadata)
        .filter(BookMetadata.book_id == book_id)
        .first()
    )
    
    shelf_book.status = BookStatus.REMOVED.value
    shelf_book.updated_at = datetime.utcnow()
    db.commit()
    
    return ApiResponse(
        success=True,
        message=f"《{book.title if book else '未知'}》已从书架移除",
    )


# ==================== 移动图书到其他书架 ====================

@router.put(
    "/{logical_shelf_id}/books/{book_id}/move",
    response_model=ApiResponse,
    summary="移动图书到其他书架",
)
async def move_book_between_shelves(
    logical_shelf_id: int,
    book_id: int,
    target_shelf_id: int = Query(..., description="目标书架 ID"),
    db: Session = Depends(get_db),
) -> ApiResponse:
    """
    将图书从一个书架移动到另一个书架
    
    直接修改关联记录的 logical_shelf_id，无需删除重建。
    
    Args:
        logical_shelf_id: 源书架 ID
        book_id: 图书 ID
        target_shelf_id: 目标书架 ID
        db: 数据库会话
    
    Returns:
        移动结果
    
    Raises:
        HTTPException 404: 图书不在源书架或目标书架不存在
        HTTPException 400: 源书架与目标书架相同
    """
    # 验证源记录存在
    source_record = (
        db.query(LogicalShelfBook)
        .filter(
            LogicalShelfBook.logical_shelf_id == logical_shelf_id,
            LogicalShelfBook.book_id == book_id,
            LogicalShelfBook.status == BookStatus.IN_SHELF.value,
        )
        .first()
    )
    if not source_record:
        raise HTTPException(status_code=404, detail="图书不在源书架中")
    
    # 验证目标书架存在
    target_shelf = (
        db.query(LogicalShelf)
        .filter(
            LogicalShelf.logical_shelf_id == target_shelf_id,
            LogicalShelf.is_active == True,
        )
        .first()
    )
    if not target_shelf:
        raise HTTPException(status_code=404, detail="目标书架不存在")
    
    # 不能移动到同一书架
    if logical_shelf_id == target_shelf_id:
        raise HTTPException(status_code=400, detail="不能移动到同一书架")
    
    # 获取名称用于提示
    book = (
        db.query(BookMetadata)
        .filter(BookMetadata.book_id == book_id)
        .first()
    )
    source_shelf_name = (
        db.query(LogicalShelf.shelf_name)
        .filter(LogicalShelf.logical_shelf_id == logical_shelf_id)
        .scalar()
    )
    
    # 修改关联
    source_record.logical_shelf_id = target_shelf_id
    source_record.updated_at = datetime.utcnow()
    db.commit()
    
    return ApiResponse(
        success=True,
        message=(
            f"《{book.title if book else '未知'}》已从"
            f"「{source_shelf_name}」移动到「{target_shelf.shelf_name}」"
        ),
    )


# ==================== 更新图书排序 ====================

@router.put(
    "/{logical_shelf_id}/books/{book_id}/sort",
    response_model=ApiResponse,
    summary="更新图书排序",
)
async def update_book_sort_order(
    logical_shelf_id: int,
    book_id: int,
    sort_order: int = Query(..., ge=0, description="排序位置（数值越小越靠前）"),
    db: Session = Depends(get_db),
) -> ApiResponse:
    """
    更新图书在书架中的排序位置
    
    sort_order 越小越靠前，相同值时按添加时间排序。
    
    Args:
        logical_shelf_id: 书架 ID
        book_id: 图书 ID
        sort_order: 新的排序位置（≥0）
        db: 数据库会话
    
    Returns:
        更新结果
    
    Raises:
        HTTPException 404: 图书不在书架中
    """
    shelf_book = (
        db.query(LogicalShelfBook)
        .filter(
            LogicalShelfBook.logical_shelf_id == logical_shelf_id,
            LogicalShelfBook.book_id == book_id,
            LogicalShelfBook.status == BookStatus.IN_SHELF.value,
        )
        .first()
    )
    if not shelf_book:
        raise HTTPException(status_code=404, detail="图书不在书架中")
    
    shelf_book.sort_order = sort_order
    shelf_book.updated_at = datetime.utcnow()
    db.commit()
    
    return ApiResponse(success=True, message="排序已更新")