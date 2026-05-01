// frontend/src/pages/ShelfView.tsx
/**
 * 书架视图页面 - React 19 + Ant Design 6
 * 
 * 修复：将所有 Hooks 内联到组件中，确保调用顺序稳定
 */

import React, {
    useEffect,
    useState,
    useCallback,
    useMemo,
    useRef,
    type FC,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Card,
    Row,
    Col,
    Empty,
    Tag,
    Badge,
    Space,
    Input,
    Segmented,
    Typography,
    Button,
    Select,
    Dropdown,
    message,
    Popconfirm,
    Tooltip,
    Modal,
    Breadcrumb,
    FloatButton,
    Skeleton,
    Alert,
    theme,
    Divider,
    type MenuProps,
} from 'antd';
import {
    SearchOutlined,
    EnvironmentOutlined,
    BookOutlined,
    AppstoreOutlined,
    UnorderedListOutlined,
    SortAscendingOutlined,
    PlusOutlined,
    SwapOutlined,
    DeleteOutlined,
    EditOutlined,
    ExclamationCircleOutlined,
    ReloadOutlined,
    FilterOutlined,
    HomeOutlined,
    RightOutlined,
    LeftOutlined,
    EyeOutlined,
    ClearOutlined,
} from '@ant-design/icons';
import {
    getShelfBooks,
    removeBookFromShelf,
    listShelves,
    moveBookToShelf,
    extractErrorMessage,
} from '../services/api';
import BookCard from '../components/BookCard';
import ShelfSelector from '../components/ShelfSelector';
import type { Book, ShelfBooks, ShelfInfo } from '../types';

const { Title, Text, Paragraph } = Typography;

// ==================== 常量 ====================

const SORT_OPTIONS = [
    { value: 'sort_order', label: '📋 默认排序' },
    { value: 'title', label: '🔤 书名' },
    { value: 'author', label: '✍️ 作者' },
    { value: 'added_at', label: '📅 添加时间' },
    { value: 'rating', label: '⭐ 评分' },
];

// ==================== 主组件（所有 Hooks 内联） ====================

