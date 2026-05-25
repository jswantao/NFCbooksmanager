# backend/app/schemas/cookie.py
"""Cookie 管理相关 Pydantic 模型"""

from typing import Optional, Dict, Any
from pydantic import Field
from app.schemas.common import AppSchema


class CookieSaveRequest(AppSchema):
    """豆瓣 Cookie 保存请求"""
    cookie: str = Field(..., min_length=1, description="豆瓣登录后的完整 Cookie 字符串")
    user_agent: Optional[str] = Field(None, description="浏览器 User-Agent")


class CookieInfoResponse(AppSchema):
    """Cookie 状态查询响应（脱敏）"""
    has_cookie: bool = Field(..., description="是否已配置 Cookie")
    cookie_preview: str = Field(..., description="Cookie 前 20 字符预览")
    user_agent: str = Field(..., description="当前使用的 User-Agent")
    updated_at: Optional[str] = Field(None, description="Cookie 最后更新时间")


class CookieTestResponse(AppSchema):
    """Cookie 有效性测试响应"""
    success: bool = Field(..., description="测试请求是否成功")
    message: str = Field(..., description="测试结果描述")
    cookie_valid: bool = Field(False, description="Cookie 是否有效（已登录状态）")
    test_book: Optional[Dict[str, Any]] = Field(None, description="测试获取的图书数据")
