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

数据库兼容性：
- 外键约束控制根据方言自动选择语法（SQLite / PostgreSQL / MySQL）
- 数据查询统一使用 SQLAlchemy Core 风格（select + mappings），兼容所有方言
"""

import json
import hashlib
import os
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

import httpx
from loguru import logger
from sqlalchemy import inspect, text, Table, select, and_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import Base, get_db_context
from app.models.models import ActivityLog


# ==================== 常量 ====================

BACKUP_VERSION = "1.0.0"

# 恢复时需要排除的表（SQLite 系统表、Alembic 迁移表等）
EXCLUDED_TABLES = {"alembic_version"}

# 序列化时需要转换的列类型后缀
DATETIME_TYPE_SUFFIXES = ("DATETIME", "TIMESTAMP")


# ==================== 数据库方言工具 ====================

def _get_dialect(db: Session) -> str:
    """
    获取当前数据库方言名称。

    Returns:
        "sqlite" / "postgresql" / "mysql" 等小写字符串。
    """
    return db.bind.dialect.name


def _disable_fk_constraints(db: Session) -> None:
    """
    根据数据库方言临时禁用外键约束。

    - SQLite    : PRAGMA foreign_keys = OFF
    - PostgreSQL: SET session_replication_role = 'replica'
    - MySQL     : SET FOREIGN_KEY_CHECKS = 0
    """
    dialect = _get_dialect(db)
    if dialect == "sqlite":
        db.execute(text("PRAGMA foreign_keys = OFF"))
    elif dialect == "postgresql":
        db.execute(text("SET session_replication_role = 'replica'"))
    elif dialect in ("mysql", "mariadb"):
        db.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
    else:
        logger.warning(f"未知数据库方言 '{dialect}'，跳过外键约束禁用")


def _enable_fk_constraints(db: Session) -> None:
    """
    根据数据库方言重新启用外键约束。

    - SQLite    : PRAGMA foreign_keys = ON
    - PostgreSQL: SET session_replication_role = 'origin'
    - MySQL     : SET FOREIGN_KEY_CHECKS = 1
    """
    dialect = _get_dialect(db)
    if dialect == "sqlite":
        db.execute(text("PRAGMA foreign_keys = ON"))
    elif dialect == "postgresql":
        db.execute(text("SET session_replication_role = 'origin'"))
    elif dialect in ("mysql", "mariadb"):
        db.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
    else:
        logger.warning(f"未知数据库方言 '{dialect}'，跳过外键约束启用")


@contextmanager
def _fk_constraints_disabled(db: Session):
    """
    上下文管理器：进入时禁用外键约束，退出时恢复（无论是否异常）。

    Usage:
        with _fk_constraints_disabled(db):
            # 批量插入操作
    """
    _disable_fk_constraints(db)
    try:
        yield
    finally:
        try:
            _enable_fk_constraints(db)
        except Exception as e:
            logger.warning(f"恢复外键约束失败（已忽略）: {e}")


# ==================== 加密工具 ====================

def _get_fernet():
    """获取 Fernet 加密实例（由 Settings 统一管理密钥派生）"""
    return get_settings().fernet


# ==================== 数据序列化工具 ====================

def _normalize_for_compare(value: Any) -> str:
    """
    将任意值规范化为可比较的字符串。

    统一处理 None，避免 str(None)="None" 与字符串 "None" 误判相等。

    Args:
        value: 任意数据库字段值。

    Returns:
        规范化字符串；None 统一映射为 "__NULL__"。
    """
    if value is None:
        return "__NULL__"
    return str(value)


def _serialize_value(value: Any) -> Any:
    """
    将单个字段值序列化为 JSON 兼容格式。

    - datetime → ISO 格式字符串
    - 其他     → 原样返回

    Args:
        value: 原始字段值。

    Returns:
        JSON 可序列化的值。
    """
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _deserialize_value(value: Any, col: Any) -> Any:
    """
    将 JSON 字符串值还原为数据库期望的 Python 类型。

    - DATETIME/TIMESTAMP 列的字符串值 → datetime 对象
    - 其他列 → 原样返回

    Args:
        value: JSON 中读取的原始值。
        col: SQLAlchemy Column 对象。

    Returns:
        还原后的值。
    """
    col_type = str(col.type).upper()
    if any(suffix in col_type for suffix in DATETIME_TYPE_SUFFIXES):
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value)
            except (ValueError, TypeError):
                return value
    return value


def _row_mapping_to_dict(row_mapping: Any, table: Table) -> Dict[str, Any]:
    """
    将 SQLAlchemy RowMapping 转为纯字典，datetime 序列化为 ISO 字符串。

    Args:
        row_mapping: db.execute(select(table)).mappings() 返回的单行。
        table: 对应的 Table 对象。

    Returns:
        字段名 → 序列化值 的字典。
    """
    return {
        col.name: _serialize_value(row_mapping[col.name])
        for col in table.columns
        if col.name in row_mapping
    }


def _dict_to_row_values(data: Dict[str, Any], table: Table) -> Dict[str, Any]:
    """
    将备份字典中的值还原为数据库插入所需的 Python 类型。

    Args:
        data: 备份文件中单行的字典。
        table: 目标 Table 对象。

    Returns:
        字段名 → 还原值 的字典（仅包含 table 中存在的列）。
    """
    return {
        col.name: _deserialize_value(data[col.name], col)
        for col in table.columns
        if col.name in data
    }


def _format_file_size(size_bytes: int) -> str:
    """
    将字节数转为人类可读格式。

    Args:
        size_bytes: 文件字节数。

    Returns:
        如 "1.2 MB"、"345.6 KB"、"512 B"。
    """
    if size_bytes < 1024:
        return f"{size_bytes} B"
    if size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    return f"{size_bytes / (1024 * 1024):.1f} MB"


# ==================== 数据导出 ====================

def export_all_tables(db: Session) -> Dict[str, List[Dict[str, Any]]]:
    """
    导出全部数据表为纯字典列表。

    按 Base.metadata.sorted_tables 的反向顺序导出（先子后父），
    确保恢复时父记录先于子记录插入。

    使用 SQLAlchemy Core 风格查询（select + mappings），
    兼容 SQLite / PostgreSQL / MySQL 全部方言。

    Args:
        db: SQLAlchemy Session。

    Returns:
        {"table_name": [{row_dict}, ...], ...}
    """
    tables = list(reversed(Base.metadata.sorted_tables))
    result: Dict[str, List[Dict[str, Any]]] = {}

    for table in tables:
        name = table.name
        if name in EXCLUDED_TABLES:
            continue
        try:
            rows = db.execute(select(table)).mappings().all()
            result[name] = [_row_mapping_to_dict(row, table) for row in rows]
        except Exception as e:
            logger.warning(f"导出表 {name} 时出错: {e}")
            result[name] = []

    return result


# ==================== 备份文件操作 ====================

def _compute_checksum(data: Dict[str, Any]) -> str:
    """
    计算数据字典的 SHA-256 校验和。

    使用 sort_keys=True 保证相同数据的校验和一致。

    Args:
        data: 待校验的字典（通常为导出的全部表数据）。

    Returns:
        64 位十六进制 SHA-256 字符串。
    """
    raw = json.dumps(data, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def create_backup(db: Session) -> Optional[Path]:
    """
    创建加密全量备份文件。

    流程：
    1. 导出全部表数据
    2. 构建备份信封 {meta, data}，meta 含 SHA-256 校验和
    3. JSON 序列化 → Fernet 加密
    4. 写入 backup_{timestamp}.backup 文件
    5. 清理超出 BACKUP_MAX_LOCAL_COPIES 的旧文件
    6. 记录活动日志

    Args:
        db: SQLAlchemy Session。

    Returns:
        备份文件 Path，失败返回 None。
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

        filepath.write_bytes(encrypted)

        file_size = filepath.stat().st_size
        total_rows = sum(table_counts.values())

        logger.info(
            f"备份已创建: {filename} | "
            f"大小: {_format_file_size(file_size)} | "
            f"表数: {len(table_counts)} | 总行数: {total_rows}"
        )

        # 5. 清理旧备份（先清理，再记录日志，顺序与注释一致）
        _enforce_max_backups()

        # 6. 记录活动日志（使用独立 Session，不影响调用方事务）
        _log_activity(
            action="backup",
            entity_type="backup_file",
            detail_data={
                "filename": filename,
                "file_size": file_size,
                "table_counts": table_counts,
                "total_rows": total_rows,
            },
        )

        return filepath

    except Exception as e:
        logger.error(f"创建备份失败: {e}")
        return None


