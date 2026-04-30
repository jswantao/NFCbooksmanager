# backend/app/services/nfc_service.py
"""
NFC 标签服务

外模式核心服务，负责处理 NFC 标签的数据生成、验证和解析。

实现需求说明书中的 NFC 相关功能：
- NFC 标签数据载荷（payload）生成
- 数据完整性校验（checksum）
- 载荷解析（兼容多种格式）
- 标签写入数据准备

数据格式：
- 完整格式：{"version":"1.0","location_code":"study-left-3","location_name":"书房-左侧-第3层"}
- 极简格式：{"shelf_id":1}

安全机制：
- checksum 使用 SHA256 哈希，带加密盐值
- 防止数据篡改和伪造
- 密钥通过 NFC_ENCRYPTION_KEY 配置

设计注意：
- 所有方法均为静态方法，无状态服务
- 支持新旧格式兼容解析
- 不依赖硬件：仅处理数据逻辑，实际读写由前端 Web NFC API 完成
"""

import json
import hashlib
from typing import Optional, Dict, Any, Union

from app.core.config import settings


class NFCService:
    """
    NFC 标签数据服务
    
    提供 NFC 标签数据的完整生命周期管理：
    
    写入流程：
    1. generate_tag_data() 生成完整标签数据
    2. 前端通过 Web NFC API 写入标签
    
    读取流程：
    1. 前端读取标签原始数据
    2. parse_payload() 解析载荷
    3. verify_payload() 验证完整性（可选）
    4. 使用解析结果查询映射关系
    
    校验机制：
    - 使用 SHA256 生成数据校验和
    - 校验和 = SHA256(载荷:加密密钥) 的前 16 位十六进制
    - 读取时重新计算校验和并与存储值比对
    """
    
    # ==================== 载荷生成 ====================
    
    @staticmethod
    def generate_payload(location_code: str, location_name: str) -> str:
        """
        生成完整格式的 NFC 载荷
        
        格式：
        {
            "version": "1.0",
            "location_code": "<位置编码>",
            "location_name": "<位置名称>"
        }
        
        用途：
        - 写入 NFC 标签，存储完整的物理书架位置信息
        - 标签丢失或脱离系统时仍可人工识别位置
        
        Args:
            location_code: 位置编码（如 "study-left-3"）
            location_name: 位置名称（如 "书房-左侧-第3层"）
        
        Returns:
            JSON 格式的载荷字符串
        
        Example:
            >>> NFCService.generate_payload("study-left-3", "书房-左侧-第3层")
            '{"version": "1.0", "location_code": "study-left-3", "location_name": "书房-左侧-第3层"}'
        """
        payload = {
            "version": "1.0",
            "location_code": location_code,
            "location_name": location_name,
        }
        return json.dumps(payload, ensure_ascii=False)
    
    @staticmethod
    def generate_shelf_payload(shelf_id: int) -> str:
        """
        生成极简格式的 NFC 载荷
        
        格式：
        {"shelf_id": <逻辑书架ID>}
        
        用途：
        - 直接按逻辑书架 ID 进行映射，跳过位置编码解析步骤
        - 适用于已确定逻辑书架的快速绑定场景
        
        对比完整格式：
        - 优点：数据量更小，适合小容量 NFC 标签
        - 缺点：丢失位置描述信息，脱离系统后难以识别
        
        Args:
            shelf_id: 逻辑书架 ID
        
        Returns:
            JSON 格式的极简载荷字符串
        
        Example:
            >>> NFCService.generate_shelf_payload(1)
            '{"shelf_id": 1}'
        """
        return json.dumps({"shelf_id": shelf_id}, ensure_ascii=False)
    
    # ==================== 数据校验 ====================
    
    @staticmethod
    def calculate_checksum(data: str) -> str:
        """
        计算载荷数据的 SHA256 校验和
        
        算法：SHA256(载荷数据:加密密钥) 取前 16 位十六进制
        
        用途：
        - 写入 NFC 标签时附带校验和，防止数据损坏或篡改
        - 读取时验证数据完整性
        
        安全性：
        - 使用配置密钥作为盐值，防止伪造校验和
        - 仅取前 16 位输出，平衡安全性与标签容量
        
        Args:
            data: 要计算校验和的载荷数据（JSON 字符串）
        
        Returns:
            16 位十六进制校验和字符串
        
        Example:
            >>> NFCService.calculate_checksum('{"shelf_id": 1}')
            'a1b2c3d4e5f6g7h8'  # 示例值
        """
        # 获取加密密钥（默认值仅用于开发环境）
        encryption_key = settings.NFC_ENCRYPTION_KEY or "default-key"
        
        # 将载荷数据与密钥拼接后计算哈希
        hash_input = f"{data}:{encryption_key}"
        hash_hex = hashlib.sha256(hash_input.encode()).hexdigest()
        
        # 取前 16 位作为校验和
        return hash_hex[:16]
    
    @staticmethod
    def verify_payload(data: str, checksum: str) -> bool:
        """
        验证载荷数据完整性
        
        重新计算载荷的校验和，与存储的校验和比对。
        
        验证通过条件：
        - 载荷数据未被篡改
        - 校验和未被伪造
        - 加密密钥一致
        
        用途：
        - NFC 标签读取后验证数据未被篡改
        - 防止恶意修改标签内容
        
        Args:
            data: 从标签读取的原始载荷数据
            checksum: 标签中存储的校验和
        
        Returns:
            True 表示校验通过，数据完整可信
            False 表示校验失败，数据可能被篡改或格式损坏
        """
        expected_checksum = NFCService.calculate_checksum(data)
        return expected_checksum == checksum
    
    # ==================== 载荷解析 ====================
    
    @staticmethod
    def parse_payload(raw: Union[str, bytes, Dict]) -> Optional[Dict[str, Any]]:
        """
        解析 NFC 载荷数据
        
        支持三种输入格式：
        1. JSON 字符串（从 NFC 标签读取）
        2. bytes（某些 NFC 读取器返回的格式）
        3. 字典（已解析的数据）
        
        兼容两种载荷版本：
        - 新版（shelf_id）：{"shelf_id": 1}
        - 旧版（location_code）：{"version":"1.0","location_code":"...","location_name":"..."}
        
        自动识别并返回统一格式：
        - shelf_id 格式 → {"shelf_id": 1}
        - location 格式 → {"version":"1.0","location_code":"...","location_name":"..."}
        
        Args:
            raw: 原始载荷数据
        
        Returns:
            解析后的数据字典，解析失败返回 None
            
            返回格式示例：
            {"shelf_id": 1}
            或
            {"version":"1.0","location_code":"study-left-3","location_name":"书房-左侧-第3层"}
        
        异常处理：
        - 非法的 JSON 格式 → 返回 None
        - 缺少必要字段 → 返回 None
        - 数据类型错误 → 返回 None
        """
        try:
            # 统一转换为 Python 字典
            if isinstance(raw, str):
                data = json.loads(raw)
            elif isinstance(raw, bytes):
                data = json.loads(raw.decode('utf-8'))
            else:
                data = raw
            
            # 类型校验：必须为字典
            if not isinstance(data, dict):
                return None
            
            # 格式识别：shelf_id（新格式）
            if "shelf_id" in data:
                return {
                    "shelf_id": int(data["shelf_id"])
                }
            
            # 格式识别：location_code + location_name（旧格式）
            if "location_code" in data and "location_name" in data:
                return {
                    "version": data.get("version", "1.0"),
                    "location_code": data["location_code"],
                    "location_name": data["location_name"],
                }
            
            # 无法识别的格式
            return None
            
        except (json.JSONDecodeError, KeyError, ValueError, TypeError):
            return None
    
    # ==================== 标签数据生成 ====================
    
    @staticmethod
    def generate_tag_data(location_code: str, location_name: str) -> Dict[str, Any]:
        """
        生成完整的 NFC 标签写入数据
        
        包含以下部分：
        - payload: 载荷数据（JSON 字符串）
        - checksum: SHA256 校验和（16 位十六进制）
        - location_code: 位置编码（用于 API 响应）
        - location_name: 位置名称（用于 API 响应）
        
        用途：
        - POST /api/nfc/write 接口的数据准备
        - 前端获取此数据后通过 Web NFC API 写入标签
        
        调用关系：
        1. generate_payload() → 生成载荷
        2. calculate_checksum() → 计算校验和
        
        Args:
            location_code: 位置编码（如 "study-left-3"）
            location_name: 位置名称（如 "书房-左侧-第3层"）
        
        Returns:
            完整的标签数据字典
        
        Example:
            >>> NFCService.generate_tag_data("study-left-3", "书房-左侧-第3层")
            {
                "payload": '{"version":"1.0","location_code":"study-left-3",...}',
                "checksum": "a1b2c3d4e5f6g7h8",
                "location_code": "study-left-3",
                "location_name": "书房-左侧-第3层"
            }
        """
        # 生成 JSON 载荷
        payload = NFCService.generate_payload(location_code, location_name)
        
        # 计算校验和
        checksum = NFCService.calculate_checksum(payload)
        
        return {
            "payload": payload,
            "checksum": checksum,
            "location_code": location_code,
            "location_name": location_name,
        }