// frontend/src/pages/BookCoverWall.tsx
/**
 * 封面墙页面 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 自定义 Hook 封装无限滚动逻辑
 * - 响应式列数计算优化
 * - 全屏模式 API
 * - 图片预加载策略
 * - 右键菜单支持
 * - 键盘导航网格
 * - 加载状态骨架屏优化
 * - 无障碍属性
 */

import React, {
    useEffect,
    useState,
    useRef,
    useCallback,
    useMemo,
    memo,
    type FC,
    type KeyboardEvent,
} from 'react';
import {
    Card,
    Spin,
    Empty,
    Typography,
    Select,
    Button,
    Space,
    Tooltip,
    message,
    Skeleton,
    Drawer,
    Tag,
    Rate,
    FloatButton,
    Dropdown,
    Divider,
    Breadcrumb,
    theme,
    Badge,
    type MenuProps,
} from 'antd';
import {
    AppstoreOutlined,
    SortAscendingOutlined,
    ReloadOutlined,
    FullscreenOutlined,
    FullscreenExitOutlined,
    EyeOutlined,
    BookOutlined,
    StarFilled,
    UserOutlined,
    PlusOutlined,
    HomeOutlined,
    LoadingOutlined,
    FilterOutlined,
    SearchOutlined,
    CalendarOutlined,
    TranslationOutlined,
    BarcodeOutlined,
    RightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getBookWall, listShelves } from '../services/api';
import { getCoverUrl, getPlaceholderCover } from '../utils/image';
import { truncateText, formatAuthors } from '../utils/format';
import LazyImage from '../components/LazyImage';
import type { BookWallParams, Book } from '../types';

const { Title, Text, Paragraph } = Typography;

// ==================== 类型定义 ====================

interface BookWallItem {
    book_id: number;
    isbn: string;
    title: string;
    author?: string;
    translator?: string;
    cover_url?: string;
    rating?: string;
    source: string;
    publisher?: string;
    publish_date?: string;
    price?: string;
    shelf_name?: string;
    shelf_id?: number;
    added_at?: string;
    summary?: string;
    pages?: string;
}

type DensityType = 'compact' | 'cozy' | 'spacious';

interface ShelfOption {
    value: number;
    label: string;
}

// ==================== 常量 ====================

const PAGE_SIZE = 50;

const SORT_OPTIONS = [
    { value: 'added_at_desc', label: '📅 最近添加' },
    { value: 'added_at_asc', label: '📅 最早添加' },
    { value: 'rating_desc', label: '⭐ 评分最高' },
    { value: 'rating_asc', label: '⭐ 评分最低' },
    { value: 'title_asc', label: '🔤 书名 A-Z' },
    { value: 'title_desc', label: '🔤 书名 Z-A' },
];

const DENSITY_MENU_ITEMS: MenuProps['items'] = [
    { key: 'compact', label: '紧凑', icon: '▦' },
    { key: 'cozy', label: '舒适', icon: '▥' },
    { key: 'spacious', label: '宽敞', icon: '▨' },
];

const DENSITY_CONFIG: Record<DensityType, { gap: number; padding: number; infoOpacity: number }> = {
    compact: { gap: 8, padding: 0, infoOpacity: 0 },
    cozy: { gap: 16, padding: 8, infoOpacity: 1 },
    spacious: { gap: 24, padding: 12, infoOpacity: 1 },
};

const RESPONSIVE_COLUMNS = [
    { breakpoint: 640, columns: 2 },
    { breakpoint: 768, columns: 3 },
    { breakpoint: 1024, columns: 4 },
    { breakpoint: 1280, columns: 5 },
    { breakpoint: 1600, columns: 6 },
    { breakpoint: Infinity, columns: 7 },
];

// ==================== 自定义 Hook ====================

/**
 * 响应式列数计算 Hook
 */
const useResponsiveColumns = (): number => {
    const [columns, setColumns] = useState(() => {
        if (typeof window === 'undefined') return 5;
        return getColumnCount(window.innerWidth);
    });

    useEffect(() => {
        const handleResize = () => {
            setColumns(getColumnCount(window.innerWidth));
        };

        // 使用 requestAnimationFrame 防抖
        let rafId: number;
        const debouncedResize = () => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(handleResize);
        };

        window.addEventListener('resize', debouncedResize);
        return () => {
            window.removeEventListener('resize', debouncedResize);
            cancelAnimationFrame(rafId);
        };
    }, []);

    return columns;
};

