# backend/app/services/douban_service.py
"""
豆瓣图书数据获取服务

内模式核心服务，负责从豆瓣数据源获取图书元数据。

实现策略（按优先级依次尝试）：
1. 直链访问：直接访问豆瓣图书详情页（/isbn/{isbn}/）
2. API 接口：使用豆瓣建议搜索 API（/j/subject_suggest）
3. 搜索页面：通过搜索页面解析结果（/subject_search）
4. Google Books：官方 API 降级数据源
5. 台湾ISBN：台湾国家图书馆 ISBN 数据库
6. OpenLibrary：免费备用数据源（openlibrary.org）

关键设计：
- 多级缓存：内存缓存（TTL 30分钟），减少重复请求
- 请求限流：Lock 保护的原子限流，避免并发时限流失效
- 持久化客户端：复用 httpx.AsyncClient 连接池，避免重复 TCP/TLS 握手
- Cookie 支持：使用登录态 Cookie 提升访问成功率
- 统计埋点：记录请求/成功/失败/缓存命中次数

豆瓣反爬应对：
- 请求间隔（DOUBAN_REQUEST_DELAY，默认 1 秒，动态读取配置）
- 模拟浏览器 User-Agent
- Cookie 登录态模拟
- 多重试策略（直链→API→搜索→备用源）
"""

import re
import asyncio
import time
from typing import Optional, Dict, Any, Tuple, List, Callable

import httpx
from bs4 import BeautifulSoup
from loguru import logger

from app.core.config import get_settings
from app.utils.helpers import clean_isbn
from app.services.douban_parser import parse_book, parse_search, _SUMMARY_MAX_LENGTH


# ==================== 自定义异常 ====================

class DoubanError(Exception):
    """豆瓣服务基础异常"""
    pass


class DoubanBlocked(DoubanError):
    """
    豆瓣请求被拦截异常

    可能原因：
    - 请求频率过高触发反爬
    - IP 被临时封禁
    - Cookie 失效或无效

    建议处理：
    - 增加请求间隔
    - 更换 Cookie
    - 等待一段时间后重试
    """
    pass


class DoubanNotFound(DoubanError):
    """
    豆瓣未找到图书异常

    可能原因：
    - ISBN 不存在于豆瓣数据库
    - 图书页面已下架
    - URL 格式不正确
    """
    pass


# ==================== 内存缓存 ====================

class SimpleCache:
    """
    TTL 内存缓存（基于 cachetools.TTLCache）

    用于缓存豆瓣搜索结果，减少对豆瓣服务器的重复请求。
    每个缓存条目在 TTL 过期后自动失效，条目数达到 maxsize 时淘汰最旧条目。

    线程安全说明：
    - get/set 操作均为近似 O(1) 字典操作
    - 写操作由调用方通过 asyncio.Lock 保护，防止重复写入
    - 读操作无需加锁（TTLCache 内部读为原子操作）

    Args:
        ttl: 缓存有效期（秒），默认 1800 秒（30 分钟）
        maxsize: 最大缓存条目数，默认 1000
    """

    def __init__(self, ttl: int = 1800, maxsize: int = 1000):
        from cachetools import TTLCache
        self._cache: TTLCache = TTLCache(maxsize=maxsize, ttl=ttl)

    def get(self, key: str) -> Optional[Dict]:
        """
        获取缓存数据。

        Args:
            key: 缓存键（如 "isbn:9787544291163"）

        Returns:
            缓存的数据字典；不存在或已过期返回 None。
        """
        try:
            return self._cache[key]
        except KeyError:
            return None

    def set(self, key: str, data: Dict) -> None:
        """
        设置缓存数据。

        条目数达到 maxsize 时，TTLCache 自动淘汰最旧条目。

        Args:
            key: 缓存键
            data: 要缓存的数据字典
        """
        self._cache[key] = data

    def clear(self) -> None:
        """清空所有缓存条目"""
        self._cache.clear()

    @property
    def size(self) -> int:
        """当前缓存条目数量"""
        return len(self._cache)


