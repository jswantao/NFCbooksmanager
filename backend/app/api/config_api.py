# backend/app/api/config_api.py
"""
配置管理 API

管理系统运行时配置，特别是豆瓣 Cookie 的管理。

核心端点：
- GET    /cookie       : 查看 Cookie 配置状态（脱敏）
- POST   /cookie       : 更新豆瓣 Cookie
- POST   /cookie/test  : 测试 Cookie 是否有效
- DELETE /cookie       : 清除 Cookie

安全设计：
- Cookie 完整内容不通过 API 返回，仅返回脱敏预览
- 使用 _mask_cookie() 函数对 Cookie 进行脱敏处理
- 测试端点使用预定义的 ISBN 进行实际请求验证

Cookie 脱敏规则：
- 按分号拆分各键值对，仅处理前 5 个
- 值长度 > 20：显示前 8 字符 + "..." + 后 8 字符
- 值长度 8~20：显示前 4 字符 + "****" + 后 4 字符
- 值长度 < 8（含空值）：显示 "****"
- 超过 5 个键值对时追加总数提示
- 异常情况回退到简单截断
"""

import asyncio
import os
from datetime import datetime

from loguru import logger
from fastapi import APIRouter, HTTPException, Depends

from app.core.config import Settings
from app.utils.activity_logger import log_activity
from app.core.dependencies import get_settings, get_douban_service
from app.core.database import get_db
from app.schemas import (
    CookieSaveRequest,
    CookieInfoResponse,
    CookieTestResponse,
    ApiResponse,
)
from app.services.douban_service import DoubanService

router = APIRouter()

# 豆瓣 Cookie 中必须包含的字段，用于基本有效性校验
_REQUIRED_COOKIE_KEYS = {"dbcl2", "ck"}

# Cookie 测试用 ISBN（《解忧杂货店》）
_TEST_ISBN = "9787544270878"

# Cookie 测试超时秒数
_TEST_TIMEOUT_SECONDS = 10.0


# ==================== 内部工具函数 ====================

def _mask_cookie(cookie: str) -> str:
    """
    对 Cookie 字符串进行脱敏处理。

    防止完整 Cookie 通过 API 泄露。

    脱敏策略：
    1. 按分号拆分各键值对
    2. 前 5 个键值对显示脱敏后的值
    3. 超过 5 个键值对时追加总数提示
    4. 异常情况回退到简单截断

    键值脱敏规则：
    - 值长度 > 20：显示前 8 字符 + "..." + 后 8 字符
    - 值长度 8~20：显示前 4 字符 + "****" + 后 4 字符
    - 值长度 < 8（含空值）：显示 "****"

    Args:
        cookie: 原始 Cookie 字符串。

    Returns:
        脱敏后的 Cookie 预览字符串；输入为空时返回空字符串。

    Example:
        >>> _mask_cookie("dbcl2=abc123def456; ck=xyz789")
        'dbcl2=abc123de...f456; ck=****'
    """
    if not cookie:
        return ""

    try:
        parts = cookie.split(";")
        masked_parts = []

        for part in parts[:5]:
            part = part.strip()
            if "=" in part:
                key, value = part.split("=", 1)
                # 空值或极短值：完全掩码
                if len(value) > 20:
                    masked_value = f"{value[:8]}...{value[-8:]}"
                elif len(value) > 8:
                    masked_value = f"{value[:4]}****{value[-4:]}"
                else:
                    # 长度 0~8（含空字符串）统一显示 "****"
                    masked_value = "****"
                masked_parts.append(f"{key}={masked_value}")
            else:
                masked_parts.append(part)

        result = "; ".join(masked_parts)

        if len(parts) > 5:
            result += f"; ... (共{len(parts)}键)"

        return result

    except Exception:
        # 异常回退：简单截断，避免暴露过多内容
        if len(cookie) > 100:
            return f"{cookie[:50]}...{cookie[-50:]}"
        if len(cookie) > 30:
            return f"{cookie[:30]}..."
        return cookie