/**
 * 根据宽度计算列数
 */
function getColumnCount(width: number): number {
    for (const config of RESPONSIVE_COLUMNS) {
        if (width < config.breakpoint) {
            return config.columns;
        }
    }
    return 7;
}

/**
 * 全屏模式 Hook
 */
const useFullscreen = () => {
    const [isFullscreen, setIsFullscreen] = useState(false);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {
                // 全屏 API 不可用时降级
                setIsFullscreen(true);
            });
        } else {
            document.exitFullscreen().catch(() => {
                setIsFullscreen(false);
            });
        }
    }, []);

    // 监听全屏变化
    useEffect(() => {
        const handleChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleChange);
        return () => document.removeEventListener('fullscreenchange', handleChange);
    }, []);

    return { isFullscreen, toggleFullscreen };
};

/**
 * 无限滚动数据加载 Hook
 */
const useInfiniteBooks = (params: {
    selectedShelfId?: number;
    sortBy: string;
}) => {
    const { selectedShelfId, sortBy } = params;

    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [books, setBooks] = useState<BookWallItem[]>([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const currentPage = useRef(0);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    /** 解析排序参数 */
    const parseSortParams = useCallback((value: string) => {
        const idx = value.lastIndexOf('_');
        if (idx === -1) return { field: value, order: 'asc' as const };
        return {
            field: value.substring(0, idx),
            order: value.substring(idx + 1) as 'asc' | 'desc',
        };
    }, []);

    /** 加载图书（重置） */
    const loadBooks = useCallback(
        async (reset = false) => {
            if (reset) {
                setLoading(true);
                currentPage.current = 0;
            }

            setError(null);

            try {
                const { field, order } = parseSortParams(sortBy);
                const queryParams: BookWallParams = {
                    sort_by: field,
                    order,
                    limit: PAGE_SIZE,
                    offset: reset ? 0 : currentPage.current * PAGE_SIZE,
                };

                if (selectedShelfId && selectedShelfId > 0) {
                    queryParams.shelf_id = selectedShelfId;
                }

                const data = await getBookWall(queryParams);

                if (isMounted.current) {
                    setBooks(reset ? data.books : (prev) => [...prev, ...data.books]);
                    setTotal(data.total);
                    setHasMore(data.has_more);
                }
            } catch (err: any) {
                if (isMounted.current && reset) {
                    setError(err?.response?.data?.detail || '加载失败');
                }
            } finally {
                if (isMounted.current) {
                    setLoading(false);
                }
            }
        },
        [sortBy, selectedShelfId, parseSortParams]
    );

    /** 加载更多 */
    const loadMoreBooks = useCallback(async () => {
        if (loadingMore || !hasMore) return;

        setLoadingMore(true);
        currentPage.current++;

        try {
            const { field, order } = parseSortParams(sortBy);
            const queryParams: BookWallParams = {
                sort_by: field,
                order,
                limit: PAGE_SIZE,
                offset: currentPage.current * PAGE_SIZE,
            };

            if (selectedShelfId && selectedShelfId > 0) {
                queryParams.shelf_id = selectedShelfId;
            }

            const data = await getBookWall(queryParams);

            if (isMounted.current) {
                setBooks((prev) => [...prev, ...data.books]);
                setHasMore(data.has_more);
            }
        } catch {
            currentPage.current--;
        } finally {
            if (isMounted.current) {
                setLoadingMore(false);
            }
        }
    }, [loadingMore, hasMore, sortBy, selectedShelfId, parseSortParams]);

    return {
        books,
        total,
        loading,
        loadingMore,
        hasMore,
        error,
        loadBooks,
        loadMoreBooks,
    };
};

// ==================== 子组件 ====================

/** 封面卡片组件 */
const CoverCard: FC<{
    book: BookWallItem;
    density: DensityType;
    onClick: () => void;
    onShelfClick: (id: number) => void;
    onContextMenu?: (book: BookWallItem, e: React.MouseEvent) => void;
}> = memo(({ book, density, onClick, onShelfClick, onContextMenu }) => {
    const coverUrl = useMemo(
        () => getCoverUrl(book.cover_url) || '',
        [book.cover_url]
    );

    const placeholderUrl = useMemo(
        () => getPlaceholderCover(book.title, book.author),
        [book.title, book.author]
    );

    const config = DENSITY_CONFIG[density] || DENSITY_CONFIG.cozy;
    const showOverlay = density !== 'compact';
    const showExtra = density === 'spacious';

    const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
            }
        },
        [onClick]
    );

    const handleContextMenu = useCallback(
        (e: React.MouseEvent) => {
            if (onContextMenu) {
                e.preventDefault();
                onContextMenu(book, e);
            }
        },
        [book, onContextMenu]
    );

    const ratingNum = useMemo(() => {
        if (!book.rating) return 0;
        const n = parseFloat(book.rating);
        return isNaN(n) ? 0 : n;
    }, [book.rating]);

    return (
        <div
            style={{ padding: config.padding, cursor: 'pointer' }}
            onClick={onClick}
            onContextMenu={handleContextMenu}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`查看《${book.title}》详情`}
        >
            <div
                style={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: 10,
                    aspectRatio: '3/4',
                    boxShadow: '0 2px 12px rgba(139,69,19,0.1)',
                    transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                className="cover-card-hover"
            >
                {/* 封面图片 */}
                <LazyImage
                    src={coverUrl}
                    alt={`《${book.title}》封面`}
                    fallback={placeholderUrl}
                    aspectRatio="3/4"
                    style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: 10,
                    }}
                />

                {/* 评分角标 */}
                {ratingNum > 0 && (
                    <div
                        style={{
                            position: 'absolute',
                            top: 10,
                            right: 10,
                            background: 'rgba(0,0,0,0.75)',
                            color: '#fff',
                            padding: '3px 10px',
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 12,
                            fontWeight: 600,
                            backdropFilter: 'blur(8px)',
                            zIndex: 2,
                            letterSpacing: '0.02em',
                        }}
                    >
                        <StarFilled style={{ color: '#f59e0b', fontSize: 11 }} />
                        {book.rating}
                    </div>
                )}

                {/* 悬停覆盖层 */}
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background:
                            'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.05) 70%, transparent 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        padding: '16px 14px',
                        opacity: showOverlay ? 1 : 0,
                        transition: 'opacity 0.35s ease',
                        zIndex: 1,
                        pointerEvents: 'none',
                    }}
                >
                    <Paragraph
                        style={{
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: 14,
                            marginBottom: 6,
                            lineHeight: 1.3,
                        }}
                        ellipsis={{ rows: 2 }}
                    >
                        {book.title}
                    </Paragraph>
                    {book.author && (
                        <Text
                            style={{
                                color: 'rgba(255,255,255,0.75)',
                                fontSize: 11,
                            }}
                        >
                            <UserOutlined style={{ marginRight: 4 }} />
                            {truncateText(book.author, 20)}
                        </Text>
                    )}
                    <Space size={4} style={{ marginTop: 10 }}>
                        {book.shelf_name && (
                            <Tag
                                color="blue"
                                style={{
                                    fontSize: 10,
                                    cursor: 'pointer',
                                    pointerEvents: 'auto',
                                    margin: 0,
                                    borderRadius: 4,
                                    padding: '0 6px',
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (book.shelf_id) onShelfClick(book.shelf_id);
                                }}
                            >
                                {book.shelf_name}
                            </Tag>
                        )}
                        {book.source === 'douban' && (
                            <Tag
                                color="green"
                                style={{
                                    fontSize: 10,
                                    margin: 0,
                                    borderRadius: 4,
                                    padding: '0 6px',
                                }}
                            >
                                豆瓣
                            </Tag>
                        )}
                    </Space>
                </div>
            </div>

            {/* 宽敞模式额外信息 */}
            {showExtra && (
                <div style={{ marginTop: 10, padding: '0 4px' }}>
                    <Text
                        strong
                        style={{ fontSize: 13, display: 'block' }}
                        ellipsis
                    >
                        {book.title}
                    </Text>
                    {book.author && (
                        <Text
                            type="secondary"
                            style={{ fontSize: 12, display: 'block', marginTop: 2 }}
                        >
                            {formatAuthors(book.author, 2)}
                        </Text>
                    )}
                </div>
            )}
        </div>
    );
});
CoverCard.displayName = 'CoverCard';

