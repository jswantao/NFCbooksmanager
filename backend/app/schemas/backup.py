# backend/app/schemas/backup.py
"""备份与恢复功能的请求/响应 Schema 定义"""

from datetime import datetime
from typing import Optional, List, Dict, Any

from pydantic import Field

from app.schemas.common import AppSchema, ApiResponse


# ==================== 备份元数据 ====================

class BackupMetadataResponse(AppSchema):
    """备份文件元数据（解密后返回前端）"""
    filename: str = Field(..., description="备份文件名")
    version: str = Field(..., description="备份格式版本号")
    created_at: str = Field(..., description="备份创建时间 (ISO 8601)")
    table_counts: Dict[str, int] = Field(..., description="各表记录数")
    file_size_bytes: int = Field(..., description="文件大小（字节）")
    file_size_display: str = Field(..., description="文件大小（可读格式）")
    encrypted: bool = Field(default=True, description="是否已加密")
    app_version: str = Field("", description="创建备份时的应用版本")


class BackupExportResponse(ApiResponse[BackupMetadataResponse]):
    """创建备份的 API 响应"""
    pass


class BackupListResponse(ApiResponse[List[BackupMetadataResponse]]):
    """备份文件列表的 API 响应"""
    pass


# ==================== 冲突检测 ====================

class ConflictItem(AppSchema):
    """单个冲突条目"""
    table: str = Field(..., description="表名")
    pk_column: str = Field(..., description="主键列名")
    pk_value: Any = Field(..., description="主键值")
    reason: str = Field(..., description="冲突原因: exists_different / exists_identical / orphan_in_backup")
    current_data: Optional[Dict[str, Any]] = Field(None, description="当前数据库中的数据")
    backup_data: Optional[Dict[str, Any]] = Field(None, description="备份中的数据")
    diff_fields: Optional[List[str]] = Field(None, description="差异字段列表")


class ConflictResolution(AppSchema):
    """用户对单个冲突的解决方式"""
    table: str
    pk_column: str
    pk_value: Any
    action: str = Field("skip", description="处理策略: overwrite / skip / keep_both")


class ConflictCheckResponse(ApiResponse[Dict[str, Any]]):
    """冲突检测结果响应"""
    pass


# ==================== 恢复 ====================

class RestorePreviewResponse(AppSchema):
    """恢复预览：备份文件内容摘要"""
    filename: str
    version: str
    app_version: str = ""
    created_at: str
    table_counts: Dict[str, int]
    total_rows: int


class RestoreExecuteRequest(AppSchema):
    """执行恢复请求"""
    filename: str = Field(..., description="要恢复的备份文件名")
    resolutions: List[ConflictResolution] = Field(default_factory=list, description="冲突解决策略列表")
    dry_run: bool = Field(default=False, description="是否为预览模式（不实际修改数据）")


class RestoreResultResponse(ApiResponse[Dict[str, Any]]):
    """恢复执行结果响应"""
    pass


# ==================== 备份删除 ====================

class BackupDeleteRequest(AppSchema):
    """删除备份请求"""
    filenames: List[str] = Field(..., min_length=1, description="要删除的备份文件名列表")


# ==================== WebDAV 配置 ====================

class WebDAVConfigResponse(AppSchema):
    """WebDAV 配置状态（密码脱敏）"""
    enabled: bool
    url: str
    username: str
    configured: bool = Field(..., description="是否已完成配置（URL 和用户名均非空）")
    remote_path: str
    timeout: int = 30


class WebDAVConfigSaveRequest(AppSchema):
    """保存 WebDAV 配置"""
    enabled: bool
    url: str = ""
    username: str = ""
    password: str = ""
    remote_path: str = "/backups/"
    timeout: int = 30


class WebDAVTestResponse(ApiResponse[Dict[str, Any]]):
    """WebDAV 连接测试结果响应"""
    pass


# ==================== 自动备份状态 ====================

class AutoBackupStatusResponse(AppSchema):
    """自动备份状态"""
    enabled: bool
    interval_hours: int
    max_local_copies: int
    last_backup_at: Optional[str] = None
    last_backup_success: bool = False
    next_backup_at: Optional[str] = None
    webdav_sync_enabled: bool = False
    webdav_last_sync_at: Optional[str] = None
    local_backup_count: int = 0
