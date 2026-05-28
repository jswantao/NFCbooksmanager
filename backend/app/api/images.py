# backend/app/api/images.py
"""
图片代理服务

提供图书封面图片的代理访问功能，支持本地缓存。

核心端点：
- GET /proxy         : 代理获取豆瓣图片并缓存
- GET /cache/stats   : 查看图片缓存统计
- DELETE /cache/clear: 清空图片缓存
"""

import hashlib
import mimetypes
import time
from io import BytesIO
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse, FileResponse
from loguru import logger  # ⬅ 改用 loguru

from app.core.config import Settings
from app.core.dependencies import get_settings

router = APIRouter()

# ==================== 常量 ====================

ALLOWED_DOMAINS = ["douban.com", "doubanio.com"]
DOUBAN_REFERER = "https://book.douban.com/"
PROXY_TIMEOUT = 30
BROWSER_CACHE_MAX_AGE = 86400


# ==================== 缓存工具函数 ====================

def _get_cache_file_path(url: str, settings: Settings) -> Path:
    """根据图片 URL 计算本地缓存文件路径"""
    cache_dir = Path(settings.IMAGE_CACHE_DIR)
    cache_dir.mkdir(parents=True, exist_ok=True)

    url_hash = hashlib.sha256(url.encode('utf-8')).hexdigest()
    parsed_url = httpx.URL(url)
    url_suffix = Path(parsed_url.path).suffix

    if url_suffix and len(url_suffix) <= 10:
        filename = f"{url_hash}{url_suffix}"
    else:
        filename = url_hash

    return cache_dir / filename


def _is_cache_fresh(file_path: Path, max_age_seconds: int) -> bool:
    """检查缓存文件是否在有效期内"""
    if not file_path.exists():
        return False
    file_mtime = file_path.stat().st_mtime
    return (time.time() - file_mtime) <= max_age_seconds


# ==================== 代理端点 ====================

@router.get("/proxy", summary="代理获取豆瓣图片（带本地缓存）")
async def proxy_image(
    url: str = Query(..., description="要代理的图片 URL"),
    settings: Settings = Depends(get_settings),
):
    """代理获取豆瓣图书封面图片，支持本地缓存"""
    # 1. 域名白名单校验
    if not url or not any(domain in url for domain in ALLOWED_DOMAINS):
        raise HTTPException(
            status_code=400,
            detail=f"不支持的图片源: {', '.join(ALLOWED_DOMAINS)}",
        )

    # 2. 检查本地缓存
    if settings.IMAGE_CACHE_ENABLED:
        cache_path = _get_cache_file_path(url, settings)

        if _is_cache_fresh(cache_path, settings.IMAGE_CACHE_MAX_AGE):
            media_type, _ = mimetypes.guess_type(str(cache_path))
            content_type = media_type or "image/jpeg"

            logger.debug(f"图片缓存命中 [{cache_path.name}]")

            return FileResponse(
                path=str(cache_path),
                media_type=content_type,
                headers={
                    "Cache-Control": f"public, max-age={BROWSER_CACHE_MAX_AGE}",
                },
            )

    # 3. 请求豆瓣
    try:
        async with httpx.AsyncClient(
            timeout=PROXY_TIMEOUT,
            follow_redirects=True,
        ) as client:
            response = await client.get(
                url,
                headers={
                    "User-Agent": settings.DOUBAN_USER_AGENT,
                    "Referer": DOUBAN_REFERER,
                },
            )

            if response.status_code == 200:
                content_type = response.headers.get(
                    "content-type", "image/jpeg"
                )

                # 4. 保存缓存
                if settings.IMAGE_CACHE_ENABLED:
                    try:
                        cache_path = _get_cache_file_path(url, settings)

                        if not cache_path.suffix:
                            clean_type = (
                                content_type.split(';')[0].strip()
                            )
                            ext = mimetypes.guess_extension(clean_type)
                            if ext:
                                cache_path = cache_path.with_suffix(ext)

                        # 原子写入
                        temp_path = cache_path.with_suffix(
                            (cache_path.suffix or '') + ".tmp"
                        )
                        with open(temp_path, 'wb') as f:
                            f.write(response.content)
                        temp_path.replace(cache_path)

                        logger.debug(
                            f"图片已缓存 [{cache_path.name}] "
                            f"({len(response.content) / 1024:.1f} KB)"
                        )
                    except Exception as e:
                        logger.warning(f"缓存写入失败: {e}")

                return StreamingResponse(
                    BytesIO(response.content),
                    media_type=content_type,
                    headers={
                        "Cache-Control": f"public, max-age={BROWSER_CACHE_MAX_AGE}",
                    },
                )

            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="图片不存在")

            raise HTTPException(
                status_code=502,
                detail=f"图片源错误 ({response.status_code})",
            )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="请求超时")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"图片代理错误: {e}")
        raise HTTPException(status_code=500, detail=str(e)[:200])


# ==================== 缓存管理 ====================

