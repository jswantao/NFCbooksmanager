// frontend/vite.config.ts
/**
 * Vite 构建配置
 * 
 * 开发环境：
 * - 监听所有网络接口（0.0.0.0），便于手机访问调试 NFC 功能
 * - 代理 /api 请求到后端 FastAPI 服务（端口 8000）
 * 
 * 生产构建：
 * - 使用 React 插件进行 JSX 转换和优化
 * - 自动代码分割和 Tree Shaking
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    // React 插件：支持 JSX 自动引入、Fast Refresh
    plugins: [react()],
    
    // 开发服务器配置
    server: {
        // 监听所有网络接口，允许局域网设备（手机）访问
        host: '0.0.0.0',
        
        // 开发服务器端口（与后端 NFC 回调中的 FRONTEND_PORT 保持一致）
        port: 5173,
        
        // API 代理配置
        proxy: {
            '/api': {
                // 后端 FastAPI 服务地址
                target: 'http://localhost:8000',
                
                // 修改请求头中的 Origin 为目标地址
                changeOrigin: true,
                
                // 注意：WebSocket 代理暂未启用，如需实时推送可添加 ws: true
            },
        },
    },
    
    // 生产构建优化
    build: {
        // 目标浏览器（现代浏览器，减小 polyfill 体积）
        target: 'es2020',
        
        // 启用 CSS 代码分割
        cssCodeSplit: true,
        
        //  chunk 大小警告阈值（KB）
        chunkSizeWarningLimit: 1000,
        
        // Rollup 配置
        rollupOptions: {
            output: {
                // 手动分包策略：将大型依赖独立打包
                manualChunks: {
                    // React 核心
                    'react-vendor': ['react', 'react-dom', 'react-router-dom'],
                    // Ant Design 组件库
                    'antd-vendor': ['antd', '@ant-design/icons'],
                    // 数据可视化（如有使用）
                    // 'chart-vendor': ['@ant-design/charts'],
                },
            },
        },
    },
    
    // CSS 预处理配置
    css: {
        // 全局 CSS 变量注入（如需要）
        preprocessorOptions: {
            less: {
                // Ant Design 主题变量覆盖（如需要定制主题）
                // modifyVars: { 'primary-color': '#8B4513' },
                javascriptEnabled: true,
            },
        },
    },
});