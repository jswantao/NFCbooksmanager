# backend/app/services/google_books_service.py
"""
Google Books API 图书数据获取服务

作为豆瓣数据源的补充/降级方案，提供：
- 按 ISBN 搜索图书（q=isbn:{ISBN}）
- 按 Volume ID 获取详情
- 批量查询
- 封面图片 URL 处理

API 文档: https://developers.google.com/books/docs/v1/using

配额说明:
- 匿名请求: ~100 次/天
- API Key: 1000 次/天（免费配额）
- 可在 Google Cloud Console 申请更高配额

设计原则:
- 无 API Key 仍可使用（降级可用性优先）
- 中文图书元数据可能不完整，明确标记 source="google_books"
- 支持缓存减少重复请求
"""

import re
import asyncio
import time
from typing import Optional, Dict, Any, List
from datetime import datetime

import httpx
from loguru import logger

from app.core.config import get_settings
from app.utils.helpers import clean_isbn


class GoogleBooksError(Exception):
    """Google Books API 基础异常"""
    pass


class GoogleBooksNotFound(GoogleBooksError):
    """未找到图书"""
    pass


class GoogleBooksQuotaExceeded(GoogleBooksError):
    """API 配额超限"""
    pass


class SimpleCache:
    """TTL 内存缓存（同 douban_service 的缓存实现）"""

    def __init__(self, ttl: int = 3600, maxsize: int = 500):
        from cachetools import TTLCache
        self._cache: TTLCache = TTLCache(maxsize=maxsize, ttl=ttl)

    def get(self, key: str) -> Optional[Dict]:
        try:
            return self._cache[key]
        except KeyError:
            return None

    def set(self, key: str, data: Dict) -> None:
        self._cache[key] = data

    def clear(self) -> None:
        self._cache.clear()

    @property
    def size(self) -> int:
        return len(self._cache)