def _validate_cookie(cookie: str) -> None:
    """
    校验 Cookie 字符串的基本合法性。

    校验规则：
    1. 不能为空
    2. 不能包含换行符、回车符、空字节等控制字符（防注入）
    3. 必须包含键值对格式（含 '='）
    4. 长度至少 50 字符
    5. 必须包含豆瓣必要字段（dbcl2、ck）

    Args:
        cookie: 待校验的原始 Cookie 字符串。

    Raises:
        HTTPException 400: 任意校验规则不满足时抛出，附带具体原因。
    """
    if not cookie or not cookie.strip():
        raise HTTPException(status_code=400, detail="Cookie 不能为空")

    # 防范控制字符注入
    illegal_chars = {'\n', '\r', '\x00'}
    if any(c in cookie for c in illegal_chars):
        raise HTTPException(status_code=400, detail="Cookie 包含非法控制字符")

    if "=" not in cookie:
        raise HTTPException(
            status_code=400,
            detail="Cookie 格式不正确，请从浏览器开发者工具中完整复制",
        )

    if len(cookie) < 50:
        raise HTTPException(
            status_code=400,
            detail="Cookie 长度不足，有效的豆瓣 Cookie 通常远长于 50 字符",
        )

    # 校验必要字段
    cookie_keys = {
        part.split("=", 1)[0].strip()
        for part in cookie.split(";")
        if "=" in part
    }
    missing = _REQUIRED_COOKIE_KEYS - cookie_keys
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Cookie 缺少必要字段：{', '.join(sorted(missing))}，请确认已登录豆瓣后重新复制",
        )


async def _get_config_mtime(path: str) -> str | None:
    """
    异步获取配置文件的最后修改时间。

    使用线程池执行同步 IO，避免阻塞事件循环。
    若文件不存在或读取失败，返回 None。

    Args:
        path: 配置文件路径。

    Returns:
        ISO 格式的时间字符串，或 None。
    """
    try:
        mtime = await asyncio.to_thread(os.path.getmtime, path)
        return datetime.fromtimestamp(mtime).isoformat()
    except OSError:
        return None


def _safe_log_activity(db, **kwargs) -> None:
    """
    安全记录活动日志，异常不影响主业务流程。

    Args:
        db: 数据库会话。
        **kwargs: 透传给 log_activity 的参数。
    """
    try:
        log_activity(db, **kwargs)
    except Exception as exc:
        logger.warning(f"活动日志记录失败，已忽略: {exc}")


# ==================== Cookie 状态查询 ====================

@router.get(
    "/cookie",
    response_model=CookieInfoResponse,
    summary="查看 Cookie 配置状态",
)
async def get_cookie_status(
    settings: Settings = Depends(get_settings),
) -> CookieInfoResponse:
    """
    获取当前豆瓣 Cookie 的配置状态。

    返回脱敏后的 Cookie 预览，不暴露完整内容。
    同时返回 User-Agent 和配置文件最后修改时间。

    Returns:
        CookieInfoResponse：包含 has_cookie、cookie_preview、
        user_agent、updated_at 字段。
    """
    cookie_value = settings.DOUBAN_COOKIE
    updated_at = await _get_config_mtime(settings.CONFIG_FILE)

    return CookieInfoResponse(
        has_cookie=bool(cookie_value),
        cookie_preview=_mask_cookie(cookie_value),
        user_agent=settings.DOUBAN_USER_AGENT,
        updated_at=updated_at,
    )


# ==================== Cookie 更新 ====================

@router.post(
    "/cookie",
    response_model=ApiResponse[None],
    summary="更新豆瓣 Cookie",
)
async def update_cookie(
    req: CookieSaveRequest,
    settings: Settings = Depends(get_settings),
    douban_svc: DoubanService = Depends(get_douban_service),
    db=Depends(get_db),
) -> ApiResponse[None]:
    """
    保存新的豆瓣 Cookie。

    校验规则（详见 _validate_cookie）：
    - Cookie 不能为空
    - 不能包含控制字符
    - 必须为键值对格式且长度 ≥ 50
    - 必须包含 dbcl2、ck 等必要字段

    保存后自动清空豆瓣搜索缓存，建议随后调用 /cookie/test 验证有效性。

    Args:
        req: 包含 cookie 和可选 user_agent 的请求体。

    Returns:
        ApiResponse：保存结果及操作提示。

    Raises:
        HTTPException 400: Cookie 格式不符合要求时抛出。
    """
    cookie = req.cookie.strip() if req.cookie else ""
    _validate_cookie(cookie)

    user_agent = req.user_agent.strip() if req.user_agent else ""

    settings.update_cookie(cookie=cookie, user_agent=user_agent)
    await douban_svc.clear_cache()

    _safe_log_activity(
        db,
        action="update_cookie",
        entity_type="config",
        detail={
            "item": "douban_cookie",
            "user_agent_updated": bool(user_agent),
        },
    )
    logger.info("豆瓣 Cookie 已更新")

    return ApiResponse(
        success=True,
        message="Cookie 已保存，搜索缓存已清空。建议通过 /cookie/test 验证有效性",
    )


