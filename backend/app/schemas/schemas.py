# backend/app/schemas/schemas.py
"""
Pydantic 数据模型定义 (外模式 - 用户交互与数据传输层)

按照三级模式架构设计：
- 外模式：面向前端和 NFC 设备的标准化数据视图
- 所有响应模型均包含完整的字段描述、示例和验证规则
- 屏蔽内模式存储细节，仅暴露业务所需数据
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator, ConfigDict


# ==================== 通用响应模型 ====================

class ApiResponse(BaseModel):
    """
    统一 API 响应格式
    
    所有 API 接口均使用此模型进行包装，
    确保前端能一致地处理成功和失败响应。
    """
    success: bool = Field(True, description="请求是否成功")
    message: str = Field("操作成功", description="响应消息，成功或错误描述")
    data: Optional[Any] = Field(None, description="响应数据，类型视具体接口而定")
    
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "success": True,
                "message": "操作成功",
                "data": {"id": 1, "name": "示例"}
            }
        }
    )


class PaginatedResponse(BaseModel):
    """
    分页响应模型
    
    用于列表类接口的统一分页数据返回。
    """
    items: List[Any] = Field(default_factory=list, description="当前页数据列表")
    total: int = Field(0, description="数据总条数")
    page: int = Field(1, description="当前页码")
    page_size: int = Field(20, description="每页条数")
    total_pages: int = Field(0, description="总页数")
    
    model_config = ConfigDict(from_attributes=True)


# ==================== NFC 相关模型 (外模式核心) ====================

class NFCWriteRequest(BaseModel):
    """
    NFC 标签写入请求
    
    将实体书架的位置信息编码后写入 NFC 标签，
    建立物理书架与数字系统的入口关联。
    
    字段说明：
    - location_code: 遵循命名规范，如 'study-left-3'
    - location_name: 便于人类阅读的位置描述
    - tag_uid: NFC 标签的唯一标识符，用于后续读取和校验
    """
    location_code: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="实体书架位置编码，如 'study-left-3'",
        examples=["study-left-3", "living-room-shelf-1"]
    )
    location_name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="实体书架位置名称，如 '书房-左侧-第3层'",
        examples=["书房-左侧-第3层", "客厅-电视柜-第1层"]
    )
    tag_uid: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="NFC 标签的唯一标识符 (UID)",
        examples=["04A2C5B2C5A281"]
    )
    
    model_config = ConfigDict(from_attributes=True)


class NFCWriteResponse(BaseModel):
    """
    NFC 标签写入响应
    
    返回写入操作的结果，包含校验信息，
    确保数据写入成功且内容可被正确解析。
    """
    success: bool = Field(True, description="写入是否成功")
    tag_uid: str = Field(..., description="已写入的 NFC 标签 UID")
    location_code: str = Field(..., description="已写入的位置编码")
    location_name: str = Field(..., description="已写入的位置名称")
    raw_payload: str = Field(..., description="写入标签的原始数据载荷")
    checksum: Optional[str] = Field(None, description="数据完整性校验值")
    message: str = Field("写入成功", description="操作结果描述")
    
    model_config = ConfigDict(from_attributes=True)


class NFCReadResponse(BaseModel):
    """
    NFC 标签读取响应
    
    从 NFC 标签读取并解析位置编码信息，
    是物理世界进入数字系统的入口数据。
    
    异常情况：
    - tag_uid 为空：标签不存在或读取失败
    - valid=False：标签内容格式错误或编码损坏
    - error 非空：具体的错误描述信息
    """
    tag_uid: str = Field("", description="读取到的 NFC 标签 UID")
    location_code: str = Field("", description="解析出的位置编码")
    location_name: str = Field("", description="解析出的位置名称")
    raw_payload: str = Field("", description="标签中存储的原始数据")
    valid: bool = Field(False, description="数据是否有效且可解析")
    error: str = Field("", description="错误信息，读取成功时为空字符串")
    
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "tag_uid": "04A2C5B2C5A281",
                "location_code": "study-left-3",
                "location_name": "书房-左侧-第3层",
                "raw_payload": "study-left-3|书房-左侧-第3层",
                "valid": True,
                "error": ""
            }
        }
    )


# ==================== 映射相关模型 (中间模式核心) ====================

class MappingResolveRequest(BaseModel):
    """
    映射解析请求
    
    根据物理位置编码（来自 NFC 读取或手动输入），
    解析出对应的逻辑书架信息。
    
    输入来源：
    - NFC 标签读取后的 location_code
    - 用户手动输入的位置编码
    """
    location_code: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="物理位置编码，用于查找对应的逻辑书架",
        examples=["study-left-3"]
    )


class MappingResolveResponse(BaseModel):
    """
    映射解析响应
    
    返回物理位置与逻辑书架的映射关系，
    是中间模式接口 B 的标准输出 DTO。
    
    字段说明：
    - logical_shelf_id: 逻辑书架唯一标识，用于后续查询图书
    - physical_location: 人类可读的物理位置名称
    - mapping_type: 映射类型 (one_to_one / one_to_many)
    - version: 映射版本号，用于检测映射变更
    """
    logical_shelf_id: int = Field(..., description="逻辑书架唯一标识")
    logical_shelf_name: str = Field(..., description="逻辑书架名称")
    physical_location: str = Field(..., description="物理位置名称")
    physical_code: Optional[str] = Field(None, description="物理位置编码")
    mapping_type: str = Field("one_to_one", description="映射类型: one_to_one / one_to_many")
    version: int = Field(1, description="映射版本号，用于变更检测")
    is_active: bool = Field(True, description="映射是否处于激活状态")
    
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "logical_shelf_id": 1,
                "logical_shelf_name": "文学小说",
                "physical_location": "书房-左侧-第3层",
                "physical_code": "study-left-3",
                "mapping_type": "one_to_one",
                "version": 2,
                "is_active": True
            }
        }
    )


class MappingCreateRequest(BaseModel):
    """
    映射创建请求
    
    建立物理书架与逻辑书架之间的映射关系。
    
    业务规则：
    - 一个物理书架可映射多个逻辑书架 (one_to_many)
    - 一个逻辑书架通常只映射一个物理书架 (one_to_one)
    - 同一配对只能存在一条有效映射
    """
    physical_shelf_id: int = Field(..., description="物理书架 ID")
    logical_shelf_id: int = Field(..., description="逻辑书架 ID")
    mapping_type: str = Field(
        "one_to_one",
        description="映射类型",
        examples=["one_to_one", "one_to_many"]
    )
    
    model_config = ConfigDict(from_attributes=True)


# ==================== 书架相关模型 ====================

class ShelfCreateRequest(BaseModel):
    """
    逻辑书架创建请求
    
    逻辑书架是图书的业务聚合容器，
    不等同于物理书架层板。
    """
    shelf_name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="逻辑书架名称，用于展示和检索",
        examples=["文学小说", "技术书籍", "儿童读物"]
    )
    description: Optional[str] = Field(
        None,
        max_length=500,
        description="书架描述，补充说明书架用途或分类规则"
    )

    model_config = ConfigDict(from_attributes=True)


class ShelfUpdateRequest(BaseModel):
    """
    逻辑书架更新请求
    
    支持部分更新，仅传入需要修改的字段。
    """
    shelf_name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=200,
        description="书架名称"
    )
    description: Optional[str] = Field(
        None,
        max_length=500,
        description="书架描述"
    )
    
    model_config = ConfigDict(from_attributes=True)


class ShelfInfoResponse(BaseModel):
    """
    逻辑书架基本信息响应
    
    用于书架列表展示，包含统计信息。
    
    字段说明：
    - book_count: 书架中在架图书数量
    - physical_location: 关联的物理位置名称
    - recent_cover: 最近添加图书的封面，用于列表缩略图
    """
    logical_shelf_id: int = Field(..., description="逻辑书架唯一标识")
    shelf_name: str = Field(..., description="书架名称")
    description: Optional[str] = Field(None, description="书架描述")
    book_count: int = Field(0, description="当前在架图书数量")
    physical_location: Optional[str] = Field(None, description="关联的物理位置名称")
    physical_code: Optional[str] = Field(None, description="关联的物理位置编码")
    recent_cover: Optional[str] = Field(None, description="最近添加图书的封面 URL")
    created_at: Optional[str] = Field(None, description="创建时间 (ISO 格式)")
    updated_at: Optional[str] = Field(None, description="最后更新时间 (ISO 格式)")
    
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "logical_shelf_id": 1,
                "shelf_name": "文学小说",
                "description": "包含中外文学经典和现代小说",
                "book_count": 42,
                "physical_location": "书房-左侧-第3层",
                "physical_code": "study-left-3",
                "recent_cover": "https://img.example.com/cover/123.jpg",
                "created_at": "2025-01-15T10:30:00",
                "updated_at": "2025-03-20T14:22:00"
            }
        }
    )


class ShelfBooksResponse(BaseModel):
    """
    逻辑书架完整响应（含图书列表）
    
    这是前端逻辑书架视图的核心数据模型，
    同时展示实体位置信息和图书元数据。
    
    数据来源：
    - physical_info: 通过中间模式映射解析获得
    - books: 通过内模式数据库查询获得
    """
    logical_shelf_id: int = Field(..., description="逻辑书架唯一标识")
    shelf_name: str = Field(..., description="书架名称")
    description: Optional[str] = Field(None, description="书架描述")
    physical_info: Optional[MappingResolveResponse] = Field(
        None,
        description="物理位置映射信息，NFC 扫描后自动关联"
    )
    books: List['BookInShelf'] = Field(
        default_factory=list,
        description="书架中的图书列表，按 sort_order 排序"
    )
    total_count: int = Field(0, description="书架中图书总数")
    
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "logical_shelf_id": 1,
                "shelf_name": "文学小说",
                "description": "包含中外文学经典和现代小说",
                "physical_info": {
                    "logical_shelf_id": 1,
                    "logical_shelf_name": "文学小说",
                    "physical_location": "书房-左侧-第3层",
                    "physical_code": "study-left-3",
                    "mapping_type": "one_to_one",
                    "version": 2,
                    "is_active": True
                },
                "books": [],
                "total_count": 42
            }
        }
    )


# ==================== 图书相关模型 (内模式数据视图) ====================

class BookBase(BaseModel):
    """
    图书基础信息模型
    
    包含图书的所有核心元数据字段，
    是图书创建和展示的基类。
    
    数据来源：
    - douban: 豆瓣 API 自动同步
    - manual: 用户手动录入
    - isbn: 通过 ISBN 查询获取
    - nfc: 通过 NFC 标签关联获取
    """
    isbn: str = Field(
        ...,
        description="国际标准书号，10 或 13 位（不含连字符）",
        examples=["9787544291163"]
    )
    title: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="书名（含副标题）",
        examples=["三体"]
    )
    author: Optional[str] = Field(
        None,
        max_length=300,
        description="作者姓名，多位作者以逗号分隔",
        examples=["刘慈欣"]
    )
    translator: Optional[str] = Field(
        None,
        max_length=300,
        description="译者姓名（外文书籍适用）",
        examples=["李继宏"]
    )
    publisher: Optional[str] = Field(
        None,
        max_length=200,
        description="出版社名称",
        examples=["重庆出版社"]
    )
    publish_date: Optional[str] = Field(
        None,
        max_length=50,
        description="出版日期",
        examples=["2008-1"]
    )
    cover_url: Optional[str] = Field(
        None,
        max_length=500,
        description="图书封面图片 URL",
        examples=["https://img2.doubanio.com/view/subject/l/public/s2768378.jpg"]
    )
    summary: Optional[str] = Field(
        None,
        description="图书内容简介，纯文本格式"
    )
    pages: Optional[str] = Field(
        None,
        max_length=20,
        description="总页数",
        examples=["302"]
    )
    price: Optional[str] = Field(
        None,
        max_length=50,
        description="定价",
        examples=["23.00元"]
    )
    binding: Optional[str] = Field(
        None,
        max_length=50,
        description="装帧类型",
        examples=["平装", "精装", "简装"]
    )
    original_title: Optional[str] = Field(
        None,
        max_length=300,
        description="原版书名（外文书籍适用）",
        examples=["The Three-Body Problem"]
    )
    series: Optional[str] = Field(
        None,
        max_length=200,
        description="所属丛书系列",
        examples=["中国科幻基石丛书"]
    )
    rating: Optional[str] = Field(
        None,
        max_length=10,
        description="豆瓣评分",
        examples=["9.3"]
    )
    douban_url: Optional[str] = Field(
        None,
        max_length=300,
        description="豆瓣图书详情页 URL",
        examples=["https://book.douban.com/subject/2567698/"]
    )

    @field_validator("isbn")
    @classmethod
    def clean_isbn(cls, v: str) -> str:
        """
        ISBN 清洗与校验
        
        处理流程：
        1. 移除连字符和空格
        2. 验证长度为 10 或 13 位
        3. 返回纯数字/字母字符串
        
        异常：
        - 长度不符合 10 或 13 位时抛出 ValueError
        """
        v = v.replace("-", "").replace(" ", "").strip()
        if len(v) not in (10, 13):
            raise ValueError(f"ISBN 应为 10 或 13 位，当前为 {len(v)} 位: {v}")
        return v

    model_config = ConfigDict(from_attributes=True)


class BookCreateManualRequest(BookBase):
    """
    手动创建图书请求
    
    继承 BookBase 的所有字段，并额外支持：
    - 直接指定所属书架
    - 自定义排序位置
    
    场景：
    - 豆瓣同步失败时的手动补录
    - 无 ISBN 或特殊图书的录入
    """
    shelf_id: Optional[int] = Field(
        None,
        description="目标逻辑书架 ID，传入则自动添加到书架",
        examples=[1]
    )
    sort_order: int = Field(
        0,
        description="在书架中的排序位置，数值越小越靠前",
        examples=[0, 1, 10]
    )

    model_config = ConfigDict(from_attributes=True)


class BookUpdateManualRequest(BaseModel):
    """
    手动更新图书元数据请求
    
    所有字段均为可选，支持部分更新。
    仅传入需要修改的字段即可。
    
    使用场景：
    - 豆瓣数据不完整时的补充
    - 手动修正错误元数据
    """
    title: Optional[str] = Field(None, min_length=1, max_length=500, description="书名")
    author: Optional[str] = Field(None, max_length=300, description="作者")
    translator: Optional[str] = Field(None, max_length=300, description="译者")
    publisher: Optional[str] = Field(None, max_length=200, description="出版社")
    publish_date: Optional[str] = Field(None, max_length=50, description="出版日期")
    cover_url: Optional[str] = Field(None, max_length=500, description="封面 URL")
    summary: Optional[str] = Field(None, description="图书简介")
    pages: Optional[str] = Field(None, max_length=20, description="页数")
    price: Optional[str] = Field(None, max_length=50, description="定价")
    binding: Optional[str] = Field(None, max_length=50, description="装帧")
    original_title: Optional[str] = Field(None, max_length=300, description="原版书名")
    series: Optional[str] = Field(None, max_length=200, description="丛书系列")
    rating: Optional[str] = Field(None, max_length=10, description="评分")
    douban_url: Optional[str] = Field(None, max_length=300, description="豆瓣 URL")
    
    model_config = ConfigDict(from_attributes=True)


class BookInShelf(BookBase):
    """
    书架中的图书视图
    
    在 BookBase 基础上增加书架上下文信息：
    - 关联关系元数据 (sort_order, added_at)
    - 数据来源标识 (source)
    - 所属书架名称 (shelf_name)
    
    用于书架图书列表展示。
    """
    book_id: int = Field(..., description="图书唯一标识")
    source: str = Field("manual", description="数据来源: douban / manual / isbn / nfc")
    sort_order: int = Field(0, description="在书架中的排序位置")
    added_at: Optional[str] = Field(None, description="加入书架的时间 (ISO 格式)")
    shelf_name: Optional[str] = Field(None, description="所属书架名称")
    shelf_id: Optional[int] = Field(None, description="所属书架 ID")
    
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "book_id": 42,
                "isbn": "9787544291163",
                "title": "三体",
                "author": "刘慈欣",
                "publisher": "重庆出版社",
                "cover_url": "https://img2.doubanio.com/view/subject/l/public/s2768378.jpg",
                "rating": "9.3",
                "source": "douban",
                "sort_order": 0,
                "added_at": "2025-02-15T09:30:00",
                "shelf_name": "科幻世界",
                "shelf_id": 5
            }
        }
    )


class BookDetailResponse(BookBase):
    """
    图书详情响应
    
    包含完整的图书元数据以及书架关联信息。
    用于图书详情页展示。
    """
    book_id: int = Field(..., description="图书唯一标识")
    source: str = Field("manual", description="数据来源")
    last_sync_at: Optional[str] = Field(None, description="最后同步时间")
    created_at: Optional[str] = Field(None, description="创建时间")
    updated_at: Optional[str] = Field(None, description="更新时间")
    shelf_name: Optional[str] = Field(None, description="当前所属书架名称")
    shelf_id: Optional[int] = Field(None, description="当前所属书架 ID")
    sort_order: Optional[int] = Field(None, description="在书架中的排序位置")
    added_at: Optional[str] = Field(None, description="加入书架的时间")
    
    model_config = ConfigDict(from_attributes=True)


class BookWallItem(BaseModel):
    """
    图书墙展示项
    
    用于图书墙视图的轻量级展示，
    包含图书的核心信息和所属书架。
    """
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
    
    model_config = ConfigDict(from_attributes=True)


# ==================== 图书操作模型 ====================

class BookSyncRequest(BaseModel):
    """
    图书同步请求
    
    根据 ISBN 从豆瓣数据源拉取元数据。
    
    处理流程：
    1. 校验 ISBN 格式 (工作流引擎)
    2. 检查本地缓存
    3. 调用豆瓣爬虫获取元数据
    4. 写入内模式数据库 (upsert)
    5. 返回同步结果
    """
    isbn: str = Field(
        ...,
        min_length=10,
        max_length=13,
        description="要同步的图书 ISBN",
        examples=["9787544291163"]
    )

    model_config = ConfigDict(from_attributes=True)


class BookSyncResponse(BaseModel):
    """
    图书同步响应
    
    返回同步操作的结果和图书数据。
    
    异常情况：
    - success=False: 豆瓣访问失败、ISBN 无效等
    - book=None: 同步失败时无图书数据
    """
    success: bool = Field(..., description="同步是否成功")
    book: Optional[BookInShelf] = Field(None, description="同步后的图书数据")
    message: str = Field(..., description="同步结果描述")
    
    model_config = ConfigDict(from_attributes=True)


class BookAddToShelfRequest(BaseModel):
    """
    图书添加到书架请求
    
    将已存在的图书关联到指定书架。
    
    业务规则：
    - 同一图书可在多个书架中复用（可配置）
    - sort_order 决定展示排序
    - note 用于添加私人备注
    """
    book_id: int = Field(..., description="要添加的图书 ID")
    sort_order: int = Field(0, description="在书架中的排序位置")
    note: Optional[str] = Field(None, description="私人备注，如阅读心得")

    model_config = ConfigDict(from_attributes=True)


class BookAddToShelfResponse(BaseModel):
    """
    图书添加到书架响应
    """
    success: bool = Field(..., description="添加是否成功")
    message: str = Field(..., description="操作结果描述")
    shelf_book_id: Optional[int] = Field(None, description="关联记录 ID")
    
    model_config = ConfigDict(from_attributes=True)


class BookSearchRequest(BaseModel):
    """
    图书搜索请求
    
    支持按作者、标题关键词检索。
    """
    keyword: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="搜索关键词，匹配书名和作者"
    )
    shelf_id: Optional[int] = Field(None, description="限定在指定书架中搜索")
    page: int = Field(1, ge=1, description="页码，从 1 开始")
    page_size: int = Field(20, ge=1, le=100, description="每页条数")

    model_config = ConfigDict(from_attributes=True)


# ==================== Cookie 管理模型 ====================

class CookieSaveRequest(BaseModel):
    """
    豆瓣 Cookie 保存请求
    
    豆瓣需要登录状态才能获取完整数据，
    使用 Cookie 模拟已登录会话。
    
    安全注意：
    - Cookie 存储在服务器端文件系统
    - 不通过 API 明文返回完整 Cookie
    """
    cookie: str = Field(
        ...,
        min_length=1,
        description="豆瓣登录后的完整 Cookie 字符串"
    )
    user_agent: Optional[str] = Field(
        None,
        description="浏览器 User-Agent，用于模拟正常访问"
    )

    model_config = ConfigDict(from_attributes=True)


class CookieInfoResponse(BaseModel):
    """
    Cookie 状态查询响应
    
    仅返回 Cookie 状态和部分预览，不暴露完整内容。
    """
    has_cookie: bool = Field(..., description="是否已配置 Cookie")
    cookie_preview: str = Field(..., description="Cookie 前 20 字符预览，用于确认")
    user_agent: str = Field(..., description="当前使用的 User-Agent")
    updated_at: Optional[str] = Field(None, description="Cookie 最后更新时间")
    
    model_config = ConfigDict(from_attributes=True)


class CookieTestResponse(BaseModel):
    """
    Cookie 有效性测试响应
    
    通过实际请求豆瓣页面来验证 Cookie 是否有效。
    """
    success: bool = Field(..., description="测试请求是否成功")
    message: str = Field(..., description="测试结果描述")
    cookie_valid: bool = Field(False, description="Cookie 是否有效（已登录状态）")
    test_book: Optional[Dict[str, Any]] = Field(
        None,
        description="测试获取的图书数据，用于验证可用性"
    )
    
    model_config = ConfigDict(from_attributes=True)


# ==================== 导入相关模型 ====================

class ImportPreviewResponse(BaseModel):
    """
    文件导入预览响应
    
    在实际执行导入前，先预览文件内容，
    让用户确认数据并选择导入策略。
    
    关键字段：
    - new_count: 系统中不存在的 ISBN 数量
    - existing_count: 已存在的 ISBN 数量
    - duplicate_count: 文件中重复的 ISBN 数量
    - invalid_count: 格式不合法数量
    """
    file_name: str = Field(..., description="上传的文件名")
    file_size: int = Field(..., description="文件大小 (字节)")
    total_rows: int = Field(..., description="数据总行数")
    new_count: int = Field(0, description="新增图书数量")
    existing_count: int = Field(0, description="已存在图书数量")
    duplicate_count: int = Field(0, description="文件内重复数量")
    invalid_count: int = Field(0, description="无效数据数量")
    isbn_column: str = Field("isbn", description="识别到的 ISBN 列名")
    note_column: Optional[str] = Field(None, description="识别到的备注列名")
    isbns: List[str] = Field(default_factory=list, description="所有解析出的 ISBN")
    sample_data: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="前 5 行样本数据"
    )
    columns: List[str] = Field(default_factory=list, description="文件列名")
    new_entries: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="新增条目详情"
    )
    existing_books: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="已存在图书详情"
    )
    invalid_entries: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="无效条目详情"
    )
    duplicates: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="文件内重复条目"
    )
    
    model_config = ConfigDict(from_attributes=True)


class ImportStartResponse(BaseModel):
    """
    导入任务启动响应
    
    导入采用异步任务模式：
    1. 提交任务后立即返回 task_id
    2. 通过 task_id 轮询任务进度
    """
    task_id: str = Field(..., description="导入任务唯一标识")
    total: int = Field(..., description="待导入图书总数")
    message: str = Field(..., description="任务启动结果描述")
    
    model_config = ConfigDict(from_attributes=True)


class ImportTaskStatusResponse(BaseModel):
    """
    导入任务状态查询响应
    
    支持前端实时进度展示和错误反馈。
    
    状态流转：
    pending -> running -> completed / failed / cancelled
    """
    task_id: str = Field(..., description="任务唯一标识")
    status: str = Field(..., description="任务状态: pending/running/completed/failed/cancelled")
    total: int = Field(0, description="总任务数")
    completed: int = Field(0, description="已完成数")
    success: int = Field(0, description="成功数")
    synced: int = Field(0, description="已同步豆瓣数据数")
    failed: int = Field(0, description="失败数")
    skipped: int = Field(0, description="跳过数（已存在）")
    progress: float = Field(0.0, description="进度百分比 0-100")
    results: List[Dict[str, Any]] = Field(default_factory=list, description="成功结果列表")
    errors: List[Dict[str, Any]] = Field(default_factory=list, description="错误详情列表")
    error: Optional[str] = Field(None, description="任务级别错误信息")
    started_at: Optional[str] = Field(None, description="任务开始时间")
    finished_at: Optional[str] = Field(None, description="任务完成时间")
    file_name: Optional[str] = Field(None, description="导入文件名")
    
    model_config = ConfigDict(from_attributes=True)


# ==================== 仪表盘统计模型 ====================

class DashboardStatsResponse(BaseModel):
    """
    管理仪表盘统计数据响应
    
    提供系统全局视图的统计信息，
    包括实体书架、逻辑书架、图书等维度的汇总数据。
    
    数据来源：
    - physical_shelves/logical_shelves: 各表计数
    - total_books/books_in_shelves: book_metadata + logical_shelf_books
    - 图表数据: 聚合查询结果
    """
    physical_shelves: int = Field(0, description="物理书架总数")
    logical_shelves: int = Field(0, description="逻辑书架总数")
    active_mappings: int = Field(0, description="有效映射数量")
    total_books: int = Field(0, description="图书总数")
    books_in_shelves: int = Field(0, description="已上架图书数")
    books_not_in_shelf: int = Field(0, description="未上架图书数")
    books_by_source: Dict[str, int] = Field(
        default_factory=dict,
        description="各数据来源图书数量统计"
    )
    sync_count: int = Field(0, description="同步操作总次数")
    today_books: int = Field(0, description="今日新增图书数")
    recent_books: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="最近添加的图书列表"
    )
    monthly_growth: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="月度图书增长趋势"
    )
    top_publishers: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="出版社分布 Top N"
    )
    top_authors: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="作者分布 Top N"
    )
    rating_distribution: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="评分分布统计"
    )
    shelf_utilization: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="书架利用率统计"
    )
    recent_activities: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="最近操作活动记录"
    )
    
    model_config = ConfigDict(from_attributes=True)


class ActivityLogResponse(BaseModel):
    """
    活动日志响应
    
    记录系统中的所有关键操作，
    用于审计和问题排查。
    """
    id: int = Field(..., description="日志唯一标识")
    action: str = Field(..., description="操作类型: sync/mapping/add/delete/update/system")
    detail: Optional[str] = Field(None, description="操作详情描述")
    type: str = Field(..., description="实体类型: book/shelf/mapping")
    timestamp: str = Field(..., description="操作时间 (ISO 格式)")
    
    model_config = ConfigDict(from_attributes=True)


# ==================== 配置管理模型 ====================

class SystemConfigResponse(BaseModel):
    """
    系统配置信息响应
    
    返回系统运行的关键配置参数，
    但不暴露敏感信息（如数据库密码等）。
    """
    app_name: str = Field(..., description="应用名称")
    app_version: str = Field(..., description="应用版本")
    debug_mode: bool = Field(..., description="是否调试模式")
    database_type: str = Field(..., description="数据库类型")
    cors_origins: List[str] = Field(default_factory=list, description="允许的跨域来源")
    
    model_config = ConfigDict(from_attributes=True)