class GoogleBooksService:
    """
    Google Books API 服务

    使用方式:
        service = GoogleBooksService()
        book_data = await service.search_by_isbn("9787544291163")
    """

    BASE_URL = "https://www.googleapis.com/books/v1/volumes"

    def __init__(self):
        settings = get_settings()
        self._api_key = settings.GOOGLE_BOOKS_API_KEY or None
        self._enabled = settings.GOOGLE_BOOKS_ENABLED
        self.cache = SimpleCache()
        self._last_req = 0.0
        self._delay = 0.35  # Google API 免费配额 ~100 req/min，保守设置
        self._stats = {
            "requests": 0,
            "success": 0,
            "fail": 0,
            "not_found": 0,
            "quota_exceeded": 0,
            "cache_hits": 0,
        }

    # ==================== 属性 ====================

    @property
    def configured(self) -> bool:
        """是否已配置 API Key"""
        return bool(self._api_key and len(self._api_key) > 10)

    @property
    def enabled(self) -> bool:
        """数据源是否启用"""
        return self._enabled

    @property
    def stats(self) -> dict:
        return {
            **self._stats,
            "cache_size": self.cache.size,
            "api_key_configured": self.configured,
        }

    # ==================== 请求控制 ====================

    async def _rate_limit(self) -> None:
        elapsed = time.monotonic() - self._last_req
        if elapsed < self._delay:
            await asyncio.sleep(self._delay - elapsed)
        self._last_req = time.monotonic()

    def _build_params(self, extra: dict = None) -> dict:
        """构建请求参数，有 API Key 时自动附加"""
        params = extra or {}
        if self._api_key:
            params["key"] = self._api_key
        return params

    # ==================== 主入口：按 ISBN 搜索 ====================

    async def search_by_isbn(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        根据 ISBN 查询图书元数据

        API: GET /volumes?q=isbn:{ISBN}

        返回格式与 DoubanService.search_by_isbn 兼容。
        """
        if not self._enabled:
            return None

        isbn = clean_isbn(isbn)
        if len(isbn) not in (10, 13):
            logger.warning(f"Google Books: 无效的 ISBN: {isbn}")
            return None

        # 检查缓存
        cache_key = f"isbn:{isbn}"
        if cached := self.cache.get(cache_key):
            self._stats["cache_hits"] += 1
            logger.debug(f"Google Books 缓存命中: {isbn}")
            return cached

        try:
            result = await self._search_volume(f"isbn:{isbn}")
            if result:
                self.cache.set(cache_key, result)
                logger.info(f"[Google Books] 获取成功: {isbn} -> {result.get('title', '未知')[:30]}")
                return result
            return None
        except Exception:
            return None

    async def _search_volume(self, query: str) -> Optional[Dict[str, Any]]:
        """按查询条件搜索 Volume"""
        await self._rate_limit()
        self._stats["requests"] += 1

        try:
            async with httpx.AsyncClient(timeout=12) as client:
                resp = await client.get(
                    self.BASE_URL,
                    params=self._build_params({"q": query}),
                )

                if resp.status_code == 403:
                    self._stats["quota_exceeded"] += 1
                    logger.warning("Google Books API 配额超限或被限制")
                    return None

                if resp.status_code == 429:
                    self._stats["quota_exceeded"] += 1
                    logger.warning("Google Books API 速率限制，建议配置 API Key")
                    return None

                if resp.status_code != 200:
                    self._stats["fail"] += 1
                    logger.warning(f"Google Books API HTTP {resp.status_code}: {resp.text[:100]}")
                    return None

                data = resp.json()
                items = data.get("items", [])
                if not items:
                    self._stats["not_found"] += 1
                    return None

                self._stats["success"] += 1
                return self._parse_volume(items[0])

        except httpx.TimeoutException:
            self._stats["fail"] += 1
            logger.warning("Google Books API 请求超时")
            return None
        except Exception as e:
            self._stats["fail"] += 1
            logger.warning(f"Google Books API 请求异常: {e}")
            return None

    # ==================== 按 Volume ID 获取详情 ====================

    async def get_by_volume_id(self, volume_id: str) -> Optional[Dict[str, Any]]:
        """
        根据 Volume ID 获取完整图书详情

        API: GET /volumes/{volumeId}
        """
        if not self._enabled:
            return None

        cache_key = f"vol:{volume_id}"
        if cached := self.cache.get(cache_key):
            self._stats["cache_hits"] += 1
            return cached

        await self._rate_limit()
        self._stats["requests"] += 1

        try:
            async with httpx.AsyncClient(timeout=12) as client:
                resp = await client.get(
                    f"{self.BASE_URL}/{volume_id}",
                    params=self._build_params(),
                )

                if resp.status_code != 200:
                    self._stats["fail"] += 1
                    return None

                self._stats["success"] += 1
                result = self._parse_volume(resp.json())
                if result:
                    self.cache.set(cache_key, result)
                return result

        except Exception as e:
            self._stats["fail"] += 1
            logger.warning(f"Google Books get_by_volume_id 异常: {e}")
            return None

    # ==================== 批量查询 ====================

    async def search_by_isbns(self, isbns: List[str]) -> Dict[str, Optional[Dict[str, Any]]]:
        """
        批量查询多个 ISBN，返回 {isbn: result} 字典。
        并发数限制为 5，避免触发速率限制。
        """
        semaphore = asyncio.Semaphore(5)

        async def query_one(isbn: str) -> tuple:
            async with semaphore:
                try:
                    result = await self.search_by_isbn(isbn)
                    return isbn, result
                except Exception:
                    return isbn, None

        tasks = [query_one(isbn) for isbn in isbns]
        results = await asyncio.gather(*tasks)
        return dict(results)

    # ==================== 数据解析与映射 ====================

    def _parse_volume(self, item: dict) -> Optional[Dict[str, Any]]:
        """
        将 Google Books API Volume 映射为系统 Book 模型字段。

        API 字段路径: item.volumeInfo.{field}
        """
        vi = item.get("volumeInfo", {})
        if not vi.get("title"):
            return None

        # ISBN 提取（优先 ISBN_13，再 ISBN_10）
        isbn = ""
        for ident in vi.get("industryIdentifiers", []):
            if ident.get("type") == "ISBN_13":
                isbn = ident.get("identifier", "")
                break
        if not isbn:
            for ident in vi.get("industryIdentifiers", []):
                if ident.get("type") == "ISBN_10":
                    isbn = ident.get("identifier", "")
                    break
        if not isbn:
            isbn = item.get("id", "")

        # 封面图片
        image_links = vi.get("imageLinks", {}) or {}
        cover_url = self._pick_best_cover(image_links)

        # 作者
        authors = vi.get("authors", [])
        author_str = "、".join(authors) if authors else ""

        # 标题（含副标题）
        title = vi.get("title", "")
        if vi.get("subtitle"):
            title = f"{title}: {vi['subtitle']}"

        # 出版日期标准化
        pub_date = vi.get("publishedDate", "")
        pub_date = self._normalize_date(pub_date)

        # 简介截断
        description = vi.get("description", "") or ""
        if len(description) > 2000:
            description = description[:2000] + "..."

        # 分类标签
        categories = vi.get("categories", [])
        series = " / ".join(categories[:3]) if categories else ""

        # 评分
        rating = ""
        if vi.get("averageRating"):
            rating = str(round(vi["averageRating"], 1))

        return {
            "isbn": clean_isbn(isbn) if isbn else "",
            "title": title,
            "author": author_str,
            "publisher": vi.get("publisher", ""),
            "publish_date": pub_date,
            "cover_url": cover_url,
            "summary": description,
            "pages": str(vi.get("pageCount", "")),
            "rating": rating,
            "binding": "",
            "price": "",
            "original_title": "",
            "translator": "",
            "series": series,
            "douban_url": "",
            "google_volume_id": item.get("id", ""),
            "source": "google_books",
        }

    @staticmethod
    def _pick_best_cover(image_links: dict) -> str:
        """选取最佳封面图（优先级：extraLarge > large > medium > thumbnail > small）"""
        for size in ("extraLarge", "large", "medium", "thumbnail", "smallThumbnail"):
            if url := image_links.get(size, ""):
                # 替换 http 为 https 避免混合内容警告
                return url.replace("http://", "https://")
        return ""

    @staticmethod
    def _normalize_date(date_str: str) -> str:
        """
        出版日期标准化。
        Google 可能返回: "2008-01-01", "2008-01", "2008"
        统一为 "2008-01" 格式。
        """
        if not date_str:
            return ""

        # 完整日期: 2008-01-01 → 2008-01
        m = re.match(r'^(\d{4})-(\d{2})-\d{2}$', date_str)
        if m:
            return f"{m.group(1)}-{m.group(2)}"

        # 年月: 2008-01 → 保留
        if re.match(r'^\d{4}-\d{2}$', date_str):
            return date_str

        # 仅年份: 2008 → 保留
        if re.match(r'^\d{4}$', date_str):
            return date_str

        return date_str

    # ==================== 管理方法 ====================

    def clear_cache(self) -> None:
        self.cache.clear()
        logger.info("Google Books 缓存已清空")

    def reset_stats(self) -> None:
        self._stats = {
            "requests": 0, "success": 0, "fail": 0,
            "not_found": 0, "quota_exceeded": 0, "cache_hits": 0,
        }


# 全局共享单例
google_books_service = GoogleBooksService()
