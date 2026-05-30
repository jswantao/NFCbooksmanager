"""图书元数据模型"""
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Column, Integer, String, Text, DateTime, Float, Index
from sqlalchemy.orm import relationship, validates
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.mixins import TimestampMixin
from app.models.enums import BookSource, BookStatus, SyncStatus, MappingType
from app.models.fields import FlexJSON

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
    local_cover_path = Column(
        String(200),
        nullable=True,
        comment="用户手动上传的本地封面图片路径（如 covers/42_1712345678.jpg）"
    )
    summary = Column(
        Text,
        nullable=True,
        
    )
    pages = Column(
        String(20),
        nullable=True,
        comment="总页数（旧数据为字符串格式；待 Alembic 迁移统一）"
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
    douban_id = Column(
        String(30),
        nullable=True,
        comment="豆瓣图书 ID（纯数字）"
    )
    douban_rating = Column(
        Float,
        nullable=True,
        comment="豆瓣评分（数值型，如 8.5）"
    )
    personal_rating = Column(
        Integer,
        nullable=True,
        comment="个人评分（0-10 整数）"
    )
    purchase_date = Column(
        String(50),
        nullable=True,
        comment="购买日期"
    )
    purchase_price = Column(
        String(50),
        nullable=True,
        comment="购买价格"
    )
    purchase_channel = Column(
        String(100),
        nullable=True,
        comment="购买渠道"
    )
    reading_status = Column(
        String(50),
        nullable=True,
        comment="阅读状态：unread/reading/finished"
    )
    tags = Column(
        String(500),
        nullable=True,
        comment="标签，逗号分隔"
    )
    author_intro = Column(
        Text,
        nullable=True,
        comment="作者简介"
    )
    nedb_extra = Column(
        FlexJSON,
        nullable=True,
        comment="NeDB 导入的额外字段（bookProducer, CLC, readTime 等）"
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
        """将 string 格式的豆瓣评分转换为 float"""
        try:
            return float(self.rating) if self.rating else None
        except (ValueError, TypeError):
            return None

    @rating_float.expression
    def rating_float(cls):
        """SQL 表达式：CAST(rating AS Float)，空字符串视为 NULL"""
        return case(
            (cls.rating == None, None),
            (cls.rating == "", None),
            else_=func.cast(cls.rating, Float),
        )

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
            from app.utils.helpers import clean_isbn
            isbn = clean_isbn(isbn)
            
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

