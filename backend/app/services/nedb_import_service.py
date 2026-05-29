# backend/app/services/nedb_import_service.py
"""
NeDB 数据导入服务

从 ManageBooksMac (旧版 Electron 应用) 的 NeDB 文件中读取完整图书元数据，
映射字段后导入 BookMetadata 表。

NeDB 文件格式: 换行分隔的 JSON（NDJSON），每行一个 JSON 文档，零外部依赖。

与标准模板导入（import_api.py）完全分离，互不耦合：
- 标准导入：提取 ISBN → 逐条同步豆瓣 → 创建 BookMetadata
- NeDB 导入：读取完整元数据 → 字段映射 → 直接写入 BookMetadata（不走豆瓣同步）

流程:
    上传 .db → 预览(含重复ISBN详情) → 用户逐条决定合并/保留/跳过 → 执行导入
"""

import os
import re
import shutil
import hashlib
from typing import Optional, Dict, Any, List
from loguru import logger

from app.utils.helpers import clean_isbn


# ==================== 字段映射总表 ====================
#
# NeDB 字段              → BookMetadata 列      转换规则
# ───────────────────────────────────────────────────────────
# bookName               → title               直接（subBookName 拼接为副标题）
# subBookName            → (拼入 title)        "title: subBookName"
# bookRawName            → original_title      直接
# isbn                   → isbn                clean_isbn() + trim + 14→13
# author                 → author              直接
# authorCountry          → (拼入 author)       "[国别] author"（非中国时）
# translator             → translator          直接
# publisher              → publisher           直接
# bookProducer           → nedb_extra          忽略（存 extra）
# bookPages              → pages               int()
# paperType              → nedb_extra          忽略
# binding                → binding             直接
# bookSeries             → series              直接
# publishDate            → publish_date        标准化 YYYY-MM-DD
# purchaseDate           → purchase_date       标准化 YYYY-MM-DD
# price                  → price               去"元"等单位
# purchasePrice          → purchase_price      去"元"等单位
# purchaseChannel        → purchase_channel    直接
# readCondition          → reading_status      值映射
# scoreDouban            → rating              str(round(float,1))
# scoreDouban            → douban_rating       float()
# scoreSelf              → personal_rating     int()
# bookTags               → tags                逗号拼接
# authorIntro            → author_intro        直接
# bookSummary            → summary             截断 2000 字
# publishVersion         → nedb_extra          忽略
# volumeNumbers          → nedb_extra          忽略
# storageAddress         → nedb_extra          忽略
# CLC / CLCRaw           → nedb_extra          忽略
# sortIndex / readTime   → nedb_extra          忽略
# isPurchased            → nedb_extra          忽略（存标记）
# doubanUrl              → douban_url          直接
# doubanID               → douban_id           直接
# coverSrc               → cover_url           封面匹配+复制


# ==================== NeDB 文件解析 ====================


