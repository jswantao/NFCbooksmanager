# backend/app/api/admin.py
"""
管理后台 API

提供系统全局统计、监控和日志查询功能。

核心端点：
- GET /stats     : 仪表盘统计（图书、书架、映射、活动日志）
- GET /logs      : 操作活动日志（支持按类型、天数筛选）
- GET /sync-logs : 豆瓣同步日志（支持按状态筛选）
- GET /database  : 数据库表信息

统计维度：
- 实体统计：物理书架、逻辑书架、激活映射、图书总数/在架数
- 来源分布：douban / manual / isbn / nfc 各来源图书数量
- 时间维度：今日新增、月度增长趋势
- 排行榜：出版社 Top 10、作者 Top 10
- 质量分析：评分分布、书架利用率
- 活动追踪：最近操作记录

注意：
- 使用原生 SQL 进行复杂聚合查询，提升性能
- 活动日志表可能不存在（旧版本兼容），自动降级使用备用数据源
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, text

from app.core.database import get_db
from app.models.models import (
    PhysicalShelf,
    LogicalShelf,
    PhysicalLogicalMapping,
    BookMetadata,
    LogicalShelfBook,
    BookStatus,
    BookSource,
    ActivityLog,
    SyncLog,
)

router = APIRouter()


# ==================== 仪表盘统计 ====================

@router.get("/stats", summary="获取仪表盘统计数据")
async def get_dashboard_stats(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    获取管理仪表盘所需的全部统计数据
    
    统计内容：
    1. 实体数量：物理书架、逻辑书架、映射、图书（总数/在架/未上架）
    2. 数据来源分布：douban / manual / isbn / nfc 各占多少
    3. 同步统计：同步总次数、今日新增图书数
    4. 最近图书：最新添加的 10 本图书
    5. 趋势图表数据：月度增长、出版社排名、作者排名、评分分布、书架利用率
    6. 活动记录：最近操作日志
    
    Returns:
        包含所有统计维度的字典，前端直接用于渲染仪表盘
    """
    # ---- 当前日期（用于今日统计） ----
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # ---- 基础实体计数 ----
    physical_count = (
        db.query(func.count(PhysicalShelf.physical_shelf_id)).scalar() or 0
    )
    logical_count = (
        db.query(func.count(LogicalShelf.logical_shelf_id))
        .filter(LogicalShelf.is_active == True)
        .scalar() or 0
    )
    active_mapping_count = (
        db.query(func.count(PhysicalLogicalMapping.mapping_id))
        .filter(PhysicalLogicalMapping.is_active == True)
        .scalar() or 0
    )
    total_books = (
        db.query(func.count(BookMetadata.book_id)).scalar() or 0
    )
    books_in_shelves = (
        db.query(func.count(LogicalShelfBook.id))
        .filter(LogicalShelfBook.status == BookStatus.IN_SHELF.value)
        .scalar() or 0
    )

    # ---- 数据来源分布 ----
    source_stats = dict(
        db.query(
            BookMetadata.source,
            func.count(BookMetadata.book_id)
        )
        .group_by(BookMetadata.source)
        .all()
    )
    books_by_source = {
        "douban": source_stats.get("douban", 0),
        "manual": source_stats.get("manual", 0),
        "isbn": source_stats.get("isbn", 0),
        "nfc": source_stats.get("nfc", 0),
    }

    # ---- 同步与今日统计 ----
    sync_count = db.query(func.count(SyncLog.id)).scalar() or 0
    today_books = (
        db.query(func.count(BookMetadata.book_id))
        .filter(BookMetadata.created_at >= today_start)
        .scalar() or 0
    )

    # ---- 最近添加的图书 ----
    recent = (
        db.query(BookMetadata)
        .order_by(desc(BookMetadata.created_at))
        .limit(10)
        .all()
    )
    recent_books = []
    for book in recent:
        # 查询图书所在书架
        shelf_info = (
            db.query(LogicalShelfBook, LogicalShelf)
            .join(
                LogicalShelf,
                LogicalShelfBook.logical_shelf_id == LogicalShelf.logical_shelf_id
            )
            .filter(
                LogicalShelfBook.book_id == book.book_id,
                LogicalShelfBook.status == BookStatus.IN_SHELF.value,
                LogicalShelf.is_active == True,
            )
            .first()
        )
        recent_books.append({
            "book_id": book.book_id,
            "title": book.title or "",
            "isbn": book.isbn or "",
            "author": book.author,
            "source": book.source or "manual",
            "cover_url": book.cover_url,
            "rating": book.rating,
            "shelf_name": shelf_info[1].shelf_name if shelf_info else None,
            "added_at": book.created_at.isoformat() if book.created_at else None,
        })

    # ---- 返回完整统计 ----
    return {
        "physical_shelves": physical_count,
        "logical_shelves": logical_count,
        "active_mappings": active_mapping_count,
        "total_books": total_books,
        "books_in_shelves": books_in_shelves,
        "books_not_in_shelf": total_books - books_in_shelves,
        "books_by_source": books_by_source,
        "sync_count": sync_count,
        "today_books": today_books,
        "recent_books": recent_books,
        "monthly_growth": _get_monthly_growth(db),
        "top_publishers": _get_top_publishers(db),
        "top_authors": _get_top_authors(db),
        "rating_distribution": _get_rating_distribution(db, total_books),
        "shelf_utilization": _get_shelf_utilization(db),
        "recent_activities": _get_recent_activities(db),
    }


