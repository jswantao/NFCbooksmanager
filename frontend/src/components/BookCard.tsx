// frontend/src/components/BookCard.tsx
/**
 * 图书卡片组件
 * 
 * 展示图书的核心信息，支持网格和列表两种视图模式。
 * 
 * 功能：
 * - 网格模式：图书封面 + 标题 + 标签 + 作者 + 简介摘要
 * - 列表模式：横向布局，封面在左，详细信息在右
 * - 封面加载失败自动回退到 SVG 占位图
 * - 封面懒加载（loading="lazy"）
 * - 骨架屏加载状态
 * - 点击事件回调
 * 
 * 性能优化：
 * - React.memo 包裹避免不必要的重渲染
 * - useMemo 缓存计算结果（封面 URL、占位图）
 * - useCallback 固定事件处理函数引用
 */

import React, { useState, useCallback, useMemo, memo } from 'react';
import { Card, Tag, Typography, Skeleton, Tooltip, Rate } from 'antd';
import {
    UserOutlined,
    StarFilled,
    BarcodeOutlined,
} from '@ant-design/icons';
import type { Book } from '../types';
import { getCoverUrl, getPlaceholderCover, handleImageError } from '../utils/image';

// ---- 常量 ----

const { Text, Paragraph } = Typography;

/**
 * 数据来源标签映射
 * 
 * 不同来源显示不同颜色的标签
 */
const SOURCE_TAG_MAP: Record<string, { color: string; label: string }> = {
    douban: { color: 'green', label: '豆瓣' },
    manual: { color: 'orange', label: '手动' },
    isbn: { color: 'blue', label: 'ISBN' },
    nfc: { color: 'purple', label: 'NFC' },
};

/** 默认来源标签（未知来源） */
const DEFAULT_SOURCE_TAG = { color: 'default', label: '未知' };

// ---- 类型定义 ----

interface BookCardProps {
    /** 图书数据 */
    book: Book;
    /** 视图模式 */
    viewMode?: 'grid' | 'list';
    /** 点击回调 */
    onClick?: (book: Book) => void;
    /** 是否显示星级评分 */
    showRating?: boolean;
    /** 是否显示加载骨架屏 */
    loading?: boolean;
}

interface BookCoverProps {
    book: Book;
    /** 封面尺寸：small=列表模式(80×112)，large=网格模式(全宽×280) */
    size: 'small' | 'large';
}

// ---- 子组件 ----

/**
 * 图书封面组件（带加载状态和错误回退）
 * 
 * 加载流程：
 * 1. 有封面 URL → 尝试加载远程图片
 * 2. 加载中 → 显示骨架屏
 * 3. 加载成功 → 显示封面图片
 * 4. 加载失败 → 显示 SVG 占位图
 * 5. 无封面 URL → 直接显示占位图
 */
const BookCover: React.FC<BookCoverProps> = memo(({ book, size }) => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);
    
    /** 代理后的封面 URL（豆瓣图片通过后端代理） */
    const coverUrl = useMemo(
        () => getCoverUrl(book.cover_url) || null,
        [book.cover_url]
    );
    
    /** SVG 占位图（基于书名和作者生成唯一颜色） */
    const placeholderUrl = useMemo(
        () => getPlaceholderCover(book.title, book.author),
        [book.title, book.author]
    );
    
    const isSmall = size === 'small';
    
    /** 封面容器尺寸 */
    const containerStyle = useMemo(
        () =>
            isSmall
                ? { width: 80, height: 112 }
                : { width: '100%', height: 280 },
        [isSmall]
    );
    
    /** 背景与圆角样式 */
    const backgroundStyle = isSmall
        ? { background: 'transparent' }
        : { background: '#fafaf9' };
    
    const borderRadius = isSmall ? 4 : '8px 8px 0 0';
    const objectFit = isSmall ? 'cover' : ('contain' as const);
    const imagePadding = isSmall ? 0 : 16;
    
    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden',
                borderRadius,
                ...backgroundStyle,
                ...containerStyle,
                position: 'relative',
            }}
        >
            {/* 加载中的骨架屏 */}
            {!imageLoaded && !imageError && coverUrl && (
                <Skeleton.Image
                    active
                    style={{
                        width: containerStyle.width,
                        height: containerStyle.height,
                        position: 'absolute',
                    }}
                />
            )}
            
            {/* 远程封面图片 */}
            {coverUrl && (
                <img
                    alt={book.title}
                    src={coverUrl}
                    onLoad={() => {
                        setImageLoaded(true);
                        setImageError(false);
                    }}
                    onError={(e) => {
                        handleImageError(e, book.title, book.author);
                        setImageError(true);
                        setImageLoaded(false);
                    }}
                    style={{
                        display: imageLoaded ? 'block' : 'none',
                        width: '100%',
                        height: '100%',
                        objectFit,
                        padding: imagePadding,
                        borderRadius,
                        opacity: imageLoaded ? 1 : 0,
                    }}
                    loading="lazy"
                />
            )}
            
            {/* 占位图（无封面或加载失败） */}
            {(!coverUrl || imageError) && (
                <img
                    alt={book.title}
                    src={placeholderUrl}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius,
                    }}
                />
            )}
        </div>
    );
});

BookCover.displayName = 'BookCover';

// ---- 主组件 ----

/**
 * 图书卡片主组件
 * 
 * 使用 React.memo 优化性能，仅在 book 数据或 viewMode 变化时重渲染。
 */
