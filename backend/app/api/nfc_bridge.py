# backend/app/api/nfc_bridge.py
"""
NFC 桥接 API - 外模式核心接口

实现 NFC 标签与数字系统的交互入口。

核心端点：
- POST   /write              : 生成用于写入 NFC 标签的数据
- POST   /write/unified      : 统一 NFC 写入入口（含物理书架关联信息）
- GET    /tasks              : 列出所有待写入任务
- GET    /tasks/{id}         : 获取单个任务详情
- DELETE /tasks/{id}         : 删除任务
- GET    /callback           : NFC 扫描回调（NFC TOOLS PRO 等工具调用）
- GET    /scan-link          : 生成 NFC 扫描链接
- GET    /uid                : 生成模拟 NFC UID
- GET    /mobile             : 手机端操作页面
- GET    /shelf-info/{id}    : 获取书架的 NFC 写入信息
- GET    /physical-info/{id} : 获取物理书架的 NFC 信息
- GET    /bind-page/{tag_uid}: 手机端 NFC 标签绑定页面
- POST   /bind/auto          : 自动绑定 NFC 标签
- GET    /bind/search-shelves: 搜索可绑定的物理书架
- GET    /bind/auto          : 自动绑定 NFC 标签（GET，兼容回调）
"""

import json
import uuid
import socket
import logging
import secrets
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from urllib.parse import quote, unquote, parse_qs, urlparse

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from fastapi.responses import HTMLResponse, RedirectResponse

from app.core.database import SyncSessionLocal
from app.models.models import LogicalShelf, PhysicalShelf, PhysicalLogicalMapping

logger = logging.getLogger(__name__)
router = APIRouter()

# ==================== 常量配置 ====================

TASK_EXPIRE_MINUTES = 30
POLLING_INTERVAL_MS = 3000
FRONTEND_DEV_PORT = 5173
BACKEND_PORT = 8000

# ==================== 内存任务存储 ====================

_tasks: Dict[str, Dict[str, Any]] = {}


def _get_current_time() -> datetime:
    """获取当前 UTC 时间"""
    return datetime.utcnow()


