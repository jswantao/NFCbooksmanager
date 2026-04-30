// frontend/src/main.tsx
/**
 * 应用入口文件
 * 
 * 职责：
 * 1. 挂载 React 应用到 DOM
 * 2. 配置全局 Provider（Ant Design、国际化、严格模式）
 * 3. 懒加载 App 组件，减少首屏体积
 * 4. 初始化 dayjs 国际化
 * 
 * 加载顺序：
 * index.html → main.tsx → App.tsx（懒加载）→ 路由页面
 */

import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntApp, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

// 全局样式（CSS 变量、滚动条、响应式断点）
import './index.css';

// ---- 初始化第三方库 ----

// 设置 dayjs 为中文语言环境
// 影响日期选择器、时间格式化等组件
dayjs.locale('zh-cn');

// ---- React 懒加载 ----

// 延迟加载 App 组件，减小首屏 JavaScript 体积
// 配合 Suspense 显示加载状态
const App = React.lazy(() => import('./App'));

// ---- 加载中组件 ----

/**
 * 全局加载占位组件
 * 
 * 在 App 组件懒加载完成前显示，
 * 与 index.html 中的纯 CSS 占位衔接。
 */
const AppLoading: React.FC = () => (
    <div
        style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            background: '#fdf8f4',
        }}
    >
        <Spin
            size="large"
            tip="正在加载书房管理系统..."
        >
            {/* Spin 需要子元素才能显示 tip */}
            <div style={{ padding: 50 }} />
        </Spin>
    </div>
);

// ---- 挂载应用 ----

// 获取根节点
const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error(
        '找不到 #root 元素，请检查 index.html 中是否存在 <div id="root"></div>'
    );
}

// 创建 React 18 并发模式根节点
const root = ReactDOM.createRoot(rootElement);

// 渲染应用
root.render(
    // StrictMode：仅在开发环境启用双重渲染检查
    // - 检测副作用
    // - 检测过时的 API
    // - 确保组件可重复挂载
    <React.StrictMode>
        {/* ConfigProvider：Ant Design 全局配置
            - locale: 中文语言包
            - theme: 通过 App.tsx 中的 ConfigProvider 二次配置
        */}
        <ConfigProvider locale={zhCN}>
            {/* AntApp：Ant Design 5.x 的静态方法上下文
                - 提供 message、notification、modal 的 hooks
            */}
            <AntApp>
                {/* Suspense：懒加载边界
                    - fallback: 加载超时显示提示
                    - 生产环境建议配置错误边界
                */}
                <Suspense fallback={<AppLoading />}>
                    <App />
                </Suspense>
            </AntApp>
        </ConfigProvider>
    </React.StrictMode>
);