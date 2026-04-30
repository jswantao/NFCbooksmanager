# 📚 书房管理系统 (NFC Books Manager)

基于三级模式架构（物理书架 → 逻辑书架 → 图书）的智能书房管理系统。

## ✨ 功能特性

- 📡 **NFC 标签管理**：读取和写入 NFC 标签，实现物理书架定位
- 🔗 **物理-逻辑映射**：将物理书架位置映射到逻辑分类
- 📖 **图书管理**：手动录入、豆瓣同步、批量导入图书
- 📚 **书架管理**：创建和管理逻辑书架分类
- 🖼️ **封面墙**：可视化展示所有藏书
- 📥 **批量导入**：支持 Excel/CSV/TXT 文件导入
- 🔍 **智能搜索**：支持书名、作者、ISBN 等多维度搜索

## 🛠️ 技术栈

### 前端

- React 18 + TypeScript
- Ant Design 5
- React Router 6
- Axios
- Vite

### 后端

- Python 3.11+
- FastAPI
- SQLAlchemy 2.0
- SQLite
- BeautifulSoup4 + httpx
- Pandas

## 🚀 快速开始

### 1. 克隆项目

\`\`\`bash
git clone https://github.com/your-repo/NFCbooksmanager.git
cd NFCbooksmanager
\`\`\`

### 2. 后端启动

\`\`\`bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # 编辑配置文件
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
\`\`\`

### 3. 前端启动

\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`

### 4. 访问

- 前端: http://localhost:5173
- API 文档: http://localhost:8000/docs
- 健康检查: http://localhost:8000/health

## 📖 API 文档

启动后端后访问 http://localhost:8000/docs 查看完整 API 文档。

## 🔧 配置豆瓣 Cookie

1. 登录 https://book.douban.com
2. F12 打开开发者工具 → Network 标签
3. 刷新页面，复制任意请求的 Cookie
4. 在管理后台 → Cookie 配置中粘贴

## 📂 项目结构

\`\`\`
NFCbooksmanager/
├── backend/
│   ├── app/
│   │   ├── api/          # API 路由
│   │   ├── core/         # 核心配置
│   │   ├── models/       # 数据模型
│   │   ├── schemas/      # Pydantic 模式
│   │   └── services/     # 业务服务
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/   # 组件
│   │   ├── pages/        # 页面
│   │   ├── services/     # API 服务
│   │   ├── types/        # 类型定义
│   │   └── utils/        # 工具函数
│   └── package.json
└── README.md
\`\`\`

## 📝 License

MIT License


INFO:     127.0.0.1:46554 - "POST /api/shelves/?shelf_name=%E8%BD%BB%E5%B0%8F%E8%AF%B4&description=%E6%97%A5%E6%9C%AC%E8%BD%BB%E5%B0%8F%E8%AF%B4 HTTP/1.1" 422 Unprocessable Content
