# backend/app/models/models.py
"""
数据模型定义 - 内模式核心 (SQLAlchemy ORM)

按照三级模式架构设计：
- 内模式：负责图书元数据持久化存储与外部数据源集成
- 物理书架、逻辑书架、映射关系、图书元数据等核心实体
- 维护数据一致性约束（唯一键、外键、索引）

数据一致性要求：
- ISBN 唯一约束（同 ISBN 视为同一本书）
- 逻辑书架与图书关系完整性（外键约束）
- 映射版本号支持变更追踪
- 更新失败时支持重试（通过 sync_status 标记）
"""

import enum
from typing import Optional

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey,
    Boolean, Index, UniqueConstraint
)
from sqlalchemy.orm import relationship, validates
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.sql import func

from app.core.database import Base


# ==================== 枚举定义 ====================

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
    - MANUAL: 用户手动录入（豆瓣失败时的补录方式）
    - ISBN: 通过 ISBN 数据库查询
    - NFC: 通过 NFC 标签关联获取
    """
    DOUBAN = "douban"
    MANUAL = "manual"
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

class TimestampMixin:
    """
    时间戳混入类
    
    为所有实体模型自动添加创建时间和更新时间字段。
    
    行为：
    - created_at: 记录创建时自动设置，后续不可变
    - updated_at: 记录创建时设置，每次更新自动刷新
    
    实现细节：
    - server_default=func.now() 确保数据库层面默认值
    - onupdate=func.now() 确保 ORM 更新时自动刷新
    """
    created_at = Column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        
    )
    updated_at = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        
    )


# ==================== 实体：物理书架 (PhysicalShelf) ====================

class PhysicalShelf(Base, TimestampMixin):
    """
    实体书架数据模型
    
    代表物理空间中的真实书架位置对象。
    通过 NFC 标签 UID 与物理世界建立稳定关联。
    
    约束：
    - location_code 唯一：确保每个物理位置有唯一编码
    - nfc_tag_uid 唯一（可空）：一个 NFC 标签仅绑定一个实体书架
    - is_active：支持软删除，保留历史映射记录
    
    关系：
    - 一对多映射到 PhysicalLogicalMapping（一个物理书架可对应多个逻辑书架）
    """
    __tablename__ = "physical_shelves"

    physical_shelf_id = Column(
        Integer,
        primary_key=True,
        autoincrement=True,
        
    )
    location_code = Column(
        String(100),
        unique=True,
        nullable=False,
        index=True,
        
    )
    location_name = Column(
        String(200),
        nullable=False,
        
    )
    nfc_tag_uid = Column(
        String(100),
        unique=True,
        nullable=True,
        
    )
    description = Column(
        Text,
        nullable=True,
        
    )
    is_active = Column(
        Boolean,
        default=True,
        
    )

    # 关系：一个物理书架可以有多个映射记录
    mappings = relationship(
        "PhysicalLogicalMapping",
        back_populates="physical_shelf",
        cascade="all, delete-orphan",
        lazy="selectin",
        doc="关联的物理-逻辑书架映射记录"
    )

    @hybrid_property
    def active_mapping_count(self) -> int:
        """
        当前激活的映射数量
        
        用于检查物理书架是否已正确配置映射关系。
        返回 0 表示该物理书架尚未关联任何逻辑书架。
        """
        return sum(1 for m in self.mappings if m.is_active)

    def __repr__(self) -> str:
        return f"<PhysicalShelf #{self.physical_shelf_id} '{self.location_code}'>"


# ==================== 实体：逻辑书架 (LogicalShelf) ====================

class LogicalShelf(Base, TimestampMixin):
    """
    逻辑书架数据模型
    
    系统内聚合图书的业务容器，不等同于实体层板。
    通过映射关系与物理书架关联。
    
    核心能力：
    - 聚合多本图书用于分类展示
    - 通过映射表追溯物理位置
    - 支持激活/停用状态管理
    
    关系：
    - 一对多映射到 PhysicalLogicalMapping
    - 一对多映射到 LogicalShelfBook（包含的图书列表）
    """
    __tablename__ = "logical_shelves"

    logical_shelf_id = Column(
        Integer,
        primary_key=True,
        autoincrement=True,
        comment="逻辑书架唯一标识"
    )
    shelf_name = Column(
        String(200),
        nullable=False,
        comment="书架名称，如 '文学小说'、'技术书籍'"
    )
    description = Column(
        Text,
        nullable=True,
        comment="书架描述，如 '包含中外文学经典和现代小说'"
    )
    is_active = Column(
        Boolean,
        default=True,
        comment="是否启用，False 表示逻辑书架已归档"
    )

    # 关系：逻辑书架与物理书架的映射
    mappings = relationship(
        "PhysicalLogicalMapping",
        back_populates="logical_shelf",
        cascade="all, delete-orphan",
        lazy="selectin",
        doc="关联的物理-逻辑书架映射记录"
    )

    # 关系：逻辑书架中的图书
    books = relationship(
        "LogicalShelfBook",
        back_populates="logical_shelf",
        cascade="all, delete-orphan",
        lazy="selectin",
        doc="书架中包含的图书关联记录"
    )

    @hybrid_property
    def book_count(self) -> int:
        """
        当前在架图书数量
        
        仅统计状态为 'in_shelf' 的图书，
        已移除或已转移的图书不计算在内。
        """
        return sum(1 for b in self.books if b.status == BookStatus.IN_SHELF.value)

    @hybrid_property
    def physical_location(self) -> Optional[str]:
        """
        关联的物理位置名称
        
        遍历所有激活映射，返回第一个对应的物理书架位置名称。
        若无激活映射则返回 None。
        """
        for m in self.mappings:
            if m.is_active and m.physical_shelf:
                return m.physical_shelf.location_name
        return None

    def __repr__(self) -> str:
        return f"<LogicalShelf #{self.logical_shelf_id} '{self.shelf_name}'>"


# ==================== 关系表：物理-逻辑书架映射 (PhysicalLogicalMapping) ====================

class PhysicalLogicalMapping(Base, TimestampMixin):
    """
    物理书架与逻辑书架的映射关系表
    
    实现外模式 -> 中间模式的核心映射：
    - NFC 标签读取的 location_code → 找到 PhysicalShelf
    - PhysicalShelf → 通过此映射表找到 LogicalShelf
    - LogicalShelf → 查询包含的图书列表
    
    关键设计：
    - version 字段：映射变更时递增，用于前端检测数据刷新需求
    - is_active 字段：支持映射关系的软删除，保留历史记录
    - 唯一约束：同一物理书架与逻辑书架的配对只能有一条记录
    
    数据一致性：
    - 外键约束确保物理书架和逻辑书架存在
    - 级联删除：物理/逻辑书架删除时自动清理映射
    """
    __tablename__ = "physical_logical_mappings"

    mapping_id = Column(
        Integer,
        primary_key=True,
        autoincrement=True,
        comment="映射关系唯一标识"
    )
    physical_shelf_id = Column(
        Integer,
        ForeignKey("physical_shelves.physical_shelf_id", ondelete="CASCADE"),
        nullable=False,
        comment="关联的物理书架 ID"
    )
    logical_shelf_id = Column(
        Integer,
        ForeignKey("logical_shelves.logical_shelf_id", ondelete="CASCADE"),
        nullable=False,
        comment="关联的逻辑书架 ID"
    )
    mapping_type = Column(
        String(20),
        default=MappingType.ONE_TO_ONE.value,
        
    )
    is_active = Column(
        Boolean,
        default=True,
        
    )
    version = Column(
        Integer,
        default=1,
        
    )

    # 关系：回引物理书架
    physical_shelf = relationship(
        "PhysicalShelf",
        back_populates="mappings",
        lazy="joined",
        doc="关联的物理书架对象"
    )

    # 关系：回引逻辑书架
    logical_shelf = relationship(
        "LogicalShelf",
        back_populates="mappings",
        lazy="joined",
        doc="关联的逻辑书架对象"
    )

    # 表级约束
    __table_args__ = (
        UniqueConstraint(
            "physical_shelf_id",
            "logical_shelf_id",
            name="uq_physical_logical_mapping",
            
        ),
        Index(
            "idx_mapping_active_lookup",
            "is_active",
            "physical_shelf_id",
            
        ),
    )

    def __repr__(self) -> str:
        return f"<Mapping #{self.mapping_id} v{self.version} P#{self.physical_shelf_id}→L#{self.logical_shelf_id}>"


# ==================== 实体：图书元数据 (BookMetadata) ====================

class BookMetadata(Base, TimestampMixin):
    """
    图书元数据模型（内模式核心存储）
    
    存储图书的完整详细信息，是系统的核心数据实体。
    
    数据来源：
    - 豆瓣爬虫自动同步（source='douban'）
    - 用户手动录入（source='manual'）
    - ISBN 查询（source='isbn'）
    - NFC 关联（source='nfc'）
    
    关键约束：
    - ISBN 唯一约束：保证同 ISBN 不被重复录入
    - 多字段索引：加速按书名、作者、来源查询
    
    豆瓣同步机制：
    - last_sync_at: 记录最后同步时间，用于增量更新判断
    - sync_status: 标记同步状态，失败时可重试
    
    ⚠️ 业务规则：
    - 同 ISBN 多副本场景：当前设计为 ISBN 唯一，如需多副本请通过
      logical_shelf_books 的 note 字段进行区分
    """
    __tablename__ = "book_metadata"

    book_id = Column(
        Integer,
        primary_key=True,
        autoincrement=True,
        
    )
    isbn = Column(
        String(13),
        unique=True,
        index=True,
        
    )
    title = Column(
        String(500),
        nullable=False,
        
    )
    author = Column(
        String(300),
        nullable=True,
        
    )
    translator = Column(
        String(300),
        nullable=True,
        
    )
    publisher = Column(
        String(200),
        nullable=True,
        
    )
    publish_date = Column(
        String(50),
        nullable=True,
        
    )
    cover_url = Column(
        String(500),
        nullable=True,
        
    )
    summary = Column(
        Text,
        nullable=True,
        
    )
    pages = Column(
        String(20),
        nullable=True,
        
    )
    price = Column(
        String(50),
        nullable=True,
        
    )
    binding = Column(
        String(50),
        nullable=True,
        comment="装帧类型：平装、精装、简装等"
    )
    original_title = Column(
        String(300),
        nullable=True,
        comment="原版书名（外文书籍适用）"
    )
    series = Column(
        String(200),
        nullable=True,
        comment="所属丛书系列名称"
    )
    rating = Column(
        String(10),
        nullable=True,
        comment="豆瓣评分，1-10 的字符串格式"
    )
    douban_url = Column(
        String(300),
        nullable=True,
        comment="豆瓣图书详情页完整 URL"
    )
    source = Column(
        String(20),
        default=BookSource.MANUAL.value,
        comment="数据来源标识：douban / manual / isbn / nfc"
    )
    last_sync_at = Column(
        DateTime,
        nullable=True,
        comment="最后一次从豆瓣同步的时间，用于增量更新判断"
    )
    sync_status = Column(
        String(20),
        nullable=True,
        
    )

    # 关系：图书在哪些书架中
    shelf_books = relationship(
        "LogicalShelfBook",
        back_populates="book",
        cascade="all, delete-orphan",
        lazy="selectin",
        doc="图书与书架的关联记录"
    )

    # 关系：图书的同步操作日志
    sync_logs = relationship(
        "SyncLog",
        back_populates="book",
        cascade="all, delete-orphan",
        lazy="selectin",
        doc="该图书的豆瓣同步操作历史记录"
    )

    @hybrid_property
    def rating_float(self) -> Optional[float]:
        """
        将 string 格式的豆瓣评分转换为 float
        
        用于数据分析和排序场景。
        转换失败时返回 None，不抛出异常。
        """
        try:
            return float(self.rating) if self.rating else None
        except (ValueError, TypeError):
            return None

    @validates("isbn")
    def validate_isbn(self, key, isbn: str) -> str:
        """
        ISBN 写入前自动清洗与校验
        
        执行步骤：
        1. 移除连字符和空格
        2. 验证长度必须为 10 或 13 位
        3. 返回清洗后的纯 ISBN
        
        异常：
        ValueError: 当 ISBN 长度不符合 10 或 13 位时抛出
        """
        if isbn:
            # 清洗：移除连字符和空格
            isbn = isbn.replace("-", "").replace(" ", "").strip()
            
            # 校验长度
            if len(isbn) not in (10, 13):
                raise ValueError(
                    f"ISBN 长度必须为 10 或 13 位，当前为 {len(isbn)} 位: {isbn}"
                )
        return isbn

    # 表级索引
    __table_args__ = (
        Index(
            "idx_book_title_search",
            "title",
            
        ),
        Index(
            "idx_book_author_search",
            "author",
           
        ),
        Index(
            "idx_book_source_filter",
            "source",
            
        ),
        Index(
            "idx_book_rating_sort",
            "rating",
            
        ),
    )

    def __repr__(self) -> str:
        return f"<Book #{self.book_id} '{self.title[:30]}' [{self.isbn}]>"


# ==================== 关系表：书架-图书关联 (LogicalShelfBook) ====================

class LogicalShelfBook(Base, TimestampMixin):
    """
    逻辑书架与图书的关联表
    
    管理图书在书架中的包含关系，
    支持排序、状态管理和图书跨书架复用。
    
    业务规则：
    - 同一图书可在不同书架中出现（通过唯一约束控制同一书架不能重复）
    - sort_order 决定展示顺序（数值越小越靠前）
    - status 支持软删除（removed/moved）保留历史记录
    
    数据一致性：
    - 外键约束确保书架和图书存在
    - 级联删除：书架或图书删除时自动清理关联
    """
    __tablename__ = "logical_shelf_books"

    id = Column(
        Integer,
        primary_key=True,
        autoincrement=True,
        
    )
    logical_shelf_id = Column(
        Integer,
        ForeignKey("logical_shelves.logical_shelf_id", ondelete="CASCADE"),
        nullable=False,
        
    )
    book_id = Column(
        Integer,
        ForeignKey("book_metadata.book_id", ondelete="CASCADE"),
        nullable=False,
        
    )
    sort_order = Column(
        Integer,
        default=0,
        
    )
    status = Column(
        String(20),
        default=BookStatus.IN_SHELF.value,
        
    )
    added_at = Column(
        DateTime,
        server_default=func.now(),
        
    )
    note = Column(
        Text,
        nullable=True,
        
    )

    # 关系：回引逻辑书架
    logical_shelf = relationship(
        "LogicalShelf",
        back_populates="books",
        lazy="joined",
        doc="关联的逻辑书架对象"
    )

    # 关系：回引图书
    book = relationship(
        "BookMetadata",
        back_populates="shelf_books",
        lazy="joined",
        doc="关联的图书元数据对象"
    )

    # 表级约束
    __table_args__ = (
        UniqueConstraint(
            "logical_shelf_id",
            "book_id",
            name="uq_shelf_book_unique",
            
        ),
        Index(
            "idx_shelf_book_active",
            "logical_shelf_id",
            "status",
            
        ),
        Index(
            "idx_shelf_book_sort",
            "logical_shelf_id",
            "sort_order",
            
        ),
    )

    def __repr__(self) -> str:
        return f"<ShelfBook L#{self.logical_shelf_id}←B#{self.book_id} [{self.status}]>"


# ==================== 审计日志：同步操作记录 (SyncLog) ====================

class SyncLog(Base, TimestampMixin):
    """
    豆瓣同步操作日志
    
    记录每次从豆瓣同步图书数据的操作详情，
    用于：
    - 追溯同步历史
    - 排查同步失败原因
    - 统计同步操作频率
    
    每次同步操作（无论成功或失败）都会创建一条记录。
    """
    __tablename__ = "sync_logs"

    id = Column(
        Integer,
        primary_key=True,
        autoincrement=True,
        
    )
    book_id = Column(
        Integer,
        ForeignKey("book_metadata.book_id", ondelete="CASCADE"),
        nullable=False,
        
    )
    action = Column(
        String(50),
        nullable=False,
        
    )
    detail = Column(
        Text,
        nullable=True,
        
    )
    status = Column(
        String(20),
        default=SyncStatus.SUCCESS.value,
        
    )
    source = Column(
        String(20),
        default=BookSource.DOUBAN.value,
        
    )

    # 关系：回引图书
    book = relationship(
        "BookMetadata",
        back_populates="sync_logs",
        lazy="joined",
        doc="关联的图书元数据对象"
    )

    # 表级索引
    __table_args__ = (
        Index(
            "idx_sync_log_book_time",
            "book_id",
            "created_at",
            
        ),
    )

    def __repr__(self) -> str:
        return f"<SyncLog #{self.id} B#{self.book_id} [{self.status}]>"


# ==================== 审计日志：系统操作记录 (ActivityLog) ====================

class ActivityLog(Base, TimestampMixin):
    """
    系统操作活动日志
    
    记录系统中的所有关键操作，用于：
    - 审计追踪：谁在什么时间做了什么操作
    - 问题排查：追溯数据变更历史
    - 行为分析：统计操作频率和类型分布
    
    记录范围：
    - NFC 读写操作
    - 映射关系创建/修改/删除
    - 图书添加/删除/同步
    - 书架创建/修改/删除
    - 系统启动/关闭
    """
    __tablename__ = "activity_logs"

    id = Column(
        Integer,
        primary_key=True,
        autoincrement=True,
        
    )
    action = Column(
        String(100),
        nullable=False,
        
    )
    detail = Column(
        Text,
        nullable=True,
        
    )
    entity_type = Column(
        String(50),
        nullable=True,
        
    )
    entity_id = Column(
        Integer,
        nullable=True,
        
    )
    status = Column(
        String(20),
        default="success",
        
    )

    # 表级索引
    __table_args__ = (
        Index(
            "idx_activity_log_action",
            "action",
            "created_at",
            
        ),
        Index(
            "idx_activity_log_entity",
            "entity_type",
            "entity_id",
            
        ),
    )

    def __repr__(self) -> str:
        return f"<ActivityLog #{self.id} [{self.action}] {self.entity_type}#{self.entity_id}>"


# ==================== 异步任务：导入操作记录 (ImportTask) ====================

class ImportTask(Base, TimestampMixin):
    """
    批量导入任务模型
    
    支持 Excel/CSV 文件的异步导入处理：
    1. 创建任务记录（status=pending）
    2. 后台启动处理（status=running）
    3. 处理完成（status=completed/failed/cancelled）
    
    进度跟踪：
    - total: 总任务数
    - completed: 已完成数（含成功和失败）
    - success/failed/skipped: 细分统计
    - progress: 计算属性，百分比进度
    """
    __tablename__ = "import_tasks"

    task_id = Column(
        String(36),
        primary_key=True,
        
    )
    status = Column(
        String(20),
        default=ImportStatus.PENDING.value,
        
    )
    file_name = Column(
        String(200),
        nullable=True,
        
    )
    total = Column(
        Integer,
        default=0,
        
    )
    completed = Column(
        Integer,
        default=0,
        
    )
    success = Column(
        Integer,
        default=0,
        
    )
    failed = Column(
        Integer,
        default=0,
        
    )
    skipped = Column(
        Integer,
        default=0,
        
    )
    synced = Column(
        Integer,
        default=0,
        
    )
    results = Column(
        Text,
        nullable=True,
        
    )
    errors = Column(
        Text,
        nullable=True,
        
    )
    options = Column(
        Text,
        nullable=True,
        
    )
    error = Column(
        Text,
        nullable=True,
       
    )
    started_at = Column(
        DateTime,
        nullable=True,
        
    )
    finished_at = Column(
        DateTime,
        nullable=True,
        
    )

    @hybrid_property
    def progress(self) -> float:
        """
        任务执行进度百分比
        
        计算公式: (completed / total) * 100
        total 为 0 时返回 0.0，避免除零错误。
        """
        return round(self.completed / self.total * 100, 2) if self.total > 0 else 0.0

    @hybrid_property
    def is_finished(self) -> bool:
        """
        判断任务是否已结束
        
        结束状态包括：completed, failed, cancelled
        pending 和 running 表示任务仍在进行中。
        """
        finished_statuses = {
            ImportStatus.COMPLETED.value,
            ImportStatus.FAILED.value,
            ImportStatus.CANCELLED.value,
        }
        return self.status in finished_statuses

    # 表级索引
    __table_args__ = (
        Index(
            "idx_import_task_status",
            "status",
            
        ),
    )

    def __repr__(self) -> str:
        return f"<ImportTask '{self.task_id[:8]}...' [{self.status}] {self.completed}/{self.total}>"