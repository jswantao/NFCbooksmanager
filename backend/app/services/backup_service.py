# backend/app/services/backup_service.py
"""
数据备份与恢复服务

核心功能：
- 全量数据导出为加密 JSON 备份文件
- 从备份文件恢复数据，支持冲突检测与三种解决策略
- WebDAV 云端同步
- 定时自动备份

加密方案：
- 使用 Fernet 对称加密（密钥从 SECRET_KEY 派生）
- 备份格式：JSON 信封 {meta, data} → UTF-8 编码 → Fernet 加密 → .backup 文件
- 完整性校验：meta 中包含 data 的 SHA-256 校验和

恢复顺序：
- 导出：Base.metadata.sorted_tables 反向（先子后父）
- 恢复：Base.metadata.sorted_tables 正向（先父后子），外键检查临时关闭
"""

import json
import hashlib
import os
import shutil
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

import httpx
from loguru import logger
from sqlalchemy import inspect, text, Table
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import Base, get_db_context
from app.models.models import ActivityLog


# ==================== 常量 ====================

BACKUP_VERSION = "1.0.0"

# 恢复时需要排除的表（SQLite 系统表、Alembic 迁移表等）
EXCLUDED_TABLES = {"sqlite_sequence", "alembic_version"}

# 序列化时需要转换的列类型后缀
DATETIME_TYPE_SUFFIXES = ("DATETIME", "TIMESTAMP")


# ==================== 加密工具 ====================

def _get_fernet():
    """获取 Fernet 加密实例"""
    return get_settings().fernet


# ==================== 数据导出 ====================

def _row_to_dict(row: Any, mapper) -> Dict[str, Any]:
    """将 ORM 对象转为纯字典，datetime 序列化为 ISO 字符串"""
    result = {}
    for col in mapper.column_attrs:
        value = getattr(row, col.key)
        if isinstance(value, datetime):
            result[col.key] = value.isoformat()
        else:
            result[col.key] = value
    return result


def _dict_to_row_values(data: Dict[str, Any], table: Table) -> Dict[str, Any]:
    """将字典中的 ISO 时间字符串还原为 datetime 对象"""
    result = {}
    for col in table.columns:
        key = col.name
        if key not in data:
            continue
        value = data[key]
        col_type = str(col.type).upper()
        if any(suffix in col_type for suffix in DATETIME_TYPE_SUFFIXES):
            if isinstance(value, str):
                try:
                    result[key] = datetime.fromisoformat(value)
                except (ValueError, TypeError):
                    result[key] = value
            else:
                result[key] = value
        else:
            result[key] = value
    return result


def export_all_tables(db: Session) -> Dict[str, List[Dict[str, Any]]]:
    """
    导出全部数据表

    按 Base.metadata.sorted_tables 的反向顺序导出（先子后父），
    确保恢复时父记录先于子记录插入。

    Returns:
        {"table_name": [{row_dict}, ...], ...}
    """
    tables = list(Base.metadata.sorted_tables)
    # 反向：子表优先导出
    tables.reverse()

    result: Dict[str, List[Dict[str, Any]]] = {}

    for table in tables:
        name = table.name
        if name in EXCLUDED_TABLES:
            continue
        try:
            rows = db.query(table).all()
            # 每个表使用自己的 mapper
            table_result = []
            for row in rows:
                row_dict = {}
                for col in table.columns:
                    value = getattr(row, col.key)
                    if isinstance(value, datetime):
                        row_dict[col.key] = value.isoformat()
                    else:
                        row_dict[col.key] = value
                table_result.append(row_dict)
            result[name] = table_result
        except Exception as e:
            logger.warning(f"导出表 {name} 时出错: {e}")
            result[name] = []

    return result


# ==================== 备份文件操作 ====================

