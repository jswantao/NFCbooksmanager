# backend/app/schemas/mapping.py
"""映射相关 Pydantic 模型"""

from typing import Optional
from pydantic import Field, ConfigDict
from app.schemas.common import AppSchema


class MappingResolveRequest(AppSchema):
    """映射解析请求"""
    location_code: str = Field(..., min_length=1, max_length=100, description="物理位置编码", examples=["study-left-3"])


class MappingResolveResponse(AppSchema):
    """映射解析响应"""
    logical_shelf_id: int = Field(..., description="逻辑书架唯一标识")
    logical_shelf_name: str = Field(..., description="逻辑书架名称")
    physical_location: str = Field(..., description="物理位置名称")
    physical_code: Optional[str] = Field(None, description="物理位置编码")
    mapping_type: str = Field("one_to_one", description="映射类型")
    version: int = Field(1, description="映射版本号")
    is_active: bool = Field(True, description="映射是否激活")

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={"example": {"logical_shelf_id": 1, "logical_shelf_name": "文学小说", "physical_location": "书房-左侧-第3层", "physical_code": "study-left-3", "mapping_type": "one_to_one", "version": 2, "is_active": True}}
    )


class MappingCreateRequest(AppSchema):
    """映射创建请求"""
    physical_shelf_id: int = Field(..., description="物理书架 ID")
    logical_shelf_id: int = Field(..., description="逻辑书架 ID")
    mapping_type: str = Field("one_to_one", description="映射类型", examples=["one_to_one", "one_to_many"])
