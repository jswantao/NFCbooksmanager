// frontend/src/App.tsx
/**
 * 应用根组件 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 路由级代码分割
 * - 页面切换动画
 * - 全局状态管理
 * - 路由预加载
 */
import React, { lazy, Suspense, useEffect, useMemo, useCallback, type FC, type ComponentType } from 'react';
import { Layout, FloatButton, Spin, Result, Button } from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import {
    BrowserRouter,
    Routes,
    Route,
    useLocation,
    useParams,
    useNavigate,
    type RouteObject,
} from 'react-router-dom';
import AppHeader from './components/AppHeader';
import ErrorBoundary from './components/ErrorBoundary';
import { useTheme } from './theme/ThemeContext';

const { Content } = Layout;

// ==================== 页面懒加载 ====================
// 使用动态导入 + prefetch 提示
const pages = {
    HomePage: lazy(() => import(/* webpackPrefetch: true */ './pages/HomePage')),
    NFCOperator: lazy(() => import('./pages/NFCOperator')),
    BookSearch: lazy(() => import(/* webpackPrefetch: true */ './pages/BookSearch')),
    BookDetail: lazy(() => import('./pages/BookDetail')),
    ShelfView: lazy(() => import('./pages/ShelfView')),
    BookCoverWall: lazy(() => import('./pages/BookCoverWall')),
    BatchImport: lazy(() => import('./pages/BatchImport')),
    BookManualAdd: lazy(() => import('./pages/BookManualAdd')),
    BookManualEdit: lazy(() => import('./pages/BookManualEdit')),
    CookieConfig: lazy(() => import('./pages/CookieConfig')),
    Dashboard: lazy(() => import('./pages/Dashboard')),
    ShelfManager: lazy(() => import('./pages/ShelfManager')),
    AllBooksManager: lazy(() => import('./pages/AllBooksManager')),
    PhysicalShelfManager: lazy(() => import('./pages/PhysicalShelfManager')),
} as const;

// ==================== 类型定义 ====================
interface RouteConfig {
    path: string;
    component: ComponentType<any>;
    preload?: boolean;
    meta?: {
        title?: string;
        wide?: boolean;
    };
}

// ==================== 路由配置 ====================
const routes: RouteConfig[] = [
    { path: '/', component: pages.HomePage, preload: true, meta: { title: '首页' } },
    { path: '/operate', component: pages.NFCOperator, meta: { title: 'NFC 操作' } },
    { path: '/search', component: pages.BookSearch, meta: { title: '搜索图书' } },
    { path: '/shelf/:id', component: pages.ShelfView, preload: true, meta: { title: '书架视图' } },
    { path: '/shelf/:shelfId/book/:bookId', component: pages.BookDetail, meta: { title: '图书详情' } },
    { path: '/wall', component: pages.BookCoverWall, meta: { title: '封面墙' } },
    { path: '/import', component: pages.BatchImport, meta: { title: '批量导入' } },
    { path: '/books/add', component: pages.BookManualAdd, meta: { title: '添加图书' } },
    { path: '/books/edit/:id', component: pages.BookManualEdit, meta: { title: '编辑图书' } },
    { path: '/settings/cookie', component: pages.CookieConfig, meta: { title: 'Cookie 配置' } },
    { path: '/admin', component: pages.Dashboard, meta: { title: '管理后台', wide: true } },
    { path: '/admin/shelves', component: pages.ShelfManager, meta: { title: '书架管理', wide: true } },
    { path: '/admin/books', component: pages.AllBooksManager, meta: { title: '图书管理', wide: true } },
    { path: '/admin/physical-shelves', component: pages.PhysicalShelfManager, meta: { title: '物理书架', wide: true } },
];

// ==================== 通用组件 ====================

/** 页面加载占位 - 骨架屏效果 */
const PageLoading: FC<{ message?: string }> = ({ message = '页面加载中...' }) => (
    <div
        style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 400,
            gap: 16,
        }}
        role="status"
        aria-label={message}
    >
        <Spin size="large" />
        <span style={{ color: '#8c7b72', fontSize: 14 }}>{message}</span>
    </div>
);

/** 路由切换时自动滚动到顶部 */
const ScrollToTop: FC = () => {
    const { pathname } = useLocation();
    
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [pathname]);
    
    return null;
};

