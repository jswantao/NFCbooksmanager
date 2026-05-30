"""批量导入 — 业务逻辑编排层

编排文件解析、ISBN 校验、数据库检查、任务创建。
"""

import json
from typing import Optional, Dict, Any, List

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import BookMetadata, ImportTask, ImportStatus
from app.api.import_api.crud import (
    clean_and_validate_isbn, parse_file_content, find_isbn_column,
    SUPPORTED_EXTENSIONS,
)


def preview_import_file(
    file_content: bytes, filename: str, db: Session,
) -> Dict[str, Any]:
    """预览导入文件：统计新增/已存在/无效/重复数量"""
    if not filename:
        raise HTTPException(status_code=400, detail="文件名为空")

    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400,
                            detail=f"不支持的文件格式，支持: {', '.join(SUPPORTED_EXTENSIONS)}")

    try:
        df = parse_file_content(file_content, extension)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if df.empty:
        raise HTTPException(status_code=400, detail="文件内容为空")

    isbn_column = find_isbn_column(df)
    if not isbn_column:
        raise HTTPException(status_code=400, detail="未找到 ISBN 列")

    raw_isbns = df[isbn_column].dropna().astype(str).tolist()
    new_entries, invalid_entries = [], []
    seen_isbns, duplicate_isbns = set(), set()

    for i, raw_isbn in enumerate(raw_isbns):
        cleaned = clean_and_validate_isbn(raw_isbn)
        if not cleaned:
            invalid_entries.append({
                "row": i + 2, "original": str(raw_isbn)[:50],
                "reason": "ISBN 格式错误或校验失败",
            })
        elif cleaned in seen_isbns:
            duplicate_isbns.add(cleaned)
        else:
            seen_isbns.add(cleaned)
            existing = db.query(BookMetadata).filter(BookMetadata.isbn == cleaned).first()
            if not existing:
                new_entries.append({"row": i + 2, "isbn": cleaned})

    existing_count = len(seen_isbns) - len(new_entries)
    return {
        "file_name": filename, "file_size": len(file_content),
        "total_rows": len(df), "new_count": len(new_entries),
        "existing_count": existing_count, "duplicate_count": len(duplicate_isbns),
        "invalid_count": len(invalid_entries), "isbn_column": isbn_column,
        "note_column": None,
        "isbns": [e["isbn"] for e in new_entries][:100],
        "sample_data": df.head(10).fillna("").to_dict(orient="records"),
        "columns": [str(c) for c in df.columns],
        "new_entries": new_entries[:50], "existing_books": [],
        "invalid_entries": invalid_entries[:20],
        "duplicates": [{"isbn": isbn, "count": 2} for isbn in duplicate_isbns][:20],
        "total_isbns": len(raw_isbns), "valid_count": len(new_entries),
        "other_columns": [],
    }


def categorize_isbns_for_import(
    df, isbn_column: str, db: Session,
) -> Dict[str, Any]:
    """分类所有 ISBN 为新增/已存在/无效，批量查询优化"""
    all_valid_isbns, existing_isbns_list, new_isbns_list = [], [], []
    invalid_count = 0
    seen = set()
    cleaned_isbns = []

    for raw in df[isbn_column].dropna().astype(str):
        c = clean_and_validate_isbn(raw)
        if c and c not in seen:
            seen.add(c)
            cleaned_isbns.append(c)
        elif not c:
            invalid_count += 1

    if not cleaned_isbns:
        raise HTTPException(status_code=400, detail="文件中没有有效的 ISBN 数据")

    existing_set = set()
    for i in range(0, len(cleaned_isbns), 500):
        batch = cleaned_isbns[i:i + 500]
        records = db.query(BookMetadata.isbn).filter(BookMetadata.isbn.in_(batch)).all()
        existing_set.update(r[0] for r in records)

    for isbn in cleaned_isbns:
        all_valid_isbns.append(isbn)
        if isbn in existing_set:
            existing_isbns_list.append(isbn)
        else:
            new_isbns_list.append(isbn)

    return {
        "all_valid": all_valid_isbns, "existing": existing_isbns_list,
        "new": new_isbns_list, "existing_set": existing_set,
        "invalid_count": invalid_count,
    }


def get_task_status(task: Optional[ImportTask]) -> Dict[str, Any]:
    """构建任务状态响应"""
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return {
        "task_id": task.task_id, "status": task.status,
        "file_name": task.file_name, "total": task.total,
        "completed": task.completed, "success": task.success,
        "synced": task.synced, "failed": task.failed, "skipped": task.skipped,
        "progress": task.progress,
        "results": task.results if isinstance(task.results, list) else
            (json.loads(task.results) if isinstance(task.results, str) else []),
        "errors": task.errors if isinstance(task.errors, list) else
            (json.loads(task.errors) if isinstance(task.errors, str) else []),
        "error": task.error,
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "finished_at": task.finished_at.isoformat() if task.finished_at else None,
        "options": json.loads(task.options) if task.options else {},
    }