const BookCard: React.FC<BookCardProps> = memo(
    ({ book, viewMode = 'grid', onClick, showRating = false, loading = false }) => {
        /**
         * 点击处理（防止加载中触发）
         */
        const handleClick = useCallback(() => {
            if (onClick && !loading) {
                onClick(book);
            }
        }, [onClick, book, loading]);

        /** 数据来源标签信息 */
        const sourceTag = SOURCE_TAG_MAP[book.source] || DEFAULT_SOURCE_TAG;

        /** 评分浮点数值（用于 Rate 组件） */
        const ratingValue = useMemo(() => {
            if (!book.rating) return 0;
            const parsed = parseFloat(book.rating);
            return isNaN(parsed) ? 0 : parsed;
        }, [book.rating]);

        // ==================== 标签组件 ====================
        
        /** 图书标签区（来源 + 评分） */
        const BookTags: React.FC = () => (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <Tag
                    color={sourceTag.color}
                    style={{ fontSize: 11, margin: 0 }}
                >
                    {sourceTag.label}
                </Tag>
                {ratingValue > 0 && (
                    <Tag
                        color="gold"
                        style={{ fontSize: 11, margin: 0 }}
                    >
                        <StarFilled style={{ fontSize: 10, marginRight: 2 }} />
                        {book.rating}
                    </Tag>
                )}
            </div>
        );

        // ==================== 列表模式 ====================
        
        if (viewMode === 'list') {
            return (
                <Card
                    hoverable={!loading}
                    onClick={handleClick}
                    loading={loading}
                    style={{
                        borderRadius: 12,
                        border: '1px solid #e8d5c8',
                        cursor: onClick ? 'pointer' : 'default',
                    }}
                    bodyStyle={{ padding: 16 }}
                >
                    <div style={{ display: 'flex', gap: 16 }}>
                        {/* 左侧封面（小尺寸） */}
                        <BookCover book={book} size="small" />
                        
                        {/* 右侧信息 */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            {/* 标题行 */}
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    marginBottom: 8,
                                }}
                            >
                                <Tooltip title={book.title}>
                                    <Text
                                        strong
                                        style={{
                                            fontSize: 16,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            flex: 1,
                                        }}
                                    >
                                        {book.title}
                                    </Text>
                                </Tooltip>
                                <BookTags />
                            </div>
                            
                            {/* 作者 */}
                            {book.author && (
                                <div
                                    style={{
                                        color: '#6b5e56',
                                        marginBottom: 8,
                                    }}
                                >
                                    <UserOutlined
                                        style={{
                                            fontSize: 13,
                                            marginRight: 6,
                                        }}
                                    />
                                    <Text
                                        type="secondary"
                                        style={{ fontSize: 13 }}
                                    >
                                        {book.author}
                                    </Text>
                                </div>
                            )}
                            
                            {/* 摘要 */}
                            {book.summary && (
                                <Paragraph
                                    ellipsis={{ rows: 2 }}
                                    style={{
                                        color: '#8c7b72',
                                        fontSize: 13,
                                        marginBottom: 12,
                                    }}
                                >
                                    {book.summary}
                                </Paragraph>
                            )}
                            
                            {/* 底部信息栏 */}
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}
                            >
                                {book.isbn && (
                                    <Text
                                        type="secondary"
                                        style={{ fontSize: 12 }}
                                    >
                                        <BarcodeOutlined /> {book.isbn}
                                    </Text>
                                )}
                                {showRating && ratingValue > 0 && (
                                    <Rate
                                        disabled
                                        allowHalf
                                        value={ratingValue / 2}
                                        count={5}
                                        style={{ fontSize: 12 }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </Card>
            );
        }

        // ==================== 网格模式 ====================
        
        return (
            <Card
                hoverable={!loading}
                onClick={handleClick}
                loading={loading}
                cover={<BookCover book={book} size="large" />}
                style={{
                    height: '100%',
                    borderRadius: 12,
                    border: '1px solid #e8d5c8',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: onClick ? 'pointer' : 'default',
                }}
                bodyStyle={{
                    flex: 1,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {/* 标题（最多 2 行） */}
                <Tooltip title={book.title}>
                    <Text
                        strong
                        style={{
                            fontSize: 15,
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            minHeight: 42,
                            marginBottom: 8,
                        }}
                    >
                        {book.title}
                    </Text>
                </Tooltip>
                
                {/* 标签 */}
                <BookTags />
                
                {/* 内容区（自动填充剩余空间） */}
                <div style={{ flex: 1, marginTop: 8 }}>
                    {book.author && (
                        <div
                            style={{
                                color: '#6b5e56',
                                marginBottom: 8,
                            }}
                        >
                            <UserOutlined
                                style={{
                                    fontSize: 12,
                                    marginRight: 6,
                                }}
                            />
                            <Text
                                type="secondary"
                                style={{ fontSize: 12 }}
                            >
                                {book.author}
                            </Text>
                        </div>
                    )}
                    {book.summary && (
                        <Paragraph
                            ellipsis={{ rows: 2 }}
                            style={{
                                color: '#8c7b72',
                                fontSize: 12,
                                marginBottom: 12,
                            }}
                        >
                            {book.summary}
                        </Paragraph>
                    )}
                </div>
                
                {/* 底部信息栏（推到容器底部） */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: 'auto',
                        paddingTop: 12,
                        borderTop: '1px solid #f0e4d8',
                    }}
                >
                    {book.isbn ? (
                        <Text
                            type="secondary"
                            style={{ fontSize: 11 }}
                        >
                            ISBN {book.isbn}
                        </Text>
                    ) : (
                        <div />
                    )}
                    {showRating && ratingValue > 0 && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                            }}
                        >
                            <StarFilled
                                style={{
                                    color: '#f59e0b',
                                    fontSize: 12,
                                }}
                            />
                            <Text
                                style={{
                                    fontSize: 12,
                                    fontWeight: 500,
                                }}
                            >
                                {book.rating}
                            </Text>
                        </div>
                    )}
                </div>
            </Card>
        );
    }
);

BookCard.displayName = 'BookCard';

export default BookCard;