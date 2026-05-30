"""NFC 写入任务业务编排

对应端点:
- POST   /write           : 简易写入任务创建
- POST   /write/unified   : 含物理书架信息的统一写入入口
- GET    /tasks           : 列出所有待写入任务
- GET    /tasks/{task_id} : 任务详情
- DELETE /tasks/{task_id} : 删除任务
"""

from __future__ import annotations

from typing import Any
import uuid

from fastapi import HTTPException
from loguru import logger

from app.api.nfc_bridge import crud, service
from app.api.nfc_bridge.schemas import (
    NfcTaskCreateRequest,
    NfcTaskListResponse,
    NfcTaskResponse,
)
from app.core.database import SyncSessionLocal, run_sync_db_block

# ==================== 公共辅助 ====================


def _task_to_response(task) -> NfcTaskResponse:
    """ORM → Pydantic 响应映射"""
    return NfcTaskResponse(
        task_id=task.task_id,
        shelf_id=task.shelf_id,
        shelf_name=task.shelf_name,
        payload=task.payload,
        created_at=task.created_at.isoformat() if task.created_at else "",
        expires_in=task.remaining_seconds,
    )


def _clean_expired() -> None:
    """同步清理过期任务 (由各端点入口调用)"""
    def _do():
        db = SyncSessionLocal()
        try:
            crud.clean_expired_tasks(db, service.get_current_time())
        finally:
            db.close()

    _do()


# ==================== 创建任务 ====================


async def create_write_task(req: NfcTaskCreateRequest) -> NfcTaskResponse:
    """POST /write — 校验书架存在 → 持久化任务"""
    _clean_expired()

    def _do():
        db = SyncSessionLocal()
        try:
            shelf = crud.get_active_logical_shelf(db, req.shelf_id)
            if not shelf:
                raise HTTPException(
                    status_code=404, detail=f"书架 #{req.shelf_id} 不存在或已停用"
                )

            task_id = str(uuid.uuid4())[:8]
            now = service.get_current_time()
            task = crud.insert_write_task(
                db,
                task_id=task_id,
                shelf_id=req.shelf_id,
                shelf_name=req.shelf_name or shelf.shelf_name,
                payload=service.build_shelf_payload(req.shelf_id),
                expires_at=now + (service.get_task_expires_at() - now),
            )
            db.commit()
            db.refresh(task)
            return _task_to_response(task)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    result = await run_sync_db_block(_do)
    logger.info(
        f"NFC 写入任务创建: {result.task_id} | 书架: {result.shelf_name} "
        f"(#{result.shelf_id})"
    )
    return result


async def create_unified_write_task(req: NfcTaskCreateRequest) -> dict[str, Any]:
    """POST /write/unified — 创建任务 + 附带物理书架关联信息

    ★ 已修复原版本 B2: 不再借用 FastAPI 请求 Session 跨线程, 自建 SyncSession 并显式 commit。
    """
    _clean_expired()

    def _do():
        db = SyncSessionLocal()
        try:
            logical_shelf = crud.get_active_logical_shelf(db, req.shelf_id)
            if not logical_shelf:
                raise HTTPException(status_code=404, detail="逻辑书架不存在")

            mapping = crud.get_active_mapping_by_logical(db, req.shelf_id)
            physical_shelf = (
                crud.get_physical_by_id(db, mapping.physical_shelf_id)
                if mapping
                else None
            )

            task_id = str(uuid.uuid4())[:8]
            now = service.get_current_time()
            payload = service.build_shelf_payload(req.shelf_id)

            crud.insert_write_task(
                db,
                task_id=task_id,
                shelf_id=req.shelf_id,
                shelf_name=req.shelf_name or logical_shelf.shelf_name,
                payload=payload,
                expires_at=service.get_task_expires_at(),
            )
            db.commit()

            return {
                "task_id": task_id,
                "shelf_id": req.shelf_id,
                "shelf_name": logical_shelf.shelf_name,
                "payload": payload,
                "created_at": now.isoformat(),
                "expires_in": service.TASK_EXPIRE_MINUTES * 60,
                "physical_shelf": (
                    {
                        "physical_shelf_id": physical_shelf.physical_shelf_id,
                        "location_code": physical_shelf.location_code,
                        "location_name": physical_shelf.location_name,
                        "nfc_tag_uid": physical_shelf.nfc_tag_uid,
                    }
                    if physical_shelf
                    else None
                ),
                "mapping_type": mapping.mapping_type if mapping else None,
                "nfc_bound": bool(physical_shelf and physical_shelf.nfc_tag_uid),
                "has_physical_mapping": bool(physical_shelf),
            }
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    return await run_sync_db_block(_do)


# ==================== 查询任务 ====================


async def list_tasks() -> NfcTaskListResponse:
    """GET /tasks"""
    _clean_expired()

    def _do():
        db = SyncSessionLocal()
        try:
            items = [_task_to_response(t) for t in crud.list_write_tasks(db)]
            return NfcTaskListResponse(tasks=items, total=len(items))
        finally:
            db.close()

    return await run_sync_db_block(_do)


async def get_task(task_id: str) -> NfcTaskResponse:
    """GET /tasks/{task_id}"""
    _clean_expired()

    def _do():
        db = SyncSessionLocal()
        try:
            task = crud.get_write_task(db, task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在或已过期")
            return _task_to_response(task)
        finally:
            db.close()

    return await run_sync_db_block(_do)


async def delete_task(task_id: str) -> dict[str, Any]:
    """DELETE /tasks/{task_id}"""

    def _do():
        db = SyncSessionLocal()
        try:
            affected = crud.delete_write_task(db, task_id)
            db.commit()
            if not affected:
                raise HTTPException(status_code=404, detail="任务不存在")
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    await run_sync_db_block(_do)
    return {"success": True, "message": "任务已删除"}
