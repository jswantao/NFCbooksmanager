"""NFC 桥接 API 路由 — 仅路由注册、参数校验、调用 handlers (< 200 行)

所有业务逻辑下沉到 handlers/, 所有数据库操作下沉到 crud.py,
所有无状态工具下沉到 service.py。
"""

from __future__ import annotations

import secrets
from typing import Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import HTMLResponse

from app.api.nfc_bridge import service
from app.api.nfc_bridge.handlers import bind, info, scan, tasks
from app.api.nfc_bridge.schemas import (
    NfcTaskCreateRequest,
    NfcTaskListResponse,
    NfcTaskResponse,
)
from app.core.jinja_setup import render_template

router = APIRouter()


# ═══════════════════════════════════════════
# 写入任务
# ═══════════════════════════════════════════


@router.post("/write", response_model=NfcTaskResponse, summary="生成 NFC 写入数据")
async def write_nfc(req: NfcTaskCreateRequest) -> NfcTaskResponse:
    return await tasks.create_write_task(req)


@router.post("/write/unified", summary="统一 NFC 写入入口")
async def write_nfc_unified(req: NfcTaskCreateRequest) -> dict[str, Any]:
    return await tasks.create_unified_write_task(req)


# ═══════════════════════════════════════════
# 任务管理
# ═══════════════════════════════════════════


@router.get("/tasks", response_model=NfcTaskListResponse, summary="列出所有写入任务")
async def list_nfc_tasks() -> NfcTaskListResponse:
    return await tasks.list_tasks()


@router.get(
    "/tasks/{task_id}", response_model=NfcTaskResponse, summary="获取单个任务详情"
)
async def get_nfc_task(task_id: str) -> NfcTaskResponse:
    return await tasks.get_task(task_id)


@router.delete("/tasks/{task_id}", summary="删除任务")
async def delete_nfc_task(task_id: str) -> dict[str, Any]:
    return await tasks.delete_task(task_id)


# ═══════════════════════════════════════════
# 扫描回调
# ═══════════════════════════════════════════


@router.get("/callback", summary="NFC 扫描回调处理")
async def nfc_callback(request: Request):
    params = request.query_params
    return await scan.handle_callback(
        tag_uid=params.get("tagid", ""),
        raw_text=params.get("text", ""),
    )


# ═══════════════════════════════════════════
# 工具端点
# ═══════════════════════════════════════════


@router.get("/scan-link", summary="生成 NFC 扫描链接")
async def get_scan_link() -> dict[str, Any]:
    return {
        "scan_link": service.get_scan_link(),
        "local_ip": service.get_local_ip(),
        "frontend": service.get_frontend_url(),
    }


@router.get("/uid", summary="生成模拟 NFC UID")
async def generate_uid() -> dict[str, str]:
    return {"uid": ":".join(secrets.token_hex(1).upper() for _ in range(6))}


@router.get("/mobile", response_class=HTMLResponse, summary="手机端操作页面")
async def mobile_page() -> HTMLResponse:
    return HTMLResponse(
        content=render_template(
            "mobile.html",
            ip=service.get_local_ip(),
            scan_link=service.get_scan_link(),
            backend_port=service.BACKEND_PORT,
        )
    )


# ═══════════════════════════════════════════
# NFC 关联信息
# ═══════════════════════════════════════════


@router.get("/shelf-info/{shelf_id}", summary="获取书架的 NFC 写入信息")
async def get_shelf_nfc_info(shelf_id: int) -> dict[str, Any]:
    return await info.get_logical_shelf_nfc_info(shelf_id)


@router.get("/physical-info/{physical_id}", summary="获取物理书架的 NFC 信息")
async def get_physical_nfc_info(physical_id: int) -> dict[str, Any]:
    return await info.get_physical_shelf_nfc_info(physical_id)


# ═══════════════════════════════════════════
# 标签绑定
# ═══════════════════════════════════════════


@router.get(
    "/bind-page/{tag_uid}",
    response_class=HTMLResponse,
    summary="NFC 标签绑定页面",
)
async def nfc_bind_page(tag_uid: str) -> HTMLResponse:
    return bind.render_bind_page(tag_uid)


@router.get("/bind/auto", summary="自动绑定 NFC 标签（GET，兼容回调）")
async def auto_bind_get(
    tag_uid: str = Query(..., description="NFC 标签 UID"),
    location_code: str = Query(None, description="位置编码（可选）"),
):
    return await bind.auto_bind(tag_uid=tag_uid, location_code=location_code)


@router.post("/bind/auto", summary="自动绑定 NFC 标签（POST）")
async def auto_bind_post(
    tag_uid: str = Query(..., description="NFC 标签 UID"),
    physical_shelf_id: int = Query(None, description="指定物理书架 ID"),
):
    return await bind.auto_bind(tag_uid=tag_uid, physical_shelf_id=physical_shelf_id)


@router.get("/bind/search-shelves", summary="搜索可绑定的物理书架")
async def search_bindable_shelves(
    search: str = Query("", description="搜索关键词"),
    limit: int = Query(20, ge=1, le=100),
):
    return await bind.search_bindable_shelves(search=search, limit=limit)


# ═══════════════════════════════════════════
# 绑定逻辑书架（NFC 回调引导）
# ═══════════════════════════════════════════


@router.get("/bind-logical-shelf/{physical_shelf_id}")
async def bind_logical_shelf_page(
    physical_shelf_id: int,
    tag_uid: str = Query("", description="NFC 标签 UID"),
):
    return await bind.render_bind_logical_page(physical_shelf_id, tag_uid)


@router.post("/bind-logical-shelf/create")
async def create_bind_logical_shelf(
    physical_shelf_id: int = Query(..., description="物理书架 ID"),
    logical_shelf_id: int = Query(..., description="逻辑书架 ID"),
    tag_uid: str = Query("", description="NFC 标签 UID"),
):
    return await bind.create_logical_mapping(
        physical_shelf_id=physical_shelf_id,
        logical_shelf_id=logical_shelf_id,
        tag_uid=tag_uid,
    )
