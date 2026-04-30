// frontend/src/components/ErrorBoundary.tsx
/**
 * React 错误边界组件
 * 
 * 捕获子组件树中的 JavaScript 错误，显示降级 UI，
 * 防止整个应用因局部错误而崩溃。
 * 
 * 使用方式：
 * ```tsx
 * <ErrorBoundary fallback={<CustomErrorUI />}>
 *   <RiskyComponent />
 * </ErrorBoundary>
 * ```
 * 
 * 特性：
 * - 捕获渲染错误和生命周期错误
 * - 支持自定义回退 UI
 * - 提供"重试"和"刷新页面"两个恢复选项
 * - 开发环境输出详细错误信息到控制台
 * - 不捕获事件处理函数中的错误（需自行 try-catch）
 * 
 * 注意：
 * - ErrorBoundary 必须是 Class Component（React 暂不支持函数组件实现）
 * - 不捕获异步错误（需在 Promise.catch 中处理）
 * - 不捕获事件处理器错误（需自行 try-catch）
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Result, Button, Typography } from 'antd';

const { Paragraph, Text } = Typography;

// ---- 类型定义 ----

interface ErrorBoundaryProps {
    /** 子组件 */
    children: ReactNode;
    /** 自定义回退 UI（不传则使用默认错误页面） */
    fallback?: ReactNode;
    /** 错误回调（用于上报错误到监控系统） */
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
    /** 是否发生了错误 */
    hasError: boolean;
    /** 错误对象 */
    error: Error | null;
    /** 错误附加信息 */
    errorInfo: ErrorInfo | null;
}

// ---- 组件 ----

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState = {
        hasError: false,
        error: null,
        errorInfo: null,
    };

    /**
     * 从错误中派生状态（静态方法）
     * 
     * 在渲染过程中捕获到错误时调用。
     * 
     * @param error - 被抛出的错误对象
     * @returns 新的 state
     */
    public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return {
            hasError: true,
            error,
        };
    }

    /**
     * 错误捕获后的副作用处理
     * 
     * 在此方法中执行错误日志记录和上报。
     * 
     * @param error - 被抛出的错误对象
     * @param errorInfo - 包含组件堆栈信息的对象
     */
    public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // 记录到控制台
        console.error('[ErrorBoundary] 捕获到组件错误:', {
            error,
            componentStack: errorInfo.componentStack,
        });

        // 调用外部错误回调（如上报到监控服务）
        this.props.onError?.(error, errorInfo);

        // 保存错误信息用于展示
        this.setState({ errorInfo });
    }

    /**
     * 重置错误状态（重试）
     * 
     * 清除错误标记，尝试重新渲染子组件。
     */
    private handleRetry = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
    };

    /**
     * 刷新整个页面
     * 
     * 当重试无法解决问题时，完全刷新应用。
     */
    private handleReload = (): void => {
        window.location.reload();
    };

    /**
     * 复制错误信息到剪贴板
     */
    private handleCopyError = (): void => {
        const { error, errorInfo } = this.state;
        const errorText = [
            `错误: ${error?.message || '未知错误'}`,
            `堆栈: ${error?.stack || '无'}`,
            `组件堆栈: ${errorInfo?.componentStack || '无'}`,
        ].join('\n\n');

        navigator.clipboard.writeText(errorText).then(() => {
            // 复制成功（可添加提示）
        }).catch(() => {
            // 复制失败（降级处理）
        });
    };

    public render(): ReactNode {
        const { hasError, error, errorInfo } = this.state;
        const { children, fallback } = this.props;

        // 发生错误时
        if (hasError) {
            // 优先使用自定义回退 UI
            if (fallback) {
                return fallback;
            }

            // 默认错误页面
            return (
                <Result
                    status="error"
                    title="页面加载失败"
                    subTitle={error?.message || '发生了未知错误，请尝试重试'}
                    extra={[
                        <Button
                            type="primary"
                            key="retry"
                            onClick={this.handleRetry}
                        >
                            重试
                        </Button>,
                        <Button
                            key="reload"
                            onClick={this.handleReload}
                        >
                            刷新页面
                        </Button>,
                    ]}
                >
                    {/* 开发环境显示详细错误信息 */}
                    {process.env.NODE_ENV === 'development' && errorInfo && (
                        <div
                            style={{
                                maxWidth: 600,
                                margin: '16px auto 0',
                                textAlign: 'left',
                            }}
                        >
                            <Paragraph
                                copyable
                                code
                                style={{
                                    maxHeight: 300,
                                    overflow: 'auto',
                                    fontSize: 12,
                                    background: '#f5f5f5',
                                    borderRadius: 8,
                                    padding: 12,
                                }}
                            >
                                <Text type="danger">{error?.toString()}</Text>
                                {'\n\n'}
                                {errorInfo.componentStack}
                            </Paragraph>
                        </div>
                    )}
                </Result>
            );
        }

        // 正常渲染子组件
        return children;
    }
}

export default ErrorBoundary;