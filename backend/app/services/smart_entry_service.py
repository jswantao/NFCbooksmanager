# backend/app/services/smart_entry_service.py
"""
智能录入与信息补全服务

提供：
- 图片 ISBN 识别（条形码扫描 + OCR 占位）
- 多源图书信息查询（豆瓣 + Google Books + OpenLibrary）
- 缺失字段检测与自动补全
- 批量信息增强

设计原则：
- 多源冗余：优先豆瓣，降级 Google Books/OpenLibrary
- 优雅降级：OCR 不可用时返回清晰错误而非崩溃
- 无阻塞：所有外部 API 调用均为异步
"""

import re
import hashlib
import asyncio
from typing import Optional, Dict, Any, List, Tuple
from pathlib import Path
from io import BytesIO

import httpx
from loguru import logger
from sqlalchemy.orm import Session

from app.models.models import BookMetadata
from app.utils.helpers import clean_isbn
from app.core.config import get_settings

# ==================== ISBN 校验 ====================

def validate_isbn(isbn: str) -> Optional[str]:
    """校验并清洗 ISBN，返回 13 位 ISBN 或 None"""
    cleaned = clean_isbn(isbn)
    if not cleaned:
        return None
    if len(cleaned) == 10:
        cleaned = _isbn10_to_13(cleaned)
    if len(cleaned) == 13 and cleaned.isdigit():
        return cleaned
    return None


def _isbn10_to_13(isbn10: str) -> str:
    """ISBN-10 转 ISBN-13"""
    base = "978" + isbn10[:9]
    total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(base))
    check = (10 - total % 10) % 10
    return base + str(check)


# ==================== 图片 ISBN 提取 ====================

def extract_isbn_from_barcode(image_bytes: bytes) -> Optional[str]:
    """
    使用 pyzbar 从图片中扫描 ISBN 条形码。

    返回提取到的 ISBN 字符串，未找到则返回 None。
    需要安装: pip install pyzbar (和系统 libzbar)
    """
    try:
        from PIL import Image
        from pyzbar.pyzbar import decode
    except ImportError:
        logger.debug("pyzbar 未安装，跳过条形码扫描")
        return None

    try:
        img = Image.open(BytesIO(image_bytes))
        results = decode(img)
        for r in results:
            data = r.data.decode("utf-8", errors="ignore").strip()
            isbn = validate_isbn(data)
            if isbn:
                logger.info(f"条形码扫描成功: {isbn}")
                return isbn
        return None
    except Exception as e:
        logger.warning(f"条形码扫描异常: {e}")
        return None


def extract_isbn_from_image_text(text: str) -> Optional[str]:
    """
    从 OCR/Dify 多模态模型返回的文本中提取 ISBN。

    支持格式：ISBN-13、ISBN-10、连字符分隔、空格分隔。
    """
    # 匹配 ISBN-13 (978/979 开头)
    m = re.search(r'(?:ISBN[:\s]*)?(97[89]\d{9,10})', text, re.IGNORECASE)
    if m:
        return validate_isbn(m.group(1))

    # 匹配 ISBN-10
    m = re.search(r'(?:ISBN[:\s]*)?(\d{9}[\dXx])', text, re.IGNORECASE)
    if m:
        return validate_isbn(m.group(1))

    # 匹配连字符格式 (如 978-7-5490-2168-0)
    m = re.search(r'(97[89][-\s]?\d[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d)', text)
    if m:
        return validate_isbn(m.group(1))

    # 匹配纯 13 位数字
    m = re.search(r'\b(97[89]\d{10})\b', text)
    if m:
        return validate_isbn(m.group(1))

    return None


# ==================== 多源图书查询 ====================

async def lookup_by_isbn_douban(isbn: str) -> Optional[Dict[str, Any]]:
    """通过豆瓣服务查询图书信息"""
    try:
        from app.services.douban_service import DoubanService
        from app.core.dependencies import get_douban_service
        svc = get_douban_service()
        data = await svc.search_by_isbn(isbn)
        if data:
            data["lookup_source"] = "douban"
            return data
    except Exception as e:
        logger.warning(f"豆瓣查询失败 [{isbn}]: {e}")
    return None


