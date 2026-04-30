# backend/app/services/__init__.py
"""
服务层模块

服务层负责实现核心业务逻辑，位于 API 路由层和数据模型层之间。

三级模式架构中的角色：
- NFCService：外模式服务，处理物理世界 NFC 标签的数据生成与验证
- DoubanService：内模式服务，负责从豆瓣数据源获取图书元数据

服务设计原则：
- 单一职责：每个服务只负责一个领域
- 依赖注入：通过配置和外部客户端解耦
- 可测试性：服务方法独立，便于单元测试
"""

from app.services.douban_service import DoubanService
from app.services.nfc_service import NFCService

__all__ = ["DoubanService", "NFCService"]