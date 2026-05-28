# backend/app/services/nedb_import_service.py
"""
NeDB 数据库导入服务

从 ManageBooksMac (旧版 Electron 应用) 的 NeDB 文件中读取图书元数据，
映射字段后导入当前系统 BookMetadata 表。

NeDB 文件格式: 换行分隔的 JSON（NDJSON），每行一个 JSON 文档，无需外部依赖。

流程:
    上传 .db → 预览(含重复ISBN详情) → 用户逐条决定合并/跳过 → 执行导入
"""

import os
import re
import shutil
from typing import Optional, Dict, Any, List
from loguru import logger

from app.utils.helpers import clean_isbn


# ==================== NeDB 文件解析 ====================


def parse_nedb_file(file_content: Any) -> List[Dict[str, Any]]:
    """
    解析 NeDB 数据库文件，返回全部文档列表

    NeDB 文件格式：换行分隔的 JSON（每行一个 JSON 文档）。
    无需任何外部依赖即可解析。
    """
    import json as _json

    if isinstance(file_content, bytes):
        text = file_content.decode("utf-8", errors="replace")
    else:
        text = file_content

    docs = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            doc = _json.loads(line)
            if isinstance(doc, dict):
                docs.append(doc)
        except _json.JSONDecodeError:
            logger.debug(f"NeDB 跳过非 JSON 行: {line[:80]}...")
            continue

    return docs


# ==================== 字段映射 ====================