async def lookup_by_isbn_google(isbn: str) -> Optional[Dict[str, Any]]:
    """通过 Google Books API 查询图书信息（优先使用 API Key，无 Key 则匿名访问）"""
    try:
        from app.services.google_books_service import google_books_service
        data = await google_books_service.search_by_isbn(isbn)
        if data:
            data["lookup_source"] = "google_books"
            return data
    except Exception as e:
        logger.warning(f"Google Books 查询失败 [{isbn}]: {e}")
    return None


async def lookup_by_isbn_taiwan(isbn: str) -> Optional[Dict[str, Any]]:
    """通过台湾国家图书馆 ISBN 数据库查询图书信息（台湾出版社覆盖最佳）"""
    try:
        from app.services.taiwan_isbn_service import taiwan_isbn_service
        data = await taiwan_isbn_service.search_by_isbn(isbn)
        if data:
            data["lookup_source"] = "taiwan_isbn"
            return data
    except Exception as e:
        logger.warning(f"台湾ISBN服务查询失败 [{isbn}]: {e}")
    return None


async def lookup_by_isbn_openlibrary(isbn: str) -> Optional[Dict[str, Any]]:
    """通过 OpenLibrary API 查询图书信息"""
    url = f"https://openlibrary.org/isbn/{isbn}.json"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return None
            data = resp.json()

            authors = []
            for author_ref in data.get("authors", []):
                author_key = author_ref.get("key", "")
                authors.append(author_key.replace("/authors/", ""))

            cover_url = ""
            if cover_id := data.get("covers", [None])[0]:
                cover_url = f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"

            result = {
                "isbn": isbn,
                "title": data.get("title", ""),
                "author": ", ".join(authors) if authors else "",
                "publisher": ", ".join(data.get("publishers", [])),
                "publish_date": data.get("publish_date", ""),
                "pages": str(data.get("number_of_pages", "")),
                "summary": "",
                "cover_url": cover_url,
                "rating": "",
                "binding": "",
                "translator": "",
                "original_title": "",
                "series": "",
                "price": "",
                "douban_url": "",
                "source": "openlibrary",
                "lookup_source": "openlibrary",
            }

            # 获取描述
            works_key = data.get("works", [{}])[0].get("key", "")
            if works_key:
                try:
                    desc_resp = await client.get(f"https://openlibrary.org{works_key}.json")
                    if desc_resp.status_code == 200:
                        desc_data = desc_resp.json()
                        desc = desc_data.get("description", "")
                        if isinstance(desc, dict):
                            desc = desc.get("value", "")
                        result["summary"] = desc[:500] if desc else ""
                except Exception:
                    pass

            logger.info(f"OpenLibrary 查询成功: {result['title']}")
            return result

    except Exception as e:
        logger.warning(f"OpenLibrary 查询失败 [{isbn}]: {e}")
    return None


async def isbn_lookup(isbn: str) -> Dict[str, Any]:
    """
    多源 ISBN 查询：豆瓣 → Google Books → 台湾ISBN → OpenLibrary 降级。

    Returns:
        {"success": bool, "data": {...}, "source": str, "message": str}
    """
    cleaned = validate_isbn(isbn)
    if not cleaned:
        return {"success": False, "data": None, "source": "", "message": f"无效的 ISBN: {isbn}"}

    # 1. 豆瓣（优先）
    data = await lookup_by_isbn_douban(cleaned)
    if data and data.get("title"):
        return {"success": True, "data": data, "source": "douban", "message": "从豆瓣获取"}

    # 2. Google Books
    data = await lookup_by_isbn_google(cleaned)
    if data and data.get("title"):
        return {"success": True, "data": data, "source": "google_books", "message": "从 Google Books 获取"}

    # 3. 台湾国家图书馆 ISBN（台湾出版社覆盖最佳）
    data = await lookup_by_isbn_taiwan(cleaned)
    if data and data.get("title"):
        return {"success": True, "data": data, "source": "taiwan_isbn", "message": "从台湾国家图书馆获取"}

    # 4. OpenLibrary
    data = await lookup_by_isbn_openlibrary(cleaned)
    if data and data.get("title"):
        return {"success": True, "data": data, "source": "openlibrary", "message": "从 OpenLibrary 获取"}

    return {
        "success": False, "data": None, "source": "",
        "message": f"未在任何数据源找到 ISBN {cleaned} 的图书信息，请确认 ISBN 是否正确或尝试手动录入"
    }


