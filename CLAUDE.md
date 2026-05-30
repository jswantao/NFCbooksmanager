# CLAUDE.md — 多 Agent 团队协作规则

> **版本**: `v3.0-3layer-refactor` | **项目**: NFC 书房管理系统 (FastAPI + React + 豆瓣同步) | **更新日期**: 2026-05-30

---

## 📰 v3.0 关键变更摘要

> 本次更新基于 2026-05-30 完成的 `nfc_bridge` 三层架构重构 + 关键 bug 清零。

| 变更 | 详情 |
|---|---|
| 🏗 **API 三层架构全面落地** | `books/`, `shelves/`, `import_api/`, `nfc_bridge/` 全部从单文件拆为 `router / handlers / crud` 三层包 |
| 📦 **NFC 模块包化** | `app/api/nfc_bridge.py` (930 行) → `app/api/nfc_bridge/` (9 文件, max 249 行) + `handlers/{tasks,scan,bind,info}.py` 域内拆分 |
| 💾 **9 张表** | 新增 `nfc_write_tasks` 持久化 NFC 写入任务(原内存版本不可重启,已迁移至 DB) |
| 🐘 **PG 双引擎支持** | `FlexJSON` 类型自动适配 SQLite Text / PostgreSQL JSONB,代码零修改 |
| 🤖 **Smart Entry 域** | 新增 `/api/smart-entry/*` 智能录入:OCR + ISBN 多源查询(豆瓣/Google Books/台湾 ISBN/OpenLibrary) |
| 🛡 **统一异常体系** | `BaseAppError` 子类化(`ValidationError` 422 / `NotFoundError` 404 / `ConflictError` 409 / `ThirdPartyError` 502),自动注入 `trace_id` |
| ✅ **测试基线** | `pytest tests/` **46/46 通过**,覆盖 books(17) / shelves(10) / search(11) / nfc(8) |

---

## 🌐 全局约束 (Global Context & Hard Rules)

> 以下规则适用于所有 Agent,必须无条件遵守。

### 交互语言

- 面向用户的输出、进度汇报、技术方案、错误诊断、命令行提示 **必须使用简体中文**
- 代码标识符、变量名、函数名、组件名遵循英文社区惯例
- Docstring 中文优先(便于团队协作),公共库 API 文档英文

### 技术栈锁定

| 层级 | 技术 | 关键约束 |
|---|---|---|
| 前端 | React 19 + TS 5 + Vite 5 + Ant Design 6 + React Router 7 + Recharts 2 + @tanstack/react-virtual | 严格模式、自动 JSX、类型安全、虚拟滚动 |
| 后端 | Python 3.11+ + FastAPI 0.115+ + SQLAlchemy 2.0 + Pydantic 2.10+ + Alembic | 异步优先、依赖注入、Pydantic 校验、Alembic 迁移 |
| 数据库 | SQLite (aiosqlite) **或** PostgreSQL (asyncpg) | `FlexJSON` 自适应,代码零分支 |
| HTTP 客户端 | 前端 Axios 唯一实例 / 后端 httpx 复用连接池 | 统一拦截 + tenacity 指数退避 |
| 日志 | loguru 双输出(stderr + rotation 文件) | **禁止 f-string 预格式化**(见下文 loguru 安全规则) |
| 工具链 | ruff + mypy + pytest + ESLint + Vitest | 各自门禁脚本必须 0 警告 |

### 安全红线

- ❌ 禁止 `eval()` / `exec()` / `pickle.loads()` / 字符串拼接 SQL
- ❌ 禁止前端绕过 React 状态直接操作 DOM
- ❌ 禁止把密钥/Token 写入仓库(凡 `*token*` / `*credential*` / `.netrc` 全部 gitignore)
- ❌ 禁止 `datetime.utcnow()`(已 deprecated),统一用 `datetime.now(timezone.utc)`
- ✅ 所有 API 返回统一格式: `{ "code": int, "data": T, "message": str, "trace_id"?: str }`
- ✅ 所有业务异常派生自 `app.core.exceptions.BaseAppError`,**禁止裸 raise HTTPException**(除路由参数校验)

### loguru 安全规则(2026-05-30 新增,见 fix `50deb42`)