// ==================== 主组件 ====================

const BookCoverWall: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();
    const columnCount = useResponsiveColumns();
    const { isFullscreen, toggleFullscreen } = useFullscreen();

    // 状态
    const [selectedShelfId, setSelectedShelfId] = useState<number | undefined>();
    const [sortBy, setSortBy] = useState('added_at_desc');
    const [density, setDensity] = useState<DensityType>('cozy');
    const [drawerBook, setDrawerBook] = useState<BookWallItem | null>(null);
    const [shelfList, setShelfList] = useState<ShelfOption[]>([]);

    // 无限滚动
    const {
        books,
        total,
        loading,
        loadingMore,
        hasMore,
        error,
        loadBooks,
        loadMoreBooks,
    } = useInfiniteBooks({ selectedShelfId, sortBy });

    // Intersection Observer 触发加载更多
    const loadMoreRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!hasMore) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !loadingMore) {
                    loadMoreBooks();
                }
            },
            { threshold: 0.1, rootMargin: '200px' }
        );

        const el = loadMoreRef.current;
        if (el) observer.observe(el);

        return () => {
            if (el) observer.unobserve(el);
            observer.disconnect();
        };
    }, [hasMore, loadingMore, loadMoreBooks]);

    // 加载书架列表
    useEffect(() => {
        let isMounted = true;

        listShelves()
            .then((data) => {
                if (isMounted && data) {
                    setShelfList(
                        data.map((s) => ({
                            value: s.logical_shelf_id,
                            label: s.shelf_name,
                        }))
                    );
                }
            })
            .catch(() => {});

        return () => {
            isMounted = false;
        };
    }, []);

    // 初始加载 + 重载
    useEffect(() => {
        loadBooks(true);
    }, [loadBooks]);

    // ==================== 事件处理 ====================

    const handleDrawerOpen = useCallback((book: BookWallItem) => {
        setDrawerBook(book);
    }, []);

    const handleDrawerClose = useCallback(() => {
        setDrawerBook(null);
    }, []);

    const handleShelfClick = useCallback(
        (id: number) => {
            navigate(`/shelf/${id}`);
        },
        [navigate]
    );

    const handleNavigateToDetail = useCallback(
        (book: BookWallItem) => {
            const path = book.shelf_id
                ? `/shelf/${book.shelf_id}/book/${book.book_id}`
                : `/shelf/1/book/${book.book_id}`;
            navigate(path);
            setDrawerBook(null);
        },
        [navigate]
    );

    // ==================== 渲染骨架屏 ====================

    const renderSkeletonGrid = () => (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                gap: DENSITY_CONFIG[density].gap,
            }}
        >
            {Array.from({ length: columnCount * 3 }).map((_, i) => (
                <div key={i} style={{ aspectRatio: '3/4' }}>
                    <Skeleton.Image
                        active
                        style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: 10,
                        }}
                    />
                </div>
            ))}
        </div>
    );

    // ==================== 渲染封面网格 ====================

    const renderCoverGrid = () => {
        if (books.length === 0) {
            return (
                <Card
                    style={{
                        borderRadius: 12,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        textAlign: 'center',
                        padding: 60,
                    }}
                >
                    <Empty
                        image={
                            <BookOutlined
                                style={{
                                    fontSize: 72,
                                    color: token.colorTextQuaternary,
                                    opacity: 0.4,
                                }}
                            />
                        }
                        description={
                            <div>
                                <Text type="secondary">
                                    {selectedShelfId
                                        ? '该书架暂无图书'
                                        : '暂无图书'}
                                </Text>
                            </div>
                        }
                    >
                        <Space>
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={() => navigate('/search')}
                            >
                                添加图书
                            </Button>
                            {selectedShelfId && (
                                <Button
                                    icon={<FilterOutlined />}
                                    onClick={() => setSelectedShelfId(undefined)}
                                >
                                    查看全部
                                </Button>
                            )}
                        </Space>
                    </Empty>
                </Card>
            );
        }

        const densityConfig = DENSITY_CONFIG[density];

        return (
            <>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                        gap: densityConfig.gap,
                    }}
                >
                    {books.map((book, index) => (
                        <CoverCard
                            key={`${book.book_id}-${index}`}
                            book={book}
                            density={density}
                            onClick={() => handleDrawerOpen(book)}
                            onShelfClick={handleShelfClick}
                        />
                    ))}
                </div>

                {/* 加载更多触发器 */}
                {hasMore && (
                    <div
                        ref={loadMoreRef}
                        style={{
                            textAlign: 'center',
                            padding: '40px 0',
                        }}
                    >
                        {loadingMore ? (
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: 12,
                                }}
                            >
                                <Spin
                                    indicator={
                                        <LoadingOutlined
                                            style={{ fontSize: 28 }}
                                            spin
                                        />
                                    }
                                />
                                <Text type="secondary">加载更多...</Text>
                            </div>
                        ) : (
                            <Button
                                size="large"
                                onClick={loadMoreBooks}
                                icon={<RightOutlined />}
                                style={{ borderRadius: 8 }}
                            >
                                加载更多 ({books.length} / {total})
                            </Button>
                        )}
                    </div>
                )}

                {/* 全部加载完成 */}
                {!hasMore && books.length > 0 && (
                    <Divider plain style={{ marginTop: 40 }}>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                            📚 已展示全部 {total} 本藏书
                        </Text>
                    </Divider>
                )}
            </>
        );
    };

    // ==================== 渲染侧边详情 ====================

    const renderDrawer = () => (
        <Drawer
            title={
                <Space size={8}>
                    <BookOutlined style={{ color: token.colorPrimary }} />
                    <span>图书详情</span>
                </Space>
            }
            placement="right"
            size={400}
            open={!!drawerBook}
            onClose={handleDrawerClose}
            styles={{
                body: { padding: '20px 24px' },
            }}
            extra={
                <Button
                    type="text"
                    icon={<EyeOutlined />}
                    onClick={() => drawerBook && handleNavigateToDetail(drawerBook)}
                >
                    完整详情
                </Button>
            }
        >
            {drawerBook && (
                <div>
                    {/* 封面 */}
                    <div style={{ textAlign: 'center', marginBottom: 20 }}>
                        <LazyImage
                            src={getCoverUrl(drawerBook.cover_url) || ''}
                            alt={`《${drawerBook.title}》封面`}
                            fallback={getPlaceholderCover(
                                drawerBook.title,
                                drawerBook.author
                            )}
                            aspectRatio="3/4"
                            style={{
                                width: 180,
                                borderRadius: 10,
                                boxShadow: '0 8px 24px rgba(139,69,19,0.18)',
                                margin: '0 auto',
                            }}
                        />
                    </div>

                    {/* 标题 */}
                    <Title
                        level={4}
                        style={{
                            marginTop: 0,
                            marginBottom: 8,
                            textAlign: 'center',
                        }}
                    >
                        {drawerBook.title}
                    </Title>

                    {/* 评分 */}
                    {drawerBook.rating && parseFloat(drawerBook.rating) > 0 && (
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: 10,
                                marginBottom: 20,
                            }}
                        >
                            <Rate
                                disabled
                                allowHalf
                                value={parseFloat(drawerBook.rating) / 2}
                                style={{ fontSize: 16 }}
                            />
                            <Text
                                strong
                                style={{
                                    fontSize: 20,
                                    color: '#f59e0b',
                                }}
                            >
                                {drawerBook.rating}
                            </Text>
                        </div>
                    )}

                    <Divider style={{ margin: '16px 0' }} />

                    {/* 详细信息 */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 14,
                        }}
                    >
                        {drawerBook.author && (
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    作者
                                </Text>
                                <br />
                                <Text style={{ fontSize: 14 }}>
                                    <UserOutlined style={{ marginRight: 6 }} />
                                    {drawerBook.author}
                                </Text>
                            </div>
                        )}

                        {drawerBook.translator && (
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    译者
                                </Text>
                                <br />
                                <Text style={{ fontSize: 14 }}>
                                    <TranslationOutlined style={{ marginRight: 6 }} />
                                    {drawerBook.translator}
                                </Text>
                            </div>
                        )}

                        <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                ISBN
                            </Text>
                            <br />
                            <Text code style={{ fontSize: 13 }} copyable>
                                {drawerBook.isbn}
                            </Text>
                        </div>

                        {drawerBook.publisher && (
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    出版社
                                </Text>
                                <br />
                                <Text style={{ fontSize: 14 }}>
                                    {drawerBook.publisher}
                                </Text>
                            </div>
                        )}

                        {drawerBook.publish_date && (
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    出版日期
                                </Text>
                                <br />
                                <Text style={{ fontSize: 14 }}>
                                    <CalendarOutlined style={{ marginRight: 6 }} />
                                    {drawerBook.publish_date}
                                </Text>
                            </div>
                        )}

                        {drawerBook.pages && (
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    页数
                                </Text>
                                <br />
                                <Text style={{ fontSize: 14 }}>
                                    {drawerBook.pages} 页
                                </Text>
                            </div>
                        )}

                        {drawerBook.price && (
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    定价
                                </Text>
                                <br />
                                <Text style={{ fontSize: 14 }}>
                                    {drawerBook.price}
                                </Text>
                            </div>
                        )}

                        {drawerBook.shelf_name && (
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    所在书架
                                </Text>
                                <br />
                                <Tag
                                    color="blue"
                                    style={{
                                        cursor: 'pointer',
                                        marginTop: 4,
                                        borderRadius: 6,
                                        padding: '2px 12px',
                                    }}
                                    onClick={() => {
                                        if (drawerBook.shelf_id) {
                                            navigate(
                                                `/shelf/${drawerBook.shelf_id}`
                                            );
                                            setDrawerBook(null);
                                        }
                                    }}
                                >
                                    <BookOutlined /> {drawerBook.shelf_name}
                                </Tag>
                            </div>
                        )}

                        <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                来源
                            </Text>
                            <br />
                            <Tag
                                color={
                                    drawerBook.source === 'douban'
                                        ? 'green'
                                        : 'orange'
                                }
                                style={{
                                    marginTop: 4,
                                    borderRadius: 6,
                                    padding: '2px 12px',
                                }}
                            >
                                {drawerBook.source === 'douban'
                                    ? '豆瓣同步'
                                    : '手动录入'}
                            </Tag>
                        </div>
                    </div>

                    {/* 摘要 */}
                    {drawerBook.summary && (
                        <>
                            <Divider style={{ margin: '20px 0 16px' }} />
                            <Text
                                type="secondary"
                                style={{ fontSize: 12, display: 'block', marginBottom: 8 }}
                            >
                                内容简介
                            </Text>
                            <Paragraph
                                ellipsis={{ rows: 5, expandable: true, symbol: '展开' }}
                                style={{
                                    fontSize: 13,
                                    color: token.colorTextSecondary,
                                    lineHeight: 1.7,
                                }}
                            >
                                {drawerBook.summary}
                            </Paragraph>
                        </>
                    )}

                    {/* 查看详情按钮 */}
                    <Button
                        type="primary"
                        icon={<EyeOutlined />}
                        block
                        size="large"
                        style={{ marginTop: 24, borderRadius: 8 }}
                        onClick={() => handleNavigateToDetail(drawerBook)}
                    >
                        查看完整详情
                    </Button>
                </div>
            )}
        </Drawer>
    );

    // ==================== 渲染页面 ====================

    return (
        <div
            style={{
                maxWidth: isFullscreen ? '100%' : 1800,
                margin: '0 auto',
                padding: isFullscreen ? '16px 24px' : '24px',
                transition: 'all 0.3s ease',
            }}
        >
            {/* 面包屑 */}
            {!isFullscreen && (
                <Breadcrumb
                    style={{ marginBottom: 16 }}
                    items={[
                        {
                            title: (
                                <a onClick={() => navigate('/')}>
                                    <HomeOutlined /> 首页
                                </a>
                            ),
                        },
                        { title: '封面墙' },
                    ]}
                />
            )}

            {/* 头部工具栏 */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 16,
                    marginBottom: 24,
                }}
            >
                <div>
                    <Title level={2} style={{ margin: 0 }}>
                        <AppstoreOutlined
                            style={{ color: token.colorPrimary, marginRight: 12 }}
                        />
                        封面墙
                    </Title>
                    <Space size={8} style={{ marginTop: 4 }}>
                        <Text type="secondary">
                            {total > 0 ? `${total} 本藏书` : '加载中...'}
                        </Text>
                        {selectedShelfId && (
                            <Tag
                                closable
                                onClose={() => setSelectedShelfId(undefined)}
                            >
                                已筛选
                            </Tag>
                        )}
                        {density === 'compact' && (
                            <Tag color="blue">紧凑模式</Tag>
                        )}
                    </Space>
                </div>

                <Space wrap size={12}>
                    {/* 书架筛选 */}
                    <Select
                        value={selectedShelfId || 0}
                        onChange={(v) =>
                            setSelectedShelfId(v === 0 ? undefined : v)
                        }
                        style={{ width: 170 }}
                        size="large"
                        options={[
                            { value: 0, label: '📚 全部书架' },
                            ...shelfList,
                        ]}
                        prefix={<FilterOutlined />}
                    />

                    {/* 排序 */}
                    <Select
                        value={sortBy}
                        onChange={setSortBy}
                        style={{ width: 170 }}
                        size="large"
                        options={SORT_OPTIONS}
                        prefix={<SortAscendingOutlined />}
                    />

                    {/* 密度切换 */}
                    <Dropdown
                        menu={{
                            items: DENSITY_MENU_ITEMS,
                            onClick: ({ key }) =>
                                setDensity(key as DensityType),
                        }}
                    >
                        <Button size="large" icon={<AppstoreOutlined />}>
                            {density === 'compact'
                                ? '紧凑'
                                : density === 'spacious'
                                ? '宽敞'
                                : '舒适'}
                        </Button>
                    </Dropdown>

                    {/* 全屏切换 */}
                    <Tooltip
                        title={
                            isFullscreen
                                ? '退出全屏 (Esc)'
                                : '全屏模式 (F)'
                        }
                    >
                        <Button
                            size="large"
                            icon={
                                isFullscreen ? (
                                    <FullscreenExitOutlined />
                                ) : (
                                    <FullscreenOutlined />
                                )
                            }
                            onClick={toggleFullscreen}
                        />
                    </Tooltip>

                    {/* 刷新 */}
                    <Button
                        size="large"
                        icon={<ReloadOutlined />}
                        loading={loading}
                        onClick={() => loadBooks(true)}
                    />
                </Space>
            </div>

            {/* 错误状态 */}
            {error && (
                <Card
                    style={{
                        marginBottom: 24,
                        borderRadius: 12,
                        border: `1px solid ${token.colorErrorBorder}`,
                    }}
                >
                    <div style={{ textAlign: 'center', padding: 24 }}>
                        <Text type="danger">{error}</Text>
                        <br />
                        <Button
                            type="primary"
                            icon={<ReloadOutlined />}
                            onClick={() => loadBooks(true)}
                            style={{ marginTop: 12 }}
                        >
                            重试
                        </Button>
                    </div>
                </Card>
            )}

            {/* 加载骨架屏 */}
            {loading && renderSkeletonGrid()}

            {/* 封面网格 */}
            {!loading && renderCoverGrid()}

            {/* 侧边详情 */}
            {renderDrawer()}

            {/* 回到顶部 */}
            <FloatButton.BackTop
                visibilityHeight={400}
                style={{ right: 40, bottom: 40 }}
            />

            {/* 悬停效果样式 */}
            <style>{`
                .cover-card-hover:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 8px 25px rgba(139,69,19,0.18) !important;
                }
                .cover-card-hover:active {
                    transform: translateY(-1px) scale(0.99);
                }
            `}</style>
        </div>
    );
};

export default BookCoverWall;