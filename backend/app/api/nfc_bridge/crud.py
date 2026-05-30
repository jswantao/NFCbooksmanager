"""NFC 桥接 — 数据库原子操作层

所有函数:
- 接收已建立的 Session, **不在内部创建/提交/关闭**
- 仅执行单一查询或写入, 不包含业务编排
- 无外部依赖 (httpx / asyncio / 模板渲染)

事务边界由 handlers 层通过 ``run_sync_db_block`` 内的 try/commit/rollback 控制。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models import (
    LogicalShelf,
    NfcWriteTask,
    PhysicalLogicalMapping,
    PhysicalShelf,
)

# ==================== 写入任务 (NfcWriteTask) ====================


def clean_expired_tasks(db: Session, now: datetime) -> int:
    """删除已过期任务, 返回删除条数"""
    deleted = (
        db.query(NfcWriteTask)
        .filter(NfcWriteTask.expires_at < now)
        .delete(synchronize_session=False)
    )
    db.commit()
    return deleted


def insert_write_task(
    db: Session,
    *,
    task_id: str,
    shelf_id: int,
    shelf_name: str,
    payload: str,
    expires_at: datetime,
) -> NfcWriteTask:
    """插入新写入任务 (不提交, 由调用方控制事务)"""
    task = NfcWriteTask(
        task_id=task_id,
        shelf_id=shelf_id,
        shelf_name=shelf_name,
        payload=payload,
        expires_at=expires_at,
    )
    db.add(task)
    return task


def list_write_tasks(db: Session) -> list[NfcWriteTask]:
    """按创建时间倒序列出所有写入任务"""
    return (
        db.query(NfcWriteTask).order_by(NfcWriteTask.created_at.desc()).all()
    )


def get_write_task(db: Session, task_id: str) -> NfcWriteTask | None:
    """根据 task_id 查询单条写入任务"""
    return db.query(NfcWriteTask).filter(NfcWriteTask.task_id == task_id).first()


def delete_write_task(db: Session, task_id: str) -> int:
    """删除指定 task_id 的任务, 返回受影响行数"""
    deleted = (
        db.query(NfcWriteTask)
        .filter(NfcWriteTask.task_id == task_id)
        .delete(synchronize_session=False)
    )
    return deleted


# ==================== 逻辑书架 ====================


def get_active_logical_shelf(db: Session, shelf_id: int) -> LogicalShelf | None:
    """根据 ID 获取活跃逻辑书架 (is_active=True)"""
    return (
        db.query(LogicalShelf)
        .filter(
            LogicalShelf.logical_shelf_id == shelf_id,
            LogicalShelf.is_active == True,  # noqa: E712 - SQLA 需要 ==
        )
        .first()
    )


def list_all_logical_shelves(db: Session) -> list[LogicalShelf]:
    """按名称列出所有逻辑书架 (用于绑定引导页选择列表)"""
    return db.query(LogicalShelf).order_by(LogicalShelf.shelf_name).all()


# ==================== 物理书架 ====================


def get_physical_by_id(db: Session, physical_id: int) -> PhysicalShelf | None:
    return (
        db.query(PhysicalShelf)
        .filter(PhysicalShelf.physical_shelf_id == physical_id)
        .first()
    )


def get_physical_by_tag_uid(db: Session, tag_uid: str) -> PhysicalShelf | None:
    return db.query(PhysicalShelf).filter(PhysicalShelf.nfc_tag_uid == tag_uid).first()


def get_physical_by_location_code(db: Session, code: str) -> PhysicalShelf | None:
    return db.query(PhysicalShelf).filter(PhysicalShelf.location_code == code).first()


def find_first_unbound_physical(db: Session) -> PhysicalShelf | None:
    """按 location_code 升序找到第一个未绑定 NFC 的物理书架"""
    return (
        db.query(PhysicalShelf)
        .filter(PhysicalShelf.nfc_tag_uid.is_(None))
        .order_by(PhysicalShelf.location_code)
        .first()
    )


def search_physical_shelves(
    db: Session, search: str = "", limit: int = 20
) -> list[PhysicalShelf]:
    """搜索可绑定的物理书架, 未绑定 NFC 的优先排在前面"""
    query = db.query(PhysicalShelf).filter(PhysicalShelf.is_active == True)  # noqa: E712
    if search:
        term = f"%{search}%"
        query = query.filter(
            PhysicalShelf.location_code.ilike(term)
            | PhysicalShelf.location_name.ilike(term)
        )
    return (
        query.order_by(
            PhysicalShelf.nfc_tag_uid.is_(None).desc(),
            PhysicalShelf.location_code,
        )
        .limit(limit)
        .all()
    )


def bind_tag_to_physical(
    physical_shelf: PhysicalShelf, tag_uid: str, now: datetime
) -> None:
    """在内存中更新物理书架的 NFC 绑定 (不提交, 由 handlers 控制)"""
    physical_shelf.nfc_tag_uid = tag_uid
    physical_shelf.updated_at = now


# ==================== 物理-逻辑映射 ====================


def get_active_mapping_by_physical(
    db: Session, physical_id: int
) -> PhysicalLogicalMapping | None:
    return (
        db.query(PhysicalLogicalMapping)
        .filter(
            PhysicalLogicalMapping.physical_shelf_id == physical_id,
            PhysicalLogicalMapping.is_active == True,  # noqa: E712
        )
        .first()
    )


def get_active_mapping_by_logical(
    db: Session, logical_id: int
) -> PhysicalLogicalMapping | None:
    return (
        db.query(PhysicalLogicalMapping)
        .filter(
            PhysicalLogicalMapping.logical_shelf_id == logical_id,
            PhysicalLogicalMapping.is_active == True,  # noqa: E712
        )
        .first()
    )


def create_mapping_if_absent(
    db: Session, physical_id: int, logical_id: int, mapping_type: str = "one_to_one"
) -> tuple[PhysicalLogicalMapping, bool]:
    """若不存在则创建映射, 返回 (mapping, created)"""
    existing = (
        db.query(PhysicalLogicalMapping)
        .filter(
            PhysicalLogicalMapping.physical_shelf_id == physical_id,
            PhysicalLogicalMapping.logical_shelf_id == logical_id,
        )
        .first()
    )
    if existing:
        return existing, False

    mapping = PhysicalLogicalMapping(
        physical_shelf_id=physical_id,
        logical_shelf_id=logical_id,
        mapping_type=mapping_type,
        is_active=True,
    )
    db.add(mapping)
    db.flush()  # 让 mapping_id 可见, 但不 commit
    return mapping, True
