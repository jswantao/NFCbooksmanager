# backend/app/api/backup.py
"""
数据备份与恢复 API

提供备份创建、列表查询、恢复向导（冲突检测+执行恢复）、
WebDAV 云同步配置及自动备份状态管理。

端点概览：
- POST   /export                  : 一键创建加密备份
- GET    /list                     : 列出本地备份文件
- GET    /list-webdav             : 列出 WebDAV 云端备份
- DELETE /delete                   : 删除本地备份文件
- GET    /preview/{filename}       : 预览备份内容
- POST   /check-conflicts/{filename} : 冲突检测
- POST   /restore                  : 执行恢复（支持 dry_run）
- GET    /webdav/config           : 获取 WebDAV 配置
- POST   /webdav/config           : 保存 WebDAV 配置
- POST   /webdav/test             : 测试 WebDAV 连接
- POST   /webdav/sync/{filename}  : 同步到 WebDAV
- POST   /webdav/pull/{filename}  : 从 WebDAV 下载
- GET    /auto/status             : 自动备份状态
- POST   /auto/run                : 手动触发定时备份
"""

from pathlib import Path

from loguru import logger
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.backup import (
    BackupExportResponse, BackupListResponse, BackupMetadataResponse,
    ConflictCheckResponse, RestorePreviewResponse,
    RestoreExecuteRequest, RestoreResultResponse, BackupDeleteRequest,
    WebDAVConfigResponse, WebDAVConfigSaveRequest, WebDAVTestResponse,
    AutoBackupStatusResponse,
)
from app.services.backup_service import (
    create_backup, list_backups, read_backup_metadata, read_backup_full,
    detect_conflicts, execute_restore, delete_backups,
    test_webdav_connection, sync_to_webdav, sync_from_webdav,
    list_webdav_backups as list_webdav_files, delete_webdav_backup,
    get_auto_backup_status, run_scheduled_backup,
)

router = APIRouter()


# ==================== 备份创建与列表 ====================

@router.post("/export", response_model=BackupExportResponse, summary="一键创建加密备份")
async def export_backup(
    db: Session = Depends(get_db),
) -> BackupExportResponse:
    """
    创建当前数据库的全量加密备份

    导出全部 9 张表数据，Fernet 加密后保存为 .backup 文件。
    备份文件存储在 BACKUP_DIR 目录下，文件名格式：backup_YYYYMMDD_HHMMSS.backup
    """
    filepath = create_backup(db)
    if filepath is None:
        raise HTTPException(status_code=500, detail="备份创建失败，请查看日志")

    meta = read_backup_metadata(filepath)
    if meta is None:
        raise HTTPException(status_code=500, detail="备份创建成功但无法读取元数据")

    return BackupExportResponse(
        success=True,
        message=f"备份已创建: {filepath.name}",
        data=BackupMetadataResponse(**meta),
    )


@router.get("/list", response_model=BackupListResponse, summary="列出本地备份文件")
async def list_backup_files() -> BackupListResponse:
    """列出所有本地 .backup 文件及其元数据，按创建时间倒序排列"""
    backups = list_backups()
    return BackupListResponse(
        success=True,
        message=f"共 {len(backups)} 个备份文件",
        data=[BackupMetadataResponse(**b) for b in backups],
    )


@router.get("/list-webdav", response_model=BackupListResponse, summary="列出 WebDAV 云端备份")
async def list_webdav_backup_files() -> BackupListResponse:
    """列出 WebDAV 服务器上的备份文件"""
    files = await list_webdav_files()
    return BackupListResponse(
        success=True,
        message=f"云端共 {len(files)} 个备份文件",
        data=[BackupMetadataResponse(
            filename=f["filename"],
            version="",
            created_at="",
            table_counts={},
            file_size_bytes=f.get("file_size_bytes", 0),
            file_size_display=f.get("file_size_display", "未知"),
            encrypted=True,
        ) for f in files],
    )


@router.delete("/delete", response_model=ApiResponse[dict], summary="删除本地备份文件")
async def delete_backup_files(req: BackupDeleteRequest) -> ApiResponse[dict]:
    """删除指定的本地备份文件"""
    deleted = delete_backups(req.filenames)
    return ApiResponse(
        success=deleted > 0,
        message=f"已删除 {deleted} 个文件",
        data={"deleted": deleted},
    )


# ==================== 恢复向导 ====================