def _enforce_max_backups() -> None:
    """
    清理超出数量限制的旧备份文件。

    按文件修改时间升序排列，删除最旧的若干个，
    保留最新的 BACKUP_MAX_LOCAL_COPIES 个。
    """
    s = get_settings()
    backup_dir = s.backup_dir_path
    if not backup_dir.exists():
        return

    files = sorted(
        backup_dir.glob("*.backup"),
        key=lambda f: f.stat().st_mtime,
    )
    max_copies = s.BACKUP_MAX_LOCAL_COPIES
    excess = len(files) - max_copies
    if excess > 0:
        for f in files[:excess]:
            try:
                f.unlink()
                logger.debug(f"已清理旧备份: {f.name}")
            except OSError as e:
                logger.warning(f"清理备份文件失败 [{f.name}]: {e}")


def _decrypt_backup_file(filepath: Path) -> Dict[str, Any]:
    """
    解密并解析备份文件，返回完整 envelope。

    Args:
        filepath: .backup 文件路径。

    Returns:
        {"meta": {...}, "data": {...}} 字典。

    Raises:
        cryptography.fernet.InvalidToken: 文件损坏或密钥不匹配。
        json.JSONDecodeError: 解密后内容非合法 JSON。
    """
    encrypted = filepath.read_bytes()
    plaintext = _get_fernet().decrypt(encrypted).decode("utf-8")
    return json.loads(plaintext)


