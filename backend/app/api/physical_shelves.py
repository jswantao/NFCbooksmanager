# backend/app/api/physical_shelves.py
"""
物理书架管理 API

提供物理书架的完整 CRUD 操作和 NFC 标签管理。

核心端点：
- GET    /              : 获取所有物理书架列表
- POST   /              : 创建物理书架
- PUT    /{id}          : 更新物理书架信息
- DELETE /{id}          : 删除物理书架
- PUT    /{id}/nfc      : 绑定 NFC 标签 UID
- DELETE /{id}/nfc      : 解绑 NFC 标签 UID
- GET    /{id}/mappings : 获取物理书架关联的映射关系
"""

from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.core.database import get_db
from app.models.models import (
    PhysicalShelf,
    LogicalShelf,
    PhysicalLogicalMapping,
)
from pydantic import BaseModel, Field

router = APIRouter()


# ==================== 请求/响应模型 ====================

class PhysicalShelfCreate(BaseModel):
    """创建物理书架请求"""
    location_code: str = Field(..., min_length=1, max_length=100, description="位置编码")
    location_name: str = Field(..., min_length=1, max_length=200, description="位置名称")
    description: Optional[str] = Field(None, max_length=500, description="描述")
    nfc_tag_uid: Optional[str] = Field(None, max_length=100, description="NFC 标签 UID")


class PhysicalShelfUpdate(BaseModel):
    """更新物理书架请求"""
    location_code: Optional[str] = Field(None, min_length=1, max_length=100)
    location_name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class NFCBindRequest(BaseModel):
    """NFC 标签绑定请求"""
    nfc_tag_uid: str = Field(..., min_length=1, max_length=100, description="NFC 标签 UID")


class PhysicalShelfResponse(BaseModel):
    """物理书架响应"""
    physical_shelf_id: int
    location_code: str
    location_name: str
    description: Optional[str] = None
    nfc_tag_uid: Optional[str] = None
    is_active: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    # 关联信息
    logical_shelf_name: Optional[str] = None
    logical_shelf_id: Optional[int] = None
    mapping_type: Optional[str] = None
    mapping_active: bool = False
    mapping_version: Optional[int] = None

    class Config:
        from_attributes = True


class PhysicalShelfListResponse(BaseModel):
    """物理书架列表响应"""
    shelves: List[PhysicalShelfResponse]
    total: int


# ==================== API 端点 ====================

@router.get("/", response_model=PhysicalShelfListResponse, summary="获取物理书架列表")
async def list_physical_shelves(
    search: Optional[str] = Query(None, description="搜索位置编码或名称"),
    is_active: Optional[bool] = Query(None, description="按启用状态筛选"),
    db: Session = Depends(get_db),
):
    """
    获取所有物理书架列表
    
    支持搜索和按启用状态筛选。
    返回每个物理书架及其关联的逻辑书架信息。
    """
    query = db.query(PhysicalShelf)

    # 搜索过滤
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            PhysicalShelf.location_code.ilike(search_term)
            | PhysicalShelf.location_name.ilike(search_term)
        )

    # 状态筛选
    if is_active is not None:
        query = query.filter(PhysicalShelf.is_active == is_active)

    # 排序
    query = query.order_by(PhysicalShelf.location_code)

    total = query.count()
    shelves = query.all()

    # 组装响应数据
    result = []
    for shelf in shelves:
        # 查询激活的映射关系
        mapping = (
            db.query(PhysicalLogicalMapping)
            .filter(
                PhysicalLogicalMapping.physical_shelf_id == shelf.physical_shelf_id,
                PhysicalLogicalMapping.is_active == True,
            )
            .first()
        )

        logical_shelf_name = None
        logical_shelf_id = None
        mapping_type = None
        mapping_version = None
        mapping_active = False

        if mapping:
            logical = (
                db.query(LogicalShelf)
                .filter(LogicalShelf.logical_shelf_id == mapping.logical_shelf_id)
                .first()
            )
            if logical:
                logical_shelf_name = logical.shelf_name
                logical_shelf_id = logical.logical_shelf_id
            mapping_type = mapping.mapping_type
            mapping_version = mapping.version
            mapping_active = mapping.is_active

        result.append(
            PhysicalShelfResponse(
                physical_shelf_id=shelf.physical_shelf_id,
                location_code=shelf.location_code,
                location_name=shelf.location_name,
                description=shelf.description,
                nfc_tag_uid=shelf.nfc_tag_uid,
                is_active=shelf.is_active,
                created_at=shelf.created_at.isoformat() if shelf.created_at else None,
                updated_at=shelf.updated_at.isoformat() if shelf.updated_at else None,
                logical_shelf_name=logical_shelf_name,
                logical_shelf_id=logical_shelf_id,
                mapping_type=mapping_type,
                mapping_active=mapping_active,
                mapping_version=mapping_version,
            )
        )

    return PhysicalShelfListResponse(shelves=result, total=total)


