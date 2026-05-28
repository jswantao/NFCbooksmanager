# backend/app/services/taiwan_isbn_service.py
"""
台湾国家图书馆 ISBN 查询服务

数据源: https://isbn.ncl.edu.tw/NEW_ISBNNet/H30_SearchBooks.php
提供台湾出版社出版的图书元数据检索。

特性:
- 按 ISBN 精确搜索（推荐方式）
- 按书名搜索（回退方式）
- 详情页解析获取完整元数据
- 中华民国年份 → 公历年份自动转换
- CSRF token 管理与请求节流

反爬策略:
- 模拟浏览器 User-Agent
- 每次搜索前获取新 CSRF token
- 请求间隔 ≥1 秒
- 尊重网站结构，不做高频批量请求

数据字段映射:
- 書名 → title
- 作者 → author
- 出版機構 → publisher
- ISBN(裝訂方式) → isbn (提取纯数字)
- 出版年月 → publish_date (ROC→公历)
- 頁數 → pages
- 定價 → price
- 主題標題 / 關鍵字詞 → summary
- 建議上架分類 → series
"""

import re
import asyncio
import time
from typing import Optional, Dict, Any, List, Tuple
from urllib.parse import urljoin

import httpx
from loguru import logger

from app.core.config import get_settings
from app.utils.helpers import clean_isbn

# 网站基础 URL
_BASE = "https://isbn.ncl.edu.tw/NEW_ISBNNet/"
_SEARCH_PAGE = f"{_BASE}H30_SearchBooks.php?&Pact=DisplayAll4Simple"
_RESULTS_PAGE = f"{_BASE}main_DisplayResults.php"
_DETAIL_PAGE = f"{_BASE}main_DisplayRecord.php"
_SEARCH_URL = f"{_BASE}H30_SearchBooks.php?&Pact=DisplayAll4Simple"

# 中华民国年份偏移量（ROC year + 1911 = Gregorian year）
_ROC_YEAR_OFFSET = 1911


class TaiwanISBNError(Exception):
    """台湾 ISBN 服务基础异常"""
    pass


class TaiwanISBNNotFound(TaiwanISBNError):
    """未找到匹配图书"""
    pass


class TaiwanISBNBlocked(TaiwanISBNError):
    """请求被拒绝（反爬/限流）"""
    pass


