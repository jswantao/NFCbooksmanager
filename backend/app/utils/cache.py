# backend/app/utils/cache.py
"""
公共内存缓存工具

提供基于 cachetools.TTLCache 的简单 TTL 缓存，
供 DoubanService、GoogleBooksService 等多个服务共享使用。

避免在各服务中重复定义相同的缓存实现。
"""

from typing import Optional, Dict

from cachetools import TTLCache


class SimpleCache:
    """
    TTL 内存缓存。

    每个缓存条目在 TTL 过期后自动失效，
    条目数达到 maxsize 时淘汰最旧条目（FIFO）。

    线程安全说明：
    - get 操作：TTLCache 内部读为原子操作，无需外部加锁
    - set 操作：建议由调用方通过 asyncio.Lock 保护，防止并发重复写入
    - clear 操作：建议由调用方通过 asyncio.Lock 保护

    Args:
        ttl: 缓存有效期（秒）。
        maxsize: 最大缓存条目数。
    """

    def __init__(self, ttl: int = 1800, maxsize: int = 1000):
        self._cache: TTLCache = TTLCache(maxsize=maxsize, ttl=ttl)

    def get(self, key: str) -> Optional[Dict]:
        """
        获取缓存数据。

        Args:
            key: 缓存键。

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

        Args:
            key: 缓存键。
            data: 要缓存的数据字典。
        """
        self._cache[key] = data

    def clear(self) -> None:
        """清空所有缓存条目"""
        self._cache.clear()

    @property
    def size(self) -> int:
        """当前缓存条目数量"""
        return len(self._cache)