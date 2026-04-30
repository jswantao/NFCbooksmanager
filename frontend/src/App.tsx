// frontend/src/App.tsx
/**
 * 应用根组件
 * 
 * 职责：
 * 1. 配置 Ant Design 主题（品牌色、圆角等）
 * 2. 定义前端路由表（React Router v6）
 * 3. 实现页面懒加载（减少首屏体积）
 * 4. 处理路由切换时的滚动复位
 * 5. 提供 404 页面
 * 
 * 路由架构：
 * /                          → NFC 扫描首页
 * /write                     → NFC 写入页
 * /search                    → 图书搜索
 * /shelf/:id                 → 书架详情
 * /shelf/:shelfId/book/:bookId → 图书详情
 * /wall                      → 图书封面墙
 * /import                    → 批量导入
 * /books/add                 → 手动添加图书
 * /books/edit/:id            → 编辑图书
 * /settings/cookie           → Cookie 配置
 * /admin                     → 管理仪表盘
 * /admin/shelves             → 书架管理
 */

import React, { lazy, Suspense, useEffect, useMemo } from 'react';
import { ConfigProvider, Layout, theme, App as AntApp, FloatButton, Spin } from 'antd';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import zhCN from 'antd/locale/zh_CN';

// 全局组件
import AppHeader from './components/AppHeader';

// ---- 页面懒加载 ----
// 使用 React.lazy 分割代码，仅在路由命中时加载对应页面
// Webpack/Vite 会自动生成独立的 chunk 文件

/** NFC 扫描页面（首页） - 外模式入口 */
const NFCReader = lazy(() => import('./pages/NFCReader'));

/** NFC 写入页面 - 外模式写入 */
const NFCWriter = lazy(() => import('./pages/NFCWriter'));

/** 图书搜索页面 */
const BookSearch = lazy(() => import('./pages/BookSearch'));

/** 图书详情页面 */
const BookDetail = lazy(() => import('./pages/BookDetail'));

/** 书架视图页面 - 中间模式展示 */
const ShelfView = lazy(() => import('./pages/ShelfView'));

/** 图书封面墙页面 */
const BookCoverWall = lazy(() => import('./pages/BookCoverWall'));

/** 批量导入页面 */
const BatchImport = lazy(() => import('./pages/BatchImport'));

/** 手动添加图书页面 */
const BookManualAdd = lazy(() => import('./pages/BookManualAdd'));

/** 编辑图书页面 */
const BookManualEdit = lazy(() => import('./pages/BookManualEdit'));

/** Cookie 配置页面 */
const CookieConfig = lazy(() => import('./pages/CookieConfig'));

/** 管理仪表盘页面 */
const Dashboard = lazy(() => import('./pages/Dashboard'));

/** 书架管理页面 */
const ShelfManager = lazy(() => import('./pages/ShelfManager'));

const AllBooksManager = lazy(() => import('./pages/AllBooksManager'));

// ---- 常量 ----

const { Content } = Layout;

const BookDetailRedirect: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    useEffect(() => {
        // 重定向到默认书架路径
        navigate(`/shelf/1/book/${id}`, { replace: true });
    }, [id, navigate]);

    return (
        <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            minHeight: 400 
        }}>
            <Spin size="large" tip="正在跳转..." />
        </div>
    );
};


/** 路由配置表 */
interface RouteConfig {
    path: string;
    component: React.LazyExoticComponent<React.ComponentType<any>>;
}

const routes: RouteConfig[] = [
    { path: '/', component: NFCReader },
    { path: '/write', component: NFCWriter },
    { path: '/search', component: BookSearch },
    { path: '/shelf/:id', component: ShelfView },
    { path: '/shelf/:shelfId/book/:bookId', component: BookDetail },
    { path: '/wall', component: BookCoverWall },
    { path: '/import', component: BatchImport },
    { path: '/books/add', component: BookManualAdd },
    { path: '/books/edit/:id', component: BookManualEdit },
    { path: '/settings/cookie', component: CookieConfig },
    { path: '/admin', component: Dashboard },
    { path: '/admin/shelves', component: ShelfManager },
    { path: '/admin/books', component: AllBooksManager },
    { path: '/book/:id', component: BookDetailRedirect },
];

