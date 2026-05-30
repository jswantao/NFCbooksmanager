# backend/app/services/douban_parser.py
"""
豆瓣图书详情页 HTML 解析器

提供纯函数式的 HTML 解析能力，将豆瓣页面 HTML 转换为结构化字典。
与 DoubanService 解耦，便于单独测试和维护。

返回字段规范（parse_book 和 parse_search 均遵循）：
    isbn, douban_id, title, author, translator, publisher,
    publish_date, cover_url, summary, rating, pages, price,
    binding, original_title, series, douban_url, source

缺失字段统一填充空字符串，不省略键名，保证调用方无需差异处理。
"""

import re
from typing import Optional, Dict, Any, List

from bs4 import BeautifulSoup


# ==================== 常量 ====================

# 简介最大长度（与其他模块保持一致）
_SUMMARY_MAX_LENGTH = 2000

# info 区块中视为"无值"的占位字符串
_EMPTY_VALUES = {"-", "无", "暂无", "N/A", ""}

# 简介段落中需要跳过的元数据前缀（括号开头的作者/译者注）
_SUMMARY_SKIP_PREFIXES = ("（作者）", "（译者）", "（编者）", "© ", "(作者)", "(译者)")

# 统一的空返回结构，调用方可直接使用而无需检查键是否存在
_EMPTY_BOOK: Dict[str, Any] = {
    "isbn": "",
    "douban_id": "",
    "title": "",
    "author": "",
    "translator": "",
    "publisher": "",
    "publish_date": "",
    "cover_url": "",
    "summary": "",
    "rating": "",
    "pages": "",
    "price": "",
    "binding": "",
    "original_title": "",
    "series": "",
    "douban_url": "",
    "source": "douban",
}


def _make_empty_book(**overrides) -> Dict[str, Any]:
    """
    创建符合统一字段规范的空图书字典。

    所有字段均有默认空值，调用方无需检查键是否存在。

    Args:
        **overrides: 需要覆盖默认空值的字段。

    Returns:
        完整的图书字典。
    """
    result = dict(_EMPTY_BOOK)
    result.update(overrides)
    return result


# ==================== 详情页解析 ====================

def parse_book(html: str, isbn: str, url: str = "") -> Dict[str, Any]:
    """
    解析豆瓣图书详情页 HTML，提取图书元数据。

    返回符合统一字段规范的字典，所有字段均有值（缺失时为空字符串）。

    Args:
        html: 豆瓣图书详情页完整 HTML 字符串。
        isbn: 本次查询使用的 ISBN（详情页本身不含 ISBN，由调用方传入）。
        url: 详情页 URL，用于提取 douban_id 并存入返回字典。

    Returns:
        图书元数据字典，字段见模块文档。
    """
    soup = BeautifulSoup(html, "html.parser")

    data = _make_empty_book(
        isbn=isbn,
        douban_id=_extract_douban_id(url),
        title=_extract_title(soup),
        cover_url=_extract_cover(soup),
        summary=_extract_summary(soup),
        rating=_extract_rating(soup),
        douban_url=url,
    )

    info_block = soup.find("div", id="info")
    if info_block:
        _parse_info_block(info_block, data)

    return data


def _parse_info_block(info_block: Any, data: Dict[str, Any]) -> None:
    """
    解析豆瓣详情页 #info 区块，提取结构化键值对字段。

    多作者/多译者格式（以 / 分隔的多行）会被合并为单字符串。
    空值占位符（"-"、"无"等）不写入结果。

    Args:
        info_block: BeautifulSoup 找到的 #info div 元素。
        data: 就地更新的图书字典。
    """
    info_text = info_block.get_text("\n")

    # 单行字段：直接正则提取
    single_line_patterns: Dict[str, str] = {
        "publisher":      r"出版社\s*[：:]\s*(.+?)(?:\n|$)",
        "publish_date":   r"出版年\s*[：:]\s*(.+?)(?:\n|$)",
        "pages":          r"页数\s*[：:]\s*(.+?)(?:\n|$)",
        "price":          r"定价\s*[：:]\s*(.+?)(?:\n|$)",
        "binding":        r"装帧\s*[：:]\s*(.+?)(?:\n|$)",
        "original_title": r"原作名\s*[：:]\s*(.+?)(?:\n|$)",
        "series":         r"丛书\s*[：:]\s*(.+?)(?:\n|$)",
    }

    for field, pattern in single_line_patterns.items():
        m = re.search(pattern, info_text)
        if m:
            value = m.group(1).strip()
            if value and value not in _EMPTY_VALUES:
                data[field] = value

    # 多行字段：作者和译者可能跨多行，以 / 分隔
    author = _extract_multiline_field(info_text, "作者")
    if author:
        data["author"] = author

    translator = _extract_multiline_field(info_text, "译者")
    if translator:
        data["translator"] = translator


