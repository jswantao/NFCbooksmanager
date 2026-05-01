// frontend/src/components/LoadingScreen.tsx
/**
 * 加载屏幕组件 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 品牌化加载动画
 * - 进度条支持
 * - 加载超时处理
 * - 自定义加载图标
 * - 无障碍优化
 */

import React, { useEffect, useState, type FC } from 'react';
import { Spin, Typography, Progress } from 'antd';

const { Text } = Typography;

// ==================== 类型定义 ====================

interface LoadingScreenProps {
    /** 提示文本 */
    tip?: string;
    /** 是否全屏 */
    fullScreen?: boolean;
    /** 图标大小 */
    iconSize?: number;
    /** 进度百分比（0-100），undefined 表示不确定进度 */
    progress?: number;
    /** 超时时间（毫秒），超时后显示额外提示 */
    timeout?: number;
    /** 自定义加载图标 */
    icon?: React.ReactNode;
}

// ==================== 组件 ====================

const LoadingScreen: FC<LoadingScreenProps> = ({
    tip = '加载中...',
    fullScreen = false,
    iconSize = 40,
    progress,
    timeout = 15000,
    icon,
}) => {
    const [isTimeout, setIsTimeout] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    // ==================== 超时检测 ====================

    useEffect(() => {
        if (timeout <= 0) return;

        const timer = setTimeout(() => {
            setIsTimeout(true);
            console.warn(`[LoadingScreen] 加载超时 (${timeout}ms): ${tip}`);
        }, timeout);

        return () => clearTimeout(timer);
    }, [timeout, tip]);

    // ==================== 已用时间追踪 ====================

    useEffect(() => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startTime) / 1000));
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    // ==================== 渲染 ====================

    const content = (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 24px',
                gap: 20,
                minHeight: fullScreen ? '100vh' : 400,
                background: fullScreen
                    ? 'linear-gradient(135deg, #fdf8f4 0%, #faf0e6 50%, #fdf8f4 100%)'
                    : 'transparent',
                transition: 'background 0.3s ease',
            }}
            role="status"
            aria-label={tip}
            aria-live="polite"
        >
            {/* 品牌图标 */}
            <div
                style={{
                    fontSize: 64,
                    animation: 'loading-pulse 2s ease-in-out infinite',
                }}
            >
                📚
            </div>

            {/* 加载指示器 */}
            {icon ? (
                <div style={{ fontSize: iconSize }}>{icon}</div>
            ) : (
                <Spin size="large" />
            )}

            {/* 提示文本 */}
            <Text
                type="secondary"
                style={{
                    fontSize: 15,
                    textAlign: 'center',
                    maxWidth: 320,
                }}
            >
                {tip}
            </Text>

            {/* 进度条 */}
            {progress !== undefined && (
                <div style={{ width: 240 }}>
                    <Progress
                        percent={Math.min(Math.max(progress, 0), 100)}
                        size="small"
                        showInfo
                        strokeColor={{
                            '0%': '#8B4513',
                            '100%': '#a0522d',
                        }}
                    />
                </div>
            )}

            {/* 超时提示 */}
            {isTimeout && (
                <div
                    style={{
                        marginTop: 8,
                        padding: '8px 16px',
                        background: '#fff3cd',
                        borderRadius: 8,
                        border: '1px solid #ffc107',
                    }}
                >
                    <Text
                        type="warning"
                        style={{ fontSize: 13, textAlign: 'center', display: 'block' }}
                    >
                        加载时间较长（已等待 {elapsed} 秒），请检查网络连接或刷新页面
                    </Text>
                </div>
            )}
        </div>
    );

    // 全屏模式
    if (fullScreen) {
        return (
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    background: 'linear-gradient(135deg, #fdf8f4 0%, #faf0e6 100%)',
                }}
            >
                {content}
            </div>
        );
    }

    return content;
};

// ==================== 导出样式 ====================

// 脉冲动画注入
if (typeof document !== 'undefined') {
    const styleId = 'loading-screen-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            @keyframes loading-pulse {
                0%, 100% { transform: scale(1); opacity: 0.8; }
                50% { transform: scale(1.1); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
}

export default LoadingScreen;