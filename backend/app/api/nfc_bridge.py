# backend/app/api/nfc_bridge.py
"""
NFC 桥接 API - 外模式核心接口

实现 NFC 标签与数字系统的交互入口。

核心端点：
- POST   /write          : 生成用于写入 NFC 标签的数据
- GET    /tasks          : 列出所有待写入任务
- GET    /tasks/{id}     : 获取单个任务详情
- DELETE /tasks/{id}     : 删除任务
- GET    /callback       : NFC 扫描回调（NFC TOOLS PRO 等工具调用）
- GET    /scan-link      : 生成 NFC 扫描链接
- GET    /uid            : 生成模拟 NFC UID
- GET    /mobile         : 手机端操作页面

数据流向（三级模式）：
NFC 标签 → 扫描回调 → 解析 shelf_id → 查询 LogicalShelf → 重定向到书架页面

安全设计：
- 写入任务有过期时间（TASK_EXPIRE_MINUTES）
- 定期清理过期任务
- 任务数据存储在内存中（重启丢失，符合安全要求）

NFC 工具兼容性：
- NFC TOOLS PRO：支持 nfc://scan/?callback= 协议
- 自动解析多种回调参数格式
- 兼容旧版 nfc://write/?data= 格式
"""

import json
import uuid
import socket
import logging
import secrets
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from urllib.parse import quote, unquote, parse_qs, urlparse

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from fastapi.responses import HTMLResponse, RedirectResponse

from app.core.database import SyncSessionLocal
from app.models.models import LogicalShelf

logger = logging.getLogger(__name__)
router = APIRouter()

# ==================== 常量配置 ====================

# 写入任务过期时间（分钟）
TASK_EXPIRE_MINUTES = 30

# 前端轮询间隔（毫秒），用于移动端页面自动刷新
POLLING_INTERVAL_MS = 3000

# 前端开发服务器端口
FRONTEND_DEV_PORT = 5173

# 后端服务端口
BACKEND_PORT = 8000

# ==================== 内存任务存储 ====================

# 写入任务临时存储（key: task_id, value: 任务数据）
# 仅在内存中存储，服务重启后清空
_tasks: Dict[str, Dict[str, Any]] = {}


def _get_current_time() -> datetime:
    """获取当前 UTC 时间"""
    return datetime.utcnow()


def _get_local_ip() -> str:
    """
    获取本机局域网 IP 地址
    
    通过建立 UDP 连接获取实际使用的网络接口 IP。
    用于生成 NFC 回调链接（手机需要访问 PC 上的服务）。
    
    Returns:
        本机 IP 地址，获取失败返回 "localhost"
    """
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except Exception:
        return "localhost"


def _get_frontend_url() -> str:
    """
    获取前端访问地址
    
    用于 NFC 扫描后重定向到前端书架页面。
    使用局域网 IP，确保手机可以访问。
    
    Returns:
        前端完整 URL（如 http://192.168.1.100:5173）
    """
    ip = _get_local_ip()
    return f"http://{ip}:{FRONTEND_DEV_PORT}"


def _clean_expired_tasks() -> None:
    """
    清理过期的写入任务
    
    遍历所有任务，删除超过 TASK_EXPIRE_MINUTES 的条目。
    在每次接口调用时自动执行，保持内存清洁。
    """
    now = _get_current_time()
    expired_keys = [
        key
        for key, task in _tasks.items()
        if task.get("expires_at", now) < now
    ]
    for key in expired_keys:
        del _tasks[key]
    
    if expired_keys:
        logger.debug(f"清理了 {len(expired_keys)} 个过期任务")


# ==================== 请求/响应模型 ====================

class WriteRequest(BaseModel):
    """NFC 写入请求"""
    shelf_id: int = Field(..., description="逻辑书架 ID")
    shelf_name: str = Field(..., description="书架名称（用于展示）")


class WriteResponse(BaseModel):
    """NFC 写入响应"""
    task_id: str = Field(..., description="任务唯一标识")
    shelf_id: int = Field(..., description="书架 ID")
    shelf_name: str = Field(..., description="书架名称")
    payload: str = Field(..., description="要写入 NFC 标签的 JSON 数据")
    created_at: str = Field(..., description="任务创建时间（ISO 格式）")
    expires_in: int = Field(..., description="剩余有效时间（秒）")