@router.get("/cache/stats", summary="查看图片缓存统计")
async def get_cache_stats(
    settings: Settings = Depends(get_settings),
):
    """获取图片缓存统计信息"""
    if not settings.IMAGE_CACHE_ENABLED:
        return {"enabled": False, "message": "缓存未启用"}

    cache_dir = Path(settings.IMAGE_CACHE_DIR)

    if not cache_dir.exists():
        return {
            "enabled": True,
            "cache_dir": str(cache_dir),
            "file_count": 0,
            "total_size": "0 B",
            "max_age_days": settings.IMAGE_CACHE_MAX_AGE // 86400,
        }

    files = [
        f for f in cache_dir.iterdir()
        if f.is_file() and not f.name.endswith('.tmp')
    ]
    total_bytes = sum(f.stat().st_size for f in files)

    if total_bytes < 1024:
        size_str = f"{total_bytes} B"
    elif total_bytes < 1024 * 1024:
        size_str = f"{total_bytes / 1024:.1f} KB"
    else:
        size_str = f"{total_bytes / (1024 * 1024):.1f} MB"

    return {
        "enabled": True,
        "cache_dir": str(cache_dir),
        "file_count": len(files),
        "total_size": size_str,
        "max_age_days": settings.IMAGE_CACHE_MAX_AGE // 86400,
    }


@router.delete("/cache/clear", summary="清空图片缓存")
async def clear_image_cache(
    settings: Settings = Depends(get_settings),
):
    """清空所有本地缓存的图片文件"""
    if not settings.IMAGE_CACHE_ENABLED:
        return {"success": False, "message": "缓存未启用", "deleted_count": 0}

    cache_dir = Path(settings.IMAGE_CACHE_DIR)

    if not cache_dir.exists():
        return {"success": True, "message": "目录不存在", "deleted_count": 0}

    deleted_count = 0
    for file_path in cache_dir.iterdir():
        if file_path.is_file():
            try:
                file_path.unlink()
                deleted_count += 1
            except Exception as e:
                logger.warning(f"删除失败 [{file_path.name}]: {e}")

    logger.info(f"缓存已清空，删除 {deleted_count} 个文件")
    return {
        "success": True,
        "message": f"已清空 {deleted_count} 个文件",
        "deleted_count": deleted_count,
    }


# ==================== 本地封面上传 ====================

from fastapi import UploadFile, File as FastAPIFile
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import BookMetadata

COVER_UPLOAD_DIR = Path("uploads/covers")
ALLOWED_COVER_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_COVER_SIZE = 5 * 1024 * 1024  # 5MB


def _ensure_cover_dir():
    COVER_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/cover/{book_id}", summary="上传本地封面图片")
async def upload_local_cover(
    book_id: int,
    file: UploadFile = FastAPIFile(...),
    db: Session = Depends(get_db),
):
    """
    为指定图书上传本地封面图片。

    支持的格式: jpg, jpeg, png, webp。最大 5MB。
    上传后自动更新数据库 local_cover_path 字段。
    如已有本地封面，旧文件会被替换。
    """
    book = db.query(BookMetadata).filter(BookMetadata.book_id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="图书不存在")

    # 校验扩展名
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_COVER_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支持的图片格式: {suffix}，仅支持 {', '.join(ALLOWED_COVER_EXTENSIONS)}")

    # 校验文件大小
    content = await file.read()
    if len(content) > MAX_COVER_SIZE:
        raise HTTPException(status_code=400, detail=f"图片过大，最大 {MAX_COVER_SIZE // (1024*1024)}MB")

    _ensure_cover_dir()

    # 删除旧本地封面文件
    if book.local_cover_path:
        old_path = Path("uploads") / book.local_cover_path
        try:
            old_path.unlink(missing_ok=True)
        except Exception:
            pass

    # 保存新文件
    save_name = f"{book_id}_{int(__import__('time').time())}{suffix}"
    save_path = COVER_UPLOAD_DIR / save_name
    save_path.write_bytes(content)

    # 更新数据库
    book.local_cover_path = f"covers/{save_name}"
    db.commit()

    logger.info(f"本地封面上传成功: book={book_id} path={book.local_cover_path}")
    return {
        "success": True,
        "message": "封面上传成功",
        "local_cover_path": book.local_cover_path,
        "local_cover_url": f"/uploads/{book.local_cover_path}",
    }


@router.delete("/cover/{book_id}", summary="删除本地封面图片")
async def delete_local_cover(
    book_id: int,
    db: Session = Depends(get_db),
):
    """删除指定图书的本地封面图片（文件和数据库记录）。"""
    book = db.query(BookMetadata).filter(BookMetadata.book_id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="图书不存在")

    if not book.local_cover_path:
        raise HTTPException(status_code=404, detail="该书没有本地封面")

    # 删除文件
    file_path = Path("uploads") / book.local_cover_path
    try:
        file_path.unlink(missing_ok=True)
    except Exception as e:
        logger.warning(f"删除封面文件失败: {file_path} - {e}")

    # 清除数据库记录
    book.local_cover_path = None
    db.commit()

    logger.info(f"本地封面已删除: book={book_id}")
    return {"success": True, "message": "本地封面已删除"}


# ==================== 本地缓存封面直连 ====================


@router.get("/cache/{filename:path}", summary="直接获取本地缓存封面")
async def serve_cached_cover(filename: str):
    """
    直接提供 backend/cache/images/ 目录下的封面文件。

    用于 NeDB 导入等场景，封面已复制到 cache/images/ 但未挂载静态路由。
    比 /proxy 端点更轻量，无需 URL 参数和域名白名单。
    """
    cache_dir = Path("cache/images")
    file_path = (cache_dir / filename).resolve()

    # 安全检查：确保文件在 cache/images/ 目录内
    if not str(file_path).startswith(str(cache_dir.resolve())):
        raise HTTPException(status_code=403, detail="路径非法")

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="封面文件不存在")

    media_type, _ = mimetypes.guess_type(str(file_path))
    return FileResponse(
        str(file_path),
        media_type=media_type or "image/jpeg",
        headers={"Cache-Control": f"public, max-age={BROWSER_CACHE_MAX_AGE}"},
    )