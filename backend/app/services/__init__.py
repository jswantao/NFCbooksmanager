"""服务层模块 — 统一工厂注册与单例管理

架构：
- 类服务：通过 get_service() 工厂获取进程级单例
- 函数服务：直接导出函数，无状态
"""

import threading
from typing import Dict, Any

# ==================== 类服务 ====================
from app.services.douban_service import DoubanService
from app.services.nfc_service import NFCService
from app.services.google_books_service import GoogleBooksService
from app.services.search_service import SearchService
from app.services.taiwan_isbn_service import TaiwanISBNService

# ==================== 函数服务 ====================
from app.services.douban_parser import parse_book
from app.services.backup_service import (
    create_backup, list_backups, delete_backups,
    detect_conflicts, execute_restore, read_backup_metadata,
    test_webdav_connection, sync_to_webdav, list_webdav_backups,
    get_auto_backup_status,
)
from app.services.chat_service import (
    search_local_books, get_book_detail as chat_get_book_detail,
    get_similar_books,
)
from app.services.nedb_import_service import parse_nedb_file, map_nedb_to_book
from app.services.smart_entry_service import (
    validate_isbn, extract_isbn_from_barcode,
    extract_isbn_from_image_text, lookup_by_isbn_douban,
)

# ==================== 服务注册表 ====================

_SERVICE_REGISTRY: Dict[str, type] = {
    "douban": DoubanService,
    "nfc": NFCService,
    "google_books": GoogleBooksService,
    "search": SearchService,
    "taiwan_isbn": TaiwanISBNService,
}

_instances: Dict[str, object] = {}
_lock = threading.Lock()


def get_service(name: str) -> object:
    """工厂方法：按名称获取服务单例实例（线程安全）"""
    if name not in _SERVICE_REGISTRY:
        raise ValueError(
            f"Unknown service: {name}. Available: {list(_SERVICE_REGISTRY.keys())}"
        )
    if name not in _instances:
        with _lock:
            if name not in _instances:
                _instances[name] = _SERVICE_REGISTRY[name]()
    return _instances[name]


def reset_services() -> None:
    """重置所有服务实例（仅用于测试）"""
    with _lock:
        _instances.clear()


def get_registered_services() -> Dict[str, type]:
    """获取已注册的服务列表"""
    return dict(_SERVICE_REGISTRY)


__all__ = [
    "get_service", "reset_services", "get_registered_services",
    "DoubanService", "NFCService", "GoogleBooksService",
    "SearchService", "TaiwanISBNService",
    "parse_book",
    "create_backup", "list_backups", "delete_backups",
    "detect_conflicts", "execute_restore", "read_backup_metadata",
    "test_webdav_connection", "sync_to_webdav", "list_webdav_backups",
    "get_auto_backup_status",
    "search_local_books", "chat_get_book_detail", "get_similar_books",
    "parse_nedb_file", "map_nedb_to_book",
    "validate_isbn", "extract_isbn_from_barcode",
    "extract_isbn_from_image_text", "lookup_by_isbn_douban",
]
