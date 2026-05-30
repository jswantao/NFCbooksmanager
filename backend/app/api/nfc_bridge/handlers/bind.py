"""NFC 标签绑定 / 自动绑定 / 引导页

对应端点:
- GET  /bind-page/{tag_uid}                      : 手机端引导页
- GET  /bind/auto                                : 自动绑定 (GET)
- POST /bind/auto                                : 自动绑定 (POST)
- GET  /bind/search-shelves                      : 搜索可绑定物理书架
- GET  /bind-logical-shelf/{physical_shelf_id}   : 绑定逻辑书架引导页
- POST /bind-logical-shelf/create                : 创建物理-逻辑映射
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from fastapi.responses import HTMLResponse
from loguru import logger

from app.api.nfc_bridge import crud, service
from app.core.database import SyncSessionLocal, run_sync_db_block
from app.core.jinja_setup import render_template

# ==================== HTML 引导页 ====================


def render_bind_page(tag_uid: str) -> HTMLResponse:
    """GET /bind-page/{tag_uid} — 手机端绑定引导页"""
    return HTMLResponse(content=render_template("bind.html", tag_uid=tag_uid))


async def render_bind_logical_page(
    physical_shelf_id: int, tag_uid: str = ""
) -> HTMLResponse:
    """GET /bind-logical-shelf/{physical_shelf_id} — 绑定逻辑书架引导页

    ★ 已修复 B4: 使用真实存在的 location_name / location_code 字段
       (PhysicalShelf 没有 shelf_name 字段)。
    ★ 已修复 B5: render_template 使用关键字参数, 而非位置 dict。
    """

    def _do():
        db = SyncSessionLocal()
        try:
            physical = crud.get_physical_by_id(db, physical_shelf_id)
            if not physical:
                return None
            logical_shelves = crud.list_all_logical_shelves(db)
            # 关键: 在 session 关闭前提取所需字段, 避免 detached instance
            return {
                "physical": {
                    "id": physical.physical_shelf_id,
                    "name": physical.location_name,
                    "location": physical.location_code or "",
                },
                "logical_shelves": [
                    {"id": s.logical_shelf_id, "name": s.shelf_name}
                    for s in logical_shelves
                ],
            }
        finally:
            db.close()

    data = await run_sync_db_block(_do)
    if data is None:
        return HTMLResponse("<h1>物理书架不存在</h1>", status_code=404)

    return HTMLResponse(
        render_template(
            "bind_logical.html",
            physical_shelf=data["physical"],
            logical_shelves=data["logical_shelves"],
            tag_uid=tag_uid,
            frontend_url=service.get_frontend_url(),
        )
    )


# ==================== 自动绑定 ====================


async def auto_bind(
    tag_uid: str,
    physical_shelf_id: int | None = None,
    location_code: str | None = None,
) -> dict[str, Any]:
    """自动绑定 NFC 标签到物理书架

    优先级:
      1. 已绑定 → 返回 already_bound 信息
      2. 指定 physical_shelf_id → 精确绑定
      3. 指定 location_code → 按编码绑定
      4. 都未指定 → 自动选择第一个未绑定的物理书架
    """

    def _do():
        db = SyncSessionLocal()
        try:
            # 1. 检查是否已绑定
            existing = crud.get_physical_by_tag_uid(db, tag_uid)
            if existing:
                if (
                    physical_shelf_id
                    and existing.physical_shelf_id == physical_shelf_id
                ):
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
                    "suggestion": "如需更换绑定, 请先在物理书架管理中解绑",
                }

            # 2. 查找目标书架
            if physical_shelf_id:
                target = crud.get_physical_by_id(db, physical_shelf_id)
            elif location_code:
                target = crud.get_physical_by_location_code(db, location_code)
            else:
                target = crud.find_first_unbound_physical(db)

            if not target:
                return {
                    "success": False,
                    "already_bound": False,
                    "message": "没有可绑定的物理书架, 请先创建物理书架",
                    "suggestion": "前往物理书架管理页面创建",
                }

            # 3. 执行绑定 (★ 修复 B3: 使用 aware datetime)
            crud.bind_tag_to_physical(target, tag_uid, service.get_current_time())
            db.commit()

            # 4. 附带关联的逻辑书架
            mapping = crud.get_active_mapping_by_physical(
                db, target.physical_shelf_id
            )
            logical_info = None
            if mapping:
                logical = crud.get_active_logical_shelf(db, mapping.logical_shelf_id)
                if logical:
                    logical_info = {
                        "logical_shelf_id": logical.logical_shelf_id,
                        "shelf_name": logical.shelf_name,
                    }

            return {
                "success": True,
                "message": f"已绑定到 '{target.location_name}'",
                "bound_shelf": {
                    "physical_shelf_id": target.physical_shelf_id,
                    "location_name": target.location_name,
                    "location_code": target.location_code,
                    "nfc_tag_uid": tag_uid,
                    "logical_shelf": logical_info,
                },
                "redirect_url": (
                    f"{service.get_frontend_url()}/admin/physical-shelves"
                ),
            }
        except Exception as e:
            db.rollback()
            logger.error(f"NFC 自动绑定失败: {e}")
            raise HTTPException(status_code=500, detail=str(e)) from e
        finally:
            db.close()

    return await run_sync_db_block(_do)


# ==================== 搜索 ====================


async def search_bindable_shelves(search: str = "", limit: int = 20) -> dict[str, Any]:
    """GET /bind/search-shelves — 搜索可用于绑定的物理书架"""

    def _do():
        db = SyncSessionLocal()
        try:
            shelves = crud.search_physical_shelves(db, search=search, limit=limit)
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

    return await run_sync_db_block(_do)


# ==================== 创建映射 ====================


async def create_logical_mapping(
    physical_shelf_id: int, logical_shelf_id: int, tag_uid: str = ""
) -> dict[str, Any]:
    """POST /bind-logical-shelf/create — 创建物理-逻辑映射

    顺带: 如果物理书架尚未绑定 tag_uid, 同时完成绑定。
    """

    def _do():
        db = SyncSessionLocal()
        try:
            # 顺带绑定 NFC (仅当物理书架尚未绑定且传入了 tag_uid)
            physical = crud.get_physical_by_id(db, physical_shelf_id)
            if physical and tag_uid and not physical.nfc_tag_uid:
                crud.bind_tag_to_physical(
                    physical, tag_uid, service.get_current_time()
                )

            mapping, created = crud.create_mapping_if_absent(
                db, physical_shelf_id, logical_shelf_id
            )
            db.commit()
            return {
                "success": True,
                "mapping_id": mapping.mapping_id,
                "created": created,
            }
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    return await run_sync_db_block(_do)
