// frontend/src/components/UnifiedCover.tsx
/**
 * 统一图书封面展示组件
 *
 * 内置能力：
 * - 多源自动回退 (本地缓存 → 豆瓣代理 → 上传封面 → SVG 占位图)
 * - 加载骨架屏 / 错误提示 / 渐进式加载
 * - 三种渲染模式：Ant Image(可预览) / 懒加载(IntersectionObserver) / 纯 img
 *
 * 使用方式：
 *   <UnifiedCover book={book} mode="lazy" />          // BookCard/CoverWall
 *   <UnifiedCover book={book} mode="image" />         // Detail/Search 等需预览
 *   <UnifiedCover src="..." title="书名" mode="simple" />  // 仅占位回退
 */

import React, {
    useState,
    useRef,
    useEffect,
    useCallback,
    useMemo,
    type FC,
    type CSSProperties,
    type ComponentProps,
} from 'react';
import { Image, Skeleton } from 'antd';
import { getBestCoverUrl, getPlaceholderCover, getCoverUrl } from '../utils/image';

type AntImagePreview = ComponentProps<typeof Image>['preview'];

// ==================== 类型 ====================

/** Book-like 最小接口，兼容 BookCard / BookDetail / BookWall 等各种数据形态 */
interface BookLike {
    cover_url?: string | null;
    local_cover_path?: string | null;
    douban_url?: string | null;
    title?: string | null;
    author?: string | null;
}

interface UnifiedCoverProps {
    // ---- 数据源（两种方式二选一） ----
    /** 直接提供图片 URL（跳过自动解析） */
    src?: string;
    /** 提供 book 对象，自动调用 getBestCoverUrl 解析最佳封面 */
    book?: BookLike;
    /** 直接指定封面 URL，仍享受 getCoverUrl 代理与占位回退 */
    coverUrl?: string | null;
    /** 是否使用代理 (getCoverUrl)，默认 true。仅 coverUrl 模式有效 */
    useProxy?: boolean;

    // ---- 占位图 ----
    /** 书名（用于生成占位图） */
    title?: string;
    /** 作者（用于生成占位图） */
    author?: string;

    // ---- 渲染模式 ----
    /** 渲染模式：image=Ant Image(可预览) | lazy=IntersectionObserver懒加载 | simple=纯img标签 */
    mode?: 'image' | 'lazy' | 'simple';

    // ---- 尺寸与样式 ----
    width?: number | string;
    aspectRatio?: string;
    borderRadius?: number;
    shadow?: boolean;
    className?: string;
    style?: CSSProperties;

    // ---- Ant Image 专属 ----
    /** 预览配置（仅 mode='image' 有效），false 禁用预览。支持 Ant Image 全部 preview 选项 */
    preview?: AntImagePreview;
    /** 图片描述 */
    alt?: string;

    // ---- 回调 ----
    onLoad?: () => void;
    onError?: () => void;
}

// ==================== 常量 ====================

const DEFAULT_ROOT_MARGIN = '200px';
const DEFAULT_MAX_RETRIES = 2;

// ==================== 懒加载核心 ====================