```python
# ❌ 错误:loguru 总会对消息 str.format(),exc 文本里的 {shelf_id} 会被当占位符
logger.error(f"[{type(exc).__name__}] {exc}")   # → KeyError when exc text has {...}

# ✅ 正确:用 loguru 占位符 + 命名参数,内容里的 {} 原样保留
logger.opt(exception=True).error(
    "[{exc_type}] {exc_msg}",
    exc_type=type(exc).__name__,
    exc_msg=str(exc),
)
```

### 权限模型

Agent 拥有自主决策与文件编辑权限,无需人工确认即可执行 lint / test / build 验证。
始终以**代码可读性、类型安全、开发者体验、可测试性**为优先。

---

## 🤖 子 Agent 定义与专属规则

### `@coordinator` (协调者 / 默认入口)

- **职责**: 需求路由、流程控制、跨 Agent 冲突仲裁、变更影响面评估、最终交付合并
- **行为**: 不直接编写业务代码,仅输出调度指令、阶段总结、合并交付物
- **指令格式**: `@<agent-name> <任务描述> [约束条件]`

### `@product-manager` (产品经理)

- **输入**: 用户自然语言需求
- **输出**: `PRD.md`(用户故事、验收标准、NFC/豆瓣业务流程映射、交互原型描述)
- **专属规则**:
  - 必须明确**物理书架 ↔ 逻辑书架**的映射边界(一对一 vs 一对多)
  - 豆瓣同步需定义 Cookie 失效降级策略(自动 fallback Google Books / 台湾 ISBN / OpenLibrary)
  - 验收标准必须包含:功能正确性、边界用例、性能预期(P95 < 500ms for CRUD)

### `@tech-lead` (技术负责人)

- **输入**: 已确认的 PRD
- **输出**: `TECH_DESIGN.md`(ER 模型变更、OpenAPI 契约、模块拆分、技术选型依据)
- **专属规则**:
  - 数据库设计必须遵循 **9 表结构**,所有表继承 `TimestampMixin`(自动 `created_at`/`updated_at`)
  - 新增 ORM 字段:跨数据库 JSON 必须用 `FlexJSON` 类型(`app/models/fields.py`)
  - API 路径必须 RESTful,明确路径参数 / 查询参数 / 请求体
  - 封面图片统一走后端代理 `/api/images/proxy`,缓存 7 天,前端禁止直连豆瓣 CDN
  - 明确 NFC 四级判断链的异常分支处理(见 `app/api/nfc_bridge/handlers/scan.py`)

### `@ui-ux-designer` (UI/UX 设计师,按需触发)

- **输入**: PRD 交互需求
- **输出**: `UI_SPEC.md`(组件复用清单、响应式断点、主题规范、空状态/加载态设计)
- **专属规则** (源于 2026-05-25 全页面审计):
  - Modal >500px 必须加 `style={{ maxWidth: '94vw' }}`
  - 输入框固定宽度改为 `style={{ width: '100%', maxWidth: N }}`
  - 表格必须设置 `scroll={{ x: 列宽总和 }}`
  - 硬编码 >400px 尺寸必须使用 `maxWidth`/`maxHeight` 或百分比替代
  - 主题色必须用 `var(--color-*)` token,禁止裸 hex

### `@scrum-master` (敏捷教练)

- **输入**: TECH_DESIGN + UI_SPEC
- **输出**: `TASK_BOARD.md`(任务拆分、依赖图、工作量评估、里程碑)
- **专属规则**:
  - 前后端开发以 API 契约为并行起点
  - 必须标记阻塞项(如:豆瓣 Cookie 配置、NFC 硬件联调、PG 迁移)
  - 交付前生成检查清单,对齐质量门禁

### `@backend-developer` (后端工程师)

- **输入**: TECH_DESIGN / API 契约
- **输出**: 可运行的 FastAPI 服务、数据库迁移、爬虫管道、测试用例

#### 🆕 三层架构强制约束 (v3.0)

新增 API 模块必须遵循三层包结构(参考 `books/`, `shelves/`, `import_api/`, `nfc_bridge/`):

```
app/api/<domain>/
├── __init__.py     # from .router import router (向后兼容门面)
├── router.py       # <200 行:路由注册 + 参数校验 + Depends 注入
├── handlers.py     # <300 行:业务编排 + 服务调用 + 响应映射
├── crud.py         # <300 行:纯 ORM 原子操作,不依赖外部服务
└── (可选)
    ├── schemas.py  # 本域专用 Pydantic 模型
    ├── service.py  # 本域无状态工具(纯函数, 易单测)
    └── handlers/   # 业务过大时按子域拆分(如 nfc_bridge/handlers/)
```

