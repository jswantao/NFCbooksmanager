"""向后兼容 — 图书 API 已重构为三层架构

旧代码 `from app.api import books` + `books.router` 仍然可用。
新代码建议直接从包导入: `from app.api.books import router`
"""
from app.api.books.router import router

__all__ = ["router"]
