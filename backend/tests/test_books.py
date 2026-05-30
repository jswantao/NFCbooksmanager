# backend/tests/test_books.py
"""图书管理 API 测试 — 覆盖 CRUD + 搜索

API 响应格式: ApiResponse[T] {success, data, message}
"""


class TestBookCreate:
    """POST /api/books/manual — 手动录入图书"""

    def test_create_book_success(self, client):
        resp = client.post("/api/books/manual", json={
            "isbn": "9787208063501",
            "title": "万历十五年",
            "author": "黄仁宇",
            "publisher": "生活·读书·新知三联书店",
            "publish_date": "1997-05",
            "source": "manual",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["data"]["book_id"] > 0

    def test_create_book_minimal(self, client):
        """仅必填字段"""
        resp = client.post("/api/books/manual", json={
            "isbn": "9787506365437",
            "title": "活着",
            "source": "manual",
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_create_book_duplicate_isbn(self, client, sample_book):
        """同 ISBN 不可重复录入 — 返回 409 冲突"""
        resp = client.post("/api/books/manual", json={
            "isbn": sample_book["isbn"],
            "title": "Duplicate",
            "source": "manual",
        })
        assert resp.status_code == 409
        data = resp.json()
        assert "detail" in data

    def test_create_book_with_shelf(self, client, sample_shelf):
        """录入时指定书架"""
        resp = client.post("/api/books/manual", json={
            "isbn": "9787020002207",
            "title": "红楼梦",
            "source": "manual",
            "shelf_id": sample_shelf["logical_shelf_id"],
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True


class TestBookList:
    """GET /api/books/ — 获取图书列表"""

    def test_list_books_empty_ok(self, client):
        """空列表也返回 200"""
        resp = client.get("/api/books/?limit=10")
        assert resp.status_code == 200
        data = resp.json()
        assert "books" in data
        assert "total" in data

    def test_list_books_with_data(self, client, sample_book):
        resp = client.get("/api/books/?limit=10")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        isbns = [b["isbn"] for b in data["books"]]
        assert sample_book["isbn"] in isbns

    def test_list_books_pagination(self, client):
        resp = client.get("/api/books/?limit=1&offset=0")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["books"]) <= 1

    def test_list_books_sort(self, client, sample_book):
        """按书名排序"""
        # 先插入另一本
        client.post("/api/books/manual", json={
            "isbn": "9787506365437",
            "title": "AAA First Book",
            "source": "manual",
        })
        resp = client.get("/api/books/?sort_by=title&sort_order=asc&limit=5")
        assert resp.status_code == 200


class TestBookDetail:
    """GET /api/books/{id} — 图书详情"""

    def test_get_detail(self, client, sample_book):
        """图书详情返回 BookDetailResponse（直接数据，非 ApiResponse 包装）"""
        resp = client.get(f"/api/books/{sample_book['book_id']}?shelf_id=0")
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == sample_book["title"]
        assert data["book_id"] == sample_book["book_id"]

    def test_get_detail_not_found(self, client):
        resp = client.get("/api/books/99999?shelf_id=0")
        assert resp.status_code in (200, 404)


class TestBookUpdate:
    """PUT /api/books/{id}/manual — 更新图书"""

    def test_update_basic(self, client, sample_book):
        """更新图书信息"""
        resp = client.put(
            f"/api/books/{sample_book['book_id']}/manual",
            json={"title": "三体（修订版）"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "updated_fields" in data["data"]

    def test_update_book_not_found(self, client):
        resp = client.put("/api/books/99999/manual", json={"title": "N/A"})
        assert resp.status_code in (200, 404)


class TestBookDelete:
    """DELETE /api/books/{id} — 删除图书"""

    def test_delete_book(self, client, sample_book):
        resp = client.delete(f"/api/books/{sample_book['book_id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    def test_delete_book_not_found(self, client):
        resp = client.delete("/api/books/99999")
        assert resp.status_code == 404


class TestBookSearch:
    """GET /api/books/search — 搜索图书"""

    def test_search_by_title(self, client, sample_book):
        resp = client.get(f"/api/books/search?keyword={sample_book['title']}")
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) >= 1
        titles = [r["title"] for r in results]
        assert sample_book["title"] in titles

    def test_search_by_author(self, client, sample_book):
        resp = client.get(f"/api/books/search?keyword={sample_book['author']}")
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) >= 1

    def test_search_no_results(self, client):
        resp = client.get("/api/books/search?keyword=XYZZY_NONEXISTENT_BOOK")
        assert resp.status_code == 200
        assert resp.json() == []
