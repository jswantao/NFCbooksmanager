"""模型层聚合导出 — 向后兼容所有原有导入路径

域拆分结构:
- enums.py      : 枚举类型
- mixins.py     : TimestampMixin
- fields.py     : FlexJSON 跨数据库类型
- book.py       : BookMetadata (图书元数据)
- shelf.py      : PhysicalShelf, LogicalShelf, PhysicalLogicalMapping, LogicalShelfBook
- audit.py      : SyncLog, ActivityLog
- task.py       : ImportTask, NfcWriteTask
"""

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
