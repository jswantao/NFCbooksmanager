// frontend/src/pages/BookCoverWall.tsx
/**
 * 图书封面墙页面
 * 
 * 以网格形式展示所有在架图书的封面，支持：
 * - 书架筛选（按逻辑书架过滤）
 * - 多种排序方式（添加时间/评分/书名）
 * - 三种密度模式（紧凑/舒适/宽敞）
 * - 全屏模式
 * - 无限滚动加载（IntersectionObserver）
 * - 封面点击查看侧边详情
 * 
 * 性能优化：
 * - 封面懒加载（loading="lazy"）
 * - IntersectionObserver 实现滚动加载更多
 * - React.memo 包裹封面卡片组件
 * - 响应式列数自适应
 */

import React, {
    useEffect,
    useState,
    useRef,
    useCallback,
    useMemo,
    memo,
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
} from 'antd';
import type { MenuProps } from 'antd';
import {
    AppstoreOutlined,
    SortAscendingOutlined,
    ReloadOutlined,
    FullscreenOutlined,
    FullscreenExitOutlined,
    EyeOutlined,
    BookOutlined,
    EnvironmentOutlined,
    StarFilled,
    UserOutlined,
    PlusOutlined,
    HomeOutlined,
    LoadingOutlined,
    FilterOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getBookWall, listShelves } from '../services/api';
import { getCoverUrl, getPlaceholderCover } from '../utils/image';

// ---- 类型定义 ----

const { Title, Text } = Typography;

/** 图书墙展示项 */
interface BookWallItem {
    book_id: number;
    isbn: string;
    title: string;
    author?: string;
    cover_url?: string;
    rating?: string;
    source: string;
    publisher?: string;
    publish_date?: string;
    price?: string;
    shelf_name?: string;
    shelf_id?: number;
    added_at?: string;
}

// ---- 常量 ----

/** 每页加载数量 */
const PAGE_SIZE = 50;

/** 排序选项 */
const SORT_OPTIONS = [
    { value: 'added_at_desc', label: '最近添加' },
    { value: 'added_at_asc', label: '最早添加' },
    { value: 'rating_desc', label: '评分最高' },
    { value: 'rating_asc', label: '评分最低' },
    { value: 'title_asc', label: '书名 A-Z' },
    { value: 'title_desc', label: '书名 Z-A' },
];

/** 密度选项（下拉菜单） */
const DENSITY_OPTIONS: MenuProps['items'] = [
    { key: 'compact', label: '紧凑', icon: <AppstoreOutlined /> },
    { key: 'cozy', label: '舒适', icon: <AppstoreOutlined /> },
    { key: 'spacious', label: '宽敞', icon: <AppstoreOutlined /> },
];

/** 密度对应的间距配置 */
const DENSITY_CONFIG: Record<string, { gap: number; padding: number }> = {
    compact: { gap: 8, padding: 0 },
    cozy: { gap: 16, padding: 8 },
    spacious: { gap: 24, padding: 16 },
};

// ---- 子组件 ----

/**
 * 单个封面卡片组件
 * 
 * 使用 React.memo 优化，避免不必要的重渲染。
 * 支持加载状态、错误回退、评分角标、信息叠加层。
 */
