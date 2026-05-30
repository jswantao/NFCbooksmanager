"""NFC 桥接 API 专用 Pydantic 模型

设计原则:
- 仅本域使用的请求/响应模型放这里。
- 命名使用 ``NfcTask*`` 前缀, 避免与历史的 ``app/schemas/nfc.py`` 的
  ``NFCWriteRequest`` (物理写入语义) 混淆。
- 不在 router 内部定义 BaseModel, 统一收口便于 mypy 与 OpenAPI。

⚠️ 已修复 (来自原 nfc_bridge.py 的 B7):
原文件同时定义了 WriteReq 和 WriteRequest 两个几乎重复的模型,
本文件统一为 NfcTaskCreateRequest 一个名字。
"""


from pydantic import BaseModel, Field

# ==================== 写入任务 ====================


class NfcTaskCreateRequest(BaseModel):
    """NFC 写入任务创建请求 — 统一替代旧的 WriteReq / WriteRequest"""

    shelf_id: int = Field(..., description="逻辑书架 ID")
    shelf_name: str = Field(
        "",
        description="书架名称（可选, 用于 UI 展示。为空时服务端将填充逻辑书架真实名称）",
    )


class NfcTaskResponse(BaseModel):
    """NFC 写入任务响应 — /write 与 /tasks/{id} 端点共用"""

    task_id: str = Field(..., description="任务唯一标识 (8 位 uuid 前缀)")
    shelf_id: int = Field(..., description="书架 ID")
    shelf_name: str = Field(..., description="书架名称")
    payload: str = Field(..., description="要写入 NFC 标签的 JSON 数据")
    created_at: str = Field(..., description="任务创建时间（ISO 8601）")
    expires_in: int = Field(..., description="剩余有效时间（秒）")


class NfcUnifiedTaskResponse(NfcTaskResponse):
    """/write/unified 端点的扩展响应 — 额外返回物理书架关联信息"""

    physical_shelf: dict | None = Field(
        None, description="关联的物理书架信息（如果存在映射）"
    )
    mapping_type: str | None = Field(None, description="映射类型")
    nfc_bound: bool = Field(False, description="物理书架是否已绑定 NFC 标签")
    has_physical_mapping: bool = Field(False, description="是否已建立物理-逻辑映射")


# ==================== 任务列表 ====================


class NfcTaskListResponse(BaseModel):
    """任务列表响应"""

    tasks: list[NfcTaskResponse] = Field(default_factory=list)
    total: int = Field(0, description="任务总数")


# ==================== 绑定 ====================


class NfcAutoBindResult(BaseModel):
    """自动绑定结果 (POST/GET /bind/auto 共用)"""

    success: bool
    message: str
    already_bound: bool | None = None
    bound_shelf: dict | None = None
    suggestion: str | None = None
    redirect_url: str | None = None


class NfcCreateMappingResult(BaseModel):
    """绑定逻辑书架 (POST /bind-logical-shelf/create) 的响应"""

    success: bool
    mapping_id: int
    created: bool = Field(..., description="是否新建; False 表示已存在")
