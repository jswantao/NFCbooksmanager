"""任务模型 — 导入任务、NFC写入任务"""

from datetime import datetime, timezone

from app.models.enums import ImportStatus
from app.models.mixins import TimestampMixin

from sqlalchemy import Column, Integer, String, Text, DateTime, Index
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.sql import func, case

from app.core.database import Base
from app.models.fields import FlexJSON

# ==================== 导入任务 (ImportTask) ====================

class ImportTask(Base, TimestampMixin):
    __tablename__ = "import_tasks"
    task_id = Column(String(36), primary_key=True)
    status = Column(String(20), default=ImportStatus.PENDING.value)
    file_name = Column(String(200), nullable=True)
    total = Column(Integer, default=0)
    completed = Column(Integer, default=0)
    success = Column(Integer, default=0)
    failed = Column(Integer, default=0)
    skipped = Column(Integer, default=0)
    synced = Column(Integer, default=0)
    results = Column(FlexJSON, nullable=True)
    errors = Column(FlexJSON, nullable=True)
    options = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    @hybrid_property
    def progress(self) -> float:
        return round(self.completed / self.total * 100, 2) if self.total > 0 else 0.0

    @progress.expression
    def progress(cls):
        return case((cls.total > 0, func.round(cls.completed * 100.0 / cls.total, 2)), else_=0.0)

    __table_args__ = (Index("idx_import_task_status", "status"),)

    def __repr__(self):
        return f"<ImportTask ''{self.task_id[:8]}...'' [{self.status}] {self.completed}/{self.total}>"

# ==================== NFC写入任务 (NfcWriteTask) ====================

class NfcWriteTask(Base):
    __tablename__ = "nfc_write_tasks"
    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String(32), unique=True, nullable=False, index=True)
    shelf_id = Column(Integer, nullable=False)
    shelf_name = Column(String(200), default="")
    payload = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=False, index=True)

    def is_expired(self) -> bool:
        return datetime.now(timezone.utc) > self.expires_at

    @property
    def remaining_seconds(self) -> int:
        delta = self.expires_at - datetime.now(timezone.utc)
        return max(0, int(delta.total_seconds()))

    def __repr__(self):
        return f"<NfcWriteTask ''{self.task_id}'' shelf=#{self.shelf_id}>"