def _extract_multiline_field(info_text: str, label: str) -> str:
    """
    从 #info 文本中提取可能跨多行的字段（如作者、译者）。

    豆瓣多作者格式示例：
        作者: [日] 东野圭吾
            / [日] 宫部美雪

    提取策略：
    1. 定位标签行
    2. 连续收集以空白或 / 开头的后续行（续行）
    3. 按 " / " 合并所有部分

    Args:
        info_text: #info 区块的纯文本（按 \\n 分割）。
        label: 字段标签，如 "作者"、"译者"。

    Returns:
        合并后的字段值字符串；未找到时返回空字符串。
    """
    lines = info_text.splitlines()
    result_parts: List[str] = []
    collecting = False

    for line in lines:
        stripped = line.strip()

        if not collecting:
            # 寻找标签行
            m = re.match(rf"^{label}\s*[：:]\s*(.+)", stripped)
            if m:
                first = m.group(1).strip()
                if first and first not in _EMPTY_VALUES:
                    # 按 / 拆分首行（部分格式在同行包含多个作者）
                    for part in re.split(r"\s*/\s*", first):
                        part = part.strip()
                        if part and part not in _EMPTY_VALUES:
                            result_parts.append(part)
                collecting = True
        else:
            # 续行：以空白字符或 / 开头
            if re.match(r"^[\s/]", line) and stripped:
                clean = stripped.lstrip("/").strip()
                if clean and clean not in _EMPTY_VALUES:
                    result_parts.append(clean)
            else:
                # 遇到新字段标签或空行，停止收集
                break

    return " / ".join(result_parts)


def _extract_title(soup: BeautifulSoup) -> str:
    """
    从 BeautifulSoup 对象中提取书名。

    优先使用带 property="v:itemreviewed" 的 span（语义化标记），
    回退到 h1 纯文本提取。

    Args:
        soup: 完整页面的 BeautifulSoup 对象。

    Returns:
        书名字符串；未找到时返回空字符串。
    """
    h1 = soup.find("h1")
    if not h1:
        return ""

    title_span = h1.find("span", property="v:itemreviewed")
    if title_span:
        return title_span.get_text(strip=True)

    return re.sub(r"\s+", " ", h1.get_text(strip=True)).strip()


def _extract_cover(soup: BeautifulSoup) -> str:
    """
    从 BeautifulSoup 对象中提取封面图片 URL。

    将豆瓣 CDN 路径中的尺寸段（/s/、/m/）统一替换为大图（/l/）。
    仅替换路径段，不修改文件名，避免 404。

    豆瓣封面 URL 示例：
        小图: https://img9.doubanio.com/view/subject/s/public/s33934972.jpg
        大图: https://img9.doubanio.com/view/subject/l/public/s33934972.jpg

    Args:
        soup: 完整页面的 BeautifulSoup 对象。

    Returns:
        封面大图 URL；未找到时返回空字符串。
    """
    cover_tag = soup.find("a", class_="nbg")
    if not cover_tag:
        return ""

    img = cover_tag.find("img")
    if not img:
        return ""

    cover_url = img.get("src", "")
    if not cover_url:
        return ""

    # 仅替换路径段中的尺寸标识（s/m → l），文件名保持原样
    cover_url = re.sub(r"/view/subject/[sml]/", "/view/subject/l/", cover_url)
    return cover_url


def _extract_summary(soup: BeautifulSoup) -> str:
    """
    从 BeautifulSoup 对象中提取图书简介。

    查找策略（按优先级）：
    1. #link-report 内的 span.all.hidden（展开后的完整简介）
    2. #link-report 内的 div.intro
    3. 顶层 span.all.hidden
    4. 顶层 div.intro

    过滤规则：
    - 跳过以 _SUMMARY_SKIP_PREFIXES 开头的段落（作者/译者注等元数据）
    - 结果截断至 _SUMMARY_MAX_LENGTH 字符

    Args:
        soup: 完整页面的 BeautifulSoup 对象。

    Returns:
        简介字符串；未找到时返回空字符串。
    """
    # 按优先级依次尝试各选择器
    candidates = []

    link_report = soup.find("div", id="link-report")
    if link_report:
        candidates.append(link_report.find("span", class_="all hidden"))
        candidates.append(link_report.find("div", class_="intro"))

    candidates.append(soup.find("span", class_="all hidden"))
    candidates.append(soup.find("div", class_="intro"))

    for container in candidates:
        if not container:
            continue

        paragraphs = container.find_all("p")
        if paragraphs:
            texts = []
            for p in paragraphs:
                text = p.get_text(strip=True)
                if text and not any(
                    text.startswith(prefix) for prefix in _SUMMARY_SKIP_PREFIXES
                ):
                    texts.append(text)
            if texts:
                return "\n".join(texts)[:_SUMMARY_MAX_LENGTH]

        # 无 <p> 标签时直接取文本
        text = container.get_text(strip=True)
        if text:
            return text[:_SUMMARY_MAX_LENGTH]

    return ""