# ==================== 月度增长趋势 ====================

def _get_monthly_growth(db: Session) -> List[Dict[str, Any]]:
    """
    统计当年每月新增图书数量
    
    使用 Python 循环按月查询（SQLite 不支持 DATE_TRUNC 等函数）。
    每月查询 created_at 在当月范围内的图书数量。
    
    Returns:
        [{"year": 2025, "month": "1月", "count": 15}, ...]
    """
    now = datetime.utcnow()
    current_year = now.year
    current_month = now.month
    
    monthly_data = []
    for month in range(1, current_month + 1):
        # 计算当月起始和结束时间
        month_start = datetime(current_year, month, 1)
        if month < 12:
            month_end = datetime(current_year, month + 1, 1)
        else:
            month_end = datetime(current_year + 1, 1, 1)
        
        count = (
            db.query(func.count(BookMetadata.book_id))
            .filter(
                BookMetadata.created_at >= month_start,
                BookMetadata.created_at < month_end,
            )
            .scalar() or 0
        )
        monthly_data.append({
            "year": current_year,
            "month": f"{month}月",
            "count": count,
        })
    
    return monthly_data


# ==================== 出版社排名 ====================

def _get_top_publishers(db: Session, limit: int = 10) -> List[Dict[str, Any]]:
    """
    统计出版社图书数量排名
    
    使用原生 SQL 进行 GROUP BY 聚合，提升查询性能。
    
    Args:
        db: 数据库会话
        limit: 返回前 N 名，默认 10
    
    Returns:
        [{"name": "出版社名", "count": 数量, "percentage": 占比%}, ...]
    """
    result = db.execute(
        text(
            "SELECT publisher, COUNT(*) as cnt "
            "FROM book_metadata "
            "WHERE publisher IS NOT NULL AND publisher != '' "
            "GROUP BY publisher "
            "ORDER BY cnt DESC "
            "LIMIT :limit"
        ),
        {"limit": limit},
    ).fetchall()
    
    total = sum(row.cnt for row in result) or 1  # 避免除零
    
    return [
        {
            "name": row.publisher,
            "count": row.cnt,
            "percentage": round(row.cnt / total * 100, 1),
        }
        for row in result
    ]


# ==================== 作者排名 ====================

def _get_top_authors(db: Session, limit: int = 10) -> List[Dict[str, Any]]:
    """
    统计作者图书数量排名
    
    Args:
        db: 数据库会话
        limit: 返回前 N 名，默认 10
    
    Returns:
        [{"name": "作者名", "count": 数量, "percentage": 占比%}, ...]
    """
    result = db.execute(
        text(
            "SELECT author, COUNT(*) as cnt "
            "FROM book_metadata "
            "WHERE author IS NOT NULL AND author != '' "
            "GROUP BY author "
            "ORDER BY cnt DESC "
            "LIMIT :limit"
        ),
        {"limit": limit},
    ).fetchall()
    
    total = sum(row.cnt for row in result) or 1
    
    return [
        {
            "name": row.author,
            "count": row.cnt,
            "percentage": round(row.cnt / total * 100, 1),
        }
        for row in result
    ]


# ==================== 评分分布 ====================

