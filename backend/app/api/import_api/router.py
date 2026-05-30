"""批量导入 API 路由 — 仅路由注册、参数校验、调用 handlers (< 200 行)"""

import io, json, uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any

import pandas as pd
from fastapi import (
    APIRouter, Depends, HTTPException, UploadFile, File, Query,
    BackgroundTasks, Form,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import ImportTask, ImportStatus, BookMetadata
from app.schemas import ImportStartResponse, ApiResponse
from app.core.dependencies import get_douban_service
from app.utils.activity_logger import log_activity

from app.api.import_api import handlers

router = APIRouter()


# ═══════════════════════════════════════════
# 预览
# ═══════════════════════════════════════════

@router.post("/preview", summary="预览导入文件")
async def preview_import(
    file: UploadFile = File(...), db: Session = Depends(get_db),
) -> Dict[str, Any]:
    file_content = await file.read()
    return handlers.preview_import_file(file_content, file.filename or "", db)


# ═══════════════════════════════════════════
# 启动导入
# ═══════════════════════════════════════════

@router.post("/start", response_model=ImportStartResponse, summary="启动批量导入任务")
async def start_import(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    shelf_id: Optional[int] = Form(None),
    auto_sync: bool = Form(True),
    sync_delay: float = Form(1.0, ge=0.5, le=10.0),
    duplicate_resolution: str = Form("skip"),
    db: Session = Depends(get_db),
) -> ImportStartResponse:
    from app.api.import_api.crud import parse_file_content, find_isbn_column, SUPPORTED_EXTENSIONS

    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名为空")

    extension = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支持的文件格式")

    file_content = await file.read()
    df = parse_file_content(file_content, extension)
    if df.empty:
        raise HTTPException(status_code=400, detail="文件内容为空")

    isbn_column = find_isbn_column(df)
    if not isbn_column:
        raise HTTPException(status_code=400, detail="未找到 ISBN 列")

    categorized = handlers.categorize_isbns_for_import(df, isbn_column, db)
    all_valid = categorized["all_valid"]
    existing_set = categorized["existing_set"]

    if not all_valid:
        raise HTTPException(status_code=400, detail="文件中没有有效的 ISBN 数据")

    task_id = str(uuid.uuid4())
    task = ImportTask(
        task_id=task_id, status=ImportStatus.PENDING.value,
        file_name=file.filename or "", total=len(all_valid),
        options=json.dumps({
            "shelf_id": shelf_id, "auto_sync": auto_sync,
            "sync_delay": sync_delay, "duplicate_resolution": duplicate_resolution,
            "new_count": len(categorized["new"]),
            "existing_count": len(categorized["existing"]),
            "invalid_count": categorized["invalid_count"],
        }, ensure_ascii=False),
    )
    db.add(task)
    db.commit()

    # 延迟导入避免循环引用
    from app.api.import_api import _run_import_task
    background_tasks.add_task(
        _run_import_task, task_id, all_valid, existing_set,
        shelf_id, auto_sync, sync_delay, duplicate_resolution,
    )

    return ImportStartResponse(
        task_id=task_id, total=len(all_valid),
        message=f"导入任务已创建，共 {len(all_valid)} 本（新增 {len(categorized['new'])}，重复 {len(categorized['existing'])}）",
    )


# ═══════════════════════════════════════════
# 状态查询
# ═══════════════════════════════════════════

@router.get("/status/{task_id}", summary="查询导入任务进度")
async def get_import_status(task_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    task = db.query(ImportTask).filter(ImportTask.task_id == task_id).first()
    return handlers.get_task_status(task)


# ═══════════════════════════════════════════
# 取消任务
# ═══════════════════════════════════════════

@router.post("/task/{task_id}/cancel", response_model=ApiResponse, summary="取消导入任务")
async def cancel_import(task_id: str, db: Session = Depends(get_db)) -> ApiResponse:
    task = db.query(ImportTask).filter(ImportTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.is_finished:
        raise HTTPException(status_code=400, detail=f"任务已结束（状态: {task.status}），无法取消")

    task.status = ImportStatus.CANCELLED.value
    task.finished_at = datetime.now(timezone.utc)
    db.commit()

    log_activity(db, action="cancel_import", entity_type="import_task",
                 detail={"task_id": task_id})
    return ApiResponse(success=True, message=f"任务已取消（已处理 {task.completed}/{task.total} 条）")


# ═══════════════════════════════════════════
# 下载模板
# ═══════════════════════════════════════════

@router.get("/template", summary="下载导入模板")
async def download_template() -> StreamingResponse:
    df = pd.DataFrame({
        "isbn": ["9787544270878", "9787020002207", "9787532768998"],
        "备注": ["解忧杂货店", "红楼梦", "百年孤独"],
    })
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="导入数据")
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=import_template.xlsx"},
    )
