"""向后兼容 — 书架 API 已重构为三层架构

旧代码 `from app.api import shelves` + `shelves.router` 仍然可用。
"""
from app.api.shelves.router import router

__all__ = ["router"]