def read_backup_metadata(filepath: Path) -> Optional[Dict[str, Any]]:
    """
    解密并读取备份文件的元数据部分（不加载完整数据）。

    Args:
        filepath: .backup 文件路径。

    Returns:
        元数据字典（含 filename、file_size_bytes、file_size_display、encrypted），
        失败返回 None。
    """
    try:
        envelope = _decrypt_backup_file(filepath)
        meta = envelope["meta"]
        file_size = filepath.stat().st_size
        meta.update({
            "filename": filepath.name,
            "file_size_bytes": file_size,
            "file_size_display": _format_file_size(file_size),
            "encrypted": True,
        })
        return meta
    except Exception as e:
        logger.error(f"读取备份元数据失败 [{filepath.name}]: {e}")
        return None


def read_backup_full(filepath: Path) -> Optional[Dict[str, Any]]:
    """
    解密并读取完整备份数据（含 meta 和 data）。

    Args:
        filepath: .backup 文件路径。

    Returns:
        完整 envelope 字典，失败返回 None。
    """
    try:
        envelope = _decrypt_backup_file(filepath)
        envelope["meta"]["filename"] = filepath.name
        return envelope
    except Exception as e:
        logger.error(f"读取备份数据失败 [{filepath.name}]: {e}")
        return None


def list_backups() -> List[Dict[str, Any]]:
    """
    列出所有本地备份文件的元数据，按修改时间降序排列。

    Returns:
        元数据字典列表，解密失败的文件静默跳过。
    """
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
    """
    删除指定的本地备份文件。

    安全校验：
    - 路径穿越检查：解析后路径必须位于 backup_dir 内
    - 扩展名检查：仅允许删除 .backup 文件

    Args:
        filenames: 文件名列表（不含路径，仅文件名）。

    Returns:
        实际删除的文件数量。
    """
    backup_dir = get_settings().backup_dir_path.resolve()
    deleted = 0

    for name in filenames:
        # 路径穿越防御：解析绝对路径后校验是否在 backup_dir 内
        filepath = (backup_dir / name).resolve()
        if not str(filepath).startswith(str(backup_dir) + os.sep):
            logger.warning(f"拒绝删除目录外文件（路径穿越尝试）: {name}")
            continue
        try:
            if filepath.exists() and filepath.suffix == ".backup":
                filepath.unlink()
                deleted += 1
                logger.info(f"已删除备份: {name}")
            elif filepath.suffix != ".backup":
                logger.warning(f"拒绝删除非备份文件: {name}")
        except OSError as e:
            logger.warning(f"删除备份失败 [{name}]: {e}")

    return deleted