@router.get("/preview/{filename}", response_model=RestorePreviewResponse, summary="预览备份内容")
async def preview_backup(filename: str) -> RestorePreviewResponse:
    """解密并展示备份文件的元数据和表结构概览"""
    s = get_settings()
    filepath = s.backup_dir_path / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail=f"备份文件不存在: {filename}")

    meta = read_backup_metadata(filepath)
    if meta is None:
        raise HTTPException(status_code=500, detail="无法读取备份文件")

    total_rows = sum(meta.get("table_counts", {}).values())
    return RestorePreviewResponse(
        filename=filename,
        version=meta.get("version", ""),
        app_version=meta.get("app_version", ""),
        created_at=meta.get("created_at", ""),
        table_counts=meta.get("table_counts", {}),
        total_rows=total_rows,
    )


@router.post("/check-conflicts/{filename}", response_model=ConflictCheckResponse, summary="冲突检测")
async def check_conflicts(
    filename: str,
    db: Session = Depends(get_db),
) -> ConflictCheckResponse:
    """
    比对备份文件与当前数据库，检测冲突

    返回三种冲突类型：
    - exists_different: 主键相同但字段值不同 → 需要用户决策
    - exists_identical: 主键相同且内容相同 → 无需处理
    - orphan_in_backup: 仅存在于备份中的新数据 → 可直接插入
    """
    s = get_settings()
    filepath = s.backup_dir_path / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail=f"备份文件不存在: {filename}")

    envelope = read_backup_full(filepath)
    if envelope is None:
        raise HTTPException(status_code=500, detail="无法读取备份文件")

    backup_data = envelope.get("data", {})
    conflicts, summary = detect_conflicts(db, backup_data)

    # 计算预期新增数量
    total_new = 0
    for table_name, rows in backup_data.items():
        # 简单估算（实际在恢复时会更精确）
        total_new += len(rows)

    message = (
        f"检测到 {summary['total_conflicts']} 个冲突"
        if summary["total_conflicts"] > 0
        else "未检测到冲突，可安全恢复"
    )

    return ConflictCheckResponse(
        success=True,
        message=message,
        data={
            "total_conflicts": summary["total_conflicts"],
            "by_table": summary["by_table"],
            "conflicts": summary["conflicts"],
            "expected_new_rows": total_new,
        },
    )


@router.post("/restore", response_model=RestoreResultResponse, summary="执行数据恢复")
async def execute_restore_endpoint(
    req: RestoreExecuteRequest,
    db: Session = Depends(get_db),
) -> RestoreResultResponse:
    """
    执行数据恢复操作

    参数：
    - filename: 备份文件名
    - resolutions: 冲突解决方案列表（每项指定 table/pk_column/pk_value/action）
    - dry_run: true=仅预览不实际修改，false=正式执行

    冲突处理策略：
    - overwrite: 用备份数据覆盖当前数据
    - skip: 保留当前数据不变
    - keep_both: 保留两者（备份数据以新主键插入）
    """
    s = get_settings()
    filepath = s.backup_dir_path / req.filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail=f"备份文件不存在: {req.filename}")

    envelope = read_backup_full(filepath)
    if envelope is None:
        raise HTTPException(status_code=500, detail="无法读取备份文件")

    resolutions = [
        {
            "table": r.table,
            "pk_column": r.pk_column,
            "pk_value": r.pk_value,
            "action": r.action,
        }
        for r in req.resolutions
    ]

    result = execute_restore(db, envelope, resolutions, dry_run=req.dry_run)

    if result["summary"]["errors"] > 0 and not req.dry_run:
        return RestoreResultResponse(
            success=False,
            message=f"恢复完成但存在 {result['summary']['errors']} 个错误",
            data=result,
        )

    mode = "预览" if req.dry_run else "恢复"
    return RestoreResultResponse(
        success=True,
        message=f"{mode}完成: "
        f"覆盖 {result['summary']['overwritten']}, "
        f"跳过 {result['summary']['skipped']}, "
        f"插入 {result['summary']['inserted']}",
        data=result,
    )


# ==================== WebDAV 配置 ====================

