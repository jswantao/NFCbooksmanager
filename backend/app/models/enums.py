"""枚举与常量定义"""
import enum

class MappingType(str, enum.Enum):
    """
    物理书架与逻辑书架的映射类型
    
    - ONE_TO_ONE: 一个物理书架对应一个逻辑书架（最常见场景）
    - ONE_TO_MANY: 一个物理书架对应多个逻辑书架（如一个柜子分多层）
    """
    ONE_TO_ONE = "one_to_one"
    ONE_TO_MANY = "one_to_many"


class BookSource(str, enum.Enum):
    """
    图书数据来源标识

    用于追踪图书元数据的来源渠道：
    - DOUBAN: 豆瓣 API 自动同步
    - MANUAL: 用户手动录入
    - SMART_ENTRY: 智能录入助手 (n8n + 多源查询)
    - ISBN: 通过 ISBN 数据库查询
    - NFC: 通过 NFC 标签关联获取
    """
    DOUBAN = "douban"
    MANUAL = "manual"
    SMART_ENTRY = "smart_entry"
    ISBN = "isbn"
    NFC = "nfc"


class BookStatus(str, enum.Enum):
    """
    图书在书架中的状态
    
    - IN_SHELF: 当前在书架上
    - REMOVED: 已从书架移除（软删除）
    - MOVED: 已转移到其他书架
    """
    IN_SHELF = "in_shelf"
    REMOVED = "removed"
    MOVED = "moved"


class ImportStatus(str, enum.Enum):
    """
    导入任务状态流转
    
    PENDING -> RUNNING -> COMPLETED / FAILED / CANCELLED
    """
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class SyncStatus(str, enum.Enum):
    """
    豆瓣同步操作状态
    
    - PENDING: 等待同步
    - SUCCESS: 同步成功，元数据已更新
    - FAILED: 同步失败，需重试或手动补录
    """
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"


# ==================== 混入类 (Mixin) ====================