def _get_local_ip() -> str:
    """获取本机局域网 IP 地址"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except Exception:
        return "localhost"


def _get_frontend_url() -> str:
    """获取前端访问地址"""
    ip = _get_local_ip()
    return f"http://{ip}:{FRONTEND_DEV_PORT}"


def _clean_expired_tasks() -> None:
    """清理过期的写入任务"""
    now = _get_current_time()
    expired_keys = [
        key
        for key, task in _tasks.items()
        if task.get("expires_at", now) < now
    ]
    for key in expired_keys:
        del _tasks[key]
    if expired_keys:
        logger.debug(f"清理了 {len(expired_keys)} 个过期任务")


# ==================== 请求/响应模型 ====================

class WriteReq(BaseModel):
    """NFC 写入请求（统一端点使用）"""
    shelf_id: int = Field(..., description="逻辑书架 ID")
    shelf_name: str = Field("", description="书架名称（用于展示）")


class WriteRequest(BaseModel):
    """NFC 写入请求"""
    shelf_id: int = Field(..., description="逻辑书架 ID")
    shelf_name: str = Field(..., description="书架名称（用于展示）")


class WriteResponse(BaseModel):
    """NFC 写入响应"""
    task_id: str = Field(..., description="任务唯一标识")
    shelf_id: int = Field(..., description="书架 ID")
    shelf_name: str = Field(..., description="书架名称")
    payload: str = Field(..., description="要写入 NFC 标签的 JSON 数据")
    created_at: str = Field(..., description="任务创建时间（ISO 格式）")
    expires_in: int = Field(..., description="剩余有效时间（秒）")


# ==================== 写入 API ====================

@router.post("/write", response_model=WriteResponse, summary="生成 NFC 写入数据")
async def write_nfc_data(req: WriteRequest) -> WriteResponse:
    """为指定书架生成 NFC 标签写入数据"""
    _clean_expired_tasks()
    db = SyncSessionLocal()
    try:
        shelf = (
            db.query(LogicalShelf)
            .filter(
                LogicalShelf.logical_shelf_id == req.shelf_id,
                LogicalShelf.is_active == True,
            )
            .first()
        )
        if not shelf:
            raise HTTPException(status_code=404, detail=f"书架 #{req.shelf_id} 不存在或已停用")
    finally:
        db.close()

    payload = json.dumps({"shelf_id": req.shelf_id}, ensure_ascii=False)
    task_id = str(uuid.uuid4())[:8]
    now = _get_current_time()

    _tasks[task_id] = {
        "task_id": task_id,
        "shelf_id": req.shelf_id,
        "shelf_name": req.shelf_name,
        "payload": payload,
        "created_at": now.isoformat(),
        "expires_at": now + timedelta(minutes=TASK_EXPIRE_MINUTES),
    }

    logger.info(f"NFC 写入任务创建: {task_id} | 书架: {req.shelf_name} (#{req.shelf_id})")

    return WriteResponse(
        task_id=task_id,
        shelf_id=req.shelf_id,
        shelf_name=req.shelf_name,
        payload=payload,
        created_at=now.isoformat(),
        expires_in=TASK_EXPIRE_MINUTES * 60,
    )


@router.post("/write/unified", summary="统一 NFC 写入入口")
async def unified_nfc_write(req: WriteReq):
    """统一的 NFC 写入入口"""
    _clean_expired_tasks()
    db = SyncSessionLocal()
    try:
        logical_shelf = (
            db.query(LogicalShelf)
            .filter(
                LogicalShelf.logical_shelf_id == req.shelf_id,
                LogicalShelf.is_active == True,
            )
            .first()
        )
        if not logical_shelf:
            raise HTTPException(status_code=404, detail="逻辑书架不存在")

        mapping = (
            db.query(PhysicalLogicalMapping)
            .filter(
                PhysicalLogicalMapping.logical_shelf_id == req.shelf_id,
                PhysicalLogicalMapping.is_active == True,
            )
            .first()
        )

        physical_shelf = None
        if mapping:
            physical_shelf = (
                db.query(PhysicalShelf)
                .filter(PhysicalShelf.physical_shelf_id == mapping.physical_shelf_id)
                .first()
            )

        payload = json.dumps({"shelf_id": req.shelf_id}, ensure_ascii=False)
        task_id = str(uuid.uuid4())[:8]
        now = _get_current_time()

        _tasks[task_id] = {
            "task_id": task_id,
            "shelf_id": req.shelf_id,
            "shelf_name": req.shelf_name or logical_shelf.shelf_name,
            "payload": payload,
            "created_at": now.isoformat(),
            "expires_at": now + timedelta(minutes=TASK_EXPIRE_MINUTES),
        }

        return {
            "task_id": task_id,
            "shelf_id": req.shelf_id,
            "shelf_name": logical_shelf.shelf_name,
            "payload": payload,
            "created_at": now.isoformat(),
            "expires_in": TASK_EXPIRE_MINUTES * 60,
            "physical_shelf": {
                "physical_shelf_id": physical_shelf.physical_shelf_id if physical_shelf else None,
                "location_code": physical_shelf.location_code if physical_shelf else None,
                "location_name": physical_shelf.location_name if physical_shelf else None,
                "nfc_tag_uid": physical_shelf.nfc_tag_uid if physical_shelf else None,
            } if physical_shelf else None,
            "mapping_type": mapping.mapping_type if mapping else None,
            "nfc_bound": bool(physical_shelf and physical_shelf.nfc_tag_uid),
            "has_physical_mapping": bool(physical_shelf),
        }
    finally:
        db.close()


# ==================== 任务管理 ====================

@router.get("/tasks", summary="列出所有写入任务")
async def list_tasks() -> Dict[str, Any]:
    """获取当前所有有效的写入任务"""
    _clean_expired_tasks()
    items = []
    for task_id, task in sorted(_tasks.items(), key=lambda x: x[1]["created_at"], reverse=True):
        remaining_seconds = max(0, int((task["expires_at"] - _get_current_time()).total_seconds()))
        items.append(WriteResponse(
            task_id=task_id, shelf_id=task["shelf_id"], shelf_name=task["shelf_name"],
            payload=task["payload"], created_at=task["created_at"], expires_in=remaining_seconds,
        ))
    return {"tasks": items, "total": len(items)}


@router.get("/tasks/{task_id}", summary="获取单个任务详情")
async def get_task(task_id: str) -> WriteResponse:
    """获取指定任务的详细信息"""
    _clean_expired_tasks()
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")
    remaining_seconds = max(0, int((task["expires_at"] - _get_current_time()).total_seconds()))
    return WriteResponse(
        task_id=task_id, shelf_id=task["shelf_id"], shelf_name=task["shelf_name"],
        payload=task["payload"], created_at=task["created_at"], expires_in=remaining_seconds,
    )


@router.delete("/tasks/{task_id}", summary="删除任务")
async def delete_task(task_id: str) -> Dict[str, Any]:
    """删除指定的写入任务"""
    if task_id in _tasks:
        del _tasks[task_id]
        return {"success": True, "message": "任务已删除"}
    raise HTTPException(status_code=404, detail="任务不存在")


# ==================== 扫描回调 ====================

@router.get("/callback", summary="NFC 扫描回调处理")
async def nfc_callback(request: Request):
    """
    处理 NFC TOOLS PRO 等工具的扫描回调
    
    四级判断逻辑：
    1. 解析 NDEF 文本中的 shelf_id → 验证逻辑书架 → 成功跳转
    2. 根据 tag_uid 查找物理书架 → 查找逻辑映射 → 成功跳转
    3. tag_uid 已绑定物理书架但无映射 → 跳转绑定逻辑书架页面
    4. tag_uid 未绑定 → 跳转绑定物理书架页面
    
    Args:
        request: FastAPI Request 对象
    
    Returns:
        - 成功：302 重定向到书架页面
        - 需绑定：302 重定向到对应绑定页面
        - 失败：HTML 错误页面
    """
    params = dict(request.query_params)
    tag_uid = params.get("tagid", "").strip()
    raw_text = params.get("text", "").strip()

    logger.info(f"📱 NFC 扫描回调 | tagid: {tag_uid} | text: {raw_text[:80] if raw_text else 'empty'}")

    # ==================== 第一级：解析 NDEF 中的 shelf_id ====================
    
    shelf_id_from_ndef = None
    
    if raw_text:
        raw_data = raw_text
        
        # 兼容旧版 nfc://write/?data= 格式
        if "nfc://write/?" in raw_data:
            try:
                parsed_url = urlparse(raw_data)
                query_params = parse_qs(parsed_url.query)
                encoded_data = query_params.get("data", [""])[0]
                if encoded_data:
                    raw_data = unquote(encoded_data)
            except Exception:
                pass
        
        # 解析 JSON 提取 shelf_id
        try:
            data = json.loads(raw_data)
            if isinstance(data, dict) and "shelf_id" in data:
                shelf_id_from_ndef = int(data["shelf_id"])
        except (json.JSONDecodeError, ValueError, TypeError):
            pass

    # ==================== 判断 1a：NDEF 中有 shelf_id → 验证逻辑书架 ====================
    
    if shelf_id_from_ndef is not None:
        db = SyncSessionLocal()
        try:
            logical_shelf = (
                db.query(LogicalShelf)
                .filter(
                    LogicalShelf.logical_shelf_id == shelf_id_from_ndef,
                    LogicalShelf.is_active == True,
                )
                .first()
            )
            if logical_shelf:
                # ✅ 成功：逻辑书架存在，直接跳转
                logger.info(f"✅ NDEF 解析成功 → 书架: {logical_shelf.shelf_name} (#{shelf_id_from_ndef})")
                return RedirectResponse(
                    url=f"{_get_frontend_url()}/shelf/{shelf_id_from_ndef}",
                    status_code=302,
                )
            
            # NDEF 中的书架不存在 → 继续第二级判断
            logger.warning(f"NDEF 中的书架 #{shelf_id_from_ndef} 不存在，尝试通过 tag_uid 查找")
        finally:
            db.close()

    # ==================== 第二级：根据 tag_uid 查找物理书架 ====================
    
    if tag_uid:
        db = SyncSessionLocal()
        try:
            # 查找绑定此 UID 的物理书架
            physical_shelf = (
                db.query(PhysicalShelf)
                .filter(PhysicalShelf.nfc_tag_uid == tag_uid)
                .first()
            )

            if physical_shelf:
                logger.info(f"🔍 找到物理书架: {physical_shelf.location_name} (#{physical_shelf.physical_shelf_id})")
                
                # ==================== 判断 2a：查找物理书架的激活映射 ====================
                
                mapping = (
                    db.query(PhysicalLogicalMapping)
                    .filter(
                        PhysicalLogicalMapping.physical_shelf_id == physical_shelf.physical_shelf_id,
                        PhysicalLogicalMapping.is_active == True,
                    )
                    .first()
                )

                if mapping:
                    # 验证逻辑书架存在
                    logical_shelf = (
                        db.query(LogicalShelf)
                        .filter(
                            LogicalShelf.logical_shelf_id == mapping.logical_shelf_id,
                            LogicalShelf.is_active == True,
                        )
                        .first()
                    )
                    
                    if logical_shelf:
                        # ✅ 成功：物理书架有激活映射，跳转到逻辑书架
                        logger.info(
                            f"✅ 通过物理书架映射 → "
                            f"{physical_shelf.location_name} → "
                            f"{logical_shelf.shelf_name} (#{logical_shelf.logical_shelf_id})"
                        )
                        return RedirectResponse(
                            url=f"{_get_frontend_url()}/shelf/{logical_shelf.logical_shelf_id}",
                            status_code=302,
                        )

                # ==================== 判断 3：物理书架已绑定但无映射 → 绑定逻辑书架 ====================
                
                logger.info(
                    f"📱 物理书架 '{physical_shelf.location_name}' 已绑定 UID 但无激活映射，"
                    f"跳转绑定逻辑书架页面"
                )
                return RedirectResponse(
                    url=f"/api/nfc/bind-logical-shelf/{physical_shelf.physical_shelf_id}?tag_uid={tag_uid}",
                    status_code=302,
                )

            # ==================== 判断 4：tag_uid 未绑定任何物理书架 ====================
            
            logger.info(f"📱 tag_uid '{tag_uid}' 未绑定，跳转绑定物理书架页面")
            return RedirectResponse(
                url=f"/api/nfc/bind-page/{tag_uid}",
                status_code=302,
            )

        finally:
            db.close()

    # ==================== 无 tag_uid 且无 NDEF → 错误页面 ====================
    
    logger.warning("回调无 tag_uid 且无有效 NDEF 数据")
    return HTMLResponse(content=_build_result_html(
        tag_id=tag_uid or "",
        success=False,
        shelf_id=None,
        shelf_name="",
        message="无法识别标签数据，请确认标签已正确写入",
    ))


# ==================== 工具端点 ====================

@router.get("/scan-link", summary="生成 NFC 扫描链接")
async def get_scan_link() -> Dict[str, Any]:
    """生成可用于 NFC TOOLS PRO 的扫描链接"""
    ip = _get_local_ip()
    callback_url = f"http://{ip}:{BACKEND_PORT}/api/nfc/callback?tagid={{TAG-ID}}&text={{NDEF-TEXT}}"
    scan_link = f"nfc://scan/?callback={quote(callback_url, safe='')}"
    return {"scan_link": scan_link, "local_ip": ip, "frontend": _get_frontend_url()}


@router.get("/uid", summary="生成模拟 NFC UID")
async def generate_uid() -> Dict[str, str]:
    """生成模拟的 NFC 标签 UID"""
    return {"uid": ":".join(secrets.token_hex(1).upper() for _ in range(6))}


@router.get("/mobile", response_class=HTMLResponse, summary="手机端操作页面")
async def mobile_page() -> HTMLResponse:
    """手机端 NFC 操作页面"""
    ip = _get_local_ip()
    callback_url = f"http://{ip}:{BACKEND_PORT}/api/nfc/callback?tagid={{TAG-ID}}&text={{NDEF-TEXT}}"
    scan_link = f"nfc://scan/?callback={quote(callback_url, safe='')}"
    return HTMLResponse(content=_build_mobile_html(ip, scan_link, POLLING_INTERVAL_MS))


# ==================== NFC 关联信息端点 ====================

@router.get("/shelf-info/{shelf_id}", summary="获取书架的 NFC 写入信息")
async def get_shelf_nfc_info(shelf_id: int):
    """获取指定逻辑书架的完整 NFC 信息"""
    db = SyncSessionLocal()
    try:
        logical_shelf = (
            db.query(LogicalShelf)
            .filter(LogicalShelf.logical_shelf_id == shelf_id, LogicalShelf.is_active == True)
            .first()
        )
        if not logical_shelf:
            raise HTTPException(status_code=404, detail="逻辑书架不存在")

        mapping = (
            db.query(PhysicalLogicalMapping)
            .filter(
                PhysicalLogicalMapping.logical_shelf_id == shelf_id,
                PhysicalLogicalMapping.is_active == True,
            )
            .first()
        )

        physical_shelf = None
        if mapping:
            physical_shelf = (
                db.query(PhysicalShelf)
                .filter(PhysicalShelf.physical_shelf_id == mapping.physical_shelf_id)
                .first()
            )

        return {
            "logical_shelf": {
                "logical_shelf_id": logical_shelf.logical_shelf_id,
                "shelf_name": logical_shelf.shelf_name,
                "description": logical_shelf.description,
            },
            "physical_shelf": {
                "physical_shelf_id": physical_shelf.physical_shelf_id if physical_shelf else None,
                "location_code": physical_shelf.location_code if physical_shelf else None,
                "location_name": physical_shelf.location_name if physical_shelf else None,
                "nfc_tag_uid": physical_shelf.nfc_tag_uid if physical_shelf else None,
            } if physical_shelf else None,
            "mapping": {
                "mapping_id": mapping.mapping_id if mapping else None,
                "mapping_type": mapping.mapping_type if mapping else None,
                "is_active": mapping.is_active if mapping else False,
                "version": mapping.version if mapping else None,
            } if mapping else None,
            "recommended_payload": json.dumps({"shelf_id": shelf_id}, ensure_ascii=False),
            "nfc_bound": bool(physical_shelf and physical_shelf.nfc_tag_uid),
        }
    finally:
        db.close()


@router.get("/physical-info/{physical_id}", summary="获取物理书架的 NFC 信息")
async def get_physical_nfc_info(physical_id: int):
    """获取指定物理书架的 NFC 信息"""
    db = SyncSessionLocal()
    try:
        physical_shelf = (
            db.query(PhysicalShelf)
            .filter(PhysicalShelf.physical_shelf_id == physical_id)
            .first()
        )
        if not physical_shelf:
            raise HTTPException(status_code=404, detail="物理书架不存在")

        mapping = (
            db.query(PhysicalLogicalMapping)
            .filter(
                PhysicalLogicalMapping.physical_shelf_id == physical_id,
                PhysicalLogicalMapping.is_active == True,
            )
            .first()
        )

        logical_shelf = None
        if mapping:
            logical_shelf = (
                db.query(LogicalShelf)
                .filter(LogicalShelf.logical_shelf_id == mapping.logical_shelf_id)
                .first()
            )

        return {
            "physical_shelf": {
                "physical_shelf_id": physical_shelf.physical_shelf_id,
                "location_code": physical_shelf.location_code,
                "location_name": physical_shelf.location_name,
                "description": physical_shelf.description,
                "nfc_tag_uid": physical_shelf.nfc_tag_uid,
                "is_active": physical_shelf.is_active,
            },
            "logical_shelf": {
                "logical_shelf_id": logical_shelf.logical_shelf_id if logical_shelf else None,
                "shelf_name": logical_shelf.shelf_name if logical_shelf else None,
                "book_count": len(logical_shelf.books) if logical_shelf else 0,
            } if logical_shelf else None,
            "mapping": {
                "mapping_id": mapping.mapping_id if mapping else None,
                "mapping_type": mapping.mapping_type if mapping else None,
                "is_active": mapping.is_active if mapping else False,
                "version": mapping.version if mapping else None,
            } if mapping else None,
            "nfc_bound": bool(physical_shelf.nfc_tag_uid),
            "can_write": bool(physical_shelf and logical_shelf),
        }
    finally:
        db.close()


# ==================== NFC 绑定端点 ====================

@router.get("/bind-page/{tag_uid}", response_class=HTMLResponse, summary="NFC 标签绑定页面")
async def nfc_bind_page(tag_uid: str):
    """手机端 NFC 标签绑定页面"""
    return HTMLResponse(content=_build_bind_html(tag_uid))


@router.get("/bind/auto", summary="自动绑定 NFC 标签（GET，兼容回调）")
async def auto_bind_nfc_get(
    tag_uid: str = Query(..., description="NFC 标签 UID"),
    location_code: str = Query(None, description="位置编码（可选，精准匹配）"),
):
    """GET 版本的自动绑定"""
    return await _auto_bind_nfc(tag_uid, None, location_code)


@router.post("/bind/auto", summary="自动绑定 NFC 标签（POST）")
async def auto_bind_nfc_post(
    tag_uid: str = Query(..., description="NFC 标签 UID"),
    physical_shelf_id: int = Query(None, description="指定物理书架 ID"),
):
    """POST 版本的自动绑定，支持指定书架 ID"""
    return await _auto_bind_nfc(tag_uid, physical_shelf_id, None)


async def _auto_bind_nfc(tag_uid: str, physical_shelf_id: int = None, location_code: str = None):
    """自动绑定 NFC 标签核心逻辑"""
    db = SyncSessionLocal()
    try:
        # 1. 检查 UID 是否已绑定
        existing = db.query(PhysicalShelf).filter(PhysicalShelf.nfc_tag_uid == tag_uid).first()
        if existing:
            if physical_shelf_id and existing.physical_shelf_id == physical_shelf_id:
                return {
                    "success": True,
                    "message": "NFC 标签已绑定到此书架",
                    "bound_shelf": {
                        "physical_shelf_id": existing.physical_shelf_id,
                        "location_name": existing.location_name,
                    },
                }
            return {
                "success": False,
                "already_bound": True,
                "message": f"已绑定到 '{existing.location_name}'",
                "bound_shelf": {
                    "physical_shelf_id": existing.physical_shelf_id,
                    "location_name": existing.location_name,
                    "location_code": existing.location_code,
                },
                "suggestion": "如需更换绑定，请先在物理书架管理中解绑",
            }

        # 2. 查找目标书架
        target_shelf = None
        if physical_shelf_id:
            target_shelf = db.query(PhysicalShelf).filter(
                PhysicalShelf.physical_shelf_id == physical_shelf_id
            ).first()
        elif location_code:
            target_shelf = db.query(PhysicalShelf).filter(
                PhysicalShelf.location_code == location_code
            ).first()
        else:
            target_shelf = db.query(PhysicalShelf).filter(
                PhysicalShelf.nfc_tag_uid == None
            ).order_by(PhysicalShelf.location_code).first()

        if not target_shelf:
            return {
                "success": False,
                "already_bound": False,
                "message": "没有可绑定的物理书架，请先创建物理书架",
                "suggestion": "前往物理书架管理页面创建",
            }

        # 3. 执行绑定
        target_shelf.nfc_tag_uid = tag_uid
        target_shelf.updated_at = datetime.utcnow()
        db.commit()

        # 查找关联的逻辑书架
        mapping = db.query(PhysicalLogicalMapping).filter(
            PhysicalLogicalMapping.physical_shelf_id == target_shelf.physical_shelf_id,
            PhysicalLogicalMapping.is_active == True,
        ).first()

        logical_info = None
        if mapping:
            logical_shelf = db.query(LogicalShelf).filter(
                LogicalShelf.logical_shelf_id == mapping.logical_shelf_id
            ).first()
            if logical_shelf:
                logical_info = {
                    "logical_shelf_id": logical_shelf.logical_shelf_id,
                    "shelf_name": logical_shelf.shelf_name,
                }

        return {
            "success": True,
            "message": f"已绑定到 '{target_shelf.location_name}'",
            "bound_shelf": {
                "physical_shelf_id": target_shelf.physical_shelf_id,
                "location_name": target_shelf.location_name,
                "location_code": target_shelf.location_code,
                "nfc_tag_uid": tag_uid,
                "logical_shelf": logical_info,
            },
            "redirect_url": f"{_get_frontend_url()}/admin/physical-shelves",
        }
    except Exception as e:
        db.rollback()
        logger.error(f"NFC 自动绑定失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.get("/bind/search-shelves", summary="搜索可绑定的物理书架")
async def search_bindable_shelves(
    search: str = Query("", description="搜索关键词"),
    limit: int = Query(20, ge=1, le=100),
):
    """搜索可用于绑定 NFC 标签的物理书架"""
    db = SyncSessionLocal()
    try:
        query = db.query(PhysicalShelf).filter(PhysicalShelf.is_active == True)
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                PhysicalShelf.location_code.ilike(search_term)
                | PhysicalShelf.location_name.ilike(search_term)
            )
        shelves = query.order_by(
            PhysicalShelf.nfc_tag_uid.is_(None).desc(),
            PhysicalShelf.location_code,
        ).limit(limit).all()

        return {
            "shelves": [
                {
                    "physical_shelf_id": s.physical_shelf_id,
                    "location_code": s.location_code,
                    "location_name": s.location_name,
                    "nfc_tag_uid": s.nfc_tag_uid,
                    "description": s.description,
                    "is_bound": bool(s.nfc_tag_uid),
                }
                for s in shelves
            ],
            "total": len(shelves),
        }
    finally:
        db.close()


# ==================== HTML 页面构建 ====================

def _build_result_html(tag_id: str, success: bool, shelf_id: Optional[int], shelf_name: str, message: str) -> str:
    """构建扫描结果 HTML 页面"""
    icon = "✅" if success else "❌"
    color = "#22c55e" if success else "#ef4444"
    frontend_url = _get_frontend_url()
    shelf_url = f"{frontend_url}/shelf/{shelf_id}" if shelf_id else ""

    redirect_meta = ""
    action_button = ""
    if success and shelf_url:
        redirect_meta = f'<meta http-equiv="refresh" content="1;url={shelf_url}">'
        action_button = f'<a href="{shelf_url}" class="btn bs">📚 查看书架（自动跳转中...）</a>'

    tag_row = f'<div class="r"><span class="l">🏷️ 标签</span><span class="v">{tag_id}</span></div>' if tag_id else ""
    shelf_row = f'<div class="r"><span class="l">📚 书架</span><span class="v">#{shelf_id} {shelf_name}</span></div>' if success else ""

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>NFC 扫描结果</title>
{redirect_meta}
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;background:#fdf8f4;color:#2c1810;padding:20px;max-width:500px;margin:0 auto}}
.c{{background:#fff;border-radius:16px;padding:24px;margin-bottom:16px;box-shadow:0 2px 12px rgba(139,69,19,.1)}}
.h{{text-align:center;font-size:56px;margin-bottom:12px}}
.t{{font-size:24px;font-weight:700;text-align:center;color:{color};margin-bottom:8px}}
.m{{text-align:center;color:#6b5e56;font-size:15px;margin-bottom:20px}}
.r{{display:flex;padding:12px 0;border-bottom:1px solid #f0e4d8}}
.l{{font-size:13px;color:#8c7b72;width:80px;flex-shrink:0}}
.v{{font-size:14px;word-break:break-all;font-family:monospace}}
.btn{{display:block;width:100%;padding:16px;border-radius:12px;border:none;font-size:17px;font-weight:600;text-decoration:none;text-align:center;margin-top:12px}}
.bp{{background:#8B4513;color:#fff}}
.bs{{background:#22c55e;color:#fff}}
</style>
</head>
<body>
<div class="c">
<div class="h">{icon}</div>
<div class="t">{'扫描成功' if success else '扫描失败'}</div>
<div class="m">{message}</div>
{tag_row}
{shelf_row}
</div>
{action_button}
<a href="/api/nfc/mobile" class="btn bp">📱 返回</a>
</body>
</html>"""


