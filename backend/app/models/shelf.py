"""书架域模型 — 物理书架、逻辑书架、映射与图书关联"""

from app.models.enums import MappingType, BookStatus
from app.models.mixins import TimestampMixin

from sqlalchemy import (
    Column, Integer, String, Text, ForeignKey,
    Boolean, Index, UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.ext.hybrid import hybrid_property

from app.core.database import Base

# ==================== 实体：物理书架 (PhysicalShelf) ====================

class PhysicalShelf(Base, TimestampMixin):
    __tablename__ = "physical_shelves"
    physical_shelf_id = Column(Integer, primary_key=True, autoincrement=True)
    location_code = Column(String(100), unique=True, nullable=False, index=True)
    location_name = Column(String(200), nullable=False)
    nfc_tag_uid = Column(String(100), unique=True, nullable=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    mappings = relationship("PhysicalLogicalMapping", back_populates="physical_shelf", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<PhysicalShelf #{self.physical_shelf_id} [{self.location_code}]>"

# ==================== 实体：逻辑书架 (LogicalShelf) ====================

class LogicalShelf(Base, TimestampMixin):
    __tablename__ = "logical_shelves"
    logical_shelf_id = Column(Integer, primary_key=True, autoincrement=True)
    shelf_name = Column(String(100), nullable=False, index=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    mappings = relationship("PhysicalLogicalMapping", back_populates="logical_shelf", cascade="all, delete-orphan")
    books = relationship("LogicalShelfBook", back_populates="shelf", cascade="all, delete-orphan")

    @hybrid_property
    def book_count(self):
        return len(self.books) if self.books else 0

    def __repr__(self):
        return f"<LogicalShelf #{self.logical_shelf_id} ''{self.shelf_name}''>"

# ==================== 实体：物理-逻辑书架映射 (PhysicalLogicalMapping) ====================

class PhysicalLogicalMapping(Base, TimestampMixin):
    __tablename__ = "physical_logical_mappings"
    mapping_id = Column(Integer, primary_key=True, autoincrement=True)
    physical_shelf_id = Column(Integer, ForeignKey("physical_shelves.physical_shelf_id", ondelete="CASCADE"), nullable=False, index=True)
    logical_shelf_id = Column(Integer, ForeignKey("logical_shelves.logical_shelf_id", ondelete="CASCADE"), nullable=False, index=True)
    mapping_type = Column(String(20), default=MappingType.ONE_TO_ONE.value)
    is_active = Column(Boolean, default=True)
    version = Column(Integer, default=1)
    physical_shelf = relationship("PhysicalShelf", back_populates="mappings")
    logical_shelf = relationship("LogicalShelf", back_populates="mappings")

    __table_args__ = (
        UniqueConstraint("physical_shelf_id", "logical_shelf_id", name="uq_physical_logical_mapping"),
        Index("idx_mapping_physical", "physical_shelf_id"),
        Index("idx_mapping_logical", "logical_shelf_id"),
    )

    def __repr__(self):
        return f"<Mapping P#{self.physical_shelf_id} -> L#{self.logical_shelf_id}>"

# ==================== 关系表：书架-图书关联 (LogicalShelfBook) ====================

class LogicalShelfBook(Base, TimestampMixin):
    __tablename__ = "logical_shelf_books"
    id = Column(Integer, primary_key=True, autoincrement=True)
    logical_shelf_id = Column(Integer, ForeignKey("logical_shelves.logical_shelf_id", ondelete="CASCADE"), nullable=False, index=True)
    book_id = Column(Integer, ForeignKey("book_metadata.book_id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(String(50), nullable=True)
    note = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    status = Column(String(20), default=BookStatus.IN_SHELF.value)
    book = relationship("BookMetadata", back_populates="shelf_books")
    shelf = relationship("LogicalShelf", back_populates="books")

    @hybrid_property
    def added_at(self):
        """向后兼容旧 API 中的 added_at 字段名"""
        return self.created_at

    __table_args__ = (
        UniqueConstraint("logical_shelf_id", "book_id", name="uq_shelf_book"),
        Index("idx_shelf_book_id", "book_id"),
    )

    def __repr__(self):
        return f"<ShelfBook S#{self.logical_shelf_id} B#{self.book_id}>"