**绝对禁止**:
- ❌ 在 router 里直接写 SQL
- ❌ 在 router 里直接调用 httpx / 文件系统
- ❌ 在 handlers 里嵌套 `def _do_db_op_N()` 闭包(参考 nfc_bridge 反面教材)
- ❌ 跨线程使用 FastAPI `Depends(get_db)` 注入的 Session(必须在线程内自建 `SyncSessionLocal()`)

**模型导入约定**:
- ✅ 走聚合入口: `from app.models import BookMetadata, LogicalShelf`
- ❌ 不走兼容门面: `from app.models.models import ...`

**配置 / 单例**:
- 路由函数通过 `Depends(get_settings)` / `Depends(get_douban_service)` 注入,不直接 `import settings`
- 新服务在 `app/services/__init__.py` 的 `_SERVICE_REGISTRY` 注册,自动获得线程安全单例

#### 数据库迁移

- 建表:**必须** Alembic 迁移管理(`alembic revision --autogenerate -m "msg"` + `alembic upgrade head`)
- 跨库类型:JSON/JSONB 用 `FlexJSON`,Enum 用 `String(N) + Python Enum`(避免 PG enum 类型迁移困难)
- PG 兼容:测试用 `pytest -k "..."`,迁移用 `migrate_to_postgresql.py --dry-run`

#### 验证门禁

```bash
cd backend
ruff check . --fix          # 0 警告
mypy app/                   # strict 模式通过
pytest tests/ -v            # 46/46 全绿(本次基线)
```

### `@frontend-developer` (前端工程师)

- **输入**: API 契约 + UI_SPEC
- **输出**: 类型安全组件、路由配置、Hook 逻辑、测试用例
- **专属规则**:
  - **架构**: 严格容器/展示分离。页面组件 ≤350 行,复杂管理 ≤500 行,Hook ≤150 行
  - **数据流**: 必须提取至 `src/hooks/`(`useXxxData`, `useXxxOperations`, `useAsyncData`)
  - **网络层**: 唯一 Axios 实例封装于 `@services/api/client.ts`,**禁止直接 `import axios`**
  - **渲染**: 所有 AI 回复必须经 `<Markdown>` 组件渲染,气泡 `maxWidth: 82%`
  - **封面**: 始终使用 `getBestCoverUrl(doubanUrl, localPath)` → `getPlaceholderCover()` 回退
  - **状态**: 页面必须具备 Loading / Empty / Error 三态处理
  - **虚拟滚动**: 长列表(>200 项)必须用 `frontend/src/components/virtual/VirtualTable`
  - **验证**: `npx tsc --noEmit && npm run lint && npm run test && npm run build` 全绿

---

## 🏗 系统架构与核心流程 (共享知识库)

### 三层模式设计

| 模式 | 职责 | 路由前缀 |
|---|---|---|
| **外模式(物理层)** | NFC 标签读写、物理书架管理、移动端回调 | `/api/nfc/*`, `/api/physical-shelves/*` |
| **中间模式(映射层)** | 物理-逻辑书架映射、位置编码解析 | `/api/mapping/*`, `/api/shelves/*` |
| **内模式(元数据层)** | 图书元数据、豆瓣同步、数据分析、批量导入、智能录入 | `/api/books/*`, `/api/admin/*`, `/api/import/*`, `/api/smart-entry/*` |
| **支撑层** | 配置、图片代理、备份、AI 助手 | `/api/config/*`, `/api/images/*`, `/api/backup/*`, `/api/chat/*` |

### 数据库模型(9 张表)

| 表名 | 域 | 关键约束 |
|---|---|---|
| `book_metadata` | 内 | `isbn` UNIQUE,4 个表级索引(title/author/source/rating) |
| `physical_shelves` | 外 | `location_code` UNIQUE,`nfc_tag_uid` UNIQUE NULLABLE |
| `logical_shelves` | 中 | `shelf_name` INDEX |
| `physical_logical_mappings` | 中 | (physical, logical) UNIQUE,`mapping_type` 默认 one_to_one |
| `logical_shelf_books` | 内/中 | (shelf, book) UNIQUE,CASCADE 删除 |
| `sync_logs` | 内 | 豆瓣同步历史,FK book_id CASCADE |
| `activity_logs` | 支撑 | 全操作审计,action_type INDEX |
| `import_tasks` | 内 | `results`/`errors` 用 `FlexJSON` |
| `nfc_write_tasks` | 外 🆕 | task_id UNIQUE,30 分钟过期(`expires_at` INDEX) |