/** 404 页面 */
const NotFoundPage: FC = () => {
    const navigate = useNavigate();
    
    return (
        <Result
            icon={<span style={{ fontSize: 72, opacity: 0.3 }}>📚</span>}
            title="页面未找到"
            subTitle="您访问的页面不存在或已被移除"
            extra={
                <Button
                    type="primary"
                    icon={<HomeOutlined />}
                    onClick={() => navigate('/')}
                    style={{ background: '#8B4513', borderColor: '#8B4513' }}
                >
                    返回首页
                </Button>
            }
        />
    );
};

/** 图书详情重定向组件 */
const BookDetailRedirect: FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    
    useEffect(() => {
        if (id) {
            navigate(`/shelf/1/book/${id}`, { replace: true });
        }
    }, [id, navigate]);
    
    return <PageLoading message="正在跳转到图书详情..." />;
};

/** 错误边界包装器 */
const RouteErrorBoundary: FC<{ children: React.ReactNode; routePath: string }> = ({ 
    children, 
    routePath 
}) => (
    <ErrorBoundary
        fallback={
            <Result
                status="error"
                title="页面加载失败"
                subTitle={`路由 ${routePath} 发生了错误，请尝试刷新页面`}
                extra={
                    <Button
                        type="primary"
                        onClick={() => window.location.reload()}
                    >
                        刷新页面
                    </Button>
                }
            />
        }
    >
        {children}
    </ErrorBoundary>
);

// ==================== 主应用内容 ====================
const AppContent: FC<{ onLoad?: () => void }> = ({ onLoad }) => {
    const location = useLocation();
    const { currentTheme } = useTheme();
    
    // 应用加载后执行回调（预加载等）
    useEffect(() => {
        onLoad?.();
    }, [onLoad]);
    
    // 判断是否为宽布局（管理页面）
    const isWideLayout = useMemo(
        () => {
            const widePaths = ['/admin', '/books/', '/import'];
            return widePaths.some(path => location.pathname.startsWith(path));
        },
        [location.pathname]
    );
    
    // 获取当前路由标题
    const currentRouteTitle = useMemo(() => {
        for (const route of routes) {
            // 简单路径匹配
            const routePattern = route.path.replace(/:\w+/g, '[^/]+');
            const regex = new RegExp(`^${routePattern}$`);
            if (regex.test(location.pathname)) {
                return route.meta?.title;
            }
        }
        return undefined;
    }, [location.pathname]);
    
    // 更新页面标题
    useEffect(() => {
        const title = currentRouteTitle 
            ? `${currentRouteTitle} - 书房管理系统` 
            : '书房管理系统 - NFC 智能图书管理';
        document.title = title;
    }, [currentRouteTitle]);
    
    // 页面切换动画 key
    const pageKey = useMemo(() => {
        // 提取路由的基础路径作为 key
        const basePath = location.pathname.split('/').slice(0, 3).join('/');
        return basePath || 'home';
    }, [location.pathname]);
    
    return (
        <Layout
            style={{
                minHeight: '100vh',
                background: currentTheme.cssVariables?.['--app-bg'] || '#fdf8f4',
                transition: 'background 0.3s ease',
            }}
        >
            <AppHeader currentTitle={currentRouteTitle} />
            <Content
                style={{
                    maxWidth: isWideLayout ? 1600 : 1400,
                    margin: '0 auto',
                    width: '100%',
                    padding: '24px 24px 48px',
                    minHeight: 'calc(100vh - 64px)',
                }}
            >
                {/* 使用 key 触发页面切换动画 */}
                <div
                    key={pageKey}
                    style={{
                        animation: 'page-fade-in 0.3s ease-out',
                    }}
                >
                    <Routes>
                        {routes.map((route) => (
                            <Route
                                key={route.path}
                                path={route.path}
                                element={
                                    <RouteErrorBoundary routePath={route.path}>
                                        <Suspense fallback={<PageLoading />}>
                                            <route.component />
                                        </Suspense>
                                    </RouteErrorBoundary>
                                }
                            />
                        ))}
                        <Route path="/book/:id" element={<BookDetailRedirect />} />
                        <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                </div>
            </Content>
            
            {/* 回到顶部按钮 */}
            <FloatButton.BackTop
                style={{ right: 40, bottom: 40 }}
                visibilityHeight={400}
                duration={400}
            />
            
            {/* 页面切换动画样式 */}
            <style>{`
                @keyframes page-fade-in {
                    from {
                        opacity: 0;
                        transform: translateY(8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </Layout>
    );
};

// ==================== 应用根组件 ====================
const App: FC<{ onLoad?: () => void }> = ({ onLoad }) => (
    <BrowserRouter>
        <ScrollToTop />
        <AppContent onLoad={onLoad} />
    </BrowserRouter>
);

export default App;