# ==================== 写入 API ====================

@router.post("/write", response_model=WriteResponse, summary="生成 NFC 写入数据")
async def write_nfc_data(req: WriteRequest) -> WriteResponse:
    """
    为指定书架生成 NFC 标签写入数据
    
    用途：
    1. PC 端选择书架后，生成写入数据
    2. 手机端获取数据，通过 NFC TOOLS PRO 写入标签
    3. 写入后扫描标签即可自动跳转到对应书架
    
    生成的 payload 格式：
    {"shelf_id": <书架ID>}
    
    任务有效期：TASK_EXPIRE_MINUTES 分钟（过期自动清理）。
    
    Args:
        req: 书架信息
    
    Returns:
        包含 payload 的写入任务数据
    
    Raises:
        HTTPException 404: 指定的书架不存在
    """
    _clean_expired_tasks()
    
    # 验证书架存在
    db = SyncSessionLocal()
    try:
        shelf = (
            db.query(LogicalShelf)
            .filter(
                LogicalShelf.logical_shelf_id == req.shelf_id,
                LogicalShelf.is_active == True,
            )
            .first()
        )
        if not shelf:
            raise HTTPException(
                status_code=404,
                detail=f"书架 #{req.shelf_id} 不存在或已停用",
            )
    finally:
        db.close()
    
    # 生成 payload 和任务
    payload = json.dumps({"shelf_id": req.shelf_id}, ensure_ascii=False)
    task_id = str(uuid.uuid4())[:8]
    now = _get_current_time()
    
    _tasks[task_id] = {
        "task_id": task_id,
        "shelf_id": req.shelf_id,
        "shelf_name": req.shelf_name,
        "payload": payload,
        "created_at": now.isoformat(),
        "expires_at": now + timedelta(minutes=TASK_EXPIRE_MINUTES),
    }
    
    logger.info(
        f"NFC 写入任务创建: {task_id} | "
        f"书架: {req.shelf_name} (#{req.shelf_id})"
    )
    
    return WriteResponse(
        task_id=task_id,
        shelf_id=req.shelf_id,
        shelf_name=req.shelf_name,
        payload=payload,
        created_at=now.isoformat(),
        expires_in=TASK_EXPIRE_MINUTES * 60,
    )


# ==================== 任务管理 ====================

@router.get("/tasks", summary="列出所有写入任务")
async def list_tasks() -> Dict[str, Any]:
    """
    获取当前所有有效的写入任务
    
    返回按创建时间倒序排列的任务列表。
    自动清理过期任务。
    
    Returns:
        任务列表和总数
    """
    _clean_expired_tasks()
    
    items = []
    for task_id, task in sorted(
        _tasks.items(),
        key=lambda x: x[1]["created_at"],
        reverse=True,
    ):
        remaining_seconds = max(
            0,
            int((task["expires_at"] - _get_current_time()).total_seconds()),
        )
        items.append(
            WriteResponse(
                task_id=task_id,
                shelf_id=task["shelf_id"],
                shelf_name=task["shelf_name"],
                payload=task["payload"],
                created_at=task["created_at"],
                expires_in=remaining_seconds,
            )
        )
    
    return {"tasks": items, "total": len(items)}


@router.get("/tasks/{task_id}", summary="获取单个任务详情")
async def get_task(task_id: str) -> WriteResponse:
    """
    获取指定任务的详细信息
    
    用于手机端复制 payload 写入 NFC 标签。
    
    Args:
        task_id: 任务 ID
    
    Returns:
        任务详情
    
    Raises:
        HTTPException 404: 任务不存在或已过期
    """
    _clean_expired_tasks()
    
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(
            status_code=404,
            detail="任务不存在或已过期",
        )
    
    remaining_seconds = max(
        0,
        int((task["expires_at"] - _get_current_time()).total_seconds()),
    )
    
    return WriteResponse(
        task_id=task_id,
        shelf_id=task["shelf_id"],
        shelf_name=task["shelf_name"],
        payload=task["payload"],
        created_at=task["created_at"],
        expires_in=remaining_seconds,
    )


