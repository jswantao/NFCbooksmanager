# backend/tests/conftest.py
"""
pytest 共享 fixtures

设计:
- session 级: 创建内存 SQLite 引擎 + 建表 (整个测试运行期间一次)
- function 级: 每个测试独立的事务，teardown 自动 rollback 保持隔离

测试数据库: sqlite:///:memory: (内存模式，零副作用)
"""

import os
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

# 在导入 app 之前设置测试数据库 URL
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DB_TYPE"] = "sqlite"
os.environ["SECRET_KEY"] = "test-secret-key-for-testing"
os.environ["NFC_ENCRYPTION_KEY"] = "test-nfc-key-for-testing"

from app.core.database import Base, get_db
from app.main import app


@pytest.fixture(scope="session")
def db_engine():
    """Session 级：创建内存 SQLite 引擎 + 所有表"""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _set_pragma(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture(scope="function")
def db_session(db_engine):
    """
    Function 级：每个测试独立事务，teardown 时 rollback

    使用 SAVEPOINT 嵌套事务模式:
    - 外层连接级事务不回滚 (保持表结构)
    - 内层 SAVEPOINT 在测试结束后回滚 (隔离数据)
    """
    connection = db_engine.connect()
    transaction = connection.begin()

    session = Session(bind=connection, autocommit=False, autoflush=False)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="function")
def client(db_session):
    """FastAPI TestClient，注入测试 DB 会话"""

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    from fastapi.testclient import TestClient
    with TestClient(app) as tc:
        yield tc
    app.dependency_overrides.clear()


# ==================== 示例数据 Fixtures ====================


@pytest.fixture(scope="function")
def sample_book(db_session) -> dict:
    """预置一本测试图书并返回其数据"""
    from app.models.models import BookMetadata

    book = BookMetadata(
        isbn="9787544291163",
        title="三体",
        author="刘慈欣",
        publisher="重庆出版社",
        publish_date="2008-01",
        pages="302",
        price="23.00",
        binding="平装",
        summary="文化大革命如火如荼进行的同时...",
        cover_url="",
        rating="9.3",
        source="manual",
    )
    db_session.add(book)
    db_session.commit()
    db_session.refresh(book)
    return {
        "book_id": book.book_id,
        "isbn": book.isbn,
        "title": book.title,
        "author": book.author,
        "publisher": book.publisher,
    }


@pytest.fixture(scope="function")
def sample_shelf(db_session) -> dict:
    """预置一个测试逻辑书架"""
    from app.models.models import LogicalShelf

    shelf = LogicalShelf(
        shelf_name="科幻小说",
        description="科幻与奇幻文学",
        is_active=True,
    )
    db_session.add(shelf)
    db_session.commit()
    db_session.refresh(shelf)
    return {
        "logical_shelf_id": shelf.logical_shelf_id,
        "shelf_name": shelf.shelf_name,
    }


@pytest.fixture(scope="function")
def sample_physical_shelf(db_session) -> dict:
    """预置一个测试物理书架"""
    from app.models.models import PhysicalShelf

    shelf = PhysicalShelf(
        location_code="A-01",
        location_name="A柜第1层",
        tag_uid=None,
    )
    db_session.add(shelf)
    db_session.commit()
    db_session.refresh(shelf)
    return {
        "physical_shelf_id": shelf.physical_shelf_id,
        "location_code": shelf.location_code,
    }