def _get_rating_distribution(db: Session, total: int) -> List[Dict[str, Any]]:
    """
    统计图书评分分布
    
    评分区间：
    - 9-10 分：神作（绿色）
    - 8-9 分：优秀（黄绿）
    - 7-8 分：良好（琥珀）
    - 6-7 分：一般（橙色）
    - 6 分以下：较差（红色）
    - 未评分（灰色）
    
    Args:
        db: 数据库会话
        total: 图书总数（用于判断是否为空）
    
    Returns:
        [{"range": "9-10分", "count": 数量, "color": "#22c55e"}, ...]
    """
    if total == 0:
        return []
    
    # 评分区间定义
    rating_ranges = [
        (9, 10, "9-10分", "#22c55e"),   # 绿色 - 神作
        (8, 9, "8-9分", "#84cc16"),     # 黄绿 - 优秀
        (7, 8, "7-8分", "#f59e0b"),     # 琥珀 - 良好
        (6, 7, "6-7分", "#f97316"),     # 橙色 - 一般
        (0, 6, "6分以下", "#ef4444"),   # 红色 - 较差
    ]
    
    distribution = []
    for lo, hi, label, color in rating_ranges:
        count = db.execute(
            text(
                "SELECT COUNT(*) FROM book_metadata "
                "WHERE rating IS NOT NULL AND rating != '' "
                "AND CAST(rating AS REAL) >= :lo "
                "AND CAST(rating AS REAL) < :hi"
            ),
            {"lo": lo, "hi": hi},
        ).scalar() or 0
        distribution.append({
            "range": label,
            "count": count,
            "color": color,
        })
    
    # 未评分图书
    unrated = db.execute(
        text(
            "SELECT COUNT(*) FROM book_metadata "
            "WHERE rating IS NULL OR rating = ''"
        )
    ).scalar() or 0
    distribution.append({
        "range": "未评分",
        "count": unrated,
        "color": "#94a3b8",  # 灰色
    })
    
    return distribution


# ==================== 书架利用率 ====================

def _get_shelf_utilization(db: Session) -> List[Dict[str, Any]]:
    """
    统计各书架图书数量（利用率）
    
    使用 LEFT JOIN 确保没有图书的书架也显示（数量为 0）。
    容量计算：取最大图书数的 1.2 倍，最低 10 本。
    
    Returns:
        [{
            "shelf_name": "书架名",
            "book_count": 数量,
            "capacity": 容量上限,
            "percentage": 利用率百分比
        }, ...]
    """
    result = db.execute(
        text(
            "SELECT ls.shelf_name, COUNT(lsb.id) as cnt "
            "FROM logical_shelves ls "
            "LEFT JOIN logical_shelf_books lsb "
            "  ON ls.logical_shelf_id = lsb.logical_shelf_id "
            "  AND lsb.status = 'in_shelf' "
            "WHERE ls.is_active = 1 "
            "GROUP BY ls.logical_shelf_id "
            "ORDER BY cnt DESC"
        )
    ).fetchall()
    
    if not result:
        return []
    
    # 容量 = max(最大图书数 × 1.2, 10)
    max_books = max(row.cnt for row in result)
    capacity = max(int(max_books * 1.2), 10)
    
    return [
        {
            "shelf_name": row.shelf_name,
            "book_count": row.cnt,
            "capacity": capacity,
            "percentage": round(min(row.cnt / capacity * 100, 100), 1),
        }
        for row in result
    ]


# ==================== 最近活动 ====================

def _get_recent_activities(db: Session, limit: int = 20) -> List[Dict[str, Any]]:
    """
    获取最近系统活动记录
    
    优先从 activity_logs 表查询（如果存在）。
    若表不存在（旧版本兼容），则从其他表聚合模拟活动记录。
    
    活动类型：
    - sync: 豆瓣同步
    - add: 添加图书到书架
    - mapping: 映射变更
    - update: 图书更新（仅 activity_logs 表）
    - delete: 删除操作（仅 activity_logs 表）
    - system: 系统操作（仅 activity_logs 表）
    
    Args:
        db: 数据库会话
        limit: 返回记录数，默认 20
    
    Returns:
        [{"id": 记录ID, "action": 操作类型, "detail": 描述, 
          "type": 分类, "timestamp": 相对时间}, ...]
    """
    if _table_exists(db, "activity_logs"):
        return _get_activities_from_log(db, limit)
    
    # 备用方案：从业务表聚合活动
    return _get_fallback_activities(db, limit)