@router.delete("/tasks/{task_id}", summary="删除任务")
async def delete_task(task_id: str) -> Dict[str, Any]:
    """
    删除指定的写入任务
    
    Args:
        task_id: 任务 ID
    
    Returns:
        删除结果
    
    Raises:
        HTTPException 404: 任务不存在
    """
    if task_id in _tasks:
        del _tasks[task_id]
        return {"success": True, "message": "任务已删除"}
    
    raise HTTPException(status_code=404, detail="任务不存在")


# ==================== 扫描回调 ====================

@router.get("/callback", summary="NFC 扫描回调处理")
async def nfc_callback(request: Request):
    """
    处理 NFC TOOLS PRO 等工具的扫描回调
    
    支持的参数格式：
    - tagid: NFC 标签 ID
    - text: NDEF 文本数据（JSON 格式）
    
    解析逻辑：
    1. 获取 URL 参数（tagid、text）
    2. 兼容旧版 nfc://write/?data= 格式
    3. 解析 JSON 提取 shelf_id
    4. 验证书架是否存在
    5. 成功：重定向到书架页面
    6. 失败：显示错误页面
    
    URL 格式示例：
    /callback?tagid={TAG-ID}&text={"shelf_id":1}
    
    Args:
        request: FastAPI Request 对象
    
    Returns:
        成功时 302 重定向到前端书架页面
        失败时返回 HTML 错误页面
    """
    params = dict(request.query_params)
    tag_id = params.get("tagid", "")
    raw_text = params.get("text", "")
    
    logger.info(
        f"📱 NFC 扫描回调 | tagid: {tag_id} | "
        f"text: {raw_text[:80] if raw_text else 'empty'}"
    )
    
    success = False
    shelf_id = None
    shelf_name = ""
    message = "数据格式无效"
    
    if raw_text:
        raw_data = raw_text
        
        # 兼容旧版 nfc://write/?data= 格式
        if "nfc://write/?" in raw_data:
            try:
                parsed_url = urlparse(raw_data)
                query_params = parse_qs(parsed_url.query)
                encoded_data = query_params.get("data", [""])[0]
                if encoded_data:
                    raw_data = unquote(encoded_data)
            except Exception:
                pass
        
        # 解析 JSON 数据
        try:
            data = json.loads(raw_data)
            
            if isinstance(data, dict) and "shelf_id" in data:
                shelf_id = int(data["shelf_id"])
                
                # 验证书架存在
                db = SyncSessionLocal()
                try:
                    shelf = (
                        db.query(LogicalShelf)
                        .filter(
                            LogicalShelf.logical_shelf_id == shelf_id,
                            LogicalShelf.is_active == True,
                        )
                        .first()
                    )
                    if shelf:
                        success = True
                        shelf_name = shelf.shelf_name
                        message = f"✅ 找到书架：{shelf_name}"
                        logger.info(
                            f"✅ 扫描成功 → 书架: {shelf_name} (#{shelf_id})"
                        )
                    else:
                        message = f"书架 #{shelf_id} 不存在或已停用"
                        logger.warning(f"书架不存在: #{shelf_id}")
                finally:
                    db.close()
            else:
                message = "缺少 shelf_id 字段"
                
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            message = f"数据解析失败: {str(e)[:50]}"
            logger.warning(f"JSON 解析失败: {e}")
    
    # 成功：重定向到前端书架页面
    if success and shelf_id:
        frontend_url = _get_frontend_url()
        redirect_url = f"{frontend_url}/shelf/{shelf_id}"
        return RedirectResponse(url=redirect_url, status_code=302)
    
    # 失败：显示错误页面
    return HTMLResponse(
        content=_build_result_html(
            tag_id=tag_id,
            success=success,
            shelf_id=shelf_id,
            shelf_name=shelf_name,
            message=message,
        )
    )


# ==================== 工具端点 ====================

@router.get("/scan-link", summary="生成 NFC 扫描链接")
async def get_scan_link() -> Dict[str, Any]:
    """
    生成可用于 NFC TOOLS PRO 的扫描链接
    
    链接格式：
    nfc://scan/?callback=http://{ip}:8000/api/nfc/callback?tagid={TAG-ID}&text={NDEF-TEXT}
    
    其中 {TAG-ID} 和 {NDEF-TEXT} 是 NFC TOOLS PRO 的占位符，
    扫描时自动替换为实际值。
    
    Returns:
        扫描链接和网络信息
    """
    ip = _get_local_ip()
    callback_url = (
        f"http://{ip}:{BACKEND_PORT}/api/nfc/callback"
        f"?tagid={{TAG-ID}}&text={{NDEF-TEXT}}"
    )
    scan_link = f"nfc://scan/?callback={quote(callback_url, safe='')}"
    
    return {
        "scan_link": scan_link,
        "local_ip": ip,
        "frontend": _get_frontend_url(),
    }


