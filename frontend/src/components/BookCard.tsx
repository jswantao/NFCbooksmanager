// frontend/src/components/BookCard.tsx
/**
 * 图书卡片组件 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 骨架屏加载状态
 * - 更丰富的悬停效果
 * - 右键菜单支持
 * - 拖拽排序支持基础
 * - 无障碍属性完善
 * - 虚拟列表友好接口
 */

import React, { useCallback, useMemo, memo, useState, type FC, type CSSProperties } from 'react';
import { Card, Tag, Typography, Tooltip, Rate, Skeleton, Space, theme } from 'antd';
import {
    UserOutlined,
    StarFilled,
    BarcodeOutlined,
    CalendarOutlined,
    TranslationOutlined,
} from '../icons';
import type { Book } from '../types';
import { getCoverUrl, getPlaceholderCover } from '../utils/image';
import { truncateText } from '../utils/format';
import LazyImage from './LazyImage';

const { Text, Paragraph } = Typography;

// ==================== 常量 ====================

/** 书籍来源标签映射 */
const SOURCE_TAG_MAP: Record<string, { color: string; label: string }> = {
    douban: { color: 'green', label: '豆瓣' },
    manual: { color: 'orange', label: '手动' },
    isbn: { color: 'blue', label: 'ISBN' },
    nfc: { color: 'purple', label: 'NFC' },
};

/** 默认来源标签 */
const DEFAULT_SOURCE_TAG = { color: 'default', label: '未知' };

// ==================== 类型定义 ====================

interface BookCardProps {
    /** 图书数据 */
    book: Book;
    /** 视图模式 */
    viewMode?: 'grid' | 'list' | 'compact';
    /** 点击回调 */
    onClick?: (book: Book) => void;
    /** 右键菜单回调 */
    onContextMenu?: (book: Book, event: React.MouseEvent) => void;
    /** 是否显示评分 */
    showRating?: boolean;
    /** 加载状态 */
    loading?: boolean;
    /** 自定义类名 */
    className?: string;
    /** 自定义样式 */
    style?: CSSProperties;
    /** 数据索引（虚拟列表用） */
    dataIndex?: number;
    /** 是否选中 */
    selected?: boolean;
}

// ==================== 子组件 ====================

/** 书籍封面组件 */
const BookCover: FC<{
    book: Book;
    size: 'small' | 'large';
    viewMode: string;
}> = memo(({ book, size, viewMode }) => {
    const coverUrl = useMemo(
        () => getCoverUrl(book.cover_url) || '',
        [book.cover_url]
    );

    const placeholderUrl = useMemo(
        () => getPlaceholderCover(book.title, book.author),
        [book.title, book.author]
    );

    const isSmall = size === 'small';
    const dims = isSmall
        ? { width: 80, height: 112 }
        : { width: '100%', height: viewMode === 'compact' ? 200 : 280 };

    const borderRadius = isSmall ? 6 : viewMode === 'compact' ? '6px 6px 0 0' : '12px 12px 0 0';

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden',
                borderRadius,
                background: isSmall ? 'transparent' : '#fafaf9',
                ...dims,
                position: 'relative',
            }}
        >
            {coverUrl ? (
                <LazyImage
                    src={coverUrl}
                    alt={`《${book.title}》封面`}
                    fallback={placeholderUrl}
                    aspectRatio={isSmall ? '80/112' : '3/4'}
                    style={{
                        width: '100%',
                        height: '100%',
                        borderRadius,
                    }}
                />
            ) : (
                <img
                    alt={`《${book.title}》封面占位图`}
                    src={placeholderUrl}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius,
                    }}
                    loading="lazy"
                />
            )}
        </div>
    );
});
BookCover.displayName = 'BookCover';

// ==================== 主组件 ====================

