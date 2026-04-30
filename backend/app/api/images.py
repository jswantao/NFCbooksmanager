# backend/app/api/images.py
"""
图片代理服务

提供图书封面图片的代理访问功能。

核心端点：
- GET /proxy : 代理获取豆瓣图片并缓存

为什么需要图片代理：
1. 豆瓣图片可能禁止直接跨域引用（Referer 检查）
2. 部分网络环境无法直接访问豆瓣 CDN
3. 统一添加缓存控制头，提升前端加载速度

安全限制：
- 仅允许代理豆瓣 CDN 域名（douban.com / doubanio.com）
- 防止被滥用为开放代理
- 请求超时 30 秒
- 返回时添加浏览器缓存头（24 小时）
"""

from io import BytesIO

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

router = APIRouter()

# 允许代理的图片域名白名单
ALLOWED_DOMAINS = ["douban.com", "doubanio.com"]

# 请求豆瓣图片时使用的 Referer（绕过防盗链检查）
DOUBAN_REFERER = "https://book.douban.com/"

# 代理请求超时时间（秒）
PROXY_TIMEOUT = 30

# 浏览器缓存时长（秒）= 24 小时
BROWSER_CACHE_MAX_AGE = 86400


@router.get("/proxy", summary="代理获取豆瓣图片")
async def proxy_image(
    url: str = Query(
        ...,
        description="要代理的图片 URL（仅限豆瓣 CDN）",
    ),
) -> StreamingResponse:
    """
    代理获取豆瓣图书封面图片
    
    处理流程：
    1. 验证 URL 是否属于允许的域名
    2. 使用模拟浏览器头（Referer + User-Agent）发起请求
    3. 成功：返回图片流 + 缓存控制头
    4. 失败：返回相应的 HTTP 错误状态码
    
    错误处理：
    - 400: URL 不属于允许的域名
    - 404: 豆瓣图片不存在
    - 502: 豆瓣服务器错误
    - 504: 请求豆瓣超时
    - 500: 其他未知错误
    
    Args:
        url: 豆瓣图片完整 URL
    
    Returns:
        图片流响应（带 Content-Type 和 Cache-Control 头）
    
    Raises:
        HTTPException 400: 域名不在白名单
        HTTPException 404: 图片不存在
        HTTPException 502: 上游服务器错误
        HTTPException 504: 请求超时
    """
    # 域名白名单校验
    if not url or not any(domain in url for domain in ALLOWED_DOMAINS):
        raise HTTPException(
            status_code=400,
            detail=f"不支持的图片源，仅允许代理: {', '.join(ALLOWED_DOMAINS)}",
        )
    
    try:
        async with httpx.AsyncClient(
            timeout=PROXY_TIMEOUT,
            follow_redirects=True,
        ) as client:
            # 模拟浏览器访问，绕过防盗链
            response = await client.get(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36"
                    ),
                    "Referer": DOUBAN_REFERER,
                },
            )
            
            if response.status_code == 200:
                # 成功获取图片，返回流式响应
                content_type = response.headers.get(
                    "content-type",
                    "image/jpeg",
                )
                return StreamingResponse(
                    BytesIO(response.content),
                    media_type=content_type,
                    headers={
                        "Cache-Control": f"public, max-age={BROWSER_CACHE_MAX_AGE}",
                    },
                )
            
            # 根据状态码返回对应错误
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="图片不存在")
            
            # 其他非 200 状态码
            raise HTTPException(
                status_code=502,
                detail=f"图片源返回错误 (状态码: {response.status_code})",
            )
            
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=f"请求图片超时（超过 {PROXY_TIMEOUT} 秒）",
        )
    except HTTPException:
        # 重新抛出已处理的 HTTP 异常
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"图片代理错误: {str(e)[:200]}",
        )