def _extract_rating(soup: BeautifulSoup) -> str:
    """
    从 BeautifulSoup 对象中提取豆瓣评分。

    校验提取到的值是否为合法评分（0 < rating ≤ 10），
    过滤评分人数不足时的空字符串。

    Args:
        soup: 完整页面的 BeautifulSoup 对象。

    Returns:
        评分字符串（如 "9.0"）；无效或未找到时返回空字符串。
    """
    rating_tag = soup.find("strong", class_="ll rating_num")
    if not rating_tag:
        return ""

    rating = rating_tag.get_text(strip=True)
    if not rating:
        return ""

    try:
        val = float(rating)
        if 0.0 < val <= 10.0:
            return rating
    except (ValueError, TypeError):
        pass

    return ""


def _extract_douban_id(url: str) -> str:
    """
    从豆瓣图书 URL 中提取图书 ID。

    支持格式：
    - https://book.douban.com/subject/1084336/
    - https://book.douban.com/subject/1084336

    Args:
        url: 豆瓣图书详情页 URL。

    Returns:
        纯数字豆瓣 ID 字符串；无法提取时返回空字符串。
    """
    if not url:
        return ""
    m = re.search(r"/subject/(\d+)/?", url)
    return m.group(1) if m else ""


# ==================== 搜索页面解析 ====================

def parse_search(html: str, keyword: str) -> Optional[Dict[str, Any]]:
    """
    解析豆瓣搜索结果页面 HTML，提取第一个匹配的图书信息。

    从搜索结果列表的第一条记录中提取：
    - 书名、详情页 URL、豆瓣 ID
    - 封面图片 URL
    - 作者、出版社、出版日期、价格（从 pub_info 行解析）
    - 评分

    返回与 parse_book 相同的字段规范，缺失字段填充空字符串。

    Args:
        html: 豆瓣搜索结果页完整 HTML 字符串。
        keyword: 搜索关键词（当前版本未使用，保留供未来过滤逻辑使用）。

    Returns:
        图书元数据字典；无搜索结果时返回 None。
    """
    soup = BeautifulSoup(html, "html.parser")

    subject_list = soup.find("ul", class_="subject-list")
    if not subject_list:
        return None

    items = subject_list.find_all("li", class_="subject-item")
    if not items:
        return None

    item = items[0]

    # 书名与详情页 URL
    h2 = item.find("h2")
    title_tag = h2.find("a") if h2 else None
    if not title_tag:
        return None

    title = title_tag.get("title", "").strip() or title_tag.get_text(strip=True)
    detail_url = title_tag.get("href", "")

    # 封面
    cover_tag = item.find("img")
    cover_url = cover_tag.get("src", "") if cover_tag else ""

    # 出版信息行（格式：作者 / 出版社 / 出版日期 / 价格）
    pub_tag = item.find("div", class_="pub")
    pub_fields: Dict[str, str] = {}
    if pub_tag:
        pub_info = pub_tag.get_text(strip=True)
        pub_fields = _parse_pub_info(pub_info)

    # 评分
    rating = ""
    rating_tag = item.find("span", class_="rating_nums")
    if rating_tag:
        raw = rating_tag.get_text(strip=True)
        try:
            val = float(raw)
            if 0.0 < val <= 10.0:
                rating = raw
        except (ValueError, TypeError):
            pass

    # 简介摘要（搜索结果页通常有短摘要）
    summary = ""
    abstract_tag = item.find("p")
    if abstract_tag:
        summary = abstract_tag.get_text(strip=True)[:_SUMMARY_MAX_LENGTH]

    return _make_empty_book(
        douban_id=_extract_douban_id(detail_url),
        title=title,
        author=pub_fields.get("author", ""),
        publisher=pub_fields.get("publisher", ""),
        publish_date=pub_fields.get("publish_date", ""),
        price=pub_fields.get("price", ""),
        cover_url=cover_url,
        summary=summary,
        rating=rating,
        douban_url=detail_url,
    )


def _parse_pub_info(pub_info: str) -> Dict[str, str]:
    """
    解析搜索结果中的出版信息行。

    豆瓣搜索结果出版信息格式（以 / 分隔）：
        作者名 / 出版社 / 出版年 / 定价

    字段数量不固定，按位置映射，缺失字段返回空字符串。

    Args:
        pub_info: div.pub 的纯文本内容。

    Returns:
        包含 author、publisher、publish_date、price 键的字典。
    """
    parts = [p.strip() for p in pub_info.split("/") if p.strip()]
    return {
        "author":       parts[0] if len(parts) > 0 else "",
        "publisher":    parts[1] if len(parts) > 1 else "",
        "publish_date": parts[2] if len(parts) > 2 else "",
        "price":        parts[3] if len(parts) > 3 else "",
    }