const BookCard: FC<BookCardProps> = memo(
    ({
        book,
        viewMode = 'grid',
        onClick,
        onContextMenu,
        showRating = false,
        loading = false,
        className,
        style,
        dataIndex,
        selected = false,
    }) => {
        const [imgLoaded, setImgLoaded] = useState(false);
        const { token } = theme.useToken();

        // ==================== 数据计算 ====================

        const sourceTag = useMemo(
            () => SOURCE_TAG_MAP[book.source] || DEFAULT_SOURCE_TAG,
            [book.source]
        );

        const ratingValue = useMemo(() => {
            if (!book.rating) return 0;
            const p = parseFloat(book.rating);
            return isNaN(p) ? 0 : p;
        }, [book.rating]);

        const normalizedRating = useMemo(
            () => Math.min(ratingValue / 2, 5),
            [ratingValue]
        );

        // ==================== 事件处理 ====================

        const handleClick = useCallback(() => {
            if (onClick && !loading) onClick(book);
        }, [onClick, book, loading]);

        const handleContextMenu = useCallback(
            (event: React.MouseEvent) => {
                if (onContextMenu) {
                    event.preventDefault();
                    onContextMenu(book, event);
                }
            },
            [onContextMenu, book]
        );

        const handleKeyDown = useCallback(
            (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick();
                }
            },
            [handleClick]
        );

        // ==================== 标签渲染 ====================

        const renderTags = useCallback(
            () => (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <Tag
                        color={sourceTag.color}
                        style={{
                            fontSize: 11,
                            margin: 0,
                            borderRadius: 4,
                            padding: '0 6px',
                            lineHeight: '20px',
                        }}
                    >
                        {sourceTag.label}
                    </Tag>
                    {ratingValue > 0 && (
                        <Tag
                            color="gold"
                            style={{
                                fontSize: 11,
                                margin: 0,
                                borderRadius: 4,
                                padding: '0 6px',
                                lineHeight: '20px',
                            }}
                        >
                            <StarFilled style={{ fontSize: 10, marginRight: 2 }} />
                            {book.rating}
                        </Tag>
                    )}
                </div>
            ),
            [sourceTag, ratingValue, book.rating]
        );

        // ==================== 元信息渲染 ====================

        const renderMeta = useCallback(() => {
            const metaItems: React.ReactNode[] = [];

            if (book.author) {
                metaItems.push(
                    <Tooltip title={`作者: ${book.author}`} key="author">
                        <Space size={4}>
                            <UserOutlined style={{ fontSize: 12, color: token.colorTextTertiary }} />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                {truncateText(book.author, 20)}
                            </Text>
                        </Space>
                    </Tooltip>
                );
            }

            if (book.publisher) {
                metaItems.push(
                    <Tooltip title={`出版社: ${book.publisher}`} key="publisher">
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            {truncateText(book.publisher, 15)}
                        </Text>
                    </Tooltip>
                );
            }

            if (book.publish_date) {
                metaItems.push(
                    <Space size={4} key="date">
                        <CalendarOutlined style={{ fontSize: 11, color: token.colorTextTertiary }} />
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            {book.publish_date}
                        </Text>
                    </Space>
                );
            }

            if (book.translator) {
                metaItems.push(
                    <Space size={4} key="translator">
                        <TranslationOutlined style={{ fontSize: 11, color: token.colorTextTertiary }} />
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            {truncateText(book.translator, 12)}
                        </Text>
                    </Space>
                );
            }

            return metaItems;
        }, [book, token]);

        // ==================== 列表视图 ====================

        if (viewMode === 'list') {
            // 加载骨架屏
            if (loading) {
                return (
                    <Card style={{ borderRadius: 12, ...style }} styles={{ body: { padding: 16 } }}>
                        <div style={{ display: 'flex', gap: 16 }}>
                            <Skeleton.Image style={{ width: 80, height: 112, borderRadius: 6 }} active />
                            <div style={{ flex: 1 }}>
                                <Skeleton active paragraph={{ rows: 2 }} />
                            </div>
                        </div>
                    </Card>
                );
            }

            return (
                <Card
                    hoverable
                    onClick={handleClick}
                    onContextMenu={handleContextMenu}
                    onKeyDown={handleKeyDown}
                    className={className}
                    style={{
                        borderRadius: 12,
                        border: selected
                            ? `2px solid ${token.colorPrimary}`
                            : `1px solid ${token.colorBorderSecondary}`,
                        cursor: onClick ? 'pointer' : 'default',
                        transition: 'all 0.2s ease',
                        ...style,
                    }}
                    styles={{ body: { padding: 16 } }}
                    tabIndex={0}
                    role="article"
                    aria-label={`图书: ${book.title}`}
                >
                    <div style={{ display: 'flex', gap: 16 }}>
                        <BookCover book={book} size="small" viewMode={viewMode} />
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
                                {renderTags()}
                            </div>

                            {/* 元信息 */}
                            <div
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 12,
                                    marginBottom: 8,
                                }}
                            >
                                {renderMeta()}
                            </div>

                            {/* 摘要 */}
                            {book.summary && (
                                <Paragraph
                                    ellipsis={{ rows: 2 }}
                                    style={{
                                        color: token.colorTextTertiary,
                                        fontSize: 13,
                                        marginBottom: 12,
                                    }}
                                >
                                    {book.summary}
                                </Paragraph>
                            )}

                            {/* 底部信息 */}
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}
                            >
                                <Space size={12}>
                                    {book.isbn && (
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            <BarcodeOutlined /> {book.isbn}
                                        </Text>
                                    )}
                                    {book.pages && (
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            {book.pages}页
                                        </Text>
                                    )}
                                </Space>
                                {showRating && ratingValue > 0 && (
                                    <Space size={4}>
                                        <Rate
                                            disabled
                                            allowHalf
                                            value={normalizedRating}
                                            count={5}
                                            style={{ fontSize: 14 }}
                                        />
                                        <Text style={{ fontSize: 13, fontWeight: 500 }}>
                                            {book.rating}
                                        </Text>
                                    </Space>
                                )}
                            </div>
                        </div>
                    </div>
                </Card>
            );
        }

        // ==================== 网格/紧凑视图 ====================

        if (loading) {
            return (
                <Card
                    style={{
                        height: '100%',
                        borderRadius: 12,
                        ...style,
                    }}
                    styles={{ body: { padding: 16 } }}
                >
                    <Skeleton.Image
                        style={{ width: '100%', height: 200, borderRadius: 8 }}
                        active
                    />
                    <Skeleton active paragraph={{ rows: 2 }} style={{ marginTop: 12 }} />
                </Card>
            );
        }

        const cardBodyStyle: CSSProperties =
            viewMode === 'compact'
                ? { padding: 12 }
                : { flex: 1, padding: 16, display: 'flex', flexDirection: 'column' };

        const titleLines = viewMode === 'compact' ? 1 : 2;

        return (
            <Card
                hoverable
                onClick={handleClick}
                onContextMenu={handleContextMenu}
                onKeyDown={handleKeyDown}
                className={className}
                cover={<BookCover book={book} size="large" viewMode={viewMode} />}
                style={{
                    height: '100%',
                    borderRadius: 12,
                    border: selected
                        ? `2px solid ${token.colorPrimary}`
                        : `1px solid ${token.colorBorderSecondary}`,
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: onClick ? 'pointer' : 'default',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    ...style,
                }}
                styles={{ body: cardBodyStyle }}
                tabIndex={0}
                role="article"
                aria-label={`图书: ${book.title}`}
            >
                {/* 标题 */}
                <Tooltip title={book.title}>
                    <Text
                        strong
                        style={{
                            fontSize: viewMode === 'compact' ? 13 : 15,
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: titleLines,
                            WebkitBoxOrient: 'vertical',
                            minHeight: viewMode === 'compact' ? 20 : 42,
                            marginBottom: 6,
                            lineHeight: 1.4,
                        }}
                    >
                        {book.title}
                    </Text>
                </Tooltip>

                {/* 标签 */}
                {renderTags()}

                {/* 内容区 */}
                <div style={{ flex: 1, marginTop: 8 }}>
                    {viewMode !== 'compact' && (
                        <>
                            {book.author && (
                                <div style={{ marginBottom: 6 }}>
                                    <Space size={4}>
                                        <UserOutlined
                                            style={{
                                                fontSize: 12,
                                                color: token.colorTextTertiary,
                                            }}
                                        />
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            {truncateText(book.author, 18)}
                                        </Text>
                                    </Space>
                                </div>
                            )}
                            {book.summary && (
                                <Paragraph
                                    ellipsis={{ rows: 2 }}
                                    style={{
                                        color: token.colorTextTertiary,
                                        fontSize: 12,
                                        marginBottom: 12,
                                    }}
                                >
                                    {book.summary}
                                </Paragraph>
                            )}
                        </>
                    )}
                </div>

                {/* 底部信息 */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: 'auto',
                        paddingTop: viewMode === 'compact' ? 8 : 12,
                        borderTop: `1px solid ${token.colorBorderSecondary}`,
                    }}
                >
                    {book.isbn ? (
                        <Text
                            type="secondary"
                            style={{ fontSize: 10, fontFamily: 'monospace' }}
                            ellipsis
                        >
                            {book.isbn}
                        </Text>
                    ) : (
                        <div />
                    )}
                    {showRating && ratingValue > 0 && (
                        <Space size={2}>
                            <StarFilled
                                style={{ color: token.colorWarning, fontSize: 12 }}
                            />
                            <Text style={{ fontSize: 12, fontWeight: 500 }}>
                                {book.rating}
                            </Text>
                        </Space>
                    )}
                </div>
            </Card>
        );
    }
);

BookCard.displayName = 'BookCard';
export default BookCard;