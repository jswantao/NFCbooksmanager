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
import time
import uuid
import socket
import secrets
from typing import Optional, Dict, Any
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, unquote, parse_qs, urlparse

from loguru import logger
from sqlalchemy.orm import Session
from fastapi import Depends, APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from fastapi.responses import HTMLResponse, RedirectResponse

from app.core.database import SyncSessionLocal, run_sync_db_block, get_db
from app.utils.activity_logger import log_activity
from app.core.jinja_setup import render_template
from app.models.models import LogicalShelf, PhysicalShelf, PhysicalLogicalMapping, NfcWriteTask

router = APIRouter()

# ==================== 常量配置 ====================

TASK_EXPIRE_MINUTES = 30
POLLING_INTERVAL_MS = 3000
FRONTEND_DEV_PORT = 5173
BACKEND_PORT = 8000

# ==================== NFC 写入任务（持久化至数据库） ====================


def _get_current_time() -> datetime:
    """获取当前 UTC 时间"""
    return datetime.now(timezone.utc)


_cached_ip: Optional[str] = None
_ip_cache_time = 0.0


def _get_local_ip() -> str:
    """获取本机局域网 IP 地址（缓存 1 小时，避免重复创建 socket）"""
    global _cached_ip, _ip_cache_time
    now = time.monotonic()
    if _cached_ip is not None and (now - _ip_cache_time) < 3600:
        return _cached_ip
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        _cached_ip = sock.getsockname()[0]
        sock.close()
        _ip_cache_time = now
        return _cached_ip
    except Exception:
        return _cached_ip or "localhost"


def _get_frontend_url() -> str:
    """获取前端访问地址"""
    ip = _get_local_ip()
    return f"http://{ip}:{FRONTEND_DEV_PORT}"


def _clean_expired_tasks() -> None:
    """清理过期的写入任务（从数据库）"""
    db = SyncSessionLocal()
    try:
        now = _get_current_time()
        deleted = (
            db.query(NfcWriteTask)
            .filter(NfcWriteTask.expires_at < now)
            .delete()
        )
        db.commit()
        if deleted:
            logger.debug(f"清理了 {deleted} 个过期任务")
    finally:
        db.close()


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
    def _do_db_op_1():
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

    await run_sync_db_block(_do_db_op_1)

    payload = json.dumps({"shelf_id": req.shelf_id}, ensure_ascii=False)
    task_id = str(uuid.uuid4())[:8]
    now = _get_current_time()

    def _save_task():
        db = SyncSessionLocal()
        try:
            task = NfcWriteTask(
                task_id=task_id,
                shelf_id=req.shelf_id,
                shelf_name=req.shelf_name,
                payload=payload,
                expires_at=now + timedelta(minutes=TASK_EXPIRE_MINUTES),
            )
            db.add(task)
            db.commit()
        finally:
            db.close()

    await run_sync_db_block(_save_task)

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
async def unified_nfc_write(req: WriteReq, db: Session = Depends(get_db)):
    """统一的 NFC 写入入口"""
    _clean_expired_tasks()
    def _do_db_op_2():
        nonlocal db
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

                db_task = NfcWriteTask(
                    task_id=task_id,
                    shelf_id=req.shelf_id,
                    shelf_name=req.shelf_name or logical_shelf.shelf_name,
                    payload=payload,
                    expires_at=now + timedelta(minutes=TASK_EXPIRE_MINUTES),
                )
                db.add(db_task)
        
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
            pass

    return await run_sync_db_block(_do_db_op_2)


# ==================== 任务管理 ====================