def parse_nedb_file(file_content: Any) -> List[Dict[str, Any]]:
    """解析 NeDB 数据库文件，返回全部文档列表"""
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
    将 NeDB 文档完整映射为 BookMetadata 创建参数字典。

    覆盖 30+ 个字段，按上表规则转换。
    """

    # ── 工具函数 ──
    def _str(val, default=""):
        if val is None:
            return default
        return str(val).strip()

    def _to_int(val):
        if val is None:
            return None
        if isinstance(val, (int, float)):
            return int(val)
        try:
            return int(str(val).strip())
        except (ValueError, TypeError):
            return None

    def _to_float(val):
        if val is None:
            return None
        try:
            return float(val)
        except (ValueError, TypeError):
            return None

    # ── 书名 ──
    title = _str(doc.get("bookName") or doc.get("title"))
    sub = _str(doc.get("subBookName") or doc.get("subTitle"))
    if sub and sub not in title:
        title = f"{title}: {sub}"

    # ── 作者 ──
    author = _str(doc.get("author"))
    country = _str(doc.get("authorCountry"))
    if country and country != "中国" and not author.startswith("["):
        author = f"[{country}] {author}"

    # ── ISBN ──
    isbn = clean_isbn(_str(doc.get("isbn")))
    if not isbn:
        isbn = _str(doc.get("isbn"))
    # 14 位 ISBN → 截取前 13 位
    if len(isbn) == 14 and isbn[:3] in ("978", "979"):
        isbn = isbn[:13]
        logger.debug(f"ISBN 14→13: {isbn}")
    raw_isbn = _str(doc.get("isbn"))

    # ── 日期标准化 ──
    publish_date = _normalize_date(_str(doc.get("publishDate") or doc.get("publish_date")))
    purchase_date = _normalize_date(_str(doc.get("purchaseDate")))

    # ── 价格（去单位） ──
    price = _clean_price(_str(doc.get("price")))
    purchase_price = _clean_price(_str(doc.get("purchasePrice")))

    # ── 评分 ──
    rating = _str(doc.get("scoreDouban") or doc.get("rating"))
    if rating:
        try:
            rating = str(round(float(rating), 1))
        except (ValueError, TypeError):
            pass
    douban_rating = _to_float(doc.get("scoreDouban"))
    personal_rating = _to_int(doc.get("scoreSelf"))

    # ── 阅读状态映射 ──
    reading_status = _map_reading_status(_str(doc.get("readCondition")))

    # ── 标签 ──
    tags_val = doc.get("bookTags")
    if isinstance(tags_val, list):
        tags = ", ".join(str(t) for t in tags_val if t)
    else:
        tags = _str(tags_val) if tags_val else ""

    # ── 简介截断 ──
    summary = _str(doc.get("bookSummary") or doc.get("summary"))
    if len(summary) > 2000:
        summary = summary[:2000]

    # ── NeDB 额外数据（未映射到独立列的字段） ──
    extra_fields = {}
    for key in ("bookProducer", "paperType", "publishVersion", "volumeNumbers",
                "storageAddress", "CLC", "CLCRaw", "sortIndex", "readTime"):
        val = doc.get(key)
        if val is not None and val != "":
            extra_fields[key] = val
    is_purchased = doc.get("isPurchased")
    if is_purchased is not None:
        extra_fields["isPurchased"] = bool(is_purchased) if is_purchased in (0, 1, True, False) else is_purchased

    return {
        "isbn": isbn,
        "raw_isbn": raw_isbn,
        "title": title,
        "author": author,
        "translator": _str(doc.get("translator")),
        "publisher": _str(doc.get("publisher")),
        "publish_date": publish_date,
        "pages": _to_int(doc.get("bookPages") or doc.get("pages")),
        "price": price,
        "binding": _str(doc.get("binding")),
        "original_title": _str(doc.get("bookRawName") or doc.get("original_title")),
        "series": _str(doc.get("bookSeries") or doc.get("series")),
        "rating": rating,
        "summary": summary,
        "douban_url": _str(doc.get("doubanUrl") or doc.get("douban_url")),
        "douban_id": _str(doc.get("doubanID") or doc.get("douban_id")),
        "douban_rating": douban_rating,
        "personal_rating": personal_rating,
        "purchase_date": purchase_date,
        "purchase_price": purchase_price,
        "purchase_channel": _str(doc.get("purchaseChannel")),
        "reading_status": reading_status,
        "tags": tags,
        "author_intro": _str(doc.get("authorIntro")),
        "cover_url": _str(doc.get("coverSrc") or doc.get("cover_url")) or None,
        "nedb_extra": extra_fields if extra_fields else None,
        "source": "nedb_import",
    }


def _normalize_date(date_str: str) -> str:
    """日期标准化: 2021-1 → 2021-01, 2021/1 → 2021-01, 2021.1 → 2021-01"""
    if not date_str:
        return ""
    date_str = date_str.strip()
    # YYYY-MM-DD (already good)
    m = re.match(r"^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$", date_str)
    if m:
        y, mo = m.group(1), int(m.group(2))
        d = m.group(3)
        if d:
            return f"{y}-{mo:02d}-{int(d):02d}"
        return f"{y}-{mo:02d}"
    # YYYY/MM/DD
    m = re.match(r"^(\d{4})[/.](\d{1,2})(?:[/.](\d{1,2}))?$", date_str)
    if m:
        y, mo = m.group(1), int(m.group(2))
        d = m.group(3)
        if d:
            return f"{y}-{mo:02d}-{int(d):02d}"
        return f"{y}-{mo:02d}"
    # YYYY only
    if re.match(r"^\d{4}$", date_str):
        return date_str
    return date_str


def _clean_price(price_str: str) -> str:
    """去除价格中的货币单位"""
    if not price_str:
        return ""
    return price_str.replace("元", "").replace("¥", "").replace("￥", "").strip()


def _map_reading_status(condition: str) -> str:
    """readCondition 值映射 → reading_status"""
    if not condition:
        return ""
    c = condition.strip().lower()
    mapping = {
        "unread": "unread", "未读": "unread", "0": "unread",
        "reading": "reading", "在读": "reading", "1": "reading",
        "finished": "finished", "已读": "finished", "读完": "finished", "2": "finished",
    }
    return mapping.get(c, c)


# ==================== 封面匹配与复制 ====================


def _find_and_copy_cover(
    cover_src: str,
    cover_path: str,
    isbn: str,
    raw_isbn: str = "",
) -> str:
    """
    从用户指定的封面目录匹配封面文件，复制到 cache/images/。

    匹配策略（按优先级）:
    1. cover_src 精确路径（绝对路径或相对路径）
    2. cover_src 文件名在 cover_path 下查找
    3. ISBN 模式匹配:
       - book_{raw_isbn}.{jpg|png|jpeg|webp}
       - book_{isbn}.{jpg|png|jpeg|webp}
       - {raw_isbn}.{jpg|png|jpeg|webp}
       - {isbn}.{jpg|png|jpeg|webp}

    返回: cache/images/{hash}.jpg 相对路径，供前端通过 /api/images/cache/ 访问
    """
    if not cover_path or not os.path.isdir(cover_path):
        if cover_src:
            return _normalize_cover_url(cover_src)
        return ""

    # HTTP URL 直接返回
    if cover_src and (cover_src.startswith("http://") or cover_src.startswith("https://")):
        return cover_src

    candidates = []

    # 1. cover_src 精确匹配
    if cover_src:
        candidates.append(cover_src)
        # 如果是文件名，在 cover_path 下查找
        if not os.path.isabs(cover_src):
            candidates.append(os.path.join(cover_path, cover_src))
        # 提取文件名后在 cover_path 下查找
        basename = os.path.basename(cover_src)
        if basename:
            candidates.append(os.path.join(cover_path, basename))

    # 2. ISBN 文件名模式
    search_isbns = list(dict.fromkeys(
        [isbn for isbn in (raw_isbn, isbn) if isbn]  # 去重保序
    ))
    for ext in (".jpg", ".png", ".jpeg", ".webp"):
        for sid in search_isbns:
            candidates.append(os.path.join(cover_path, f"book_{sid}{ext}"))
            candidates.append(os.path.join(cover_path, f"{sid}{ext}"))

    # 查找第一个存在的文件
    for src in candidates:
        src = os.path.normpath(src)
        if os.path.isfile(src):
            try:
                ext = os.path.splitext(src)[1] or ".jpg"
                hash_name = hashlib.sha256(f"nedb_{isbn}".encode()).hexdigest()[:32]

                # 复制到 cache/images/
                cache_dir = _get_cache_images_dir()
                dst = os.path.join(cache_dir, f"{hash_name}{ext}")
                shutil.copy2(src, dst)

                relative_url = f"cache/images/{hash_name}{ext}"
                logger.info(f"封面已匹配: {os.path.basename(src)} → {relative_url}")
                return relative_url
            except Exception as e:
                logger.warning(f"封面复制失败 [{src}]: {e}")

    if cover_src:
        logger.debug(f"封面未找到: {cover_src} (已尝试 {len(candidates)} 个候选)")
    return _normalize_cover_url(cover_src or "")


def _get_cache_images_dir() -> str:
    """获取 backend/cache/images/ 绝对路径"""
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    cache_dir = os.path.join(backend_dir, "cache", "images")
    os.makedirs(cache_dir, exist_ok=True)
    return cache_dir


def _normalize_cover_url(url: str) -> str:
    """
    规范化封面路径：绝对路径 → 文件名，HTTP/相对路径 → 保持原样。
    不对不存在的文件做任何假设。
    """
    if not url:
        return url
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("/uploads/") or url.startswith("/api/") or url.startswith("cache/"):
        return url
    # Windows 绝对路径 → 仅提取文件名
    if re.match(r"^[A-Za-z]:[/\\]", url):
        basename = os.path.basename(url)
        if basename and re.search(r"\.(jpg|png|jpeg|webp)$", basename, re.IGNORECASE):
            return basename
        return ""
    return url


# ==================== 预览 ====================


def preview_nedb_import(
    docs: List[Dict[str, Any]],
    db_session,
) -> Dict[str, Any]:
    """
    预览 NeDB 导入：统计数量、返回重复 ISBN 详情供用户决策。

    Returns:
        {
            total, new_count, existing_count, invalid_count,
            internal_dup_count,
            samples: [{title, author, isbn, publisher, status}],
            duplicate_items: [{isbn, nedb_title, nedb_author,
                               existing_book_id, existing_title}]
        }
    """
    from app.models.models import BookMetadata

    mapped = []
    existing_isbns: Dict[str, Dict] = {}
    invalid = []
    seen_isbns: Dict[str, int] = {}

    for doc in docs:
        book_data = map_nedb_to_book(doc)
        isbn = book_data["isbn"]
        if not isbn or len(isbn) < 10:
            invalid.append({"title": book_data["title"][:50], "reason": "ISBN 无效"})
            continue
        seen_isbns[isbn] = seen_isbns.get(isbn, 0) + 1
        mapped.append(book_data)

    # 查询数据库中已存在的 ISBN
    unique_isbns = list({b["isbn"] for b in mapped})
    if unique_isbns:
        rows = (
            db_session.query(BookMetadata.isbn, BookMetadata.book_id, BookMetadata.title)
            .filter(BookMetadata.isbn.in_(unique_isbns))
            .all()
        )
        existing_isbns = {row[0]: {"book_id": row[1], "title": row[2]} for row in rows}

    # NeDB 文件内部重复
    internal_dup_isbns = {k: v for k, v in seen_isbns.items() if v > 1}
    internal_dup_count = sum(v - 1 for v in internal_dup_isbns.values())

    # 统计
    new_unique = sum(1 for isbn in unique_isbns if isbn not in existing_isbns)
    existing_unique = len(existing_isbns)

    # 重复 ISBN 详情
    duplicate_items = []
    seen_dup = set()
    for b in mapped:
        isbn = b["isbn"]
        if isbn in existing_isbns and isbn not in seen_dup:
            seen_dup.add(isbn)
            duplicate_items.append({
                "isbn": isbn,
                "nedb_title": b["title"][:80],
                "nedb_author": b["author"][:40],
                "existing_book_id": existing_isbns[isbn]["book_id"],
                "existing_title": (existing_isbns[isbn]["title"] or "(无书名)")[:80],
            })

    # 样本（按唯一 ISBN 取前 10）
    samples = []
    seen_sample = set()
    for b in mapped:
        if b["isbn"] in seen_sample:
            continue
        seen_sample.add(b["isbn"])
        samples.append({
            "title": b["title"][:60],
            "author": b["author"][:30],
            "isbn": b["isbn"],
            "publisher": b["publisher"][:30],
            "cover_url": b.get("cover_url") or "",
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
    执行 NeDB 数据导入。

    Args:
        docs: NeDB 文档列表
        db_session: SQLAlchemy Session
        cover_path: 用户指定的封面目录（如 D:/ManageBooks/covers）
        shelf_id: 可选，导入后添加到指定书架
        duplicate_resolution: ISBN → action 映射:
            {"978xxx": "merge", "978yyy": "keep", "978zzz": "skip"}
            merge = 合并更新，keep = 保留已有，skip = 跳过不导入
        progress_callback: callback(current, total)

    Returns:
        {total, inserted, merged, kept, skipped, errors: [...]}
    """
    from app.models.models import BookMetadata, LogicalShelfBook, BookStatus

    total = len(docs)
    inserted = 0
    merged = 0
    kept = 0
    skipped = 0
    errors: List[Dict] = []
    results: List[Dict] = []   # 逐条结果，供前端表格展示
    resolution = duplicate_resolution or {}

    # 批量提交尺寸：每 BATCH_SIZE 条记录提交一次事务，避免单次提交丢失所有数据
    BATCH_SIZE = 50
    batch_count = 0  # 当前批次中新增+变更的计数

    # 记录导入开始前的图书总数，用于事后校验
    initial_count = db_session.query(BookMetadata).count()

    for i, doc in enumerate(docs):
        try:
            book_data = map_nedb_to_book(doc)
            isbn = book_data["isbn"]

            if not isbn or len(isbn) < 10:
                skipped += 1
                results.append({
                    "index": i + 1, "isbn": isbn or "无效",
                    "status": "skipped", "title": book_data.get("title", "?")[:40],
                    "message": "ISBN 无效或长度不足",
                })
                if progress_callback:
                    progress_callback(i + 1, total)
                continue

            # ISBN 去重
            existing = (
                db_session.query(BookMetadata)
                .filter(BookMetadata.isbn == isbn)
                .first()
            )

            if existing:
                action = resolution.get(isbn, "merge")
                if action == "merge":
                    _merge_book_fields(existing, book_data)
                    merged += 1
                    batch_count += 1
                    results.append({
                        "index": i + 1, "isbn": isbn,
                        "status": "merged", "title": existing.title[:60] if existing.title else book_data.get("title", "")[:60],
                        "message": "已存在，字段已合并更新",
                    })
                elif action == "skip":
                    skipped += 1
                    results.append({
                        "index": i + 1, "isbn": isbn,
                        "status": "skipped", "title": existing.title[:60] if existing.title else "?",
                        "message": "已存在，用户选择跳过",
                    })
                else:  # keep
                    kept += 1
                    results.append({
                        "index": i + 1, "isbn": isbn,
                        "status": "kept", "title": existing.title[:60] if existing.title else "?",
                        "message": "已存在，用户选择保留原记录",
                    })
                if progress_callback:
                    progress_callback(i + 1, total)
                continue

            # 封面匹配与复制
            cover_url = book_data.get("cover_url", "")
            raw_isbn = book_data.get("raw_isbn", isbn)
            if cover_url and cover_path and os.path.isdir(cover_path):
                cover_url = _find_and_copy_cover(cover_url, cover_path, isbn, raw_isbn)
            else:
                cover_url = _normalize_cover_url(cover_url or "")
            book_data["cover_url"] = cover_url

            # 创建记录
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
                douban_id=book_data["douban_id"],
                douban_rating=book_data["douban_rating"],
                personal_rating=book_data["personal_rating"],
                purchase_date=book_data["purchase_date"],
                purchase_price=book_data["purchase_price"],
                purchase_channel=book_data["purchase_channel"],
                reading_status=book_data["reading_status"],
                tags=book_data["tags"],
                author_intro=book_data["author_intro"],
                nedb_extra=book_data["nedb_extra"],
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
            batch_count += 1
            results.append({
                "index": i + 1, "isbn": isbn,
                "status": "success", "title": book_data.get("title", "")[:60],
                "message": "新录入",
            })

        except Exception as e:
            title = doc.get("bookName") or doc.get("title", "?")
            errors.append({"title": str(title)[:50], "error": str(e)[:200]})
            results.append({
                "index": i + 1, "isbn": book_data.get("isbn", "?") if 'book_data' in dir() else "?",
                "status": "failed", "title": str(title)[:40],
                "message": str(e)[:100],
            })
            logger.warning(f"NeDB 导入失败 [{title}]: {e}")
            # 单条失败时回滚当前事务，避免污染后续记录
            try:
                db_session.rollback()
            except Exception:
                pass

        if progress_callback:
            progress_callback(i + 1, total)

        # 批量提交：每 BATCH_SIZE 条记录提交一次事务，防止单次提交失败丢失全部数据
        if batch_count >= BATCH_SIZE:
            try:
                db_session.commit()
                logger.debug(f"NeDB 批量提交: {batch_count} 条变更已持久化 (进度 {i+1}/{total})")
            except Exception as commit_err:
                logger.error(f"NeDB 批量提交失败 (进度 {i+1}/{total}): {commit_err}")
                db_session.rollback()
                raise
            batch_count = 0

    # 提交剩余未提交的记录
    if batch_count > 0:
        try:
            db_session.commit()
            logger.debug(f"NeDB 最终提交: {batch_count} 条变更已持久化")
        except Exception as commit_err:
            logger.error(f"NeDB 最终提交失败: {commit_err}")
            db_session.rollback()
            raise

    # 提交后校验：对比导入前后的图书数量，检测静默丢失
    final_count = db_session.query(BookMetadata).count()
    expected_new = initial_count + inserted
    if final_count < expected_new:
        lost = expected_new - final_count
        logger.error(
            f"NeDB 导入数据丢失！预期新增 {inserted} 本，实际新增 {final_count - initial_count} 本，"
            f"丢失 {lost} 本 — 可能有唯一索引冲突或触发器回滚"
        )

    logger.info(
        f"NeDB 导入完成: {total} 条, "
        f"新增 {inserted}, 合并 {merged}, 保留 {kept}, 跳过 {skipped}, 错误 {len(errors)}"
    )

    return {
        "total": total,
        "inserted": inserted,
        "merged": merged,
        "kept": kept,
        "skipped": skipped,
        "errors": errors,
        "results": results,
    }


