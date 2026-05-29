# backend/app/models/fields.py
"""
跨数据库类型系统

提供 SQLAlchemy TypeDecorator 实现，使同一列在 SQLite 和 PostgreSQL
上使用不同的原生类型：

- FlexJSON:  SQLite → Text (JSON 字符串), PostgreSQL → JSONB
"""
import json

from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator


class FlexJSON(TypeDecorator):
    """
    自适应 JSON 存储类型

    SQLite:     Text — JSON 序列化为字符串存储
    PostgreSQL: JSONB — 原生二进制 JSON，支持索引和高效查询

    自动处理 dict/JSON 字符串的双向转换。

    用法:
        from app.models.fields import FlexJSON

        class MyModel(Base):
            detail = Column(FlexJSON)

    迁移说明:
        SQLite → PostgreSQL 迁移时，Text 列中的 JSON 字符串会自动
        被 asyncpg 转换为 JSONB。反之，JSONB → Text 需手动转换。
    """

    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import JSONB
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value, dialect):
        """写入 DB 前：dict/list → JSON 字符串"""
        if value is None:
            return None
        if isinstance(value, str):
            return value
        return json.dumps(value, ensure_ascii=False)

    def process_result_value(self, value, dialect):
        """从 DB 读取后：JSON 字符串 → dict/list"""
        if value is None:
            return None
        if isinstance(value, (dict, list)):
            return value
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return value
