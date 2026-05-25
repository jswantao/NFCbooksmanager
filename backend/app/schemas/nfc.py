# backend/app/schemas/nfc.py
"""NFC 相关 Pydantic 模型"""

from typing import Optional
from pydantic import Field, ConfigDict
from app.schemas.common import AppSchema


class NFCWriteRequest(AppSchema):
    """NFC 标签写入请求"""
    location_code: str = Field(..., min_length=1, max_length=100, description="实体书架位置编码", examples=["study-left-3"])
    location_name: str = Field(..., min_length=1, max_length=200, description="实体书架位置名称", examples=["书房-左侧-第3层"])
    tag_uid: str = Field(..., min_length=1, max_length=100, description="NFC 标签的唯一标识符 (UID)", examples=["04A2C5B2C5A281"])


class NFCWriteResponse(AppSchema):
    """NFC 标签写入响应"""
    success: bool = Field(True, description="写入是否成功")
    tag_uid: str = Field(..., description="已写入的 NFC 标签 UID")
    location_code: str = Field(..., description="已写入的位置编码")
    location_name: str = Field(..., description="已写入的位置名称")
    raw_payload: str = Field(..., description="写入标签的原始数据载荷")
    checksum: Optional[str] = Field(None, description="数据完整性校验值")
    message: str = Field("写入成功", description="操作结果描述")


class NFCReadResponse(AppSchema):
    """NFC 标签读取响应"""
    tag_uid: str = Field("", description="读取到的 NFC 标签 UID")
    location_code: str = Field("", description="解析出的位置编码")
    location_name: str = Field("", description="解析出的位置名称")
    raw_payload: str = Field("", description="标签中存储的原始数据")
    valid: bool = Field(False, description="数据是否有效且可解析")
    error: str = Field("", description="错误信息")

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={"example": {"tag_uid": "04A2C5B2C5A281", "location_code": "study-left-3", "location_name": "书房-左侧-第3层", "raw_payload": "...", "valid": True, "error": ""}}
    )
