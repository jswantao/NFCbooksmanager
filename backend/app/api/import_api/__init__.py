"""批量导入 API — 三层架构解耦

- router.py  : 路由注册 + 参数校验
- handlers.py: 业务逻辑编排（预览/分类/状态查询）
- crud.py    : 纯函数工具（ISBN 清洗/文件解析）

后台任务 _run_import_task 保留在 import_api.py（向后兼容）。
"""
from app.api.import_api.router import router

__all__ = ["router"]