def _merge_book_fields(existing, book_data: Dict[str, Any]) -> None:
    """
    合并 NeDB 数据到已有记录。

    规则：新字段非空则覆盖旧值，空值保留旧值。
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
        "douban_id": "douban_id",
        "douban_rating": "douban_rating",
        "personal_rating": "personal_rating",
        "purchase_date": "purchase_date",
        "purchase_price": "purchase_price",
        "purchase_channel": "purchase_channel",
        "reading_status": "reading_status",
        "tags": "tags",
        "author_intro": "author_intro",
    }
    for src_key, dst_attr in field_map.items():
        new_val = book_data.get(src_key)
        if new_val is not None and str(new_val).strip() != "":
            existing_val = getattr(existing, dst_attr, None)
            if existing_val is None or str(existing_val).strip() == "":
                setattr(existing, dst_attr, new_val)

    # 封面: 新值非空且旧值为空时覆盖
    new_cover = book_data.get("cover_url")
    if new_cover and not existing.cover_url:
        existing.cover_url = new_cover

    # NeDB 额外字段：合并而非覆盖
    new_extra = book_data.get("nedb_extra")
    if new_extra:
        old_extra = existing.nedb_extra or {}
        if isinstance(old_extra, dict):
            old_extra.update(new_extra)
            existing.nedb_extra = old_extra
        else:
            existing.nedb_extra = new_extra