def _build_mobile_html(ip: str, scan_link: str, polling_ms: int) -> str:
    """构建手机端 NFC 操作页面"""
    return """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#8B4513">
<title>📚 NFC 书房管理</title>
<style>
:root{--p:#8B4513;--bg:#fdf8f4;--c:#fff;--t:#2c1810;--ts:#8c7b72;--b:#e8d5c8;--s:#22c55e;--r:14px;--rs:10px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;background:var(--bg);color:var(--t);min-height:100vh;padding-bottom:20px}
.hd{background:linear-gradient(135deg,#8B4513,#a0522d);color:#fff;padding:24px 16px;text-align:center;position:sticky;top:0;z-index:100;box-shadow:0 2px 16px rgba(139,69,19,.3)}
.hd .lo{font-size:40px;display:block;margin-bottom:6px}
.hd h1{font-size:20px;font-weight:700}
.hd .ip{font-size:11px;opacity:.8;margin-top:4px}
.mn{padding:14px;max-width:500px;margin:0 auto}
.cd{background:var(--c);border-radius:var(--r);padding:18px;margin-bottom:14px;box-shadow:0 2px 8px rgba(139,69,19,.06);border:1px solid var(--b)}
.cd h3{font-size:16px;color:var(--p);margin-bottom:14px;display:flex;align-items:center;gap:8px;padding-bottom:10px;border-bottom:1px solid var(--b)}
.big{display:block;width:100%;padding:18px;border:none;border-radius:var(--r);font-size:17px;font-weight:700;text-decoration:none;text-align:center;margin-bottom:12px;cursor:pointer}
.bsn{background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;box-shadow:0 4px 16px rgba(59,130,246,.35)}
.bt{display:block;width:100%;padding:14px;border-radius:var(--rs);border:none;font-size:15px;font-weight:600;cursor:pointer;text-align:center;margin-bottom:8px;-webkit-appearance:none}
.bt-p{background:var(--p);color:#fff}
.bt-s{background:var(--s);color:#fff}
.bt-o{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}
.steps{background:var(--c);border-radius:var(--r);padding:16px;margin-bottom:14px;border:1px solid #fde68a;background:#fffbeb}
.steps h4{font-size:14px;color:#92400e;margin-bottom:10px}
.steps ol{margin:0;padding-left:18px;font-size:13px;color:#78716c;line-height:1.8;list-style-type:decimal}
</style>
</head>
<body>
<div class="hd"><span class="lo">📚</span><h1>NFC 书房管理</h1><div class="ip">🔗 """ + ip + """:""" + str(BACKEND_PORT) + """</div></div>
<div class="mn">
<a href='""" + scan_link + """' class="big bsn">📡 点击扫描 NFC 标签</a>

<div class="steps">
<h4>📱 操作说明</h4>
<ol>
<li>点击上方「扫描 NFC 标签」按钮</li>
<li>将手机贴近 NFC 标签</li>
<li>自动跳转到对应书架或绑定页面</li>
</ol>
</div>

<div class="cd">
<h3>🏷️ 标签功能</h3>
<div style="font-size:13px;color:var(--t);line-height:1.8">
<p><strong>已写入数据 + 已绑定物理书架：</strong><br>扫描 → 自动跳转对应书架</p>
<p style="margin-top:8px"><strong>已绑定物理书架但无映射：</strong><br>扫描 → 选择逻辑书架建立映射</p>
<p style="margin-top:8px"><strong>未绑定任何书架（空白标签）：</strong><br>扫描 → 选择物理书架进行绑定</p>
</div>
</div>

<div class="cd">
<h3>📝 写入标签数据</h3>
<div style="font-size:13px;color:var(--ts);line-height:1.8;margin-bottom:12px">
如需写入数据到空白标签，请使用 <strong>NFC TOOLS PRO</strong> 手动写入以下格式的 JSON：
</div>
<div style="background:#f5f5f4;padding:12px;border-radius:6px;font-family:monospace;font-size:13px;color:#374151;word-break:break-all;margin-bottom:12px">
<code>{"shelf_id": 1}</code>
</div>
<button class="bt bt-s" onclick="copyExample()">📋 复制示例数据</button>
<button class="bt bt-o" onclick="goToShelfList()">📚 查看书架列表（获取 ID）</button>
</div>
</div>

<script>
var A = window.location.origin;

function copyText(text){
    if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(text);
    return new Promise(function(resolve,reject){
        try{
            var t=document.createElement('textarea');t.value=text;
            t.style.position='fixed';t.style.left='-9999px';t.style.top='-9999px';t.style.opacity='0';
            document.body.appendChild(t);t.contentEditable='true';t.readOnly=false;
            var r=document.createRange();r.selectNodeContents(t);var s=window.getSelection();
            s.removeAllRanges();s.addRange(r);t.setSelectionRange(0,999999);
            var ok=document.execCommand('copy');document.body.removeChild(t);s.removeAllRanges();
            if(ok)resolve();else reject(new Error('复制失败'));
        }catch(e){reject(e)}
    })
}

function copyExample(){
    copyText('{"shelf_id": 1}').then(function(){
        alert('✅ 已复制！请打开 NFC TOOLS PRO → 写 → 写数据 → 粘贴');
    }).catch(function(){
        alert('❌ 复制失败，请手动复制上方文本');
    });
}

function goToShelfList(){
    var frontendUrl = A.replace(':8000', ':5173');
    if (frontendUrl === A) { frontendUrl = A + ':5173'; }
    window.location.href = frontendUrl + '/shelf/1';
}
</script>
</body></html>"""