@router.post("/", response_model=PhysicalShelfResponse, summary="创建物理书架")
async def create_physical_shelf(
    request: PhysicalShelfCreate,
    db: Session = Depends(get_db),
):
    """
    创建新的物理书架
    
    校验规则：
    - location_code 必须唯一
    - nfc_tag_uid 必须唯一（如果提供）
    """
    # 检查位置编码唯一性
    existing = (
        db.query(PhysicalShelf)
        .filter(PhysicalShelf.location_code == request.location_code)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"位置编码 '{request.location_code}' 已存在",
        )

    # 检查 NFC 标签唯一性
    if request.nfc_tag_uid:
        nfc_existing = (
            db.query(PhysicalShelf)
            .filter(PhysicalShelf.nfc_tag_uid == request.nfc_tag_uid)
            .first()
        )
        if nfc_existing:
            raise HTTPException(
                status_code=400,
                detail=f"NFC 标签 '{request.nfc_tag_uid}' 已被绑定到其他书架",
            )

    shelf = PhysicalShelf(
        location_code=request.location_code,
        location_name=request.location_name,
        description=request.description,
        nfc_tag_uid=request.nfc_tag_uid,
        is_active=True,
    )
    db.add(shelf)
    db.commit()
    db.refresh(shelf)

    return PhysicalShelfResponse(
        physical_shelf_id=shelf.physical_shelf_id,
        location_code=shelf.location_code,
        location_name=shelf.location_name,
        description=shelf.description,
        nfc_tag_uid=shelf.nfc_tag_uid,
        is_active=shelf.is_active,
        created_at=shelf.created_at.isoformat() if shelf.created_at else None,
        updated_at=shelf.updated_at.isoformat() if shelf.updated_at else None,
    )


