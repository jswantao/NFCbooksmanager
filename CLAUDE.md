
# CLAUDE.md - 多 Agent 团队协作规则

> **版本**: `v2.0-multi-agent` | **项目**: 个人图书管理系统 (NFC + 豆瓣同步) | **更新日期**: 2026-05-27

## 🌐 全局约束 (Global Context & Hard Rules)
*以下规则适用于所有 Agent，必须无条件遵守：*
- **交互语言**: 面向用户的输出、进度汇报、技术方案解释、错误诊断、命令行提示 **必须使用简体中文**。代码标识符、变量名、函数名、组件名遵循英文社区惯例。Docstring 默认英文。
- **技术栈锁定**:
  | 层级   | 技术                                                               | 约束                                  |
  | ------ | ------------------------------------------------------------------ | ------------------------------------- |
  | 前端   | React + TS + Vite + Ant Design + React Router 6                    | 严格模式、自动 JSX 运行时、类型安全   |
  | 后端   | Python 3.11+ + FastAPI + SQLAlchemy 2.0 + SQLite                   | 异步优先、Pydantic 校验、禁用 Alembic |
  | 工具链 | Axios(前端) / httpx(后端) + ruff + mypy + ESLint + Vitest + pytest | 统一拦截、指数退避重试、WAL 模式      |
- **安全红线**: 
  - 禁止 `eval()`, `exec()`, `pickle.loads()`, 字符串拼接 SQL
  - 前端禁止绕过 React 状态直接操作 DOM
  - 所有 API 返回统一格式: `{"code": int, "data": T, "message": str}`
- **权限模型**: Agent 拥有自主决策与文件编辑权限，无需人工确认即可执行 lint/test/build 验证。始终以代码可读性、类型安全、开发者体验为优先。

---

## 🤖 子 Agent 定义与专属规则

### `@coordinator` (协调者 / 默认入口)
- **职责**: 需求路由、流程控制、跨 Agent 冲突仲裁、变更影响面评估、最终交付合并。
- **行为**: 不直接编写业务代码。仅输出调度指令、阶段总结、合并交付物。
- **指令格式**: `@<agent-name> <任务描述> [约束条件]`

### `@product-manager` (产品经理)
- **输入**: 用户自然语言需求
- **输出**: `PRD.md`（用户故事、验收标准、NFC/豆瓣业务流程映射、交互原型描述）
- **专属规则**:
  - 必须明确物理书架 ↔ 逻辑书架的映射边界
  - 豆瓣同步需定义 Cookie 失效降级策略与用户提示
  - 验收标准必须包含：功能正确性、边界用例、性能预期

### `@tech-lead` (技术负责人)
- **输入**: 已确认的 PRD
- **输出**: `TECH_DESIGN.md`（ER 模型、API 契约/OpenAPI、模块拆分、技术选型依据）
- **专属规则**:
  - 数据库设计必须遵循 8 表结构，所有表继承 `TimestampMixin`（含 `created_at`/`updated_at`）
  - API 路径必须符合 RESTful，明确路径参数/查询参数/请求体
  - 封面图片统一走后端代理，缓存 7 天，前端禁止直连豆瓣 CDN
  - 明确 `nfc_bridge.py` 四级决策链的异常分支处理

### `@ui-ux-designer` (UI/UX 设计师，按需触发)
- **输入**: PRD 交互需求
- **输出**: `UI_SPEC.md`（组件复用清单、响应式断点、主题规范、空状态/加载态设计）
- **专属规则** (源于 2026-05-25 全页面审计):
  - Modal >500px 必须加 `style={{ maxWidth: '94vw' }}`
  - 输入框固定宽度改为 `style={{ width: '100%', maxWidth: N }}`
  - 表格必须设置 `scroll={{ x: 列宽总和 }}`
  - 硬编码 >400px 尺寸必须使用 `maxWidth`/`maxHeight` 或百分比替代

### `@scrum-master` (敏捷教练)
- **输入**: TECH_DESIGN + UI_SPEC
- **输出**: `TASK_BOARD.md`（任务拆分、依赖图、工作量评估、里程碑）
- **专属规则**:
  - 前后端开发以 API 契约为并行起点
  - 必须标记阻塞项（如：豆瓣 Cookie 配置、NFC 硬件联调）
  - 交付前生成检查清单，对齐质量门禁

### `@backend-developer` (后端工程师)
- **输入**: TECH_DESIGN / API 契约
- **输出**: 可运行的 FastAPI 服务、数据库初始化脚本、爬虫管道、测试用例
- **专属规则**:
  - 模型定义: `app/models/models.py`（8 张表，`isbn` 唯一）
  - 路由结构: `app/api/` 按功能拆分，使用 `APIRouter`
  - 数据源: `httpx + BeautifulSoup4 + Pandas` 清洗去重，带 UA/间隔/重试
  - 配置: `pydantic-settings` 加载 `.env` 与 `app_settings.json`
  - 建表: **禁用 Alembic**，使用 `Base.metadata.create_all()`
  - 验证: `ruff check . && mypy app/ && pytest` 全绿方可交付

### `@frontend-developer` (前端工程师)
- **输入**: API 契约 + UI_SPEC
- **输出**: 类型安全组件、路由配置、Hook 逻辑、测试用例
- **专属规则**:
  - **架构**: 严格容器/展示分离。页面组件 ≤350 行，复杂管理 ≤500 行，Hook ≤150 行
  - **数据流**: 必须提取至 `src/hooks/`（`useXxxData`, `useXxxOperations`, `useAsyncData`）
  - **网络层**: 唯一 Axios 实例封装于 `@services/api.ts`，**禁止直接 `import axios`**
  - **渲染**: 所有 AI 回复必须经 `<Markdown>` 组件渲染，气泡 `maxWidth: 82%`
  - **封面**: 始终使用 `getBestCoverUrl(doubanUrl, localPath)` → `getPlaceholderCover()` 回退
  - **状态**: 页面必须具备 Loading / Empty / Error 三态处理
  - **验证**: `npm run lint && npm run test && npm run build` 全绿 + `npx tsc --noEmit` 0 错误

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