const CoverCard = memo(
    ({
        book,
        density,
        onClick,
        onShelfClick,
    }: {
        book: BookWallItem;
        density: string;
        onClick: () => void;
        onShelfClick: (id: number) => void;
    }) => {
        const [loaded, setLoaded] = useState(false);
        const [error, setError] = useState(false);

        /** 代理后的封面 URL */
        const coverUrl = useMemo(
            () => getCoverUrl(book.cover_url) || '',
            [book.cover_url]
        );

        /** SVG 占位图 */
        const placeholderUrl = useMemo(
            () => getPlaceholderCover(book.title, book.author),
            [book.title, book.author]
        );

        const { gap, padding } = DENSITY_CONFIG[density] || DENSITY_CONFIG.cozy;
        const showInfo = density !== 'compact'; // 紧凑模式隐藏文字信息

        return (
            <div
                style={{ padding, cursor: 'pointer' }}
                onClick={onClick}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') onClick();
                }}
                aria-label={`查看《${book.title}》详情`}
            >
                <div
                    style={{
                        position: 'relative',
                        overflow: 'hidden',
                        borderRadius: 8,
                        aspectRatio: '3/4',
                        boxShadow: '0 2px 8px rgba(139,69,19,.1)',
                        transition: 'all .3s',
                    }}
                >
                    {/* 加载骨架屏 */}
                    {!loaded && !error && coverUrl && (
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

                    {/* 封面图片 */}
                    {coverUrl && !error ? (
                        <img
                            alt={book.title}
                            src={coverUrl}
                            onLoad={() => {
                                setLoaded(true);
                                setError(false);
                            }}
                            onError={() => {
                                setError(true);
                                setLoaded(false);
                            }}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                opacity: loaded ? 1 : 0,
                                transition: 'opacity .5s',
                            }}
                            loading="lazy"
                        />
                    ) : (
                        /* 占位图 */
                        <img
                            alt={book.title}
                            src={placeholderUrl}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                            }}
                        />
                    )}

                    {/* 评分角标 */}
                    {book.rating && parseFloat(book.rating) > 0 && (
                        <div
                            style={{
                                position: 'absolute',
                                top: 8,
                                right: 8,
                                background: 'rgba(0,0,0,.75)',
                                color: '#fff',
                                padding: '2px 8px',
                                borderRadius: 4,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 12,
                                backdropFilter: 'blur(4px)',
                            }}
                        >
                            <StarFilled
                                style={{ color: '#f59e0b', fontSize: 11 }}
                            />
                            {book.rating}
                        </div>
                    )}

                    {/* 信息叠加层（非紧凑模式显示） */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background:
                                'linear-gradient(to top,rgba(0,0,0,.85),rgba(0,0,0,.2) 50%,transparent)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-end',
                            padding: 16,
                            opacity: showInfo ? 1 : 0,
                            transition: 'opacity .3s',
                        }}
                    >
                        <Text
                            style={{
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: 15,
                                marginBottom: 4,
                            }}
                            ellipsis={{ rows: 2 }}
                        >
                            {book.title}
                        </Text>
                        {book.author && (
                            <Text
                                style={{
                                    color: '#d1d5db',
                                    fontSize: 12,
                                }}
                            >
                                <UserOutlined /> {book.author}
                            </Text>
                        )}
                        <Space size={4} style={{ marginTop: 8 }}>
                            {book.shelf_name && (
                                <Tag
                                    color="blue"
                                    style={{
                                        fontSize: 11,
                                        cursor: 'pointer',
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (book.shelf_id)
                                            onShelfClick(book.shelf_id);
                                    }}
                                >
                                    {book.shelf_name}
                                </Tag>
                            )}
                            {book.source === 'douban' && (
                                <Tag color="green" style={{ fontSize: 11 }}>
                                    豆瓣
                                </Tag>
                            )}
                        </Space>
                    </div>
                </div>

                {/* 宽敞模式下的底部信息 */}
                {density === 'spacious' && (
                    <div style={{ marginTop: 8 }}>
                        <Text strong style={{ fontSize: 13 }} ellipsis>
                            {book.title}
                        </Text>
                        {book.author && (
                            <Text
                                type="secondary"
                                style={{
                                    fontSize: 12,
                                    display: 'block',
                                }}
                            >
                                {book.author}
                            </Text>
                        )}
                    </div>
                )}
            </div>
        );
    }
);

CoverCard.displayName = 'CoverCard';

// ---- 主组件 ----