# ==================== 豆瓣服务主类 ====================

class DoubanService:
    """
    豆瓣图书数据获取服务

    实现多策略降级的图书元数据获取，支持 Cookie 爬虫模式。
    通过持久化 httpx 客户端复用连接池，通过 Lock 保护限流逻辑。

    生命周期管理：
    - 应用启动时通过 FastAPI lifespan 调用 initialize()
    - 应用关闭时调用 close() 释放连接池

    使用方式：
        book_data = await douban_service.search_by_isbn("9787544291163")

    数据流：
        ISBN → 缓存 → 直链 → API → 搜索页 → Google Books → 台湾ISBN → OpenLibrary
    """

    def __init__(self):
        self.base = "https://book.douban.com"
        self.cache = SimpleCache(ttl=600, maxsize=500)  # 10min TTL, 500 entries max

        self._last_req: float = 0.0

        # asyncio 对象延迟初始化，避免在事件循环启动前创建
        self._rate_lock: Optional[asyncio.Lock] = None
        self._cache_lock: Optional[asyncio.Lock] = None
        self._client: Optional[httpx.AsyncClient] = None

        # 统计计数（允许极小概率的并发误差，统计数据不要求强一致）
        self._stats: Dict[str, int] = {
            "requests": 0,
            "success": 0,
            "fail": 0,
            "cache_hits": 0,
        }

    # ==================== 生命周期 ====================

    def _ensure_locks(self) -> None:
        """
        延迟初始化 asyncio.Lock，确保在运行中的事件循环内创建。

        在首次异步调用时触发，避免模块导入时与事件循环不匹配的问题。
        """
        if self._rate_lock is None:
            self._rate_lock = asyncio.Lock()
        if self._cache_lock is None:
            self._cache_lock = asyncio.Lock()

    async def _get_client(self) -> httpx.AsyncClient:
        """
        获取持久化 HTTP 客户端。

        客户端在首次调用时创建，复用连接池避免重复 TCP/TLS 握手。
        若客户端已关闭（如调用过 close()），自动重建。

        Returns:
            活跃的 httpx.AsyncClient 实例。
        """
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                follow_redirects=True,
                timeout=15.0,
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
            logger.info("DoubanService HTTP 客户端已关闭")

    # ==================== 请求头配置 ====================

    @property
    def headers(self) -> Dict[str, str]:
        """
        构建豆瓣请求头。

        每次调用时动态读取最新 Cookie 和 User-Agent，
        支持运行时热更新配置而无需重启服务。

        Returns:
            HTTP 请求头字典。
        """
        s = get_settings()
        headers: Dict[str, str] = {
            "User-Agent": s.DOUBAN_USER_AGENT,
            "Accept": (
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            ),
            "Accept-Language": "zh-CN,zh;q=0.9",
        }
        if s.DOUBAN_COOKIE:
            headers["Cookie"] = s.DOUBAN_COOKIE
        return headers

    # ==================== 统计信息 ====================

    @property
    def stats(self) -> Dict[str, Any]:
        """
        获取服务运行统计。

        Returns:
            包含请求统计、缓存状态和 Cookie 配置状态的字典。
        """
        return {
            **self._stats,
            "cache_size": self.cache.size,
            "cookie_configured": bool(get_settings().DOUBAN_COOKIE),
        }

    # ==================== 请求控制 ====================

    @property
    def _delay(self) -> float:
        """
        动态读取请求间隔配置。

        每次访问时从 Settings 读取，支持运行时热更新，
        无需重启即可调整豆瓣请求频率。
        """
        return get_settings().DOUBAN_REQUEST_DELAY

    async def _rate_limit(self) -> None:
        """
        原子化请求频率限制。

        使用 asyncio.Lock 保护"读取时间戳→计算等待→更新时间戳"的完整原子操作，
        防止多协程并发时同时通过限流检查、同时发出请求。

        延迟计算：max(0, 配置延迟 - 距上次请求已过时间)
        """
        self._ensure_locks()
        async with self._rate_lock:
            elapsed = time.monotonic() - self._last_req
            wait = self._delay - elapsed
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_req = time.monotonic()

    async def _get(
        self,
        url: str,
        params: Optional[Dict] = None,
        timeout: float = 15.0,
        use_douban_headers: bool = True,
    ) -> httpx.Response:
        """
        执行 HTTP GET 请求（带限流、连接复用和错误处理）。

        执行流程：
        1. 等待请求限流（仅豆瓣请求）
        2. 通过持久化客户端发送请求（复用连接池）
        3. 处理特殊状态码（403/404）
        4. 更新统计计数

        Args:
            url: 请求 URL。
            params: URL 查询参数。
            timeout: 超时时间（秒）。
            use_douban_headers: True 时附加豆瓣请求头（Cookie/UA），
                                False 时用于非豆瓣第三方 API 请求。

        Returns:
            httpx.Response 对象。

        Raises:
            DoubanBlocked: 状态码 403（被拦截）。
            DoubanNotFound: 状态码 404（不存在）。
            DoubanError: 超时或其他请求异常。
        """
        if use_douban_headers:
            await self._rate_limit()

        self._stats["requests"] += 1

        try:
            client = await self._get_client()
            request_headers = self.headers if use_douban_headers else {}
            response = await client.get(
                url,
                params=params,
                headers=request_headers,
                timeout=timeout,
            )

            if response.status_code == 403:
                self._stats["fail"] += 1
                raise DoubanBlocked(f"豆瓣访问被拦截 (403): {url[:80]}")

            if response.status_code == 404:
                self._stats["fail"] += 1
                raise DoubanNotFound(f"豆瓣页面不存在 (404): {url[:80]}")

            response.raise_for_status()
            self._stats["success"] += 1
            return response

        except (DoubanBlocked, DoubanNotFound):
            raise
        except httpx.TimeoutException:
            self._stats["fail"] += 1
            raise DoubanError(f"请求超时: {url[:80]}")
        except httpx.HTTPStatusError as e:
            self._stats["fail"] += 1
            raise DoubanError(
                f"HTTP 错误 {e.response.status_code}: {str(e)[:100]}"
            )
        except UnicodeError as e:
            self._stats["fail"] += 1
            raise DoubanError(f"URL 编码错误（非 ASCII 重定向）: {str(e)[:80]}")
        except Exception as e:
            self._stats["fail"] += 1
            raise DoubanError(f"请求异常: {str(e)[:100]}")

    # ==================== 主入口：按 ISBN 搜索 ====================

    async def search_by_isbn(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        根据 ISBN 搜索图书元数据（主入口）。

        搜索策略（按优先级依次尝试，任一成功即返回）：
        1. 内存缓存（TTL 30 分钟）
        2. 直链访问豆瓣详情页（/isbn/{isbn}/）
        3. 豆瓣建议搜索 API（/j/subject_suggest）
        4. 豆瓣搜索页面（/subject_search）
        5. Google Books API
        6. 台湾国家图书馆 ISBN 数据库
        7. OpenLibrary

        Args:
            isbn: 图书 ISBN，支持带连字符格式（自动清洗为纯数字）。

        Returns:
            图书元数据字典；所有策略均失败时返回 None。
        """
        self._ensure_locks()
        isbn = clean_isbn(isbn)

        if len(isbn) not in (10, 13):
            logger.warning(f"无效的 ISBN 格式: {isbn!r} (长度={len(isbn)})")
            return None

        # 1. 无锁读缓存（TTLCache 读操作是原子的）
        cache_key = f"isbn:{isbn}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            self._stats["cache_hits"] += 1
            logger.debug(f"缓存命中: {isbn} → {cached.get('title', '未知')}")
            return cached

        # 2-7. 依次尝试各策略
        # 元组：(策略显示名, 协程方法, 是否为豆瓣策略)
        strategies: List[Tuple[str, Callable, bool]] = [
            ("直链访问",     self._try_direct,       True),
            ("API建议",      self._try_api,          True),
            ("搜索页面",     self._try_search,       True),
            ("Google Books", self._try_google_books, False),
            ("台湾ISBN",     self._try_taiwan_isbn,  False),
            ("OpenLibrary",  self._try_openlib,      False),
        ]

        for strategy_name, strategy_fn, is_douban in strategies:
            try:
                result = await strategy_fn(isbn)

                if result and result.get("title"):
                    # 写缓存：加锁 + double-check 防止重复写入
                    async with self._cache_lock:
                        if self.cache.get(cache_key) is None:
                            self.cache.set(cache_key, result)
                    logger.info(
                        f"[OK] [{strategy_name}] {isbn} → "
                        f"{result.get('title', '')[:30]}"
                    )
                    return result

                logger.debug(f"[{strategy_name}] 未找到结果: {isbn}")

            except DoubanBlocked:
                # DoubanBlocked 仅由豆瓣策略抛出，继续尝试下一策略
                logger.warning(
                    f"[{strategy_name}] 被拦截（403），尝试下一策略: {isbn}"
                )
                continue

            except DoubanNotFound:
                logger.debug(f"[{strategy_name}] 页面不存在（404）: {isbn}")

            except Exception as e:
                logger.warning(f"[{strategy_name}] 异常: {e}")

        logger.info(f"[FAIL] 所有策略均未获取到数据: {isbn}")
        return None

    # ==================== 策略 1：直链访问 ====================

    async def _try_direct(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        策略 1：直链访问豆瓣图书详情页。

        访问 https://book.douban.com/isbn/{isbn}/，豆瓣会自动重定向到
        对应的 /subject/{douban_id}/ 页面。
        重定向后 URL 包含 /subject/ 路径则说明图书存在。

        注意：/subject/{isbn}/ 不是有效的豆瓣 URL 格式（subject 后接的是
        豆瓣内部数字 ID，而非 ISBN），因此只尝试 /isbn/{isbn}/ 路径。

        Args:
            isbn: 清洗后的 ISBN。

        Returns:
            解析后的图书数据；未找到或重定向目标非图书页面时返回 None。
        """
        url = f"{self.base}/isbn/{isbn}/"
        try:
            response = await self._get(url)
            final_url = str(response.url)
            if "/subject/" in final_url:
                return parse_book(response.text, isbn, final_url)
        except DoubanNotFound:
            pass
        return None

    # ==================== 策略 2：API 建议接口 ====================

    async def _try_api(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        策略 2：使用豆瓣建议搜索 API。

        API 端点：https://book.douban.com/j/subject_suggest?q={isbn}
        返回 JSON 格式，速度快，但缺少简介、页数等详细字段。

        返回字段遵循统一规范（见 douban_parser._EMPTY_BOOK），
        缺失字段填充空字符串，source 统一为 "douban"。

        Args:
            isbn: 清洗后的 ISBN。

        Returns:
            图书元数据字典；API 不可用或无结果时返回 None。
        """
        try:
            response = await self._get(
                f"{self.base}/j/subject_suggest",
                params={"q": isbn},
                timeout=10.0,
            )
            data = response.json()

            if not (isinstance(data, list) and data):
                return None

            item = data[0]
            douban_url = item.get("url", "")
            douban_id = _extract_douban_id(douban_url)

            # 封面：API 返回小图，统一升级为大图路径
            cover_url = _upgrade_cover_url(item.get("pic", ""))

            # 评分：API 字段名与详情页不同，兼容两种键名
            rating_raw = item.get("rating_value") or item.get("rating") or ""
            rating = _validate_rating(str(rating_raw))

            return {
                "isbn": isbn,
                "douban_id": douban_id,
                "title": item.get("title", ""),
                "author": item.get("author_name", ""),
                "translator": "",
                "publisher": item.get("publisher", ""),
                "publish_date": item.get("pubdate", ""),
                "cover_url": cover_url,
                "summary": "",
                "rating": rating,
                "pages": "",
                "price": "",
                "binding": "",
                "original_title": "",
                "series": "",
                "douban_url": douban_url,
                "source": "douban",
            }

        except (DoubanBlocked, DoubanNotFound):
            raise
        except Exception:
            pass
        return None

    # ==================== 策略 3：搜索页面 ====================

    async def _try_search(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        策略 3：通过豆瓣搜索页面查找。

        访问 https://book.douban.com/subject_search，解析搜索结果列表。
        若列表信息不完整，进一步访问详情页获取完整数据。

        Args:
            isbn: 清洗后的 ISBN。

        Returns:
            图书元数据字典；未找到时返回 None。

        Raises:
            DoubanBlocked: 搜索页面被拦截（403）时向上传递。
        """
        try:
            response = await self._get(
                f"{self.base}/subject_search",
                params={"search_text": isbn, "cat": "1001"},
            )

            # 先尝试从搜索列表直接解析
            result = parse_search(response.text, isbn)
            if result and result.get("title"):
                return result

            # 列表解析不完整时，进入第一个详情页
            soup = BeautifulSoup(response.text, "html.parser")
            link = soup.find("a", class_="nbg")
            if link:
                href = link.get("href", "")
                if href:
                    detail_response = await self._get(href)
                    return parse_book(detail_response.text, isbn, href)

        except DoubanBlocked:
            raise
        except Exception:
            pass
        return None

    # ==================== 策略 4：Google Books ====================

    async def _try_google_books(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        策略 4：Google Books API。

        官方 API，协议稳定，支持 API Key 认证提升配额。
        作为豆瓣爬虫策略之后的第一个降级数据源。

        Args:
            isbn: 清洗后的 ISBN。

        Returns:
            图书元数据字典；未启用或无结果时返回 None。
        """
        try:
            from app.services.google_books_service import google_books_service
            if not google_books_service.enabled:
                logger.debug("Google Books 数据源未启用")
                return None
            result = await google_books_service.search_by_isbn(isbn)
            if result and result.get("title"):
                return result
        except Exception as e:
            logger.warning(f"[Google Books] 查询异常: {e}")
        return None

    # ==================== 策略 5：台湾国家图书馆 ====================

    async def _try_taiwan_isbn(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        策略 5：台湾国家图书馆 ISBN 数据库。

        专为台湾出版社图书设计，元数据质量高，繁体中文数据。

        Args:
            isbn: 清洗后的 ISBN。

        Returns:
            图书元数据字典；不可用时返回 None。
        """
        try:
            from app.services.taiwan_isbn_service import taiwan_isbn_service
            result = await taiwan_isbn_service.search_by_isbn(isbn)
            if result and result.get("title"):
                return result
        except Exception as e:
            logger.warning(f"[台湾ISBN] 查询异常: {e}")
        return None

    # ==================== 策略 6：OpenLibrary ====================

    async def _try_openlib(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        策略 6：OpenLibrary 备用数据源。

        API: https://openlibrary.org/api/books
        参数: bibkeys=ISBN:{isbn}&format=json&jscmd=data

        通过持久化客户端发送请求（不附加豆瓣请求头，不触发豆瓣限流）。

        注意：
        - 中文图书数据可能不完整
        - 封面图片可能无法直接访问

        Args:
            isbn: 清洗后的 ISBN。

        Returns:
            图书元数据字典；API 不可用时返回 None。
        """
        try:
            response = await self._get(
                "https://openlibrary.org/api/books",
                params={
                    "bibkeys": f"ISBN:{isbn}",
                    "format": "json",
                    "jscmd": "data",
                },
                timeout=10.0,
                use_douban_headers=False,   # 不附加豆瓣 Cookie/UA，不触发限流
            )

            if response.status_code != 200:
                return None

            data = response.json()
            isbn_key = f"ISBN:{isbn}"
            if isbn_key not in data:
                return None

            book = data[isbn_key]

            # 多作者以顿号连接
            authors = "、".join(
                a.get("name", "") for a in book.get("authors", []) if a.get("name")
            )
            # 多出版社以顿号连接
            publishers = "、".join(
                p.get("name", "") for p in book.get("publishers", []) if p.get("name")
            )

            # 封面：优先大图
            cover_info = book.get("cover") or {}
            cover_url = (
                cover_info.get("large")
                or cover_info.get("medium")
                or ""
            )

            # 简介：可能是字典格式（带 value 键）
            description = book.get("description", "")
            if isinstance(description, dict):
                description = description.get("value", "")

            return {
                "isbn": isbn,
                "douban_id": "",
                "title": book.get("title", ""),
                "author": authors,
                "translator": "",
                "publisher": publishers,
                "publish_date": book.get("publish_date", ""),
                "cover_url": cover_url,
                "summary": str(description)[:_SUMMARY_MAX_LENGTH],
                "rating": "",
                "pages": str(book.get("number_of_pages", "")),
                "price": "",
                "binding": "",
                "original_title": "",
                "series": "",
                "douban_url": "",
                "source": "openlibrary",
            }

        except (DoubanBlocked, DoubanNotFound):
            # OpenLibrary 不应抛出豆瓣异常，防御性捕获后静默处理
            pass
        except Exception:
            pass
        return None

    # ==================== 管理方法 ====================

    async def clear_cache(self) -> None:
        """
        清空搜索缓存（异步安全）。

        获取锁后清空，防止与并发写入竞争。
        """
        self._ensure_locks()
        async with self._cache_lock:
            self.cache.clear()
        logger.info("豆瓣搜索缓存已清空")

    def reset_stats(self) -> None:
        """重置请求统计计数器"""
        self._stats = {
            "requests": 0,
            "success": 0,
            "fail": 0,
            "cache_hits": 0,
        }
        logger.info("豆瓣请求统计已重置")


# ==================== 模块级工具函数 ====================

def _extract_douban_id(url: str) -> str:
    """
    从豆瓣图书 URL 中提取图书 ID。

    支持格式：
    - https://book.douban.com/subject/1084336/
    - https://book.douban.com/subject/1084336

    Args:
        url: 豆瓣图书详情页 URL。

    Returns:
        纯数字豆瓣 ID 字符串；无法提取时返回空字符串。
    """
    if not url:
        return ""
    m = re.search(r"/subject/(\d+)/?", url)
    return m.group(1) if m else ""


def _upgrade_cover_url(url: str) -> str:
    """
    将豆瓣封面 URL 从小图升级为大图。

    替换路径段中的尺寸标识（/s/ 或 /m/ → /l/），
    不修改文件名，避免 CDN 404。

    Args:
        url: 豆瓣封面原始 URL（可能是小图）。

    Returns:
        大图 URL；输入为空时返回空字符串。
    """
    if not url:
        return ""
    return re.sub(r"/view/subject/[sml]/", "/view/subject/l/", url)


def _validate_rating(rating: str) -> str:
    """
    校验评分字符串是否为合法豆瓣评分（0 < rating ≤ 10）。

    过滤评分人数不足时的空字符串和非数字值。

    Args:
        rating: 原始评分字符串。

    Returns:
        合法评分字符串；非法时返回空字符串。
    """
    if not rating:
        return ""
    try:
        val = float(rating)
        if 0.0 < val <= 10.0:
            return rating
    except (ValueError, TypeError):
        pass
    return ""


# ==================== 全局单例 ====================

# 全局共享单例，供所有 API 模块使用。
# asyncio.Lock 等对象通过 _ensure_locks() 延迟初始化，
# 避免模块导入时与事件循环不匹配的问题。
douban_service = DoubanService()