@router.get("/tasks", summary="列出所有写入任务")
async def list_tasks() -> Dict[str, Any]:
    """获取当前所有有效的写入任务"""
    _clean_expired_tasks()
    def _do_list():
        db = SyncSessionLocal()
        try:
            tasks = db.query(NfcWriteTask).order_by(NfcWriteTask.created_at.desc()).all()
            items = []
            for t in tasks:
                items.append(WriteResponse(
                    task_id=t.task_id, shelf_id=t.shelf_id, shelf_name=t.shelf_name,
                    payload=t.payload, created_at=t.created_at.isoformat() if t.created_at else "",
                    expires_in=t.remaining_seconds,
                ))
            return {"tasks": items, "total": len(items)}
        finally:
            db.close()
    return await run_sync_db_block(_do_list)


@router.get("/tasks/{task_id}", summary="获取单个任务详情")
async def get_task(task_id: str) -> WriteResponse:
    """获取指定任务的详细信息"""
    _clean_expired_tasks()
    def _do_get():
        db = SyncSessionLocal()
        try:
            t = db.query(NfcWriteTask).filter(NfcWriteTask.task_id == task_id).first()
            if not t:
                raise HTTPException(status_code=404, detail="任务不存在或已过期")
            return WriteResponse(
                task_id=t.task_id, shelf_id=t.shelf_id, shelf_name=t.shelf_name,
                payload=t.payload, created_at=t.created_at.isoformat() if t.created_at else "",
                expires_in=t.remaining_seconds,
            )
        finally:
            db.close()
    return await run_sync_db_block(_do_get)


