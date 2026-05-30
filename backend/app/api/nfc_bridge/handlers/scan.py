"""NFC 扫描回调 — 四级判断链

对应端点: GET /callback (NFC TOOLS PRO 等工具调用)

★ 已修复原版本 B1: 第一级 NDEF 解析失败时正确 fall-through 到第二级,
   而不是把 None 当作 HTTP 响应直接返回。

四级判断链:
  ① NDEF 中携带 shelf_id → 验证 LogicalShelf → 302 跳转
  ② tag_uid → 查 PhysicalShelf → 查激活 Mapping → 验证 LogicalShelf → 302 跳转
  ③ tag_uid 对应物理书架存在但无映射 → 302 到绑定逻辑书架引导页
  ④ tag_uid 完全未绑定 → 302 到绑定物理书架引导页
  兜底: 既无 tag_uid 又无 NDEF → HTML 错误页
"""

from __future__ import annotations

from fastapi.responses import HTMLResponse, RedirectResponse, Response
from loguru import logger

from app.api.nfc_bridge import crud, service
from app.core.database import SyncSessionLocal, run_sync_db_block
from app.core.jinja_setup import render_template

# ==================== 主入口 ====================


async def handle_callback(tag_uid: str, raw_text: str) -> Response:
    """NFC 扫描回调统一入口"""
    tag_uid = (tag_uid or "").strip()
    raw_text = (raw_text or "").strip()

    logger.info(
        f"📱 NFC 扫描回调 | tagid: {tag_uid} | "
        f"text: {raw_text[:80] if raw_text else 'empty'}"
    )

    # ───── 第一级: NDEF 携带 shelf_id ─────
    ndef_shelf_id = service.parse_ndef_shelf_id(raw_text)
    if ndef_shelf_id is not None:
        redirect = await _resolve_by_ndef(ndef_shelf_id)
        if redirect is not None:
            return redirect
        # ✅ 修复 B1: NDEF 中的书架不存在 → fall-through 到第二级

    # ───── 第二、三、四级: 走 tag_uid 路径 ─────
    if tag_uid:
        return await _resolve_by_tag_uid(tag_uid)

    # ───── 兜底: 错误页 ─────
    logger.warning("回调无 tag_uid 且无有效 NDEF 数据")
    return _render_error_page(tag_uid)


# ==================== 第一级 ====================


async def _resolve_by_ndef(shelf_id: int) -> RedirectResponse | None:
    """第一级判断: NDEF 中的 shelf_id 是否对应活跃逻辑书架"""

    def _do() -> RedirectResponse | None:
        db = SyncSessionLocal()
        try:
            shelf = crud.get_active_logical_shelf(db, shelf_id)
            if shelf:
                logger.info(
                    f"✅ NDEF 解析成功 → 书架: {shelf.shelf_name} (#{shelf_id})"
                )
                return RedirectResponse(
                    url=f"{service.get_frontend_url()}/shelf/{shelf_id}",
                    status_code=302,
                )
            logger.warning(
                f"NDEF 中的书架 #{shelf_id} 不存在, 尝试通过 tag_uid 查找"
            )
            return None
        finally:
            db.close()

    return await run_sync_db_block(_do)


# ==================== 第二/三/四级 ====================


async def _resolve_by_tag_uid(tag_uid: str) -> RedirectResponse:
    """tag_uid 路径: 物理书架 → 映射 → 逻辑书架 / 各级引导页"""

    def _do() -> RedirectResponse:
        db = SyncSessionLocal()
        try:
            physical_shelf = crud.get_physical_by_tag_uid(db, tag_uid)

            # 第四级: tag_uid 完全未绑定
            if not physical_shelf:
                logger.info(f"📱 tag_uid '{tag_uid}' 未绑定, 跳转绑定物理书架页面")
                return RedirectResponse(
                    url=f"/api/nfc/bind-page/{tag_uid}", status_code=302
                )

            logger.info(
                f"🔍 找到物理书架: {physical_shelf.location_name} "
                f"(#{physical_shelf.physical_shelf_id})"
            )

            # 第二级: 已绑定 + 有激活映射 + 逻辑书架存在 → 直接跳转
            mapping = crud.get_active_mapping_by_physical(
                db, physical_shelf.physical_shelf_id
            )
            if mapping:
                logical_shelf = crud.get_active_logical_shelf(
                    db, mapping.logical_shelf_id
                )
                if logical_shelf:
                    logger.info(
                        f"✅ 通过物理书架映射 → "
                        f"{physical_shelf.location_name} → "
                        f"{logical_shelf.shelf_name} "
                        f"(#{logical_shelf.logical_shelf_id})"
                    )
                    return RedirectResponse(
                        url=(
                            f"{service.get_frontend_url()}/shelf/"
                            f"{logical_shelf.logical_shelf_id}"
                        ),
                        status_code=302,
                    )

            # 第三级: 已绑定物理书架但无映射 → 引导绑定逻辑书架
            logger.info(
                f"📱 物理书架 '{physical_shelf.location_name}' 已绑定 UID 但无激活映射, "
                f"跳转绑定逻辑书架页面"
            )
            return RedirectResponse(
                url=(
                    f"/api/nfc/bind-logical-shelf/"
                    f"{physical_shelf.physical_shelf_id}?tag_uid={tag_uid}"
                ),
                status_code=302,
            )
        finally:
            db.close()

    return await run_sync_db_block(_do)


# ==================== 错误页 ====================


def _render_error_page(tag_uid: str) -> HTMLResponse:
    return HTMLResponse(
        content=render_template(
            "result.html",
            tag_id=tag_uid or "",
            success=False,
            shelf_id=None,
            shelf_name="",
            message="无法识别标签数据, 请确认标签已正确写入",
            icon="&#10060;",
            color="#ef4444",
            status_text="扫描失败",
            shelf_url="",
        )
    )
