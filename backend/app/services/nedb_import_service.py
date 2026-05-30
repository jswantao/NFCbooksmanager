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

批量提交说明：
    每 BATCH_SIZE 条记录提交一次事务。单条记录失败通过 savepoint 隔离，
    不影响同批次其他记录。最终结果中 inserted/merged 计数反映实际持久化数量。
"""

import json
import os
import re
import shutil
import hashlib
from typing import Optional, Dict, Any, List, Callable

from loguru import logger
from sqlalchemy.exc import SQLAlchemyError

from app.utils.helpers import clean_isbn


# ==================== 常量 ====================

# 批量提交尺寸：每 BATCH_SIZE 条变更提交一次事务
_BATCH_SIZE = 50

# 封面文件允许的扩展名
_COVER_EXTENSIONS = (".jpg", ".png", ".jpeg", ".webp")

# duplicate_resolution 允许的操作值
_VALID_ACTIONS = {"merge", "merge_overwrite", "keep", "skip"}


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
    """
    解析 NeDB 数据库文件，返回全部文档列表。

    NeDB 格式为 NDJSON（换行分隔 JSON），每行一个 JSON 对象。
    非 JSON 行和非 dict 行静默跳过，不中断解析。

    Args:
        file_content: bytes 或 str，NeDB 文件内容。

    Returns:
        解析成功的 dict 文档列表。
    """
    if isinstance(file_content, bytes):
        text = file_content.decode("utf-8", errors="replace")
    else:
        text = file_content

    docs: List[Dict[str, Any]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            doc = json.loads(line)
            if isinstance(doc, dict):
                docs.append(doc)
        except json.JSONDecodeError:
            logger.debug(f"NeDB 跳过非 JSON 行: {line[:80]}...")

    return docs


# ==================== 字段映射 ====================


def map_nedb_to_book(doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    将 NeDB 文档完整映射为 BookMetadata 创建参数字典。

    覆盖 30+ 个字段，按字段映射总表规则转换。
    返回字典包含 raw_isbn（内部使用，不写入数据库列）。

    Args:
        doc: 单条 NeDB JSON 文档。

    Returns:
        BookMetadata 字段字典，含内部字段 raw_isbn。
    """

    # ── 工具函数 ──────────────────────────────────────────
    def _str(val: Any, default: str = "") -> str:
        if val is None:
            return default
        return str(val).strip()

    def _to_int(val: Any) -> Optional[int]:
        if val is None:
            return None
        if isinstance(val, (int, float)):
            return int(val)
        try:
            return int(str(val).strip())
        except (ValueError, TypeError):
            return None

    def _to_float(val: Any) -> Optional[float]:
        if val is None:
            return None
        try:
            return float(val)
        except (ValueError, TypeError):
            return None

    # ── 书名 ─────────────────────────────────────────────
    title = _str(doc.get("bookName") or doc.get("title"))
    sub = _str(doc.get("subBookName") or doc.get("subTitle"))
    if sub and sub not in title:
        title = f"{title}: {sub}"

    # ── 作者 ─────────────────────────────────────────────
    author = _str(doc.get("author"))
    country = _str(doc.get("authorCountry"))
    if country and country != "中国" and not author.startswith("["):
        author = f"[{country}] {author}"

    # ── ISBN ──────────────────────────────────────────────
    raw_isbn = _str(doc.get("isbn"))
    isbn = clean_isbn(raw_isbn)
    if not isbn:
        isbn = raw_isbn
    # 14 位 ISBN → 截取前 13 位（部分旧版应用附加了校验位）
    if len(isbn) == 14 and isbn[:3] in ("978", "979"):
        isbn = isbn[:13]
        logger.debug(f"ISBN 14→13: {isbn}")

    # ── 日期标准化 ────────────────────────────────────────
    publish_date = _normalize_date(_str(doc.get("publishDate") or doc.get("publish_date")))
    purchase_date = _normalize_date(_str(doc.get("purchaseDate")))

    # ── 价格（去单位） ────────────────────────────────────
    price = _clean_price(_str(doc.get("price")))
    purchase_price = _clean_price(_str(doc.get("purchasePrice")))

    # ── 评分 ──────────────────────────────────────────────
    rating_raw = _str(doc.get("scoreDouban") or doc.get("rating"))
    if rating_raw:
        try:
            rating: str = str(round(float(rating_raw), 1))
        except (ValueError, TypeError):
            rating = rating_raw
    else:
        rating = ""
    douban_rating = _to_float(doc.get("scoreDouban"))
    personal_rating = _to_int(doc.get("scoreSelf"))

    # ── 阅读状态映射 ──────────────────────────────────────
    reading_status = _map_reading_status(_str(doc.get("readCondition")))

    # ── 标签 ──────────────────────────────────────────────
    tags_val = doc.get("bookTags")
    if isinstance(tags_val, list):
        tags = ", ".join(str(t) for t in tags_val if t)
    else:
        tags = _str(tags_val) if tags_val else ""

    # ── 简介截断 ──────────────────────────────────────────
    summary = _str(doc.get("bookSummary") or doc.get("summary"))
    if len(summary) > 2000:
        summary = summary[:2000]

    # ── NeDB 额外数据（未映射到独立列的字段） ─────────────
    extra_fields: Dict[str, Any] = {}
    for key in (
        "bookProducer", "paperType", "publishVersion", "volumeNumbers",
        "storageAddress", "CLC", "CLCRaw", "sortIndex", "readTime",
    ):
        val = doc.get(key)
        if val is not None and val != "":
            extra_fields[key] = val

    is_purchased = doc.get("isPurchased")
    if is_purchased is not None:
        extra_fields["isPurchased"] = (
            bool(is_purchased)
            if is_purchased in (0, 1, True, False)
            else is_purchased
        )

    return {
        # 内部字段（不直接写入数据库列）
        "raw_isbn": raw_isbn,
        # 数据库字段
        "isbn": isbn,
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
    """
    日期字符串标准化为 YYYY-MM 或 YYYY-MM-DD 格式。

    支持格式：YYYY-MM-DD、YYYY/MM/DD、YYYY.MM.DD、YYYY-MM、YYYY。
    月份或日期超出合法范围时返回原始字符串，不强制写入非法值。

    Args:
        date_str: 原始日期字符串。

    Returns:
        标准化后的日期字符串，无法识别时返回原始值。
    """
    if not date_str:
        return ""
    date_str = date_str.strip()

    # YYYY-MM[-DD]
    m = re.match(r"^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$", date_str)
    if m:
        y, mo_raw, d_raw = m.group(1), int(m.group(2)), m.group(3)
        if not (1 <= mo_raw <= 12):
            return date_str
        if d_raw:
            d = int(d_raw)
            if not (1 <= d <= 31):
                return date_str
            return f"{y}-{mo_raw:02d}-{d:02d}"
        return f"{y}-{mo_raw:02d}"

    # YYYY[/.]MM[[/.]DD]
    m = re.match(r"^(\d{4})[/.](\d{1,2})(?:[/.](\d{1,2}))?$", date_str)
    if m:
        y, mo_raw, d_raw = m.group(1), int(m.group(2)), m.group(3)
        if not (1 <= mo_raw <= 12):
            return date_str
        if d_raw:
            d = int(d_raw)
            if not (1 <= d <= 31):
                return date_str
            return f"{y}-{mo_raw:02d}-{d:02d}"
        return f"{y}-{mo_raw:02d}"

    # YYYY only
    if re.match(r"^\d{4}$", date_str):
        return date_str

    return date_str


def _clean_price(price_str: str) -> str:
    """
    去除价格字符串中的货币单位符号。

    Args:
        price_str: 原始价格字符串，如 "45.00元"、"¥32.5"。

    Returns:
        仅含数字和小数点的价格字符串。
    """
    if not price_str:
        return ""
    return price_str.replace("元", "").replace("¥", "").replace("￥", "").strip()


def _map_reading_status(condition: str) -> str:
    """
    将 NeDB readCondition 值映射为统一的 reading_status 枚举值。

    支持中文、英文和数字形式的原始值。
    未知值原样返回，供上层决策。

    Args:
        condition: NeDB 中的 readCondition 字段值。

    Returns:
        "unread" / "reading" / "finished" / 原始值。
    """
    if not condition:
        return ""
    mapping = {
        "unread": "unread", "未读": "unread", "0": "unread",
        "reading": "reading", "在读": "reading", "1": "reading",
        "finished": "finished", "已读": "finished",
        "读完": "finished", "2": "finished",
    }
    return mapping.get(condition.strip(), condition.strip())


# ==================== 路径安全工具 ====================


def _safe_join(base: str, *paths: str) -> Optional[str]:
    """
    安全拼接路径，校验结果是否仍在 base 目录内。

    防止 `../../` 等路径穿越攻击。

    Args:
        base: 允许的根目录（绝对路径）。
        *paths: 待拼接的子路径片段。

    Returns:
        规范化后的绝对路径；若发生路径穿越则返回 None。
    """
    base = os.path.normpath(os.path.abspath(base))
    target = os.path.normpath(os.path.join(base, *paths))
    # 必须以 base + 分隔符开头，防止 base 本身被匹配
    if not target.startswith(base + os.sep) and target != base:
        logger.warning(f"路径穿越尝试被拒绝: base={base}, target={target}")
        return None
    return target


# ==================== 封面匹配与复制 ====================


def _find_and_copy_cover(
    cover_src: str,
    cover_path: str,
    isbn: str,
    raw_isbn: str = "",
) -> str:
    """
    从用户指定的封面目录匹配封面文件，复制到 cache/images/。

    安全说明：
    - 所有候选路径均通过 _safe_join 校验，防止路径穿越
    - HTTP/HTTPS URL 直接返回，不访问文件系统

    匹配策略（按优先级）:
    1. cover_src 文件名在 cover_path 下精确查找
    2. ISBN 模式匹配: book_{isbn}.ext / {isbn}.ext

    封面文件以内容哈希命名，避免同 ISBN 不同封面互相覆盖。

    Args:
        cover_src: NeDB 中记录的封面路径或文件名。
        cover_path: 用户指定的封面目录（绝对路径）。
        isbn: 清洗后的 13 位 ISBN。
        raw_isbn: 原始 ISBN 字符串（用于文件名匹配）。

    Returns:
        cache/images/{hash}.ext 相对路径；无匹配时返回规范化的原始值。
    """
    # HTTP URL 直接返回，不访问文件系统
    if cover_src and (
        cover_src.startswith("http://") or cover_src.startswith("https://")
    ):
        return cover_src

    if not cover_path or not os.path.isdir(cover_path):
        return _normalize_cover_url(cover_src or "")

    candidates: List[str] = []

    # 1. cover_src 文件名在 cover_path 下查找（经路径穿越校验）
    if cover_src:
        basename = os.path.basename(cover_src)
        if basename:
            safe = _safe_join(cover_path, basename)
            if safe:
                candidates.append(safe)

    # 2. ISBN 文件名模式匹配
    # 使用生成器去重保序，避免变量名遮蔽参数
    search_isbns = list(dict.fromkeys(
        sid for sid in (raw_isbn, isbn) if sid
    ))
    for ext in _COVER_EXTENSIONS:
        for sid in search_isbns:
            for pattern in (f"book_{sid}{ext}", f"{sid}{ext}"):
                safe = _safe_join(cover_path, pattern)
                if safe:
                    candidates.append(safe)

    # 查找第一个存在的文件
    for src in candidates:
        if not os.path.isfile(src):
            continue
        try:
            ext = os.path.splitext(src)[1].lower() or ".jpg"

            # 以文件内容哈希命名，同 ISBN 不同封面不互相覆盖
            with open(src, "rb") as f:
                content_hash = hashlib.sha256(f.read()).hexdigest()[:32]

            cache_dir = _get_cache_images_dir()
            dst = os.path.join(cache_dir, f"{content_hash}{ext}")

            # 内容相同时跳过复制
            if not os.path.exists(dst):
                shutil.copy2(src, dst)

            relative_url = f"cache/images/{content_hash}{ext}"
            logger.info(f"封面已匹配: {os.path.basename(src)} → {relative_url}")
            return relative_url

        except OSError as e:
            logger.warning(f"封面复制失败 [{src}]: {e}")

    if cover_src:
        logger.debug(
            f"封面未找到: {cover_src}（已尝试 {len(candidates)} 个候选路径）"
        )
    return _normalize_cover_url(cover_src or "")


def _get_cache_images_dir() -> str:
    """
    获取封面缓存目录的绝对路径，不存在时自动创建。

    优先从应用配置读取 CACHE_DIR，回退到相对于本文件的推断路径。

    Returns:
        cache/images/ 目录的绝对路径。
    """
    try:
        from app.core.config import get_settings
        cache_dir = os.path.join(get_settings().CACHE_DIR, "images")
    except Exception:
        # 回退：向上三级到 backend/，再拼接 cache/images/
        backend_dir = os.path.dirname(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        )
        cache_dir = os.path.join(backend_dir, "cache", "images")

    os.makedirs(cache_dir, exist_ok=True)
    return cache_dir


def _normalize_cover_url(url: str) -> str:
    """
    规范化封面路径。

    - HTTP/HTTPS URL → 原样返回
    - 已知相对路径前缀（/uploads/、/api/、cache/）→ 原样返回
    - Windows 绝对路径 → 仅保留文件名（若为图片格式）
    - 其他 → 原样返回

    Args:
        url: 原始封面路径或 URL。

    Returns:
        规范化后的路径字符串。
    """
    if not url:
        return url
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if (
        url.startswith("/uploads/")
        or url.startswith("/api/")
        or url.startswith("cache/")
    ):
        return url
    # Windows 绝对路径（如 D:\ManageBooks\covers\xxx.jpg）
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

    不写入数据库，仅做只读查询。

    Args:
        docs: parse_nedb_file 返回的文档列表。
        db_session: SQLAlchemy Session（只读）。

    Returns:
        {
            total,          原始文档总数
            new_count,      数据库中不存在的唯一 ISBN 数
            existing_count, 数据库中已存在的唯一 ISBN 数
            invalid_count,  ISBN 无效的文档数
            internal_dup_count,  NeDB 文件内部重复的条目数（不含首次出现）
            samples,        前 10 条预览（唯一 ISBN）
            duplicate_items 与数据库重复的 ISBN 详情列表
        }
    """
    from app.models.models import BookMetadata

    mapped: List[Dict[str, Any]] = []
    invalid: List[Dict[str, str]] = []
    seen_isbns: Dict[str, int] = {}

    for doc in docs:
        book_data = map_nedb_to_book(doc)
        isbn = book_data["isbn"]
        if not isbn or len(isbn) < 10:
            invalid.append({
                "title": (book_data.get("title") or "")[:50],
                "reason": "ISBN 无效或长度不足",
            })
            continue
        seen_isbns[isbn] = seen_isbns.get(isbn, 0) + 1
        mapped.append(book_data)

    # 查询数据库中已存在的 ISBN
    unique_isbns = list({b["isbn"] for b in mapped})
    existing_isbns: Dict[str, Dict[str, Any]] = {}
    if unique_isbns:
        rows = (
            db_session.query(BookMetadata.isbn, BookMetadata.book_id, BookMetadata.title)
            .filter(BookMetadata.isbn.in_(unique_isbns))
            .all()
        )
        existing_isbns = {
            row[0]: {"book_id": row[1], "title": row[2]} for row in rows
        }

    # NeDB 文件内部重复（每个 ISBN 出现次数减去首次）
    internal_dup_count = sum(v - 1 for v in seen_isbns.values() if v > 1)

    # 统计（以唯一 ISBN 为单位）
    new_unique = sum(1 for isbn in unique_isbns if isbn not in existing_isbns)
    existing_unique = len(existing_isbns)

    # 重复 ISBN 详情（每个 ISBN 只报告一次）
    duplicate_items: List[Dict[str, Any]] = []
    seen_dup: set = set()
    for b in mapped:
        isbn = b["isbn"]
        if isbn in existing_isbns and isbn not in seen_dup:
            seen_dup.add(isbn)
            duplicate_items.append({
                "isbn": isbn,
                "nedb_title": (b.get("title") or "")[:80],
                "nedb_author": (b.get("author") or "")[:40],
                "existing_book_id": existing_isbns[isbn]["book_id"],
                "existing_title": (existing_isbns[isbn]["title"] or "(无书名)")[:80],
            })

    # 样本（按唯一 ISBN 取前 10）
    samples: List[Dict[str, Any]] = []
    seen_sample: set = set()
    for b in mapped:
        isbn = b["isbn"]
        if isbn in seen_sample:
            continue
        seen_sample.add(isbn)
        samples.append({
            "title": (b.get("title") or "")[:60],
            "author": (b.get("author") or "")[:30],
            "isbn": isbn,
            "publisher": (b.get("publisher") or "")[:30],
            "cover_url": b.get("cover_url") or "",
            "status": "已存在" if isbn in existing_isbns else "新录入",
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
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> Dict[str, Any]:
    """
    执行 NeDB 数据导入。

    事务策略：
    - 每 _BATCH_SIZE 条变更提交一次事务
    - 单条记录失败通过 savepoint 隔离，不影响同批次其他记录
    - 批次提交失败时回滚该批次，已提交批次不受影响
    - inserted/merged 计数仅反映实际持久化数量

    Args:
        docs: parse_nedb_file 返回的文档列表。
        db_session: SQLAlchemy Session。
        cover_path: 用户指定的封面目录绝对路径（可选）。
        shelf_id: 导入后添加到指定书架的 ID（可选）。
        duplicate_resolution: ISBN → action 映射，支持:
            "merge"            : 新值非空时填补旧记录的空字段
            "merge_overwrite"  : 新值非空时强制覆盖旧记录字段
            "keep"             : 保留已有记录，不做任何修改
            "skip"             : 跳过此 ISBN，不导入
            缺省为 "merge"。
        progress_callback: 进度回调 callback(current, total)（可选）。

    Returns:
        {
            total, inserted, merged, kept, skipped,
            errors: [{title, error}],
            results: [{index, isbn, status, title, message}]
        }
    """
    from app.models.models import BookMetadata, LogicalShelfBook, BookStatus

    total = len(docs)
    inserted = 0
    merged = 0
    kept = 0
    skipped = 0
    errors: List[Dict[str, str]] = []
    results: List[Dict[str, Any]] = []
    resolution = duplicate_resolution or {}

    # 记录导入前图书总数，用于最终一致性校验
    initial_count = db_session.query(BookMetadata).count()
    batch_count = 0

    for i, doc in enumerate(docs):
        # 每次迭代显式初始化，避免异常分支访问上一次迭代的数据
        book_data: Dict[str, Any] = {}
        isbn = "?"

        try:
            book_data = map_nedb_to_book(doc)
            isbn = book_data.get("isbn", "") or ""

            # ── ISBN 有效性校验 ───────────────────────────
            if not isbn or len(isbn) < 10:
                skipped += 1
                results.append({
                    "index": i + 1,
                    "isbn": isbn or "无效",
                    "status": "skipped",
                    "title": (book_data.get("title") or "")[:40],
                    "message": "ISBN 无效或长度不足",
                })
                _call_progress(progress_callback, i + 1, total)
                continue

            # ── 重复 ISBN 处理 ────────────────────────────
            existing = (
                db_session.query(BookMetadata)
                .filter(BookMetadata.isbn == isbn)
                .first()
            )

            if existing:
                action = resolution.get(isbn, "merge")
                if action not in _VALID_ACTIONS:
                    logger.warning(f"未知 action '{action}'，回退为 merge: ISBN={isbn}")
                    action = "merge"

                if action == "skip":
                    skipped += 1
                    results.append({
                        "index": i + 1, "isbn": isbn,
                        "status": "skipped",
                        "title": (existing.title or "")[:60],
                        "message": "已存在，用户选择跳过",
                    })

                elif action == "keep":
                    kept += 1
                    results.append({
                        "index": i + 1, "isbn": isbn,
                        "status": "kept",
                        "title": (existing.title or "")[:60],
                        "message": "已存在，用户选择保留原记录",
                    })

                else:
                    # merge 或 merge_overwrite：使用 savepoint 隔离单条失败
                    sp = db_session.begin_nested()
                    try:
                        overwrite = (action == "merge_overwrite")
                        _merge_book_fields(existing, book_data, overwrite=overwrite)
                        sp.commit()
                        merged += 1
                        batch_count += 1
                        mode_label = "强制覆盖合并" if overwrite else "空字段补全合并"
                        results.append({
                            "index": i + 1, "isbn": isbn,
                            "status": "merged",
                            "title": (existing.title or book_data.get("title") or "")[:60],
                            "message": f"已存在，{mode_label}",
                        })
                    except SQLAlchemyError as merge_err:
                        sp.rollback()
                        raise merge_err

                _call_progress(progress_callback, i + 1, total)
                _maybe_commit_batch(db_session, batch_count, i + 1, total)
                if batch_count >= _BATCH_SIZE:
                    batch_count = 0
                continue

            # ── 封面匹配与复制 ────────────────────────────
            cover_url = book_data.get("cover_url") or ""
            raw_isbn = book_data.get("raw_isbn", isbn)
            if cover_path and os.path.isdir(cover_path):
                cover_url = _find_and_copy_cover(cover_url, cover_path, isbn, raw_isbn)
            else:
                cover_url = _normalize_cover_url(cover_url)
            book_data["cover_url"] = cover_url

            # ── 创建记录（savepoint 隔离） ─────────────────
            sp = db_session.begin_nested()
            try:
                book = BookMetadata(
                    isbn=isbn,
                    title=book_data.get("title") or "未知书名",
                    author=book_data.get("author"),
                    translator=book_data.get("translator"),
                    publisher=book_data.get("publisher"),
                    publish_date=book_data.get("publish_date"),
                    pages=book_data.get("pages"),
                    price=book_data.get("price"),
                    binding=book_data.get("binding"),
                    original_title=book_data.get("original_title"),
                    series=book_data.get("series"),
                    rating=book_data.get("rating"),
                    summary=book_data.get("summary"),
                    cover_url=book_data.get("cover_url"),
                    douban_url=book_data.get("douban_url"),
                    douban_id=book_data.get("douban_id"),
                    douban_rating=book_data.get("douban_rating"),
                    personal_rating=book_data.get("personal_rating"),
                    purchase_date=book_data.get("purchase_date"),
                    purchase_price=book_data.get("purchase_price"),
                    purchase_channel=book_data.get("purchase_channel"),
                    reading_status=book_data.get("reading_status"),
                    tags=book_data.get("tags"),
                    author_intro=book_data.get("author_intro"),
                    nedb_extra=book_data.get("nedb_extra"),
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

                sp.commit()
                inserted += 1
                batch_count += 1
                results.append({
                    "index": i + 1, "isbn": isbn,
                    "status": "success",
                    "title": (book_data.get("title") or "")[:60],
                    "message": "新录入",
                })

            except SQLAlchemyError as insert_err:
                sp.rollback()
                raise insert_err

        except Exception as e:
            title_hint = (
                book_data.get("title")
                or doc.get("bookName")
                or doc.get("title")
                or "?"
            )
            errors.append({
                "title": str(title_hint)[:50],
                "error": str(e)[:200],
            })
            results.append({
                "index": i + 1,
                "isbn": isbn,
                "status": "failed",
                "title": str(title_hint)[:40],
                "message": str(e)[:100],
            })
            logger.warning(f"NeDB 导入失败 [{title_hint}] ISBN={isbn}: {e}")

        _call_progress(progress_callback, i + 1, total)

        # 批量提交
        if batch_count >= _BATCH_SIZE:
            committed = _maybe_commit_batch(db_session, batch_count, i + 1, total)
            if committed:
                batch_count = 0

    # 提交剩余记录
    if batch_count > 0:
        try:
            db_session.commit()
            logger.debug(f"NeDB 最终提交: {batch_count} 条变更已持久化")
        except SQLAlchemyError as commit_err:
            logger.error(f"NeDB 最终提交失败: {commit_err}")
            db_session.rollback()
            raise

    # 一致性校验：对比导入前后图书数量
    final_count = db_session.query(BookMetadata).count()
    actual_new = final_count - initial_count
    if actual_new < inserted:
        lost = inserted - actual_new
        logger.error(
            f"NeDB 导入一致性异常：预期新增 {inserted} 本，"
            f"实际新增 {actual_new} 本，丢失 {lost} 本"
            f"——可能存在唯一索引冲突或触发器回滚"
        )

    logger.info(
        f"NeDB 导入完成: 共 {total} 条 | "
        f"新增 {inserted} | 合并 {merged} | 保留 {kept} | "
        f"跳过 {skipped} | 错误 {len(errors)}"
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


def _call_progress(
    callback: Optional[Callable[[int, int], None]],
    current: int,
    total: int,
) -> None:
    """
    安全调用进度回调，异常时仅记录警告，不中断主流程。

    Args:
        callback: 进度回调函数，或 None。
        current: 当前处理条数。
        total: 总条数。
    """
    if callback is None:
        return
    try:
        callback(current, total)
    except Exception as e:
        logger.warning(f"进度回调异常（已忽略）: {e}")


def _maybe_commit_batch(
    db_session,
    batch_count: int,
    current: int,
    total: int,
) -> bool:
    """
    当 batch_count 达到阈值时提交当前事务批次。

    提交失败时回滚该批次并重新抛出异常，已提交的历史批次不受影响。

    Args:
        db_session: SQLAlchemy Session。
        batch_count: 当前批次中已变更的条数。
        current: 当前处理进度（用于日志）。
        total: 总条数（用于日志）。

    Returns:
        True 表示已提交，False 表示未达到阈值。

    Raises:
        SQLAlchemyError: 提交失败时重新抛出。
    """
    if batch_count < _BATCH_SIZE:
        return False
    try:
        db_session.commit()
        logger.debug(
            f"NeDB 批量提交: {batch_count} 条变更已持久化 (进度 {current}/{total})"
        )
        return True
    except SQLAlchemyError as e:
        logger.error(f"NeDB 批量提交失败 (进度 {current}/{total}): {e}")
        db_session.rollback()
        raise


def _merge_book_fields(
    existing,
    book_data: Dict[str, Any],
    overwrite: bool = False,
) -> None:
    """
    将 NeDB 数据合并到已有 BookMetadata 记录。

    合并策略：
    - overwrite=False（默认）：新值非空时，仅填补旧记录的空字段
    - overwrite=True          ：新值非空时，强制覆盖旧记录字段

    封面：新值非空且（overwrite=True 或旧值为空）时覆盖。
    nedb_extra：字典级合并（新键覆盖同名旧键），不整体替换。

    Args:
        existing: BookMetadata ORM 对象。
        book_data: map_nedb_to_book 返回的字段字典。
        overwrite: True 表示强制覆盖非空旧值。
    """
    fields = [
        "title", "author", "translator", "publisher",
        "publish_date", "pages", "price", "binding",
        "original_title", "series", "rating", "summary",
        "douban_url", "douban_id", "douban_rating", "personal_rating",
        "purchase_date", "purchase_price", "purchase_channel",
        "reading_status", "tags", "author_intro",
    ]

    for field in fields:
        new_val = book_data.get(field)
        if new_val is None or str(new_val).strip() == "":
            continue  # 新值为空，无论何种策略都不写入
        existing_val = getattr(existing, field, None)
        if overwrite or existing_val is None or str(existing_val).strip() == "":
            setattr(existing, field, new_val)

    # 封面
    new_cover = book_data.get("cover_url")
    if new_cover:
        if overwrite or not existing.cover_url:
            existing.cover_url = new_cover

    # nedb_extra：字典合并
    new_extra = book_data.get("nedb_extra")
    if new_extra and isinstance(new_extra, dict):
        old_extra = existing.nedb_extra
        if isinstance(old_extra, dict):
            old_extra.update(new_extra)
            existing.nedb_extra = old_extra
        else:
            existing.nedb_extra = new_extra