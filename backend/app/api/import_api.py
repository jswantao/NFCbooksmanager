# backend/app/api/import_api.py
"""
批量导入 API

支持从 Excel/CSV/TXT 文件批量导入图书 ISBN，自动同步豆瓣数据。

核心端点：
- POST /preview       : 预览导入文件内容
- POST /start         : 启动异步导入任务
- GET  /status/{id}   : 查询导入任务进度
- POST /task/{id}/cancel : 取消导入任务
- GET  /template      : 下载导入模板

导入流程：
1. 上传文件 → 预览（显示新增/已存在/重复/无效数量）
2. 确认后启动任务 → 后台异步逐条处理
3. 每条记录：创建 BookMetadata → 可选自动同步豆瓣 → 可选添加到书架
4. 前端轮询进度 → 实时显示完成百分比和错误详情

文件格式支持：
- Excel (.xlsx/.xls)：自动识别 ISBN 列
- CSV (.csv)：自动检测编码（UTF-8 BOM）
- TXT (.txt)：支持制表符/逗号分隔、每行一个 ISBN

ISBN 校验规则：
- 清洗：移除连字符、空格、非数字字符
- 10 位 → 校验 ISBN-10 校验和 → 转换为 ISBN-13
- 13 位 → 校验 ISBN-13 校验和
- 校验失败标记为无效
"""

import io
import re
import json
import uuid
import asyncio
import logging
from typing import Optional, List, Dict, Any

import pandas as pd
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Query,
    BackgroundTasks,
    Form,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.database import get_db, AsyncSessionLocal
from app.models.models import (
    BookMetadata,
    LogicalShelfBook,
    BookStatus,
    BookSource,
    ImportTask,
    ImportStatus,
)
from app.schemas.schemas import ImportStartResponse, ApiResponse
from app.services.douban_service import DoubanService

logger = logging.getLogger(__name__)
router = APIRouter()

# 全局豆瓣服务实例
douban_service = DoubanService()

# 支持的文件扩展名
SUPPORTED_EXTENSIONS = {"csv", "xlsx", "xls", "txt"}


# ==================== ISBN 清洗与校验 ====================

def clean_and_validate_isbn(raw: str) -> Optional[str]:
    """
    清洗并校验 ISBN 的有效性
    
    处理步骤：
    1. 移除连字符、空格
    2. 移除非数字字符（保留 X 用于 ISBN-10 校验）
    3. 统一转为大写
    
    ISBN-10 校验（10 位）：
    - 加权和 = Σ(i + 1) × 第 i 位数字（i 从 0 开始）
    - 最后一位可能是 X（代表 10）
    - 加权和 % 11 == 0 → 有效
    - 有效 → 转换为 ISBN-13（978 + 前 9 位 + ISBN-13 校验位）
    
    ISBN-13 校验（13 位）：
    - 奇数位（索引 0,2,...）权重 1，偶数位（索引 1,3,...）权重 3
    - 校验和 = (10 - (加权和 % 10)) % 10
    - 校验和 == 最后一位 → 有效
    
    Args:
        raw: 原始 ISBN 字符串
    
    Returns:
        有效的 13 位 ISBN，无效返回 None
    
    Examples:
        >>> clean_and_validate_isbn("978-7-5442-9116-3")
        '9787544291163'
        >>> clean_and_validate_isbn("0-7475-3269-9")  # 10 位
        '9780747532699'
        >>> clean_and_validate_isbn("invalid")
        None
    """
    # 清洗：移除连字符和空格
    cleaned = re.sub(r'[-\s]', '', str(raw).strip())
    # 保留数字和 X
    cleaned = re.sub(r'[^\dXx]', '', cleaned).upper()
    
    if not cleaned:
        return None
    
    # ISBN-10 校验
    if len(cleaned) == 10:
        try:
            # 计算加权和
            weighted_sum = sum(
                (i + 1) * (10 if char == 'X' else int(char))
                for i, char in enumerate(cleaned)
            )
            if weighted_sum % 11 != 0:
                return None
        except (ValueError, TypeError):
            return None
        
        # 转换为 ISBN-13
        prefix = "978"
        base = prefix + cleaned[:9]
        digits = [int(c) for c in base]
        checksum = (
            10 - (sum(digits[0:12:2]) + sum(digits[1:12:2]) * 3) % 10
        ) % 10
        return base + str(checksum)
    
    # ISBN-13 校验
    if len(cleaned) == 13:
        try:
            digits = [int(c) for c in cleaned]
            weighted_sum = (
                sum(digits[0:12:2]) + sum(digits[1:12:2]) * 3
            )
            checksum = (10 - weighted_sum % 10) % 10
            if checksum == digits[12]:
                return cleaned
        except (ValueError, TypeError):
            pass
    
    return None


