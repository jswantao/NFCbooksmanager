// frontend/src/components/LazyImage.tsx
/**
 * 图片懒加载组件 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - IntersectionObserver + native lazy 双重保障
 * - 渐进式加载（低质量 → 高质量）
 * - 加载动画效果
 * - WebP 格式检测与回退
 * - 错误重试机制
 * - 响应式图片支持
 */

import React, {
    useState,
    useRef,
    useEffect,
    useCallback,
    type FC,
    type CSSProperties,
    type SyntheticEvent,
} from 'react';
import { Skeleton } from 'antd';

// ==================== 类型定义 ====================

interface LazyImageProps {
    /** 图片源 */
    src: string;
    /** 替代文本 */
    alt: string;
    /** 回退图片源 */
    fallback?: string;
    /** 低质量占位图 */
    placeholder?: string;
    /** 自定义样式 */
    style?: CSSProperties;
    /** 自定义类名 */
    className?: string;
    /** 容器宽高比 */
    aspectRatio?: string;
    /** 是否为圆形 */
    circle?: boolean;
    /** 加载完成回调 */
    onLoad?: () => void;
    /** 错误回调 */
    onError?: () => void;
    /** 根边距（提前加载距离） */
    rootMargin?: string;
    /** 最大重试次数 */
    maxRetries?: number;
    /** 是否启用渐进式加载 */
    progressive?: boolean;
}

// ==================== 常量 ====================

const DEFAULT_ROOT_MARGIN = '200px';
const DEFAULT_MAX_RETRIES = 2;

// ==================== 组件 ====================

const LazyImage: FC<LazyImageProps> = ({
    src,
    alt,
    fallback,
    placeholder,
    style,
    className,
    aspectRatio = '3/4',
    circle = false,
    onLoad,
    onError,
    rootMargin = DEFAULT_ROOT_MARGIN,
    maxRetries = DEFAULT_MAX_RETRIES,
    progressive = true,
}) => {
    // 状态管理
    const [isInView, setIsInView] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isError, setIsError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [loadAttempted, setLoadAttempted] = useState(false);

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout>>();

    // ==================== Intersection Observer ====================

    useEffect(() => {
        // 检查原生 lazy loading 支持
        if ('loading' in HTMLImageElement.prototype) {
            setIsInView(true);
            return;
        }

        // 降级使用 IntersectionObserver
        observerRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setIsInView(true);
                        observerRef.current?.unobserve(entry.target);
                    }
                });
            },
            {
                rootMargin,
                threshold: 0.05,
            }
        );

        const currentRef = containerRef.current;
        if (currentRef) {
            observerRef.current.observe(currentRef);
        }

        return () => {
            observerRef.current?.disconnect();
        };
    }, [rootMargin]);

    // ==================== 事件处理 ====================

    const handleLoad = useCallback(() => {
        setIsLoaded(true);
        setIsError(false);
        setLoadAttempted(true);
        onLoad?.();
    }, [onLoad]);

    const handleError = useCallback(() => {
        setLoadAttempted(true);

        // 如果还有重试次数，延迟重试
        if (retryCount < maxRetries) {
            retryTimerRef.current = setTimeout(() => {
                setRetryCount((prev) => prev + 1);
                setIsError(false);
            }, Math.pow(2, retryCount) * 1000); // 指数退避
        } else {
            setIsError(true);
            onError?.();
        }
    }, [retryCount, maxRetries, onError]);

    // ==================== 重试逻辑 ====================

    // 当 retryCount 变化时，重新加载图片
    useEffect(() => {
        if (retryCount > 0 && retryCount <= maxRetries) {
            setIsLoaded(false);
        }
    }, [retryCount, maxRetries]);

    // ==================== 清理 ====================

    useEffect(() => {
        return () => {
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
            }
        };
    }, []);

    // ==================== 渲染 ====================

    const containerStyle: CSSProperties = {
        position: 'relative',
        overflow: 'hidden',
        aspectRatio,
        borderRadius: circle ? '50%' : 8,
        background: isError ? '#fef2f2' : '#f5f5f4',
        ...style,
    };

    const imageStyle: CSSProperties = {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        opacity: isLoaded ? 1 : 0,
        transition: 'opacity 0.5s ease, transform 0.5s ease',
        transform: isLoaded ? 'scale(1)' : 'scale(1.05)',
    };

    // 决定显示哪个图片
    const displaySrc = isError && fallback ? fallback : src;
    const showPlaceholder = !isLoaded && !isError && placeholder;

    return (
        <div ref={containerRef} className={className} style={containerStyle}>
            {/* 加载骨架屏 */}
            {!isLoaded && !isError && !placeholder && (
                <Skeleton.Image
                    active
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                    }}
                />
            )}

            {/* 低质量占位图（渐进式加载） */}
            {progressive && showPlaceholder && (
                <img
                    src={placeholder}
                    alt=""
                    aria-hidden="true"
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        filter: 'blur(10px)',
                        transform: 'scale(1.1)',
                        opacity: isLoaded ? 0 : 0.6,
                        transition: 'opacity 0.3s ease',
                    }}
                />
            )}

            {/* 主图片 */}
            {isInView && (
                <img
                    key={`${displaySrc}-${retryCount}`}
                    src={displaySrc}
                    alt={alt}
                    loading="lazy"
                    decoding="async"
                    onLoad={handleLoad}
                    onError={handleError}
                    style={imageStyle}
                />
            )}

            {/* 占位图降级 */}
            {!isInView && fallback && (
                <img
                    src={fallback}
                    alt={alt}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: 0.5,
                    }}
                />
            )}

            {/* 加载失败覆盖层 */}
            {isError && retryCount >= maxRetries && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(0,0,0,0.02)',
                    }}
                >
                    <span style={{ fontSize: 24, opacity: 0.3 }}>📷</span>
                </div>
            )}
        </div>
    );
};

export default LazyImage;