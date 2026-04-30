// frontend/src/components/LoadingScreen.tsx
/**
 * 加载屏幕组件
 * 
 * 提供统一的全屏或区域加载状态展示。
 * 
 * 使用场景：
 * - 全屏模式（fullScreen=true）：页面初始加载、路由切换
 * - 区域模式（fullScreen=false）：列表加载、数据刷新
 * 
 * 特性：
 * - 全屏模式覆盖整个视口（fixed 定位）
 * - 半屏模式自适应容器高度
 * - 自定义加载提示文字
 * - 使用 Ant Design 的 Spin 和自定义图标
 */

import React from 'react';
import { Spin, Typography } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

const { Text } = Typography;

// ---- 类型定义 ----

interface LoadingScreenProps {
    /** 加载提示文字 */
    tip?: string;
    /** 是否全屏覆盖（fixed 定位） */
    fullScreen?: boolean;
    /** 自定义图标大小 */
    iconSize?: number;
}

// ---- 常量 ----

/** 默认图标大小 */
const DEFAULT_ICON_SIZE = 36;

/** 半屏模式最小高度 */
const MIN_HEIGHT_SECTION = 400;

// ---- 组件 ----

const LoadingScreen: React.FC<LoadingScreenProps> = ({
    tip = '加载中...',
    fullScreen = false,
    iconSize = DEFAULT_ICON_SIZE,
}) => {
    /**
     * 加载内容区域
     */
    const loadingContent = (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 0',
                gap: 16,
                minHeight: fullScreen ? '100vh' : MIN_HEIGHT_SECTION,
                background: fullScreen ? '#fdf8f4' : 'transparent',
            }}
        >
            <Spin
                indicator={
                    <LoadingOutlined
                        style={{ fontSize: iconSize }}
                        spin
                    />
                }
                size="large"
            />
            <Text
                type="secondary"
                style={{ fontSize: 15 }}
            >
                {tip}
            </Text>
        </div>
    );

    // 全屏模式：fixed 定位覆盖整个视口
    if (fullScreen) {
        return (
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    background: '#fdf8f4',
                }}
                role="status"
                aria-label={tip}
                aria-live="polite"
            >
                {loadingContent}
            </div>
        );
    }

    // 区域模式
    return loadingContent;
};

export default LoadingScreen;