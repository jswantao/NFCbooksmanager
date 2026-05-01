// frontend/src/main.tsx
/**
 * 应用入口文件 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 预加载关键页面
 * - 更好的错误边界
 * - 性能监控集成
 * - 优雅的加载体验
 */
import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntApp, Spin, theme as antTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import './index.css';
import { ThemeProvider } from './theme/ThemeContext';

// 配置 dayjs
dayjs.locale('zh-cn');

// 动态导入 App
const App = React.lazy(() => import(/* webpackPrefetch: true */ './App'));

// 预加载关键页面的辅助函数
const preloadPages = () => {
    const pages = [
        () => import('./pages/HomePage'),
        () => import('./pages/BookSearch'),
        () => import('./pages/ShelfView'),
    ];
    
    // 使用 requestIdleCallback 在浏览器空闲时预加载
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
            pages.forEach(preload => {
                preload().catch(() => {});
            });
        });
    } else {
        setTimeout(() => {
            pages.forEach(preload => {
                preload().catch(() => {});
            });
        }, 3000);
    }
};

// 应用加载组件 - 品牌化加载界面
const AppLoading: React.FC = () => {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #fdf8f4 0%, #faf0e6 50%, #fdf8f4 100%)',
                gap: 24,
            }}
            role="status"
            aria-label="应用加载中"
        >
            <div style={{ fontSize: 72, animation: 'pulse 2s ease-in-out infinite' }}>
                📚
            </div>
            <Spin size="large">
                <div style={{ padding: 24 }} />
            </Spin>
            <div style={{ 
                color: '#8B4513', 
                fontSize: 16, 
                fontWeight: 500,
                letterSpacing: '0.05em'
            }}>
                书房管理系统
            </div>
            <style>{`
                @keyframes pulse {
                    0%, 100% { transform: scale(1); opacity: 0.8; }
                    50% { transform: scale(1.05); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

// 全局错误边界组件
class GlobalErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error?: Error }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('[App] 全局错误:', error, errorInfo);
        
        // 可以在这里添加错误上报
        // reportError(error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: '100vh',
                    background: '#fdf8f4',
                    padding: 24,
                }}>
                    <div style={{ textAlign: 'center', maxWidth: 480 }}>
                        <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
                        <h2 style={{ color: '#2c1810', marginBottom: 8 }}>应用加载异常</h2>
                        <p style={{ color: '#6b5e56', marginBottom: 24 }}>
                            {this.state.error?.message || '发生了未知错误'}
                        </p>
                        <button
                            onClick={() => {
                                this.setState({ hasError: false });
                                window.location.reload();
                            }}
                            style={{
                                padding: '10px 24px',
                                background: '#8B4513',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 8,
                                cursor: 'pointer',
                                fontSize: 16,
                                fontWeight: 500,
                            }}
                        >
                            重新加载
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

// 获取挂载节点
const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('找不到 #root 挂载节点，请检查 index.html');
}

const root = ReactDOM.createRoot(rootElement);

// 渲染应用
root.render(
    <React.StrictMode>
        <GlobalErrorBoundary>
            <ConfigProvider
                locale={zhCN}
                theme={{
                    algorithm: antTheme.defaultAlgorithm,
                    token: {
                        colorPrimary: '#8B4513',
                        borderRadius: 8,
                        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
                    },
                }}
                // 全局消息、通知、弹窗的挂载点
                getPopupContainer={() => document.body}
            >
                <ThemeProvider>
                    <AntApp
                        message={{ top: 80, maxCount: 3 }}
                        notification={{ placement: 'topRight', maxCount: 5 }}
                    >
                        <Suspense fallback={<AppLoading />}>
                            <App onLoad={preloadPages} />
                        </Suspense>
                    </AntApp>
                </ThemeProvider>
            </ConfigProvider>
        </GlobalErrorBoundary>
    </React.StrictMode>
);