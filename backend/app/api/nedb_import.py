# backend/app/api/nedb_import.py
"""
NeDB 数据导入 API

与标准模板导入（import_api.py）完全分离，互不耦合。

端点:
- POST /api/import/nedb/preview  : 预览 NeDB 文件内容
- POST /api/import/nedb/start    : 启动 NeDB 导入任务

导入流程:
1. 上传 .db 文件 → 解析 NDJSON → 字段映射
2. 预览: 统计数量 + 返回重复 ISBN 详情
3. 用户逐条选择 merge/keep/skip
4. 启动后台任务 → 封面匹配复制 → 写入数据库（不走豆瓣同步）
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from loguru import logger

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    BackgroundTasks,
    Form,
)
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.database import get_db, AsyncSessionLocal
from app.models.models import ImportTask, ImportStatus

router = APIRouter(prefix="/nedb", tags=["NeDB导入"])


@router.post("/preview", summary="预览 NeDB 数据导入")
async def preview_nedb_import_endpoint(
    file: UploadFile = File(..., description="NeDB 数据库文件 (.db)"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    预览 NeDB 数据库文件内容。

    返回统计和重复 ISBN 详情:
    - total, new_count, existing_count, invalid_count, internal_dup_count
    - samples: 前 10 条样本
    - duplicate_items: 重复 ISBN 详情 [{isbn, nedb_title, nedb_author, existing_book_id, existing_title}]
    """
    extension = (
        file.filename.rsplit(".", 1)[-1].lower()
        if file.filename and "." in file.filename
        else ""
    )
    if extension != "db":
        raise HTTPException(status_code=400, detail="仅支持 .db (NeDB) 文件格式")

    from app.services.nedb_import_service import parse_nedb_file, preview_nedb_import

    file_content = await file.read()
    try:
        docs = parse_nedb_file(file_content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"NeDB 文件解析失败: {e}")

    if not docs:
        raise HTTPException(status_code=400, detail="NeDB 文件中无数据")

    return preview_nedb_import(docs, db)


@router.post("/start", summary="启动 NeDB 数据导入")
async def start_nedb_import(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="NeDB 数据库文件 (.db)"),
    shelf_id: Optional[int] = Form(None, description="导入后添加到书架"),
    cover_path: Optional[str] = Form(None, description="封面文件所在目录（如 D:/ManageBooks/covers）"),
    duplicate_resolution: Optional[str] = Form(None, description="重复ISBN处理策略 JSON: {\"978xxx\":\"merge\",\"978yyy\":\"keep\"}"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    启动 NeDB 数据导入任务。

    后台异步逐条导入，通过 GET /api/import/status/{task_id} 查询进度。

    封面匹配:
    - 指定 cover_path 后，系统自动在该目录下按 coverSrc 文件名和 ISBN 模式匹配封面
    - 匹配成功则复制到 cache/images/ 并通过 /api/images/cache/ 端点访问
    - 匹配失败则保留原始文件名供前端回退

    重复 ISBN 处理 (duplicate_resolution):
    - "merge": 新数据非空字段覆盖旧值，空字段保留旧值
    - "keep": 保留已有记录，跳过该条
    - "skip": 直接跳过，不导入
    - 默认: keep
    """
    extension = (
        file.filename.rsplit(".", 1)[-1].lower()
        if file.filename and "." in file.filename
        else ""
    )
    if extension != "db":
        raise HTTPException(status_code=400, detail="仅支持 .db (NeDB) 文件格式")

    from app.services.nedb_import_service import parse_nedb_file, execute_nedb_import

    file_content = await file.read()
    try:
        docs = parse_nedb_file(file_content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"NeDB 文件解析失败: {e}")

    if not docs:
        raise HTTPException(status_code=400, detail="NeDB 文件中无数据")

    # 解析去重决策
    resolution_dict: Dict[str, str] = {}
    if duplicate_resolution:
        try:
            resolution_dict = json.loads(duplicate_resolution)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="duplicate_resolution JSON 格式无效")

    task_id = str(uuid.uuid4())

    task = ImportTask(
        task_id=task_id,
        file_name=file.filename or "unknown.db",
        total=len(docs),
        completed=0,
        success=0,
        failed=0,
        synced=0,
        status=ImportStatus.PENDING.value,
    )
    db.add(task)
    db.commit()

    background_tasks.add_task(
        _run_nedb_import,
        task_id=task_id,
        docs=docs,
        cover_path=cover_path or "",
        shelf_id=shelf_id,
        duplicate_resolution=resolution_dict,
    )

    return {
        "task_id": task_id,
        "total": len(docs),
        "status": "pending",
        "message": f"NeDB 导入任务已创建 ({len(docs)} 条记录)",
    }


async def _run_nedb_import(
    task_id: str,
    docs: List[Dict[str, Any]],
    cover_path: str,
    shelf_id: Optional[int],
    duplicate_resolution: Dict[str, str],
) -> None:
    """后台异步执行 NeDB 导入"""
    from app.services.nedb_import_service import execute_nedb_import
    from app.models.models import ImportTask, ImportStatus

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ImportTask).filter(ImportTask.task_id == task_id)
        )
        task = result.scalar_one_or_none()
        if not task:
            return

        task.status = ImportStatus.RUNNING.value
        task.started_at = datetime.now(timezone.utc)
        await db.commit()

    try:
        import asyncio as _asyncio

        def _do_import():
            from app.core.database import SyncSessionLocal
            db_sync = SyncSessionLocal()
            try:
                outcome = execute_nedb_import(
                    docs=docs,
                    db_session=db_sync,
                    cover_path=cover_path,
                    shelf_id=shelf_id,
                    duplicate_resolution=duplicate_resolution,
                )
                db_sync.commit()
                return outcome
            except Exception as e:
                db_sync.rollback()
                raise
            finally:
                db_sync.close()

        outcome = await _asyncio.to_thread(_do_import)

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ImportTask).filter(ImportTask.task_id == task_id)
            )
            task = result.scalar_one_or_none()
            if task:
                task.status = ImportStatus.COMPLETED.value
                task.completed = (
                    outcome["inserted"]
                    + outcome["merged"]
                    + outcome["kept"]
                    + outcome["skipped"]
                    + len(outcome.get("errors", []))
                )
                task.success = outcome["inserted"] + outcome["merged"]
                task.failed = len(outcome.get("errors", []))
                task.skipped = outcome["skipped"] + outcome["kept"]
                # 存储逐条结果（兼容前端 ImportTaskResult 表格）
                task.results = json.dumps(
                    outcome.get("results", []), ensure_ascii=False
                )
                task.errors = json.dumps(
                    outcome.get("errors", []), ensure_ascii=False
                )
                # 存储细分统计到 options（供完成页展示摘要）
                task.options = json.dumps({
                    "summary": {
                        "inserted": outcome["inserted"],
                        "merged": outcome["merged"],
                        "kept": outcome["kept"],
                        "skipped": outcome["skipped"],
                    }
                }, ensure_ascii=False)
                task.finished_at = datetime.now(timezone.utc)
                await db.commit()

    except Exception as e:
        logger.error(f"NeDB 导入任务异常 [{task_id[:8]}]: {e}")
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(ImportTask).filter(ImportTask.task_id == task_id)
                )
                task = result.scalar_one_or_none()
                if task:
                    task.status = ImportStatus.FAILED.value
                    task.error = str(e)[:500]
                    task.finished_at = datetime.now(timezone.utc)
                    await db.commit()
        except Exception:
            pass
