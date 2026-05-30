"""NFC 桥接 — 无状态业务工具层

本模块仅包含**纯函数与极少量进程级缓存**, 不依赖数据库 / FastAPI / Jinja。
所有函数应可被单元测试零依赖调用。

职责:
- 局域网 IP / 前端 URL / 回调 URL 计算（含 1 小时缓存）
- NFC 载荷生成 (build_shelf_payload)
- NDEF 文本解析 (parse_ndef_shelf_id) — 含旧 nfc:// 兼容
- 写入任务过期时间计算
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
import json
import socket
import time
from urllib.parse import parse_qs, quote, unquote, urlparse

# ==================== 常量 ====================

TASK_EXPIRE_MINUTES = 30
POLLING_INTERVAL_MS = 3000
FRONTEND_DEV_PORT = 5173
BACKEND_PORT = 8000

# 内部缓存
_cached_ip: str | None = None
_ip_cache_time: float = 0.0
_IP_CACHE_TTL_SEC = 3600


# ==================== 时间工具 ====================


def get_current_time() -> datetime:
    """返回当前 UTC aware datetime（统一时区基准）"""
    return datetime.now(UTC)


def get_task_expires_at(minutes: int = TASK_EXPIRE_MINUTES) -> datetime:
    """计算写入任务的过期时刻"""
    return get_current_time() + timedelta(minutes=minutes)


# ==================== 网络 / URL ====================


def get_local_ip() -> str:
    """获取本机局域网 IP（缓存 1 小时, 避免重复 socket 创建）"""
    global _cached_ip, _ip_cache_time

    now = time.monotonic()
    if _cached_ip is not None and (now - _ip_cache_time) < _IP_CACHE_TTL_SEC:
        return _cached_ip

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        _cached_ip = sock.getsockname()[0]
        sock.close()
        _ip_cache_time = now
        return _cached_ip
    except OSError:
        return _cached_ip or "localhost"


def clear_ip_cache() -> None:
    """测试用: 清空 IP 缓存"""
    global _cached_ip, _ip_cache_time
    _cached_ip = None
    _ip_cache_time = 0.0


def get_frontend_url() -> str:
    """获取前端访问地址 (开发模式下指向 Vite dev server)"""
    return f"http://{get_local_ip()}:{FRONTEND_DEV_PORT}"


def get_callback_url() -> str:
    """生成 NFC TOOLS PRO 回调 URL 模板"""
    return (
        f"http://{get_local_ip()}:{BACKEND_PORT}"
        f"/api/nfc/callback?tagid={{TAG-ID}}&text={{NDEF-TEXT}}"
    )


def get_scan_link() -> str:
    """生成完整的 nfc://scan/ 扫描链接 (供 NFC TOOLS PRO 一键导入)"""
    return f"nfc://scan/?callback={quote(get_callback_url(), safe='')}"


# ==================== NFC 载荷 ====================


def build_shelf_payload(shelf_id: int) -> str:
    """构造极简 NFC 载荷: {"shelf_id": <id>}"""
    return json.dumps({"shelf_id": shelf_id}, ensure_ascii=False)


def parse_ndef_shelf_id(raw_text: str) -> int | None:
    """从 NDEF 文本中提取 shelf_id (纯函数, 易单测)

    支持三种格式:
      1. 现代 JSON: ``{"shelf_id": 42}``
      2. 旧式 URL: ``nfc://write/?data=%7B%22shelf_id%22%3A42%7D``
      3. 其他: 返回 None

    Args:
        raw_text: 标签 NDEF 文本内容

    Returns:
        解析成功的 shelf_id, 解析失败返回 None
    """
    if not raw_text:
        return None

    raw_data = raw_text.strip()

    # 兼容旧版 nfc://write/?data= 格式
    if "nfc://write/?" in raw_data:
        try:
            parsed = urlparse(raw_data)
            encoded = parse_qs(parsed.query).get("data", [""])[0]
            if encoded:
                raw_data = unquote(encoded)
        except (ValueError, KeyError):
            pass

    # 尝试 JSON 解析
    try:
        data = json.loads(raw_data)
    except (json.JSONDecodeError, TypeError):
        return None

    if not isinstance(data, dict) or "shelf_id" not in data:
        return None

    try:
        return int(data["shelf_id"])
    except (TypeError, ValueError):
        return None