@router.get("/uid", summary="生成模拟 NFC UID")
async def generate_uid() -> Dict[str, str]:
    """
    生成模拟的 NFC 标签 UID
    
    用于开发和测试环境，生成随机的 MAC 地址格式 UID。
    格式：XX:XX:XX:XX:XX:XX
    
    Returns:
        包含 UID 的字典
    """
    uid = ":".join(
        secrets.token_hex(1).upper() for _ in range(6)
    )
    return {"uid": uid}


@router.get("/mobile", response_class=HTMLResponse, summary="手机端操作页面")
async def mobile_page() -> HTMLResponse:
    """
    手机端 NFC 操作页面
    
    提供手机上的完整 NFC 交互界面：
    - 点击扫描按钮调用 NFC TOOLS PRO
    - 自动轮询显示待写入任务列表
    - 一键复制 payload 到剪贴板
    - 操作步骤引导
    
    Returns:
        HTML 页面（移动端优化）
    """
    ip = _get_local_ip()
    callback_url = (
        f"http://{ip}:{BACKEND_PORT}/api/nfc/callback"
        f"?tagid={{TAG-ID}}&text={{NDEF-TEXT}}"
    )
    scan_link = f"nfc://scan/?callback={quote(callback_url, safe='')}"
    
    return HTMLResponse(
        content=_build_mobile_html(ip, scan_link, POLLING_INTERVAL_MS)
    )


# ==================== HTML 页面构建 ====================