const ShelfView: FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { token } = theme.useToken();

    // ==================== 状态（必须全部在顶部声明） ====================

    const [currentShelfId, setCurrentShelfId] = useState(() => {
        const parsed = parseInt(id || '1');
        return isNaN(parsed) ? 1 : parsed;
    });
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchKeyword, setSearchKeyword] = useState('');
    const [sortBy, setSortBy] = useState('sort_order');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    // 书架数据状态
    const [shelfData, setShelfData] = useState<ShelfBooks | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 所有书架列表状态
    const [allShelves, setAllShelves] = useState<ShelfInfo[]>([]);

    // 操作状态
    const [moveModalVisible, setMoveModalVisible] = useState(false);
    const [selectedBook, setSelectedBook] = useState<Book | null>(null);
    const [targetShelfId, setTargetShelfId] = useState<number | null>(null);
    const [targetShelfOptions, setTargetShelfOptions] = useState<
        { value: number; label: string }[]
    >([]);
    const [showShelfSelector, setShowShelfSelector] = useState(false);

    // 防抖搜索
    const [debouncedKeyword, setDebouncedKeyword] = useState('');
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();

    // 组件挂载状态
    const isMountedRef = useRef(true);

    // ==================== 副作用 ====================

    // 路由同步
    useEffect(() => {
        if (id) {
            const parsed = parseInt(id);
            if (!isNaN(parsed)) {
                setCurrentShelfId(parsed);
                setSearchKeyword('');
                setDebouncedKeyword('');
            }
        }
    }, [id]);

    // 组件挂载/卸载
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    // 加载所有书架列表
    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const data = await listShelves();
                if (!cancelled) {
                    setAllShelves(data || []);
                }
            } catch {
                // 静默失败
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, []);

    // 加载当前书架图书
    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                const data = await getShelfBooks(currentShelfId, sortBy, sortOrder);
                if (!cancelled) {
                    setShelfData(data);
                }
            } catch (err: unknown) {
                if (!cancelled) {
                    const errorMsg = extractErrorMessage(err) || '加载书架数据失败';
                    setError(errorMsg);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [currentShelfId, sortBy, sortOrder]);

    // 搜索防抖
    useEffect(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
            setDebouncedKeyword(searchKeyword);
        }, 300);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [searchKeyword]);

    // 键盘快捷键
    useEffect(() => {
        const handleKeyDown = (e: globalThis.KeyboardEvent) => {
            // 忽略输入框中的按键
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                e.target instanceof HTMLSelectElement
            ) {
                return;
            }

            const currentIndex = allShelves.findIndex(
                (s) => s.logical_shelf_id === currentShelfId
            );
            if (currentIndex === -1) return;

            if (e.key === 'ArrowLeft' && currentIndex > 0) {
                e.preventDefault();
                navigate(`/shelf/${allShelves[currentIndex - 1].logical_shelf_id}`);
            }
            if (e.key === 'ArrowRight' && currentIndex < allShelves.length - 1) {
                e.preventDefault();
                navigate(`/shelf/${allShelves[currentIndex + 1].logical_shelf_id}`);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [allShelves, currentShelfId, navigate]);

    // ==================== 手动刷新 ====================

    const refreshBooks = useCallback(async () => {
        try {
            const data = await getShelfBooks(currentShelfId, sortBy, sortOrder);
            setShelfData(data);
        } catch (err: unknown) {
            message.error({
                content: extractErrorMessage(err) || '刷新失败',
                key: 'refresh-error',
            });
        }
    }, [currentShelfId, sortBy, sortOrder]);

    // ==================== 衍生数据 ====================

    const currentIndex = useMemo(
        () => allShelves.findIndex((s) => s.logical_shelf_id === currentShelfId),
        [allShelves, currentShelfId]
    );

    const filteredBooks = useMemo(() => {
        if (!shelfData?.books) return [];
        if (!debouncedKeyword.trim()) return shelfData.books;

        const keyword = debouncedKeyword.toLowerCase().trim();
        return shelfData.books.filter(
            (book: Book) =>
                book.title?.toLowerCase().includes(keyword) ||
                book.author?.toLowerCase().includes(keyword) ||
                book.isbn?.includes(keyword) ||
                book.publisher?.toLowerCase().includes(keyword)
        );
    }, [shelfData, debouncedKeyword]);

    // ==================== 操作回调 ====================

    const buildBookMenuItems = useCallback(
        (book: Book): MenuProps['items'] => [
            {
                key: 'detail',
                icon: <EyeOutlined />,
                label: '查看详情',
                onClick: () =>
                    navigate(`/shelf/${currentShelfId}/book/${book.book_id}`),
            },
            { type: 'divider' as const },
            {
                key: 'add',
                icon: <PlusOutlined />,
                label: '添加到其他书架',
                onClick: () => {
                    setSelectedBook(book);
                    setShowShelfSelector(true);
                },
            },
            {
                key: 'move',
                icon: <SwapOutlined />,
                label: '移动到其他书架',
                onClick: async () => {
                    setSelectedBook(book);
                    setTargetShelfId(null);

                    try {
                        const shelves = await listShelves();
                        setTargetShelfOptions(
                            shelves
                                .filter((s) => s.logical_shelf_id !== currentShelfId)
                                .map((s) => ({
                                    value: s.logical_shelf_id,
                                    label: `${s.shelf_name}（${s.book_count} 本）`,
                                }))
                        );
                    } catch {
                        message.error({ content: '加载书架失败', key: 'load-shelves-error' });
                    }
                    setMoveModalVisible(true);
                },
            },
            { type: 'divider' as const },
            {
                key: 'remove',
                icon: <DeleteOutlined />,
                label: '从书架移除',
                danger: true,
                onClick: () => {
                    Modal.confirm({
                        title: '确认移除',
                        icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
                        content: `确定将《${book.title}》从此书架移除？`,
                        okType: 'danger',
                        okText: '移除',
                        cancelText: '取消',
                        onOk: async () => {
                            try {
                                await removeBookFromShelf(currentShelfId, book.book_id);
                                message.success({
                                    content: '已从书架移除',
                                    key: `remove-${book.book_id}`,
                                });
                                refreshBooks();
                            } catch (err: unknown) {
                                message.error({
                                    content: extractErrorMessage(err) || '移除失败',
                                    key: `remove-error-${book.book_id}`,
                                });
                            }
                        },
                    });
                },
            },
        ],
        [currentShelfId, navigate, refreshBooks]
    );

    const handleMoveBook = useCallback(async () => {
        if (!selectedBook || !targetShelfId) return;

        try {
            await moveBookToShelf(currentShelfId, selectedBook.book_id, targetShelfId);
            message.success({
                content: '图书已移动到目标书架',
                key: 'move-success',
            });
            setMoveModalVisible(false);
            refreshBooks();
        } catch (err: unknown) {
            message.error({
                content: extractErrorMessage(err) || '移动失败',
                key: 'move-error',
            });
        }
    }, [selectedBook, targetShelfId, currentShelfId, refreshBooks]);

    // ==================== 书架选择器选项 ====================

    const shelfSelectOptions = useMemo(
        () =>
            allShelves.map((shelf) => ({
                value: shelf.logical_shelf_id,
                label: (
                    <Space size={6}>
                        <BookOutlined style={{ color: token.colorPrimary }} />
                        <span>{shelf.shelf_name}</span>
                        <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>
                            {shelf.book_count} 本
                        </Tag>
                    </Space>
                ),
            })),
        [allShelves, token]
    );

    // ==================== 渲染：加载状态 ====================

    if (loading && !shelfData) {
        return (
            <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
                <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 16 }} />
                <Skeleton.Input active size="large" style={{ width: 300, marginBottom: 24 }} />
                <Row gutter={[20, 20]}>
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Col xs={24} sm={12} md={8} lg={6} key={i}>
                            <Card style={{ borderRadius: 12 }}>
                                <Skeleton.Image
                                    active
                                    style={{ width: '100%', height: 280, borderRadius: 10 }}
                                />
                                <Skeleton active paragraph={{ rows: 3 }} />
                            </Card>
                        </Col>
                    ))}
                </Row>
            </div>
        );
    }

    // ==================== 渲染：错误状态 ====================

    if (error && !shelfData) {
        return (
            <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
                <Alert
                    title="加载失败"
                    description={error}
                    type="error"
                    showIcon
                    style={{ borderRadius: 10 }}
                    action={
                        <Button type="primary" size="small" onClick={refreshBooks}>
                            重试
                        </Button>
                    }
                />
            </div>
        );
    }

    if (!shelfData) return null;

    // ==================== 主渲染 ====================

    return (
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: 24 }}>
            {/* 顶部导航栏 */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 18,
                }}
            >
                <Breadcrumb
                    items={[
                        {
                            title: (
                                <a onClick={() => navigate('/')}>
                                    <HomeOutlined /> 首页
                                </a>
                            ),
                        },
                        { title: shelfData.shelf_name },
                    ]}
                />

                {allShelves.length > 1 && (
                    <Space size={4}>
                        <Tooltip title="上一个书架 (←)">
                            <Button
                                icon={<LeftOutlined />}
                                disabled={currentIndex <= 0}
                                onClick={() =>
                                    navigate(
                                        `/shelf/${allShelves[currentIndex - 1].logical_shelf_id}`
                                    )
                                }
                                size="middle"
                            />
                        </Tooltip>
                        <Select
                            value={currentShelfId}
                            onChange={(value) => navigate(`/shelf/${value}`)}
                            style={{ minWidth: 240 }}
                            size="large"
                            showSearch
                            filterOption={(input, option) => {
                                const label = (option?.label as any)?.props?.children?.[1];
                                return typeof label === 'string'
                                    ? label.toLowerCase().includes(input.toLowerCase())
                                    : false;
                            }}
                            options={shelfSelectOptions}
                        />
                        <Tooltip title="下一个书架 (→)">
                            <Button
                                icon={<RightOutlined />}
                                disabled={currentIndex >= allShelves.length - 1}
                                onClick={() =>
                                    navigate(
                                        `/shelf/${allShelves[currentIndex + 1].logical_shelf_id}`
                                    )
                                }
                                size="middle"
                            />
                        </Tooltip>
                        <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                            {currentIndex + 1} / {allShelves.length}
                        </Text>
                    </Space>
                )}
            </div>

            {/* 书架信息卡片 */}
            <Card
                style={{
                    marginBottom: 24,
                    background: `linear-gradient(135deg, ${token.colorPrimaryBg}, #fef3c7)`,
                    borderLeft: `4px solid ${token.colorPrimary}`,
                    borderRadius: 14,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                }}
                styles={{ body: { padding: '20px 28px' } }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 20,
                        alignItems: 'center',
                    }}
                >
                    <div>
                        <Title level={2} style={{ margin: 0 }}>
                            <BookOutlined style={{ color: token.colorPrimary }} />{' '}
                            {shelfData.shelf_name}
                        </Title>
                        {shelfData.description && (
                            <Paragraph
                                type="secondary"
                                style={{ marginTop: 6, marginLeft: 36, marginBottom: 0 }}
                                ellipsis={{ rows: 2 }}
                            >
                                {shelfData.description}
                            </Paragraph>
                        )}
                        {shelfData.physical_info && (
                            <div style={{ marginLeft: 36, marginTop: 8 }}>
                                <Space size={8}>
                                    <Tag color="green" icon={<EnvironmentOutlined />}>
                                        {shelfData.physical_info.physical_location}
                                    </Tag>
                                    <Badge status="processing" text="已映射" />
                                </Space>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: 40, flexShrink: 0, alignItems: 'center' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div
                                style={{
                                    fontSize: 52,
                                    fontWeight: 800,
                                    color: token.colorPrimary,
                                    lineHeight: 1,
                                }}
                            >
                                {shelfData.total_count}
                            </div>
                            <Text type="secondary" style={{ fontSize: 13 }}>本藏书</Text>
                        </div>
                        {debouncedKeyword && (
                            <div style={{ textAlign: 'center' }}>
                                <div
                                    style={{
                                        fontSize: 28,
                                        fontWeight: 700,
                                        color: token.colorWarning,
                                        lineHeight: 1,
                                    }}
                                >
                                    {filteredBooks.length}
                                </div>
                                <Text type="secondary" style={{ fontSize: 13 }}>搜索结果</Text>
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            {/* 工具栏 */}
            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 14,
                    border: `1px solid ${token.colorBorderSecondary}`,
                }}
                styles={{ body: { padding: '16px 24px' } }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                    }}
                >
                    <Space wrap size={10}>
                        <Input.Search
                            placeholder="搜索书名/作者/ISBN..."
                            allowClear
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            onSearch={(value) => setSearchKeyword(value || '')}
                            style={{ width: 300 }}
                            size="large"
                            prefix={<SearchOutlined />}
                        />
                        <Select
                            value={sortBy}
                            onChange={setSortBy}
                            style={{ width: 150 }}
                            size="large"
                            options={SORT_OPTIONS}
                        />
                        <Tooltip title={sortOrder === 'asc' ? '升序' : '降序'}>
                            <Button
                                size="large"
                                icon={
                                    <SortAscendingOutlined
                                        rotate={sortOrder === 'desc' ? 180 : 0}
                                    />
                                }
                                onClick={() =>
                                    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
                                }
                            >
                                {sortOrder === 'asc' ? '升序' : '降序'}
                            </Button>
                        </Tooltip>
                    </Space>

                    <Space wrap size={10}>
                        {searchKeyword && (
                            <Button
                                size="large"
                                icon={<ClearOutlined />}
                                onClick={() => setSearchKeyword('')}
                            >
                                清除搜索
                            </Button>
                        )}
                        <Button
                            size="large"
                            icon={<ReloadOutlined />}
                            onClick={refreshBooks}
                            title="刷新"
                        />
                        <Segmented
                            options={[
                                { value: 'grid', icon: <AppstoreOutlined /> },
                                { value: 'list', icon: <UnorderedListOutlined /> },
                            ]}
                            value={viewMode}
                            onChange={(value) => setViewMode(value as 'grid' | 'list')}
                            size="large"
                        />
                        <Button
                            type="primary"
                            size="large"
                            icon={<PlusOutlined />}
                            onClick={() => navigate('/search')}
                            style={{ borderRadius: 8 }}
                        >
                            添加图书
                        </Button>
                    </Space>
                </div>

                {debouncedKeyword && (
                    <div style={{ marginTop: 14 }}>
                        <Space size={6}>
                            <FilterOutlined style={{ color: token.colorTextSecondary }} />
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                找到 {filteredBooks.length} 本匹配「{debouncedKeyword}」的图书
                            </Text>
                        </Space>
                    </div>
                )}
            </Card>

            {/* 图书列表 */}
            {filteredBooks.length === 0 ? (
                <Card
                    style={{
                        borderRadius: 14,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        textAlign: 'center',
                        padding: 60,
                    }}
                >
                    <Empty
                        image={<div style={{ fontSize: 72, opacity: 0.4 }}>{debouncedKeyword ? '🔍' : '📚'}</div>}
                        description={
                            <div>
                                <Text type="secondary" style={{ fontSize: 16, display: 'block', marginBottom: 8 }}>
                                    {debouncedKeyword
                                        ? `未找到匹配「${debouncedKeyword}」的图书`
                                        : '此书架暂无图书'}
                                </Text>
                            </div>
                        }
                    >
                        <Space>
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={() => navigate('/search')}
                                size="large"
                                style={{ borderRadius: 8 }}
                            >
                                添加图书
                            </Button>
                            {debouncedKeyword && (
                                <Button
                                    icon={<ClearOutlined />}
                                    onClick={() => setSearchKeyword('')}
                                    size="large"
                                    style={{ borderRadius: 8 }}
                                >
                                    清除搜索
                                </Button>
                            )}
                        </Space>
                    </Empty>
                </Card>
            ) : viewMode === 'grid' ? (
                <Row gutter={[20, 20]}>
                    {filteredBooks.map((book: Book) => (
                        <Col xs={24} sm={12} md={8} lg={6} xl={24 / 5} key={book.book_id}>
                            <div style={{ position: 'relative' }}>
                                <BookCard
                                    book={book}
                                    viewMode="grid"
                                    onClick={() =>
                                        navigate(`/shelf/${currentShelfId}/book/${book.book_id}`)
                                    }
                                />
                                <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10 }}>
                                    <Dropdown
                                        menu={{ items: buildBookMenuItems(book) }}
                                        trigger={['click']}
                                        placement="bottomRight"
                                    >
                                        <Button
                                            size="small"
                                            shape="circle"
                                            icon={<EditOutlined />}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}
                                        />
                                    </Dropdown>
                                </div>
                            </div>
                        </Col>
                    ))}
                </Row>
            ) : (
                <Space orientation="vertical" style={{ width: '100%' }} size={16}>
                    {filteredBooks.map((book: Book) => (
                        <div key={book.book_id} style={{ position: 'relative' }}>
                            <BookCard
                                book={book}
                                viewMode="list"
                                onClick={() =>
                                    navigate(`/shelf/${currentShelfId}/book/${book.book_id}`)
                                }
                            />
                            <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 10 }}>
                                <Space size={4}>
                                    <Tooltip title="查看详情">
                                        <Button
                                            size="small"
                                            icon={<EyeOutlined />}
                                            onClick={() =>
                                                navigate(`/shelf/${currentShelfId}/book/${book.book_id}`)
                                            }
                                        />
                                    </Tooltip>
                                    <Popconfirm
                                        title={`确定移除《${book.title}》？`}
                                        onConfirm={async () => {
                                            try {
                                                await removeBookFromShelf(currentShelfId, book.book_id);
                                                message.success({ content: '已移除', key: `rm-${book.book_id}` });
                                                refreshBooks();
                                            } catch (err: unknown) {
                                                message.error({
                                                    content: extractErrorMessage(err) || '移除失败',
                                                    key: `rm-err-${book.book_id}`,
                                                });
                                            }
                                        }}
                                        okText="移除"
                                        cancelText="取消"
                                        okButtonProps={{ danger: true }}
                                    >
                                        <Button size="small" danger icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                </Space>
                            </div>
                        </div>
                    ))}
                </Space>
            )}

            {/* 回到顶部 */}
            <FloatButton.BackTop visibilityHeight={400} style={{ right: 44, bottom: 44 }} />

            {/* 移动图书弹窗 */}
            <Modal
                title={
                    <Space size={8}>
                        <SwapOutlined style={{ color: token.colorPrimary }} />
                        <span>移动图书到其他书架</span>
                    </Space>
                }
                open={moveModalVisible}
                onOk={handleMoveBook}
                onCancel={() => setMoveModalVisible(false)}
                okText="移动"
                cancelText="取消"
                okButtonProps={{ disabled: !targetShelfId }}
                width={460}
            >
                <div style={{ marginBottom: 12 }}>
                    <Text type="secondary">
                        将《<Text strong>{selectedBook?.title}</Text>》移动到：
                    </Text>
                </div>
                <Select
                    placeholder="选择目标书架"
                    style={{ width: '100%' }}
                    size="large"
                    value={targetShelfId}
                    onChange={setTargetShelfId}
                    options={targetShelfOptions}
                    showSearch
                    filterOption={(input, option) =>
                        (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                    }
                />
            </Modal>

            {/* 书架选择器 */}
            <ShelfSelector
                visible={showShelfSelector}
                bookId={selectedBook?.book_id || 0}
                bookTitle={selectedBook?.title || ''}
                onClose={() => setShowShelfSelector(false)}
                onSuccess={() => {
                    message.success({ content: '已添加到书架', key: 'add-shelf-ok' });
                    refreshBooks();
                    setShowShelfSelector(false);
                }}
                existingShelfIds={[currentShelfId]}
            />
        </div>
    );
};

export default ShelfView;