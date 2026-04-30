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
- 使用 _mask() 函数对 Cookie 进行脱敏处理
- 测试端点使用预定义的 ISBN 进行实际请求验证

Cookie 脱敏规则：
- 每个键值对：隐藏值的中间部分（dbcl2="***" 形式）
- 长度 > 100：显示前后各 50 字符
- 长度 ≤ 100：显示前 30 字符 + "..."
"""

import os
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.schemas.schemas import (
    CookieSaveRequest,
    CookieInfoResponse,
    CookieTestResponse,
    ApiResponse,
)
from app.services.douban_service import DoubanService

logger = logging.getLogger(__name__)
router = APIRouter()


def _mask_cookie(cookie: str) -> str:
    """
    对 Cookie 字符串进行脱敏处理
    
    防止完整 Cookie 通过 API 泄露。
    
    脱敏策略：
    1. 按分号拆分各键值对
    2. 前 5 个键值对显示脱敏后的值
    3. 超过 5 个键值对时显示总数提示
    4. 异常情况回退到简单截断
    
    键值脱敏规则：
    - 值长度 > 20：显示前 8 字符 + "..." + 后 8 字符
    - 值长度 8~20：显示前 4 字符 + "****" + 后 4 字符
    - 值长度 < 8：显示 "****"
    
    Args:
        cookie: 原始 Cookie 字符串
    
    Returns:
        脱敏后的 Cookie 预览字符串
    
    Example:
        >>> _mask_cookie("dbcl2=abc123def456; ck=xyz789; ...")
        'dbcl2=abc123de...f456; ck=xy****89; ... (共5键)'
    """
    if not cookie:
        return ""
    
    try:
        parts = cookie.split(";")
        masked_parts = []
        
        # 仅脱敏前 5 个键值对
        for part in parts[:5]:
            part = part.strip()
            if "=" in part:
                key, value = part.split("=", 1)
                if len(value) > 20:
                    # 长值：显示首尾
                    masked_value = f"{value[:8]}...{value[-8:]}"
                elif len(value) > 8:
                    # 中等值：显示首尾 + 中间掩码
                    masked_value = f"{value[:4]}****{value[-4:]}"
                else:
                    # 短值：完全掩码
                    masked_value = "****"
                masked_parts.append(f"{key}={masked_value}")
            else:
                masked_parts.append(part)
        
        result = "; ".join(masked_parts)
        
        # 超过 5 个键值对时显示总数
        if len(parts) > 5:
            result += f"; ... (共{len(parts)}键)"
        
        return result
        
    except Exception:
        # 异常回退：简单截断
        if len(cookie) > 100:
            return f"{cookie[:50]}...{cookie[-50:]}"
        if len(cookie) > 30:
            return f"{cookie[:30]}..."
        return cookie


# ==================== Cookie 状态查询 ====================

@router.get("/cookie", response_model=CookieInfoResponse, summary="查看 Cookie 配置状态")
async def get_cookie_status() -> CookieInfoResponse:
    """
    获取当前豆瓣 Cookie 的配置状态
    
    返回脱敏后的 Cookie 预览，不暴露完整内容。
    同时返回 User-Agent 和最后更新时间。
    
    Returns:
        Cookie 状态信息（has_cookie, cookie_preview, user_agent, updated_at）
    """
    cookie_value = settings.DOUBAN_COOKIE
    
    # 获取配置文件最后修改时间
    updated_at = None
    if os.path.exists(settings.CONFIG_FILE):
        mtime = os.path.getmtime(settings.CONFIG_FILE)
        updated_at = datetime.fromtimestamp(mtime).isoformat()
    
    return CookieInfoResponse(
        has_cookie=bool(cookie_value),
        cookie_preview=_mask_cookie(cookie_value),
        user_agent=settings.DOUBAN_USER_AGENT,
        updated_at=updated_at,
    )


# ==================== Cookie 更新 ====================

@router.post("/cookie", response_model=ApiResponse, summary="更新豆瓣 Cookie")
async def update_cookie(req: CookieSaveRequest) -> ApiResponse:
    """
    保存新的豆瓣 Cookie
    
    验证规则：
    1. Cookie 不能为空
    2. Cookie 必须包含 '='（键值对格式）
    3. Cookie 长度至少 50 字符（有效 Cookie 通常较长）
    
    保存后自动清空豆瓣搜索缓存，使用新 Cookie 重新请求。
    
    Args:
        req: 包含 cookie 和可选 user_agent 的请求体
    
    Returns:
        保存结果
    
    Raises:
        HTTPException 400: Cookie 格式不符合要求
    """
    # 格式校验
    if not req.cookie or not req.cookie.strip():
        raise HTTPException(status_code=400, detail="Cookie 不能为空")
    
    if "=" not in req.cookie or len(req.cookie) < 50:
        raise HTTPException(
            status_code=400,
            detail="Cookie 格式不正确，请从浏览器开发者工具中完整复制",
        )
    
    # 保存 Cookie
    settings.update_cookie(
        cookie=req.cookie.strip(),
        user_agent=req.user_agent.strip() if req.user_agent else "",
    )
    
    # 清空搜索缓存（使用新 Cookie 重新请求）
    DoubanService().clear_cache()
    
    logger.info("豆瓣 Cookie 已更新")
    
    return ApiResponse(success=True, message="Cookie 已保存，搜索缓存已清空")


# ==================== Cookie 有效性测试 ====================

@router.post("/cookie/test", response_model=CookieTestResponse, summary="测试 Cookie 有效性")
async def test_cookie() -> CookieTestResponse:
    """
    测试当前 Cookie 是否有效
    
    使用预设的 ISBN（9787544270878 - 《解忧杂货店》）发起实际搜索请求。
    如果成功获取到图书标题，说明 Cookie 有效且处于登录状态。
    
    测试逻辑：
    1. 未配置 Cookie → 返回无效
    2. 请求豆瓣 → 成功获取标题 → 有效
    3. 请求豆瓣 → 无结果 → 可能已失效
    4. 请求异常 → 返回错误信息
    
    Returns:
        测试结果（success, message, cookie_valid, test_book）
    """
    if not settings.DOUBAN_COOKIE:
        return CookieTestResponse(
            success=False,
            message="尚未配置 Cookie，请先保存豆瓣 Cookie",
            cookie_valid=False,
        )
    
    try:
        # 使用预定义 ISBN 测试
        result = await DoubanService().search_by_isbn("9787544270878")
        
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
            message="Cookie 可能已失效，豆瓣未返回预期数据",
            cookie_valid=False,
        )
        
    except Exception as e:
        logger.error(f"Cookie 测试失败: {e}")
        return CookieTestResponse(
            success=False,
            message=f"测试请求失败: {str(e)[:100]}",
            cookie_valid=False,
        )


# ==================== Cookie 清除 ====================

@router.delete("/cookie", response_model=ApiResponse, summary="清除豆瓣 Cookie")
async def delete_cookie() -> ApiResponse:
    """
    清除豆瓣 Cookie 配置
    
    清除后：
    - 豆瓣同步功能将以未登录状态访问（可能被限制）
    - 搜索缓存会被清空
    - 配置文件中的 Cookie 信息被移除
    
    Returns:
        清除结果
    """
    settings.clear_cookie()
    DoubanService().clear_cache()
    
    logger.info("豆瓣 Cookie 已清除")
    
    return ApiResponse(
        success=True,
        message="Cookie 已清除，豆瓣同步将以未登录状态运行"
    )