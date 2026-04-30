# Bug 修复总结：未上架图书不显示问题

## 问题描述

用户导入或手动添加图书时，如果**未选择书架**，会出现以下现象：
- ✅ 仪表盘统计中能看到这些图书（total_books 计数包含它们）
- ❌ 全部图书管理页面看不到这些图书

## 根本原因分析

### 数据库架构问题

系统使用了**多对多关系表** (`LogicalShelfBook`) 来管理图书与书架的关系：

```sql
BookMetadata (book_id, title, ...)     -- 所有图书元数据
    ↓
LogicalShelfBook (book_id, logical_shelf_id, status)  -- 图书与书架的关系
    ↓
LogicalShelf (logical_shelf_id, shelf_name)  -- 书架定义
```

当用户创建图书时：
- **选择书架**：图书 → `BookMetadata` + `LogicalShelfBook` 记录 ✅
- **未选择书架**：图书 → 仅在 `BookMetadata` 表，**无 `LogicalShelfBook` 记录** ❌

### API 查询问题

#### `/api/books/wall` 端点（旧逻辑）
```python
# 只查询有书架关联的图书
query = (
    db.query(BookMetadata, LogicalShelfBook, LogicalShelf)
    .join(LogicalShelfBook, ...)  # INNER JOIN
    .join(LogicalShelf, ...)
    .filter(LogicalShelfBook.status == "IN_SHELF")
)
```

**问题**：使用 `INNER JOIN`，只返回在 `LogicalShelfBook` 表中有记录的图书。

#### `/api/admin/stats` 端点（统计查询）
```python
# 直接从 BookMetadata 表计数
total_books = db.query(BookMetadata).count()
```

**问题**：直接计数，包括所有未上架的图书 → 导致数据不一致。

#### 前端 `AllBooksManager.tsx` 页面
```typescript
// 使用 getBookWall API，只获取有书架的图书
const data = await getBookWall(params);
```

**问题**：使用了 `/api/books/wall`，无法显示未上架的图书。

## 修复方案

### 1. 后端：新增 `/api/books/all` 端点

**文件**：`backend/app/api/books.py`

```python
@router.get("/all", summary="获取所有图书列表（包括未上架的）")
async def get_all_books(
    sort_by: str = Query("created_at", ...),
    order: str = Query("desc", ...),
    limit: int = Query(50, ...),
    offset: int = Query(0, ...),
    source: Optional[str] = Query(None, ...),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    使用 LEFT OUTER JOIN，获取所有图书及其书架信息（如果存在）
    """
    query = (
        db.query(BookMetadata, LogicalShelfBook, LogicalShelf)
        .outerjoin(  # 左外连接，保留所有 BookMetadata 记录
            LogicalShelfBook,
            (BookMetadata.book_id == LogicalShelfBook.book_id) &
            (LogicalShelfBook.status == BookStatus.IN_SHELF.value),
        )
        .outerjoin(LogicalShelf, ...)
    )
    
    # 支持多种排序字段
    sort_mapping = {
        "created_at": BookMetadata.created_at,      # 添加时间（所有图书）
        "added_at": LogicalShelfBook.added_at,      # 上架时间（未上架为 NULL）
        "title": BookMetadata.title,
        "author": BookMetadata.author,
        "rating": ...,
    }
    
    # ... 排序、分页、返回
```

**关键特性**：
- ✅ 支持获取所有图书（包括未上架的）
- ✅ 对于已上架的图书，显示 `shelf_name` 和 `shelf_id`
- ✅ 对于未上架的图书，`shelf_name` 为 `null`
- ✅ 支持按来源筛选（豆瓣/手动/ISBN/NFC）
- ✅ 支持多种排序方式

### 2. 前端：更新 AllBooksManager.tsx

**文件**：`frontend/src/pages/AllBooksManager.tsx`

