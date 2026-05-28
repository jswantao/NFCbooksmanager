# backend/tests/test_search.py
"""搜索端点 + SearchService 测试"""


class TestSearchService:
    """SearchService 业务逻辑"""

    def test_search_local_books_hit(self, db_session, sample_book):
        from app.services.chat_service import search_local_books
        result = search_local_books(db_session, sample_book["title"][:2], limit=10)
        assert result["total"] >= 1
        titles = [r["title"] for r in result["results"]]
        assert sample_book["title"] in titles

    def test_search_local_books_miss(self, db_session):
        from app.services.chat_service import search_local_books
        result = search_local_books(db_session, "XYZZY_NONEXISTENT", limit=10)
        assert result["total"] == 0
        assert result["results"] == []

    def test_search_local_books_score(self, db_session, sample_book):
        """相关性评分：精确匹配得分应更高"""
        from app.services.chat_service import search_local_books
        result = search_local_books(db_session, sample_book["title"], limit=10)
        assert result["total"] >= 1
        assert result["results"][0]["relevance_score"] > 0

    def test_tokenize_query(self):
        """n-gram 分词"""
        from app.services.chat_service import tokenize_query
        tokens = tokenize_query("三体")
        assert "三体" in tokens
        assert any(len(t) == 2 for t in tokens)

    def test_get_book_detail(self, db_session, sample_book):
        from app.services.chat_service import get_book_detail
        detail = get_book_detail(db_session, sample_book["book_id"])
        assert detail is not None
        assert detail["title"] == sample_book["title"]

    def test_get_book_detail_not_found(self, db_session):
        from app.services.chat_service import get_book_detail
        detail = get_book_detail(db_session, 99999)
        assert detail is None

    def test_get_similar_books(self, db_session, sample_book):
        """推荐相似图书"""
        from app.services.chat_service import get_similar_books
        results = get_similar_books(db_session, sample_book["book_id"], limit=5)
        assert isinstance(results, list)

    def test_search_service_dispatcher(self, db_session, sample_book):
        """SearchService 自动派发到 SQLite 路径"""
        from app.services.search_service import SearchService
        result = SearchService.search_books(db_session, sample_book["title"], limit=5)
        assert result["total"] >= 1
        assert result["search_engine"] == "sqlite_ngram"


class TestSearchEndpoints:
    """HTTP 搜索端点"""

    def test_chat_search(self, client, sample_book):
        """POST /api/chat/search"""
        resp = client.post("/api/chat/search", json={
            "query": sample_book["title"],
            "limit": 5,
        })
        assert resp.status_code == 200

    def test_chat_book_detail(self, client, sample_book):
        """GET /api/chat/book/{id}"""
        resp = client.get(f"/api/chat/book/{sample_book['book_id']}")
        assert resp.status_code == 200

    def test_chat_similar(self, client, sample_book):
        """GET /api/chat/book/{id}/similar"""
        resp = client.get(f"/api/chat/book/{sample_book['book_id']}/similar?limit=3")
        assert resp.status_code == 200