# ==================== 缺失字段检测与补全 ====================

# 关键字段（对图书信息完整性最重要）
_CRITICAL_FIELDS = {"title", "author"}
_IMPORTANT_FIELDS = {"publisher", "publish_date", "pages", "price", "binding", "rating", "summary", "cover_url"}
_AUXILIARY_FIELDS = {"translator", "series", "original_title", "douban_url"}

ALL_METADATA_FIELDS = _CRITICAL_FIELDS | _IMPORTANT_FIELDS | _AUXILIARY_FIELDS


def detect_missing_fields(db: Session, book_id: int) -> Dict[str, Any]:
    """
    检测图书的缺失字段。

    Returns:
        {
            "book_id": int,
            "title": str,
            "missing_fields": [str, ...],
            "completeness": float (0-100),
            "critical_missing": [str, ...],  # 必须补全的关键字段
            "suggestion": str  # 人类可读的建议
        }
    """
    book = db.query(BookMetadata).filter(BookMetadata.book_id == book_id).first()
    if not book:
        return {"book_id": book_id, "title": "", "missing_fields": [], "completeness": 0, "critical_missing": [], "suggestion": "图书不存在"}

    missing = []
    critical_missing = []

    for field in _CRITICAL_FIELDS:
        val = getattr(book, field, None)
        if not val or (isinstance(val, str) and not val.strip()):
            missing.append(field)
            critical_missing.append(field)

    for field in _IMPORTANT_FIELDS:
        val = getattr(book, field, None)
        if not val or (isinstance(val, str) and not val.strip()):
            missing.append(field)

    for field in _AUXILIARY_FIELDS:
        val = getattr(book, field, None)
        if not val or (isinstance(val, str) and not val.strip()):
            missing.append(field)

    total = len(ALL_METADATA_FIELDS)
    filled = total - len(missing)
    completeness = round(filled / total * 100, 1)

    suggestion = _generate_suggestion(missing, critical_missing, completeness)

    return {
        "book_id": book_id,
        "isbn": book.isbn,
        "title": book.title or "(无书名)",
        "missing_fields": missing,
        "filled_fields": [f for f in ALL_METADATA_FIELDS if f not in missing],
        "completeness": completeness,
        "critical_missing": critical_missing,
        "suggestion": suggestion,
    }


def _generate_suggestion(missing: List[str], critical: List[str], completeness: float) -> str:
    """生成人类可读的补全建议"""
    if completeness >= 90:
        return "信息基本完整，仅有少量字段可补充"
    if completeness >= 70:
        cn_names = [_field_cn_name(f) for f in missing]
        return f"建议补充: {'、'.join(cn_names[:5])}"
    if critical:
        cn_names = [_field_cn_name(f) for f in critical]
        return f"关键信息缺失: {'、'.join(cn_names)}，建议通过 ISBN 查询或手动录入补全"
    cn_names = [_field_cn_name(f) for f in missing[:5]]
    return f"信息不完整，建议补全: {'、'.join(cn_names)}"


def _field_cn_name(field: str) -> str:
    """字段名 → 中文名"""
    names = {
        "title": "书名", "author": "作者", "translator": "译者",
        "publisher": "出版社", "publish_date": "出版日期", "pages": "页数",
        "price": "定价", "binding": "装帧", "rating": "评分",
        "summary": "内容简介", "cover_url": "封面", "original_title": "原作名",
        "series": "丛书", "douban_url": "豆瓣链接",
    }
    return names.get(field, field)


