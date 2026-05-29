# backend/app/services/chat_service.py
"""
自然语言智能搜索服务

提供：
- 多维度加权 ILIKE 检索（title/author/publisher/series/summary/original_title）
- n-gram 中文分词
- 时间范围过滤（如 "去年" → 2025）
- 相似图书推荐（基于 author/publisher/series 加权匹配）
- 知识库导出
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, List
from loguru import logger

from sqlalchemy import or_, func, case, literal
from sqlalchemy.orm import Session

from app.models.models import BookMetadata, LogicalShelfBook, LogicalShelf, PhysicalLogicalMapping, PhysicalShelf


# 字段权重（搜索匹配）
_FIELD_WEIGHTS = {
    "title": 5,
    "author": 4,
    "series": 3,
    "summary": 2,
    "publisher": 2,
    "original_title": 1,
}

# 推荐相似度权重
_SIMILARITY_WEIGHTS = {
    "author": 3,
    "publisher": 2,
    "series": 1,
}

# 常见时间表达 → 年份映射
_TIME_PATTERNS = {
    "去年": 1,
    "前年": 2,
    "今年": 0,
    "大前年": 3,
}


def tokenize_query(query: str) -> List[str]:
    """
    简单中文 n-gram 分词（2-gram + 3-gram）外加全匹配。
    不做 jieba 依赖，轻量级足够短查询使用。
    """
    tokens = []

    # 完整字符串作为整体匹配
    cleaned = query.strip()
    if cleaned:
        tokens.append(cleaned)

    # n-gram (2~3 字符)
    for n in (2, 3):
        for i in range(len(cleaned) - n + 1):
            tokens.append(cleaned[i : i + n])

    # 保留一些有意义的单字
    meaningful_single = {"书", "红", "白", "黑", "蓝", "大", "小", "新", "旧"}
    for ch in cleaned:
        if ch in meaningful_single and ch not in tokens:
            tokens.append(ch)

    return list(set(tokens))


def _extract_time_range(query: str) -> Optional[int]:
    """从查询中提取时间范围（年份），无匹配返回 None。"""
    query_lower = query.lower()

    # 尝试匹配 "去年"/"前年" 等
    for pattern, offset in _TIME_PATTERNS.items():
        if pattern in query:
            return datetime.now().year - offset

    # 尝试匹配 4 位年份
    import re
    m = re.search(r"(19|20)\d{2}", query)
    if m:
        return int(m.group(0))

    return None


def search_local_books(db: Session, query: str, limit: int = 10) -> Dict[str, Any]:
    """
    多维度图书检索。

    算法：
    1. n-gram 分词
    2. 对每个 token 在 6 个字段上做 ILIKE
    3. 按字段权重累计 relevance_score
    4. 叠加时间范围过滤
    5. 按总分降序返回
    """
    tokens = tokenize_query(query)
    if not tokens:
        return {"results": [], "total": 0, "query_understanding": "无法解析查询"}

    books = db.query(BookMetadata).all()
    scored = []

    for book in books:
        score = 0.0
        matched_fields = []
        title_lower = (book.title or "").lower()
        author_lower = (book.author or "").lower()
        publisher_lower = (book.publisher or "").lower()
        series_lower = (book.series or "").lower()
        summary_lower = (book.summary or "").lower()
        orig_title_lower = (book.original_title or "").lower()

        for token in tokens:
            token_lower = token.lower()
            if token_lower in title_lower:
                score += _FIELD_WEIGHTS["title"]
                matched_fields.append("title")
            if token_lower in author_lower:
                score += _FIELD_WEIGHTS["author"]
                matched_fields.append("author")
            if series_lower and token_lower in series_lower:
                score += _FIELD_WEIGHTS["series"]
                matched_fields.append("series")
            if summary_lower and token_lower in summary_lower:
                score += _FIELD_WEIGHTS["summary"]
                matched_fields.append("summary")
            if publisher_lower and token_lower in publisher_lower:
                score += _FIELD_WEIGHTS["publisher"]
                matched_fields.append("publisher")
            if orig_title_lower and token_lower in orig_title_lower:
                score += _FIELD_WEIGHTS["original_title"]
                matched_fields.append("original_title")

        if score > 0:
            scored.append((book, score, list(set(matched_fields))))

    # 时间过滤（降低不匹配年份的权重）
    target_year = _extract_time_range(query)
    if target_year:
        for i, (book, score, fields) in enumerate(scored):
            if book.publish_date:
                try:
                    book_year = int(book.publish_date[:4])
                    if abs(book_year - target_year) <= 1:
                        # 年份接近，加分
                        scored[i] = (book, score + 3, fields)
                except (ValueError, TypeError):
                    pass

    # 按分数降序排序
    scored.sort(key=lambda x: x[1], reverse=True)
    top = scored[:limit]

    # 获取每本书所在的书架
    results = []
    for book, score, matched_fields in top:
        shelf_names = _get_book_shelves(db, book.book_id)
        summary = (book.summary or "")[:200]
        results.append({
            "book_id": book.book_id,
            "isbn": book.isbn,
            "title": book.title,
            "author": book.author,
            "publisher": book.publisher,
            "cover_url": book.cover_url,
            "rating": book.rating,
            "summary": summary + ("..." if len(book.summary or "") > 200 else ""),
            "shelf_names": shelf_names,
            "relevance_score": round(score, 1),
        })

    query_understanding = _generate_understanding(query, len(top))
    return {
        "results": results,
        "total": len(top),
        "query_understanding": query_understanding,
    }


def get_book_detail(db: Session, book_id: int) -> Optional[Dict[str, Any]]:
    """获取图书完整信息（含所在书架和物理位置）。"""
    book = db.query(BookMetadata).filter(BookMetadata.book_id == book_id).first()
    if not book:
        return None

    shelves = _get_book_shelves_detail(db, book_id)
    return {
        "book_id": book.book_id,
        "isbn": book.isbn,
        "title": book.title,
        "author": book.author,
        "translator": book.translator,
        "publisher": book.publisher,
        "publish_date": book.publish_date,
        "pages": book.pages,
        "price": book.price,
        "binding": book.binding,
        "series": book.series,
        "original_title": book.original_title,
        "rating": book.rating,
        "summary": book.summary,
        "cover_url": book.cover_url,
        "source": book.source,
        "shelves": shelves,
    }


def get_similar_books(db: Session, book_id: int, limit: int = 5) -> List[Dict[str, Any]]:
    """
    基于图书特征推荐相似馆藏。

    匹配规则（按权重累计）：
    - 同作者: 3 分
    - 同出版社: 2 分
    - 同系列: 1 分
    按总分降序，排除自身。
    """
    book = db.query(BookMetadata).filter(BookMetadata.book_id == book_id).first()
    if not book:
        return []

    all_books = db.query(BookMetadata).filter(BookMetadata.book_id != book_id).all()
    scored = []

    for other in all_books:
        score = 0
        reasons = []
        if book.author and other.author and book.author == other.author:
            score += _SIMILARITY_WEIGHTS["author"]
            reasons.append(f"同作者: {book.author}")
        if book.publisher and other.publisher and book.publisher == other.publisher:
            score += _SIMILARITY_WEIGHTS["publisher"]
            reasons.append(f"同出版社: {book.publisher}")
        if book.series and other.series and book.series == other.series:
            score += _SIMILARITY_WEIGHTS["series"]
            reasons.append(f"同系列: {book.series}")

        if score > 0:
            scored.append((other, score, reasons))

    scored.sort(key=lambda x: x[1], reverse=True)
    top = scored[:limit]

    results = []
    for b, score, reasons in top:
        shelf_names = _get_book_shelves(db, b.book_id)
        results.append({
            "book_id": b.book_id,
            "isbn": b.isbn,
            "title": b.title,
            "author": b.author,
            "publisher": b.publisher,
            "cover_url": b.cover_url,
            "rating": b.rating,
            "summary": (b.summary or "")[:150],
            "shelf_names": shelf_names,
            "relevance_score": round(score, 1),
            "reasons": reasons,
        })

    return results


def export_books_for_knowledge_base(db: Session, output_path: Optional[str] = None) -> Dict[str, Any]:
    """
    将所有图书导出为 知识库可导入的 Markdown (.md) 格式。

    每本书以 `---` 分隔为一个独立文档段，包含：
    - 以 # 标题开头的结构化元数据
    - 拼接后的可搜索正文（供 embedding 模型）
    - 书架位置、评分等辅助信息

    Dify 导入时使用「自动分段与清洗」模式，`---` 分隔符会被识别为文档边界。
    """
    from app.services.dify_sync_service import build_book_text

    books = db.query(BookMetadata).all()
    lines: list[str] = []

    for i, book in enumerate(books):
        shelf_names = _get_book_shelves(db, book.book_id)
        body = build_book_text(book)

        # 用 --- 分隔每本书（第一个文档前不需要分隔符）
        if i > 0:
            lines.append("\n---\n")

        lines.append(f"# {book.title}\n")
        lines.append(f"- **作者**: {book.author or '未知'}")
        lines.append(f"- **ISBN**: {book.isbn or 'N/A'}")
        if book.publisher:
            lines.append(f"- **出版社**: {book.publisher}")
        if book.series:
            lines.append(f"- **系列**: {book.series}")
        if book.original_title:
            lines.append(f"- **原作名**: {book.original_title}")
        if book.translator:
            lines.append(f"- **译者**: {book.translator}")
        if book.publish_date:
            lines.append(f"- **出版日期**: {book.publish_date}")
        if book.pages:
            lines.append(f"- **页数**: {book.pages}")
        if book.price:
            lines.append(f"- **定价**: {book.price}")
        if book.binding:
            lines.append(f"- **装帧**: {book.binding}")
        if book.rating:
            lines.append(f"- **评分**: {book.rating}")
        lines.append(f"- **来源**: {book.source or 'manual'}")
        if shelf_names:
            lines.append(f"- **所在书架**: {'、'.join(shelf_names)}")
        lines.append(f"- **馆藏编号**: B-{book.book_id}")

        if book.summary:
            lines.append(f"\n## 内容简介\n\n{book.summary}")

        # 正文（供 embedding）
        lines.append(f"\n## 检索正文\n\n{body}")

    content = "\n".join(lines)

    # 保存到文件
    if output_path:
        filepath = Path(output_path)
    else:
        filepath = Path(__file__).resolve().parent.parent.parent / "dify" / "knowledge-base.md"

    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

    logger.info(f"知识库导出完成: {len(books)} 本书 → {filepath}")
    return {"success": True, "exported_count": len(books), "file_path": str(filepath)}


# ==================== 辅助函数 ====================

def _get_book_shelves(db: Session, book_id: int) -> List[str]:
    """获取图书所在书架名称列表。"""
    shelf_books = db.query(LogicalShelfBook).filter(
        LogicalShelfBook.book_id == book_id,
        LogicalShelfBook.status == "in_shelf",
    ).all()

    names = []
    for sb in shelf_books:
        shelf = db.query(LogicalShelf).filter(LogicalShelf.logical_shelf_id == sb.logical_shelf_id).first()
        if shelf:
            names.append(shelf.shelf_name)
    return names


def _get_book_shelves_detail(db: Session, book_id: int) -> List[Dict[str, Any]]:
    """获取图书所在书架详情（含物理位置）。"""
    shelf_books = db.query(LogicalShelfBook).filter(
        LogicalShelfBook.book_id == book_id,
        LogicalShelfBook.status == "in_shelf",
    ).all()

    shelves = []
    for sb in shelf_books:
        shelf = db.query(LogicalShelf).filter(LogicalShelf.logical_shelf_id == sb.logical_shelf_id).first()
        if not shelf:
            continue

        # 查询物理位置
        mapping = db.query(PhysicalLogicalMapping).filter(
            PhysicalLogicalMapping.logical_shelf_id == shelf.logical_shelf_id
        ).first()
        physical_location = None
        if mapping:
            phys = db.query(PhysicalShelf).filter(
                PhysicalShelf.physical_shelf_id == mapping.physical_shelf_id
            ).first()
            if phys:
                physical_location = phys.location_code

        shelves.append({
            "logical_shelf_id": shelf.logical_shelf_id,
            "shelf_name": shelf.shelf_name,
            "physical_location": physical_location,
        })
    return shelves


def _generate_understanding(query: str, result_count: int) -> str:
    """生成查询理解摘要。"""
    if result_count == 0:
        return f"未找到与「{query}」匹配的馆藏图书"
    elif result_count <= 3:
        return f"为「{query}」找到 {result_count} 本可能匹配的图书"
    else:
        return f"为「{query}」找到 {result_count} 本相关图书"
