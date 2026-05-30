# backend/app/core/dependencies.py
"""
FastAPI 依赖注入模块

统一管理核心服务依赖的获取与生命周期。
所有路由处理函数应通过 `FastAPI Depends()` 声明依赖，而非直接导入全局单例。

依赖作用域说明：
- get_settings()        → 进程级单例（@lru_cache），整个应用生命周期共享同一实例
- get_douban_service()  → 进程级单例（通过 services 工厂注册表），共享缓存和限速状态
- get_db()              → 请求级作用域（generator），每个请求独立创建和销毁会话

使用示例::

    from fastapi import Depends
    from app.core.dependencies import get_settings, get_douban_service
    from app.core.database import get_db

    @router.get("/books")
    async def list_books(
        db: Session = Depends(get_db),
        settings: Settings = Depends(get_settings),
        douban_svc: DoubanService = Depends(get_douban_service),
    ):
        ...
"""

from app.core.config import get_settings
from app.services import get_service


def get_douban_service():
    """
    获取豆瓣服务单例实例

    通过 services 统一工厂注册表获取进程级共享的 DoubanService 实例。
    所有请求共用同一缓存和限速状态。
    """
    return get_service("douban")
