// frontend/src/components/ErrorBoundary.tsx
/**
 * React 错误边界组件 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 错误上报集成
 * - 重试次数限制
 * - 降级渲染策略
 * - 开发调试面板
 * - 错误分类展示
 * - 自动恢复机制
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Result, Button, Typography, Collapse, Space, Tag, Tooltip, Divider } from 'antd';
import {
    ReloadOutlined,
    BugOutlined,
    CopyOutlined,
    HomeOutlined,
    ExpandOutlined,
} from '@ant-design/icons';

const { Paragraph, Text, Title } = Typography;

// ==================== 类型定义 ====================

interface ErrorBoundaryProps {
    /** 子组件 */
    children: ReactNode;
    /** 自定义回退 UI */
    fallback?: ReactNode | ((error: Error, retry: () => void) => ReactNode);
    /** 错误回调 */
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    /** 最大重试次数，超过后显示不同 UI */
    maxRetries?: number;
    /** 是否在开发环境显示详细错误信息 */
    showDetailsInDev?: boolean;
    /** 重置 key - 变化时自动重置错误状态 */
    resetKey?: string | number;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
    retryCount: number;
    errorTime: number | null;
}

// ==================== 工具函数 ====================

/**
 * 复制文本到剪贴板
 */
const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // 降级方案
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
    }
};

/**
 * 获取错误类型标签
 */
const getErrorTypeTag = (error: Error): { label: string; color: string } => {
    const name = error?.name || 'Error';
    const typeMap: Record<string, { label: string; color: string }> = {
        TypeError: { label: '类型错误', color: 'orange' },
        ReferenceError: { label: '引用错误', color: 'red' },
        SyntaxError: { label: '语法错误', color: 'magenta' },
        RangeError: { label: '范围错误', color: 'purple' },
        NetworkError: { label: '网络错误', color: 'blue' },
        ChunkLoadError: { label: '加载失败', color: 'cyan' },
    };
    return typeMap[name] || { label: name, color: 'default' };
};