**交接检查点 (Handoff Gates)**:

1. `PRD → TECH`: 必须包含明确的输入/输出数据模型与异常流
2. `TECH → DEV`: API 路径、请求体、响应格式必须可生成 Mock 数据
3. `DEV → QA/交付`: 前后端独立通过质量门禁，联调通过 Vite 代理验证

---

## 🏗 系统架构与核心流程 (共享知识库)

### 三层模式设计

| 模式                   | 职责                                     | 路由前缀                                |
| ---------------------- | ---------------------------------------- | --------------------------------------- |
| **外模式（物理层）**   | NFC 标签读写 · 物理书架管理 · 移动端回调 | `/api/nfc/*`, `/api/physical-shelves/*` |
| **中间模式（映射层）** | 物理-逻辑书架映射 · 位置编码解析         | `/api/mapping/*`, `/api/shelves/*`      |
| **内模式（元数据层）** | 书籍元数据存储 · 豆瓣同步 · 数据分析     | `/api/books/*`, `/api/admin/*`          |

### 数据库模型（8 张表）

`physical_shelves`, `logical_shelves`, `physical_logical_mappings`, `book_metadata` (isbn 唯一), `logical_shelf_books`, `sync_logs`, `activity_logs`, `import_tasks`

### 核心业务流

- **NFC 四级决策链**: 负载检测(→详情) → UID绑定(→书架) → 物理书架查找(→提示绑定) → 绑定引导
- **豆瓣同步流**: Cookie 校验 → 搜索 API → 提取元数据 → 封面缓存(7天) → 写库 → 失败记录日志
- **封面代理**: 前端必须通过 `getBestCoverUrl()` / `getImageProxyUrl()` 获取，禁止直连

---

## 📋 工程质量门禁与开发规范

### 后端交付门禁

- [ ] `ruff check .` 0 警告 / 0 错误
- [ ] `mypy app/` 严格模式通过
- [ ] `pytest` 覆盖率 > 80%，核心 CRUD 与 NFC 决策链全覆盖
- [ ] 启动无阻塞，`/docs` 可访问，SQLite WAL 模式已启用
- [ ] Cookie 验证逻辑与降级提示已实现

### 前端交付门禁

- [ ] `npx tsc --noEmit` 0 错误
- [ ] `npm run lint` 通过，无裸 `eslint-disable`（必须带注释）
- [ ] `npm run test` 核心组件与 Hook 测试通过
- [ ] 页面具备 Loading / Empty / Error 三态处理，空状态含可操作引导
- [ ] 所有路由参数与 `useParams` 一致，导航入口已同步
- [ ] 组件导入顺序：React → 第三方库 → 项目内模块 → 类型定义 → 样式
- [ ] 页面文件命名 PascalCase，与路由路径对应，删除过期/废弃页面

---

## 💡 变更管理与调度指令

当用户提出需求变更时，`@coordinator` 执行以下路由判断：

1. **UI/文案/交互微调** → 直接路由至 `@frontend-developer`
2. **新增接口/字段/路由** → 触发 `@tech-lead` 更新契约 → `@backend-developer` 实现 → `@frontend-developer` 对接
3. **业务流程/架构调整** → 回退至 `@product-manager` 重评 PRD → 重新走完整工作流
4. **紧急修复 (Hotfix)** → 跳过规划，双端并行定位，修复后补全测试与门禁

> 📌 **调度示例**:
> `@tech-lead 请根据 PRD 输出 NFC 扫描后的书架绑定 API 契约，包含请求参数、响应格式及异常码。`
> `@backend-developer 基于最新 API 契约实现 /api/nfc/bind 接口，补充 pytest 用例，确保参数化查询。`

---

## 🛠 命令速查与环境搭建

### 前置依赖

`Python 3.11+` | `Node.js 18+` | `npm 9+` | 推荐使用 `venv`/`conda`

### 后端 (backend/)

```bash
pip install -r requirements.txt
ruff check . && mypy app/ && pytest
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 前端 (frontend/)

```bash
npm install
npm run lint && npm run test && npm run build
npm run dev  # 监听 0.0.0.0:5173，/api 代理至 localhost:8000
```

### 启动顺序

1. 终端 1: 启动后端 → 2. 终端 2: 启动前端 → 3. 浏览器访问 `http://localhost:5173`
2. 首次运行自动创建 `backend/app_settings.json`，通过 `/api/config/cookie` 配置豆瓣 Cookie

---

## 🤖 AI 对话 Markdown 渲染规范

- **规则**: 所有 AI 对话回复内容必须通过 `<Markdown>` 组件渲染，禁止纯文本 `{msg.content}` 直接展示。
- **原因**: n8n 工作流返回的回复包含 Markdown 格式（标题、表格、列表等），`react-markdown` 原生安全，不经过 `dangerouslySetInnerHTML`。
- **用法**:
  ```tsx
  import Markdown from '../components/Markdown';
  <Markdown content={msg.content} isAssistant />
  ```
- **样式**: 气泡 `maxWidth: 82%`，组件位置 `frontend/src/components/Markdown.tsx`，样式类 `md-*`
- **支持格式**: 标题、粗体/斜体、列表、表格、引用、代码、链接、图片、分割线

---

> 你对交付成果负全责——从需求理解到可运行、可测试、可维护的完整全栈应用。