class TaiwanISBNService:
    """
    台湾国家图书馆 ISBN 查询服务

    用法:
        svc = TaiwanISBNService()
        data = await svc.search_by_isbn("9789862627174")
        # → {title, author, publisher, isbn, ...}
    """

    UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    )

    def __init__(self):
        settings = get_settings()
        self._delay = max(settings.DOUBAN_REQUEST_DELAY, 1.0)
        self._last_req = 0.0
        self._cookie_jar: Optional[httpx.Cookies] = None
        self._stats = {"requests": 0, "success": 0, "fail": 0, "not_found": 0}

    @property
    def stats(self) -> dict:
        return dict(self._stats)

    async def _rate_limit(self) -> None:
        elapsed = time.monotonic() - self._last_req
        if elapsed < self._delay:
            await asyncio.sleep(self._delay - elapsed)
        self._last_req = time.monotonic()

    def _build_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=15,
            follow_redirects=True,
            verify=False,  # 台湾政府网站 SSL 证书兼容性问题
            headers={
                "User-Agent": self.UA,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
                "Accept-Encoding": "gzip, deflate, br",
            },
            cookies=self._cookie_jar,
        )

    # ==================== CSRF Token 获取 ====================

    async def _fetch_csrf_token(self, client: httpx.AsyncClient) -> str:
        """
        从搜索页面获取 CSRF token

        每次搜索前需要先获取有效 token。
        同时保存 cookie 以维持会话。
        """
        resp = await client.get(_SEARCH_PAGE)
        resp.raise_for_status()
        self._cookie_jar = client.cookies

        # 从 HTML 中提取 csrftoken
        m = re.search(r'name="csrftoken"\s+[^>]*value="([^"]+)"', resp.text)
        if not m:
            m = re.search(r'id="csrftoken"\s+[^>]*value="([^"]+)"', resp.text)
        if not m:
            raise TaiwanISBNBlocked("无法获取 CSRF token，网站可能限制了访问")
        return m.group(1)

    # ==================== 主入口：按 ISBN 搜索 ====================

    async def search_by_isbn(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        根据 ISBN 搜索台湾出版图书

        流程:
        1. GET 搜索页面 → 获取 CSRF token + Session
        2. POST ISBN 搜索 → 302 重定向至结果页
        3. 解析结果列表，命中多条时取第一条
        4. GET 详情页 → 提取完整字段
        """
        isbn = clean_isbn(isbn)
        if len(isbn) not in (10, 13):
            return None

        await self._rate_limit()
        self._stats["requests"] += 1

        try:
            async with self._build_client() as client:
                csrf = await self._fetch_csrf_token(client)

                # POST 搜索 (FB_clicked 使用 onclick 中设定的值)
                resp = await client.post(
                    _SEARCH_URL,
                    data={
                        "FO_SearchField0": "ISBN",
                        "FO_SearchValue0": isbn,
                        "csrftoken": csrf,
                        "FB_pageSID": "Simple",
                        "FO_Match": "2",
                        "FB_clicked": "FB_開始查詢",
                        "FB_Search": "\xa0開始查詢\xa0",
                        "FO_每頁筆數": "10",
                        "FO_目前頁數": "1",
                        "FB_ListOri": "",
                    },
                )
                resp.raise_for_status()

                # 解析搜索结果或详情页
                result = await self._handle_search_response(client, resp, isbn)

                # ISBN 未命中时，回退到 All 字段搜索
                if not result:
                    result = await self._search_all_fields(client, csrf, isbn)

                return result

        except TaiwanISBNError:
            raise
        except httpx.TimeoutException:
            self._stats["fail"] += 1
            logger.warning(f"台湾ISBN服务请求超时: {isbn}")
            return None
        except Exception as e:
            self._stats["fail"] += 1
            logger.warning(f"台湾ISBN服务请求异常 [{isbn}]: {e}")
            return None

    # ==================== 按书名搜索 ====================

    async def search_by_title(self, title: str) -> Optional[Dict[str, Any]]:
        """
        按书名搜索台湾出版图书

        适用于无 ISBN 或 ISBN 查询无结果的场景。
        """
        if not title or not title.strip():
            return None

        await self._rate_limit()
        self._stats["requests"] += 1

        try:
            async with self._build_client() as client:
                csrf = await self._fetch_csrf_token(client)

                resp = await client.post(
                    _SEARCH_URL,
                    data={
                        "FO_SearchField0": "Title",
                        "FO_SearchValue0": title.strip(),
                        "csrftoken": csrf,
                        "FB_pageSID": "Simple",
                        "FO_Match": "2",
                        "FB_clicked": "FB_開始查詢",
                        "FB_Search": "\xa0開始查詢\xa0",
                        "FO_每頁筆數": "10",
                        "FO_目前頁數": "1",
                        "FB_ListOri": "",
                    },
                )
                resp.raise_for_status()

                return await self._handle_search_response(client, resp)

        except TaiwanISBNError:
            raise
        except httpx.TimeoutException:
            self._stats["fail"] += 1
            return None
        except Exception as e:
            self._stats["fail"] += 1
            logger.warning(f"台湾ISBN服务书名搜索异常 [{title}]: {e}")
            return None

    async def _search_all_fields(
        self, client: httpx.AsyncClient, csrf: str, query: str
    ) -> Optional[Dict[str, Any]]:
        """
        ISBN 未命中时回退到"所有字段"搜索
        """
        resp = await client.post(
            _SEARCH_URL,
            data={
                "FO_SearchField0": "All",
                "FO_SearchValue0": query,
                "csrftoken": csrf,
                "FB_pageSID": "Simple",
                "FO_Match": "2",
                "FB_clicked": "FB_開始查詢",
                "FB_Search": "\xa0開始查詢\xa0",
                "FO_每頁筆數": "10",
                "FO_目前頁數": "1",
                "FB_ListOri": "",
            },
        )
        resp.raise_for_status()
        return await self._handle_search_response(client, resp, query)

    # ==================== 搜索响应处理（共享逻辑） ====================

    async def _handle_search_response(
        self, client: httpx.AsyncClient, resp: httpx.Response, fallback_isbn: str = ""
    ) -> Optional[Dict[str, Any]]:
        """
        统一处理搜索响应

        - 详情页 (main_DisplayRecord.php) → 解析详情
        - 结果列表 (main_DisplayResults.php) → 取第一条 → 获取详情
        - 搜索页 (H30_SearchBooks.php) → 无结果
        """
        html = resp.text
        url = str(resp.url)

        # 无结果检查
        if "找不到符合" in html or "無資料" in html:
            self._stats["not_found"] += 1
            return None

        # 直接跳转到详情页
        if "main_DisplayRecord.php" in url:
            result = await self._parse_detail_page(html, fallback_isbn)
            if result:
                self._stats["success"] += 1
            return result

        # 结果列表页：提取第一条结果链接
        rows = self._parse_result_table(html)
        if not rows:
            self._stats["not_found"] += 1
            return None

        first = rows[0]
        detail_url = first.get("detail_url", "")
        if detail_url:
            detail_resp = await client.get(urljoin(_BASE, detail_url))
            detail_resp.raise_for_status()
            result = await self._parse_detail_page(detail_resp.text, fallback_isbn)
            if result:
                self._stats["success"] += 1
                return result

        # 无详情页时用搜索结果构建基础字段
        self._stats["success"] += 1
        return self._from_search_result(first)

    # ==================== 搜索结果表解析 ====================

    @staticmethod
    def _parse_result_table(html: str) -> List[Dict[str, Any]]:
        """
        解析搜索结果表格

        表格列: 序号 | (空白) | 书名 | 作者 | 出版者 | 日期 | 适读对象 | 分级注记
        """
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "html.parser")
        tables = soup.find_all("table")

        for table in tables:
            ths = table.find_all("th")
            th_texts = [t.get_text(strip=True) for t in ths]
            # 确认是结果表格（含"書名"表头）
            if "書名" not in th_texts:
                continue

            rows = []
            for tr in table.find_all("tr"):
                tds = tr.find_all("td")
                if len(tds) < 4:
                    continue
                texts = [td.get_text(strip=True) for td in tds]
                # 跳过表头行
                if "書名" in texts:
                    continue
                # 跳过"无资料"行
                if "無資料" in texts:
                    continue

                # 提取书名链接
                title_link = tds[2].find("a") if len(tds) > 2 else None
                detail_url = title_link.get("href", "") if title_link else ""
                title = title_link.get_text(strip=True) if title_link else texts[2] if len(texts) > 2 else ""

                rows.append({
                    "title": title,
                    "author": texts[3] if len(texts) > 3 else "",
                    "publisher": texts[4] if len(texts) > 4 else "",
                    "publish_date": texts[5] if len(texts) > 5 else "",
                    "detail_url": detail_url,
                })
            return rows

        return []

    # ==================== 详情页解析 ====================

    @staticmethod
    async def _parse_detail_page(html: str, fallback_isbn: str = "") -> Optional[Dict[str, Any]]:
        """
        解析图书详情页

        字段布局为 key-value 对:
        書名 → title
        作者 → author
        出版機構 → publisher
        ISBN(裝訂方式) → isbn
        出版年月 → publish_date
        頁數 → pages
        定價 → price
        主題標題 → subject
        關鍵字詞 → keywords
        """
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text("\n", strip=True)
        lines = [l.strip() for l in text.split("\n") if l.strip()]

        # 找到"顯示書目資料"开始的数据区域
        start_idx = None
        for i, line in enumerate(lines):
            if "顯示書目資料" in line:
                start_idx = i + 1
                break

        if start_idx is None:
            return None

        data = {}
        relevant_lines = lines[start_idx:]
        i = 0
        while i < len(relevant_lines) - 1:
            key = relevant_lines[i]
            value = relevant_lines[i + 1] if i + 1 < len(relevant_lines) else ""

            # 跳过非数据行
            if key in ("回到檢索結果", "顯示出版資訊", "封面", "預行編目資料",
                       "機讀格式", "DataBlock格式", "卡片格式", "聯絡信箱",
                       "顯示書目資料", "0-3歲嬰幼兒圖書分齡主題",
                       "3-6歲幼兒圖書分齡主題"):
                i += 1
                continue

            # 下载链接等，跳过
            if any(skip in key for skip in ("下載", "另開", "著作權", "本館", "總機", "歡迎")):
                i += 1
                continue

            data[key] = value
            i += 2  # key-value pair, skip both

        if not data.get("書名"):
            return None

        return TaiwanISBNService._map_fields(data, fallback_isbn)

    # ==================== 字段映射 ====================

    @staticmethod
    def _map_fields(data: Dict[str, str], fallback_isbn: str = "") -> Dict[str, Any]:
        """
        将台湾 ISBN 数据库字段映射为系统 Book 模型字段
        """
        # ISBN 提取
        isbn_raw = data.get("ISBN(裝訂方式)", "")
        isbn = ""
        if isbn_raw:
            # "9789862627174 (平裝)" → "9789862627174"
            m = re.search(r"(97[89]\d{10})", isbn_raw)
            if m:
                isbn = m.group(1)
        if not isbn:
            isbn = fallback_isbn

        # 价格 "NT$450" → "450"
        price_raw = data.get("定價", "")
        price = ""
        if price_raw:
            price_m = re.search(r"[\d,]+", price_raw.replace("NT$", "").replace("NT", ""))
            if price_m:
                price = price_m.group(0)

        # 出版年月 "115/01" → "2026-01"
        pub_date_raw = data.get("出版年月", "")
        pub_date = TaiwanISBNService._convert_roc_date(pub_date_raw)

        # 摘要（组合主题 + 关键词）
        subject = data.get("主題標題", "")
        keywords = data.get("關鍵字詞", "")
        summary_parts = [p for p in [subject, keywords] if p]
        summary = "；".join(summary_parts) if summary_parts else ""

        # 丛书名（建议上架分类）
        category = data.get("建議上架分類", "")

        return {
            "isbn": clean_isbn(isbn) if isbn else fallback_isbn,
            "title": data.get("書名", ""),
            "author": data.get("作者", ""),
            "publisher": data.get("出版機構", ""),
            "publish_date": pub_date,
            "pages": data.get("頁數", ""),
            "price": price,
            "binding": "",  # 从 ISBN(裝訂方式) 中提取
            "summary": summary,
            "series": category,
            "cover_url": "",
            "rating": "",
            "translator": "",
            "original_title": "",
            "douban_url": "",
            "source": "taiwan_isbn",
            "lookup_source": "taiwan_isbn",
        }

    @staticmethod
    def _from_search_result(row: Dict[str, Any]) -> Dict[str, Any]:
        """
        从搜索结果行构建基础字段（无详情页时使用）
        """
        pub_date = TaiwanISBNService._convert_roc_date(row.get("publish_date", ""))
        return {
            "isbn": "",
            "title": row.get("title", ""),
            "author": row.get("author", ""),
            "publisher": row.get("publisher", ""),
            "publish_date": pub_date,
            "pages": "",
            "price": "",
            "binding": "",
            "summary": "",
            "series": "",
            "cover_url": "",
            "rating": "",
            "translator": "",
            "original_title": "",
            "douban_url": "",
            "source": "taiwan_isbn",
            "lookup_source": "taiwan_isbn",
        }

    @staticmethod
    def _convert_roc_date(roc_date: str) -> str:
        """
        中华民国年份 → 公历年份

        "115/01" → "2026-01"
        "112/03" → "2023-03"
        """
        if not roc_date:
            return ""
        m = re.match(r"(\d{2,3})/(\d{2})", roc_date)
        if m:
            roc_year = int(m.group(1))
            month = m.group(2)
            gregorian_year = roc_year + _ROC_YEAR_OFFSET
            return f"{gregorian_year}-{month}"
        return roc_date

    # ==================== 管理方法 ====================

    def reset_stats(self) -> None:
        self._stats = {"requests": 0, "success": 0, "fail": 0, "not_found": 0}


# 全局共享单例
taiwan_isbn_service = TaiwanISBNService()
