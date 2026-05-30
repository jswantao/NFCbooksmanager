"""NFC 桥接 API — 三层架构解耦版本

目录结构（对齐 books / shelves / import_api 的拆分规范）::

    nfc_bridge/
    ├── __init__.py          # 重导出 router，向后兼容旧 import 路径
    ├── router.py            # 路由注册 + 参数校验 (< 200 行)
    ├── schemas.py           # 本域专用 Pydantic 模型
    ├── service.py           # 无状态业务工具（IP / URL / NDEF 解析 / payload）
    ├── crud.py              # 纯数据库原子操作（不依赖外部服务）
    └── handlers/
        ├── __init__.py
        ├── tasks.py         # 写入任务相关业务编排
        ├── scan.py          # /callback 四级判断链
        ├── bind.py          # 标签绑定 / 自动绑定 / 引导页
        └── info.py          # NFC 关联信息查询

迁移完成后:
    旧 ``from app.api.nfc_bridge import router`` 仍然可用,
    新代码建议 ``from app.api.nfc_bridge import router``。
"""

from app.api.nfc_bridge.router import router

__all__ = ["router"]
