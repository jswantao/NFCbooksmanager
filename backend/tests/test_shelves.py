# backend/tests/test_shelves.py
"""逻辑书架 API 测试 — 覆盖 CRUD + 图书关联"""


class TestShelfCreate:
    """POST /api/shelves/ — 创建逻辑书架"""

    def test_create_shelf(self, client):
        resp = client.post("/api/shelves/", json={
            "shelf_name": "推理小说",
            "description": "悬疑与推理文学",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "logical_shelf_id" in data["data"]

    def test_create_shelf_minimal(self, client):
        resp = client.post("/api/shelves/", json={"shelf_name": "诗歌"})
        assert resp.status_code == 200
        assert resp.json()["success"] is True


class TestShelfList:
    """GET /api/shelves/ — 返回 List[ShelfInfoResponse]"""

    def test_list_shelves(self, client, sample_shelf):
        resp = client.get("/api/shelves/")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        names = [s["shelf_name"] for s in data]
        assert sample_shelf["shelf_name"] in names

    def test_list_shelves_search(self, client, sample_shelf):
        resp = client.get(f"/api/shelves/?search={sample_shelf['shelf_name']}")
        assert resp.status_code == 200


class TestShelfDetail:
    """GET /api/shelves/{id} — 书架详情"""

    def test_get_shelf_detail(self, client, sample_shelf):
        resp = client.get(f"/api/shelves/{sample_shelf['logical_shelf_id']}")
        assert resp.status_code == 200

    def test_get_shelf_not_found(self, client):
        resp = client.get("/api/shelves/99999")
        assert resp.status_code == 404


class TestShelfDelete:
    """DELETE /api/shelves/{id} — 删除书架"""

    def test_delete_shelf(self, client, sample_shelf):
        resp = client.delete(f"/api/shelves/{sample_shelf['logical_shelf_id']}")
        assert resp.status_code == 200
        assert resp.json()["success"] is True


class TestShelfBookRelation:
    """书架-图书关联 — POST /api/shelves/{id}/books"""

    def test_add_book_to_shelf(self, client, sample_book, sample_shelf):
        """添加图书到书架"""
        resp = client.post(
            f"/api/shelves/{sample_shelf['logical_shelf_id']}/books",
            json={"book_id": sample_book["book_id"]},
        )
        assert resp.status_code == 200

    def test_add_book_not_found(self, client, sample_shelf):
        resp = client.post(
            f"/api/shelves/{sample_shelf['logical_shelf_id']}/books",
            json={"book_id": 99999},
        )
        assert resp.status_code in (200, 404)

    def test_shelf_books_list(self, client, sample_book, sample_shelf):
        """获取书架中的图书列表"""
        client.post(
            f"/api/shelves/{sample_shelf['logical_shelf_id']}/books",
            json={"book_id": sample_book["book_id"]},
        )
        resp = client.get(f"/api/shelves/{sample_shelf['logical_shelf_id']}/books")
        assert resp.status_code == 200