# ==================== Cookie 有效性测试 ====================

@router.post(
    "/cookie/test",
    response_model=CookieTestResponse,
    summary="测试 Cookie 有效性",
)
async def test_cookie(
    settings: Settings = Depends(get_settings),
    douban_svc: DoubanService = Depends(get_douban_service),
) -> CookieTestResponse:
    """
    测试当前 Cookie 是否有效。

    使用预设 ISBN（9787544270878，《解忧杂货店》）发起实际搜索请求。
    成功获取书名则说明 Cookie 有效且处于登录状态。

    测试流程：
    1. 未配置 Cookie → 直接返回无效
    2. 发起请求，超时限制 10 秒
    3. 成功获取标题 → 返回有效
    4. 无结果 → Cookie 可能已失效
    5. 超时 → 返回超时提示
    6. 其他异常 → 返回错误详情

    Returns:
        CookieTestResponse：包含 success、message、cookie_valid、
        test_book（成功时）字段。
    """
    if not settings.DOUBAN_COOKIE:
        return CookieTestResponse(
            success=False,
            message="尚未配置 Cookie，请先保存豆瓣 Cookie",
            cookie_valid=False,
        )

    try:
        result = await asyncio.wait_for(
            douban_svc.search_by_isbn(_TEST_ISBN),
            timeout=_TEST_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.warning(f"Cookie 测试超时（>{_TEST_TIMEOUT_SECONDS}s）")
        return CookieTestResponse(
            success=False,
            message=f"测试超时（>{_TEST_TIMEOUT_SECONDS:.0f}s），豆瓣响应过慢，请稍后重试",
            cookie_valid=False,
        )
    except Exception as exc:
        logger.error(f"Cookie 测试请求异常: {exc}")
        return CookieTestResponse(
            success=False,
            message=f"测试请求失败: {str(exc)[:100]}",
            cookie_valid=False,
        )

    if result and result.get("title"):
        return CookieTestResponse(
            success=True,
            message=f"Cookie 有效！成功获取：《{result['title']}》",
            cookie_valid=True,
            test_book={
                "title": result["title"],
                "author": result.get("author"),
                "cover_url": result.get("cover_url"),
                "publisher": result.get("publisher"),
                "rating": result.get("rating"),
            },
        )

    return CookieTestResponse(
        success=False,
        message="Cookie 可能已失效，豆瓣未返回预期数据，请重新登录豆瓣后复制 Cookie",
        cookie_valid=False,
    )


# ==================== Cookie 清除 ====================

@router.delete(
    "/cookie",
    response_model=ApiResponse[None],
    summary="清除豆瓣 Cookie",
)
async def delete_cookie(
    settings: Settings = Depends(get_settings),
    douban_svc: DoubanService = Depends(get_douban_service),
    db=Depends(get_db),
) -> ApiResponse[None]:
    """
    清除豆瓣 Cookie 配置。

    清除后：
    - 豆瓣同步功能将以未登录状态访问（可能受到请求频率限制）
    - 搜索缓存同步清空，避免使用旧数据
    - 配置文件中的 Cookie 字段被移除

    Returns:
        ApiResponse：清除结果。
    """
    settings.clear_cookie()
    await douban_svc.clear_cache()

    _safe_log_activity(
        db,
        action="delete_cookie",
        entity_type="config",
        detail={"item": "douban_cookie"},
    )
    logger.info("豆瓣 Cookie 已清除")

    return ApiResponse(
        success=True,
        message="Cookie 已清除，豆瓣同步将以未登录状态运行",
    )