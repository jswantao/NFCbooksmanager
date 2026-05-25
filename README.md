# 📚 书房管理系统 (NFC Books Manager)

基于三级模式架构（外模式 NFC 交互 → 中间模式映射转换 → 内模式数据存储）的智能书房管理系统，通过 NFC 技术连接实体书架与数字信息。

---

## ✨ 功能特性

### 核心功能

- 📡 **NFC 标签全生命周期管理**：写入、读取、扫描回调、四级判断链自动跳转
- 🔗 **物理-逻辑书架映射**：物理书架位置与逻辑分类的灵活映射关系
- 📖 **图书管理**：手动录入、豆瓣 API 同步、编辑、删除、批量导入
- 📚 **书架管理**：逻辑书架 CRUD、物理书架 CRUD、NFC 标签 UID 绑定/解绑
- 🖼️ **封面墙**：网格/列表双视图、无限滚动、密度切换、全屏模式
- 📥 **批量导入**：支持 Excel/CSV/TXT 文件导入、异步进度追踪
- 🔍 **智能搜索**：支持书名、作者、ISBN、出版社多维度模糊搜索

### 高级特性

- 💾 **数据备份与恢复**：一键加密导出全量数据、WebDAV 云同步（支持 AList/OpenList/CloudDrive）、恢复向导含冲突检测和 dry-run 预览
- 🕵️ **操作审计日志**：所有 CUD 操作自动记录到 `activity_logs` 表，支持按类型/时间/实体检索，请求级中间件审计
- 🎨 **多主题切换**：书香经典、暗夜阅读、墨竹青翠、海洋之蓝、樱花纷飞（5 种主题 + 系统偏好跟随）
- 📊 **数据可视化**：阅读趋势折线图、来源分布饼图、评分分布柱状图、月度热力图
- 🖼️ **图片缓存系统**：本地封面缓存（7 天有效期）、原子写入、缓存统计
- 📱 **PWA 支持**：Service Worker 离线缓存、添加到主屏幕、推送通知
- ⚡ **性能优化**：React.lazy 代码分割、图片懒加载、虚拟滚动表格、请求去重
- 📝 **完整日志系统**：loguru 多通道输出、文件轮转、自动压缩
- 🔄 **乐观更新**：关键操作立即更新 UI，失败时自动回滚
- 🎯 **类型安全**：TypeScript 严格模式，完整的类型定义和泛型约束
- 🔗 **统一图书引用**：BookReference 双模式定位（全局 ID + 书架序号），BookService 服务层封装

---

## 🛠️ 技术栈

### 前端

| 技术                    | 版本 | 说明           |
| ----------------------- | ---- | -------------- |
| React                   | 19   | UI 框架        |
| TypeScript              | 5.x  | 类型安全       |
| Ant Design              | 6    | UI 组件库      |
| React Router            | 7.14 | 路由管理       |
| Recharts                | 2.15 | 数据可视化图表 |
| @tanstack/react-virtual | 3.11 | 虚拟滚动       |
| Axios                   | 1.x  | HTTP 客户端    |
| Vite                    | 5.x  | 构建工具       |
| dayjs                   | 1.x  | 日期处理       |

### 后端

| 技术           | 版本   | 说明                                       |
| -------------- | ------ | ------------------------------------------ |
| Python         | 3.11+  | 运行环境                                   |
| FastAPI        | 0.115+ | Web 框架                                   |
| SQLAlchemy     | 2.0+   | ORM（同步 + 异步引擎）                     |
| SQLite         | -      | 数据库（可通过 aiosqlite 异步访问）        |
| Pydantic       | 2.10+  | 数据校验                                   |
| BeautifulSoup4 | 4.12+  | HTML 解析                                  |
| httpx          | 0.28+  | 异步 HTTP 客户端                           |
| loguru         | 0.7+   | 统一日志系统（全项目替换 logging + print） |
| Jinja2         | 3.1+   | 模板引擎（NFC 移动端页面）                 |
| cachetools     | 6.0+   | TTL 缓存（豆瓣搜索结果）                   |
| cryptography   | 43.0+  | Fernet 加密（Cookie + 备份文件）           |
| Pandas         | 2.x    | 数据处理（导入功能）                       |
| pyproject.toml | -      | 项目元数据 + 依赖 + 工具配置（ruff/mypy/pytest） |

---

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18.x
- **Python** >= 3.11
- **npm** >= 9.x

### 1. 克隆项目

```bash
git clone https://github.com/your-repo/NFCbooksmanager.git
cd NFCbooksmanager
```

### 2. 后端启动