@router.put("/{shelf_id}", response_model=PhysicalShelfResponse, summary="更新物理书架")
async def update_physical_shelf(
    shelf_id: int,
    request: PhysicalShelfUpdate,
    db: Session = Depends(get_db),
):
    """更新物理书架信息"""
    shelf = (
        db.query(PhysicalShelf)
        .filter(PhysicalShelf.physical_shelf_id == shelf_id)
        .first()
    )
    if not shelf:
        raise HTTPException(status_code=404, detail="物理书架不存在")

    # 更新字段
    if request.location_code is not None:
        # 检查唯一性
        existing = (
            db.query(PhysicalShelf)
            .filter(
                PhysicalShelf.location_code == request.location_code,
                PhysicalShelf.physical_shelf_id != shelf_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="位置编码已存在")
        shelf.location_code = request.location_code

    if request.location_name is not None:
        shelf.location_name = request.location_name

    if request.description is not None:
        shelf.description = request.description

    if request.is_active is not None:
        shelf.is_active = request.is_active

    shelf.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(shelf)

    return PhysicalShelfResponse(
        physical_shelf_id=shelf.physical_shelf_id,
        location_code=shelf.location_code,
        location_name=shelf.location_name,
        description=shelf.description,
        nfc_tag_uid=shelf.nfc_tag_uid,
        is_active=shelf.is_active,
        created_at=shelf.created_at.isoformat() if shelf.created_at else None,
        updated_at=shelf.updated_at.isoformat() if shelf.updated_at else None,
    )


@router.delete("/{shelf_id}", summary="删除物理书架")
async def delete_physical_shelf(
    shelf_id: int,
    db: Session = Depends(get_db),
):
    """删除物理书架（同时删除关联的映射）"""
    shelf = (
        db.query(PhysicalShelf)
        .filter(PhysicalShelf.physical_shelf_id == shelf_id)
        .first()
    )
    if not shelf:
        raise HTTPException(status_code=404, detail="物理书架不存在")

    # 删除关联的映射
    db.query(PhysicalLogicalMapping).filter(
        PhysicalLogicalMapping.physical_shelf_id == shelf_id
    ).delete()

    # 删除物理书架
    db.delete(shelf)
    db.commit()

    return {"success": True, "message": f"物理书架 '{shelf.location_name}' 已删除"}


@router.put("/{shelf_id}/nfc", summary="绑定 NFC 标签 UID")
async def bind_nfc_tag(
    shelf_id: int,
    request: NFCBindRequest,
    db: Session = Depends(get_db),
):
    """
    为物理书架绑定 NFC 标签 UID
    
    校验规则：
    - NFC 标签 UID 必须全局唯一
    - 物理书架必须存在
    """
    shelf = (
        db.query(PhysicalShelf)
        .filter(PhysicalShelf.physical_shelf_id == shelf_id)
        .first()
    )
    if not shelf:
        raise HTTPException(status_code=404, detail="物理书架不存在")

    # 检查 NFC 标签唯一性
    nfc_existing = (
        db.query(PhysicalShelf)
        .filter(
            PhysicalShelf.nfc_tag_uid == request.nfc_tag_uid,
            PhysicalShelf.physical_shelf_id != shelf_id,
        )
        .first()
    )
    if nfc_existing:
        raise HTTPException(
            status_code=400,
            detail=f"NFC 标签 '{request.nfc_tag_uid}' 已被绑定到 '{nfc_existing.location_name}'",
        )

    shelf.nfc_tag_uid = request.nfc_tag_uid
    shelf.updated_at = datetime.utcnow()
    db.commit()

    return {
        "success": True,
        "message": f"NFC 标签已绑定到 '{shelf.location_name}'",
        "nfc_tag_uid": request.nfc_tag_uid,
    }


@router.delete("/{shelf_id}/nfc", summary="解绑 NFC 标签 UID")
async def unbind_nfc_tag(
    shelf_id: int,
    db: Session = Depends(get_db),
):
    """解绑物理书架的 NFC 标签"""
    shelf = (
        db.query(PhysicalShelf)
        .filter(PhysicalShelf.physical_shelf_id == shelf_id)
        .first()
    )
    if not shelf:
        raise HTTPException(status_code=404, detail="物理书架不存在")

    old_uid = shelf.nfc_tag_uid
    shelf.nfc_tag_uid = None
    shelf.updated_at = datetime.utcnow()
    db.commit()

    return {
        "success": True,
        "message": f"NFC 标签 '{old_uid}' 已从 '{shelf.location_name}' 解绑",
    }


@router.get("/{shelf_id}/mappings", summary="获取物理书架映射关系")
async def get_shelf_mappings(
    shelf_id: int,
    db: Session = Depends(get_db),
):
    """获取指定物理书架的所有映射关系"""
    shelf = (
        db.query(PhysicalShelf)
        .filter(PhysicalShelf.physical_shelf_id == shelf_id)
        .first()
    )
    if not shelf:
        raise HTTPException(status_code=404, detail="物理书架不存在")

    mappings = (
        db.query(PhysicalLogicalMapping)
        .filter(PhysicalLogicalMapping.physical_shelf_id == shelf_id)
        .order_by(desc(PhysicalLogicalMapping.created_at))
        .all()
    )

    result = []
    for mapping in mappings:
        logical = (
            db.query(LogicalShelf)
            .filter(LogicalShelf.logical_shelf_id == mapping.logical_shelf_id)
            .first()
        )
        result.append({
            "mapping_id": mapping.mapping_id,
            "logical_shelf_id": mapping.logical_shelf_id,
            "logical_shelf_name": logical.shelf_name if logical else "已删除",
            "mapping_type": mapping.mapping_type,
            "is_active": mapping.is_active,
            "version": mapping.version,
            "created_at": mapping.created_at.isoformat() if mapping.created_at else None,
            "updated_at": mapping.updated_at.isoformat() if mapping.updated_at else None,
        })

    return {"physical_shelf": shelf.location_name, "mappings": result, "total": len(result)}