```typescript
// 导入新的 API 函数
import { getAllBooks, deleteBook, listShelves } from '../services/api';

// 使用 getAllBooks 替换 getBookWall
const data = await getAllBooks(params);

// 前端仍支持筛选（已上架/未上架/全部）
if (filterStatus === 'in_shelf') {
    filteredBooks = filteredBooks.filter(b => b.shelf_name);  // 有书架名
} else if (filterStatus === 'not_in_shelf') {
    filteredBooks = filteredBooks.filter(b => !b.shelf_name); // 无书架名
}
```

### 3. 前端：更新 API 服务层

**文件**：`frontend/src/services/api.ts`

```typescript
// 新增类型
export interface BooksResponse {
    books: Book[];
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
}

// 新增 API 函数
export const getAllBooks = (params: BookWallParams): Promise<BooksResponse> =>
    apiClient.get('/books/all', { params }).then((r) => r.data);
```

### 4. 前端：更新类型定义

**文件**：`frontend/src/types/index.ts`

```typescript
// 更新 BookWallParams 支持新字段
export interface BookWallParams {
    shelf_id?: number;
    sort_by?: 'added_at' | 'created_at' | 'title' | 'author' | 'rating';
    order?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
    source?: string;  // 新增
}

// 新增响应类型
export interface BooksResponse {
    books: Book[];
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
}
```

## 验证结果

### 修复前 ❌
- AllBooksManager 页面显示的图书数 < 仪表盘统计的图书数
- 未上架的图书完全不可见

### 修复后 ✅
- AllBooksManager 页面显示所有图书
- 支持区分已上架/未上架的图书
- 仪表盘和全部图书页面的数据一致
- 前端筛选器可以正确过滤：
  - "全部"：显示所有图书
  - "已上架"：只显示有 `shelf_name` 的图书
  - "未上架"：只显示 `shelf_name` 为 null 的图书

## 修改文件清单

### 后端（1 个文件）
- ✅ `backend/app/api/books.py` - 新增 `/api/books/all` 端点

### 前端（3 个文件）
- ✅ `frontend/src/pages/AllBooksManager.tsx` - 使用 getAllBooks API
- ✅ `frontend/src/services/api.ts` - 新增 getAllBooks 函数 + BooksResponse 类型
- ✅ `frontend/src/types/index.ts` - 更新 BookWallParams 和新增 BooksResponse

## 业务规则改进

### 关于未上架图书的处理

系统现在明确支持"未上架"状态的图书：

1. **创建阶段**：
   - 手动录入时，`shelf_id` 为可选项
   - 导入时，未选择书架的图书仍可被创建
   - 系统自动将未分配书架的图书标记为"未上架"

2. **显示阶段**：
   - 仪表盘显示所有图书（包括未上架）
   - AllBooksManager 可显示并筛选所有图书
   - 支持按状态（已上架/未上架）过滤

3. **管理阶段**：
   - 用户可以编辑图书，稍后分配书架
   - 用户可以将已上架的图书移除或重新分配
   - 删除图书时自动清理相关关联记录

## 后续建议

1. **前端优化**：
   - 在 AllBooksManager 中添加快速分配书架的功能
   - 为未上架图书添加视觉提示（如灰色标记或特殊图标）

2. **后端功能**：
   - 添加批量分配书架的 API 端点
   - 添加数据修复脚本（如果存在孤立的 BookMetadata 记录）

3. **用户指导**：
   - 在手动录入页面提示"书架为可选项"
   - 在导入流程中说明"未分配书架的图书会出现在全部图书页面"

---

## 技术总结

| 维度 | 变更 |
|------|------|
| **数据库查询** | INNER JOIN → LEFT OUTER JOIN |
| **API 端点** | 新增 `/api/books/all` |
| **前端调用** | getBookWall → getAllBooks |
| **类型系统** | 新增 BooksResponse 类型 |
| **功能完整性** | 从不支持未上架图书 → 完全支持 |