def map_nedb_to_book(doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    将 NeDB 文档映射为 BookMetadata 创建参数字典

    映射规则：
    - 直接映射: isbn, author, translator, publisher, price, binding, doubanUrl
    - 重命名: bookName→title, bookSeries→series, bookRawName→original_title
    - 类型转换: bookPages (Number→str), scoreDouban (Number→str)
    - 拼接: subBookName 拼入 title, authorCountry 拼入 author
    - 日期标准化: publishDate → YYYY-MM
    """
    def _str(val, default=""):
        if val is None:
            return default
        return str(val).strip()

    def _num_str(val, default=""):
        if val is None:
            return default
        if isinstance(val, (int, float)):
            return str(int(val)) if val == int(val) else str(val)
        return str(val).strip()

    def _to_int(val):
        """转换为整数，用于 pages 等字段"""
        if val is None:
            return None
        if isinstance(val, (int, float)):
            return int(val)
        try:
            return int(str(val).strip())
        except (ValueError, TypeError):
            return None

    # 书名
    title = _str(doc.get("bookName") or doc.get("title"))
    sub = _str(doc.get("subBookName") or doc.get("subTitle"))
    if sub:
        title = f"{title}: {sub}"

    # 作者
    author = _str(doc.get("author"))
    country = _str(doc.get("authorCountry"))
    if country and country != "中国" and not author.startswith("["):
        author = f"[{country}] {author}"

    # ISBN 清洗（含 14 位截断：97875507132246 → 9787550713224）
    isbn = clean_isbn(_str(doc.get("isbn")))
    if not isbn:
        isbn = _str(doc.get("isbn"))
    # 14 位 ISBN（978/979 前缀 + 额外重复校验位）→ 截取前 13 位
    if len(isbn) == 14 and isbn[:3] in ("978", "979"):
        isbn = isbn[:13]
        logger.debug(f"ISBN 截断: 14位 → 13位 ({isbn})")

    # 出版日期标准化
    pub_date = _str(doc.get("publishDate") or doc.get("publish_date"))
    pub_date = _normalize_date(pub_date)

    # 评分
    rating = _str(doc.get("scoreDouban") or doc.get("rating"))
    if rating:
        try:
            rating = str(round(float(rating), 1))
        except (ValueError, TypeError):
            pass

    # 简介截断
    summary = _str(doc.get("bookSummary") or doc.get("summary"))
    if len(summary) > 2000:
        summary = summary[:2000] + "..."

    # 保留原始 ISBN（含连字符），用于封面文件名匹配
    raw_isbn = _str(doc.get("isbn"))

    return {
        "isbn": isbn,
        "raw_isbn": raw_isbn,
        "title": title,
        "author": author,
        "translator": _str(doc.get("translator")),
        "publisher": _str(doc.get("publisher")),
        "publish_date": pub_date,
        "pages": _to_int(doc.get("bookPages") or doc.get("pages")),
        "price": _str(doc.get("price")),
        "binding": _str(doc.get("binding")),
        "original_title": _str(doc.get("bookRawName") or doc.get("original_title")),
        "series": _str(doc.get("bookSeries") or doc.get("series")),
        "rating": rating,
        "summary": summary,
        "douban_url": _str(doc.get("doubanUrl") or doc.get("douban_url")),
        "cover_url": _str(doc.get("coverSrc") or doc.get("cover_url")) or None,
        "source": "nedb_import",
    }


def _normalize_date(date_str: str) -> str:
    """日期标准化: 2021-1 → 2021-01, 2021 → 2021-01"""
    if not date_str:
        return ""
    m = re.match(r"^(\d{4})-(\d{1,2})$", date_str)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}"
    m = re.match(r"^(\d{4})[/.](\d{1,2})$", date_str)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}"
    if re.match(r"^\d{4}$", date_str):
        return date_str
    return date_str


# ==================== 预览 ====================


def preview_nedb_import(
    docs: List[Dict[str, Any]],
    db_session,
) -> Dict[str, Any]:
    """
    预览 NeDB 导入：统计新增/已存在/无效数量，返回重复ISBN详情

    返回值新增 duplicate_items 列表，供前端展示去重决策界面:
        [{isbn, title, author, existing_book_id, existing_title}]

    Returns:
        {total, new_count, existing_count, invalid_count,
         samples: [...], duplicate_items: [...]}
    """
    from app.models.models import BookMetadata

    mapped = []
    existing_isbns = {}
    invalid = []
    seen_isbns: dict = {}  # 追踪 NeDB 文件内重复的 ISBN

    for doc in docs:
        book_data = map_nedb_to_book(doc)
        isbn = book_data["isbn"]
        if not isbn or len(isbn) < 10:
            invalid.append({"title": book_data["title"][:50], "reason": "ISBN 无效"})
            continue
        if isbn in seen_isbns:
            seen_isbns[isbn] += 1
        else:
            seen_isbns[isbn] = 1
        mapped.append(book_data)

    # 查询已存在的 ISBN
    unique_isbns = list(set(b["isbn"] for b in mapped))
    if unique_isbns:
        existing_rows = (
            db_session.query(BookMetadata.isbn, BookMetadata.book_id, BookMetadata.title)
            .filter(BookMetadata.isbn.in_(unique_isbns))
            .all()
        )
        existing_isbns = {
            row[0]: {"book_id": row[1], "title": row[2]}
            for row in existing_rows
        }

    # 内部重复（同 ISBN 在 NeDB 文件中出现多次）
    internal_dup_isbns = {k: v for k, v in seen_isbns.items() if v > 1}
    internal_dup_count = sum(v - 1 for v in internal_dup_isbns.values())

    # 统计（按唯一 ISBN）
    new_unique = sum(1 for isbn in unique_isbns if isbn not in existing_isbns)
    existing_unique = len(existing_isbns)

    # 重复 ISBN 详情（与已存在馆藏冲突的）
    duplicate_items = []
    for isbn in set(b["isbn"] for b in mapped):
        if isbn in existing_isbns:
            # 找第一个使用此 ISBN 的 doc
            for b in mapped:
                if b["isbn"] == isbn:
                    duplicate_items.append({
                        "isbn": isbn,
                        "nedb_title": b["title"][:80],
                        "nedb_author": b["author"][:40],
                        "existing_book_id": existing_isbns[isbn]["book_id"],
                        "existing_title": existing_isbns[isbn]["title"][:80] or "(无书名)",
                    })
                    break

    # 前 10 条样本（去重）
    seen_sample_isbns = set()
    samples = []
    for b in mapped:
        if b["isbn"] in seen_sample_isbns:
            continue
        seen_sample_isbns.add(b["isbn"])
        samples.append({
            "title": b["title"][:60],
            "author": b["author"][:30],
            "isbn": b["isbn"],
            "publisher": b["publisher"][:30],
            "status": "已存在" if b["isbn"] in existing_isbns else "新录入",
        })
        if len(samples) >= 10:
            break

    return {
        "total": len(docs),
        "new_count": new_unique,
        "existing_count": existing_unique,
        "invalid_count": len(invalid),
        "internal_dup_count": internal_dup_count,
        "samples": samples,
        "duplicate_items": duplicate_items,
    }


# ==================== 执行导入 ====================


def execute_nedb_import(
    docs: List[Dict[str, Any]],
    db_session,
    cover_path: str = "",
    shelf_id: Optional[int] = None,
    duplicate_resolution: Optional[Dict[str, str]] = None,
    progress_callback=None,
) -> Dict[str, Any]:
    """
    执行 NeDB 数据导入

    Args:
        docs: NeDB 文档列表
        db_session: SQLAlchemy Session
        cover_path: 用户指定的封面文件目录（如 D:/ManageBooks/covers）
        shelf_id: 可选，导入后添加到指定书架
        duplicate_resolution: ISBN → action 映射 {"978xxx": "merge", "978yyy": "skip"}
                              "merge" = 更新已有记录, "skip" = 跳过
        progress_callback: 可选，每处理一条调用 callback(current, total)

    Returns:
        {total, inserted, merged, skipped, errors: [...]}
    """
    from app.models.models import BookMetadata, LogicalShelfBook, BookStatus

    total = len(docs)
    inserted = 0
    merged = 0
    skipped = 0
    errors: List[Dict] = []
    resolution = duplicate_resolution or {}

    for i, doc in enumerate(docs):
        try:
            book_data = map_nedb_to_book(doc)
            isbn = book_data["isbn"]

            if not isbn or len(isbn) < 10:
                skipped += 1
                if progress_callback:
                    progress_callback(i + 1, total)
                continue

            # ISBN 去重判断
            existing = (
                db_session.query(BookMetadata)
                .filter(BookMetadata.isbn == isbn)
                .first()
            )

            if existing:
                action = resolution.get(isbn, "skip")  # 默认跳过
                if action == "merge":
                    _merge_book_fields(existing, book_data)
                    merged += 1
                else:
                    skipped += 1
                if progress_callback:
                    progress_callback(i + 1, total)
                continue

            # 复制封面（传递原始 ISBN 以支持连字符文件名匹配）
            cover_url = book_data.get("cover_url", "")
            raw_isbn = book_data.get("raw_isbn", isbn)
            if cover_path:
                cover_url = _try_copy_cover(cover_url, cover_path, isbn, raw_isbn)
                book_data["cover_url"] = cover_url

            # 创建新记录
            book = BookMetadata(
                isbn=isbn,
                title=book_data["title"] or "未知书名",
                author=book_data["author"],
                translator=book_data["translator"],
                publisher=book_data["publisher"],
                publish_date=book_data["publish_date"],
                pages=book_data["pages"],
                price=book_data["price"],
                binding=book_data["binding"],
                original_title=book_data["original_title"],
                series=book_data["series"],
                rating=book_data["rating"],
                summary=book_data["summary"],
                cover_url=book_data["cover_url"],
                douban_url=book_data["douban_url"],
                source="nedb_import",
            )
            db_session.add(book)
            db_session.flush()

            if shelf_id:
                shelf_book = LogicalShelfBook(
                    logical_shelf_id=shelf_id,
                    book_id=book.book_id,
                    status=BookStatus.IN_SHELF.value,
                )
                db_session.add(shelf_book)

            inserted += 1

        except Exception as e:
            title = doc.get("bookName") or doc.get("title", "?")
            errors.append({"title": str(title)[:50], "error": str(e)[:200]})
            logger.warning(f"NeDB 导入失败 [{title}]: {e}")

        if progress_callback:
            progress_callback(i + 1, total)

    db_session.commit()

    logger.info(
        f"NeDB 导入完成: {total} 条, "
        f"新增 {inserted}, 合并 {merged}, 跳过 {skipped}, 错误 {len(errors)}"
    )

    return {
        "total": total,
        "inserted": inserted,
        "merged": merged,
        "skipped": skipped,
        "errors": errors,
    }


def _merge_book_fields(existing, book_data: Dict[str, Any]) -> None:
    """
    用 NeDB 数据更新已有记录的空缺字段（仅填充空值，不覆盖已有数据）
    """
    field_map = {
        "title": "title",
        "author": "author",
        "translator": "translator",
        "publisher": "publisher",
        "publish_date": "publish_date",
        "pages": "pages",
        "price": "price",
        "binding": "binding",
        "original_title": "original_title",
        "series": "series",
        "rating": "rating",
        "summary": "summary",
        "douban_url": "douban_url",
    }
    for src_key, dst_attr in field_map.items():
        existing_val = getattr(existing, dst_attr, None)
        new_val = book_data.get(src_key, "")
        if (existing_val is None or str(existing_val).strip() == "") and new_val:
            setattr(existing, dst_attr, new_val)

    # 封面 URL 同样仅填充空值
    if (not existing.cover_url) and book_data.get("cover_url"):
        existing.cover_url = book_data["cover_url"]


def _try_copy_cover(cover_src: str, cover_path: str, isbn: str, raw_isbn: str = "") -> str:
    """
    从用户指定的封面目录复制封面到 backend/cache/images/

    匹配策略（按优先级）:
    1. cover_src 精确匹配（HTTP URL 保持原样，本地路径直接查找）
    2. ISBN 文件名模式匹配（处理连字符格式差异）:
       - book_{raw_isbn}.{jpg|png}  — 含连字符 (如 978-626-024-823-9)
       - book_{isbn}.{jpg|png}       — 无连字符 (如 9786260248239)
       - {raw_isbn}.{jpg|png}
       - {isbn}.{jpg|png}

    Args:
        cover_src: 封面文件名或路径 (可为空字符串)
        cover_path: 用户指定的封面目录 (如 D:/ManageBooks/covers)
        isbn: 清洗后的 ISBN (无连字符)
        raw_isbn: 原始 ISBN (含连字符，用于文件名回退匹配)

    Returns:
        复制后的缓存路径，或原始值
    """
    if not cover_path:
        return cover_src

    # HTTP URL 保持原样
    if cover_src.startswith("http"):
        return cover_src

    # 收集候选路径
    candidates = []

    # 1. cover_src 精确匹配
    if cover_src:
        candidates.append(cover_src)  # 可能是绝对路径
        candidates.append(os.path.join(cover_path, cover_src))
        candidates.append(os.path.join(cover_path, os.path.basename(cover_src)))

    # 2. ISBN 文件名模式匹配
    search_isbns = []
    if raw_isbn:
        search_isbns.append(raw_isbn)  # 含连字符: 978-626-024-823-9
    if isbn:
        search_isbns.append(isbn)  # 无连字符: 9786260248239
    # 去重
    search_isbns = list(dict.fromkeys(search_isbns))

    for ext in (".jpg", ".png", ".jpeg", ".webp"):
        for search_isbn in search_isbns:
            candidates.append(os.path.join(cover_path, f"book_{search_isbn}{ext}"))
            candidates.append(os.path.join(cover_path, f"{search_isbn}{ext}"))

    # 查找第一个存在的文件
    for src in candidates:
        if os.path.exists(src) and os.path.isfile(src):
            try:
                import hashlib
                ext = os.path.splitext(src)[1] or ".jpg"
                hash_name = hashlib.sha256(f"nedb_{isbn}".encode()).hexdigest()[:32]
                # 复制到 uploads/nedb/ 目录（已挂载为静态文件 /uploads）
                uploads_dir = os.path.join(
                    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "uploads", "nedb",
                )
                os.makedirs(uploads_dir, exist_ok=True)
                dst = os.path.join(uploads_dir, f"{hash_name}{ext}")
                shutil.copy2(src, dst)
                # 返回前端可直接访问的 URL
                relative_url = f"/uploads/nedb/{hash_name}{ext}"
                logger.info(f"封面已复制: {os.path.basename(src)} → {relative_url}")
                return relative_url
            except Exception as e:
                logger.warning(f"封面复制失败 [{src}]: {e}")

    if cover_src:
        logger.debug(f"封面未找到: {cover_src} (已尝试 {len(candidates)} 个候选路径)")
    return cover_src