def _get_activities_from_log(db: Session, limit: int) -> List[Dict[str, Any]]:
    """从 activity_logs 表获取活动记录"""
    result = db.execute(
        text(
            "SELECT id, action, detail, created_at "
            "FROM activity_logs "
            "ORDER BY created_at DESC "
            "LIMIT :limit"
        ),
        {"limit": limit},
    ).fetchall()
    
    return [
        {
            "id": row.id,
            "action": row.action,
            "detail": row.detail or "",
            "type": (
                row.action
                if row.action in ('sync', 'add', 'update', 'delete', 'mapping', 'system')
                else 'system'
            ),
            "timestamp": _format_relative_time(row.created_at) if row.created_at else "",
        }
        for row in result
    ]


def _get_fallback_activities(db: Session, limit: int) -> List[Dict[str, Any]]:
    """
    备用活动聚合（旧版本兼容）
    
    从以下表聚合最近 7 天的活动：
    1. book_metadata.last_sync_at → sync 类型
    2. logical_shelf_books.added_at → add 类型
    3. physical_logical_mappings.updated_at → mapping 类型
    
    按时间倒序合并排序，取前 limit 条。
    """
    since = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")
    activities = []
    
    # 1. 同步活动
    sync_rows = db.execute(
        text(
            "SELECT book_id, title, last_sync_at "
            "FROM book_metadata "
            "WHERE last_sync_at >= :since AND source = 'douban' "
            "ORDER BY last_sync_at DESC LIMIT :limit"
        ),
        {"since": since, "limit": limit},
    ).fetchall()
    
    for row in sync_rows:
        if row.last_sync_at:
            activities.append({
                "id": row.book_id,
                "action": "sync",
                "detail": f"《{row.title}》同步更新",
                "type": "sync",
                "timestamp": _format_relative_time(row.last_sync_at),
                "_sort_time": str(row.last_sync_at),  # 内部排序用
            })
    
    # 2. 添加图书活动
    add_rows = db.execute(
        text(
            "SELECT lsb.id, bm.title, ls.shelf_name, lsb.added_at "
            "FROM logical_shelf_books lsb "
            "JOIN book_metadata bm ON lsb.book_id = bm.book_id "
            "JOIN logical_shelves ls ON lsb.logical_shelf_id = ls.logical_shelf_id "
            "WHERE lsb.added_at >= :since "
            "ORDER BY lsb.added_at DESC LIMIT :limit"
        ),
        {"since": since, "limit": limit},
    ).fetchall()
    
    for row in add_rows:
        if row.added_at:
            activities.append({
                "id": row.id,
                "action": "add",
                "detail": f"《{row.title or '未知'}》添加到「{row.shelf_name or '未知'}」",
                "type": "add",
                "timestamp": _format_relative_time(row.added_at),
                "_sort_time": str(row.added_at),
            })
    
    # 3. 映射变更活动
    mapping_rows = db.execute(
        text(
            "SELECT plm.mapping_id, plm.version, ps.location_name, "
            "       ls.shelf_name, plm.updated_at "
            "FROM physical_logical_mappings plm "
            "JOIN physical_shelves ps ON plm.physical_shelf_id = ps.physical_shelf_id "
            "JOIN logical_shelves ls ON plm.logical_shelf_id = ls.logical_shelf_id "
            "WHERE plm.updated_at >= :since "
            "ORDER BY plm.updated_at DESC LIMIT :limit"
        ),
        {"since": since, "limit": limit},
    ).fetchall()
    
    for row in mapping_rows:
        if row.updated_at:
            activities.append({
                "id": row.mapping_id,
                "action": "mapping",
                "detail": (
                    f"映射: {row.location_name or '?'} → "
                    f"{row.shelf_name or '?'} v{row.version}"
                ),
                "type": "mapping",
                "timestamp": _format_relative_time(row.updated_at),
                "_sort_time": str(row.updated_at),
            })
    
    # 按时间倒序排序
    activities.sort(key=lambda x: x.get("_sort_time", ""), reverse=True)
    
    # 移除内部排序字段
    for activity in activities:
        activity.pop("_sort_time", None)
    
    return activities[:limit]


# ==================== 日志查询 ====================

