# 📚 书房管理系统 (NFC Books Manager)

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-v2.6.0-brightgreen)](https://github.com/jswantao/NFCbooksmanager)
[![Python](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/)
[![React](https://img.shields.io/badge/react-19-61dafb.svg)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/fastapi-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-3178c6.svg)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/jswantao/NFCbooksmanager/pulls)

基于三层模式架构的智能书房管理系统，支持 NFC 标签管理、豆瓣图书同步、数据可视化与 AI 智能助手。

---

## ✨ 核心功能

- 📡 **NFC 标签全生命周期管理** — 写入、读取、扫描回调、四级判断链自动跳转
- 🔗 **物理-逻辑书架映射** — 物理书架位置与逻辑分类的灵活映射
- 📖 **图书管理** — 手动录入、豆瓣 API 同步、编辑、删除、批量导入
- 🖼️ **封面墙** — 网格/列表双视图、无限滚动、密度切换
- 📥 **批量导入** — 支持 Excel/CSV/TXT/NeDB 文件、重复 ISBN 三策略处理
- 📊 **数据可视化** — 阅读趋势、来源分布、评分分布、阅读热力图
- 🎨 **多主题切换** — 6 种主题（含高对比度无障碍主题）+ 系统偏好跟随
- 💾 **数据备份与恢复** — 一键加密导出、WebDAV 云同步、恢复向导
- 🤖 **AI 智能助手** — n8n 工作流编排、智能录入与信息补全
- 🕵️ **操作审计日志** — 全操作自动记录、支持按类型/时间/实体检索

---

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18.x
- **Python** >= 3.11
- **npm** >= 9.x

### 1. 克隆项目

```bash
git clone https://github.com/jswantao/NFCbooksmanager.git
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

| 地址 | 说明 |
| --- | --- |
| http://localhost:5173 | 前端应用 |
| http://localhost:8000/docs | API 交互文档 (Swagger) |
| http://localhost:8000/redoc | API 参考文档 (ReDoc) |
| http://localhost:8000/health | 健康检查 |

---

## 🛠️ 技术栈

### 前端

| 技术 | 说明 |
| --- | --- |
| React 19 + TypeScript 5.x | UI 框架 |
| Ant Design 6 | UI 组件库 |
| React Router 7 | 路由管理 |
| Recharts 2 | 数据可视化 |
| @tanstack/react-virtual | 虚拟滚动 |
| Vite 5 | 构建工具 |

### 后端

| 技术 | 说明 |
| --- | --- |
| Python 3.11+ + FastAPI 0.115+ | Web 框架 |
| SQLAlchemy 2.0 + SQLite | ORM + 数据库 |
| Pydantic 2.10+ | 数据校验 |
| BeautifulSoup4 + httpx | 豆瓣爬虫 |
| loguru | 统一日志系统 |
| cryptography | Fernet 加密 |

---

## 📂 项目结构

```
NFCbooksmanager/
├── backend/
│   ├── app/
│   │   ├── api/              # API 路由（按功能拆分）
│   │   ├── core/             # 核心配置（Config/DB/依赖注入）
│   │   ├── models/           # SQLAlchemy 数据模型（10 表）
│   │   ├── schemas/          # Pydantic 请求/响应模型
│   │   ├── services/         # 业务逻辑（豆瓣/NFC/备份/智能录入）
│   │   ├── templates/        # Jinja2 NFC 移动端页面
│   │   ├── utils/            # 工具函数
│   │   └── main.py           # FastAPI 应用入口
│   ├── requirements.txt      # Python 依赖
│   ├── pyproject.toml        # 项目元数据 + 工具配置
│   └── .env.example          # 环境变量模板
│
├── frontend/
│   ├── src/
│   │   ├── components/       # 公共组件
│   │   ├── pages/            # 页面组件（19 页）
│   │   ├── services/         # API 服务层
│   │   ├── hooks/            # 自定义 Hook（15 个）
│   │   ├── theme/            # 主题系统（6 主题 + WCAG AA）
│   │   ├── types/            # TypeScript 类型定义
│   │   └── utils/            # 工具函数
│   ├── vite.config.ts        # Vite 构建配置
│   └── package.json          # 前端依赖
│
├── documents/                # 项目文档
├── .gitignore
├── LICENSE                   # MIT License
└── README.md
```

---

## 🔧 配置豆瓣 Cookie

豆瓣 API 需要登录态才能获取完整的图书信息。

### 获取步骤

1. 浏览器访问 https://book.douban.com 并登录
2. 按 `F12` 打开开发者工具 → **Network** 标签
3. 按 `F5` 刷新页面，找到任意请求
4. 在 **Request Headers** 中完整复制 `Cookie` 字段
5. 在系统管理后台 → **豆瓣 Cookie** 页面粘贴保存
6. 点击 **测试 Cookie** 验证有效性

> **注意**：Cookie 保存在本地服务器，不会上传第三方。建议 7 天更新一次。同步失败时可使用手动录入功能作为备用。

---

## 📊 数据库模型

| 表名 | 说明 |
| --- | --- |
| `physical_shelves` | 物理书架 |
| `logical_shelves` | 逻辑书架 |
| `physical_logical_mappings` | 物理-逻辑映射 |
| `book_metadata` | 图书元数据（ISBN 唯一） |
| `logical_shelf_books` | 书架-图书关联 |
| `sync_logs` | 豆瓣同步日志 |
| `activity_logs` | 操作审计日志 |
| `import_tasks` | 批量导入任务 |
| `nfc_write_tasks` | NFC 写入任务 |

---

## 🏗️ 系统架构

### 三级模式

```
外模式（NFC 交互层）  → NFC 标签读写 · 物理书架管理 · 移动端回调
中间模式（映射转换层） → 物理-逻辑映射 · 位置编码解析 · 书架查询
内模式（数据存储层）  → 图书元数据 · 豆瓣同步 · 数据分析
```

### NFC 四级判断链

```
手机扫描 NFC 标签
  ↓
第一级：NDEF 数据中有 shelf_id？ → 有 → 跳转
  ↓ 无
第二级：tag_uid 已绑定物理书架？ → 有映射 → 跳转书架
  ↓ 无映射 → 绑定逻辑书架引导
第三级：tag_uid 全部未绑定 → 引导绑定物理书架
```

---

## 🧪 开发

### 后端质量门禁

```bash
cd backend
ruff check .          # 代码风格
mypy app/             # 类型检查
pytest                # 测试（46 用例）
```

### 前端质量门禁

```bash
cd frontend
npx tsc --noEmit      # 类型检查
npm run lint          # ESLint
npm run test          # 测试
npm run build         # 构建
```

### 提交规范

```
feat:     新功能
fix:      修复 bug
docs:     文档更新
refactor: 重构
perf:     性能优化
test:     测试相关
chore:    构建/工具相关
```

---

## 🗺️ 路线图

| 优先级 | 功能 | 状态 |
| --- | --- | --- |
| P0 | 自动化测试体系 | 进行中 |
| P0 | Alembic 数据库迁移 | 计划中 |
| P0 | CI/CD 流水线 (GitHub Actions) | 计划中 |
| P1 | PostgreSQL 支持 | 计划中 |
| P1 | 多用户支持 | 计划中 |
| P2 | 豆瓣同步并发控制优化 | 计划中 |
| P2 | i18n 国际化 | 计划中 |
| P3 | Tauri 桌面客户端 | 计划中 |

---

## 📄 License

[MIT](LICENSE) © 2024-2026 jswantao

---

## 🙏 致谢

- [Ant Design](https://ant.design/) — React UI 组件库
- [FastAPI](https://fastapi.tiangolo.com/) — Python Web 框架
- [Recharts](https://recharts.org/) — React 图表库
- [豆瓣读书](https://book.douban.com/) — 图书数据源
