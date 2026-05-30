# backend/app/schemas/book.py
"""图书相关 Pydantic 模型"""

from typing import Optional, List
from pydantic import Field, ConfigDict, field_validator
from app.schemas.common import AppSchema


class BookBase(AppSchema):
    """图书基础信息模型"""
    isbn: str = Field(..., description="国际标准书号", examples=["9787544291163"])
    title: str = Field(..., min_length=1, max_length=500, description="书名", examples=["三体"])
    author: Optional[str] = Field(None, max_length=300, description="作者", examples=["刘慈欣"])
    translator: Optional[str] = Field(None, max_length=300, description="译者")
    publisher: Optional[str] = Field(None, max_length=200, description="出版社", examples=["重庆出版社"])
    publish_date: Optional[str] = Field(None, max_length=50, description="出版日期", examples=["2008-1"])
    cover_url: Optional[str] = Field(None, max_length=500, description="封面图片 URL（豆瓣）")
    local_cover_path: Optional[str] = Field(None, max_length=200, description="本地封面上传路径")
    summary: Optional[str] = Field(None, description="图书内容简介")
    pages: Optional[int] = Field(None, description="总页数", examples=[302])
    price: Optional[str] = Field(None, max_length=50, description="定价", examples=["23.00元"])
    binding: Optional[str] = Field(None, max_length=50, description="装帧类型", examples=["平装", "精装"])
    original_title: Optional[str] = Field(None, max_length=300, description="原版书名", examples=["The Three-Body Problem"])
    series: Optional[str] = Field(None, max_length=200, description="所属丛书", examples=["中国科幻基石丛书"])
    rating: Optional[str] = Field(None, max_length=10, description="豆瓣评分", examples=["9.3"])
    douban_url: Optional[str] = Field(None, max_length=300, description="豆瓣详情页 URL")

    @field_validator("isbn")
    @classmethod
    def validate_isbn(cls, v: str) -> str:
        """ISBN-10/ISBN-13 格式清洗 + 校验位验证"""
        v = v.replace("-", "").replace(" ", "").strip().upper()
        if len(v) not in (10, 13):
            raise ValueError(f"ISBN 应为 10 或 13 位数字，当前 {len(v)} 位")
        if not v[:-1].isdigit() and not (len(v) == 10 and v[-1] in '0123456789X'):
            raise ValueError(f"ISBN 包含非法字符: {v}")

        # ISBN-10 校验位验证
        if len(v) == 10:
            try:
                s = sum((i + 1) * (10 if c == 'X' else int(c)) for i, c in enumerate(v))
                if s % 11 != 0:
                    raise ValueError(f"ISBN-10 校验位不匹配: {v}")
            except ValueError:
                raise ValueError(f"ISBN-10 格式无效: {v}")

        # ISBN-13 校验位验证
        if len(v) == 13:
            try:
                digits = [int(c) for c in v]
                s = sum(digits[i] * (1 if i % 2 == 0 else 3) for i in range(12))
                if (10 - s % 10) % 10 != digits[12]:
                    raise ValueError(f"ISBN-13 校验位不匹配: {v}")
            except ValueError:
                raise ValueError(f"ISBN-13 格式无效: {v}")
        return v

    @field_validator("douban_url")
    @classmethod
    def validate_douban_url(cls, v: Optional[str]) -> Optional[str]:
        if v and not (v.startswith("https://book.douban.com/") or v.startswith("https://douban.com/")):
            raise ValueError(f"豆瓣 URL 格式不正确: {v[:80]}")
        return v

    @field_validator("rating")
    @classmethod
    def validate_rating(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.strip():
            try:
                r = float(v)
                if r < 0 or r > 10:
                    raise ValueError(f"评分超出范围 0-10: {v}")
            except (ValueError, TypeError):
                raise ValueError(f"评分格式无效，应为数字: {v}")
        return v


class BookCreateManualRequest(BookBase):
    """手动/智能录入创建图书请求"""
    shelf_id: Optional[int] = Field(None, description="目标逻辑书架 ID", examples=[1])
    sort_order: int = Field(0, description="在书架中的排序位置")
    source: str = Field("manual", description="数据来源: manual / smart_entry / isbn / nfc", examples=["smart_entry"])


class BookUpdateManualRequest(AppSchema):
    """手动更新图书元数据请求（所有字段可选）"""
    title: Optional[str] = Field(None, min_length=1, max_length=500, description="书名")
    author: Optional[str] = Field(None, max_length=300, description="作者")
    translator: Optional[str] = Field(None, max_length=300, description="译者")
    publisher: Optional[str] = Field(None, max_length=200, description="出版社")
    publish_date: Optional[str] = Field(None, max_length=50, description="出版日期")
    cover_url: Optional[str] = Field(None, max_length=500, description="封面 URL")
    summary: Optional[str] = Field(None, description="图书简介")
    pages: Optional[int] = Field(None, description="页数")
    price: Optional[str] = Field(None, max_length=50, description="定价")
    binding: Optional[str] = Field(None, max_length=50, description="装帧")
    original_title: Optional[str] = Field(None, max_length=300, description="原版书名")
    series: Optional[str] = Field(None, max_length=200, description="丛书系列")
    rating: Optional[str] = Field(None, max_length=10, description="评分")
    douban_url: Optional[str] = Field(None, max_length=300, description="豆瓣 URL")


class BookInShelf(BookBase):
    """书架中的图书视图"""
    book_id: int = Field(..., description="图书唯一标识")
    source: str = Field("manual", description="数据来源: douban / manual / isbn / nfc")
    sort_order: int = Field(0, description="在书架中的排序位置")
    added_at: Optional[str] = Field(None, description="加入书架的时间 (ISO 格式)")
    shelf_name: Optional[str] = Field(None, description="所属书架名称")
    shelf_id: Optional[int] = Field(None, description="所属书架 ID")

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={"example": {"book_id": 42, "isbn": "9787544291163", "title": "三体", "author": "刘慈欣", "rating": "9.3", "source": "douban", "sort_order": 0}}
    )


class BookDetailResponse(BookBase):
    """图书详情响应"""
    book_id: int = Field(..., description="图书唯一标识")
    source: str = Field("manual", description="数据来源")
    last_sync_at: Optional[str] = Field(None, description="最后同步时间")
    created_at: Optional[str] = Field(None, description="创建时间")
    updated_at: Optional[str] = Field(None, description="更新时间")
    shelf_name: Optional[str] = Field(None, description="当前所属书架名称")
    shelf_id: Optional[int] = Field(None, description="当前所属书架 ID")
    sort_order: Optional[int] = Field(None, description="在书架中的排序位置")
    added_at: Optional[str] = Field(None, description="加入书架的时间")


class BookWallItem(AppSchema):
    """图书墙展示项"""
    book_id: int = Field(..., description="图书唯一标识")
    isbn: str = Field(..., description="ISBN")
    title: str = Field(..., description="书名")
    author: Optional[str] = Field(None, description="作者")
    cover_url: Optional[str] = Field(None, description="封面 URL")
    rating: Optional[str] = Field(None, description="评分")
    source: str = Field(..., description="数据来源")
    publisher: Optional[str] = Field(None, description="出版社")
    publish_date: Optional[str] = Field(None, description="出版日期")
    price: Optional[str] = Field(None, description="定价")
    shelf_name: Optional[str] = Field(None, description="所属书架")
    shelf_id: Optional[int] = Field(None, description="所属书架 ID")
    added_at: Optional[str] = Field(None, description="加入时间")