# ==================== 文件解析 ====================

def parse_file_content(content: bytes, extension: str) -> pd.DataFrame:
    """
    根据文件扩展名解析文件内容为 DataFrame
    
    支持格式：
    - CSV: 自动识别 UTF-8 BOM 编码
    - Excel: .xlsx（openpyxl）和 .xls（xlrd）
    - TXT: 自动检测分隔符（制表符 > 逗号），或每行一个 ISBN
    
    Args:
        content: 文件的二进制内容
        extension: 文件扩展名（不含点号）
    
    Returns:
        解析后的 DataFrame
    
    Raises:
        ValueError: 不支持的文件格式
    """
    if extension == "csv":
        return pd.read_csv(
            io.BytesIO(content),
            dtype=str,
            encoding="utf-8-sig",  # 自动处理 BOM
        )
    
    if extension in ("xlsx", "xls"):
        return pd.read_excel(io.BytesIO(content), dtype=str)
    
    if extension == "txt":
        text = content.decode("utf-8-sig")
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        
        if not lines:
            raise ValueError("文件内容为空")
        
        # 自动检测分隔符
        first_line = lines[0]
        if "\t" in first_line:
            # 制表符分隔
            return pd.read_csv(
                io.StringIO("\n".join(lines)),
                sep="\t",
                dtype=str,
            )
        elif "," in first_line:
            # 逗号分隔
            return pd.read_csv(
                io.StringIO("\n".join(lines)),
                sep=",",
                dtype=str,
            )
        else:
            # 每行一个 ISBN（支持可选的备注列）
            isbns = []
            notes = []
            for line in lines:
                parts = re.split(r'[\t,;|]', line, maxsplit=1)
                isbns.append(parts[0].strip())
                notes.append(parts[1].strip() if len(parts) > 1 else "")
            return pd.DataFrame({"isbn": isbns, "note": notes})
    
    raise ValueError(f"不支持的文件格式: .{extension}")


def find_isbn_column(df: pd.DataFrame) -> str:
    """
    自动识别 DataFrame 中的 ISBN 列
    
    识别规则（按优先级）：
    1. 列名包含 'isbn'（不区分大小写）
    2. 列名包含 '书号'
    3. 列名包含 'isbn13' 或 'isbn10'
    4. 默认使用第一列
    
    Args:
        df: 数据 DataFrame
    
    Returns:
        ISBN 列名
    """
    isbn_keywords = ("isbn", "书号", "isbn13", "isbn10")
    
    for col in df.columns:
        col_lower = str(col).lower()
        if any(keyword in col_lower for keyword in isbn_keywords):
            return col
    
    # 默认使用第一列
    return str(df.columns[0]) if len(df.columns) > 0 else ""


# ==================== 导入预览 ====================

