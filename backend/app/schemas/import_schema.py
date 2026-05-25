# backend/app/schemas/import_schema.py
"""批量导入相关 Pydantic 模型"""

from typing import Optional, List, Dict, Any
from pydantic import Field
from app.schemas.common import AppSchema


class ImportPreviewResponse(AppSchema):
    """文件导入预览响应"""
    file_name: str = Field(..., description="上传的文件名")
    file_size: int = Field(..., description="文件大小 (字节)")
    total_rows: int = Field(..., description="数据总行数")
    new_count: int = Field(0, description="新增图书数量")
    existing_count: int = Field(0, description="已存在图书数量")
    duplicate_count: int = Field(0, description="文件内重复数量")
    invalid_count: int = Field(0, description="无效数据数量")
    isbn_column: str = Field("isbn", description="识别到的 ISBN 列名")
    note_column: Optional[str] = Field(None, description="识别到的备注列名")
    isbns: List[str] = Field(default_factory=list, description="所有解析出的 ISBN")
    sample_data: List[Dict[str, Any]] = Field(default_factory=list, description="前 5 行样本数据")
    columns: List[str] = Field(default_factory=list, description="文件列名")
    new_entries: List[Dict[str, Any]] = Field(default_factory=list, description="新增条目详情")
    existing_books: List[Dict[str, Any]] = Field(default_factory=list, description="已存在图书详情")
    invalid_entries: List[Dict[str, Any]] = Field(default_factory=list, description="无效条目详情")
    duplicates: List[Dict[str, Any]] = Field(default_factory=list, description="文件内重复条目")


class ImportStartResponse(AppSchema):
    """导入任务启动响应"""
    task_id: str = Field(..., description="导入任务唯一标识")
    total: int = Field(..., description="待导入图书总数")
    message: str = Field(..., description="任务启动结果描述")


class ImportTaskStatusResponse(AppSchema):
    """导入任务状态查询响应"""
    task_id: str = Field(..., description="任务唯一标识")
    status: str = Field(..., description="任务状态")
    total: int = Field(0, description="总任务数")
    completed: int = Field(0, description="已完成数")
    success: int = Field(0, description="成功数")
    synced: int = Field(0, description="已同步豆瓣数据数")
    failed: int = Field(0, description="失败数")
    skipped: int = Field(0, description="跳过数（已存在）")
    progress: float = Field(0.0, description="进度百分比 0-100")
    results: List[Dict[str, Any]] = Field(default_factory=list, description="成功结果列表")
    errors: List[Dict[str, Any]] = Field(default_factory=list, description="错误详情列表")
    error: Optional[str] = Field(None, description="任务级别错误信息")
    started_at: Optional[str] = Field(None, description="任务开始时间")
    finished_at: Optional[str] = Field(None, description="任务完成时间")
    file_name: Optional[str] = Field(None, description="导入文件名")
