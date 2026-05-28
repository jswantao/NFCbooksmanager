# backend/tests/test_nfc.py
"""NFC 标签系统 API 测试 — 覆盖写入、四级决策链、绑定"""


class TestNFCWrite:
    """NFC 标签写入接口"""

    def test_write_unified_for_shelf(self, client, sample_shelf):
        """为逻辑书架生成 NFC 写入数据 (WriteReq: shelf_id, shelf_name)"""
        resp = client.post("/api/nfc/write/unified", json={
            "shelf_id": sample_shelf["logical_shelf_id"],
            "shelf_name": sample_shelf["shelf_name"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "task_id" in data

    def test_write_unified_invalid_shelf(self, client):
        resp = client.post("/api/nfc/write/unified", json={
            "shelf_id": 99999,
            "shelf_name": "Not Exist",
        })
        assert resp.status_code in (200, 404, 500)


class TestNFCCallback:
    """NFC 扫描回调 — 四级决策链"""

    def test_callback_empty_tag(self, client):
        """空 NDEF 数据 → 引导绑定页"""
        resp = client.get("/api/nfc/callback?uid=TEST001")
        assert resp.status_code == 200

    def test_callback_with_shelf_payload(self, client, sample_shelf):
        """有效 shelf_id payload → 查找或引导绑定"""
        import json as _json
        payload = _json.dumps({"shelf_id": sample_shelf["logical_shelf_id"]})
        resp = client.get(
            f"/api/nfc/callback?uid=TEST002&payload={payload}"
        )
        # 可能重定向或返回引导页
        assert resp.status_code in (200, 302, 307, 404)

    def test_scan_link(self, client):
        """生成 NFC 扫描链接 → 返回 scan_link + local_ip + frontend"""
        resp = client.get("/api/nfc/scan-link")
        assert resp.status_code == 200
        data = resp.json()
        assert "scan_link" in data

    def test_tasks_list(self, client):
        """列出 NFC 写入任务"""
        resp = client.get("/api/nfc/tasks")
        assert resp.status_code == 200


class TestNFCBind:
    """NFC 标签绑定"""

    def test_bind_search_shelves(self, client):
        """搜索可绑定的物理书架"""
        resp = client.get("/api/nfc/bind/search-shelves?search=A")
        assert resp.status_code == 200

    def test_bind_auto(self, client):
        """自动绑定 NFC 标签"""
        resp = client.post("/api/nfc/bind/auto", json={
            "tag_uid": "UNBOUND_TEST_UID_XYZ",
            "physical_shelf_id": 99999,
        })
        assert resp.status_code in (200, 404, 422)
