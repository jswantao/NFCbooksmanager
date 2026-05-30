# backend/app/schemas/__init__.py
"""Pydantic 数据模型（按业务域拆分）"""

from app.schemas.common import AppSchema, ApiResponse, PaginatedResponse
# NFC 相关 schemas 已重构:
# - "任务化写入" 模型迁移至 app.api.nfc_bridge.schemas (NfcTask*)
# - app/schemas/nfc.py 中原有的 NFCWriteRequest/NFCWriteResponse/NFCReadResponse
#   是僵尸定义, 已清理 (无业务引用)。
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
from app.schemas.chat import (
    ChatSearchRequest, ChatSearchResult, ChatSearchResponse,
    ChatBookDetailResponse, ChatBookShelfInfo,
    ChatExportResponse,
)
from app.schemas.smart_entry import (
    OCRExtractRequest, OCRExtractResponse,
    ISBNLookupRequest, ISBNLookupResponse,
    AutoFillRequest, AutoFillFormData, AutoFillResponse,
    MissingFieldsResult, EnrichBookResponse,
    BatchEnrichRequest, BatchEnrichResultItem, BatchEnrichResponse,
    MissingBooksListItem, MissingBooksListResponse,
    ImageUploadResponse,
)

# ==================== 修复 Pydantic 前向引用 ====================
# ShelfBooksResponse 引用了 MappingResolveResponse 和 BookInShelf
# BookSyncResponse 引用了 BookInShelf
# 必须在所有类型导入后调用 model_rebuild()
ShelfBooksResponse.model_rebuild()
BookSyncResponse.model_rebuild()
