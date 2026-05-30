# backend/app/utils/activity_logger.py
"""
操作活动日志工具

提供统一的操作审计日志记录接口，供所有 API 端点使用。

使用方式::

    from app.utils.activity_logger import log_activity

    log_activity(db, action="create_book", entity_type="book",
                 entity_id=book.book_id, detail={"isbn": isbn, "title": book.title})

每条日志自动记录:
- 时间戳 (created_at, updated_at) → TimestampMixin
- 操作类型 (action) → 如 "create_book", "delete_shelf", "bind_nfc"
- 实体信息 (entity_type, entity_id) → 如 "book", 42
- 操作详情 (detail) → JSON 结构化数据
- 执行结果 (status) → "success" / "failed"
"""

import json
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from loguru import logger

from app.models.models import ActivityLog


def log_activity(
    db: Session,
    action: str,
    entity_type: str,
    entity_id: Optional[int] = None,
    detail: Optional[Dict[str, Any]] = None,
    status: str = "success",
) -> Optional[ActivityLog]:
    """
    记录一条操作活动日志

    Args:
        db: 数据库会话（来自 Depends(get_db)）
        action: 操作类型，如 "create_book", "delete_shelf", "bind_nfc"
        entity_type: 实体类型，如 "book", "shelf", "mapping", "nfc"
        entity_id: 实体 ID（可选，非数据库实体可为 None）
        detail: 结构化详情字典，将 JSON 序列化存储
        status: 执行结果，默认 "success"，失败场景传 "failed"

    Returns:
        ActivityLog 实例，失败时返回 None（不抛异常，仅写 warning 日志）
    """
    try:
        log_entry = ActivityLog(
            action_type=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            details=json.dumps(detail, ensure_ascii=False, default=str) if detail else None,
        )
        db.add(log_entry)
        db.commit()
        logger.debug(f"[AUDIT] {action} | {entity_type}:{entity_id} | {status}")
        return log_entry
    except Exception as e:
        logger.warning(f"[AUDIT] 日志记录失败 ({action}): {e}")
        try:
            db.rollback()
        except Exception:
            pass
        return None
