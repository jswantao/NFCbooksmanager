"""书架管理 API — 三层架构解耦

- router.py  : 路由注册 + 参数校验 (< 200 行)
- handlers.py: 业务逻辑编排 + 响应映射 (< 300 行)
- crud.py    : 数据库原子操作 (< 300 行)
"""
from app.api.shelves.router import router

__all__ = ["router"]
