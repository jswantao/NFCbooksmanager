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
- 请求限流：控制请求间隔，避免触发豆瓣反爬机制
- Cookie 支持：使用登录态 Cookie 提升访问成功率
- 统计埋点：记录请求/成功/失败/缓存命中次数

豆瓣反爬应对：
- 请求间隔（DOUBAN_REQUEST_DELAY，默认 1 秒）
- 模拟浏览器 User-Agent
- Cookie 登录态模拟
- 多重试策略（直链→API→搜索→备用源）
"""

import re
import json
import asyncio
import time
from typing import Optional, Dict, Any, Tuple, List, Callable
from datetime import datetime, timedelta

import httpx
from bs4 import BeautifulSoup
from loguru import logger

from app.core.config import get_settings
from app.utils.helpers import clean_isbn
from app.services.douban_parser import parse_book, parse_search


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

    特点：
    - 自动过期：基于 TTLCache 的时间感知淘汰
    - 容量上限：maxsize 限制 maxsize 条目，防止内存无界增长
    - 淘汰策略：TTL 过期 + FIFO（超出 maxsize 时丢弃最旧条目）
    - 兼容 async：操作均为 O(1) 字典操作，不阻塞事件循环

    Args:
        ttl: 缓存有效期（秒），默认 1800 秒（30 分钟）
        maxsize: 最大缓存条目数，默认 1000
    """

    def __init__(self, ttl: int = 1800, maxsize: int = 1000):
        from cachetools import TTLCache
        self._cache: TTLCache = TTLCache(maxsize=maxsize, ttl=ttl)

    def get(self, key: str) -> Optional[Dict]:
        """
        获取缓存数据

        如果缓存存在且未过期，返回缓存数据。
        如果缓存已过期或不存在，返回 None。

        Args:
            key: 缓存键（如 "isbn:9787544291163"）

        Returns:
            缓存的数据字典，不存在或已过期返回 None
        """
        try:
            return self._cache[key]
        except KeyError:
            return None

    def set(self, key: str, data: Dict) -> None:
        """
        设置缓存数据

        当缓存条目数达到 maxsize 时，TTLCache 自动淘汰最旧条目。

        Args:
            key: 缓存键
            data: 要缓存的数据字典
        """
        self._cache[key] = data

    def clear(self) -> None:
        """清空所有缓存"""
        self._cache.clear()

    @property
    def size(self) -> int:
        """当前缓存条目数量"""
        return len(self._cache)


# ==================== 豆瓣服务主类 ====================