# ==================== 冲突检测 ====================

def _get_table_pk_columns(table: Table) -> List[str]:
    """
    获取表的主键列名列表。

    Args:
        table: SQLAlchemy Table 对象。

    Returns:
        主键列名列表，复合主键时包含多个元素。
    """
    return [col.name for col in table.columns if col.primary_key]


def _rows_equal(row_a: Dict[str, Any], row_b: Dict[str, Any]) -> bool:
    """
    比较两行数据是否完全相同。

    使用 _normalize_for_compare 统一 None 处理，
    避免 str(None)="None" 与字符串 "None" 的误判。

    Args:
        row_a: 备份中的行数据。
        row_b: 数据库中的行数据。

    Returns:
        True 表示两行完全相同。
    """
    if set(row_a.keys()) != set(row_b.keys()):
        return False
    return all(
        _normalize_for_compare(row_a.get(k)) == _normalize_for_compare(row_b.get(k))
        for k in row_a
    )


def _diff_fields(row_a: Dict[str, Any], row_b: Dict[str, Any]) -> List[str]:
    """
    返回两个字典中值不同的字段名列表。

    使用 _normalize_for_compare 统一 None 处理。

    Args:
        row_a: 备份中的行数据。
        row_b: 数据库中的行数据（参照）。

    Returns:
        值不同的字段名列表。
    """
    return [
        key for key in row_a
        if _normalize_for_compare(row_a.get(key)) != _normalize_for_compare(row_b.get(key, None))
    ]