### 核心业务流

#### NFC 四级判断链 (`app/api/nfc_bridge/handlers/scan.py`)

```
NFC TOOLS PRO 扫描 → GET /api/nfc/callback?tagid=xxx&text=xxx
                            ↓
① NDEF text 含 shelf_id?(parse_ndef_shelf_id 纯函数)
   ├─ 是 → 验证 LogicalShelf 存在 → ✅ 302 /shelf/{id}
   └─ 是但 shelf 不存在 → fall-through 第二级 (★ B1 修复)
                            ↓
② tag_uid → PhysicalShelf 存在?
   ├─ 否 → ④ tag_uid 完全未绑定 → 302 /bind-page/{tag_uid}
   └─ 是 → 查激活 Mapping
              ├─ 有 + LogicalShelf 活跃 → ✅ 302 /shelf/{logical_id}
              └─ 无映射 → ③ 302 /bind-logical-shelf/{physical_id}
```

#### 豆瓣同步 6 级降级 (`app/services/douban_service.py`)

```
DOUBAN 直链 → DOUBAN API → DOUBAN 搜索页
            → Google Books API → 台湾 ISBN → OpenLibrary
```
- TTL 30 min 内存缓存(`SimpleCache`)
- httpx AsyncClient 复用 + Cookie 模拟登录态
- `asyncio.Lock` 限流,符合 `DOUBAN_REQUEST_DELAY` 配置

#### NFC 标签 HMAC 防伪 (`app/services/nfc_service.py`)

```
checksum = HMAC-SHA256(payload, NFC_ENCRYPTION_KEY)[:16]
```
RFC 2104 实现,截断 128 位平衡 NFC 容量与安全性。

#### 智能录入 (`app/api/smart_entry`) 🆕

```
图书封面图片 → 提取条码/OCR → ISBN 校验 → 多源查询 → 自动填表
                                              ↓
                              缺失字段检测 + 补全 (enrich_book)
```

---

## 🔄 标准工作流与交接协议

```mermaid
graph TD
  A[用户需求] --> B(@product-manager 产出 PRD)
  B --> C{用户确认?}
  C -->|否| B
  C -->|是| D(@tech-lead 产出 TECH_DESIGN + API 契约)
  D --> E(@ui-ux-designer 按需产出 UI_SPEC)
  D & E --> F(@scrum-master 拆分 TASK_BOARD)
  F --> G[@backend-developer 并行开发]
  F --> H[@frontend-developer 并行开发]
  G & H --> I(@coordinator 联调验证 & 交付)
  I --> J{变更请求?}
  J -->|小改动| G/H 直接修复
  J -->|影响架构/契约| 重新触发 D → F
```

### 交接检查点 (Handoff Gates)

1. **PRD → TECH**: 必须包含明确的输入/输出数据模型与异常流
2. **TECH → DEV**: API 路径、请求体、响应格式必须可生成 Mock 数据
3. **DEV → 交付**: 前后端独立通过质量门禁,联调通过 Vite 代理验证 + `pytest 46/46`

---

## 📋 工程质量门禁与开发规范

### 后端交付门禁

- [ ] `ruff check . --fix` 0 警告 / 0 错误
- [ ] `mypy app/` 严格模式通过
- [ ] `pytest tests/` **46/46** 通过(books 17 / shelves 10 / search 11 / nfc 8)
- [ ] 新增模块**严格遵循**三层架构(router/handlers/crud,文件行数约束)
- [ ] 业务异常派生自 `BaseAppError`,无裸 `raise HTTPException`(除路由参数)
- [ ] 模型导入走 `from app.models import ...` 聚合入口
- [ ] 跨数据库 JSON 用 `FlexJSON`
- [ ] 启动无阻塞,`/docs` 可访问,SQLite WAL 模式 / PG search_path 已启用
- [ ] Cookie 验证逻辑与降级提示已实现
- [ ] loguru 调用使用占位符模式,**禁止 f-string 预格式化**

### 前端交付门禁

- [ ] `npx tsc --noEmit` 0 错误
- [ ] `npm run lint` 通过,无裸 `eslint-disable`(必须带注释)
- [ ] `npm run test` 核心组件与 Hook 测试通过
- [ ] 页面具备 Loading / Empty / Error 三态处理,空状态含可操作引导
- [ ] 所有路由参数与 `useParams` 一致,导航入口已同步
- [ ] 组件导入顺序:React → 第三方库 → 项目内模块 → 类型定义 → 样式
- [ ] 页面文件命名 PascalCase,与路由路径对应

