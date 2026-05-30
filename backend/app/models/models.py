"""向后兼容模块 — 所有模型已按域拆分至独立文件

旧代码中的 `from app.models.models import PhysicalShelf` 仍然可用。
新代码建议使用 `from app.models import PhysicalShelf` 或 `from app.models.shelf import PhysicalShelf`。
"""

# 从域文件中重新导出所有模型
from app.models.enums import MappingType, BookSource, BookStatus, ImportStatus, SyncStatus
from app.models.mixins import TimestampMixin
from app.models.book import BookMetadata
from app.models.shelf import PhysicalShelf, LogicalShelf, PhysicalLogicalMapping, LogicalShelfBook
from app.models.audit import SyncLog, ActivityLog
from app.models.task import ImportTask, NfcWriteTask

__all__ = [
    "MappingType", "BookSource", "BookStatus", "ImportStatus", "SyncStatus",
    "TimestampMixin",
    "BookMetadata",
    "PhysicalShelf", "LogicalShelf", "PhysicalLogicalMapping", "LogicalShelfBook",
    "SyncLog", "ActivityLog",
    "ImportTask", "NfcWriteTask",
]
