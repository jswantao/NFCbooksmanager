"""NFC 桥接 — 业务编排层

按业务域拆分:
- tasks: 写入任务生命周期管理
- scan : NFC 标签扫描回调 (四级判断链)
- bind : 标签 - 物理书架绑定 + 引导页
- info : NFC 关联信息查询
"""

from app.api.nfc_bridge.handlers import bind, info, scan, tasks

__all__ = ["tasks", "scan", "bind", "info"]