class DoubanService:
    """
    豆瓣图书数据获取服务
    
    实现需求说明书中的内模式数据获取功能：
    - 根据 ISBN 从豆瓣获取图书元数据
    - 支持带 Cookie 的爬虫模式
    - 多策略降级搜索
    
    使用方式：
        service = DoubanService()
        book_data = await service.search_by_isbn("9787544291163")
    
    数据流：
        ISBN → 缓存检查 → 直链访问 → API建议 → 搜索页面 → Google Books → 台湾ISBN → OpenLibrary → 返回结果
    """
    
    def __init__(self):
        self.base = "https://book.douban.com"
        self.cache = SimpleCache()
        self._last_req = 0.0  # 上次请求时间戳
        self._delay = get_settings().DOUBAN_REQUEST_DELAY  # 请求间隔
        self._cache_lock = asyncio.Lock()  # 保护缓存并发读写
        self._stats = {
            "requests": 0,     # 总请求数（不含缓存命中）
            "success": 0,      # 成功请求数
            "fail": 0,         # 失败请求数
            "cache_hits": 0,   # 缓存命中数
        }
    
    # ==================== 请求头配置 ====================
    
    @property
    def headers(self) -> dict:
        """
        构建豆瓣请求头
        
        包含以下关键字段：
        - User-Agent: 模拟 Chrome 浏览器
        - Accept: 接受 HTML 和 XML 响应
        - Accept-Language: 优先中文
        - Cookie: 豆瓣登录态（如已配置）
        
        Returns:
            HTTP 请求头字典
        """
        headers = {
            "User-Agent": get_settings().DOUBAN_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9",
        }
        if get_settings().DOUBAN_COOKIE:
            headers["Cookie"] = get_settings().DOUBAN_COOKIE
        return headers
    
    # ==================== 统计信息 ====================
    
    @property
    def stats(self) -> dict:
        """
        获取服务运行统计
        
        Returns:
            包含请求统计和缓存状态的字典
        """
        return {
            **self._stats,
            "cache_size": self.cache.size,
            "cookie_configured": bool(get_settings().DOUBAN_COOKIE),
        }
    
    # ==================== 请求控制 ====================
    
    async def _rate_limit(self) -> None:
        """
        请求频率限制
        
        确保两次请求之间的间隔不小于配置的延迟时间。
        在请求前调用，自动计算并等待必要的延迟。
        
        延迟计算：max(0, 配置延迟 - 距上次请求已过时间)
        """
        elapsed = time.monotonic() - self._last_req
        if elapsed < self._delay:
            await asyncio.sleep(self._delay - elapsed)
        self._last_req = time.monotonic()
    
    async def _get(
        self,
        url: str,
        params: dict = None,
        timeout: float = 15
    ) -> httpx.Response:
        """
        执行 HTTP GET 请求（带限流和错误处理）
        
        执行流程：
        1. 等待请求限流
        2. 发送 HTTP GET 请求
        3. 处理响应状态码
        4. 更新统计信息
        
        Args:
            url: 请求 URL
            params: URL 查询参数
            timeout: 超时时间（秒）
        
        Returns:
            httpx.Response 对象
        
        Raises:
            DoubanBlocked: 状态码 403（被拦截）
            DoubanNotFound: 状态码 404（不存在）
            DoubanError: 其他请求异常
        """
        await self._rate_limit()
        self._stats["requests"] += 1
        
        try:
            async with httpx.AsyncClient(
                timeout=timeout,
                follow_redirects=True,
                headers=self.headers
            ) as client:
                response = await client.get(url, params=params)
                
                # 处理特殊状态码
                if response.status_code == 403:
                    self._stats["fail"] += 1
                    raise DoubanBlocked(
                        f"豆瓣访问被拦截 (403): {url[:80]}..."
                    )
                if response.status_code == 404:
                    self._stats["fail"] += 1
                    raise DoubanNotFound(
                        f"豆瓣页面不存在 (404): {url[:80]}..."
                    )
                
                response.raise_for_status()
                self._stats["success"] += 1
                return response
                
        except (DoubanBlocked, DoubanNotFound):
            raise
        except httpx.TimeoutException:
            self._stats["fail"] += 1
            raise DoubanError(f"请求超时: {url[:80]}...")
        except httpx.HTTPStatusError as e:
            self._stats["fail"] += 1
            raise DoubanError(f"HTTP 错误 {e.response.status_code}: {str(e)[:100]}")
        except UnicodeError as e:
            self._stats["fail"] += 1
            raise DoubanError(f"URL编码错误(非ASCII重定向): {str(e)[:80]}")
        except Exception as e:
            self._stats["fail"] += 1
            raise DoubanError(f"请求异常: {str(e)[:100]}")
    
    # ==================== 主入口：按 ISBN 搜索 ====================
    
    async def search_by_isbn(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        根据 ISBN 搜索图书元数据（主入口）
        
        搜索策略（按优先级依次尝试）：
        1. 检查内存缓存
        2. 直链访问豆瓣详情页
        3. 使用豆瓣建议 API
        4. 通过搜索页面查找
        5. 使用 Google Books API
        6. 使用 OpenLibrary 备用数据源
        
        任一策略成功获取到有效数据（title 不为空）即返回，
        不继续尝试后续策略。
        
        Args:
            isbn: 图书 ISBN，支持带连字符格式（自动清洗为纯数字）
        
        Returns:
            图书元数据字典，所有策略均失败返回 None
            
            成功返回示例：
            {
                "isbn": "9787544291163",
                "title": "三体",
                "author": "刘慈欣",
                "publisher": "重庆出版社",
                "publish_date": "2008-1",
                "cover_url": "https://img2.doubanio.com/...",
                "summary": "文化大革命如火如荼进行的同时...",
                "rating": "9.3",
                "pages": "302",
                "price": "23.00元",
                "binding": "平装",
                "original_title": "",
                "translator": "",
                "series": "中国科幻基石丛书",
                "douban_url": "https://book.douban.com/subject/2567698/",
                "source": "douban"
            }
        """
        # 清洗 ISBN：移除连字符和空格
        isbn = clean_isbn(isbn)
        
        # 校验 ISBN 格式
        if len(isbn) not in (10, 13):
            logger.warning(f"无效的 ISBN 格式: {isbn} (长度={len(isbn)})")
            return None
        
        # 1. 检查缓存（加锁保护）
        cache_key = f"isbn:{isbn}"
        async with self._cache_lock:
            if cached := self.cache.get(cache_key):
                self._stats["cache_hits"] += 1
                logger.debug(f"缓存命中: {isbn} → {cached.get('title', '未知')}")
                return cached

        # 定义搜索策略（名称, 方法）
        strategies: List[Tuple[str, Callable]] = [
            ("直链访问", self._try_direct),
            ("API建议", self._try_api),
            ("搜索页面", self._try_search),
            ("Google Books", self._try_google_books),
            ("台湾ISBN", self._try_taiwan_isbn),
            ("OpenLibrary", self._try_openlib),
        ]

        # 2-5. 依次尝试各策略
        for strategy_name, strategy_fn in strategies:
            try:
                result = await strategy_fn(isbn)
                if result and result.get("title"):
                    # 策略成功，缓存并返回（加锁保护）
                    async with self._cache_lock:
                        self.cache.set(cache_key, result)
                    logger.info(
                        f"[OK] [{strategy_name}] 获取成功: {isbn} -> "
                        f"{result.get('title', '未知')[:30]}"
                    )
                    return result
                else:
                    logger.debug(f"[{strategy_name}] 未找到结果: {isbn}")
                    
            except DoubanBlocked:
                # 豆瓣拦截：直链/API/搜索策略继续尝试下一个，备用源不受影响
                if strategy_name in ("直链访问", "API建议", "搜索页面"):
                    logger.warning(f"[{strategy_name}] 被拦截，尝试下一策略")
                    continue
                logger.warning(f"[{strategy_name}] 被拦截且无备用策略")
                
            except DoubanNotFound:
                # 页面不存在：继续尝试其他策略
                logger.debug(f"[{strategy_name}] 页面不存在: {isbn}")
                
            except Exception as e:
                logger.warning(f"[{strategy_name}] 异常: {e}")
        
        logger.info(f"[ERROR] 所有策略均失败: {isbn}")
        return None
    
    # ==================== 策略 1：直链访问 ====================
    
    async def _try_direct(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        策略 1：直链访问豆瓣图书详情页
        
        尝试以下 URL 格式：
        - https://book.douban.com/isbn/{isbn}/
        - https://book.douban.com/subject/{isbn}/
        
        豆瓣会自动重定向到正确的图书页面。
        如果最终 URL 包含 /subject/ 路径，说明找到了对应图书。
        
        Args:
            isbn: 清洗后的 ISBN
        
        Returns:
            解析后的图书数据，未找到返回 None
        """
        for url in [
            f"{self.base}/isbn/{isbn}/",
            f"{self.base}/subject/{isbn}/",
        ]:
            try:
                response = await self._get(url)
                # 检查是否成功重定向到图书页面
                if "/subject/" in str(response.url):
                    return self._parse_book(response.text, isbn, str(response.url))
            except DoubanNotFound:
                continue
        return None
    
    # ==================== 策略 2：API 建议接口 ====================
    
    async def _try_api(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        策略 2：使用豆瓣建议搜索 API
        
        API 端点：https://book.douban.com/j/subject_suggest
        参数：q={isbn}
        
        此接口返回 JSON 格式的搜索结果，速度快且数据稳定。
        但数据字段有限，缺少简介、页数等详细信息。
        
        Args:
            isbn: 清洗后的 ISBN
        
        Returns:
            图书元数据字典，API 不可用返回 None
        """
        try:
            response = await self._get(
                f"{self.base}/j/subject_suggest",
                {"q": isbn},
                timeout=10
            )
            data = response.json()
            
            if isinstance(data, list) and data:
                # 取第一个搜索结果
                item = data[0]
                return {
                    "isbn": isbn,
                    "title": item.get("title", ""),
                    "author": item.get("author_name", ""),
                    "publisher": item.get("publisher", ""),
                    "publish_date": item.get("pubdate", ""),
                    "cover_url": item.get("pic", ""),
                    "rating": item.get("rating_value", ""),
                    "douban_url": item.get("url", ""),
                    "source": "douban_api",
                    # API 接口不提供的字段设置默认值
                    "translator": "",
                    "summary": "",
                    "pages": "",
                    "price": "",
                    "binding": "",
                    "original_title": "",
                    "series": "",
                }
        except Exception:
            pass
        return None
    
    # ==================== 策略 3：搜索页面 ====================
    
    async def _try_search(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        策略 3：通过豆瓣搜索页面查找
        
        访问 https://book.douban.com/subject_search 搜索页面，
        解析搜索结果列表中的第一个条目。
        
        分两步：
        1. 解析搜索列表页面，尝试直接提取信息
        2. 如果列表信息不完整，点击进入详情页获取完整数据
        
        Args:
            isbn: 清洗后的 ISBN
        
        Returns:
            图书元数据字典，未找到返回 None
        
        Raises:
            DoubanBlocked: 搜索页面被拦截时向上传递
        """
        try:
            # 第一步：搜索
            response = await self._get(
                f"{self.base}/subject_search",
                {"search_text": isbn, "cat": "1001"}  # cat=1001 限定图书分类
            )
            
            # 尝试从搜索结果列表直接解析
            if result := self._parse_search(response.text, isbn):
                return result
            
            # 第二步：如果列表解析不完整，进入详情页
            soup = BeautifulSoup(response.text, "html.parser")
            if link := soup.find("a", class_="nbg"):
                if href := link.get("href"):
                    detail_response = await self._get(href)
                    return self._parse_book(
                        detail_response.text,
                        isbn,
                        href
                    )
                    
        except DoubanBlocked:
            raise  # 向上传递，让主方法决定是否继续
        except Exception:
            pass
        return None
    
    # ==================== 策略 4：Google Books ====================

    async def _try_google_books(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        策略 4：Google Books API

        作为豆瓣爬虫策略之后的第一个降级数据源。
        使用官方 API，协议稳定，支持 API Key 认证提升配额。

        Args:
            isbn: 清洗后的 ISBN

        Returns:
            图书元数据字典，API 不可用返回 None
        """
        try:
            from app.services.google_books_service import google_books_service
            if not google_books_service.enabled:
                logger.debug("Google Books 数据源未启用")
                return None
            result = await google_books_service.search_by_isbn(isbn)
            if result and result.get("title"):
                logger.info(f"[Google Books] 获取成功: {isbn} -> {result['title'][:30]}")
                return result
        except Exception as e:
            logger.warning(f"[Google Books] 查询异常: {e}")
        return None

    # ==================== 策略 5：台湾国家图书馆 ISBN ====================

    async def _try_taiwan_isbn(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        策略 5：台湾国家图书馆 ISBN 数据库

        专为台湾出版社图书设计，元数据质量高。
        使用 CSRF token 认证，繁体中文数据。

        Returns:
            图书元数据字典，不可用返回 None
        """
        try:
            from app.services.taiwan_isbn_service import taiwan_isbn_service
            result = await taiwan_isbn_service.search_by_isbn(isbn)
            if result and result.get("title"):
                logger.info(f"[台湾ISBN] 获取成功: {isbn} -> {result['title'][:30]}")
                return result
        except Exception as e:
            logger.warning(f"[台湾ISBN] 查询异常: {e}")
        return None

    # ==================== 策略 6：OpenLibrary 备用 ====================
    
    async def _try_openlib(self, isbn: str) -> Optional[Dict[str, Any]]:
        """
        策略 4：OpenLibrary 备用数据源
        
        API: https://openlibrary.org/api/books
        参数: bibkeys=ISBN:{isbn}&format=json&jscmd=data
        
        OpenLibrary 是互联网档案馆的开放图书数据项目，
        作为豆瓣不可用时的降级方案。
        
        注意：
        - 中文图书数据可能不完整
        - 封面图片可能无法直接访问
        
        Args:
            isbn: 清洗后的 ISBN
        
        Returns:
            图书元数据字典，API 不可用返回 None
        """
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    "https://openlibrary.org/api/books",
                    params={
                        "bibkeys": f"ISBN:{isbn}",
                        "format": "json",
                        "jscmd": "data",
                    }
                )
                if response.status_code == 200:
                    data = response.json()
                    isbn_key = f"ISBN:{isbn}"
                    
                    if isbn_key in data:
                        book = data[isbn_key]
                        
                        # 解析作者（多个作者用顿号连接）
                        authors = "、".join(
                            author.get("name", "")
                            for author in book.get("authors", [])
                        )
                        
                        # 解析出版社
                        publishers = "、".join(
                            publisher.get("name", "")
                            for publisher in book.get("publishers", [])
                        )
                        
                        # 解析封面（优先大图，其次中图）
                        cover_info = book.get("cover", {}) or {}
                        cover_url = (
                            cover_info.get("large")
                            or cover_info.get("medium")
                            or ""
                        )
                        
                        # 解析简介（可能是字典格式）
                        description = book.get("description", "")
                        if isinstance(description, dict):
                            description = description.get("value", "")
                        
                        return {
                            "isbn": isbn,
                            "title": book.get("title", ""),
                            "author": authors,
                            "publisher": publishers,
                            "publish_date": book.get("publish_date", ""),
                            "cover_url": cover_url,
                            "summary": str(description)[:1000],
                            "pages": str(book.get("number_of_pages", "")),
                            "source": "openlibrary",
                            # OpenLibrary 不提供的字段
                            "translator": "",
                            "rating": "",
                            "price": "",
                            "binding": "",
                            "original_title": "",
                            "series": "",
                        }
        except Exception:
            pass
        return None
    
    # ==================== 详情页解析 ====================
    
    # 解析方法已提取至 douban_parser.py，此处保留委托方法以兼容现有调用
    _parse_book = staticmethod(parse_book)
    _parse_search = staticmethod(parse_search)

    # ==================== 管理方法 ====================
    
    async def clear_cache(self) -> None:
        """清空搜索缓存（异步安全）"""
        async with self._cache_lock:
            self.cache.clear()
        logger.info("豆瓣搜索缓存已清空")
    
    def reset_stats(self) -> None:
        """重置请求统计"""
        self._stats = {
            "requests": 0,
            "success": 0,
            "fail": 0,
            "cache_hits": 0,
        }
        logger.info("豆瓣请求统计已重置")


# 全局共享单例，供所有 API 模块使用
douban_service = DoubanService()