```bash
cd backend

# 创建虚拟环境
python -m venv venv

# 激活虚拟环境
source venv/bin/activate   # macOS/Linux
venv\Scripts\activate      # Windows

# 安装依赖
pip install -r requirements.txt

# 配置环境变量（可选）
cp .env.example .env

# 启动服务
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. 前端启动

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 4. 访问系统

| 地址                         | 说明         |
| ---------------------------- | ------------ |
| http://localhost:5173        | 前端应用     |
| http://localhost:8000/docs   | API 交互文档 |
| http://localhost:8000/redoc  | API 参考文档 |
| http://localhost:8000/health | 健康检查     |

### 5. 局域网访问（手机 NFC 测试）

```bash
# 后端监听所有网络接口
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 前端监听所有网络接口（vite.config.ts 已配置）
# 手机访问：http://<你的局域网IP>:5173
# 手机 NFC：http://<你的局域网IP>:8000/api/nfc/mobile
```

---

## 📖 API 文档

启动后端后访问 http://localhost:8000/docs 查看完整的 Swagger UI 交互文档。

### 核心 API 端点

| 前缀                        | 说明                 | 层级     |
| --------------------------- | -------------------- | -------- |
| `/api/nfc/*`              | NFC 读写、回调、绑定 | 外模式   |
| `/api/mapping/*`          | 物理-逻辑映射        | 中间模式 |
| `/api/shelves/*`          | 逻辑书架管理         | 中间模式 |
| `/api/books/*`            | 图书 CRUD、同步      | 内模式   |
| `/api/physical-shelves/*` | 物理书架管理         | 外模式   |
| `/api/admin/*`            | 管理统计             | 内模式   |
| `/api/images/*`           | 图片代理/缓存        | 工具     |
| `/api/import/*`           | 批量导入             | 工具     |
| `/api/config/*`           | Cookie 配置          | 工具     |
| `/api/backup/*`           | 备份/恢复/WebDAV     | 工具     |

---

## 🔧 配置豆瓣 Cookie

豆瓣 API 需要登录态才能获取完整的图书信息。

### 获取步骤

1. 浏览器访问 https://book.douban.com 并登录
2. 按 `F12` 打开开发者工具 → **Network（网络）** 标签
3. 按 `F5` 刷新页面
4. 在请求列表中找到任意请求，查看 **Request Headers**
5. 完整复制 `Cookie` 字段的值
6. 在系统管理后台 → **豆瓣 Cookie** 页面粘贴保存
7. 点击 **测试 Cookie** 验证有效性

### 注意事项

- Cookie 通常 1-7 天后过期，需定期更新
- 建议使用备用账号，避免主账号因异常请求被限制
- Cookie 配置保存在服务器本地，不会上传第三方
- 同步失败时可使用**手动录入**功能作为备用方案

---

## 📂 项目结构

```
NFCbooksmanager/
├── backend/
│   ├── app/
│   │   ├── api/              # API 路由（11 个模块）
│   │   │   ├── nfc_bridge.py     # NFC 桥接（写入/读取/回调/绑定）
│   │   │   ├── mapping.py        # 映射管理
│   │   │   ├── shelves.py        # 逻辑书架管理（含书架序号操作）
│   │   │   ├── books.py          # 图书管理（含统一操作入口 /api/books/action）
│   │   │   ├── physical_shelves.py # 物理书架管理
│   │   │   ├── admin.py          # 管理统计（仪表盘 + 操作日志 + 同步日志）
│   │   │   ├── images.py         # 图片代理/缓存
│   │   │   ├── config_api.py     # Cookie 配置
│   │   │   ├── import_api.py     # 批量导入
│   │   │   ├── backup.py         # 备份/恢复/WebDAV 云同步（14 个端点）
│   │   │   └── __init__.py
│   │   ├── core/             # 核心配置
│   │   │   ├── config.py         # 应用配置（pydantic-settings + Fernet 加密 + WebDAV）
│   │   │   ├── database.py       # 数据库引擎/会话 + 异步工具
│   │   │   ├── dependencies.py   # FastAPI Depends() 依赖注入（Settings/DoubanService）
│   │   │   ├── jinja_setup.py    # Jinja2 模板引擎配置
│   │   │   └── seed.py           # 种子数据
│   │   ├── models/           # 数据模型（SQLAlchemy ORM）
│   │   │   └── models.py         # 9 张数据表（含 NfcWriteTask）
│   │   ├── schemas/          # Pydantic 请求/响应模型（按域拆分，10 个模块）
│   │   │   ├── common.py         # 通用模型 + AppSchema 基类 + ApiResponse/PaginatedResponse 泛型
│   │   │   ├── nfc.py            # NFC 相关模型
│   │   │   ├── mapping.py        # 映射相关模型
│   │   │   ├── shelf.py          # 书架相关模型
│   │   │   ├── book.py           # 图书相关模型
│   │   │   ├── book_ops.py       # 图书操作模型
│   │   │   ├── cookie.py         # Cookie 管理模型
│   │   │   ├── import_schema.py  # 批量导入模型
│   │   │   ├── dashboard.py      # 仪表盘与管理配置模型
│   │   │   ├── backup.py         # 备份/恢复/WebDAV 模型（14 个 Schema）
│   │   │   └── __init__.py       # 统一导出 + model_rebuild() 前向引用修复
│   │   ├── services/         # 业务服务
│   │   │   ├── douban_service.py # 豆瓣服务编排（多策略搜索 + TTLCache + asyncio.Lock）
│   │   │   ├── douban_parser.py  # 豆瓣 HTML 解析器（纯函数式 + 封面尺寸精确替换）
│   │   │   ├── nfc_service.py    # NFC 载荷生成/校验（HMAC-SHA256 消息认证码）
│   │   │   └── backup_service.py # 备份服务（Fernet 加密 + 冲突检测 + WebDAV 同步 + 定时备份）
│   │   ├── templates/        # Jinja2 模板
│   │   │   ├── error.html        # 错误页面
│   │   │   ├── result.html       # NFC 扫描结果页
│   │   │   ├── mobile.html       # 手机端操作页
│   │   │   ├── bind.html         # NFC 标签绑定页
│   │   │   └── bind_logical.html # 逻辑书架绑定页
│   │   ├── utils/            # 工具函数
│   │   │   ├── helpers.py        # ISBN 清洗等通用工具
│   │   │   ├── sort_mappings.py  # 共享排序字典（3 个映射表）
│   │   │   └── activity_logger.py # 统一操作审计日志（ActivityLog 写入，19 个端点调用）
│   │   └── main.py           # FastAPI 应用入口
│   ├── cache/                # 图片缓存目录（每小时自动清理过期文件）
│   │   └── images/
│   ├── backups/              # 加密备份文件目录（.backup 格式）
│   ├── logs/                 # 日志文件目录（loguru 多通道：app.log + app.error.log）
│   ├── requirements.txt      # Python 依赖
│   ├── pyproject.toml        # 项目配置（元数据 + 依赖 + ruff/mypy/pytest）
│   └── .env.example          # 环境变量示例（含备份和 WebDAV 配置）
│
├── frontend/
│   ├── public/               # 静态资源
│   │   ├── manifest.json     # PWA 清单
│   │   ├── sw.js             # Service Worker
│   │   ├── icon-192.png      # PWA 图标
│   │   └── icon-512.png      # PWA 图标
│   ├── src/
│   │   ├── components/       # 公共组件（14 个）
│   │   │   ├── AppHeader.tsx     # 应用导航栏（响应式 + 移动端抽屉）
│   │   │   ├── BookCard.tsx      # 图书卡片（网格/列表/紧凑三模式）
│   │   │   ├── ErrorBoundary.tsx # 错误边界（自动恢复 + 重试限制）
│   │   │   ├── LazyImage.tsx     # 懒加载图片（渐进式 + 错误重试）
│   │   │   ├── LoadingScreen.tsx # 加载屏幕（超时检测 + 进度条）
│   │   │   ├── ShelfSelector.tsx # 书架选择器（搜索 + 已添加标记）
│   │   │   ├── ShelfSwitcher.tsx # 书架切换器（下拉/卡片/侧边栏）
│   │   │   ├── ThemeSwitcher.tsx # 主题切换器（快捷键 + 系统跟随）
│   │   │   ├── VirtualTable.tsx  # 虚拟滚动表格（排序 + 选择）
│   │   │   └── charts/           # 图表组件
│   │   │       ├── RatingBarChart.tsx   # 评分分布柱状图
│   │   │       ├── ReadingHeatmap.tsx   # 阅读热力图
│   │   │       ├── ReadingTrendChart.tsx # 阅读趋势折线图
│   │   │       └── SourcePieChart.tsx   # 来源分布饼图
│   │   ├── pages/            # 页面组件（18 个）
│   │   │   ├── HomePage.tsx          # 系统首页（Hero 横幅 + 快捷操作）
│   │   │   ├── NFCOperator.tsx       # NFC 操作中心（QR 码 + 状态查看）
│   │   │   ├── BookSearch.tsx        # 图书搜索（ISBN 同步 + 历史记录）
│   │   │   ├── BookDetail.tsx        # 图书详情（时间线 + 评分展示）
│   │   │   ├── BookManualAdd.tsx     # 手动录入（草稿保存 + 封面预览）
│   │   │   ├── BookManualEdit.tsx    # 编辑图书（表单守卫 + 变更追踪）
│   │   │   ├── BookEditor.tsx        # 统一图书编辑（双模式路由：全局ID + 书架序号）
│   │   │   ├── BookCoverWall.tsx     # 封面墙（无限滚动 + 全屏模式）
│   │   │   ├── ShelfView.tsx         # 书架视图（键盘导航 + 搜索排序）
│   │   │   ├── ShelfManager.tsx      # 逻辑书架管理（乐观更新 + 搜索）
│   │   │   ├── PhysicalShelfManager.tsx # 物理书架管理（NFC 绑定 + 映射）
│   │   │   ├── AllBooksManager.tsx   # 全部图书管理（导出 + 批量操作）
│   │   │   ├── BatchImport.tsx       # 批量导入（步骤流程 + 进度追踪）
│   │   │   ├── CookieConfig.tsx      # Cookie 配置（有效期提醒 + 测试）
│   │   │   ├── Dashboard.tsx         # 管理仪表盘（多图表 + 统计概览）
│   │   │   ├── BackupManager.tsx     # 备份管理（4 标签页：即时/列表/自动/云同步）
│   │   │   └── BackupRestore.tsx     # 恢复向导（3 步：预览→冲突检测→结果）
│   │   ├── services/         # API 服务层
│   │   │   ├── api.ts               # Axios 封装（请求去重 + 错误重试 + 14 个备份 API）
│   │   │   └── bookService.ts       # BookService 统一图书操作（BookReference 双模式定位）
│   │   ├── theme/            # 主题系统
│   │   │   ├── themes.ts            # 5 种主题定义 + 工具函数
│   │   │   └── ThemeContext.tsx      # 主题上下文（系统跟随 + 动画过渡）
│   │   ├── hooks/            # 公共自定义 Hook（7 个）
│   │   │   ├── useAsyncData.ts      # 通用异步数据加载
│   │   │   ├── useDebouncedValue.ts # 防抖值
│   │   │   ├── usePagination.ts     # 分页状态管理
│   │   │   ├── useKeyboardShortcut.ts # 键盘快捷键
│   │   │   ├── usePolling.ts        # 通用轮询
│   │   │   ├── useFormDraft.ts      # 表单草稿 localStorage 管理
│   │   │   ├── useBookManager.ts    # 图书管理（BookService 封装 + BookReference 定位）
│   │   │   └── index.ts             # Hook 统一导出
│   │   ├── constants/        # 共享常量
│   │   │   └── book.ts             # 图书来源/装订/排序配置
│   │   ├── types/            # TypeScript 类型
│   │   │   ├── index.ts             # 完整类型定义（50+ 接口，含备份/WebDAV）
│   │   │   └── bookRef.ts           # BookReference 类型系统（GlobalBookId/ShelfId/ShelfBookIndex）
│   │   ├── utils/            # 工具函数
│   │   │   ├── format.ts            # 格式化（日期/数字/文本）
│   │   │   ├── helpers.ts           # 通用工具（防抖/节流/深拷贝）
│   │   │   └── image.ts             # 图片处理（占位图/预加载）
│   │   ├── icons.ts          # 图标统一导入（70+ 图标）
│   │   ├── index.css         # 全局样式（设计令牌 + 暗色模式）
│   │   ├── main.tsx          # 应用入口（全局错误边界 + Provider）
│   │   └── App.tsx           # 根组件（路由配置 + 页面动画）
│   ├── index.html            # HTML 模板（PWA + SEO 优化）
│   ├── vite.config.ts        # Vite 配置（精细分包 + 路径别名）
│   └── package.json          # 前端依赖
│
└── README.md                 # 项目文档
```

---

## 🏗️ 系统架构

### 三级模式架构

```
┌─────────────────────────────────────────────────────────────┐
│                        外模式（NFC 交互层）                    │
│  NFC 标签读写 → 手机端操作 → 扫描回调 → 四级判断链           │
│  物理书架管理 → UID 绑定/解绑                                 │
├─────────────────────────────────────────────────────────────┤
│                       中间模式（映射转换层）                    │
│  物理-逻辑映射 → 位置编码解析 → 逻辑书架查询                  │
│  图书列表 → 排序搜索 → 视图切换                               │
├─────────────────────────────────────────────────────────────┤
│                       内模式（数据存储层）                      │
│  图书元数据 → 豆瓣同步 → 手动录入/编辑                        │
│  管理统计 → 数据可视化 → 日志记录                             │
└─────────────────────────────────────────────────────────────┘
```

### NFC 四级判断链

```
手机扫描 NFC 标签
    ↓
┌──────────────────────────────────────────────┐
│ 第一级：NDEF 数据中是否有 shelf_id？           │
│   ├── 有 → 验证逻辑书架 → ✅ 跳转              │
│   └── 无 → 第二级                              │
├──────────────────────────────────────────────┤
│ 第二级：tag_uid 是否绑定物理书架？              │
│   ├── 已绑定 → 查找逻辑映射                    │
│   │   ├── 有映射 → ✅ 跳转                     │
│   │   └── 无映射 → 📱 绑定逻辑书架             │
│   └── 未绑定 → 第三级                          │
├──────────────────────────────────────────────┤
│ 第三级：tag_uid 是否绑定物理书架？              │
│   ├── 已绑定（无逻辑映射）→ 📱 绑定逻辑书架    │
│   └── 未绑定 → 📱 绑定物理书架                 │
└──────────────────────────────────────────────┘
```

---

## 📊 数据库模型

| 表名                          | 说明                   | 字段数 |
| ----------------------------- | ---------------------- | ------ |
| `physical_shelves`          | 物理书架               | 7      |
| `logical_shelves`           | 逻辑书架               | 5      |
| `physical_logical_mappings` | 物理-逻辑映射          | 7      |
| `book_metadata`             | 图书元数据             | 18     |
| `logical_shelf_books`       | 书架-图书关联          | 7      |
| `sync_logs`                 | 豆瓣同步日志           | 6      |
| `activity_logs`             | 操作活动日志           | 7      |
| `import_tasks`              | 批量导入任务           | 15     |
| `nfc_write_tasks`           | NFC 写入任务（持久化） | 7      |

---

## 🎨 前端架构亮点

### 组件设计

- **14 个公共组件**：高度可复用，支持多种视图模式和交互方式
- **18 个页面组件**：每个页面功能完整，独立加载（React.lazy）
- **4 个图表组件**：统一的加载/空状态/错误处理
- **15 个自定义 Hook**：容器/展示分离，纯逻辑与 UI 渲染职责清晰

### 状态管理

- **主题上下文**：5 种预设主题 + 系统偏好跟随 + 平滑过渡动画
- **公共 Hooks**：`useAsyncData`（异步数据加载）、`useDebouncedValue`（防抖）、`usePagination`（分页）、`useKeyboardShortcut`（快捷键），统一位于 `src/hooks/`
- **共享常量**：图书来源标签、装订选项、排序配置等统一维护在 `src/constants/book.ts`
- **乐观更新**：关键操作（NFC 绑定/解绑、图书删除）立即更新 UI

### 性能优化

- **路由级代码分割**：页面按需加载，减少首屏体积
- **异步 DB 操作**：后端同步数据库操作通过 `run_sync_db_block()` 放入线程池，避免阻塞事件循环
- **精细分包策略**：React 核心、Ant Design、图表库独立打包
- **虚拟滚动**：大数据量表格使用 @tanstack/react-virtual
- **图片懒加载**：IntersectionObserver + 渐进式加载 + 格式回退
- **请求去重**：相同 GET 请求自动取消，避免重复调用

### 用户体验

- **响应式设计**：桌面端、平板、手机端全面适配
- **键盘导航**：快捷键支持（⌘K 搜索、⌘S 保存、←→ 切换书架）
- **错误边界**：组件错误自动恢复，最多重试 3 次
- **路由守卫**：编辑页面未保存更改时拦截离开
- **搜索防抖**：300ms 防抖减少不必要的请求

---

## 📝 开发规范

### 代码风格

- **前端**：TypeScript 严格模式，ESLint + Prettier
- **后端**：PEP 8 规范，Type Hints 全覆盖

### 项目约定

- **文件命名**：组件文件使用 PascalCase，工具文件使用 camelCase
- **组件结构**：类型定义 → 常量 → 自定义 Hook → 子组件 → 主组件
- **导入顺序**：React → 第三方库 → 内部模块 → 类型 → 样式
- **错误处理**：统一使用 `extractErrorMessage` 提取错误消息
- **API 调用**：所有请求通过 `api.ts` 统一管理，不直接使用 axios

### 提交规范

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式（不影响功能）
refactor: 重构
perf: 性能优化
test: 测试相关
chore: 构建/工具相关
```

---

## ⚠️ 技术债务

以下为已识别的技术债务，按严重程度分级列出，供后续迭代逐步解决。

### 🔴 高优先级（性能/安全/稳定性）

| 债务项                              | 说明                                                                     | 建议方案                                                      | 状态      |
| ----------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- | --------- |
| **NFC bridge HTML-in-Python** | `app/api/nfc_bridge.py` 约 750 行为内联 HTML/CSS/JS 的 Python f-string | 迁移至 Jinja2 模板引擎，将模板文件分离到 `templates/` 目录  | ✅ 已解决 |
| **豆瓣 Cookie 明文存储**      | `app_settings.json` 中 Cookie 以明文 JSON 存放                         | 使用 Fernet 加密（`cryptography` 库），SECRET_KEY 派生密钥  | ✅ 已解决 |
| **SimpleCache 无界增长**      | 内存缓存无 LRU 淘汰和容量上限，长时间运行可能 OOM                        | 引入 `cachetools.TTLCache`（maxsize=1000, TTL=30min）       | ✅ 已解决 |
| **混用 logging / loguru**     | 部分模块使用标准 `logging`，日志分散                                   | 全项目统一使用 `loguru`，移除 `logging` 和 `print()`    | ✅ 已解决 |
| **DoubanService 并发安全**    | 缓存字典在多协程环境下无锁保护                                           | 添加 `asyncio.Lock` 保护缓存读写                            | ✅ 已解决 |
| **NFC 校验和为简单哈希**      | `nfc_service.py` 使用 `SHA256(str + key)[:16]` 而非 HMAC             | 改用 `hashlib.hmac` 实现消息认证码（HMAC-SHA256，RFC 2104） | ✅ 已解决 |
| **同步 Session 阻塞事件循环** | 路由中大量使用 `SyncSessionLocal()` 在 async 中执行同步 DB 操作        | 使用 `run_sync_db_block()` 将同步 DB 操作放入线程池         | ✅ 已解决 |
| **缺少测试覆盖**              | 前后端均无自动化测试文件                                                 | 为核心 API 和服务层添加测试                                   | ⏳ 待处理 |
| **WebDAV 代理直连**      | httpx 走系统代理导致 localhost WebDAV 返回 502                            | `proxy=None` + `trust_env=False` + 每次新建 client            | ✅ 已解决 |
| **审计日志缺失**          | 5/9 API 文件无任何日志，ActivityLog 仅 backup_service 写入                | 创建 activity_logger + 19 端点覆盖 + 请求中间件              | ✅ 已解决 |
| **备份状态显示 0**        | `listBackups` 未提取 ApiResponse.data 层                                  | `.then(r => r.data)` 提取嵌套数组                           | ✅ 已解决 |
| **Pydantic 前向引用**     | `ShelfBooksResponse`/`BookSyncResponse` 未调用 `model_rebuild()`          | `schemas/__init__.py` 末尾调用 `model_rebuild()`             | ✅ 已解决 |

### 🟡 中优先级（代码质量/可维护性）

| 债务项                                       | 说明                                                                            | 建议方案                                                                                                                                      | 状态        |
| -------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **巨型页面组件**                       | 页面组件 800~1300 行，业务逻辑、UI、样式混在一起      | 提取自定义 Hook 到 `src/hooks/`（已完成 7 个），BookEditor 统一双路由编辑、BackupManager/RestoreWizard 拆分 | 🔄 部分解决 |
| **巨型路由文件**                       | `nfc_bridge.py` 和 `douban_service.py` 超长      | `nfc_bridge.py`: Jinja2 模板(-633行) + bind-logical-shelf 新路由; `douban_service.py`: douban_parser.py 提取(-344行) | ✅ 已解决 |
| **`print()` 替代日志**               | `config.py`、`database.py`、`seed.py` 中使用 `print()` 输出启动诊断信息 | 统一使用 `loguru.logger`，通过 sink 配置输出到文件和控制台                                                                                  | ✅ 已解决   |
| **Pydantic schemas 单文件**            | `schemas.py` 952 行，所有域的 schema 混在一起                                 | 拆分为 9 个域模块（common/nfc/mapping/shelf/book/book_ops/cookie/import_schema/dashboard），原文件已删除                                      | ✅ 已解决   |
| **重复的 `model_config` 声明**       | 24 个 Pydantic 模型各自声明 `ConfigDict(from_attributes=True)`                | 提取 `AppSchema` 基类统一配置，所有模型继承自 AppSchema                                                                                     | ✅ 已解决   |
| **API 响应类型松散**                   | `ApiResponse.data` 为 `Optional[Any]`，绕过后端类型检查                     | 改造为泛型 `ApiResponse[T]` 和 `PaginatedResponse[T]`（12 个路由全部声明 `ApiResponse[None]`）                                          | ✅ 已解决   |
| **无 Alembic 数据库迁移**              | 表结构依赖 `Base.metadata.create_all()`，无法增量迁移                         | 引入 Alembic，生成初始迁移脚本                                                                                                                | ⏳ 待处理   |
| **重复排序映射**                       | `books.py` 和 `shelves.py` 中 `sort_mapping` 被复制 4 次                  | 提取到 `app/utils/sort_mappings.py` 共享模块（3 个字典：BOOK_LIST_SORT / SHELF_BOOK_SORT / SHELF_LIST_SORT）                                | ✅ 已解决   |
| **`@hybrid_property` 无 SQL 表达式** | 仅支持 Python 层计算，无法在查询中过滤                                          | 为 6 个 hybrid_property 补充 `@expression`（book_count / active_mapping_count / rating_float / physical_location / progress / is_finished） | ✅ 已解决   |
| **`pages` 字段为字符串**             | `BookMetadata.pages` 使用 `String(20)` 存储页数                             | 改为 `Integer` 类型，Pydantic Schema 同步更新为 `Optional[int]`                                                                           | ✅ 已解决   |

### 🟢 低优先级（体验/规范）

| 债务项                                     | 说明                                                | 建议方案                                          | 状态      |
| ------------------------------------------ | --------------------------------------------------- | ------------------------------------------------- | --------- |
| **Pydantic v1 / v2 风格混用**        | `physical_shelves.py` 使用 `class Config`（v1） | 统一为 Pydantic v2 风格                           | ⏳ 待处理 |
| **ImportTask JSON 文本列**           | `results`、`errors` 列使用 `Text` 存储 JSON   | 如果切换 PostgreSQL，改为 `JSONB` 类型          | ⏳ 待处理 |
| **`time.time()` 限流在异步中使用** | `douban_service.py` 用 `time.time()` 做限流     | 改用 `time.monotonic()` 单调时钟                | ✅ 已解决 |
| **`_get_local_ip` 无缓存**         | 每次调用创建 UDP socket 获取本机 IP                 | 添加 1 小时 TTL 缓存                              | ✅ 已解决 |
| **写入任务存储于内存**               | NFC 写入任务在模块级 `_tasks` 字典中，重启丢失    | 迁移至 `nfc_write_tasks` 数据库表               | ✅ 已解决 |
| **图片缓存无自动清理**               | 封面缓存目录可能无限增长                            | 添加 `_image_cache_cleanup_loop()` 后台定时清理 | ✅ 已解决 |
| **缺少 pyproject.toml**              | 后端无 `pyproject.toml`                           | 迁移至 `pyproject.toml` 统一管理                | ✅ 已解决 |
| **缺少 `.env.example` 文档**       | 未列出所有可配置项和默认值                          | 补充完整的配置项说明（含备份和 WebDAV）            | ✅ 已解决 |
| **`Form.useWatch` 条件调用**     | hooks 在早期 return 之后，触发 Hooks 顺序错误   | 移至组件顶层（所有 hooks 在条件返回之前）        | ✅ 已解决 |
| **`useBlocker` v6→v7 API**     | React Router 7.14 不再接受 v6 回调参数               | 移除 useBlocker，改用 beforeunload 浏览器原生拦截   | ✅ 已解决 |
| **`NFCReadResult` 未使用**       | `api.ts` 导入但无任何引用                              | 移除未使用的类型导入                              | ✅ 已解决 |

---

## 🗺️ 未来规划

以下为后续版本的功能方向规划，按优先级排列。


### P0 — 基础设施补全（v2.1）

| 功能 | 目标 | 状态 |
| ---- | ---- | ---- |
| **自动化测试体系** | 后端 pytest 覆盖核心 API 和服务层；前端 Vitest + React Testing Library 覆盖关键组件和 Hook | ⏳ 待处理 |
| **Alembic 数据库迁移** | 引入 Alembic，生成初始迁移脚本，建立增量迁移流程 | ⏳ 待处理 |
| **CI/CD 流水线** | GitHub Actions：lint → type-check → test → build → deploy | ⏳ 待处理 |
| **代码质量度量** | 集成 SonarQube 进行静态分析，跟踪技术债务趋势 | ⏳ 待处理 |
| **Storybook 组件库** | 创建完整的 Storybook 组件库文档，支持交互式预览和视觉回归测试 | ⏳ 待处理 |

### P1 — 系统可靠性提升（v2.2）

| 功能 | 目标 | 状态 |
| ---- | ---- | ---- |
| **Jinja2 模板迁移** | 将 NFC bridge HTML/Python 混合代码迁移至 Jinja2 模板（5 个模板文件，-633 行） | ✅ 已完成 |
| **日志系统统一** | 全项目统一使用 loguru，移除标准 logging 依赖，替换 23 处 print() | ✅ 已完成 |
| **依赖注入重构** | FastAPI Depends() 统一管理 DoubanService/数据库会话（创建 dependencies.py，6 个 API 文件重构） | ✅ 已完成 |
| **豆瓣服务优化** | SimpleCache → TTLCache + asyncio.Lock 并发安全 + monotonic() 时钟 + 封面尺寸精确替换 | ✅ 已完成 |
| **配置管理增强** | 完善 .env.example（含备份+WebDAV），创建 pyproject.toml（ruff+mypy+pytest），Fernet Cookie 加密 | ✅ 已完成 |
| **操作审计日志** | 创建 activity_logger 工具，19 个 CUD 端点覆盖，请求级中间件审计，Admin /logs 增强 | ✅ 已完成 |
| **数据备份与恢复** | 一键加密导出、WebDAV 云同步、恢复向导（冲突检测+3 策略）、定时备份（asyncio loop） | ✅ 已完成 |
| **前端组件开发规范** | CLAUDE.md 新增组件开发规范：容器/展示分离、Hook 提取标准、行数限制、模板示例 | ✅ 已完成 |
| **巨型页面拆分** | BackupManager(534→290)、BackupRestore(343→171)、AllBooksManager(1123→890)、BatchImport(1321→1249) | ✅ 已完成 |
| **NFC 任务管理** | NFC 写入任务 CRUD、扫描回调四级判断链、标签数据 HMAC 校验、bind-logical-shelf 路由 | ✅ 已完成 |
| **响应式布局优化** | 全部页面适配桌面/平板/手机三端，18 个路由组件均测试通过 | ✅ 已完成 |
| **UI 现代化升级** | 全局 CSS 设计令牌（柔和阴影/多级过渡/字体比例）、Ant Design 组件覆盖（卡片/表格/按钮/输入框/标签页） | ✅ 已完成 |

### P2 — 功能拓展（v2.3）

| 功能 | 目标 | 状态 |
| ---- | ---- | ---- |
| **豆瓣同步并发控制** | 改进豆瓣数据同步的并发控制，加入请求队列和自适应延迟，避免 429 限流 | ⏳ 待处理 |
| **API 限流机制** | 使用令牌桶算法为后端 API 增加限流保护，保障高并发下的稳定性 | ⏳ 待处理 |
| **PWA 离线优化** | 完善 PWA 配置，优化 Service Worker 缓存策略，支持离线访问核心页面 | ⏳ 待处理 |
| **图书标签打印** | 生成包含 ISBN、书名、位置编码的标签图片，支持打印机输出 | ⏳ 待处理 |
| **阅读统计增强** | 阅读进度追踪、读书笔记关联、年度阅读报告 | ⏳ 待处理 |
| **多用户支持** | 家庭成员账户切换，个人书架隔离，共享书架的权限控制 | ⏳ 待处理 |
| **移动端适配优化** | NFC 操作页面 PWA 独立窗口，扫描历史记录，离线缓存增强 | ⏳ 待处理 |
| **PostgreSQL 支持** | 除 SQLite 外正式支持 PostgreSQL，利用 JSONB、全文搜索等特性 | ⏳ 待处理 |
| **数据库连接池管理** | 扩展数据库连接池管理，支持连接监控、自动恢复和健康检查 | ⏳ 待处理 |

### P3 — 体验与智能化（v2.4+）

| 功能 | 目标 | 状态 |
| ---- | ---- | ---- |
| **AI 图书推荐** | 基于馆藏和阅读记录，使用 LLM 生成个性化推荐 | ⏳ 待处理 |
| **OCR 识别录入** | 拍照识别图书封面或 ISBN 条形码，自动录入 | ⏳ 待处理 |
| **图书社区集成** | 与豆瓣、Goodreads 等的评分/评论同步，社交分享 | ⏳ 待处理 |
| **语音搜索** | 支持中文语音输入搜索馆藏图书 | ⏳ 待处理 |
| **桌面客户端** | 基于 Tauri 的桌面应用，支持系统托盘、全局快捷键、离线使用 | ⏳ 待处理 |
| **i18n 国际化** | 中/英/日多语言界面支持（推荐 react-i18next） | ⏳ 待处理 |
| **前端安全增强** | 添加 CSP (Content Security Policy) 和 XSS 防护 | ⏳ 待处理 |

---

## 📄 License

MIT License

Copyright (c) 2024-2026

---

## 🙏 致谢

- [Ant Design](https://ant.design/) - 优秀的 React UI 组件库
- [FastAPI](https://fastapi.tiangolo.com/) - 高性能 Python Web 框架
- [Recharts](https://recharts.org/) - React 图表库
- [@tanstack/react-virtual](https://tanstack.com/virtual) - 虚拟滚动解决方案
- [豆瓣读书](https://book.douban.com/) - 图书数据源
