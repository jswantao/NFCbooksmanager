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
- 持久化 httpx 客户端复用连接池，避免重复 TCP/TLS 握手
- asyncio.Lock 保护限流逻辑，防止并发时限流失效
"""

import re
import asyncio
import time
from typing import Optional, Dict, Any, List, Tuple

import httpx
from loguru import logger

from app.core.config import get_settings
from app.utils.cache import SimpleCache
from app.utils.helpers import clean_isbn
from app.services.douban_parser import _SUMMARY_MAX_LENGTH


# ==================== 自定义异常 ====================

class GoogleBooksError(Exception):
    """Google Books API 基础异常"""
    pass


class GoogleBooksNotFound(GoogleBooksError):
    """未找到图书"""
    pass


class GoogleBooksQuotaExceeded(GoogleBooksError):
    """API 配额超限"""
    pass


# ==================== 服务主类 ====================

class GoogleBooksService:
    """
    Google Books API 服务。

    生命周期管理：
    - 应用启动时通过 FastAPI lifespan 调用 initialize()（可选）
    - 应用关闭时调用 close() 释放连接池

    使用方式：
        book_data = await google_books_service.search_by_isbn("9787544291163")
    """

    BASE_URL = "https://www.googleapis.com/books/v1/volumes"

    def __init__(self):
        self.cache = SimpleCache(ttl=3600, maxsize=500)

        self._last_req: float = 0.0
        self._client: Optional[httpx.AsyncClient] = None

        # asyncio 对象延迟初始化，避免模块导入时与事件循环不匹配
        self._rate_lock: Optional[asyncio.Lock] = None
        self._cache_lock: Optional[asyncio.Lock] = None

        self._stats: Dict[str, int] = {
            "requests": 0,
            "success": 0,
            "fail": 0,
            "not_found": 0,
            "quota_exceeded": 0,
            "cache_hits": 0,
        }

    # ==================== 生命周期 ====================

    def _ensure_locks(self) -> None:
        """
        延迟初始化 asyncio.Lock。

        在首次异步调用时触发，确保在运行中的事件循环内创建，
        避免模块导入时与事件循环不匹配的问题。
        """
        if self._rate_lock is None:
            self._rate_lock = asyncio.Lock()
        if self._cache_lock is None:
            self._cache_lock = asyncio.Lock()

    async def _get_client(self) -> httpx.AsyncClient:
        """
        获取持久化 HTTP 客户端。

        客户端在首次调用时创建并复用连接池，避免重复 TCP/TLS 握手。
        若客户端已关闭（如调用过 close()），自动重建。

        Returns:
            活跃的 httpx.AsyncClient 实例。
        """
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=12.0,
                follow_redirects=True,
            )
        return self._client

    async def close(self) -> None:
        """
        释放持久化 HTTP 客户端连接池。

        应在应用关闭时调用（FastAPI lifespan shutdown 阶段）。
        """
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None
            logger.info("GoogleBooksService HTTP 客户端已关闭")

    # ==================== 配置属性（动态读取，支持热更新） ====================

    @property
    def _api_key(self) -> Optional[str]:
        """
        动态读取 Google Books API Key。

        每次访问时从 Settings 读取，支持运行时热更新，
        无需重启即可生效。
        """
        key = get_settings().GOOGLE_BOOKS_API_KEY
        return key if key else None

    @property
    def enabled(self) -> bool:
        """
        动态读取数据源启用状态。

        每次访问时从 Settings 读取，支持运行时热更新。
        """
        return get_settings().GOOGLE_BOOKS_ENABLED

    @property
    def _delay(self) -> float:
        """
        动态读取请求间隔配置。

        优先从 Settings 读取 GOOGLE_BOOKS_REQUEST_DELAY，
        未配置时使用保守默认值 0.35 秒
        （Google API 免费配额约 100 次/分钟）。
        """
        return getattr(get_settings(), "GOOGLE_BOOKS_REQUEST_DELAY", 0.35)

    @property
    def stats(self) -> Dict[str, Any]:
        """
        获取服务运行统计。

        Returns:
            包含请求统计、缓存状态和 API Key 配置状态的字典。
        """
        return {
            **self._stats,
            "cache_size": self.cache.size,
            "api_key_configured": self._api_key is not None,
            "enabled": self.enabled,
        }

    # ==================== 请求控制 ====================

    async def _rate_limit(self) -> None:
        """
        原子化请求频率限制。

        使用 asyncio.Lock 保护"读取时间戳→计算等待→更新时间戳"的完整原子操作，
        防止多协程并发时同时通过限流检查并同时发出请求。
        """
        self._ensure_locks()
        async with self._rate_lock:
            elapsed = time.monotonic() - self._last_req
            wait = self._delay - elapsed
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_req = time.monotonic()

    def _build_params(self, extra: Optional[Dict] = None) -> Dict[str, str]:
        """
        构建请求参数，有 API Key 时自动附加。

        Args:
            extra: 额外的查询参数。

        Returns:
            完整参数字典。
        """
        params: Dict[str, str] = dict(extra or {})
        if self._api_key:
            params["key"] = self._api_key
        return params

    async def _request(
        self,
        url: str,
        params: Optional[Dict] = None,
    ) -> Optional[httpx.Response]:
        """
        执行 HTTP GET 请求（带限流、连接复用和统一错误处理）。

        统一处理 429（速率限制）和 403（配额超限/权限拒绝），
        其他 HTTP 错误记录警告后返回 None。

        Args:
            url: 请求 URL。
            params: URL 查询参数（不含 API Key，由 _build_params 添加）。

        Returns:
            httpx.Response（仅 200 时返回）；失败返回 None。
        """
        await self._rate_limit()
        self._stats["requests"] += 1

        try:
            client = await self._get_client()
            resp = await client.get(url, params=self._build_params(params))

            if resp.status_code == 429:
                self._stats["quota_exceeded"] += 1
                logger.warning(
                    "Google Books API 速率限制（429），建议配置 API Key 提升配额"
                )
                return None

            if resp.status_code == 403:
                self._stats["quota_exceeded"] += 1
                logger.warning(
                    "Google Books API 访问被拒绝（403），可能配额超限或 API Key 无效"
                )
                return None

            if resp.status_code != 200:
                self._stats["fail"] += 1
                logger.warning(
                    f"Google Books API HTTP {resp.status_code}: "
                    f"{resp.text[:100]}"
                )
                return None

            self._stats["success"] += 1
            return resp

        except httpx.TimeoutException:
            self._stats["fail"] += 1
            logger.warning("Google Books API 请求超时")
            return None
        except Exception as e:
            self._stats["fail"] += 1
            logger.warning(f"Google Books API 请求异常: {e}")
            return None

    # ==================== 主入口：按 ISBN 搜索 ====================

    async def search_by_isbn(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        根据 ISBN 查询图书元数据。

        API: GET /volumes?q=isbn:{ISBN}

        返回格式与 DoubanService.search_by_isbn 兼容，
        遵循统一字段规范（见 douban_parser._EMPTY_BOOK）。

        Args:
            isbn: 图书 ISBN，支持带连字符格式（自动清洗为纯数字）。

        Returns:
            图书元数据字典；未找到或服务不可用时返回 None。
        """
        if not self.enabled:
            return None

        self._ensure_locks()
        isbn = clean_isbn(isbn)

        if len(isbn) not in (10, 13):
            logger.warning(f"Google Books: 无效的 ISBN: {isbn!r}")
            return None

        # 无锁读缓存（SimpleCache 内部读为原子操作）
        cache_key = f"isbn:{isbn}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            self._stats["cache_hits"] += 1
            logger.debug(f"Google Books 缓存命中: {isbn}")
            return cached

        try:
            result = await self._search_volume(f"isbn:{isbn}")
            if result:
                # 写缓存：加锁 + double-check 防止重复写入
                async with self._cache_lock:
                    if self.cache.get(cache_key) is None:
                        self.cache.set(cache_key, result)
                logger.info(
                    f"[Google Books] 获取成功: {isbn} → "
                    f"{result.get('title', '未知')[:30]}"
                )
            return result
        except Exception as e:
            logger.debug(f"Google Books search_by_isbn 异常: {e}")
            return None

    async def _search_volume(self, query: str) -> Optional[Dict[str, Any]]:
        """
        按查询字符串搜索 Volume，返回第一条结果。

        Args:
            query: Google Books 查询字符串，如 "isbn:9787544291163"。

        Returns:
            解析后的图书元数据字典；无结果时返回 None。
        """
        resp = await self._request(self.BASE_URL, params={"q": query})
        if resp is None:
            return None

        data = resp.json()
        items = data.get("items", [])
        if not items:
            self._stats["not_found"] += 1
            return None

        return self._parse_volume(items[0])

    # ==================== 按 Volume ID 获取详情 ====================

    async def get_by_volume_id(self, volume_id: str) -> Optional[Dict[str, Any]]:
        """
        根据 Volume ID 获取完整图书详情。

        API: GET /volumes/{volumeId}

        Args:
            volume_id: Google Books Volume ID（如 "zyTCAlFPjgYC"）。

        Returns:
            图书元数据字典；失败返回 None。
        """
        if not self.enabled:
            return None

        self._ensure_locks()

        cache_key = f"vol:{volume_id}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            self._stats["cache_hits"] += 1
            return cached

        resp = await self._request(f"{self.BASE_URL}/{volume_id}")
        if resp is None:
            return None

        result = self._parse_volume(resp.json())
        if result:
            async with self._cache_lock:
                if self.cache.get(cache_key) is None:
                    self.cache.set(cache_key, result)

        return result

    # ==================== 批量查询 ====================

    async def search_by_isbns(
        self,
        isbns: List[str],
        concurrency: int = 3,
    ) -> Dict[str, Optional[Dict[str, Any]]]:
        """
        批量查询多个 ISBN，返回 {isbn: result} 字典。

        并发数由 concurrency 参数控制（默认 3），配合 _rate_lock 防止
        并发时限流竞态。实际请求仍受 _rate_limit 串行化约束，
        Semaphore 仅限制同时等待限流队列的协程数量。

        Args:
            isbns: ISBN 列表。
            concurrency: 最大并发协程数，默认 3。

        Returns:
            {isbn: 图书元数据字典 或 None} 的字典。
        """
        semaphore = asyncio.Semaphore(concurrency)

        async def query_one(isbn: str) -> Tuple[str, Optional[Dict[str, Any]]]:
            async with semaphore:
                try:
                    result = await self.search_by_isbn(isbn)
                    return isbn, result
                except Exception as e:
                    logger.debug(f"Google Books 批量查询单条异常 [{isbn}]: {e}")
                    return isbn, None

        results = await asyncio.gather(*(query_one(isbn) for isbn in isbns))
        return dict(results)

    # ==================== 数据解析与映射 ====================

    def _parse_volume(self, item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        将 Google Books API Volume 对象映射为系统统一图书字段规范。

        字段规范与 douban_parser._EMPTY_BOOK 保持一致，所有字段均有值，
        缺失时填充空字符串，保证调用方无需差异处理。

        注意：
        - Google Books 无专门的丛书（series）字段，series 填空
        - categories（图书分类）映射到 tags 字段
        - google_volume_id 不作为标准字段暴露，避免破坏统一规范

        Args:
            item: Google Books API 返回的单个 Volume 对象。

        Returns:
            图书元数据字典；volumeInfo 无 title 时返回 None。
        """
        vi = item.get("volumeInfo", {})
        if not vi.get("title"):
            return None

        # ── ISBN（优先 ISBN_13，再 ISBN_10，最后 Volume ID 兜底）──────
        isbn = _extract_isbn_from_identifiers(
            vi.get("industryIdentifiers", []),
            fallback=item.get("id", ""),
        )

        # ── 封面（优先最高清图）──────────────────────────────────────
        image_links = vi.get("imageLinks") or {}
        cover_url = _pick_best_cover(image_links)

        # ── 作者（多作者以顿号连接）──────────────────────────────────
        authors = vi.get("authors") or []
        author_str = "、".join(a for a in authors if a)

        # ── 书名（含副标题时拼接）────────────────────────────────────
        title = vi.get("title", "")
        subtitle = vi.get("subtitle", "")
        if subtitle:
            title = f"{title}: {subtitle}"

        # ── 出版日期（标准化为 YYYY-MM 或 YYYY）──────────────────────
        pub_date = _normalize_google_date(vi.get("publishedDate", ""))

        # ── 简介（截断，与其他模块保持一致，不添加省略号）────────────
        description = vi.get("description") or ""
        description = description[:_SUMMARY_MAX_LENGTH]

        # ── 分类标签（Google categories → tags，不映射到 series）─────
        categories = vi.get("categories") or []
        tags = " / ".join(categories[:5]) if categories else ""

        # ── 评分（校验范围 0 < rating ≤ 5，Google 评分满分为 5）──────
        rating = _parse_google_rating(vi.get("averageRating"))

        return {
            # 标准字段
            "isbn": clean_isbn(isbn) if isbn else "",
            "douban_id": "",
            "title": title,
            "author": author_str,
            "translator": "",
            "publisher": vi.get("publisher", ""),
            "publish_date": pub_date,
            "cover_url": cover_url,
            "summary": description,
            "rating": rating,
            "pages": str(vi.get("pageCount", "")),
            "price": "",
            "binding": "",
            "original_title": "",
            "series": "",
            "tags": tags,
            "douban_url": "",
            "source": "google_books",
        }

    # ==================== 管理方法 ====================

    async def clear_cache(self) -> None:
        """清空缓存（异步安全）"""
        self._ensure_locks()
        async with self._cache_lock:
            self.cache.clear()
        logger.info("Google Books 缓存已清空")

    def reset_stats(self) -> None:
        """重置请求统计计数器"""
        self._stats = {
            "requests": 0,
            "success": 0,
            "fail": 0,
            "not_found": 0,
            "quota_exceeded": 0,
            "cache_hits": 0,
        }
        logger.info("Google Books 请求统计已重置")


# ==================== 模块级工具函数 ====================

def _extract_isbn_from_identifiers(
    identifiers: List[Dict[str, str]],
    fallback: str = "",
) -> str:
    """
    从 industryIdentifiers 列表中提取 ISBN。

    优先级：ISBN_13 > ISBN_10 > fallback（Volume ID）。

    Args:
        identifiers: volumeInfo.industryIdentifiers 列表。
        fallback: 无 ISBN 时的兜底值（通常为 Volume ID）。

    Returns:
        ISBN 字符串或 fallback 值。
    """
    isbn13 = ""
    isbn10 = ""
    for ident in identifiers:
        id_type = ident.get("type", "")
        id_value = ident.get("identifier", "")
        if id_type == "ISBN_13" and not isbn13:
            isbn13 = id_value
        elif id_type == "ISBN_10" and not isbn10:
            isbn10 = id_value
    return isbn13 or isbn10 or fallback


def _pick_best_cover(image_links: Dict[str, str]) -> str:
    """
    从 imageLinks 中选取最高清封面图片 URL。

    优先级：extraLarge > large > medium > thumbnail > smallThumbnail。
    统一替换 http 为 https，避免混合内容警告。

    Args:
        image_links: volumeInfo.imageLinks 字典。

    Returns:
        封面图片 HTTPS URL；无封面时返回空字符串。
    """
    for size in ("extraLarge", "large", "medium", "thumbnail", "smallThumbnail"):
        url = image_links.get(size, "")
        if url:
            return url.replace("http://", "https://")
    return ""


def _normalize_google_date(date_str: str) -> str:
    """
    将 Google Books 出版日期标准化为 YYYY-MM 或 YYYY 格式。

    Google 可能返回以下格式：
    - "2008-01-15" → "2008-01"（截断日期，与豆瓣精度对齐；有意为之）
    - "2008-01"   → "2008-01"（保留）
    - "2008"      → "2008"（保留）

    月份范围校验：非法月份（如 99）退化为仅保留年份。

    注意：截断完整日期为年月是有意的对齐行为，
    与豆瓣、NeDB 等数据源的精度保持一致。

    Args:
        date_str: Google Books 返回的原始日期字符串。

    Returns:
        标准化后的日期字符串；无法解析时返回原始值。
    """
    if not date_str:
        return ""

    # 完整日期：YYYY-MM-DD → YYYY-MM（与豆瓣精度对齐）
    m = re.match(r"^(\d{4})-(\d{2})-\d{2}$", date_str)
    if m:
        year, month = m.group(1), int(m.group(2))
        if 1 <= month <= 12:
            return f"{year}-{month:02d}"
        return year   # 月份非法，退化为仅年份

    # 年月：YYYY-MM → 校验后保留
    m = re.match(r"^(\d{4})-(\d{2})$", date_str)
    if m:
        year, month = m.group(1), int(m.group(2))
        if 1 <= month <= 12:
            return f"{year}-{month:02d}"
        return year

    # 仅年份：YYYY → 保留
    if re.match(r"^\d{4}$", date_str):
        return date_str

    return date_str


def _parse_google_rating(raw_rating: Any) -> str:
    """
    解析并校验 Google Books 评分。

    Google Books 评分范围为 1~5（满分 5 分），
    与豆瓣的 0~10 分制不同，此处仅做合法性校验，不做换算。

    Args:
        raw_rating: volumeInfo.averageRating 原始值（float 或 None）。

    Returns:
        评分字符串（保留一位小数）；无效时返回空字符串。
    """
    if raw_rating is None:
        return ""
    try:
        val = float(raw_rating)
        if 0.0 < val <= 5.0:
            return str(round(val, 1))
    except (ValueError, TypeError):
        pass
    return ""


# 类型注解补丁（_parse_google_rating 参数类型）
from typing import Any  # noqa: E402


# ==================== 全局单例 ====================

# asyncio.Lock 等对象通过 _ensure_locks() 延迟初始化，
# 避免模块导入时与事件循环不匹配。
google_books_service = GoogleBooksService()