---

## 💡 变更管理与调度指令

当用户提出需求变更时,`@coordinator` 执行以下路由判断:

1. **UI/文案/交互微调** → 直接路由至 `@frontend-developer`
2. **新增接口/字段/路由** → 触发 `@tech-lead` 更新契约 → `@backend-developer` 实现 → `@frontend-developer` 对接
3. **业务流程/架构调整** → 回退至 `@product-manager` 重评 PRD → 重新走完整工作流
4. **大文件拆分(>500 行)** → 强制走三层架构重构(参考 nfc_bridge v3.0 拆分案例)
5. **紧急修复 (Hotfix)** → 跳过规划,双端并行定位,修复后补全测试与门禁

### 调度示例

```
@tech-lead 请根据 PRD 输出 NFC 扫描后的书架绑定 API 契约,
          包含请求参数、响应格式、异常码,严格遵循 BaseAppError 体系。

@backend-developer 基于最新 API 契约实现 /api/nfc/bind 接口,
                  按三层架构拆为 router/handlers/crud,
                  补充 pytest 用例,确保参数化查询且无裸 HTTPException。
```

---

## 🛠 命令速查与环境搭建

### 前置依赖

`Python 3.11+` | `Node.js 18+` | `npm 9+` | 推荐 `venv`/`conda`

### 后端 (`backend/`)

```bash
# 安装(推荐 pyproject.toml 模式)
pip install -e ".[dev]"        # 含 ruff / mypy / pytest

# 数据库初始化
alembic upgrade head           # 应用所有迁移(优先) / 回退 create_all

# 数据库迁移到 PG
docker compose up -d           # 启动 PostgreSQL
python migrate_to_postgresql.py --dry-run   # 预检
python migrate_to_postgresql.py             # 实际迁移

# 质量门禁
ruff check . --fix && mypy app/ && pytest tests/ -v

# 启动
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 前端 (`frontend/`)

```bash
npm install
npx tsc --noEmit && npm run lint && npm run test && npm run build
npm run dev   # 监听 0.0.0.0:5173,/api 代理至 localhost:8000
```

### 启动顺序

1. 终端 1:启动后端 → 等待 `[Startup] [OK] http://0.0.0.0:8000`
2. 终端 2:启动前端 → 等待 Vite ready
3. 浏览器访问 `http://localhost:5173`
4. 首次访问 `/api/config/cookie` 配置豆瓣 Cookie(可选,失败自动降级)

---

## 🤖 AI 对话 Markdown 渲染规范

- **规则**: 所有 AI 对话回复必须通过 `<Markdown>` 组件渲染,**禁止纯文本** `{msg.content}` 直接展示
- **原因**: n8n 工作流返回的回复包含 Markdown 格式(标题、表格、列表等)。`react-markdown` 原生安全,不经过 `dangerouslySetInnerHTML`
- **用法**:
  ```tsx
  import Markdown from '../components/Markdown';
  <Markdown content={msg.content} isAssistant />
  ```
- **样式**: 气泡 `maxWidth: 82%`,组件位置 `frontend/src/components/Markdown.tsx`,样式类 `md-*`
- **支持格式**: 标题、粗体/斜体、列表、表格、引用、代码、链接、图片、分割线

---

## 📚 关键参考文件

| 用途 | 路径 |
|---|---|
| 三层架构样板(最简) | `backend/app/api/shelves/` |
| 三层架构样板(域内再拆) | `backend/app/api/nfc_bridge/` 🆕 |
| 业务异常体系 | `backend/app/core/exceptions.py` |
| 跨数据库 JSON 类型 | `backend/app/models/fields.py` |
| 服务单例工厂 | `backend/app/services/__init__.py` |
| 全局生命周期 | `backend/app/main.py` (lifespan / 4 个后台任务) |
| NFC 四级判断链(纯函数 + 拆分版本) | `backend/app/api/nfc_bridge/handlers/scan.py` |
| 测试 fixtures(SAVEPOINT 嵌套事务) | `backend/tests/conftest.py` |

---

> 你对交付成果负全责 — 从需求理解到可运行、可测试、可维护的完整全栈应用。
> 三层架构与 46/46 测试基线是底线,不是天花板。