def detect_conflicts(
    db: Session,
    backup_data: Dict[str, Any],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    检测备份数据与当前数据库之间的冲突。

    逐表按主键比对：
    - exists_different : 主键双方均有，值不同 → 需要人工决策
    - exists_identical : 主键双方均有，值相同 → 无需处理
    - orphan_in_backup : 主键仅存在于备份  → 新数据，恢复时直接插入

    使用 Core 风格查询（select + mappings）兼容所有数据库方言。

    Args:
        db: SQLAlchemy Session（只读）。
        backup_data: read_backup_full 返回的完整 envelope 或仅 data 部分。

    Returns:
        (conflicts_list, summary_dict)
        conflicts_list: 需要人工决策的冲突行列表
        summary_dict  : 包含 total_conflicts、by_table、conflicts 的汇总
    """
    data = backup_data.get("data", backup_data)
    conflicts: List[Dict[str, Any]] = []
    by_table: Dict[str, int] = {}

    for table in Base.metadata.sorted_tables:
        name = table.name
        if name in EXCLUDED_TABLES or name not in data:
            continue

        pk_cols = _get_table_pk_columns(table)
        if not pk_cols:
            continue

        backup_rows: List[Dict[str, Any]] = data.get(name, [])
        if not backup_rows:
            continue

        # 构建当前数据库的主键 → 行数据映射（Core 风格查询）
        current_rows = db.execute(select(table)).mappings().all()
        current_by_pk: Dict[tuple, Dict[str, Any]] = {}
        for row in current_rows:
            row_dict = _row_mapping_to_dict(row, table)
            pk_tuple = tuple(row_dict.get(col) for col in pk_cols)
            current_by_pk[pk_tuple] = row_dict

        table_conflict_count = 0
        for row in backup_rows:
            pk_tuple = tuple(row.get(col) for col in pk_cols)
            if pk_tuple not in current_by_pk:
                continue  # orphan_in_backup，恢复时直接插入，无需记录为冲突
            current_row = current_by_pk[pk_tuple]
            if not _rows_equal(row, current_row):
                conflicts.append({
                    "table": name,
                    "pk_column": ", ".join(pk_cols),
                    "pk_value": ", ".join(
                        str(pk_tuple[i]) for i in range(len(pk_cols))
                    ),
                    "reason": "exists_different",
                    "current_data": current_row,
                    "backup_data": row,
                    "diff_fields": _diff_fields(row, current_row),
                })
                table_conflict_count += 1

        if table_conflict_count > 0:
            by_table[name] = table_conflict_count

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
    执行数据恢复。

    流程：
    1. 解析冲突解决策略，构建 resolution_map
    2. 禁用外键约束（通过上下文管理器，确保恢复）
    3. 按 FK 正向顺序（先父后子）逐表处理每一行
    4. 每行按策略执行：insert / overwrite / skip
    5. dry_run=True 时回滚所有变更，仅返回预览结果

    冲突解决策略：
    - "overwrite" : 用备份数据覆盖现有记录
    - "skip"      : 保留现有记录，跳过备份数据（默认）
    - "keep_both" : 仅对有自增整型主键的表支持；否则回退为 skip

    注意：keep_both 通过省略主键、让数据库自动分配新 ID 实现，
    仅适用于单列自增整型主键的表。复合主键或非整型主键的表将回退为 skip。

    Args:
        db: SQLAlchemy Session。
        backup_data: read_backup_full 返回的完整 envelope。
        resolutions: 用户选择的冲突解决方案列表，每项格式：
                     {"table": str, "pk_column": str, "pk_value": str, "action": str}
        dry_run: True 时执行预览，不提交任何变更。

    Returns:
        {"dry_run": bool, "summary": {...}, "details": [...]}
    """
    data = backup_data.get("data", backup_data)
    meta = backup_data.get("meta", {})

    # 构建 resolution_map: "table|pk_column|pk_value" → action
    resolution_map: Dict[str, str] = {
        f"{r['table']}|{r['pk_column']}|{r['pk_value']}": r.get("action", "skip")
        for r in resolutions
    }

    summary = {"overwritten": 0, "skipped": 0, "inserted": 0, "errors": 0}
    details: List[Dict[str, Any]] = []

    try:
        cm = _fk_constraints_disabled(db) if not dry_run else _noop_context()
        with cm:
            for table in Base.metadata.sorted_tables:
                name = table.name
                if name in EXCLUDED_TABLES or name not in data:
                    continue

                pk_cols = _get_table_pk_columns(table)
                backup_rows: List[Dict[str, Any]] = data.get(name, [])
                if not backup_rows:
                    continue

                for row in backup_rows:
                    pk_values = [row.get(col) for col in pk_cols] if pk_cols else []
                    pk_str = (
                        ", ".join(str(v) for v in pk_values) if pk_values else "N/A"
                    )

                    try:
                        # 查询当前记录是否存在（Core 风格）
                        existing = None
                        if pk_cols:
                            filters = [
                                table.c[col] == row.get(col) for col in pk_cols
                            ]
                            result = db.execute(
                                select(table).where(and_(*filters))
                            ).mappings().first()
                            existing = result

                        if existing is None:
                            # 新数据：直接插入
                            if not dry_run:
                                values = _dict_to_row_values(row, table)
                                db.execute(table.insert().values(**values))
                            summary["inserted"] += 1
                            details.append({
                                "table": name,
                                "action": "insert",
                                "pk_value": pk_str,
                                "success": True,
                            })

                        else:
                            # 已存在：按 resolution 决策
                            resolution_key = (
                                f"{name}|{', '.join(pk_cols)}|{pk_str}"
                                if pk_cols else f"{name}||"
                            )
                            action = resolution_map.get(resolution_key, "skip")

                            if action == "overwrite":
                                if not dry_run:
                                    values = _dict_to_row_values(row, table)
                                    db.execute(
                                        table.update()
                                        .where(and_(*[
                                            table.c[col] == row.get(col)
                                            for col in pk_cols
                                        ]))
                                        .values(**values)
                                    )
                                summary["overwritten"] += 1
                                details.append({
                                    "table": name,
                                    "action": "overwrite",
                                    "pk_value": pk_str,
                                    "success": True,
                                })

                            elif action == "keep_both":
                                # keep_both 仅支持单列自增整型主键
                                # 省略主键字段，让数据库自动分配新 ID
                                can_keep_both = (
                                    len(pk_cols) == 1
                                    and isinstance(row.get(pk_cols[0]), int)
                                )
                                if can_keep_both:
                                    if not dry_run:
                                        new_row = {
                                            k: v for k, v in row.items()
                                            if k not in pk_cols
                                        }
                                        values = _dict_to_row_values(new_row, table)
                                        db.execute(table.insert().values(**values))
                                    summary["inserted"] += 1
                                    details.append({
                                        "table": name,
                                        "action": "keep_both",
                                        "pk_value": pk_str,
                                        "success": True,
                                    })
                                else:
                                    # 不支持 keep_both，回退为 skip
                                    logger.warning(
                                        f"表 {name} 不支持 keep_both（复合主键或非整型主键），"
                                        f"已回退为 skip: pk={pk_str}"
                                    )
                                    summary["skipped"] += 1
                                    details.append({
                                        "table": name,
                                        "action": "skip",
                                        "pk_value": pk_str,
                                        "success": True,
                                        "message": "keep_both 不支持，已回退为 skip",
                                    })

                            else:  # skip（默认）
                                summary["skipped"] += 1
                                details.append({
                                    "table": name,
                                    "action": "skip",
                                    "pk_value": pk_str,
                                    "success": True,
                                })

                    except SQLAlchemyError as row_err:
                        summary["errors"] += 1
                        details.append({
                            "table": name,
                            "action": "error",
                            "pk_value": pk_str,
                            "success": False,
                            "message": str(row_err)[:200],
                        })
                        logger.error(f"恢复行失败 [{name}] pk={pk_str}: {row_err}")

        if dry_run:
            db.rollback()
        else:
            db.commit()
            _log_activity(
                action="restore",
                entity_type="backup_restore",
                detail_data={
                    "filename": meta.get("filename", ""),
                    "dry_run": False,
                    "summary": {k: v for k, v in summary.items() if k != "errors"},
                },
            )

    except Exception as e:
        logger.error(f"恢复执行失败: {e}")
        try:
            db.rollback()
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


@contextmanager
def _noop_context():
    """无操作上下文管理器，用于 dry_run 模式替代 _fk_constraints_disabled。"""
    yield


# ==================== WebDAV 操作 ====================

def _get_webdav_base_url() -> Optional[str]:
    """
    获取 WebDAV 基础 URL（含远程路径）。

    Returns:
        完整的 WebDAV 目录 URL，未配置时返回 None。
    """
    s = get_settings()
    if not s.WEBDAV_ENABLED or not s.WEBDAV_URL:
        return None
    url = s.WEBDAV_URL.rstrip("/")
    path = s.WEBDAV_REMOTE_PATH.strip("/")
    return f"{url}/{path}"


def _build_webdav_client() -> httpx.AsyncClient:
    """
    构建 WebDAV HTTP 客户端。

    每次调用返回新实例，调用方必须通过异步上下文管理器管理生命周期：
        async with _build_webdav_client() as client:
            ...

    Returns:
        httpx.AsyncClient 实例（未启动，需通过 async with 使用）。
    """
    s = get_settings()
    auth = None
    if s.WEBDAV_USERNAME and s.WEBDAV_PASSWORD:
        auth = httpx.BasicAuth(s.WEBDAV_USERNAME, s.WEBDAV_PASSWORD)

    return httpx.AsyncClient(
        timeout=s.WEBDAV_TIMEOUT,
        auth=auth,
        follow_redirects=True,
        trust_env=False,
    )


async def test_webdav_connection() -> Dict[str, Any]:
    """
    测试 WebDAV 连接可用性。

    发送 PROPFIND 请求到远程目录，验证认证和连通性。

    Returns:
        {"success": bool, "message": str, "url": str（成功时）}
    """
    s = get_settings()
    if not s.WEBDAV_ENABLED:
        return {"success": False, "message": "WebDAV 未启用"}

    base_url = _get_webdav_base_url()
    if not base_url:
        return {"success": False, "message": "WebDAV URL 未配置"}

    try:
        async with _build_webdav_client() as client:
            resp = await client.request(
                "PROPFIND", base_url, headers={"Depth": "0"}
            )
        if resp.status_code in (207, 200, 301, 302):
            return {
                "success": True,
                "message": f"连接成功 (HTTP {resp.status_code})",
                "url": base_url,
            }
        return {
            "success": False,
            "message": f"服务器返回异常状态: {resp.status_code}",
        }
    except httpx.TimeoutException:
        return {"success": False, "message": "连接超时"}
    except Exception as e:
        return {"success": False, "message": str(e)[:200]}


async def sync_to_webdav(filepath: Path) -> bool:
    """
    将本地备份文件上传到 WebDAV 远程目录。

    Args:
        filepath: 本地 .backup 文件路径。

    Returns:
        True 表示上传成功。
    """
    s = get_settings()
    if not s.WEBDAV_ENABLED:
        return False

    base_url = _get_webdav_base_url()
    if not base_url:
        return False

    try:
        content = filepath.read_bytes()
        remote_url = f"{base_url}/{filepath.name}"
        async with _build_webdav_client() as client:
            resp = await client.put(remote_url, content=content)
        if resp.status_code in (200, 201, 204):
            logger.info(f"已同步到 WebDAV: {filepath.name}")
            return True
        logger.warning(
            f"WebDAV 同步失败 [{filepath.name}]: HTTP {resp.status_code}"
        )
        return False
    except Exception as e:
        logger.error(f"WebDAV 同步异常 [{filepath.name}]: {e}")
        return False


async def sync_from_webdav(filename: str, local_path: Path) -> bool:
    """
    从 WebDAV 远程目录下载备份文件到本地。

    Args:
        filename: 远程文件名（不含路径）。
        local_path: 本地保存路径。

    Returns:
        True 表示下载成功。
    """
    s = get_settings()
    if not s.WEBDAV_ENABLED:
        return False

    base_url = _get_webdav_base_url()
    if not base_url:
        return False

    try:
        remote_url = f"{base_url}/{filename}"
        async with _build_webdav_client() as client:
            resp = await client.get(remote_url)
        if resp.status_code == 200:
            local_path.parent.mkdir(parents=True, exist_ok=True)
            local_path.write_bytes(resp.content)
            logger.info(f"已从 WebDAV 下载: {filename}")
            return True
        logger.warning(
            f"WebDAV 下载失败 [{filename}]: HTTP {resp.status_code}"
        )
        return False
    except Exception as e:
        logger.error(f"WebDAV 下载异常 [{filename}]: {e}")
        return False


async def list_webdav_backups() -> List[Dict[str, Any]]:
    """
    列出 WebDAV 远程目录中的所有备份文件。

    通过 PROPFIND 请求获取目录列表，解析 WebDAV XML 响应。

    Returns:
        文件信息列表，每项含 filename、file_size_bytes、file_size_display。
        连接失败或未启用时返回空列表。
    """
    from xml.etree import ElementTree as ET

    s = get_settings()
    if not s.WEBDAV_ENABLED:
        return []

    base_url = _get_webdav_base_url()
    if not base_url:
        return []

    try:
        async with _build_webdav_client() as client:
            resp = await client.request(
                "PROPFIND", base_url, headers={"Depth": "1"}
            )
        if resp.status_code not in (207, 200):
            return []

        ns = {"d": "DAV:"}
        root = ET.fromstring(resp.text)
        files = []

        for response in root.findall("d:response", ns):
            href = response.findtext("d:href", "", ns)
            if not href:
                continue
            name = href.rstrip("/").split("/")[-1]
            if not name.endswith(".backup"):
                continue

            size_str = ""
            propstat = response.find("d:propstat", ns)
            if propstat is not None:
                prop = propstat.find("d:prop", ns)
                if prop is not None:
                    size_elem = prop.find("d:getcontentlength", ns)
                    if size_elem is not None and size_elem.text:
                        size_str = size_elem.text

            size_bytes = int(size_str) if size_str.isdigit() else 0
            files.append({
                "filename": name,
                "file_size_bytes": size_bytes,
                "file_size_display": (
                    _format_file_size(size_bytes) if size_bytes else "未知"
                ),
            })

        return files

    except Exception as e:
        logger.warning(f"列出 WebDAV 文件失败: {e}")
        return []


async def delete_webdav_backup(filename: str) -> bool:
    """
    从 WebDAV 远程目录删除指定备份文件。

    Args:
        filename: 要删除的文件名（不含路径）。

    Returns:
        True 表示删除成功（含文件不存在的 404 情况）。
    """
    s = get_settings()
    if not s.WEBDAV_ENABLED:
        return False

    base_url = _get_webdav_base_url()
    if not base_url:
        return False

    try:
        remote_url = f"{base_url}/{filename}"
        async with _build_webdav_client() as client:
            resp = await client.delete(remote_url)
        return resp.status_code in (200, 204, 404)
    except Exception as e:
        logger.error(f"WebDAV 删除失败 [{filename}]: {e}")
        return False


# ==================== 活动日志 ====================

def _log_activity(
    action: str,
    entity_type: str,
    detail_data: Optional[Dict[str, Any]] = None,
) -> None:
    """
    记录操作活动日志。

    使用独立的数据库 Session（get_db_context），与调用方事务完全隔离，
    避免在调用方事务中途强行 commit 破坏事务边界。

    异常时仅记录警告，不向上抛出，不影响主业务流程。

    Args:
        action: 操作类型，如 "backup"、"restore"。
        entity_type: 实体类型，如 "backup_file"、"backup_restore"。
        detail_data: 附加详情字典，可选。
    """
    try:
        with get_db_context() as log_db:
            log = ActivityLog(
                action=action,
                entity_type=entity_type,
                detail=json.dumps(detail_data, ensure_ascii=False, default=str)
                if detail_data
                else None,
            )
            log_db.add(log)
    except Exception as e:
        logger.warning(f"活动日志记录失败（已忽略）: {e}")


# ==================== 自动备份状态 ====================

# 进程级内存状态，仅用于单 worker 场景。
# 多 worker 部署时各进程状态独立，应改为持久化到数据库或配置文件。
_last_backup_info: Dict[str, Any] = {
    "last_backup_at": None,
    "last_backup_success": False,
    "webdav_last_sync_at": None,
}


def get_auto_backup_status() -> Dict[str, Any]:
    """
    获取自动备份的当前状态。

    基于 last_backup_at 和 BACKUP_AUTO_INTERVAL_HOURS 推算下次备份时间。

    Returns:
        包含 enabled、interval_hours、last_backup_at、
        next_backup_at、webdav_sync_enabled 等字段的状态字典。
    """
    s = get_settings()
    next_at = None

    if _last_backup_info["last_backup_at"] and s.BACKUP_AUTO_ENABLED:
        try:
            last = datetime.fromisoformat(_last_backup_info["last_backup_at"])
            next_at = (
                last + timedelta(hours=s.BACKUP_AUTO_INTERVAL_HOURS)
            ).isoformat()
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
    执行一次定时备份任务。

    流程：
    1. 创建本地加密备份
    2. 若 WebDAV 已启用，同步到云端（失败不影响本地备份结果）

    更新全局 _last_backup_info 状态供 get_auto_backup_status 查询。

    Returns:
        备份文件 Path，失败返回 None。
    """
    s = get_settings()
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
                    logger.warning(f"自动备份 WebDAV 同步失败（已忽略）: {e}")

            return filepath

        _last_backup_info["last_backup_success"] = False
        return None

    except Exception as e:
        logger.error(f"定时备份失败: {e}")
        _last_backup_info["last_backup_success"] = False
        return None