@router.delete("/tasks/{task_id}", summary="删除任务")
async def delete_task(task_id: str) -> Dict[str, Any]:
    """删除指定的写入任务"""
    def _do_delete():
        db = SyncSessionLocal()
        try:
            deleted = db.query(NfcWriteTask).filter(NfcWriteTask.task_id == task_id).delete()
            db.commit()
            if not deleted:
                raise HTTPException(status_code=404, detail="任务不存在")
        finally:
            db.close()
    await run_sync_db_block(_do_delete)
    return {"success": True, "message": "任务已删除"}


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
        def _do_db_op_3():
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

        return await run_sync_db_block(_do_db_op_3)

    # ==================== 第二级：根据 tag_uid 查找物理书架 ====================
    
    if tag_uid:
        def _do_db_op_4():
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

        return await run_sync_db_block(_do_db_op_4)

    # ==================== 无 tag_uid 且无 NDEF → 错误页面 ====================
    
    logger.warning("回调无 tag_uid 且无有效 NDEF 数据")
    return HTMLResponse(content=render_template("result.html",
        tag_id=tag_uid or "",
        success=False,
        shelf_id=None,
        shelf_name="",
        message="无法识别标签数据，请确认标签已正确写入",
        icon="&#10060;",
        color="#ef4444",
        status_text="扫描失败",
        shelf_url="",
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
    return HTMLResponse(content=render_template("mobile.html", ip=ip, scan_link=scan_link, backend_port=BACKEND_PORT))


# ==================== NFC 关联信息端点 ====================

@router.get("/shelf-info/{shelf_id}", summary="获取书架的 NFC 写入信息")
async def get_shelf_nfc_info(shelf_id: int):
    """获取指定逻辑书架的完整 NFC 信息"""
    def _do_db_op_5():
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

    return await run_sync_db_block(_do_db_op_5)


@router.get("/physical-info/{physical_id}", summary="获取物理书架的 NFC 信息")
async def get_physical_nfc_info(physical_id: int):
    """获取指定物理书架的 NFC 信息"""
    def _do_db_op_6():
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

    return await run_sync_db_block(_do_db_op_6)


# ==================== NFC 绑定端点 ====================

@router.get("/bind-page/{tag_uid}", response_class=HTMLResponse, summary="NFC 标签绑定页面")
async def nfc_bind_page(tag_uid: str):
    """手机端 NFC 标签绑定页面"""
    return HTMLResponse(content=render_template("bind.html", tag_uid=tag_uid))


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
    def _do_db_op_7():
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

    return await run_sync_db_block(_do_db_op_7)


@router.get("/bind/search-shelves", summary="搜索可绑定的物理书架")
async def search_bindable_shelves(
    search: str = Query("", description="搜索关键词"),
    limit: int = Query(20, ge=1, le=100),
):
    """搜索可用于绑定 NFC 标签的物理书架"""
    def _do_db_op_8():
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

    return await run_sync_db_block(_do_db_op_8)


# ==================== 绑定逻辑书架页面（NFC 回调引导） ====================


def _do_db_op_bind_logical_page(db, physical_shelf_id):
    """查询物理书架信息及可选逻辑书架列表"""
    from app.models.models import PhysicalShelf, LogicalShelf
    physical_shelf = (
        db.query(PhysicalShelf)
        .filter(PhysicalShelf.physical_shelf_id == physical_shelf_id)
        .first()
    )
    if not physical_shelf:
        return None, []
    logical_shelves = db.query(LogicalShelf).order_by(LogicalShelf.shelf_name).all()
    return physical_shelf, logical_shelves


@router.get("/bind-logical-shelf/{physical_shelf_id}")
async def bind_logical_shelf_page(
    physical_shelf_id: int,
    tag_uid: str = Query("", description="NFC 标签 UID"),
):
    """绑定逻辑书架页面（NFC 扫描后的引导页面）"""
    from app.core.jinja_setup import render_template as _render
    physical_shelf, logical_shelves = await run_sync_db_block(
        _do_db_op_bind_logical_page, physical_shelf_id
    )
    if not physical_shelf:
        return HTMLResponse("<h1>物理书架不存在</h1>", status_code=404)
    return HTMLResponse(
        _render("bind_logical.html", {
            "physical_shelf": {
                "id": physical_shelf.physical_shelf_id,
                "name": physical_shelf.shelf_name,
                "location": physical_shelf.location_name or "",
            },
            "logical_shelves": [
                {"id": s.logical_shelf_id, "name": s.shelf_name}
                for s in logical_shelves
            ],
            "tag_uid": tag_uid,
            "frontend_url": _get_frontend_url(),
        })
    )


def _do_db_op_create_bind(db, physical_shelf_id, logical_shelf_id, tag_uid):
    """创建物理-逻辑书架映射并绑定 NFC 标签"""
    from app.models.models import PhysicalShelf, PhysicalLogicalMapping
    physical_shelf = (
        db.query(PhysicalShelf)
        .filter(PhysicalShelf.physical_shelf_id == physical_shelf_id)
        .first()
    )
    if physical_shelf and not physical_shelf.nfc_tag_uid:
        physical_shelf.nfc_tag_uid = tag_uid
    existing = (
        db.query(PhysicalLogicalMapping)
        .filter(
            PhysicalLogicalMapping.physical_shelf_id == physical_shelf_id,
            PhysicalLogicalMapping.logical_shelf_id == logical_shelf_id,
        )
        .first()
    )
    if not existing:
        mapping = PhysicalLogicalMapping(
            physical_shelf_id=physical_shelf_id,
            logical_shelf_id=logical_shelf_id,
            mapping_type="one_to_one",
            is_active=True,
        )
        db.add(mapping)
        db.commit()
        return {"success": True, "mapping_id": mapping.mapping_id, "created": True}
    db.commit()
    return {"success": True, "mapping_id": existing.mapping_id, "created": False}


@router.post("/bind-logical-shelf/create")
async def create_bind_logical_shelf(
    physical_shelf_id: int = Query(..., description="物理书架 ID"),
    logical_shelf_id: int = Query(..., description="逻辑书架 ID"),
    tag_uid: str = Query("", description="NFC 标签 UID"),
):
    """创建物理-逻辑书架映射（从 NFC 引导页面提交）"""
    result = await run_sync_db_block(
        _do_db_op_create_bind, physical_shelf_id, logical_shelf_id, tag_uid
    )
    return result


# HTML templates migrated to app/templates/ (Jinja2)