def _build_bind_html(tag_uid: str) -> str:
    """构建手机端 NFC 绑定页面（物理书架绑定）"""
    return """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#8B4513">
<title>📱 NFC 标签绑定</title>
<style>
:root{--p:#8B4513;--bg:#fdf8f4;--c:#fff;--t:#2c1810;--ts:#8c7b72;--b:#e8d5c8;--s:#22c55e;--r:14px;--rs:10px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;background:var(--bg);color:var(--t);min-height:100vh}
.hd{background:linear-gradient(135deg,#8B4513,#a0522d);color:#fff;padding:20px 16px;text-align:center;position:sticky;top:0;z-index:100}
.hd .lo{font-size:36px;display:block;margin-bottom:6px}
.hd h1{font-size:18px;font-weight:700}
.mn{padding:14px;max-width:500px;margin:0 auto}
.info{background:#eff6ff;border:1px solid #bfdbfe;border-radius:var(--rs);padding:16px;margin-bottom:16px}
.info .label{font-size:12px;color:var(--ts);margin-bottom:4px}
.info .value{font-size:15px;font-weight:600;color:#1d4ed8;word-break:break-all}
.info .hint{font-size:12px;color:var(--ts);margin-top:8px;padding:8px;background:#fff;border-radius:6px;line-height:1.6}
.bt{display:block;width:100%;padding:14px;border-radius:var(--rs);border:none;font-size:15px;font-weight:600;cursor:pointer;text-align:center;margin-bottom:8px;-webkit-appearance:none}
.bt-p{background:var(--p);color:#fff}
.bt-s{background:var(--s);color:#fff}
.bt-g{background:#f59e0b;color:#fff}
.bt-o{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}
.si{display:flex;align-items:center;justify-content:space-between;padding:12px;border:1px solid var(--b);border-radius:var(--rs);margin-bottom:8px;background:#fafaf9;cursor:pointer;transition:all .15s}
.si:active{background:#f0fdf4;border-color:#bbf7d0}
.si .sn{font-weight:600;font-size:14px}
.si .sc{font-size:12px;color:var(--ts)}
.si .st{font-size:11px}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:500}
.badge-free{background:#f0fdf4;color:#166534}
.badge-bound{background:#fef2f2;color:#991b1b}
.srch{margin-bottom:12px}
.srch input{width:100%;padding:12px;border:1px solid var(--b);border-radius:var(--rs);font-size:14px;outline:none;-webkit-appearance:none}
.srch input:focus{border-color:var(--p);box-shadow:0 0 0 3px rgba(139,69,19,.1)}
.emp{text-align:center;padding:40px 20px;color:var(--ts)}
.emp .icn{font-size:36px;display:block;margin-bottom:8px;opacity:.5}
.toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:10px 20px;border-radius:20px;font-size:13px;z-index:9999;animation:tIn .3s ease}
@keyframes tIn{from{opacity:0;transform:translateX(-50%) translateY(-16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.loading{text-align:center;padding:40px}
.spinner{display:inline-block;width:32px;height:32px;border:3px solid #e8d5c8;border-top:3px solid #8B4513;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.flow{background:#fffbeb;border:1px solid #fde68a;border-radius:var(--rs);padding:12px;margin-bottom:16px}
.flow .title{font-size:13px;font-weight:600;color:#92400e;margin-bottom:8px}
.flow ol{margin:0;padding-left:18px;font-size:12px;color:#78716c;line-height:1.8}
</style>
</head>
<body>
<div class="hd"><span class="lo">🏷️</span><h1>绑定物理书架</h1></div>
<div class="mn">
<div class="info">
<div class="label">扫描到的 NFC 标签 UID</div>
<div class="value" id="uidDisplay">""" + tag_uid + """</div>
</div>

<div class="flow">
<div class="title">📋 操作流程</div>
<ol>
<li>在下方的书架列表中选择一个物理书架</li>
<li>点击即可将标签 UID 绑定到该书架</li>
<li>绑定后扫描此标签将自动跳转到对应的逻辑书架</li>
<li>点击「自动绑定」将绑定到第一个可用的物理书架</li>
</ol>
</div>

<div class="srch">
<input type="text" id="searchInput" placeholder="🔍 搜索物理书架（位置编码/名称）..." oninput="searchShelves()">
</div>

<div id="shelfList">
<div class="loading"><div class="spinner"></div><p style="margin-top:12px;color:var(--ts)">加载可绑定的书架...</p></div>
</div>

<div style="margin-top:16px">
<button class="bt bt-p" onclick="autoBind()">🤖 自动绑定（推荐）</button>
<button class="bt bt-o" onclick="goToCreateShelf()">📝 创建新物理书架</button>
<button class="bt bt-g" onclick="retryScan()">📡 重新扫描</button>
</div>
</div>

<script>
var TAG_UID = '""" + tag_uid + """';
var A = window.location.origin;
var allShelves = [];

/**
 * 显示 Toast 提示
 */
function tx(m) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = m;
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 2500);
}

/**
 * 加载可绑定的物理书架列表
 * 优先显示未绑定 NFC 的书架
 */
function loadShelves(search) {
    var url = A + '/api/nfc/bind/search-shelves?limit=50';
    if (search) url += '&search=' + encodeURIComponent(search);
    
    fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(d) {
            allShelves = d.shelves || [];
            renderShelves(allShelves);
        })
        .catch(function() {
            document.getElementById('shelfList').innerHTML = 
                '<div class="emp"><span class="icn">❌</span>加载失败<br><span style="font-size:12px;color:var(--ts)">请检查网络连接</span></div>';
        });
}

/**
 * 搜索书架
 */
function searchShelves() {
    var keyword = document.getElementById('searchInput').value;
    loadShelves(keyword);
}

/**
 * 渲染书架列表
 */
function renderShelves(shelves) {
    var el = document.getElementById('shelfList');
    
    if (shelves.length === 0) {
        el.innerHTML = '<div class="emp"><span class="icn">📭</span>暂无可绑定的书架<br><span style="font-size:12px;color:var(--ts)">请先创建物理书架</span></div>';
        return;
    }
    
    el.innerHTML = shelves.map(function(s) {
        var badge = s.is_bound 
            ? '<span class="badge badge-bound">已绑定: ' + (s.nfc_tag_uid || '').substring(0, 14) + '...</span>'
            : '<span class="badge badge-free">可绑定</span>';
        
        return '<div class="si" onclick="bindShelf(' + s.physical_shelf_id + ', ' + s.is_bound + ')">' +
            '<div style="flex:1;min-width:0">' +
                '<div class="sn">📍 ' + escapeHtml(s.location_name) + '</div>' +
                '<div class="sc">' + escapeHtml(s.location_code) + 
                    (s.description ? ' · ' + escapeHtml(s.description.substring(0, 30)) : '') + 
                '</div>' +
            '</div>' +
            '<div class="st" style="flex-shrink:0;margin-left:8px">' + badge + '</div>' +
        '</div>';
    }).join('');
}

/**
 * HTML 转义（防止 XSS）
 */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * 绑定到指定物理书架
 * @param {number} shelfId - 物理书架 ID
 * @param {boolean} isBound - 是否已绑定（用于确认提示）
 */
function bindShelf(shelfId, isBound) {
    if (isBound) {
        if (!confirm('该书架已绑定 NFC 标签，是否覆盖绑定？')) return;
    }
    
    showLoading('正在绑定...');
    
    fetch(A + '/api/nfc/bind/auto?tag_uid=' + encodeURIComponent(TAG_UID) + '&physical_shelf_id=' + shelfId, {
        method: 'POST'
    })
        .then(function(r) { return r.json(); })
        .then(function(d) {
            if (d.success) {
                // 绑定成功 → 检查是否有映射
                document.getElementById('shelfList').innerHTML = 
                    '<div class="emp">' +
                        '<span class="icn">✅</span>' +
                        '<strong>' + d.message + '</strong>' +
                        '<br><span style="font-size:13px;color:var(--ts)">书架: ' + escapeHtml(d.bound_shelf.location_name) + '</span>' +
                        (d.bound_shelf.logical_shelf 
                            ? '<br><span style="font-size:13px;color:#166534">📚 已关联逻辑书架: ' + escapeHtml(d.bound_shelf.logical_shelf.shelf_name) + '</span>'
                            : '<br><span style="font-size:13px;color:#f59e0b">⚠️ 尚未关联逻辑书架</span>'
                        ) +
                        '<br><br><button class="bt bt-s" onclick="goToShelf(' + 
                            (d.bound_shelf.logical_shelf ? d.bound_shelf.logical_shelf.logical_shelf_id : d.bound_shelf.physical_shelf_id) + 
                            ', ' + (d.bound_shelf.logical_shelf ? 'true' : 'false') + 
                        ')">📚 查看书架</button>' +
                        '<button class="bt bt-o" onclick="location.reload()">🔄 继续绑定</button>' +
                    '</div>';
                tx('✅ 绑定成功！');
            } else {
                hideLoading();
                loadShelves();
                if (d.already_bound) {
                    tx('⚠️ ' + d.message);
                } else {
                    tx('❌ ' + d.message);
                }
            }
        })
        .catch(function() {
            hideLoading();
            loadShelves();
            tx('❌ 绑定失败，请重试');
        });
}

/**
 * 自动绑定到第一个可用的物理书架
 */
function autoBind() {
    showLoading('正在自动绑定...');
    
    fetch(A + '/api/nfc/bind/auto?tag_uid=' + encodeURIComponent(TAG_UID))
        .then(function(r) { return r.json(); })
        .then(function(d) {
            if (d.success) {
                document.getElementById('shelfList').innerHTML = 
                    '<div class="emp">' +
                        '<span class="icn">✅</span>' +
                        '<strong>' + d.message + '</strong>' +
                        '<br><span style="font-size:13px;color:var(--ts)">书架: ' + escapeHtml(d.bound_shelf.location_name) + '</span>' +
                        (d.bound_shelf.logical_shelf 
                            ? '<br><span style="font-size:13px;color:#166534">📚 已关联逻辑书架: ' + escapeHtml(d.bound_shelf.logical_shelf.shelf_name) + '</span>'
                            : '<br><span style="font-size:13px;color:#f59e0b">⚠️ 尚未关联逻辑书架，请前往管理页面创建映射</span>'
                        ) +
                        '<br><br><button class="bt bt-s" onclick="goToShelf(' + 
                            (d.bound_shelf.logical_shelf ? d.bound_shelf.logical_shelf.logical_shelf_id : d.bound_shelf.physical_shelf_id) + 
                            ', ' + (d.bound_shelf.logical_shelf ? 'true' : 'false') + 
                        ')">📚 查看书架</button>' +
                        '<button class="bt bt-o" onclick="goToManager()">📋 管理页面</button>' +
                    '</div>';
                tx('✅ 自动绑定成功！');
            } else if (d.already_bound) {
                // 已绑定到其他书架
                document.getElementById('shelfList').innerHTML = 
                    '<div class="emp">' +
                        '<span class="icn">⚠️</span>' +
                        '<strong>' + d.message + '</strong>' +
                        '<br><span style="font-size:12px;color:var(--ts)">如需更换请手动选择书架</span>' +
                        '<br><br><button class="bt bt-o" onclick="loadShelves();showShelfList()">📋 手动选择</button>' +
                    '</div>';
            } else {
                hideLoading();
                loadShelves();
                tx('💡 ' + d.message);
            }
        })
        .catch(function() {
            hideLoading();
            loadShelves();
            tx('❌ 自动绑定失败，请手动选择书架');
        });
}

/**
 * 跳转到书架页面
 * @param {number} id - 书架 ID
 * @param {boolean} isLogical - 是否是逻辑书架
 */
function goToShelf(id, isLogical) {
    var frontendUrl = getFrontendUrl();
    if (isLogical) {
        window.location.href = frontendUrl + '/shelf/' + id;
    } else {
        window.location.href = frontendUrl + '/admin/physical-shelves';
    }
}

/**
 * 跳转到管理页面
 */
function goToManager() {
    window.location.href = getFrontendUrl() + '/admin/physical-shelves';
}

/**
 * 跳转到创建物理书架页面
 */
function goToCreateShelf() {
    window.location.href = getFrontendUrl() + '/admin/physical-shelves';
}

/**
 * 重新扫描 NFC 标签
 */
function retryScan() {
    // 返回到 NFC 手机端主页
    window.location.href = A + '/api/nfc/mobile';
}

/**
 * 获取前端 URL
 * 自动处理 localhost 和局域网 IP 的情况
 */
function getFrontendUrl() {
    // 尝试将后端端口替换为前端端口
    var frontendUrl = A.replace(':8000', ':5173');
    
    // 如果替换失败（不是 8000 端口），尝试从 URL 构建
    if (frontendUrl === A) {
        var parts = A.split(':');
        if (parts.length >= 3) {
            // 移除最后一个端口部分，添加前端端口
            parts.pop();
            frontendUrl = parts.join(':') + ':5173';
        } else {
            // 默认格式
            frontendUrl = A + ':5173';
        }
    }
    
    return frontendUrl;
}

/**
 * 显示加载中状态
 * @param {string} text - 加载提示文字
 */
function showLoading(text) {
    text = text || '加载中...';
    document.getElementById('shelfList').innerHTML = 
        '<div class="loading"><div class="spinner"></div><p style="margin-top:12px;color:var(--ts)">' + text + '</p></div>';
}

/**
 * 隐藏加载中状态
 */
function hideLoading() {
    // 由 loadShelves 或 renderShelves 自动覆盖
}

/**
 * 显示书架列表区域（从结果页返回时使用）
 */
function showShelfList() {
    // 由 loadShelves 自动调用 renderShelves
}

// 初始加载
loadShelves();
</script>
</body></html>"""

