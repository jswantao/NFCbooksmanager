# backend/app/services/douban_parser.py
"""
豆瓣图书详情页 HTML 解析器

提供纯函数式的 HTML 解析能力，将豆瓣页面 HTML 转换为结构化字典。
与 DoubanService 解耦，便于单独测试和维护。
"""

import re
from typing import Optional, Dict, Any

from bs4 import BeautifulSoup


# ==================== 详情页解析 ====================

def parse_book(html: str, isbn: str, url: str = "") -> Dict[str, Any]:
    """解析豆瓣图书详情页 HTML，提取图书元数据"""
    soup = BeautifulSoup(html, "html.parser")

    data = {
        "isbn": isbn,
        "title": _extract_title(soup),
        "author": "",
        "translator": "",
        "publisher": "",
        "publish_date": "",
        "cover_url": _extract_cover(soup),
        "summary": _extract_summary(soup),
        "rating": _extract_rating(soup),
        "pages": "",
        "price": "",
        "binding": "",
        "original_title": "",
        "series": "",
        "douban_url": url,
        "source": "douban",
    }

    if info_block := soup.find("div", id="info"):
        info_text = info_block.get_text("\n")
        _parse_info_block(info_text, data)

    return data


def _parse_info_block(text: str, data: Dict[str, Any]) -> None:
    """解析豆瓣详情页 #info 区块的键值对文本"""
    patterns = {
        "author": r"作者\s*[：:]\s*(.+?)(?:\n|$)",
        "translator": r"译者\s*[：:]\s*(.+?)(?:\n|$)",
        "publisher": r"出版社\s*[：:]\s*(.+?)(?:\n|$)",
        "publish_date": r"出版年\s*[：:]\s*(.+?)(?:\n|$)",
        "pages": r"页数\s*[：:]\s*(.+?)(?:\n|$)",
        "price": r"定价\s*[：:]\s*(.+?)(?:\n|$)",
        "binding": r"装帧\s*[：:]\s*(.+?)(?:\n|$)",
        "original_title": r"原作名\s*[：:]\s*(.+?)(?:\n|$)",
        "series": r"丛书\s*[：:]\s*(.+?)(?:\n|$)",
    }

    for field, pattern in patterns.items():
        match = re.search(pattern, text)
        if match:
            value = match.group(1).strip()
            if value and value != "-":
                data[field] = value


def _extract_title(soup: BeautifulSoup) -> str:
    """从 BeautifulSoup 对象中提取书名"""
    title_tag = soup.find("h1")
    if not title_tag:
        return ""

    title_span = title_tag.find("span", property="v:itemreviewed")
    if title_span:
        return title_span.get_text(strip=True)

    text = title_tag.get_text(strip=True)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _extract_cover(soup: BeautifulSoup) -> str:
    """从 BeautifulSoup 对象中提取封面图片 URL"""
    cover_tag = soup.find("a", class_="nbg")
    if not cover_tag:
        return ""

    img = cover_tag.find("img")
    if not img:
        return ""

    cover_url = img.get("src", "")
    if not cover_url:
        return ""

    # 替换为大图 URL：仅替换路径中的尺寸段，不修改 public/ 后的文件名前缀
    # Douban CDN 不支持文件名中的 l/m 前缀，修改会导致 404
    cover_url = re.sub(r'/view/subject/[sml]/', '/view/subject/l/', cover_url)

    return cover_url


def _extract_summary(soup: BeautifulSoup) -> str:
    """从 BeautifulSoup 对象中提取图书简介"""
    # 尝试 .intro 段落
    intro = soup.find("span", class_="all hidden")
    if not intro:
        intro = soup.find("div", class_="intro")
    if intro:
        texts = []
        for p in intro.find_all("p"):
            text = p.get_text(strip=True)
            if text and "(" not in text[:3]:
                texts.append(text)
        if texts:
            return " ".join(texts)[:500]

    # 尝试 #link-report
    link_report = soup.find("div", id="link-report")
    if link_report:
        span = link_report.find("span", class_="all hidden")
        if not span:
            span = link_report.find("div", class_="intro")
        if span:
            text = span.get_text(strip=True)
            return text[:500] if text else ""

    return ""


def _extract_rating(soup: BeautifulSoup) -> str:
    """从 BeautifulSoup 对象中提取评分"""
    rating_tag = soup.find("strong", class_="ll rating_num")
    if rating_tag:
        return rating_tag.get_text(strip=True)
    return ""


# ==================== 搜索页面解析 ====================

def parse_search(html: str, keyword: str) -> Optional[Dict[str, Any]]:
    """解析豆瓣搜索结果页面 HTML，提取第一个匹配的图书信息"""
    soup = BeautifulSoup(html, "html.parser")

    # 查找搜索结果列表
    subject_list = soup.find("ul", class_="subject-list")
    if not subject_list:
        return None

    items = subject_list.find_all("li", class_="subject-item")
    if not items:
        return None

    # 取第一个结果
    item = items[0]

    # 提取书名和链接
    title_tag = item.find("h2").find("a") if item.find("h2") else None
    if not title_tag:
        return None

    title = title_tag.get("title", "").strip() or title_tag.get_text(strip=True)
    detail_url = title_tag.get("href", "")

    # 提取封面
    cover_tag = item.find("img")
    cover_url = cover_tag.get("src", "") if cover_tag else ""

    # 提取信息行
    pub_info = ""
    pub_tag = item.find("div", class_="pub")
    if pub_tag:
        pub_info = pub_tag.get_text(strip=True)

    # 提取评分
    rating = ""
    rating_tag = item.find("span", class_="rating_nums")
    if rating_tag:
        rating = rating_tag.get_text(strip=True)

    return {
        "title": title,
        "author": "",
        "publisher": "",
        "publish_date": "",
        "cover_url": cover_url,
        "summary": pub_info[:200] if pub_info else "",
        "rating": rating,
        "douban_url": detail_url,
        "source": "douban",
    }