@router.get("/webdav/config", response_model=WebDAVConfigResponse, summary="查看 WebDAV 配置")
async def get_webdav_config() -> WebDAVConfigResponse:
    """获取当前 WebDAV 配置（密码脱敏）"""
    s = get_settings()
    configured = bool(s.WEBDAV_URL and s.WEBDAV_USERNAME)
    return WebDAVConfigResponse(
        enabled=s.WEBDAV_ENABLED,
        url=s.WEBDAV_URL,
        username=s.WEBDAV_USERNAME,
        configured=configured,
        remote_path=s.WEBDAV_REMOTE_PATH,
        timeout=s.WEBDAV_TIMEOUT,
    )


@router.post("/webdav/config", response_model=ApiResponse[None], summary="保存 WebDAV 配置")
async def save_webdav_config(req: WebDAVConfigSaveRequest) -> ApiResponse[None]:
    """更新 WebDAV 设置并持久化"""
    s = get_settings()
    s.WEBDAV_ENABLED = req.enabled
    s.WEBDAV_URL = req.url
    s.WEBDAV_USERNAME = req.username
    if req.password:
        s.WEBDAV_PASSWORD = req.password
    s.WEBDAV_REMOTE_PATH = req.remote_path
    s.WEBDAV_TIMEOUT = req.timeout

    # 持久化
    success = s.save_to_file({
        "webdav_enabled": req.enabled,
        "webdav_url": req.url,
        "webdav_username": req.username,
        "webdav_password": s._encrypt_cookie(req.password) if req.password else "",
        "webdav_remote_path": req.remote_path,
        "webdav_timeout": req.timeout,
    })

    if not success:
        raise HTTPException(status_code=500, detail="配置保存失败")

    return ApiResponse(success=True, message="WebDAV 配置已保存")


@router.post("/webdav/test", response_model=WebDAVTestResponse, summary="测试 WebDAV 连接")
async def test_webdav_endpoint() -> WebDAVTestResponse:
    """测试到 WebDAV 服务器的连接"""
    result = await test_webdav_connection()
    return WebDAVTestResponse(
        success=result["success"],
        message=result["message"],
        data=result,
    )


@router.post("/webdav/sync/{filename}", response_model=ApiResponse[None], summary="同步到 WebDAV")
async def sync_to_webdav_endpoint(filename: str) -> ApiResponse[None]:
    """将指定备份文件上传到 WebDAV 服务器"""
    s = get_settings()
    filepath = s.backup_dir_path / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail=f"备份文件不存在: {filename}")

    ok = await sync_to_webdav(filepath)
    if not ok:
        raise HTTPException(status_code=500, detail="同步到 WebDAV 失败")

    return ApiResponse(success=True, message=f"已同步 {filename} 到云端")


@router.post("/webdav/pull/{filename}", response_model=ApiResponse[None], summary="从 WebDAV 下载")
async def pull_from_webdav_endpoint(filename: str) -> ApiResponse[None]:
    """从 WebDAV 服务器下载备份文件到本地"""
    s = get_settings()
    local_path = s.backup_dir_path / filename

    ok = await sync_from_webdav(filename, local_path)
    if not ok:
        raise HTTPException(status_code=500, detail="从 WebDAV 下载失败")

    return ApiResponse(success=True, message=f"已从云端下载 {filename}")


# ==================== 自动备份 ====================

@router.get("/auto/status", response_model=AutoBackupStatusResponse, summary="自动备份状态")
async def get_auto_backup_status_endpoint() -> AutoBackupStatusResponse:
    """获取自动备份计划的状态信息"""
    status = get_auto_backup_status()
    return AutoBackupStatusResponse(**status)


@router.post("/auto/run", response_model=BackupExportResponse, summary="手动触发自动备份")
async def trigger_backup(
    db: Session = Depends(get_db),
) -> BackupExportResponse:
    """立即执行一次完整的自动备份流程（创建备份 + 可选 WebDAV 同步）"""
    filepath = create_backup(db)
    if filepath is None:
        raise HTTPException(status_code=500, detail="备份创建失败")

    s = get_settings()
    if s.WEBDAV_ENABLED:
        try:
            await sync_to_webdav(filepath)
        except Exception as e:
            logger.warning(f"WebDAV 同步失败: {e}")

    meta = read_backup_metadata(filepath)
    if meta is None:
        raise HTTPException(status_code=500, detail="备份创建成功但无法读取元数据")

    return BackupExportResponse(
        success=True,
        message=f"自动备份完成: {filepath.name}",
        data=BackupMetadataResponse(**meta),
    )
