# 书房管理系统 — 项目经理交付文档

> 版本 v2.4.0 | 2026 年 5 月 27 日

## 一、项目概述

**书房管理系统 (NFC Books Manager)** 是一款面向个人藏书管理的全栈 Web 应用。通过 NFC 标签技术连接实体书架与数字信息，配合 n8n AI 工作流实现智能图书录入与搜索问答。

**核心价值**：将实体书房数字化，NFC 标签定位图书物理位置，AI 助手实现自然语言搜书与智能录入。

## 二、已完成功能清单

### 2.1 图书管理

| 功能 | 状态 | 说明 |
|------|------|------|
| 手动录入 | ✅ | 表单录入 + 本地上传封面 |
| 智能录入 | ✅ | ISBN 识别 → 多源查询 → 自动填充 → 书架选择 → 一键保存 |
| 豆瓣同步 | ✅ | ISBN 同步元数据（需 Cookie），支持多源降级 |
| Google Books | ✅ | 官方 API 适配器，API Key 可选，5 策略降级链 |
| 编辑/删除 | ✅ | 统一编辑器（全局 ID + 书架序号双模式） |
| 批量导入 | ✅ | Excel/CSV/TXT 文件 → 异步进度追踪 |
| 封面管理 | ✅ | 豆瓣代理 + 本地上传 + 占位图回退 |
| 来源标记 | ✅ | douban / manual / smart_entry / isbn / nfc |

### 2.2 书架与位置管理

| 功能 | 状态 | 说明 |
|------|------|------|
| 逻辑书架 CRUD | ✅ | 分类管理、乐观更新 |
| 物理书架管理 | ✅ | 实体位置 + NFC 标签 UID 绑定/解绑 |
| 物理-逻辑映射 | ✅ | 物理架 → 逻辑架灵活映射 |
| 书架视图 | ✅ | 图书网格+列表、排序筛选、封面墙 |

### 2.3 NFC 标签系统

| 功能 | 状态 | 说明 |
|------|------|------|
| 标签写入 | ✅ | 写入书架 ID + HMAC 校验 |
| 标签读取 | ✅ | 扫描 → 四级判断链自动跳转 |
| 移动端回调 | ✅ | 手机 NFC 扫描 → Web 页面跳转 |

### 2.4 AI 智能助手 (n8n 工作流)

| 功能 | 状态 | 说明 |
|------|------|------|
| 书房查询助手 | ✅ | 自然语言搜索、相似推荐、馆藏详情查询 |
| 智能录入助手 | ✅ | ISBN 查询、信息补全、批量导入引导 |
| Markdown 渲染 | ✅ | 标题、表格、引用、列表等 15 种格式 |
| n8n 双工作流 | ✅ | 17 节点 / 4 场景分支，规则引擎意图分类 |

### 2.5 数据管理

| 功能 | 状态 | 说明 |
|------|------|------|
| 数据备份 | ✅ | Fernet 加密导出，备份列表管理 |
| 数据恢复 | ✅ | 3 步向导（预览 → 冲突检测 → 执行） |
| WebDAV 云同步 | ✅ | AList/OpenList/CloudDrive 支持 |
| 操作审计 | ✅ | CUD 操作全记录 + 请求级中间件 |
| 豆瓣 Cookie 配置 | ✅ | 加密存储 + 有效性测试 |

### 2.6 前端体验

| 功能 | 状态 | 说明 |
|------|------|------|
| 多主题 | ✅ | 5 套主题 + 系统偏好跟随 |
| 数据可视化 | ✅ | 趋势图、饼图、柱状图、热力图 |
| 响应式设计 | ✅ | 桌面/平板/手机三端适配 |
| Storybook 文档 | ✅ | 6 组件 Story + a11y + interactions |

## 三、技术架构

```
┌─ 前端 (React 19 + TypeScript 6 + Vite 8) ─────────────────┐
│  20 页面组件 · 14 公共组件 · 5 主题 · Storybook 文档        │
├────────────────────────────────────────────────────────────┤
│  HTTP / WebSocket · Axios + fetch                           │
├────────────────────────────────────────────────────────────┤
│  n8n 工作流 (:5678)                                         │
│  ├─ smart-book-assistant  (17 nodes / 4 branches)           │
│  └─ book-entry            (17 nodes / 4 branches)           │
├────────────────────────────────────────────────────────────┤
│  后端 (Python 3.11+ · FastAPI · SQLAlchemy 2.0)            │
│  13 API 模块 · 96 路由 · 8 数据表 · Pydantic v2 泛型        │
├────────────────────────────────────────────────────────────┤
│  SQLite (WAL 模式) · 豆瓣 API · Google Books · OpenLibrary  │
└────────────────────────────────────────────────────────────┘
```

## 四、待处理事项与后续规划

### 高优先级

| 事项 | 预计工作量 | 说明 |
|------|-----------|------|
| 自动化测试 | 2-3 周 | pytest 后端 + Vitest 前端 |
| Alembic 数据库迁移 | 1 周 | 增量迁移替代 create_all |
| CI/CD 流水线 | 1 周 | GitHub Actions: lint→test→build |

### 中优先级

| 事项 | 说明 |
|------|------|
| 豆瓣同步并发控制 | 请求队列 + 自适应延迟 |
| PostgreSQL 支持 | JSONB、全文搜索 |
| 移动端适配优化 | NFC PWA 独立窗口 |

### 长期方向

| 事项 | 说明 |
|------|------|
| 多用户支持 | 家庭成员账户 + 书架隔离 |
| AI 推荐增强 | 基于阅读记录的个性化推荐 |
| 桌面客户端 | Tauri 跨平台应用 |

## 五、部署说明

### 环境要求

- **Node.js** >= 18.x（npm >= 9.x）
- **Python** >= 3.11
- **n8n** (可通过 `npx n8n` 启动)
- **SQLite** (无需额外安装)

### 启动步骤

```bash
# 1. 后端
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 2. n8n (新终端)
npx n8n
# → 导入 n8n/smart-book-assistant-workflow.json
# → 导入 n8n/smart-entry-workflow.json
# → 激活两个工作流

# 3. 前端 (新终端)
cd frontend
npm install
npm run dev
```

### 访问地址

| 服务 | 地址 |
|------|------|
| 前端应用 | http://localhost:5173 |
| 后端 API 文档 | http://localhost:8000/docs |
| n8n 管理界面 | http://localhost:5678 |
| Storybook 文档 | http://localhost:6006（`npm run storybook`） |

### 环境变量 (前端 .env)

```bash
# n8n Webhook 地址（生产环境改为实际地址）
VITE_N8N_BOOK_ASSISTANT_URL=http://localhost:5678/webhook/smart-book-assistant
VITE_N8N_BOOK_ENTRY_URL=http://localhost:5678/webhook/book-entry
```

## 六、访问演示

1. **首页**: http://localhost:5173 → 快捷操作入口
2. **AI 助手**: http://localhost:5173/chat → n8n 书房智能助手对话
3. **智能录入**: http://localhost:5173/smart-entry → 4 Tab：单本录入/信息补全/批量导入/AI 对话
4. **封面墙**: http://localhost:5173/wall → 全部馆藏网格/列表浏览
5. **管理后台**: http://localhost:5173/admin → 仪表盘 + 统计图表

---

> 文档维护人：jswantao | 最后更新：2026-05-27
