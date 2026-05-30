"""NFC 关联信息查询

对应端点:
- GET /shelf-info/{shelf_id}        : 逻辑书架的完整 NFC 信息
- GET /physical-info/{physical_id}  : 物理书架的完整 NFC 信息
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from app.api.nfc_bridge import crud, service
from app.core.database import SyncSessionLocal, run_sync_db_block


async def get_logical_shelf_nfc_info(shelf_id: int) -> dict[str, Any]:
    """GET /shelf-info/{shelf_id}"""

    def _do():
        db = SyncSessionLocal()
        try:
            logical = crud.get_active_logical_shelf(db, shelf_id)
            if not logical:
                raise HTTPException(status_code=404, detail="逻辑书架不存在")

            mapping = crud.get_active_mapping_by_logical(db, shelf_id)
            physical = (
                crud.get_physical_by_id(db, mapping.physical_shelf_id)
                if mapping
                else None
            )

            return {
                "logical_shelf": {
                    "logical_shelf_id": logical.logical_shelf_id,
                    "shelf_name": logical.shelf_name,
                    "description": logical.description,
                },
                "physical_shelf": (
                    {
                        "physical_shelf_id": physical.physical_shelf_id,
                        "location_code": physical.location_code,
                        "location_name": physical.location_name,
                        "nfc_tag_uid": physical.nfc_tag_uid,
                    }
                    if physical
                    else None
                ),
                "mapping": (
                    {
                        "mapping_id": mapping.mapping_id,
                        "mapping_type": mapping.mapping_type,
                        "is_active": mapping.is_active,
                        "version": mapping.version,
                    }
                    if mapping
                    else None
                ),
                "recommended_payload": service.build_shelf_payload(shelf_id),
                "nfc_bound": bool(physical and physical.nfc_tag_uid),
            }
        finally:
            db.close()

    return await run_sync_db_block(_do)


async def get_physical_shelf_nfc_info(physical_id: int) -> dict[str, Any]:
    """GET /physical-info/{physical_id}"""

    def _do():
        db = SyncSessionLocal()
        try:
            physical = crud.get_physical_by_id(db, physical_id)
            if not physical:
                raise HTTPException(status_code=404, detail="物理书架不存在")

            mapping = crud.get_active_mapping_by_physical(db, physical_id)
            logical = (
                crud.get_active_logical_shelf(db, mapping.logical_shelf_id)
                if mapping
                else None
            )

            return {
                "physical_shelf": {
                    "physical_shelf_id": physical.physical_shelf_id,
                    "location_code": physical.location_code,
                    "location_name": physical.location_name,
                    "description": physical.description,
                    "nfc_tag_uid": physical.nfc_tag_uid,
                    "is_active": physical.is_active,
                },
                "logical_shelf": (
                    {
                        "logical_shelf_id": logical.logical_shelf_id,
                        "shelf_name": logical.shelf_name,
                        "book_count": len(logical.books) if logical.books else 0,
                    }
                    if logical
                    else None
                ),
                "mapping": (
                    {
                        "mapping_id": mapping.mapping_id,
                        "mapping_type": mapping.mapping_type,
                        "is_active": mapping.is_active,
                        "version": mapping.version,
                    }
                    if mapping
                    else None
                ),
                "nfc_bound": bool(physical.nfc_tag_uid),
                "can_write": bool(physical and logical),
            }
        finally:
            db.close()

    return await run_sync_db_block(_do)
