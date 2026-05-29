# n8n 工作流部署指南

本目录包含两个 n8n 工作流，替代原 Dify 云端的智能录入助手和书房智能助手。

## 架构概览

```
┌─ 前端 ─────────────────────────────────────────────────┐
│  ChatAssistant.tsx (书房智能助手)                       │
│    → POST /webhook/smart-book-assistant                │
│                                                         │
│  SmartEntry.tsx Tab 4 (智能录入 AI 对话)                 │
│    → POST /webhook/book-entry                          │
└──────────────────┬──────────────────────────────────────┘
                   │
┌─ n8n (:5678) ───▼──────────────────────────────────────┐
│                                                         │
│  smart-book-assistant-workflow.json                     │
│    ├─ search    → POST /api/chat/search                 │
│    ├─ recommend → /api/chat/book/{id}/similar           │
│    ├─ detail    → /api/chat/book/{id}                   │
│    └─ help                                            │
│                                                         │
│  smart-entry-workflow.json                              │
│    ├─ single_entry → POST /api/smart-entry/isbn-lookup  │
│    ├─ enrich       → /api/smart-entry/missing-books     │
│    ├─ batch_import → 引导                               │
│    └─ help                                             │
└──────────────────┬──────────────────────────────────────┘
                   │
┌─ Backend (:8000)─▼──────────────────────────────────────┐
│  /api/chat/*  +  /api/smart-entry/*                     │
└─────────────────────────────────────────────────────────┘
```

## 一、前置条件

1. **n8n 已安装并运行**
   ```bash
   npx n8n
   # 访问 http://localhost:5678 打开管理界面
   ```

2. **后端 API 运行中**
   ```bash
   cd backend
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

3. **前端运行中**
   ```bash
   cd frontend
   npm run dev
   ```

## 二、导入工作流

### 2.1 书房智能助手 (smart-book-assistant)

1. n8n 管理界面 → Import from File
2. 选择 `n8n/smart-book-assistant-workflow.json`
3. 点击 Activate 激活
4. Webhook: `POST http://localhost:5678/webhook/smart-book-assistant`

**节点 (17 个)**:

| 场景 | 调用的后端 API | 功能 |
|------|---------------|------|
| search | `POST /api/chat/search` | n-gram 多字段加权搜索 |
| recommend | `POST /api/chat/search` → `GET /api/chat/book/{id}/similar` | 先找目标书 → 再推相似 |
| detail | `POST /api/chat/search` → `GET /api/chat/book/{id}` | 查找 → 获取详情+书架 |
| help | — | 功能介绍 |

### 2.2 智能录入助手 (smart-entry)

1. n8n 管理界面 → Import from File
2. 选择 `n8n/smart-entry-workflow.json`
3. 点击 Activate 激活
4. Webhook: `POST http://localhost:5678/webhook/book-entry`

**节点 (17 个)**:

| 场景 | 调用的后端 API | 功能 |
|------|---------------|------|
| single_entry | `POST /api/smart-entry/isbn-lookup` | ISBN 查询 + 格式化 |
| enrich | `GET /api/smart-entry/missing-books` → `POST /api/smart-entry/enrich/{id}` | 缺失列表 + 补全 |
| batch_import | — | 引导前往 /import |
| help | — | 功能介绍 |

## 三、n8n GlobalConfig 配置

为使工具代码使用统一的后端地址，在 n8n 工作流中添加 "GlobalConfig" Set 节点：

1. 添加 **Set** 节点，命名为 `GlobalConfig`
2. 配置值：
   ```json
   {
     "API_BASE_URL": "http://localhost:8000/api"
   }
   ```
3. 所有 Code 节点引用: `$('GlobalConfig').item.json.API_BASE_URL`

### 工具一: search_local_books — 路径分析

| 项目 | 值 |
|------|-----|
| 工具代码路径 | `${baseUrl}/chat/search` |
| 后端实际路由 | `POST /api/chat/search` |
| baseUrl 默认值 | `http://localhost:8000/api` |
| 完整请求 URL | `http://localhost:8000/api/chat/search` |
| 匹配结果 | ✅ **路径正确** |
| 请求方法 | POST ✅ |
| 请求体格式 | `{ query: str, limit: int }` ✅ |

### 工具二: get_book_detail — 路径分析

| 项目 | 值 |
|------|-----|
| 工具代码路径 | `${baseUrl}/chat/book/${bookId}` |
| 后端实际路由 | `GET /api/chat/book/{book_id}` (book_id: int) |
| baseUrl 默认值 | `http://localhost:8000/api` |
| 完整请求 URL | `http://localhost:8000/api/chat/book/{bookId}` |
| 匹配结果 | ✅ **路径正确** |
| 请求方法 | GET ✅ |
| 注意事项 | `bookId` 必须是有效整数，空字符串会返回 422 |

详细工具代码见 [tool-code-reference.js](tool-code-reference.js)。

## 四、环境变量配置

在前端 `.env` 中设置 n8n Webhook 地址：

```bash
# 书房智能助手 (ChatAssistant 页面)
VITE_N8N_BOOK_ASSISTANT_URL=http://localhost:5678/webhook/smart-book-assistant

# 智能录入助手 (SmartEntry 页面)
VITE_N8N_BOOK_ENTRY_URL=http://localhost:5678/webhook/book-entry
```

未设置时默认连接 `localhost:5678`。

## 四、测试验证

### 书房智能助手

| 输入 | 预期 |
|------|------|
| `有没有关于科幻的小说？` | 返回科幻类图书列表 |
| `推荐类似《三体》的书` | 先找到三体 → 推荐同作者/出版社的书 |
| `《活着》在哪个书架？` | 返回详情 + 所在书架 |
| `你好` | 功能介绍 |

### 智能录入助手

| 输入 | 预期 |
|------|------|
| `9787549021680` | 返回完整图书元数据 |
| `有哪些书信息不全？` | 列出不完整图书 + 完整度 |
| `帮我把《三体》补全` | 补全成功 + 字段详情 |
| `我要批量导入` | 引导前往 /import |

## 五、故障排查

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| Webhook 返回 404 | 工作流未激活 | n8n 中点击 Activate |
| API 调用超时 | 后端未启动或端口错误 | 确认 `python -m uvicorn app.main:app --port 8000` |
| 前端无响应 | CORS / n8n 未运行 | 确认 n8n 在 `localhost:5678` 运行 |
| 意图分类错误 | 规则未覆盖 | 修改 Code 节点中的正则规则 |

## 六、Dify 迁移对照

| 原 Dify 组件 | n8n 替代 |
|-------------|----------|
| 书房智能助手 Agent (Chatflow) | `smart-book-assistant-workflow.json` (17 nodes) |
| 智能录入助手 Chatflow | `smart-entry-workflow.json` (17 nodes) |
| Dify 知识库 (RAG) | Backend `/api/chat/search` n-gram ILIKE 搜索 |
| Dify Function Calling | HTTP Request 节点 → Backend REST API |
| Dify 多模态识别 | 规则引擎正则提取 ISBN |