@router.post("/preview", summary="预览导入文件")
async def preview_import(
    file: UploadFile = File(..., description="要导入的文件"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    预览导入文件内容，显示统计信息
    
    不执行实际导入，仅分析文件内容：
    - 新增图书：ISBN 在数据库中不存在
    - 已存在图书：ISBN 已在数据库中
    - 重复 ISBN：文件中出现多次
    - 无效条目：ISBN 校验失败
    
    返回前 10 行样本数据用于用户确认。
    
    Args:
        file: 上传的文件
    
    Returns:
        预览结果（统计信息、样本数据、列名等）
    
    Raises:
        HTTPException 400: 文件格式不支持或内容为空
    """
    # 校验文件名和扩展名
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名为空")
    
    extension = (
        file.filename.rsplit(".", 1)[-1].lower()
        if "." in file.filename
        else ""
    )
    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件格式，支持: {', '.join(SUPPORTED_EXTENSIONS)}",
        )
    
    # 读取并解析文件
    file_content = await file.read()
    try:
        df = parse_file_content(file_content, extension)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    if df.empty:
        raise HTTPException(status_code=400, detail="文件内容为空")
    
    # 识别 ISBN 列
    isbn_column = find_isbn_column(df)
    if not isbn_column:
        raise HTTPException(status_code=400, detail="未找到 ISBN 列")
    
    # 逐行校验 ISBN
    raw_isbns = df[isbn_column].dropna().astype(str).tolist()
    
    new_entries = []       # 新增（数据库中不存在）
    invalid_entries = []   # 无效 ISBN
    seen_isbns = set()     # 已处理的 ISBN（去重）
    duplicate_isbns = set()  # 重复的 ISBN
    
    for i, raw_isbn in enumerate(raw_isbns):
        cleaned = clean_and_validate_isbn(raw_isbn)
        
        if not cleaned:
            invalid_entries.append({
                "row": i + 2,  # 行号（Excel 从 1 开始，跳过表头）
                "original": str(raw_isbn)[:50],
                "reason": "ISBN 格式错误或校验失败",
            })
        elif cleaned in seen_isbns:
            # 文件中重复出现
            if cleaned not in duplicate_isbns:
                duplicate_isbns.add(cleaned)
        else:
            seen_isbns.add(cleaned)
            # 检查数据库中是否已存在
            existing = (
                db.query(BookMetadata)
                .filter(BookMetadata.isbn == cleaned)
                .first()
            )
            if not existing:
                new_entries.append({
                    "row": i + 2,
                    "isbn": cleaned,
                })
    
    # 构建预览响应
    existing_count = len(seen_isbns) - len(new_entries)
    
    return {
        "file_name": file.filename,
        "file_size": len(file_content),
        "total_rows": len(df),
        "new_count": len(new_entries),
        "existing_count": existing_count,
        "duplicate_count": len(duplicate_isbns),
        "invalid_count": len(invalid_entries),
        "isbn_column": isbn_column,
        "note_column": None,
        "isbns": [entry["isbn"] for entry in new_entries][:100],
        "sample_data": df.head(10).fillna("").to_dict(orient="records"),
        "columns": [str(c) for c in df.columns],
        "new_entries": new_entries[:50],
        "existing_books": [],
        "invalid_entries": invalid_entries[:20],
        "duplicates": [
            {"isbn": isbn, "count": 2}
            for isbn in duplicate_isbns
        ][:20],
        "total_isbns": len(raw_isbns),
        "valid_count": len(new_entries),
        "other_columns": [],
    }


# ==================== 启动导入 ====================

@router.post("/start", response_model=ImportStartResponse, summary="启动批量导入任务")
async def start_import(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="要导入的文件"),
    shelf_id: Optional[int] = Form(
        None,
        description="导入后自动添加到的书架 ID（可选）",
    ),
    auto_sync: bool = Form(
        True,
        description="是否自动从豆瓣同步元数据",
    ),
    sync_delay: float = Form(
        1.0,
        ge=0.5,
        le=10.0,
        description="每次豆瓣请求间隔（秒），范围 0.5~10",
    ),
    db: Session = Depends(get_db),
) -> ImportStartResponse:
    """
    启动异步批量导入任务
    
    任务在后台执行，前端通过 task_id 轮询进度。
    
    导入流程：
    1. 解析文件获取所有新增 ISBN
    2. 创建 ImportTask 记录（status=pending）
    3. 提交后台任务
    4. 后台逐条处理：
       - 创建 BookMetadata（source=manual）
       - 可选自动同步豆瓣（source 更新为 douban）
       - 可选添加到指定书架
    5. 更新任务进度（completed/success/failed）
    
    Args:
        background_tasks: FastAPI 后台任务管理器
        file: 上传的文件
        shelf_id: 目标书架 ID
        auto_sync: 是否自动同步豆瓣
        sync_delay: 请求间隔
    
    Returns:
        任务 ID 和待导入总数
    
    Raises:
        HTTPException 400: 文件格式不支持或没有新 ISBN
    """
    # 解析文件
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名为空")
    
    extension = (
        file.filename.rsplit(".", 1)[-1].lower()
        if "." in file.filename
        else ""
    )
    file_content = await file.read()
    df = parse_file_content(file_content, extension)
    isbn_column = find_isbn_column(df)
    
    # 提取并校验所有 ISBN
    new_isbns = []
    seen = set()
    
    for raw_isbn in df[isbn_column].dropna().astype(str):
        cleaned = clean_and_validate_isbn(raw_isbn)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            # 仅收录数据库中不存在的
            existing = (
                db.query(BookMetadata)
                .filter(BookMetadata.isbn == cleaned)
                .first()
            )
            if not existing:
                new_isbns.append(cleaned)
    
    if not new_isbns:
        raise HTTPException(
            status_code=400,
            detail="文件中没有新的 ISBN 需要导入",
        )
    
    # 创建导入任务记录
    task_id = str(uuid.uuid4())
    task = ImportTask(
        task_id=task_id,
        status=ImportStatus.PENDING.value,
        file_name=file.filename,
        total=len(new_isbns),
        options=json.dumps(
            {
                "shelf_id": shelf_id,
                "auto_sync": auto_sync,
                "sync_delay": sync_delay,
            },
            ensure_ascii=False,
        ),
    )
    db.add(task)
    db.commit()
    
    # 提交后台任务
    background_tasks.add_task(
        _run_import_task,
        task_id,
        new_isbns,
        shelf_id,
        auto_sync,
        sync_delay,
    )
    
    logger.info(
        f"导入任务已创建: {task_id[:8]}... | "
        f"文件: {file.filename} | 数量: {len(new_isbns)}"
    )
    
    return ImportStartResponse(
        task_id=task_id,
        total=len(new_isbns),
        message=f"导入任务已创建，共 {len(new_isbns)} 本图书待处理",
    )


# ==================== 任务状态查询 ====================

@router.get("/status/{task_id}", summary="查询导入任务进度")
async def get_import_status(
    task_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    查询导入任务的实时进度
    
    前端可定时轮询此接口更新进度条。
    每次返回完整的任务状态，包括成功/失败详情列表。
    
    Args:
        task_id: 任务 ID
    
    Returns:
        任务状态详情
    
    Raises:
        HTTPException 404: 任务不存在
    """
    task = (
        db.query(ImportTask)
        .filter(ImportTask.task_id == task_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return {
        "task_id": task.task_id,
        "status": task.status,
        "file_name": task.file_name,
        "total": task.total,
        "completed": task.completed,
        "success": task.success,
        "synced": task.synced,
        "failed": task.failed,
        "skipped": task.skipped,
        "progress": task.progress,
        "results": json.loads(task.results) if task.results else [],
        "errors": json.loads(task.errors) if task.errors else [],
        "error": task.error,
        "started_at": (
            task.started_at.isoformat() if task.started_at else None
        ),
        "finished_at": (
            task.finished_at.isoformat() if task.finished_at else None
        ),
        "options": json.loads(task.options) if task.options else {},
    }


# ==================== 取消任务 ====================

@router.post("/task/{task_id}/cancel", response_model=ApiResponse, summary="取消导入任务")
async def cancel_import(
    task_id: str,
    db: Session = Depends(get_db),
) -> ApiResponse:
    """
    取消正在进行的导入任务
    
    仅可取消状态为 pending 或 running 的任务。
    已完成/失败/已取消的任务不可再次取消。
    
    取消原理：
    - 设置 status=cancelled
    - 后台任务在下次循环时检测到取消状态并停止处理
    
    Args:
        task_id: 任务 ID
    
    Returns:
        取消结果
    
    Raises:
        HTTPException 404: 任务不存在
        HTTPException 400: 任务已结束，无法取消
    """
    task = (
        db.query(ImportTask)
        .filter(ImportTask.task_id == task_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    if task.is_finished:
        raise HTTPException(
            status_code=400,
            detail=f"任务已结束（状态: {task.status}），无法取消",
        )
    
    task.status = ImportStatus.CANCELLED.value
    task.finished_at = __import__("datetime").datetime.utcnow()
    db.commit()
    
    logger.info(f"导入任务已取消: {task_id[:8]}...")
    
    return ApiResponse(
        success=True,
        message=f"任务已取消（已处理 {task.completed}/{task.total} 条）",
    )


# ==================== 下载模板 ====================

@router.get("/template", summary="下载导入模板")
async def download_template() -> StreamingResponse:
    """
    下载 Excel 格式的导入模板
    
    模板包含示例数据：
    - 9787544270878: 解忧杂货店
    - 9787020002207: 红楼梦
    - 9787532768998: 百年孤独
    
    用户可参考模板格式准备导入文件。
    
    Returns:
        Excel 文件流
    """
    # 创建示例数据
    df = pd.DataFrame({
        "isbn": ["9787544270878", "9787020002207", "9787532768998"],
        "备注": ["解忧杂货店", "红楼梦", "百年孤独"],
    })
    
    # 写入 Excel
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="导入数据")
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": "attachment; filename=import_template.xlsx",
        },
    )


# ==================== 后台导入任务 ====================

async def _run_import_task(
    task_id: str,
    isbns: List[str],
    shelf_id: Optional[int],
    auto_sync: bool,
    sync_delay: float,
) -> None:
    """
    后台异步执行导入任务
    
    使用独立的异步数据库会话，避免阻塞主线程。
    每处理一条记录都更新任务进度（支持前端实时轮询）。
    
    处理步骤（每条 ISBN）：
    1. 检查任务是否被取消
    2. 创建 BookMetadata 记录（初始 title="ISBN:{isbn}"）
    3. 可选：自动同步豆瓣元数据
    4. 可选：添加到指定书架
    5. 更新任务进度和结果列表
    
    错误处理：
    - 单条失败不影响后续处理
    - 失败记录写入 errors 列表
    - 异常时回滚单条记录的事务
    
    Args:
        task_id: 任务 ID
        isbns: 待导入 ISBN 列表
        shelf_id: 目标书架 ID
        auto_sync: 是否自动同步
        sync_delay: 请求间隔
    """
    try:
        async with AsyncSessionLocal() as db:
            # 获取任务记录
            result = await db.execute(
                select(ImportTask).filter(ImportTask.task_id == task_id)
            )
            task = result.scalar_one_or_none()
            if not task:
                logger.error(f"任务不存在: {task_id[:8]}...")
                return
            
            # 更新任务状态为运行中
            task.status = ImportStatus.RUNNING.value
            task.started_at = __import__("datetime").datetime.utcnow()
            await db.commit()
            
            # 逐条处理
            results = []
            errors = []
            
            for i, isbn in enumerate(isbns):
                # 检查是否被取消
                await db.refresh(task)
                if task.status == ImportStatus.CANCELLED.value:
                    logger.info(
                        f"导入任务被取消: {task_id[:8]}... | "
                        f"已处理 {i}/{len(isbns)}"
                    )
                    break
                
                try:
                    # 创建图书记录
                    book = BookMetadata(
                        isbn=isbn,
                        title=f"ISBN:{isbn}",
                        source=BookSource.MANUAL.value,
                    )
                    db.add(book)
                    await db.commit()
                    await db.refresh(book)
                    
                    # 可选：自动同步豆瓣数据
                    synced = False
                    if auto_sync:
                        try:
                            douban_data = await douban_service.search_by_isbn(isbn)
                            if douban_data and douban_data.get("title"):
                                # 更新同步到的字段
                                for field in (
                                    "title", "author", "cover_url",
                                    "publisher", "rating",
                                ):
                                    if value := douban_data.get(field):
                                        setattr(book, field, value)
                                book.source = BookSource.DOUBAN.value
                                synced = True
                                task.synced += 1
                                await db.commit()
                        except Exception as sync_error:
                            logger.warning(
                                f"豆瓣同步失败 [{isbn}]: {sync_error}"
                            )
                    
                    # 可选：添加到书架
                    if shelf_id:
                        shelf_book = LogicalShelfBook(
                            logical_shelf_id=shelf_id,
                            book_id=book.book_id,
                            status=BookStatus.IN_SHELF.value,
                        )
                        db.add(shelf_book)
                        await db.commit()
                    
                    # 记录成功
                    task.success += 1
                    results.append({
                        "index": i + 1,
                        "isbn": isbn,
                        "status": "success",
                        "title": book.title,
                        "synced": synced,
                    })
                    
                except Exception as process_error:
                    # 记录失败
                    task.failed += 1
                    error_msg = str(process_error)[:200]
                    results.append({
                        "index": i + 1,
                        "isbn": isbn,
                        "status": "failed",
                        "message": error_msg,
                    })
                    errors.append({
                        "index": i + 1,
                        "isbn": isbn,
                        "error": error_msg,
                    })
                    await db.rollback()
                
                # 更新进度
                task.completed = i + 1
                task.results = json.dumps(results, ensure_ascii=False)
                task.errors = json.dumps(errors, ensure_ascii=False)
                await db.commit()
                
                # 请求间隔（避免豆瓣限流）
                if sync_delay > 0:
                    await asyncio.sleep(sync_delay)
            
            # 任务完成
            task.status = ImportStatus.COMPLETED.value
            task.finished_at = __import__("datetime").datetime.utcnow()
            await db.commit()
            
            logger.info(
                f"导入任务完成: {task_id[:8]}... | "
                f"成功: {task.success} | 失败: {task.failed} | "
                f"同步: {task.synced}"
            )
            
    except Exception as e:
        logger.error(f"导入任务异常: {task_id[:8]}... | {e}")
        # 尝试更新任务状态为失败
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(ImportTask).filter(ImportTask.task_id == task_id)
                )
                task = result.scalar_one_or_none()
                if task:
                    task.status = ImportStatus.FAILED.value
                    task.error = str(e)[:500]
                    task.finished_at = __import__("datetime").datetime.utcnow()
                    await db.commit()
        except Exception:
            pass