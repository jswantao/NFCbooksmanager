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

- 🎨 **多主题切换**：书香经典、暗夜阅读、墨竹青翠、海洋之蓝、樱花纷飞（5 种主题 + 系统偏好跟随）
- 📊 **数据可视化**：阅读趋势折线图、来源分布饼图、评分分布柱状图、月度热力图
- 🖼️ **图片缓存系统**：本地封面缓存（7 天有效期）、原子写入、缓存统计
- 📱 **PWA 支持**：Service Worker 离线缓存、添加到主屏幕、推送通知
- ⚡ **性能优化**：React.lazy 代码分割、图片懒加载、虚拟滚动表格、请求去重
- 📝 **完整日志系统**：loguru 多通道输出、文件轮转、自动压缩
- 🔄 **乐观更新**：关键操作立即更新 UI，失败时自动回滚
- 🎯 **类型安全**：TypeScript 严格模式，完整的类型定义和泛型约束

---

## 🛠️ 技术栈

### 前端

| 技术                    | 版本   | 说明                |
| ----------------------- | ------ | ------------------- |
| React                   | 19     | UI 框架             |
| TypeScript              | 5.x    | 类型安全            |
| Ant Design              | 6      | UI 组件库           |
| React Router            | 6.28   | 路由管理            |
| Recharts                | 2.15   | 数据可视化图表      |
| @tanstack/react-virtual | 3.11   | 虚拟滚动            |
| Axios                   | 1.x    | HTTP 客户端         |
| Vite                    | 5.x    | 构建工具            |
| dayjs                   | 1.x    | 日期处理            |

### 后端

| 技术           | 版本   | 说明                        |
| -------------- | ------ | --------------------------- |
| Python         | 3.11+  | 运行环境                    |
| FastAPI        | 0.115+ | Web 框架                    |
| SQLAlchemy     | 2.0+   | ORM                         |
| SQLite         | -      | 数据库（可升级 PostgreSQL） |
| Pydantic       | 2.10+  | 数据校验                    |
| BeautifulSoup4 | 4.12+  | HTML 解析                   |
| httpx          | 0.28+  | 异步 HTTP 客户端            |
| loguru         | 0.7+   | 日志系统                    |
| Pandas         | 2.x    | 数据处理（导入功能）        |

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
│   │   ├── api/              # API 路由（10 个模块）
│   │   │   ├── nfc_bridge.py     # NFC 桥接（写入/读取/回调/绑定）
│   │   │   ├── mapping.py        # 映射管理
│   │   │   ├── shelves.py        # 逻辑书架管理
│   │   │   ├── books.py          # 图书管理
│   │   │   ├── physical_shelves.py # 物理书架管理
│   │   │   ├── admin.py          # 管理统计
│   │   │   ├── images.py         # 图片代理/缓存
│   │   │   ├── config_api.py     # Cookie 配置
│   │   │   ├── import_api.py     # 批量导入
│   │   │   └── __init__.py
│   │   ├── core/             # 核心配置
│   │   │   ├── config.py         # 应用配置（pydantic-settings）
│   │   │   ├── database.py       # 数据库引擎/会话
│   │   │   └── seed.py           # 种子数据
│   │   ├── models/           # 数据模型（SQLAlchemy ORM）
│   │   │   └── models.py         # 8 张核心数据表
│   │   ├── schemas/          # Pydantic 请求/响应模型
│   │   │   └── schemas.py
│   │   ├── services/         # 业务服务
│   │   │   ├── douban_service.py # 豆瓣爬虫（多策略搜索）
│   │   │   └── nfc_service.py    # NFC 载荷生成/校验
│   │   └── main.py           # FastAPI 应用入口
│   ├── cache/                # 图片缓存目录
│   │   └── images/
│   ├── logs/                 # 日志文件目录
│   ├── requirements.txt      # Python 依赖
│   └── .env.example          # 环境变量示例
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
│   │   ├── pages/            # 页面组件（15 个）
│   │   │   ├── HomePage.tsx          # 系统首页（Hero 横幅 + 快捷操作）
│   │   │   ├── NFCOperator.tsx       # NFC 操作中心（QR 码 + 状态查看）
│   │   │   ├── BookSearch.tsx        # 图书搜索（ISBN 同步 + 历史记录）
│   │   │   ├── BookDetail.tsx        # 图书详情（时间线 + 评分展示）
│   │   │   ├── BookManualAdd.tsx     # 手动录入（草稿保存 + 封面预览）
│   │   │   ├── BookManualEdit.tsx    # 编辑图书（路由守卫 + 恢复原始值）
│   │   │   ├── BookCoverWall.tsx     # 封面墙（无限滚动 + 全屏模式）
│   │   │   ├── ShelfView.tsx         # 书架视图（键盘导航 + 搜索排序）
│   │   │   ├── ShelfManager.tsx      # 逻辑书架管理（乐观更新 + 搜索）
│   │   │   ├── PhysicalShelfManager.tsx # 物理书架管理（NFC 绑定 + 映射）
│   │   │   ├── AllBooksManager.tsx   # 全部图书管理（导出 + 批量操作）
│   │   │   ├── BatchImport.tsx       # 批量导入（步骤流程 + 进度追踪）
│   │   │   ├── CookieConfig.tsx      # Cookie 配置（有效期提醒 + 测试）
│   │   │   └── Dashboard.tsx         # 管理仪表盘（多图表 + 导出报告）
│   │   ├── services/         # API 服务层
│   │   │   └── api.ts               # Axios 封装（请求去重 + 错误重试）
│   │   ├── theme/            # 主题系统
│   │   │   ├── themes.ts            # 5 种主题定义 + 工具函数
│   │   │   └── ThemeContext.tsx      # 主题上下文（系统跟随 + 动画过渡）
│   │   ├── types/            # TypeScript 类型
│   │   │   └── index.ts             # 完整类型定义（40+ 接口）
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

| 表名                          | 说明          | 字段数 |
| ----------------------------- | ------------- | ------ |
| `physical_shelves`          | 物理书架      | 7      |
| `logical_shelves`           | 逻辑书架      | 5      |
| `physical_logical_mappings` | 物理-逻辑映射 | 7      |
| `book_metadata`             | 图书元数据    | 18     |
| `logical_shelf_books`       | 书架-图书关联 | 7      |
| `sync_logs`                 | 豆瓣同步日志  | 6      |
| `activity_logs`             | 操作活动日志  | 7      |
| `import_tasks`              | 批量导入任务  | 15     |

---

## 🎨 前端架构亮点

### 组件设计

- **14 个公共组件**：高度可复用，支持多种视图模式和交互方式
- **15 个页面组件**：每个页面功能完整，独立加载（React.lazy）
- **4 个图表组件**：统一的加载/空状态/错误处理

### 状态管理

- **主题上下文**：5 种预设主题 + 系统偏好跟随 + 平滑过渡动画
- **自定义 Hooks**：数据加载、表单管理、轮询逻辑等可复用逻辑封装
- **乐观更新**：关键操作（NFC 绑定/解绑、图书删除）立即更新 UI

### 性能优化

- **路由级代码分割**：页面按需加载，减少首屏体积
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

## 📄 License

MIT License

Copyright (c) 2024-2025

---

## 🙏 致谢

- [Ant Design](https://ant.design/) - 优秀的 React UI 组件库
- [FastAPI](https://fastapi.tiangolo.com/) - 高性能 Python Web 框架
- [Recharts](https://recharts.org/) - React 图表库
- [@tanstack/react-virtual](https://tanstack.com/virtual) - 虚拟滚动解决方案
- [豆瓣读书](https://book.douban.com/) - 图书数据源