const LazyImg: FC<{
    src: string;
    alt: string;
    placeholder?: string;
    aspectRatio?: string;
    borderRadius?: number;
    style?: CSSProperties;
    onLoad?: () => void;
    onError?: () => void;
}> = ({ src, alt, placeholder, aspectRatio = '3/4', borderRadius = 8, style, onLoad, onError }) => {
    const supportsNativeLazy = typeof window !== 'undefined' && 'loading' in HTMLImageElement.prototype;
    const [isInView, setIsInView] = useState(supportsNativeLazy);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isError, setIsError] = useState(false);
    const [retryKey, setRetryKey] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout>>();
    const retryCountRef = useRef(0);

    useEffect(() => {
        if (supportsNativeLazy) return;
        observerRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setIsInView(true);
                        observerRef.current?.unobserve(entry.target);
                    }
                });
            },
            { rootMargin: DEFAULT_ROOT_MARGIN, threshold: 0.05 },
        );
        if (containerRef.current) observerRef.current.observe(containerRef.current);
        return () => observerRef.current?.disconnect();
    }, [supportsNativeLazy]);

    const handleLoad = useCallback(() => {
        setIsLoaded(true);
        setIsError(false);
        onLoad?.();
    }, [onLoad]);

    const handleError = useCallback(() => {
        if (retryCountRef.current < DEFAULT_MAX_RETRIES) {
            retryTimerRef.current = setTimeout(() => {
                retryCountRef.current += 1;
                setRetryKey((p) => p + 1);
                setIsLoaded(false);
                setIsError(false);
            }, Math.pow(2, retryCountRef.current) * 1000);
        } else {
            setIsError(true);
            onError?.();
        }
    }, [onError]);

    useEffect(() => () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); }, []);

    const containerStyle: CSSProperties = {
        position: 'relative',
        overflow: 'hidden',
        aspectRatio,
        borderRadius,
        background: isError ? '#fef2f2' : '#f5f5f4',
        ...style,
    };

    const imgStyle: CSSProperties = {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        opacity: isLoaded ? 1 : 0,
        transition: 'opacity 0.5s ease, transform 0.5s ease',
        transform: isLoaded ? 'scale(1)' : 'scale(1.05)',
    };

    const displaySrc = isError && placeholder ? placeholder : src;

    return (
        <div ref={containerRef} style={containerStyle}>
            {!isLoaded && !isError && !placeholder && (
                <Skeleton.Image active style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
            )}
            {placeholder && !isLoaded && (
                <img
                    src={placeholder}
                    alt=""
                    aria-hidden="true"
                    style={{
                        position: 'absolute', inset: 0, width: '100%', height: '100%',
                        objectFit: 'cover', filter: 'blur(10px)', transform: 'scale(1.1)',
                        opacity: isLoaded ? 0 : 0.6, transition: 'opacity 0.3s ease',
                    }}
                />
            )}
            {isInView && displaySrc && (
                <img
                    key={`${displaySrc}-${retryKey}`}
                    src={displaySrc}
                    alt={alt}
                    loading="lazy"
                    decoding="async"
                    onLoad={handleLoad}
                    onError={handleError}
                    style={imgStyle}
                />
            )}
            {isError && retryCountRef.current >= DEFAULT_MAX_RETRIES && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.02)' }}>
                    <span style={{ fontSize: 24, opacity: 0.3 }}>📷</span>
                </div>
            )}
        </div>
    );
};

// ==================== 主组件 ====================

const UnifiedCover: FC<UnifiedCoverProps> = ({
    src,
    book,
    coverUrl,
    useProxy = true,
    title,
    author,
    mode = 'image',
    width,
    aspectRatio = '3/4',
    borderRadius = 8,
    shadow = true,
    className,
    style,
    preview,
    alt,
    onLoad,
    onError,
}) => {
    // ---- URL 自动解析 ----
    const resolvedSrc = useMemo(() => {
        if (src) return src;
        if (book) return getBestCoverUrl(book.cover_url, book.local_cover_path, book.douban_url) || '';
        if (coverUrl) {
            if (useProxy) return getCoverUrl(coverUrl) || '';
            return coverUrl;
        }
        return '';
    }, [src, book, coverUrl, useProxy]);

    const resolvedTitle = title || book?.title || '';
    const resolvedAuthor = author || book?.author || '';
    const resolvedAlt = alt || (resolvedTitle ? `《${resolvedTitle}》封面` : '图书封面');

    // ---- 占位图 ----
    const placeholderUrl = useMemo(
        () => getPlaceholderCover(resolvedTitle, resolvedAuthor),
        [resolvedTitle, resolvedAuthor],
    );

    // ---- 样式 ----
    const defaultShadow = '0 4px 12px rgba(0,0,0,0.08)';
    const containerStyle: CSSProperties = {
        width,
        aspectRatio,
        borderRadius,
        objectFit: 'cover',
        ...(shadow ? { boxShadow: defaultShadow } : {}),
        ...style,
    };

    const showPreview = preview !== undefined ? preview : (mode === 'image' ? { mask: '查看大图' } : false);

    // ---- 渲染 ----
    if (mode === 'lazy') {
        return (
            <LazyImg
                src={resolvedSrc}
                alt={resolvedAlt}
                placeholder={placeholderUrl}
                aspectRatio={aspectRatio}
                borderRadius={borderRadius}
                style={containerStyle}
                onLoad={onLoad}
                onError={onError}
            />
        );
    }

    if (mode === 'simple') {
        return (
            <img
                src={resolvedSrc || placeholderUrl}
                alt={resolvedAlt}
                loading="lazy"
                decoding="async"
                style={containerStyle}
                className={className}
            />
        );
    }

    // mode === 'image' (default): Ant Design Image with preview
    return (
        <Image
            src={resolvedSrc || placeholderUrl}
            alt={resolvedAlt}
            style={containerStyle}
            fallback={placeholderUrl}
            preview={showPreview}
            className={className}
        />
    );
};

export default UnifiedCover;
