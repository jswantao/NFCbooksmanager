# backend/app/api/__init__.py
"""
API 路由模块

按照三级模式架构组织：
- 外模式（NFC 交互层）：nfc_bridge - NFC 标签读写与物理世界入口
- 中间模式（映射转换层）：mapping - 物理-逻辑映射解析
                         shelves - 逻辑书架管理与图书展示
- 内模式（数据存储层）：books - 图书元数据 CRUD 与豆瓣同步
                         admin - 管理仪表盘与统计监控
- 工具服务：images - 图片代理
             config_api - 系统配置与 Cookie 管理
             import_api - 批量导入 Excel/CSV 图书数据

路由前缀：
- /api/nfc      → nfc_bridge
- /api/mapping  → mapping
- /api/shelves  → shelves
- /api/books    → books
- /api/admin    → admin
- /api/images   → images
- /api/config   → config_api
- /api/import   → import_api
"""

from app.api import (
    nfc_bridge,
    mapping,
    shelves,
    books,
    admin,
    images,
    config_api,
    import_api,
)

__all__ = [
    "nfc_bridge",
    "mapping",
    "shelves",
    "books",
    "admin",
    "images",
    "config_api",
    "import_api",
]