async def enrich_book(db: Session, book_id: int) -> Dict[str, Any]:
    """
    自动补全图书缺失字段。

    逻辑：
    1. 检测缺失字段
    2. 如果有 ISBN，尝试多源查询
    3. 用查询结果填充缺失字段
    4. 保存到数据库
    """
    book = db.query(BookMetadata).filter(BookMetadata.book_id == book_id).first()
    if not book:
        return {"success": False, "message": "图书不存在", "filled_fields": [], "skipped_fields": []}

    detection = detect_missing_fields(db, book_id)
    missing = detection["missing_fields"]

    if not missing:
        return {
            "success": True,
            "message": f"《{book.title}》信息已完整 ({detection['completeness']}%)",
            "filled_fields": [],
            "skipped_fields": [],
            "completeness": detection["completeness"],
        }

    filled = []
    skipped = []

    # 如果有 ISBN，尝试多源查询
    if book.isbn:
        lookup_result = await isbn_lookup(book.isbn)
        if lookup_result["success"] and lookup_result["data"]:
            data = lookup_result["data"]
            for field in missing:
                if field == "isbn":
                    continue
                value = data.get(field)
                if value and (not isinstance(value, str) or value.strip()):
                    try:
                        setattr(book, field, value)
                        filled.append(_field_cn_name(field))
                    except Exception:
                        skipped.append(_field_cn_name(field))
                else:
                    skipped.append(_field_cn_name(field))
        else:
            skipped = [_field_cn_name(f) for f in missing]
            return {
                "success": False,
                "message": f"无法查询 ISBN {book.isbn} 的信息，请手动补全缺失字段",
                "filled_fields": [],
                "skipped_fields": skipped,
                "completeness": detection["completeness"],
            }
    else:
        skipped = [_field_cn_name(f) for f in missing]
        return {
            "success": False,
            "message": "该书无 ISBN，无法自动补全。请手动录入缺失字段或添加 ISBN 后重试。",
            "filled_fields": [],
            "skipped_fields": skipped,
            "completeness": detection["completeness"],
        }

    db.commit()
    new_detection = detect_missing_fields(db, book_id)

    return {
        "success": True,
        "message": f"《{book.title}》已自动补全 {len(filled)} 个字段: {', '.join(filled)}",
        "filled_fields": filled,
        "skipped_fields": skipped,
        "completeness": new_detection["completeness"],
        "lookup_source": lookup_result.get("source", ""),
    }


async def batch_enrich_books(db: Session, book_ids: List[int]) -> Dict[str, Any]:
    """批量自动补全图书信息"""
    results = []
    success_count = 0
    fail_count = 0

    for book_id in book_ids:
        result = await enrich_book(db, book_id)
        if result["success"]:
            success_count += 1
        else:
            fail_count += 1
        results.append(result)
        # 请求间隔，避免被限流
        await asyncio.sleep(0.3)

    return {
        "success": True,
        "total": len(book_ids),
        "enriched": success_count,
        "failed": fail_count,
        "results": results,
        "message": f"批量补全完成: 成功 {success_count} 本，失败 {fail_count} 本",
    }


def find_books_with_missing_fields(db: Session, limit: int = 50) -> List[Dict[str, Any]]:
    """查找信息不完整的图书（按完整度升序排列）"""
    books = db.query(BookMetadata).all()
    results = []
    for book in books:
        detection = detect_missing_fields(db, book.book_id)
        if detection["missing_fields"]:
            results.append(detection)
        if len(results) >= limit:
            break
    results.sort(key=lambda x: x["completeness"])
    return results


async def auto_fill_form(isbn: str, partial_title: str = "") -> Dict[str, Any]:
    """
    根据 ISBN（和可选书名）自动填充表单。

    适用场景：用户提供了最少信息（如封面照片 → ISBN），
    系统自动查询外部数据源并返回预填充的表单数据。

    Returns:
        {"success": bool, "form_data": {...}, "source": str, "message": str}
    """
    lookup = await isbn_lookup(isbn)
    if not lookup["success"]:
        return {
            "success": False,
            "form_data": None,
            "source": "",
            "message": lookup["message"],
        }

    data = lookup["data"]
    # 过滤掉空值和内部字段
    form_data = {
        "isbn": lookup["data"].get("isbn", isbn),
        "title": data.get("title", partial_title),
        "author": data.get("author", ""),
        "translator": data.get("translator", ""),
        "publisher": data.get("publisher", ""),
        "publish_date": data.get("publish_date", ""),
        "cover_url": data.get("cover_url", ""),
        "summary": data.get("summary", ""),
        "pages": data.get("pages", ""),
        "price": data.get("price", ""),
        "binding": data.get("binding", ""),
        "original_title": data.get("original_title", ""),
        "series": data.get("series", ""),
        "rating": data.get("rating", ""),
        "douban_url": data.get("douban_url", ""),
        "source": lookup["source"],
    }
    # 移除 None 和空字符串
    form_data = {k: v for k, v in form_data.items() if v is not None and v != ""}

    return {
        "success": True,
        "form_data": form_data,
        "source": lookup["source"],
        "message": f"从 {lookup['source']} 获取到图书信息",
    }