def _build_result_html(
    tag_id: str,
    success: bool,
    shelf_id: Optional[int],
    shelf_name: str,
    message: str,
) -> str:
    """
    构建扫描结果 HTML 页面
    
    功能：
    - 成功时：显示绿色提示 + 1 秒后自动跳转到书架页面
    - 失败时：显示红色错误提示 + 返回按钮
    
    Args:
        tag_id: NFC 标签 ID
        success: 是否成功
        shelf_id: 书架 ID
        shelf_name: 书架名称
        message: 提示消息
    
    Returns:
        完整 HTML 页面
    """
    icon = "✅" if success else "❌"
    color = "#22c55e" if success else "#ef4444"
    frontend_url = _get_frontend_url()
    shelf_url = f"{frontend_url}/shelf/{shelf_id}" if shelf_id else ""
    
    # 成功时的自动跳转
    redirect_meta = ""
    action_button = ""
    if success and shelf_url:
        redirect_meta = (
            f'<meta http-equiv="refresh" content="1;url={shelf_url}">'
        )
        action_button = (
            f'<a href="{shelf_url}" class="btn bs">'
            f'📚 查看书架（自动跳转中...）</a>'
        )
    
    # 标签 ID 展示（如果有）
    tag_row = ""
    if tag_id:
        tag_row = (
            f'<div class="r">'
            f'<span class="l">🏷️ 标签</span>'
            f'<span class="v">{tag_id}</span>'
            f'</div>'
        )
    
    # 书架信息展示（成功时）
    shelf_row = ""
    if success:
        shelf_row = (
            f'<div class="r">'
            f'<span class="l">📚 书架</span>'
            f'<span class="v">#{shelf_id} {shelf_name}</span>'
            f'</div>'
        )
    
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>NFC 扫描结果</title>
{redirect_meta}
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{
    font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;
    background:#fdf8f4;color:#2c1810;padding:20px;max-width:500px;margin:0 auto
}}
.c{{
    background:#fff;border-radius:16px;padding:24px;margin-bottom:16px;
    box-shadow:0 2px 12px rgba(139,69,19,.1)
}}
.h{{text-align:center;font-size:56px;margin-bottom:12px}}
.t{{font-size:24px;font-weight:700;text-align:center;color:{color};margin-bottom:8px}}
.m{{text-align:center;color:#6b5e56;font-size:15px;margin-bottom:20px}}
.r{{display:flex;padding:12px 0;border-bottom:1px solid #f0e4d8}}
.l{{font-size:13px;color:#8c7b72;width:80px;flex-shrink:0}}
.v{{font-size:14px;word-break:break-all;font-family:monospace}}
.btn{{
    display:block;width:100%;padding:16px;border-radius:12px;border:none;
    font-size:17px;font-weight:600;text-decoration:none;text-align:center;
    margin-top:12px
}}
.bp{{background:#8B4513;color:#fff}}
.bs{{background:#22c55e;color:#fff}}
</style>
</head>
<body>
<div class="c">
    <div class="h">{icon}</div>
    <div class="t">{'扫描成功' if success else '扫描失败'}</div>
    <div class="m">{message}</div>
    {tag_row}
    {shelf_row}
</div>
{action_button}
<a href="/api/nfc/mobile" class="btn bp">📱 返回</a>
</body>
</html>"""


def _build_mobile_html(
    ip: str,
    scan_link: str,
    polling_ms: int,
) -> str:
    """
    构建手机端操作页面 HTML
    
    包含完整的 NFC 操作界面：
    - 扫描按钮
    - 操作步骤说明
    - 待写入任务列表（自动轮询）
    - 复制功能（剪贴板 + NFC TOOLS PRO 跳转）
    
    Args:
        ip: 服务器 IP
        scan_link: NFC 扫描链接
        polling_ms: 轮询间隔（毫秒）
    
    Returns:
        完整 HTML 页面
    """
    return """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#8B4513">
<title>📚 NFC 书房管理</title>
<style>
:root{--p:#8B4513;--bg:#fdf8f4;--c:#fff;--t:#2c1810;--ts:#8c7b72;--b:#e8d5c8;--s:#22c55e;--r:14px;--rs:10px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;background:var(--bg);color:var(--t);min-height:100vh;padding-bottom:20px}
.hd{background:linear-gradient(135deg,#8B4513,#a0522d);color:#fff;padding:24px 16px;text-align:center;position:sticky;top:0;z-index:100;box-shadow:0 2px 16px rgba(139,69,19,.3)}
.hd .lo{font-size:40px;display:block;margin-bottom:6px}
.hd h1{font-size:20px;font-weight:700}
.hd .ip{font-size:11px;opacity:.8;margin-top:4px}
.mn{padding:14px;max-width:500px;margin:0 auto}
.cd{background:var(--c);border-radius:var(--r);padding:18px;margin-bottom:14px;box-shadow:0 2px 8px rgba(139,69,19,.06);border:1px solid var(--b)}
.cd h3{font-size:16px;color:var(--p);margin-bottom:14px;display:flex;align-items:center;gap:8px;padding-bottom:10px;border-bottom:1px solid var(--b)}
.big{display:block;width:100%;padding:18px;border:none;border-radius:var(--r);font-size:17px;font-weight:700;text-decoration:none;text-align:center;margin-bottom:12px;cursor:pointer}
.bsn{background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;box-shadow:0 4px 16px rgba(59,130,246,.35)}
.bt{display:block;width:100%;padding:12px;border-radius:var(--rs);border:none;font-size:14px;font-weight:600;cursor:pointer;text-align:center;margin-bottom:6px;-webkit-appearance:none}
.bt-p{background:var(--p);color:#fff}
.bt-s{background:var(--s);color:#fff}
.bt-g{background:#f59e0b;color:#fff}
.ti{padding:12px;border:1px solid var(--b);border-radius:var(--rs);margin-bottom:8px;background:#fafaf9}
.ti-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.ti-n{font-weight:600;font-size:14px}
.ti-c{font-size:11px;color:var(--ts)}
.ti-p{background:#f5f5f4;padding:8px;border-radius:6px;font-size:13px;font-family:monospace;word-break:break-all;margin-bottom:8px;color:#374151}
.ti-a{display:flex;gap:6px}
.bdg{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:500}
.bdg-s{background:#f0fdf4;color:#166534}
.bdg-w{background:#fffbeb;color:#92400e}
.bdg-i{background:#eff6ff;color:#1d4ed8}
.emp{text-align:center;padding:28px;color:var(--ts)}
.emp .icn{font-size:36px;display:block;margin-bottom:6px;opacity:.5}
.steps{background:var(--c);border-radius:var(--r);padding:16px;margin-bottom:14px;border:1px solid #fde68a;background:#fffbeb}
.steps h4{font-size:14px;color:#92400e;margin-bottom:10px}
.steps ol{margin:0;padding-left:18px;font-size:13px;color:#78716c;line-height:1.8}
.toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:10px 20px;border-radius:20px;font-size:13px;z-index:9999;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.3);animation:tIn .3s ease,tOut .3s ease 2s forwards}
@keyframes tIn{from{opacity:0;transform:translateX(-50%) translateY(-16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
@keyframes tOut{from{opacity:1}to{opacity:0}}
.pop{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#22c55e;color:#fff;padding:20px 40px;border-radius:16px;font-size:18px;font-weight:700;z-index:9999;box-shadow:0 8px 32px rgba(34,197,94,.5);animation:pIn .3s ease,pOut .3s ease 1.5s forwards;pointer-events:none}
@keyframes pIn{from{opacity:0;transform:translate(-50%,-50%) scale(.5)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
@keyframes pOut{from{opacity:1}to{opacity:0}}
</style>
</head>
<body>
<div class="hd"><span class="lo">📚</span><h1>NFC 书房管理</h1><div class="ip">🔗 """ + ip + """:""" + str(BACKEND_PORT) + """</div></div>
<div class="mn">
<a href='""" + scan_link + """' class="big bsn">📡 点击扫描 NFC 标签</a>
<div class="steps"><h4>📱 操作步骤</h4><ol><li>PC端生成数据 → 下方自动显示</li><li>点击「📋 复制」复制 JSON</li><li>打开 <strong>NFC TOOLS PRO</strong> → 写 → 写数据</li><li>粘贴 → 贴近标签完成写入</li><li>点击「📡 扫描」→ 自动跳转书架</li></ol></div>
<div class="cd"><h3>📝 写入任务 <span class="bdg bdg-i" id="tc">0</span></h3><div id="wt"><div class="emp"><span class="icn">📭</span>加载中...</div></div></div>
</div>
<script>
var A=window.location.origin;
function tx(m){var t=document.createElement('div');t.className='toast';t.textContent=m;document.body.appendChild(t);setTimeout(function(){t.remove()},2500)}
function sc(){var e=document.createElement('div');e.className='pop';e.textContent='✅ 已复制！请打开 NFC TOOLS PRO 粘贴写入';document.body.appendChild(e);setTimeout(function(){e.remove()},2000)}
function lt(){fetch(A+'/api/nfc/tasks').then(function(r){return r.json()}).then(function(d){document.getElementById('tc').textContent=d.total;var e=document.getElementById('wt');if(d.tasks.length===0){e.innerHTML='<div class="emp"><span class="icn">📭</span>暂无<br><span style="font-size:12px;color:var(--ts)">PC端生成后自动显示</span></div>';return}e.innerHTML=d.tasks.map(function(t){var l=t.expires_in>300?'bdg-s':'bdg-w',x=t.expires_in>0?Math.ceil(t.expires_in/60)+'分钟':'已过期';return'<div class="ti"><div class="ti-h"><span class="ti-n">📚 '+t.shelf_name+'</span><span class="bdg '+l+'">'+x+'</span></div><div class="ti-c">ID: '+t.shelf_id+'</div><div class="ti-p">'+t.payload+'</div><div class="ti-a"><button class="bt bt-s" onclick="cw('+JSON.stringify(t.task_id)+')" style="flex:1;font-size:12px;padding:10px">📋 复制</button><button class="bt bt-g" onclick="co('+JSON.stringify(t.task_id)+')" style="flex:1;font-size:12px;padding:10px">📱 复制并打开NFC工具</button></div></div>'}).join('')}).catch(function(e){console.error(e)})}
function cw(id){fetch(A+'/api/nfc/tasks/'+id).then(function(r){return r.json()}).then(function(t){return navigator.clipboard.writeText(t.payload)}).then(function(){sc()}).catch(function(){tx('❌ 复制失败')})}
function co(id){fetch(A+'/api/nfc/tasks/'+id).then(function(r){return r.json()}).then(function(t){return navigator.clipboard.writeText(t.payload)}).then(function(){sc();setTimeout(function(){window.location.href='intent://#Intent;scheme=nfctools;package=com.wakdev.wdnfc;end'},500)}).catch(function(){tx('❌ 复制失败')})}
lt();setInterval(function(){lt()},""" + str(polling_ms) + """);
</script></body></html>"""