@router.get("/logs", summary="获取操作活动日志")
async def get_logs(
    limit: int = Query(50, ge=1, le=200, description="返回记录数"),
    action_type: Optional[str] = Query(
        None,
        description="筛选操作类型: sync / add / update / delete / mapping / system"
    ),
    days: int = Query(7, ge=1, le=90, description="查询最近 N 天的记录"),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """
    获取系统操作活动日志
    
    支持按操作类型和时间范围筛选。
    优先从 activity_logs 表查询，旧版本自动降级。
    
    Args:
        limit: 返回记录数（1-200）
        action_type: 筛选操作类型
        days: 查询天数范围（1-90）
    
    Returns:
        活动日志列表
    """
    if _table_exists(db, "activity_logs"):
        query = db.query(ActivityLog).filter(
            ActivityLog.created_at >= datetime.utcnow() - timedelta(days=days)
        )
        if action_type:
            query = query.filter(ActivityLog.action == action_type)
        
        logs = (
            query
            .order_by(desc(ActivityLog.created_at))
            .limit(limit)
            .all()
        )
        
        return [
            {
                "id": log.id,
                "action": log.action,
                "detail": log.detail,
                "type": log.action,
                "timestamp": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ]
    
    # 备用方案
    return _get_fallback_activities(db, limit)


@router.get("/sync-logs", summary="获取豆瓣同步日志")
async def get_sync_logs(
    limit: int = Query(50, ge=1, le=200, description="返回记录数"),
    status: Optional[str] = Query(
        None,
        description="筛选同步状态: pending / success / failed"
    ),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """
    获取豆瓣数据同步操作日志
    
    记录每次从豆瓣同步图书数据的操作结果。
    用于排查同步失败原因和统计同步频率。
    
    Args:
        limit: 返回记录数（1-200）
        status: 筛选同步状态
    
    Returns:
        同步日志列表，sync_logs 表不存在时返回空列表
    """
    if not _table_exists(db, "sync_logs"):
        return []
    
    query = db.query(SyncLog)
    if status:
        query = query.filter(SyncLog.status == status)
    
    logs = (
        query
        .order_by(desc(SyncLog.created_at))
        .limit(limit)
        .all()
    )
    
    return [
        {
            "id": log.id,
            "book_id": log.book_id,
            "action": log.action,
            "detail": log.detail,
            "status": log.status,
            "source": log.source,
            "timestamp": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]


@router.get("/database", summary="获取数据库表信息")
async def get_database_info(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    获取数据库表和行数信息
    
    用于运维监控，了解数据规模。
    遍历所有用户表并统计行数。
    
    Returns:
        {"tables": [{"name": "表名", "rows": 行数}, ...]}
    """
    # 查询所有用户表
    table_rows = db.execute(
        text(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    ).fetchall()
    
    tables = []
    for row in table_rows:
        table_name = row[0]
        try:
            count = db.execute(
                text(f"SELECT COUNT(*) FROM [{table_name}]")
            ).scalar()
        except Exception:
            count = 0
        tables.append({"name": table_name, "rows": count})
    
    return {"tables": tables}


# ==================== 工具函数 ====================

def _table_exists(db: Session, table_name: str) -> bool:
    """
    检查数据库表是否存在
    
    用于旧版本兼容：activity_logs 和 sync_logs 表可能不存在。
    
    Args:
        db: 数据库会话
        table_name: 表名
    
    Returns:
        表存在返回 True，否则 False
    """
    try:
        result = db.execute(
            text(
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name=:name"
            ),
            {"name": table_name},
        ).fetchone()
        return result is not None
    except Exception:
        return False


def _format_relative_time(dt: datetime) -> str:
    """
    将 datetime 格式化为相对时间描述
    
    格式规则：
    - < 1 分钟：刚刚
    - < 1 小时：X 分钟前
    - < 1 天：X 小时前
    - < 2 天：昨天
    - < 7 天：X 天前
    - ≥ 7 天：显示完整日期（YYYY-MM-DD）
    
    Args:
        dt: 要格式化的时间
    
    Returns:
        相对时间字符串，dt 为空返回空字符串
    """
    if not dt:
        return ""
    
    # 统一处理时区
    if dt.tzinfo:
        dt = dt.replace(tzinfo=None)
    now = datetime.utcnow()
    
    diff_seconds = (now - dt).total_seconds()
    
    if diff_seconds < 60:
        return "刚刚"
    if diff_seconds < 3600:
        return f"{int(diff_seconds // 60)}分钟前"
    if diff_seconds < 86400:
        return f"{int(diff_seconds // 3600)}小时前"
    if diff_seconds < 172800:  # 48 小时内
        return "昨天"
    if diff_seconds < 604800:  # 7 天内
        return f"{int(diff_seconds // 86400)}天前"
    
    # 超过 7 天显示完整日期
    return dt.strftime("%Y-%m-%d")