@router.get("/bind-logical-shelf/{physical_id}", response_class=HTMLResponse, summary="绑定逻辑书架页面")
async def bind_logical_shelf_page(
    physical_id: int,
    tag_uid: str = Query("", description="NFC 标签 UID"),
):
    """
    物理书架已绑定 UID 但无逻辑映射时，跳转到此页面选择/创建逻辑书架
    
    Args:
        physical_id: 物理书架 ID
        tag_uid: NFC 标签 UID（用于确认和追踪）
    """
    db = SyncSessionLocal()
    try:
        physical_shelf = (
            db.query(PhysicalShelf)
            .filter(PhysicalShelf.physical_shelf_id == physical_id)
            .first()
        )
        if not physical_shelf:
            return HTMLResponse(content=_build_error_html("物理书架不存在"))
        
        # 获取所有逻辑书架
        logical_shelves = (
            db.query(LogicalShelf)
            .filter(LogicalShelf.is_active == True)
            .order_by(LogicalShelf.shelf_name)
            .all()
        )
        
        return HTMLResponse(content=_build_bind_logical_html(
            physical_shelf=physical_shelf,
            logical_shelves=logical_shelves,
            tag_uid=tag_uid,
        ))
    finally:
        db.close()


@router.post("/bind-logical-shelf/create", summary="创建映射并绑定逻辑书架")
async def create_logical_mapping(
    physical_shelf_id: int = Query(..., description="物理书架 ID"),
    logical_shelf_id: int = Query(..., description="逻辑书架 ID"),
    tag_uid: str = Query("", description="NFC 标签 UID"),
):
    """
    为物理书架创建到逻辑书架的映射
    
    返回重定向 URL，前端自动跳转到书架页面
    """
    db = SyncSessionLocal()
    try:
        # 检查是否已有激活映射
        existing = (
            db.query(PhysicalLogicalMapping)
            .filter(
                PhysicalLogicalMapping.physical_shelf_id == physical_shelf_id,
                PhysicalLogicalMapping.is_active == True,
            )
            .first()
        )
        
        if existing:
            # 如果已有映射但指向不同的逻辑书架，先禁用旧映射
            if existing.logical_shelf_id != logical_shelf_id:
                existing.is_active = False
                existing.updated_at = datetime.utcnow()
                db.add(existing)
            else:
                # 已是相同映射，直接返回成功
                return {
                    "success": True,
                    "message": "映射已存在",
                    "redirect_url": f"{_get_frontend_url()}/shelf/{logical_shelf_id}",
                }

        # 创建新映射
        new_mapping = PhysicalLogicalMapping(
            physical_shelf_id=physical_shelf_id,
            logical_shelf_id=logical_shelf_id,
            mapping_type="one_to_one",
            is_active=True,
            version=1,
        )
        db.add(new_mapping)
        db.commit()

        logger.info(
            f"✅ 映射创建成功: 物理书架 #{physical_shelf_id} → 逻辑书架 #{logical_shelf_id}"
        )

        return {
            "success": True,
            "message": "映射创建成功",
            "redirect_url": f"{_get_frontend_url()}/shelf/{logical_shelf_id}",
        }
    except Exception as e:
        db.rollback()
        logger.error(f"创建映射失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


def _build_bind_logical_html(physical_shelf, logical_shelves, tag_uid: str) -> str:
    """构建绑定逻辑书架页面 HTML"""
    shelves_json = json.dumps([
        {
            "logical_shelf_id": s.logical_shelf_id,
            "shelf_name": s.shelf_name,
            "description": s.description or "",
            "book_count": len(s.books) if hasattr(s, 'books') else 0,
        }
        for s in logical_shelves
    ], ensure_ascii=False)

    return """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#8B4513">
<title>📚 绑定逻辑书架</title>
<style>
:root{--p:#8B4513;--bg:#fdf8f4;--c:#fff;--t:#2c1810;--ts:#8c7b72;--b:#e8d5c8;--s:#22c55e;--r:14px;--rs:10px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;background:var(--bg);color:var(--t);min-height:100vh}
.hd{background:linear-gradient(135deg,#8B4513,#a0522d);color:#fff;padding:20px 16px;text-align:center;position:sticky;top:0;z-index:100}
.hd .lo{font-size:36px;display:block;margin-bottom:6px}
.hd h1{font-size:18px;font-weight:700}
.mn{padding:14px;max-width:500px;margin:0 auto}
.info{background:#eff6ff;border:1px solid #bfdbfe;border-radius:var(--rs);padding:16px;margin-bottom:16px}
.info .label{font-size:12px;color:var(--ts);margin-bottom:4px}
.info .value{font-size:15px;font-weight:600;color:#1d4ed8}
.info .hint{font-size:12px;color:var(--ts);margin-top:8px;padding:8px;background:#fff;border-radius:6px}
.bt{display:block;width:100%;padding:14px;border-radius:var(--rs);border:none;font-size:15px;font-weight:600;cursor:pointer;text-align:center;margin-bottom:8px}
.bt-p{background:var(--p);color:#fff}
.bt-s{background:var(--s);color:#fff}
.bt-o{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}
.si{display:flex;align-items:center;justify-content:space-between;padding:12px;border:1px solid var(--b);border-radius:var(--rs);margin-bottom:8px;background:#fafaf9;cursor:pointer;transition:all .15s}
.si:active{background:#f0fdf4;border-color:#bbf7d0}
.si .sn{font-weight:600;font-size:14px}
.si .sc{font-size:12px;color:var(--ts)}
.si .count{font-size:12px;color:var(--p);font-weight:600}
.srch{margin-bottom:12px}
.srch input{width:100%;padding:12px;border:1px solid var(--b);border-radius:var(--rs);font-size:14px;outline:none}
.srch input:focus{border-color:var(--p)}
.emp{text-align:center;padding:40px 20px;color:var(--ts)}
.toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:10px 20px;border-radius:20px;font-size:13px;z-index:9999;animation:tIn .3s ease}
@keyframes tIn{from{opacity:0;transform:translateX(-50%) translateY(-16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.loading{text-align:center;padding:40px}
.spinner{display:inline-block;width:32px;height:32px;border:3px solid #e8d5c8;border-top:3px solid #8B4513;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="hd"><span class="lo">🔗</span><h1>绑定逻辑书架</h1></div>
<div class="mn">
<div class="info">
<div class="label">物理书架</div>
<div class="value">📍 """ + physical_shelf.location_name + """</div>
<div style="font-size:12px;color:var(--ts);margin-top:4px">""" + physical_shelf.location_code + """</div>
<div class="hint">💡 请选择一个逻辑书架与此物理书架关联。扫描此 NFC 标签将自动跳转到对应的逻辑书架。</div>
</div>

<div class="srch">
<input type="text" id="searchInput" placeholder="🔍 搜索逻辑书架..." oninput="filterShelves()">
</div>

<div id="shelfList"></div>

<div style="margin-top:16px">
<button class="bt bt-o" onclick="goToCreate()">📝 创建新逻辑书架</button>
</div>
</div>

<script>
var PHYSICAL_ID = """ + str(physical_shelf.physical_shelf_id) + """;
var TAG_UID = '""" + tag_uid + """';
var A = window.location.origin;
var ALL_SHELVES = """ + shelves_json + """;

function tx(m){var t=document.createElement('div');t.className='toast';t.textContent=m;document.body.appendChild(t);setTimeout(function(){t.remove()},2500)}

function filterShelves(){
    var kw=(document.getElementById('searchInput').value||'').toLowerCase();
    var filtered=ALL_SHELVES.filter(function(s){
        return !kw||s.shelf_name.toLowerCase().includes(kw)||(s.description||'').toLowerCase().includes(kw)
    });
    renderShelves(filtered)
}

function renderShelves(shelves){
    var el=document.getElementById('shelfList');
    if(shelves.length===0){el.innerHTML='<div class="emp">📭 未找到匹配的逻辑书架</div>';return}
    el.innerHTML=shelves.map(function(s){
        return '<div class="si" onclick="bindLogical('+s.logical_shelf_id+',\''+s.shelf_name+'\')"><div><div class="sn">📚 '+s.shelf_name+'</div>'+(s.description?'<div class="sc">'+s.description+'</div>':'')+'</div><div class="count">'+s.book_count+' 本</div></div>'
    }).join('')
}

function bindLogical(logicalId, name){
    if(!confirm('确定将物理书架绑定到「'+name+'」？'))return;
    showLoading();
    var url=A+'/api/nfc/bind-logical-shelf/create?physical_shelf_id='+PHYSICAL_ID+'&logical_shelf_id='+logicalId+'&tag_uid='+encodeURIComponent(TAG_UID);
    fetch(url,{method:'POST'}).then(function(r){return r.json()}).then(function(d){
        if(d.success&&d.redirect_url){window.location.href=d.redirect_url.replace(':8000',':5173')}
        else{hideLoading();renderShelves(ALL_SHELVES);tx('❌ '+d.message)}
    }).catch(function(){hideLoading();renderShelves(ALL_SHELVES);tx('❌ 绑定失败')})
}

function goToCreate(){window.location.href=A.replace(':8000',':5173')+'/admin/shelves'}
function showLoading(){document.getElementById('shelfList').innerHTML='<div class="loading"><div class="spinner"></div></div>'}
function hideLoading(){}
renderShelves(ALL_SHELVES);
</script>
</body></html>"""


def _build_error_html(message: str) -> str:
    """构建错误页面 HTML"""
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>错误</title>
<style>
body{{font-family:sans-serif;background:#fdf8f4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}}
.c{{text-align:center;padding:40px;background:#fff;border-radius:16px;box-shadow:0 2px 12px rgba(139,69,19,.1);max-width:400px}}
.icn{{font-size:48px;margin-bottom:12px}}
h2{{color:#8B4513;margin:0 0 8px}}
p{{color:#8c7b72;margin:0}}
</style>
</head>
<body>
<div class="c">
<div class="icn">❌</div>
<h2>操作失败</h2>
<p>{message}</p>
</div>
</body>
</html>"""