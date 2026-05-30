"""ORM 混入类"""
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime
from sqlalchemy.sql import func


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

