# backend/app/api/mapping.py
"""
映射管理 API - 中间模式核心接口

管理物理书架与逻辑书架之间的映射关系。

核心端点：
- POST   /resolve  : 根据位置编码解析映射关系（NFC 扫描后调用）
- GET    /list     : 列出所有映射关系
- POST   /create   : 创建新的映射关系
- PUT    /{id}/toggle : 启用/禁用映射

数据流向（三级模式）：
1. NFC 标签读取 → location_code
2. POST /resolve → 查找 PhysicalShelf → 查找激活映射 → 返回 LogicalShelf 信息
3. 前端根据 logical_shelf_id 请求书架图书列表

业务规则：
- 一个物理书架同一时刻只能有一条激活映射
- 创建新映射前需先禁用旧映射
- 禁用/启用操作会增加版本号（用于前端检测刷新）
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import (
    PhysicalShelf,
    LogicalShelf,
    PhysicalLogicalMapping,
)
from app.schemas.schemas import (
    MappingResolveRequest,
    MappingResolveResponse,
)

router = APIRouter()


# ==================== 映射解析 ====================

@router.post(
    "/resolve",
    response_model=MappingResolveResponse,
    summary="解析位置编码到逻辑书架",
)
async def resolve_mapping(
    req: MappingResolveRequest,
    db: Session = Depends(get_db),
) -> MappingResolveResponse:
    """
    根据物理位置编码解析对应的逻辑书架
    
    这是 NFC 扫描后的核心入口：
    NFC 标签读取 → location_code → 解析 → 逻辑书架信息
    
    查询步骤：
    1. 根据 location_code 查找 PhysicalShelf
    2. 查找该物理书架的激活映射
    3. 查找映射对应的 LogicalShelf
    
    异常处理：
    - 404: 物理书架不存在（location_code 无效）
    - 404: 未绑定逻辑书架（物理书架存在但无激活映射）
    - 404: 逻辑书架不存在（映射指向的书架已被删除）
    
    Args:
        req: 包含 location_code 的请求体
    
    Returns:
        映射解析结果（逻辑书架 ID、名称、物理位置等）
    
    Raises:
        HTTPException 404: 物理书架不存在或未绑定
    """
    # 第一步：查找物理书架
    physical_shelf = (
        db.query(PhysicalShelf)
        .filter(PhysicalShelf.location_code == req.location_code)
        .first()
    )
    if not physical_shelf:
        raise HTTPException(
            status_code=404,
            detail=f"物理书架 '{req.location_code}' 不存在",
        )
    
    # 第二步：查找激活映射
    mapping = (
        db.query(PhysicalLogicalMapping)
        .filter(
            PhysicalLogicalMapping.physical_shelf_id == physical_shelf.physical_shelf_id,
            PhysicalLogicalMapping.is_active == True,
        )
        .first()
    )
    if not mapping:
        raise HTTPException(
            status_code=404,
            detail=f"物理书架 '{physical_shelf.location_name}' 尚未绑定逻辑书架",
        )
    
    # 第三步：查找逻辑书架
    logical_shelf = (
        db.query(LogicalShelf)
        .filter(LogicalShelf.logical_shelf_id == mapping.logical_shelf_id)
        .first()
    )
    if not logical_shelf:
        raise HTTPException(
            status_code=404,
            detail="映射指向的逻辑书架不存在，请检查数据完整性",
        )
    
    return MappingResolveResponse(
        logical_shelf_id=logical_shelf.logical_shelf_id,
        logical_shelf_name=logical_shelf.shelf_name,
        physical_location=physical_shelf.location_name,
        mapping_type=mapping.mapping_type,
        version=mapping.version,
    )


# ==================== 映射列表 ====================

@router.get("/list", summary="列出所有映射关系")
async def list_mappings(
    db: Session = Depends(get_db),
):
    """
    获取所有映射关系列表
    
    用于管理界面展示和配置。
    通过 JOIN 查询获取物理/逻辑书架的友好名称。
    
    注意：
    - 物理书架或逻辑书架被删除后，映射记录可能仍存在（外键 ondelete=CASCADE 配置）
    - 此处使用防御性编码，处理可能为 NULL 的书架信息
    
    Returns:
        映射关系列表，包含物理位置和逻辑书架信息
    """
    mappings = db.query(PhysicalLogicalMapping).all()
    
    result = []
    for mapping in mappings:
        # 获取物理书架信息（防御性查询）
        physical_shelf = (
            db.query(PhysicalShelf)
            .filter(
                PhysicalShelf.physical_shelf_id == mapping.physical_shelf_id
            )
            .first()
        )
        
        # 获取逻辑书架信息（防御性查询）
        logical_shelf = (
            db.query(LogicalShelf)
            .filter(
                LogicalShelf.logical_shelf_id == mapping.logical_shelf_id
            )
            .first()
        )
        
        result.append({
            "mapping_id": mapping.mapping_id,
            "physical_location": (
                physical_shelf.location_name
                if physical_shelf else "?"
            ),
            "physical_code": (
                physical_shelf.location_code
                if physical_shelf else "?"
            ),
            "logical_shelf": (
                logical_shelf.shelf_name
                if logical_shelf else "?"
            ),
            "mapping_type": mapping.mapping_type,
            "is_active": mapping.is_active,
            "version": mapping.version,
            "created_at": (
                mapping.created_at.isoformat()
                if mapping.created_at else None
            ),
            "updated_at": (
                mapping.updated_at.isoformat()
                if mapping.updated_at else None
            ),
        })
    
    return result


# ==================== 创建映射 ====================

@router.post("/create", summary="创建映射关系")
async def create_mapping(
    physical_shelf_id: int = Query(
        ...,
        description="物理书架 ID",
    ),
    logical_shelf_id: int = Query(
        ...,
        description="逻辑书架 ID",
    ),
    mapping_type: str = Query(
        "one_to_one",
        description="映射类型: one_to_one / one_to_many",
    ),
    db: Session = Depends(get_db),
):
    """
    创建物理书架与逻辑书架的映射关系
    
    业务规则：
    - 一个物理书架同一时刻只能有一条激活映射
    - 创建前自动检查并阻止重复绑定
    
    创建步骤：
    1. 检查物理书架是否已有激活映射
    2. 创建新的映射记录（is_active=True, version=1）
    
    Args:
        physical_shelf_id: 物理书架 ID
        logical_shelf_id: 逻辑书架 ID
        mapping_type: 映射类型
    
    Returns:
        创建结果和映射 ID
    
    Raises:
        HTTPException 400: 该物理书架已有激活映射
    """
    # 检查是否已存在激活映射
    existing = (
        db.query(PhysicalLogicalMapping)
        .filter(
            PhysicalLogicalMapping.physical_shelf_id == physical_shelf_id,
            PhysicalLogicalMapping.is_active == True,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=(
                "该物理书架已有激活映射，请先禁用现有映射后再创建新映射"
            ),
        )
    
    # 创建新映射
    mapping = PhysicalLogicalMapping(
        physical_shelf_id=physical_shelf_id,
        logical_shelf_id=logical_shelf_id,
        mapping_type=mapping_type,
        is_active=True,
        version=1,
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    
    return {
        "success": True,
        "mapping_id": mapping.mapping_id,
        "message": "映射创建成功",
    }


# ==================== 映射启用/禁用 ====================

@router.put("/{mapping_id}/toggle", summary="启用/禁用映射")
async def toggle_mapping(
    mapping_id: int,
    db: Session = Depends(get_db),
):
    """
    切换映射的激活状态（启用 ↔ 禁用）
    
    操作效果：
    - 启用 → 禁用：NFC 扫描将无法解析到此逻辑书架
    - 禁用 → 启用：恢复映射关系（版本号 + 1）
    
    版本号管理：
    - 每次状态切换版本号自动递增
    - 前端可通过版本号变化检测是否需要刷新数据
    
    Args:
        mapping_id: 映射 ID
    
    Returns:
        操作结果和新的激活状态
    
    Raises:
        HTTPException 404: 映射不存在
    """
    mapping = (
        db.query(PhysicalLogicalMapping)
        .filter(PhysicalLogicalMapping.mapping_id == mapping_id)
        .first()
    )
    if not mapping:
        raise HTTPException(status_code=404, detail="映射不存在")
    
    # 切换状态
    mapping.is_active = not mapping.is_active
    
    # 递增版本号
    mapping.version += 1
    
    db.commit()
    
    status_text = "启用" if mapping.is_active else "禁用"
    
    return {
        "success": True,
        "is_active": mapping.is_active,
        "version": mapping.version,
        "message": f"映射已{status_text}（版本: {mapping.version}）",
    }