// ---- 组件 ----

/** 页面加载中占位 */
const PageLoading: React.FC = () => (
    <div
        style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 400,
        }}
    >
        <Spin size="large" tip="页面加载中..." />
    </div>
);

/**
 * 路由切换时自动滚动到顶部
 * 
 * 监听 pathname 变化，每次路由切换执行 window.scrollTo(0, 0)
 */
const ScrollToTop: React.FC = () => {
    const { pathname } = useLocation();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    // 不渲染任何 UI
    return null;
};

/** 404 页面 */
const NotFoundPage: React.FC = () => (
    <div
        style={{
            textAlign: 'center',
            padding: '80px 24px',
            color: '#8c7b72',
        }}
    >
        <div style={{ fontSize: 72, opacity: 0.3, marginBottom: 16 }}>📚</div>
        <h2 style={{ fontSize: 24, color: '#2c1810', marginBottom: 8 }}>
            页面未找到
        </h2>
        <p style={{ marginBottom: 16, color: '#8c7b72' }}>
            您访问的页面不存在或已被移除
        </p>
        <a href="/" style={{ color: '#8B4513', fontWeight: 500 }}>
            ← 返回首页
        </a>
    </div>
);

/**
 * Ant Design 主题配置
 * 
 * 品牌色：#8B4513（马鞍棕色，书房氛围）
 * 设计理念：温暖、沉稳、知识感
 */
const appTheme = {
    algorithm: theme.defaultAlgorithm,
    token: {
        // 品牌色
        colorPrimary: '#8B4513',
        colorPrimaryBg: '#fdf6f0',
        colorPrimaryHover: '#a0522d',
        
        // 功能色
        colorSuccess: '#52c41a',
        colorWarning: '#faad14',
        colorError: '#ff4d4f',
        
        // 基础色
        colorTextBase: '#2c1810',
        colorBgLayout: '#fdf8f4',
        
        // 圆角
        borderRadius: 8,
    },
};

/**
 * 应用主体内容组件
 * 
 * 必须在 BrowserRouter 内部使用（使用 useLocation hook）
 */
const AppContent: React.FC = () => {
    const location = useLocation();

    // 宽屏页面判断（管理后台、图书编辑页使用更宽的布局）
    const isWideLayout = useMemo(
        () =>
            location.pathname.startsWith('/admin') ||
            location.pathname.startsWith('/books/'),
        [location.pathname]
    );

    return (
        <Layout style={{ minHeight: '100vh', background: '#fdf8f4' }}>
            {/* 顶部导航栏 */}
            <AppHeader />

            {/* 主内容区 */}
            <Content
                style={{
                    maxWidth: isWideLayout ? 1600 : 1400,
                    margin: '0 auto',
                    width: '100%',
                    padding: '24px 24px 48px',
                    minHeight: 'calc(100vh - 64px)', // 减去 Header 高度
                }}
            >
                {/* 路由出口 + 懒加载边界 */}
                <Suspense fallback={<PageLoading />}>
                    <Routes>
                        {routes.map((route) => (
                            <Route
                                key={route.path}
                                path={route.path}
                                element={<route.component />}
                            />
                        ))}

                        {/* 404 兜底路由 */}
                        <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                </Suspense>
            </Content>

            {/* 返回顶部按钮 */}
            <FloatButton.BackTop
                style={{ right: 40, bottom: 40 }}
                visibilityHeight={400}
            />
        </Layout>
    );
};

/**
 * 应用根组件
 * 
 * Provider 层级：
 * ConfigProvider（Ant Design 主题）
 *   → AntApp（静态方法上下文）
 *     → BrowserRouter（路由）
 *       → ScrollToTop（路由监听）
 *       → AppContent（布局 + 路由出口）
 */
const App: React.FC = () => (
    <ConfigProvider locale={zhCN} theme={appTheme}>
        <AntApp>
            <BrowserRouter>
                <ScrollToTop />
                <AppContent />
            </BrowserRouter>
        </AntApp>
    </ConfigProvider>
);

export default App;