# backend/app/schemas/dashboard.py
"""仪表盘与管理配置 Pydantic 模型"""

from typing import Optional, List, Dict, Any
from pydantic import Field
from app.schemas.common import AppSchema


class DashboardStatsResponse(AppSchema):
    """管理仪表盘统计数据响应"""
    physical_shelves: int = Field(0, description="物理书架总数")
    logical_shelves: int = Field(0, description="逻辑书架总数")
    active_mappings: int = Field(0, description="有效映射数量")
    total_books: int = Field(0, description="图书总数")
    books_in_shelves: int = Field(0, description="已上架图书数")
    books_not_in_shelf: int = Field(0, description="未上架图书数")
    books_by_source: Dict[str, int] = Field(default_factory=dict, description="各数据来源图书数量统计")
    sync_count: int = Field(0, description="同步操作总次数")
    today_books: int = Field(0, description="今日新增图书数")
    recent_books: List[Dict[str, Any]] = Field(default_factory=list, description="最近添加的图书列表")
    monthly_growth: List[Dict[str, Any]] = Field(default_factory=list, description="月度图书增长趋势")
    top_publishers: List[Dict[str, Any]] = Field(default_factory=list, description="出版社分布 Top N")
    top_authors: List[Dict[str, Any]] = Field(default_factory=list, description="作者分布 Top N")
    rating_distribution: List[Dict[str, Any]] = Field(default_factory=list, description="评分分布统计")
    shelf_utilization: List[Dict[str, Any]] = Field(default_factory=list, description="书架利用率统计")
    recent_activities: List[Dict[str, Any]] = Field(default_factory=list, description="最近操作活动记录")


class ActivityLogResponse(AppSchema):
    """活动日志响应"""
    id: int = Field(..., description="日志唯一标识")
    action: str = Field(..., description="操作类型")
    detail: Optional[str] = Field(None, description="操作详情描述")
    type: str = Field(..., description="实体类型")
    timestamp: str = Field(..., description="操作时间 (ISO 格式)")


class SystemConfigResponse(AppSchema):
    """系统配置信息响应"""
    app_name: str = Field(..., description="应用名称")
    app_version: str = Field(..., description="应用版本")
    debug_mode: bool = Field(..., description="是否调试模式")
    database_type: str = Field(..., description="数据库类型")
    cors_origins: List[str] = Field(default_factory=list, description="允许的跨域来源")
