"""审计与日志模型 — 同步日志、操作日志"""

from app.models.enums import SyncStatus
from app.models.mixins import TimestampMixin

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base

# ==================== 同步日志 (SyncLog) ====================

class SyncLog(Base, TimestampMixin):
    __tablename__ = "sync_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey("book_metadata.book_id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), default=SyncStatus.PENDING.value)
    error_message = Column(Text, nullable=True)
    synced_at = Column(DateTime, nullable=True)
    source = Column(String(20), default="douban")
    book = relationship("BookMetadata", back_populates="sync_logs")

    def __repr__(self):
        return f"<SyncLog #{self.id} [{self.status}] B#{self.book_id}>"

# ==================== 操作日志 (ActivityLog) ====================

class ActivityLog(Base, TimestampMixin):
    __tablename__ = "activity_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    action_type = Column(String(50), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(String(100), nullable=True)
    details = Column(Text, nullable=True)

    def __repr__(self):
        return f"<ActivityLog #{self.id} [{self.action_type}] {self.entity_type}#{self.entity_id}>"
