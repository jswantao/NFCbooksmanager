# backend/app/schemas/__init__.py
"""Pydantic 数据模型（按业务域拆分）"""

from app.schemas.common import AppSchema, ApiResponse, PaginatedResponse
from app.schemas.nfc import NFCWriteRequest, NFCWriteResponse, NFCReadResponse
from app.schemas.mapping import MappingResolveRequest, MappingResolveResponse, MappingCreateRequest
from app.schemas.shelf import ShelfCreateRequest, ShelfUpdateRequest, ShelfInfoResponse, ShelfBooksResponse
from app.schemas.book import BookBase, BookCreateManualRequest, BookUpdateManualRequest, BookInShelf, BookDetailResponse, BookWallItem
from app.schemas.book_ops import BookSyncRequest, BookSyncResponse, BookAddToShelfRequest, BookAddToShelfResponse, BookSearchRequest
from app.schemas.cookie import CookieSaveRequest, CookieInfoResponse, CookieTestResponse
from app.schemas.import_schema import ImportPreviewResponse, ImportStartResponse, ImportTaskStatusResponse
from app.schemas.dashboard import DashboardStatsResponse, ActivityLogResponse, SystemConfigResponse
from app.schemas.backup import (
    BackupMetadataResponse, BackupExportResponse, BackupListResponse,
    ConflictItem, ConflictResolution, ConflictCheckResponse,
    RestorePreviewResponse, RestoreExecuteRequest, RestoreResultResponse,
    BackupDeleteRequest,
    WebDAVConfigResponse, WebDAVConfigSaveRequest, WebDAVTestResponse,
    AutoBackupStatusResponse,
)

# ==================== 修复 Pydantic 前向引用 ====================
# ShelfBooksResponse 引用了 MappingResolveResponse 和 BookInShelf
# BookSyncResponse 引用了 BookInShelf
# 必须在所有类型导入后调用 model_rebuild()
ShelfBooksResponse.model_rebuild()
BookSyncResponse.model_rebuild()
