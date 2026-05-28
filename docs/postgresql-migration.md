# PostgreSQL 数据库迁移指南

> 版本 v2.5.0 | 2026-05-27

## 概述

书房管理系统自 v2.5.0 起正式支持 PostgreSQL 作为数据库选项。相比 SQLite，PostgreSQL 提供：

| 特性 | SQLite | PostgreSQL |
|------|--------|------------|
| 全文搜索 | n-gram + ILIKE（应用层） | tsvector + GIN 索引（数据库层） |
| JSON 存储 | TEXT (JSON 字符串) | JSONB（二进制 + 索引） |
| 并发写入 | WAL 模式，单写者 | MVCC，多写者 |
| 连接池 | StaticPool | QueuePool (动态扩容) |
| 适用规模 | 单用户 / 小型部署 | 多用户 / 生产环境 |

## 1. 安装 PostgreSQL

### Windows

从 [postgresql.org](https://www.postgresql.org/download/windows/) 下载安装包，或使用 `winget`:

```powershell
winget install PostgreSQL.PostgreSQL
```

### macOS

```bash
brew install postgresql@16
brew services start postgresql@16
```

### Linux (Ubuntu/Debian)

```bash
sudo apt install postgresql
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### Docker (推荐)

```bash
docker run -d \
  --name bookshelf-pg \
  -e POSTGRES_USER=bookshelf \
  -e POSTGRES_PASSWORD=change-me \
  -e POSTGRES_DB=bookshelf \
  -p 5432:5432 \
  postgres:16-alpine
```

## 2. 创建数据库

```bash
# 方式 1: psql 命令行
psql -U postgres
postgres=# CREATE DATABASE bookshelf;
postgres=# CREATE USER bookshelf WITH PASSWORD 'change-me';
postgres=# GRANT ALL PRIVILEGES ON DATABASE bookshelf TO bookshelf;
postgres=# \q

# 方式 2: createdb 命令
createdb -U postgres bookshelf
```

## 3. 配置环境变量

编辑 `backend/.env`:

```bash
# 数据库类型
DB_TYPE=postgresql

# PostgreSQL 连接 URL (格式: postgresql+asyncpg://user:password@host:port/dbname)
DATABASE_URL=postgresql+asyncpg://bookshelf:change-me@localhost:5432/bookshelf

# 连接池配置
DATABASE_POOL_SIZE=5
DATABASE_POOL_MAX_OVERFLOW=10

# 模式名
PG_SCHEMA=public
```

### 连接 URL 参数

可在 URL 中附加参数：

```
postgresql+asyncpg://user:pass@host/db?ssl=require&connect_timeout=10
```

常用参数：
- `ssl=require` — 强制 SSL 连接（生产环境推荐）
- `connect_timeout=10` — 连接超时秒数
- `application_name=bookshelf` — 连接标识

## 4. 数据迁移

### 全新安装（无现有数据）

直接启动后端即可自动创建表结构：

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 从 SQLite 迁移

使用内置迁移脚本：

```bash
cd backend

# 预览模式（检查数据量和表结构）
python migrate_to_postgresql.py --dry-run

# 正式迁移
python migrate_to_postgresql.py \
  --source sqlite+aiosqlite:///./bookshelf.db \
  --target postgresql+asyncpg://bookshelf:change-me@localhost:5432/bookshelf
```

迁移流程：
1. 分析 SQLite 表结构 → 2. 导出数据 → 3. 在 PG 创建表 → 4. 导入数据 → 5. 重置序列

### 从备份文件恢复

```bash
# 1. 先在 PostgreSQL 配置下启动后端 → 自动创建表结构
# 2. 通过管理后台 → 数据恢复 → 上传 .backup 文件
# 3. 恢复向导会自动处理外键约束和序列
```

## 5. 验证

### 检查数据库连接

```bash
curl http://localhost:8000/health
```

返回 JSON 应包含：
```json
{
  "database": {
    "type": "PostgreSQL",
    "status": "healthy",
    "tables": 9,
    "size": "1.2 MB"
  }
}
```

### 检查 PostgreSQL 扩展

```bash
psql -U bookshelf -d bookshelf -c "\dx"
```

应包含 `pg_trgm` 扩展。

### 检查全文搜索索引

```bash
psql -U bookshelf -d bookshelf -c "\di ix_books_fts"
psql -U bookshelf -d bookshelf -c "\di ix_books_title_trgm"
```

### 测试搜索

```bash
# API 搜索
curl "http://localhost:8000/api/books/search?keyword=三体&limit=5"

# AI 搜索
curl -X POST http://localhost:8000/api/chat/search \
  -H "Content-Type: application/json" \
  -d '{"query": "科幻小说", "limit": 5}'
```

## 6. 性能调优

### PostgreSQL 配置 (postgresql.conf)

```ini
# 内存
shared_buffers = 256MB        # 系统内存的 25%
effective_cache_size = 1GB    # 系统内存的 75%

# 查询规划
random_page_cost = 1.1        # SSD 环境
work_mem = 16MB               # 排序/哈希操作内存

# 写入
wal_buffers = 16MB
synchronous_commit = off      # 可接受少量数据丢失时
```

### 索引维护

```sql
-- 重建索引（定期执行）
REINDEX TABLE book_metadata;

-- 更新统计信息
ANALYZE book_metadata;

-- 查看索引使用情况
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE tablename = 'book_metadata'
ORDER BY idx_scan DESC;
```

## 7. 故障排查

### 连接被拒绝

```bash
# 检查 PostgreSQL 是否运行
pg_isready -h localhost -p 5432

# 检查 pg_hba.conf 允许密码认证
# 默认路径: /etc/postgresql/16/main/pg_hba.conf
# 确保包含: host all all 127.0.0.1/32 md5
```

### 迁移失败

```bash
# 检查目标数据库是否为空
psql -U bookshelf -d bookshelf -c "\dt"

# 如果有残留表，先删除
psql -U bookshelf -d bookshelf -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

### 搜索引擎回退

如果全文搜索无结果，系统会自动回退到 ILIKE 模糊匹配（利用 pg_trgm 索引加速）。可通过 `search_engine` 字段查看实际使用的引擎：

```json
{
  "search_engine": "postgresql_tsvector"
}
```

## 8. 回退到 SQLite

只需修改 `.env`:

```bash
DB_TYPE=sqlite
DATABASE_URL=sqlite+aiosqlite:///./bookshelf.db
```

重启后端即可。注意：PG 中的数据不会自动导出到 SQLite，如需保留请使用备份功能。