def _compute_checksum(data: Dict[str, Any]) -> str:
    """计算数据字典的 SHA-256 校验和"""
    raw = json.dumps(data, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _format_file_size(size_bytes: int) -> str:
    """将字节数转为可读格式"""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"


def create_backup(db: Session) -> Optional[Path]:
    """
    创建加密全量备份

    流程：
    1. 导出全部表数据
    2. 构建备份信封 {meta, data}
    3. JSON 序列化 → Fernet 加密
    4. 写入 .backup 文件
    5. 清理超出 BACKUP_MAX_LOCAL_COPIES 的旧文件

    Returns:
        备份文件路径，失败返回 None
    """
    s = get_settings()
    try:
        # 1. 导出
        exported = export_all_tables(db)
        table_counts = {k: len(v) for k, v in exported.items()}

        # 2. 构建信封
        meta = {
            "version": BACKUP_VERSION,
            "app_version": s.APP_VERSION,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "table_counts": table_counts,
            "checksum_sha256": _compute_checksum(exported),
        }
        envelope = {"meta": meta, "data": exported}

        # 3. 加密
        plaintext = json.dumps(envelope, ensure_ascii=False, default=str)
        encrypted = _get_fernet().encrypt(plaintext.encode("utf-8"))

        # 4. 写入文件
        backup_dir = s.backup_dir_path
        backup_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"backup_{timestamp}.backup"
        filepath = backup_dir / filename

        with open(filepath, "wb") as f:
            f.write(encrypted)

        file_size = filepath.stat().st_size
        total_rows = sum(table_counts.values())

        logger.info(
            f"备份已创建: {filename} | "
            f"大小: {_format_file_size(file_size)} | "
            f"表数: {len(table_counts)} | 总行数: {total_rows}"
        )

        # 6. 记录活动日志
        _log_activity(db, "backup", "backup_file", detail_data={
            "filename": filename,
            "file_size": file_size,
            "table_counts": table_counts,
            "total_rows": total_rows,
        })

        # 5. 清理旧备份
        _enforce_max_backups()

        return filepath

    except Exception as e:
        logger.error(f"创建备份失败: {e}")
        return None


def _enforce_max_backups() -> None:
    """清理超出数量限制的旧备份文件"""
    s = get_settings()
    backup_dir = s.backup_dir_path
    if not backup_dir.exists():
        return

    files = sorted(
        backup_dir.glob("*.backup"),
        key=lambda f: f.stat().st_mtime,
    )
    max_copies = s.BACKUP_MAX_LOCAL_COPIES
    if len(files) > max_copies:
        for f in files[: len(files) - max_copies]:
            try:
                f.unlink()
                logger.debug(f"已清理旧备份: {f.name}")
            except OSError as e:
                logger.warning(f"清理备份文件失败 [{f.name}]: {e}")


def _decrypt_backup_file(filepath: Path) -> Dict[str, Any]:
    """解密并解析备份文件，返回完整 envelope"""
    with open(filepath, "rb") as f:
        encrypted = f.read()
    plaintext = _get_fernet().decrypt(encrypted).decode("utf-8")
    return json.loads(plaintext)


def read_backup_metadata(filepath: Path) -> Optional[Dict[str, Any]]:
    """解密并读取备份文件的元数据部分"""
    try:
        envelope = _decrypt_backup_file(filepath)
        meta = envelope["meta"]
        meta["filename"] = filepath.name
        meta["file_size_bytes"] = filepath.stat().st_size
        meta["file_size_display"] = _format_file_size(filepath.stat().st_size)
        meta["encrypted"] = True
        return meta
    except Exception as e:
        logger.error(f"读取备份元数据失败 [{filepath.name}]: {e}")
        return None


def read_backup_full(filepath: Path) -> Optional[Dict[str, Any]]:
    """解密并读取完整备份数据"""
    try:
        envelope = _decrypt_backup_file(filepath)
        envelope["meta"]["filename"] = filepath.name
        return envelope
    except Exception as e:
        logger.error(f"读取备份数据失败 [{filepath.name}]: {e}")
        return None


def list_backups() -> List[Dict[str, Any]]:
    """列出所有本地备份文件的元数据"""
    s = get_settings()
    backup_dir = s.backup_dir_path
    if not backup_dir.exists():
        return []

    backups = []
    for filepath in sorted(
        backup_dir.glob("*.backup"),
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    ):
        meta = read_backup_metadata(filepath)
        if meta:
            backups.append(meta)

    return backups


def delete_backups(filenames: List[str]) -> int:
    """删除指定的备份文件，返回删除数量"""
    s = get_settings()
    backup_dir = s.backup_dir_path
    deleted = 0
    for name in filenames:
        filepath = backup_dir / name
        try:
            if filepath.exists() and filepath.suffix == ".backup":
                filepath.unlink()
                deleted += 1
                logger.info(f"已删除备份: {name}")
        except OSError as e:
            logger.warning(f"删除备份失败 [{name}]: {e}")
    return deleted


# ==================== 冲突检测 ====================

def _get_table_pk_columns(table: Table) -> List[str]:
    """获取表的主键列名列表"""
    return [col.name for col in table.columns if col.primary_key]


def _rows_equal(row_a: Dict[str, Any], row_b: Dict[str, Any]) -> bool:
    """比较两行数据是否完全相同（忽略类型差异）"""
    if set(row_a.keys()) != set(row_b.keys()):
        return False
    for key in row_a:
        if str(row_a.get(key)) != str(row_b.get(key)):
            return False
    return True


def _diff_fields(row_a: Dict[str, Any], row_b: Dict[str, Any]) -> List[str]:
    """返回两个字典中值不同的字段名列表"""
    diffs = []
    for key in row_a:
        if str(row_a.get(key)) != str(row_b.get(key, "")):
            diffs.append(key)
    return diffs


def detect_conflicts(
    db: Session,
    backup_data: Dict[str, Any]
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    检测备份数据与当前数据库之间的冲突

    逐表按主键比对：
    - "exists_different": 主键存在于双方，值不同 → 需要人工决策
    - "exists_identical": 主键存在于双方，值相同 → 无需处理（信息性）
    - "orphan_in_backup": 主键仅存在于备份 → 新数据，直接插入

    Returns:
        (conflicts_list, summary_dict)
    """
    s = get_settings()
    conflicts: List[Dict[str, Any]] = []
    by_table: Dict[str, int] = {}

    for table in Base.metadata.sorted_tables:
        name = table.name
        if name in EXCLUDED_TABLES or name not in backup_data:
            continue

        pk_cols = _get_table_pk_columns(table)
        if not pk_cols:
            continue

        backup_rows = backup_data.get(name, [])
        if not backup_rows:
            continue

        # 收集备份中的主键值
        backup_pks = set()
        for row in backup_rows:
            pk_tuple = tuple(row.get(col) for col in pk_cols)
            backup_pks.add(pk_tuple)

        # 构建当前数据库的主键值集合
        current_pks = set()
        current_rows = db.query(table).all()
        current_by_pk: Dict[tuple, Dict[str, Any]] = {}
        for row in current_rows:
            row_dict = {}
            for col in table.columns:
                value = getattr(row, col.key)
                row_dict[col.key] = value.isoformat() if isinstance(value, datetime) else value
            pk_tuple = tuple(row_dict.get(col) for col in pk_cols)
            current_pks.add(pk_tuple)
            current_by_pk[pk_tuple] = row_dict

        # 比对
        for row in backup_rows:
            pk_tuple = tuple(row.get(col) for col in pk_cols)

            if pk_tuple in current_pks:
                current_row = current_by_pk[pk_tuple]
                if not _rows_equal(row, current_row):
                    reason = "exists_different"
                    diffs = _diff_fields(row, current_row)
                    conflicts.append({
                        "table": name,
                        "pk_column": ", ".join(pk_cols),
                        "pk_value": ", ".join(str(pk_tuple[i]) for i in range(len(pk_cols))),
                        "reason": reason,
                        "current_data": current_row,
                        "backup_data": row,
                        "diff_fields": diffs,
                    })

        table_conflicts = sum(1 for c in conflicts if c["table"] == name)
        if table_conflicts > 0:
            by_table[name] = table_conflicts

    summary = {
        "total_conflicts": len(conflicts),
        "by_table": by_table,
        "conflicts": conflicts,
    }
    return conflicts, summary


# ==================== 恢复执行 ====================

def execute_restore(
    db: Session,
    backup_data: Dict[str, Any],
    resolutions: List[Dict[str, Any]],
    dry_run: bool = False,
) -> Dict[str, Any]:
    """
    执行数据恢复

    流程：
    1. 解析冲突解决策略（构建每行的 action map）
    2. 按 FK 正向顺序逐表处理
    3. 每行按策略执行：overwrite / skip / keep_both / insert
    4. dry_run=True 时仅预览不提交

    Args:
        db: 数据库会话
        backup_data: 解密后的完整备份数据（含 meta 和 data）
        resolutions: 用户选择的冲突解决方案列表
        dry_run: 是否为预览模式

    Returns:
        恢复结果汇总
    """
    s = get_settings()
    data = backup_data.get("data", backup_data)
    meta = backup_data.get("meta", {})

    # 构建 resolution map: key = "table|pk_column|pk_value"
    resolution_map: Dict[str, str] = {}
    for r in resolutions:
        key = f"{r['table']}|{r['pk_column']}|{r['pk_value']}"
        resolution_map[key] = r.get("action", "skip")

    summary = {"overwritten": 0, "skipped": 0, "inserted": 0, "errors": 0}
    details: List[Dict[str, Any]] = []

    if not dry_run:
        # 恢复期间禁用外键检查
        db.execute(text("PRAGMA foreign_keys=OFF"))

    try:
        for table in Base.metadata.sorted_tables:
            name = table.name
            if name in EXCLUDED_TABLES or name not in data:
                continue

            pk_cols = _get_table_pk_columns(table)
            backup_rows = data.get(name, [])
            if not backup_rows:
                continue

            for row in backup_rows:
                pk_values = [row.get(col) for col in pk_cols] if pk_cols else []
                pk_tuple = (
                    tuple(row.get(col) for col in pk_cols)
                    if pk_cols
                    else None
                )

                try:
                    # 查找当前数据库中是否存在该行
                    if pk_cols:
                        filters = [
                            getattr(table.c, col) == row.get(col)
                            for col in pk_cols
                        ]
                        from sqlalchemy import and_
                        existing = db.query(table).filter(and_(*filters)).first()
                    else:
                        existing = None

                    if existing is None:
                        # 新数据，直接插入
                        if not dry_run:
                            values = _dict_to_row_values(row, table)
                            db.execute(table.insert().values(**values))
                        summary["inserted"] += 1
                        details.append({
                            "table": name,
                            "action": "insert",
                            "pk_value": str(pk_values) if pk_values else "N/A",
                            "success": True,
                        })
                    else:
                        # 已存在，查找 resolution
                        pk_str = ", ".join(str(v) for v in pk_values) if pk_values else "N/A"
                        resolution_key = (
                            f"{name}|{', '.join(pk_cols)}|{pk_str}"
                            if pk_cols
                            else f"{name}||"
                        )
                        action = resolution_map.get(resolution_key, "skip")

                        if action == "overwrite":
                            if not dry_run:
                                values = _dict_to_row_values(row, table)
                                db.execute(
                                    table.update()
                                    .where(
                                        and_(*[
                                            getattr(table.c, col) == row.get(col)
                                            for col in pk_cols
                                        ])
                                    )
                                    .values(**values)
                                )
                            summary["overwritten"] += 1
                            details.append({
                                "table": name,
                                "action": "overwrite",
                                "pk_value": pk_str,
                                "success": True,
                            })
                        elif action == "skip":
                            summary["skipped"] += 1
                            details.append({
                                "table": name,
                                "action": "skip",
                                "pk_value": pk_str,
                                "success": True,
                            })
                        elif action == "keep_both":
                            if not dry_run:
                                # 生成新的主键值
                                new_row = dict(row)
                                for col in pk_cols:
                                    orig = new_row[col]
                                    if isinstance(orig, int):
                                        new_row[col] = orig + 100000
                                    elif isinstance(orig, str):
                                        new_row[col] = orig + "_restored"
                                values = _dict_to_row_values(new_row, table)
                                db.execute(table.insert().values(**values))
                            summary["inserted"] += 1
                            details.append({
                                "table": name,
                                "action": "keep_both",
                                "pk_value": pk_str,
                                "success": True,
                            })
                except Exception as e:
                    summary["errors"] += 1
                    details.append({
                        "table": name,
                        "action": "error",
                        "pk_value": str(pk_values) if pk_values else "N/A",
                        "success": False,
                        "message": str(e)[:200],
                    })
                    if not dry_run:
                        logger.error(f"恢复行失败 [{name}]: {e}")

        if not dry_run:
            db.commit()
            # 恢复外键检查
            db.execute(text("PRAGMA foreign_keys=ON"))
            _log_activity(db, "restore", "backup_restore", detail_data={
                "filename": meta.get("filename", ""),
                "dry_run": dry_run,
                "summary": {k: v for k, v in summary.items() if k != "errors"},
            })
        else:
            db.rollback()

    except Exception as e:
        logger.error(f"恢复执行失败: {e}")
        if not dry_run:
            db.rollback()
            try:
                db.execute(text("PRAGMA foreign_keys=ON"))
            except Exception:
                pass
        summary["errors"] += 1
        details.append({
            "table": "__global__",
            "action": "error",
            "pk_value": "N/A",
            "success": False,
            "message": str(e)[:500],
        })

    return {
        "dry_run": dry_run,
        "summary": summary,
        "details": details,
    }


# ==================== WebDAV 操作 ====================


def _get_webdav_base_url() -> Optional[str]:
    """获取 WebDAV 基础 URL"""
    s = get_settings()
    if not s.WEBDAV_ENABLED or not s.WEBDAV_URL:
        return None
    url = s.WEBDAV_URL.rstrip("/")
    path = s.WEBDAV_REMOTE_PATH.strip("/")
    return f"{url}/{path}"


async def _get_webdav_client() -> Optional[httpx.AsyncClient]:
    """创建 WebDAV HTTP 客户端（每次新建，免缓存）"""
    s = get_settings()
    if not s.WEBDAV_ENABLED:
        return None

    auth = None
    if s.WEBDAV_USERNAME and s.WEBDAV_PASSWORD:
        auth = httpx.BasicAuth(s.WEBDAV_USERNAME, s.WEBDAV_PASSWORD)

    # 每次创建新客户端，避免凭据/代理缓存问题
    # httpx 连接池会自动复用底层 TCP 连接
    client = httpx.AsyncClient(
        timeout=s.WEBDAV_TIMEOUT,
        auth=auth,
        follow_redirects=True,
        proxy=None,
        trust_env=False,
    )
    return client


async def test_webdav_connection() -> Dict[str, Any]:
    """测试 WebDAV 连接"""
    s = get_settings()
    if not s.WEBDAV_ENABLED:
        return {"success": False, "message": "WebDAV 未启用"}

    base_url = _get_webdav_base_url()
    if not base_url:
        return {"success": False, "message": "WebDAV URL 未配置"}

    try:
        client = await _get_webdav_client()
        if client is None:
            return {"success": False, "message": "无法创建 WebDAV 客户端"}

        resp = await client.request("PROPFIND", base_url, headers={"Depth": "0"})
        if resp.status_code in (207, 200, 301, 302):
            return {"success": True, "message": f"连接成功 (HTTP {resp.status_code})", "url": base_url}
        else:
            return {"success": False, "message": f"服务器返回异常状态: {resp.status_code}"}
    except httpx.TimeoutException:
        return {"success": False, "message": "连接超时"}
    except Exception as e:
        return {"success": False, "message": str(e)[:200]}


async def sync_to_webdav(filepath: Path) -> bool:
    """将备份文件上传到 WebDAV"""
    s = get_settings()
    if not s.WEBDAV_ENABLED:
        return False

    base_url = _get_webdav_base_url()
    if not base_url:
        return False

    try:
        client = await _get_webdav_client()
        if client is None:
            return False

        remote_url = f"{base_url}/{filepath.name}"
        with open(filepath, "rb") as f:
            content = f.read()

        resp = await client.put(remote_url, content=content)
        if resp.status_code in (200, 201, 204):
            logger.info(f"已同步到 WebDAV: {filepath.name}")
            return True
        else:
            logger.warning(f"WebDAV 同步失败 [{filepath.name}]: HTTP {resp.status_code}")
            return False
    except Exception as e:
        logger.error(f"WebDAV 同步异常 [{filepath.name}]: {e}")
        return False


async def sync_from_webdav(filename: str, local_path: Path) -> bool:
    """从 WebDAV 下载备份文件"""
    s = get_settings()
    if not s.WEBDAV_ENABLED:
        return False

    base_url = _get_webdav_base_url()
    if not base_url:
        return False

    try:
        client = await _get_webdav_client()
        if client is None:
            return False

        remote_url = f"{base_url}/{filename}"
        resp = await client.get(remote_url)
        if resp.status_code == 200:
            local_path.parent.mkdir(parents=True, exist_ok=True)
            with open(local_path, "wb") as f:
                f.write(resp.content)
            logger.info(f"已从 WebDAV 下载: {filename}")
            return True
        else:
            logger.warning(f"WebDAV 下载失败 [{filename}]: HTTP {resp.status_code}")
            return False
    except Exception as e:
        logger.error(f"WebDAV 下载异常 [{filename}]: {e}")
        return False


async def list_webdav_backups() -> List[Dict[str, Any]]:
    """列出 WebDAV 远程备份文件"""
    s = get_settings()
    if not s.WEBDAV_ENABLED:
        return []

    base_url = _get_webdav_base_url()
    if not base_url:
        return []

    try:
        client = await _get_webdav_client()
        if client is None:
            return []

        resp = await client.request("PROPFIND", base_url, headers={"Depth": "1"})
        if resp.status_code not in (207, 200):
            return []

        # 简单解析 XML 响应提取文件名和大小
        from xml.etree import ElementTree as ET
        root = ET.fromstring(resp.text)

        ns = {"d": "DAV:"}
        files = []
        for response in root.findall("d:response", ns):
            href = response.findtext("d:href", "", ns)
            if not href:
                continue
            name = href.rstrip("/").split("/")[-1]
            if not name.endswith(".backup"):
                continue

            propstat = response.find("d:propstat", ns)
            size_str = ""
            if propstat is not None:
                prop = propstat.find("d:prop", ns)
                if prop is not None:
                    size_elem = prop.find("d:getcontentlength", ns)
                    if size_elem is not None and size_elem.text:
                        size_str = size_elem.text

            files.append({
                "filename": name,
                "file_size_bytes": int(size_str) if size_str.isdigit() else 0,
                "file_size_display": _format_file_size(int(size_str)) if size_str.isdigit() else "未知",
            })

        return files
    except Exception as e:
        logger.warning(f"列出 WebDAV 文件失败: {e}")
        return []


async def delete_webdav_backup(filename: str) -> bool:
    """从 WebDAV 删除备份文件"""
    s = get_settings()
    if not s.WEBDAV_ENABLED:
        return False

    base_url = _get_webdav_base_url()
    if not base_url:
        return False

    try:
        client = await _get_webdav_client()
        if client is None:
            return False

        remote_url = f"{base_url}/{filename}"
        resp = await client.delete(remote_url)
        return resp.status_code in (200, 204, 404)
    except Exception as e:
        logger.error(f"WebDAV 删除失败 [{filename}]: {e}")
        return False


# ==================== 活动日志 ====================

def _log_activity(db: Session, action: str, entity_type: str, detail_data: Dict[str, Any] = None) -> None:
    """记录操作活动日志"""
    try:
        log = ActivityLog(
            action=action,
            entity_type=entity_type,
            detail=json.dumps(detail_data, ensure_ascii=False, default=str) if detail_data else None,
        )
        db.add(log)
        db.commit()
    except Exception as e:
        logger.warning(f"活动日志记录失败: {e}")


# ==================== 自动备份 ====================

_last_backup_info: Dict[str, Any] = {
    "last_backup_at": None,
    "last_backup_success": False,
    "webdav_last_sync_at": None,
}


def get_auto_backup_status() -> Dict[str, Any]:
    """获取自动备份状态"""
    s = get_settings()
    next_at = None
    if _last_backup_info["last_backup_at"] and s.BACKUP_AUTO_ENABLED:
        try:
            last = datetime.fromisoformat(_last_backup_info["last_backup_at"])
            next_at = (last + timedelta(hours=s.BACKUP_AUTO_INTERVAL_HOURS)).isoformat()
        except (ValueError, TypeError):
            pass

    return {
        "enabled": s.BACKUP_AUTO_ENABLED,
        "interval_hours": s.BACKUP_AUTO_INTERVAL_HOURS,
        "max_local_copies": s.BACKUP_MAX_LOCAL_COPIES,
        "last_backup_at": _last_backup_info["last_backup_at"],
        "last_backup_success": _last_backup_info["last_backup_success"],
        "next_backup_at": next_at,
        "webdav_sync_enabled": s.WEBDAV_ENABLED,
        "webdav_last_sync_at": _last_backup_info["webdav_last_sync_at"],
        "local_backup_count": len(list_backups()),
    }


async def run_scheduled_backup() -> Optional[Path]:
    """
    执行一次定时备份

    流程：
    1. 创建备份
    2. 如果 WebDAV 已启用，同步到云端
    """
    s = get_settings()
    global _last_backup_info

    now = datetime.now(timezone.utc).isoformat()
    _last_backup_info["last_backup_at"] = now

    try:
        with get_db_context() as db:
            filepath = create_backup(db)

        if filepath:
            _last_backup_info["last_backup_success"] = True

            if s.WEBDAV_ENABLED:
                try:
                    ok = await sync_to_webdav(filepath)
                    if ok:
                        _last_backup_info["webdav_last_sync_at"] = now
                except Exception as e:
                    logger.warning(f"自动备份 WebDAV 同步失败: {e}")

            return filepath
        else:
            _last_backup_info["last_backup_success"] = False
            return None
    except Exception as e:
        logger.error(f"定时备份失败: {e}")
        _last_backup_info["last_backup_success"] = False
        return None