// ==================== 错误边界组件 ====================

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    /** 重置定时器 */
    private autoResetTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
            retryCount: 0,
            errorTime: null,
        };
    }

    // ==================== 生命周期 ====================

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return {
            hasError: true,
            error,
            errorTime: Date.now(),
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // 记录错误日志
        console.error(
            `[ErrorBoundary] 组件错误捕获:`,
            {
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                },
                componentStack: errorInfo.componentStack,
                timestamp: new Date().toISOString(),
            }
        );

        // 调用外部错误回调
        this.props.onError?.(error, errorInfo);

        // 更新错误详情
        this.setState({ errorInfo });

        // 生产环境可在此处添加错误上报
        // if (import.meta.env.PROD) {
        //     reportErrorToService(error, errorInfo);
        // }
    }

    componentDidUpdate(
        prevProps: ErrorBoundaryProps,
        prevState: ErrorBoundaryState
    ): void {
        // resetKey 变化时自动重置
        if (
            this.props.resetKey !== undefined &&
            this.props.resetKey !== prevProps.resetKey
        ) {
            this.handleRetry();
        }

        // 自动恢复：5 秒后自动重试一次
        if (
            this.state.hasError &&
            !prevState.hasError &&
            this.state.retryCount === 0
        ) {
            this.setupAutoReset();
        }
    }

    componentWillUnmount(): void {
        this.clearAutoReset();
    }

    // ==================== 自动恢复 ====================

    private setupAutoReset(): void {
        this.clearAutoReset();
        this.autoResetTimer = setTimeout(() => {
            if (this.state.hasError && this.state.retryCount === 0) {
                console.log('[ErrorBoundary] 自动尝试恢复...');
                this.handleRetry();
            }
        }, 5000);
    }

    private clearAutoReset(): void {
        if (this.autoResetTimer) {
            clearTimeout(this.autoResetTimer);
            this.autoResetTimer = null;
        }
    }

    // ==================== 事件处理 ====================

    private handleRetry = (): void => {
        this.clearAutoReset();
        this.setState((prev) => ({
            hasError: false,
            error: null,
            errorInfo: null,
            errorTime: null,
            retryCount: prev.retryCount + 1,
        }));
    };

    private handleReload = (): void => {
        window.location.reload();
    };

    private handleGoHome = (): void => {
        window.location.href = '/';
    };

    private handleCopyError = async (): Promise<void> => {
        const { error, errorInfo } = this.state;
        const text = [
            `错误: ${error?.name}: ${error?.message}`,
            `堆栈: ${error?.stack}`,
            `组件堆栈: ${errorInfo?.componentStack}`,
            `时间: ${new Date(this.state.errorTime || Date.now()).toISOString()}`,
            `重试次数: ${this.state.retryCount}`,
            `URL: ${window.location.href}`,
            `UserAgent: ${navigator.userAgent}`,
        ].join('\n\n');

        const success = await copyToClipboard(text);
        if (success) {
            console.log('[ErrorBoundary] 错误信息已复制');
        }
    };

    // ==================== 渲染 ====================

    render(): ReactNode {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const { error, errorInfo, retryCount } = this.state;
        const { fallback, maxRetries = 3, showDetailsInDev = true } = this.props;
        const errorType = error ? getErrorTypeTag(error) : null;

        // 超过最大重试次数
        if (retryCount >= maxRetries) {
            return (
                <Result
                    status="500"
                    title="无法恢复"
                    subTitle={`已尝试 ${retryCount} 次恢复，请刷新页面或联系管理员`}
                    extra={[
                        <Button
                            type="primary"
                            key="reload"
                            icon={<ReloadOutlined />}
                            onClick={this.handleReload}
                        >
                            刷新页面
                        </Button>,
                        <Button
                            key="home"
                            icon={<HomeOutlined />}
                            onClick={this.handleGoHome}
                        >
                            返回首页
                        </Button>,
                    ]}
                />
            );
        }

        // 自定义回退 UI
        if (fallback) {
            if (typeof fallback === 'function') {
                return fallback(error!, this.handleRetry);
            }
            return fallback;
        }

        // 默认错误 UI
        const isDev = import.meta.env.DEV;

        return (
            <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
                <Result
                    status="error"
                    title="页面渲染异常"
                    subTitle={
                        <Space orientation="vertical" size={4}>
                            <span>{error?.message || '发生了未知错误'}</span>
                            {errorType && (
                                <Tag color={errorType.color}>{errorType.label}</Tag>
                            )}
                        </Space>
                    }
                    extra={
                        <Space size={8}>
                            <Button
                                type="primary"
                                icon={<ReloadOutlined />}
                                onClick={this.handleRetry}
                            >
                                重试 ({retryCount}/{maxRetries})
                            </Button>
                            <Tooltip title="刷新整个页面">
                                <Button
                                    icon={<ReloadOutlined />}
                                    onClick={this.handleReload}
                                >
                                    刷新页面
                                </Button>
                            </Tooltip>
                            <Tooltip title="复制错误信息">
                                <Button
                                    icon={<CopyOutlined />}
                                    onClick={this.handleCopyError}
                                />
                            </Tooltip>
                        </Space>
                    }
                />

                {/* 开发环境错误详情 */}
                {isDev && showDetailsInDev && error && (
                    <Collapse
                        size="small"
                        bordered
                        style={{ marginTop: 16 }}
                        items={[
                            {
                                key: 'error-details',
                                label: (
                                    <Space size={4}>
                                        <BugOutlined />
                                        <span>错误详情</span>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            (仅开发环境可见)
                                        </Text>
                                    </Space>
                                ),
                                children: (
                                    <div style={{ fontSize: 12 }}>
                                        <div style={{ marginBottom: 12 }}>
                                            <Text strong>错误类型：</Text>
                                            <Text code>{error.name}</Text>
                                        </div>
                                        <div style={{ marginBottom: 12 }}>
                                            <Text strong>错误消息：</Text>
                                            <Text type="danger">{error.message}</Text>
                                        </div>
                                        {error.stack && (
                                            <div style={{ marginBottom: 12 }}>
                                                <Text strong>调用堆栈：</Text>
                                                <pre
                                                    style={{
                                                        background: '#f5f5f5',
                                                        padding: 12,
                                                        borderRadius: 8,
                                                        maxHeight: 200,
                                                        overflow: 'auto',
                                                        fontSize: 11,
                                                        whiteSpace: 'pre-wrap',
                                                        wordBreak: 'break-all',
                                                    }}
                                                >
                                                    {error.stack}
                                                </pre>
                                            </div>
                                        )}
                                        {errorInfo?.componentStack && (
                                            <div>
                                                <Text strong>组件堆栈：</Text>
                                                <pre
                                                    style={{
                                                        background: '#f5f5f5',
                                                        padding: 12,
                                                        borderRadius: 8,
                                                        maxHeight: 200,
                                                        overflow: 'auto',
                                                        fontSize: 11,
                                                        whiteSpace: 'pre-wrap',
                                                    }}
                                                >
                                                    {errorInfo.componentStack}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                ),
                            },
                        ]}
                    />
                )}
            </div>
        );
    }
}

export default ErrorBoundary;