const BookCoverWall: React.FC = () => {
    const navigate = useNavigate();

    // ==================== 状态 ====================

    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [wallData, setWallData] = useState<any>(null);
    const [books, setBooks] = useState<BookWallItem[]>([]);
    const [shelfList, setShelfList] = useState<any[]>([]);
    const [selectedShelfId, setSelectedShelfId] = useState<
        number | undefined
    >();
    const [sortBy, setSortBy] = useState('added_at_desc');
    const [density, setDensity] = useState('cozy');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [drawerBook, setDrawerBook] = useState<BookWallItem | null>(null);
    const [columnCount, setColumnCount] = useState(5);

    /** 无限滚动触发器 */
    const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

    /** 当前页码 */
    const currentPage = useRef(0);

    /** 组件挂载状态 */
    const isMounted = useRef(true);

    // ==================== 响应式列数 ====================

    useEffect(() => {
        const updateColumns = () => {
            const width = window.innerWidth;
            if (width < 640) setColumnCount(2);
            else if (width < 768) setColumnCount(3);
            else if (width < 1024) setColumnCount(4);
            else if (width < 1280) setColumnCount(5);
            else setColumnCount(6);
        };

        updateColumns();
        window.addEventListener('resize', updateColumns);
        return () => window.removeEventListener('resize', updateColumns);
    }, []);

    // ==================== 数据加载 ====================

    useEffect(() => {
        isMounted.current = true;

        // 加载书架列表
        listShelves().then((data) => {
            if (isMounted.current) {
                setShelfList(
                    data.map((shelf: any) => ({
                        value: shelf.logical_shelf_id,
                        label: shelf.shelf_name,
                    }))
                );
            }
        });

        // 初次加载图书
        loadBooks(true);

        return () => {
            isMounted.current = false;
        };
    }, []);

    // 筛选/排序变化时重新加载
    useEffect(() => {
        loadBooks(true);
    }, [selectedShelfId, sortBy]);

    // ==================== 无限滚动 ====================

    useEffect(() => {
        if (!wallData?.has_more) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !loadingMore) {
                    loadMoreBooks();
                }
            },
            { threshold: 0.1 }
        );

        const triggerElement = loadMoreTriggerRef.current;
        if (triggerElement) observer.observe(triggerElement);

        return () => {
            if (triggerElement) observer.unobserve(triggerElement);
            observer.disconnect();
        };
    }, [wallData?.has_more, loadingMore]);

    /**
     * 加载图书（支持重置或追加）
     * 
     * @param reset - 是否重置列表（true=重新加载，false=追加）
     */
    const loadBooks = useCallback(
        async (reset = false) => {
            if (reset) {
                setLoading(true);
                currentPage.current = 0;
            }

            try {
                const [field, order] = sortBy.split('_');
                const data = await getBookWall({
                    sort_by: field,
                    order,
                    limit: PAGE_SIZE,
                    offset: reset ? 0 : currentPage.current * PAGE_SIZE,
                    ...(selectedShelfId && selectedShelfId > 0
                        ? { shelf_id: selectedShelfId }
                        : {}),
                });

                if (isMounted.current) {
                    setWallData(data);
                    setBooks(reset ? data.books : (prev) => [...prev, ...data.books]);
                }
            } catch {
                if (isMounted.current && reset) {
                    message.error('加载图书失败');
                }
            } finally {
                if (isMounted.current) setLoading(false);
            }
        },
        [sortBy, selectedShelfId]
    );

    /** 加载更多图书（追加到列表末尾） */
    const loadMoreBooks = useCallback(async () => {
        if (loadingMore || !wallData?.has_more) return;

        setLoadingMore(true);
        currentPage.current++;

        try {
            const [field, order] = sortBy.split('_');
            const data = await getBookWall({
                sort_by: field,
                order,
                limit: PAGE_SIZE,
                offset: currentPage.current * PAGE_SIZE,
                ...(selectedShelfId && selectedShelfId > 0
                    ? { shelf_id: selectedShelfId }
                    : {}),
            });

            if (isMounted.current) {
                setWallData(data);
                setBooks((prev) => [...prev, ...data.books]);
            }
        } catch {
            currentPage.current--; // 失败回退页码
        } finally {
            if (isMounted.current) setLoadingMore(false);
        }
    }, [loadingMore, wallData?.has_more, sortBy, selectedShelfId]);

    // ==================== 交互处理 ====================

    /** 打开图书详情抽屉 */
    const handleOpenDrawer = useCallback((book: BookWallItem) => {
        setDrawerBook(book);
    }, []);

    /** 导航到书架 */
    const handleShelfClick = useCallback(
        (shelfId: number) => {
            navigate(`/shelf/${shelfId}`);
        },
        [navigate]
    );

    // ==================== 渲染 ====================

    return (
        <div
            style={{
                maxWidth: isFullscreen ? '100%' : 1600,
                margin: '0 auto',
                padding: isFullscreen ? 24 : '24px',
            }}
        >
            {/* 面包屑（非全屏模式） */}
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

            {/* 工具栏 */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 24,
                }}
            >
                <div>
                    <Title level={2} style={{ margin: 0 }}>
                        <AppstoreOutlined
                            style={{ color: '#8B4513', marginRight: 12 }}
                        />
                        封面墙
                    </Title>
                    <Text type="secondary">
                        {wallData?.total || 0} 本藏书
                    </Text>
                </div>

                <Space wrap>
                    {/* 书架筛选 */}
                    <Select
                        value={selectedShelfId || 0}
                        onChange={(value) =>
                            setSelectedShelfId(
                                value === 0 ? undefined : value
                            )
                        }
                        style={{ width: 160 }}
                        size="large"
                        options={[
                            { value: 0, label: '全部书架' },
                            ...shelfList,
                        ]}
                        prefix={<FilterOutlined />}
                    />

                    {/* 排序 */}
                    <Select
                        value={sortBy}
                        onChange={setSortBy}
                        style={{ width: 140 }}
                        size="large"
                        options={SORT_OPTIONS}
                        prefix={<SortAscendingOutlined />}
                    />

                    {/* 密度切换 */}
                    <Dropdown
                        menu={{
                            items: DENSITY_OPTIONS,
                            onClick: ({ key }) => setDensity(key),
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
                    <Tooltip title={isFullscreen ? '退出全屏' : '全屏模式'}>
                        <Button
                            size="large"
                            icon={
                                isFullscreen ? (
                                    <FullscreenExitOutlined />
                                ) : (
                                    <FullscreenOutlined />
                                )
                            }
                            onClick={() => setIsFullscreen(!isFullscreen)}
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

            {/* ===== 内容区 ===== */}

            {/* 加载骨架屏 */}
            {loading ? (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${columnCount},1fr)`,
                        gap: 16,
                    }}
                >
                    {Array.from({ length: columnCount * 3 }).map((_, i) => (
                        <div key={i} style={{ aspectRatio: '3/4' }}>
                            <Skeleton.Image
                                active
                                style={{ width: '100%', height: '100%' }}
                            />
                        </div>
                    ))}
                </div>
            ) : books.length === 0 ? (
                /* 空状态 */
                <Card style={{ borderRadius: 12 }}>
                    <Empty
                        image={
                            <BookOutlined
                                style={{
                                    fontSize: 64,
                                    color: '#d4a574',
                                }}
                            />
                        }
                        description="暂无图书"
                    >
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => navigate('/search')}
                        >
                            添加图书
                        </Button>
                    </Empty>
                </Card>
            ) : (
                <>
                    {/* 封面网格 */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${columnCount},1fr)`,
                            gap: DENSITY_CONFIG[density]?.gap || 16,
                        }}
                    >
                        {books.map((book, index) => (
                            <CoverCard
                                key={`${book.book_id}-${index}`}
                                book={book}
                                density={density}
                                onClick={() => handleOpenDrawer(book)}
                                onShelfClick={handleShelfClick}
                            />
                        ))}
                    </div>

                    {/* 加载更多触发器 */}
                    {wallData?.has_more && (
                        <div
                            ref={loadMoreTriggerRef}
                            style={{
                                textAlign: 'center',
                                padding: '32px 0',
                            }}
                        >
                            {loadingMore ? (
                                <Spin
                                    indicator={
                                        <LoadingOutlined
                                            style={{ fontSize: 24 }}
                                            spin
                                        />
                                    }
                                />
                            ) : (
                                <Button size="large" onClick={loadMoreBooks}>
                                    加载更多
                                </Button>
                            )}
                        </div>
                    )}

                    {/* 全部加载完毕 */}
                    {!wallData?.has_more && books.length > 0 && (
                        <Divider plain>
                            <Text type="secondary">
                                已展示全部 {wallData?.total} 本藏书
                            </Text>
                        </Divider>
                    )}
                </>
            )}

            {/* 返回顶部 */}
            <FloatButton.BackTop
                visibilityHeight={400}
                style={{ right: 40, bottom: 40 }}
            />

            {/* ===== 图书详情抽屉 ===== */}
            <Drawer
                title="图书详情"
                placement="right"
                width={380}
                open={!!drawerBook}
                onClose={() => setDrawerBook(null)}
            >
                {drawerBook && (
                    <div style={{ textAlign: 'center' }}>
                        {/* 封面 */}
                        <img
                            src={
                                getCoverUrl(drawerBook.cover_url) ||
                                getPlaceholderCover(
                                    drawerBook.title,
                                    drawerBook.author
                                )
                            }
                            alt={drawerBook.title}
                            style={{
                                width: 160,
                                borderRadius: 8,
                                boxShadow:
                                    '0 4px 12px rgba(139,69,19,.15)',
                                aspectRatio: '3/4',
                                objectFit: 'cover',
                            }}
                        />

                        <Title level={4} style={{ marginTop: 12 }}>
                            {drawerBook.title}
                        </Title>

                        {/* 评分 */}
                        {drawerBook.rating && (
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                    gap: 8,
                                    marginBottom: 12,
                                }}
                            >
                                <Rate
                                    disabled
                                    allowHalf
                                    value={
                                        parseFloat(drawerBook.rating) / 2
                                    }
                                />
                                <Text strong>{drawerBook.rating}</Text>
                            </div>
                        )}

                        {/* 详细信息 */}
                        <Space
                            direction="vertical"
                            style={{
                                width: '100%',
                                textAlign: 'left',
                                marginTop: 16,
                            }}
                        >
                            {drawerBook.author && (
                                <div>
                                    <Text type="secondary">作者</Text>
                                    <br />
                                    <Text>{drawerBook.author}</Text>
                                </div>
                            )}
                            <div>
                                <Text type="secondary">ISBN</Text>
                                <br />
                                <Text code>{drawerBook.isbn}</Text>
                            </div>
                            {drawerBook.publisher && (
                                <div>
                                    <Text type="secondary">出版社</Text>
                                    <br />
                                    <Text>{drawerBook.publisher}</Text>
                                </div>
                            )}
                            {drawerBook.shelf_name && (
                                <div>
                                    <Text type="secondary">所在书架</Text>
                                    <br />
                                    <Tag
                                        color="blue"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => {
                                            navigate(
                                                `/shelf/${drawerBook.shelf_id}`
                                            );
                                            setDrawerBook(null);
                                        }}
                                    >
                                        {drawerBook.shelf_name}
                                    </Tag>
                                </div>
                            )}
                            <div>
                                <Text type="secondary">来源</Text>
                                <br />
                                <Tag
                                    color={
                                        drawerBook.source === 'douban'
                                            ? 'green'
                                            : 'orange'
                                    }
                                >
                                    {drawerBook.source === 'douban'
                                        ? '豆瓣'
                                        : '手动'}
                                </Tag>
                            </div>
                        </Space>

                        {/* 查看完整详情按钮 */}
                        <Button
                            type="primary"
                            icon={<EyeOutlined />}
                            block
                            style={{ marginTop: 16 }}
                            onClick={() => {
                                navigate(
                                    `/shelf/${drawerBook.shelf_id}/book/${drawerBook.book_id}`
                                );
                                setDrawerBook(null);
                            }}
                        >
                            查看完整详情
                        </Button>
                    </div>
                )}
            </Drawer>
        </div>
    );
};

export default BookCoverWall;