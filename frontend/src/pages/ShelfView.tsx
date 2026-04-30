// frontend/src/pages/ShelfView.tsx
/**
 * 书架视图页面（中间模式展示核心）
 * 
 * 展示单个逻辑书架的完整信息和图书列表。
 * 
 * 功能：
 * 1. 书架导航：前后翻页切换书架、下拉选择书架
 * 2. 书架信息：名称、描述、物理位置映射、图书总数
 * 3. 图书展示：网格/列表双视图切换
 * 4. 图书操作：详情、添加到其他书架、移动、移除
 * 5. 排序与搜索：书名/作者/评分/添加时间排序、关键字搜索
 * 
 * 数据来源：
 * - GET /api/shelves/{id}/books 获取书架和图书数据
 * - GET /api/shelves 获取所有书架列表（用于导航切换）
 * 
 * 图书卡片操作菜单：
 * - 查看详情：跳转到图书详情页
 * - 添加到其他书架：打开书架选择器
 * - 移动到其他书架：选择目标书架并移动
 * - 从书架移除：确认后移除（软删除）
 */

import React, {
    useEffect,
    useState,
    useCallback,
    useMemo,
    useRef,
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
} from 'antd';
import type { MenuProps } from 'antd';
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
} from '@ant-design/icons';
import {
    getShelfBooks,
    removeBookFromShelf,
    listShelves,
    moveBookToShelf,
} from '../services/api';
import BookCard from '../components/BookCard';
import ShelfSelector from '../components/ShelfSelector';
import type { Book } from '../types';

// ---- 常量 ----

const { Title, Text, Paragraph } = Typography;

/** 排序选项 */
const SORT_OPTIONS = [
    { value: 'sort_order', label: '默认排序' },
    { value: 'title', label: '书名' },
    { value: 'author', label: '作者' },
    { value: 'added_at', label: '添加时间' },
    { value: 'rating', label: '评分' },
];

// ---- 主组件 ----

const ShelfView: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // ==================== 状态 ====================

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [shelfData, setShelfData] = useState<any>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchKeyword, setSearchKeyword] = useState('');
    const [sortBy, setSortBy] = useState('sort_order');
    const [sortOrder, setSortOrder] = useState('asc');

    /** 所有书架列表（用于切换导航） */
    const [allShelves, setAllShelves] = useState<any[]>([]);

    /** 当前书架 ID */
    const [currentShelfId, setCurrentShelfId] = useState(
        parseInt(id || '1')
    );

    /** 移动图书弹窗状态 */
    const [moveModalVisible, setMoveModalVisible] = useState(false);
    const [selectedBook, setSelectedBook] = useState<Book | null>(null);
    const [targetShelfId, setTargetShelfId] = useState<number | null>(null);
    const [targetShelfOptions, setTargetShelfOptions] = useState<any[]>([]);

    /** 书架选择器弹窗状态 */
    const [showShelfSelector, setShowShelfSelector] = useState(false);

    /** 组件挂载状态 */
    const isMounted = useRef(true);

    // ==================== 生命周期 ====================

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    /** 路由参数变化时更新当前书架 ID */
    useEffect(() => {
        if (id) setCurrentShelfId(parseInt(id));
    }, [id]);

    /** 加载书架列表和图书数据 */
    useEffect(() => {
        // 加载所有书架（用于导航切换）
        listShelves()
            .then((data) => {
                if (isMounted.current) {
                    setAllShelves(
                        data.map((shelf: any) => ({
                            value: shelf.logical_shelf_id,
                            label: shelf.shelf_name,
                            count: shelf.book_count,
                        }))
                    );
                }
            })
            .catch(() => {
                // 静默失败
            });

        // 加载当前书架图书
        loadShelfBooks(currentShelfId);
    }, [currentShelfId, sortBy, sortOrder]);

    // ==================== 数据加载 ====================

    /**
     * 加载指定书架的图书列表
     * 
     * @param shelfId - 书架 ID
     */
    const loadShelfBooks = useCallback(
        async (shelfId: number) => {
            setLoading(true);
            setError(null);

            try {
                const data = await getShelfBooks(shelfId, sortBy, sortOrder);
                if (isMounted.current) {
                    setShelfData(data);
                }
            } catch (err: any) {
                if (isMounted.current) {
                    setError(
                        err?.response?.data?.detail || '加载书架数据失败'
                    );
                }
            } finally {
                if (isMounted.current) setLoading(false);
            }
        },
        [sortBy, sortOrder]
    );

    // ==================== 衍生数据 ====================

    /** 当前书架在列表中的索引 */
    const currentIndex = useMemo(
        () =>
            allShelves.findIndex(
                (shelf) => shelf.value === currentShelfId
            ),
        [allShelves, currentShelfId]
    );

    /**
     * 搜索过滤后的图书列表
     * 
     * 模糊匹配：书名、作者、ISBN
     */
    const filteredBooks = useMemo(() => {
        if (!shelfData?.books) return [];
        if (!searchKeyword.trim()) return shelfData.books;

        const keyword = searchKeyword.toLowerCase();
        return shelfData.books.filter(
            (book: Book) =>
                book.title?.toLowerCase().includes(keyword) ||
                book.author?.toLowerCase().includes(keyword) ||
                book.isbn?.includes(keyword)
        );
    }, [shelfData, searchKeyword]);

    // ==================== 图书操作菜单 ====================

    /**
     * 生成图书操作菜单项
     * 
     * @param book - 当前图书
     * @returns 菜单项配置
     */
    const buildBookMenuItems = useCallback(
        (book: Book): MenuProps['items'] => [
            {
                key: 'detail',
                icon: <BookOutlined />,
                label: '查看详情',
                onClick: () =>
                    navigate(
                        `/shelf/${currentShelfId}/book/${book.book_id}`
                    ),
            },
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

                    // 加载可选目标书架（排除当前书架）
                    const shelves = await listShelves();
                    setTargetShelfOptions(
                        shelves
                            .filter(
                                (s: any) =>
                                    s.logical_shelf_id !== currentShelfId
                            )
                            .map((s: any) => ({
                                value: s.logical_shelf_id,
                                label: `${s.shelf_name}（${s.book_count} 本）`,
                            }))
                    );
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
                        icon: (
                            <ExclamationCircleOutlined
                                style={{ color: '#ff4d4f' }}
                            />
                        ),
                        content: `确定将《${book.title}》从此书架移除？`,
                        okType: 'danger',
                        okText: '移除',
                        cancelText: '取消',
                        onOk: async () => {
                            try {
                                await removeBookFromShelf(
                                    currentShelfId,
                                    book.book_id
                                );
                                message.success('已从书架移除');
                                loadShelfBooks(currentShelfId);
                            } catch {
                                message.error('移除失败');
                            }
                        },
                    });
                },
            },
        ],
        [currentShelfId, navigate, loadShelfBooks]
    );

    // ==================== 移动操作 ====================

    /** 执行移动图书操作 */
    const handleMoveBook = useCallback(async () => {
        if (!selectedBook || !targetShelfId) return;

        try {
            await moveBookToShelf(
                currentShelfId,
                selectedBook.book_id,
                targetShelfId
            );
            message.success('图书已移动到目标书架');
            setMoveModalVisible(false);
            loadShelfBooks(currentShelfId);
        } catch {
            message.error('移动失败');
        }
    }, [selectedBook, targetShelfId, currentShelfId, loadShelfBooks]);

    // ==================== 渲染：加载状态 ====================

    if (loading && !shelfData) {
        return (
            <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
                <Skeleton active />
                <Row gutter={[20, 20]}>
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Col xs={24} sm={12} md={8} lg={6} key={i}>
                            <Card>
                                <Skeleton.Image
                                    active
                                    style={{
                                        width: '100%',
                                        height: 280,
                                    }}
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
                    message="加载失败"
                    description={error}
                    type="error"
                    showIcon
                    action={
                        <Button onClick={() => loadShelfBooks(currentShelfId)}>
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
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
            {/* 顶部导航栏 */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 16,
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

                {/* 书架切换器 */}
                {allShelves.length > 1 && (
                    <Space size="small">
                        <Button
                            icon={<LeftOutlined />}
                            disabled={currentIndex <= 0}
                            onClick={() =>
                                navigate(
                                    `/shelf/${allShelves[currentIndex - 1].value}`
                                )
                            }
                            size="small"
                            title="上一个书架"
                        />
                        <Select
                            value={currentShelfId}
                            onChange={(value) =>
                                navigate(`/shelf/${value}`)
                            }
                            style={{ minWidth: 200 }}
                            size="large"
                            showSearch
                            filterOption={(input, option) =>
                                (option?.label as string)?.includes(input)
                            }
                            options={allShelves.map((shelf) => ({
                                value: shelf.value,
                                label: `${shelf.label}（${shelf.count ?? 0} 本）`,
                            }))}
                        />
                        <Button
                            icon={<RightOutlined />}
                            disabled={
                                currentIndex >= allShelves.length - 1
                            }
                            onClick={() =>
                                navigate(
                                    `/shelf/${allShelves[currentIndex + 1].value}`
                                )
                            }
                            size="small"
                            title="下一个书架"
                        />
                    </Space>
                )}
            </div>

            {/* 书架信息卡片 */}
            <Card
                style={{
                    marginBottom: 24,
                    background:
                        'linear-gradient(135deg, #fffbeb, #fef3c7)',
                    borderLeft: '4px solid #8B4513',
                    borderRadius: 12,
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 16,
                    }}
                >
                    <div>
                        <Title level={2} style={{ margin: 0 }}>
                            <BookOutlined style={{ color: '#8B4513' }} />
                            {shelfData.shelf_name}
                        </Title>
                        {shelfData.description && (
                            <Paragraph
                                type="secondary"
                                style={{ marginLeft: 36 }}
                                ellipsis={{ rows: 2 }}
                            >
                                {shelfData.description}
                            </Paragraph>
                        )}
                        {shelfData.physical_info && (
                            <div style={{ marginLeft: 36 }}>
                                <EnvironmentOutlined
                                    style={{ color: '#22c55e' }}
                                />
                                {shelfData.physical_info.physical_location}
                                <Badge
                                    status="processing"
                                    text="已映射"
                                    style={{ marginLeft: 8 }}
                                />
                            </div>
                        )}
                    </div>

                    {/* 图书总数 */}
                    <div
                        style={{
                            display: 'flex',
                            gap: 32,
                            flexShrink: 0,
                        }}
                    >
                        <div style={{ textAlign: 'center' }}>
                            <div
                                style={{
                                    fontSize: 48,
                                    fontWeight: 700,
                                    color: '#8B4513',
                                }}
                            >
                                {shelfData.total_count}
                            </div>
                            <Text type="secondary">本</Text>
                        </div>
                    </div>
                </div>
            </Card>

            {/* 工具栏 */}
            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 12,
                    border: '1px solid #e8d5c8',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                    }}
                >
                    <Space wrap>
                        <Input.Search
                            placeholder="搜索图书..."
                            allowClear
                            onChange={(e) =>
                                setSearchKeyword(e.target.value)
                            }
                            style={{ width: 280 }}
                            size="large"
                        />
                        <Select
                            value={sortBy}
                            onChange={setSortBy}
                            style={{ width: 120 }}
                            size="large"
                            options={SORT_OPTIONS}
                        />
                        <Button
                            size="large"
                            icon={
                                <SortAscendingOutlined
                                    rotate={
                                        sortOrder === 'desc' ? 180 : 0
                                    }
                                />
                            }
                            onClick={() =>
                                setSortOrder((prev) =>
                                    prev === 'asc' ? 'desc' : 'asc'
                                )
                            }
                        >
                            {sortOrder === 'asc' ? '升序' : '降序'}
                        </Button>
                    </Space>

                    <Space wrap>
                        <Button
                            size="large"
                            icon={<ReloadOutlined />}
                            onClick={() =>
                                loadShelfBooks(currentShelfId)
                            }
                            title="刷新"
                        />
                        <Segmented
                            options={[
                                {
                                    value: 'grid',
                                    icon: <AppstoreOutlined />,
                                },
                                {
                                    value: 'list',
                                    icon: <UnorderedListOutlined />,
                                },
                            ]}
                            value={viewMode}
                            onChange={(value) =>
                                setViewMode(value as 'grid' | 'list')
                            }
                            size="large"
                        />
                        <Button
                            type="primary"
                            size="large"
                            icon={<PlusOutlined />}
                            onClick={() => navigate('/search')}
                        >
                            添加图书
                        </Button>
                    </Space>
                </div>

                {/* 搜索结果提示 */}
                {searchKeyword && (
                    <div style={{ marginTop: 12 }}>
                        <Text type="secondary">
                            <FilterOutlined /> 找到 {filteredBooks.length}{' '}
                            本
                        </Text>
                        <Button
                            type="link"
                            size="small"
                            onClick={() => setSearchKeyword('')}
                        >
                            清除搜索
                        </Button>
                    </div>
                )}
            </Card>

            {/* ===== 图书列表 ===== */}

            {/* 空状态 */}
            {filteredBooks.length === 0 ? (
                <Card style={{ borderRadius: 12 }}>
                    <Empty
                        image={
                            <div style={{ fontSize: 64, opacity: 0.6 }}>
                                {searchKeyword ? '🔍' : '📚'}
                            </div>
                        }
                        description={
                            searchKeyword
                                ? `未找到"${searchKeyword}"的相关图书`
                                : '此书架暂无图书'
                        }
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
            ) : viewMode === 'grid' ? (
                /* 网格视图 */
                <Row gutter={[20, 20]}>
                    {filteredBooks.map((book: Book) => (
                        <Col
                            xs={24}
                            sm={12}
                            md={8}
                            lg={6}
                            key={book.book_id}
                        >
                            <div style={{ position: 'relative' }}>
                                <BookCard
                                    book={book}
                                    onClick={() =>
                                        navigate(
                                            `/shelf/${currentShelfId}/book/${book.book_id}`
                                        )
                                    }
                                />
                                {/* 操作菜单按钮 */}
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 8,
                                        right: 8,
                                        zIndex: 10,
                                    }}
                                >
                                    <Dropdown
                                        menu={{
                                            items: buildBookMenuItems(
                                                book
                                            ),
                                        }}
                                        trigger={['click']}
                                    >
                                        <Button
                                            size="small"
                                            shape="circle"
                                            icon={<EditOutlined />}
                                            onClick={(e) =>
                                                e.stopPropagation()
                                            }
                                        />
                                    </Dropdown>
                                </div>
                            </div>
                        </Col>
                    ))}
                </Row>
            ) : (
                /* 列表视图 */
                <Space
                    direction="vertical"
                    style={{ width: '100%' }}
                    size="middle"
                >
                    {filteredBooks.map((book: Book) => (
                        <div
                            key={book.book_id}
                            style={{ position: 'relative' }}
                        >
                            <BookCard
                                book={book}
                                viewMode="list"
                                onClick={() =>
                                    navigate(
                                        `/shelf/${currentShelfId}/book/${book.book_id}`
                                    )
                                }
                            />
                            {/* 操作按钮组 */}
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 12,
                                    right: 12,
                                    zIndex: 10,
                                }}
                            >
                                <Space>
                                    <Button
                                        size="small"
                                        icon={<BookOutlined />}
                                        onClick={() =>
                                            navigate(
                                                `/shelf/${currentShelfId}/book/${book.book_id}`
                                            )
                                        }
                                        title="查看详情"
                                    />
                                    <Button
                                        size="small"
                                        icon={<SwapOutlined />}
                                        onClick={async () => {
                                            setSelectedBook(book);
                                            const shelves =
                                                await listShelves();
                                            setTargetShelfOptions(
                                                shelves
                                                    .filter(
                                                        (s: any) =>
                                                            s.logical_shelf_id !==
                                                            currentShelfId
                                                    )
                                                    .map((s: any) => ({
                                                        value: s.logical_shelf_id,
                                                        label: s.shelf_name,
                                                    }))
                                            );
                                            setMoveModalVisible(true);
                                        }}
                                        title="移动到其他书架"
                                    />
                                    <Popconfirm
                                        title={`确定移除《${book.title}》？`}
                                        onConfirm={async () => {
                                            try {
                                                await removeBookFromShelf(
                                                    currentShelfId,
                                                    book.book_id
                                                );
                                                message.success(
                                                    '已移除'
                                                );
                                                loadShelfBooks(
                                                    currentShelfId
                                                );
                                            } catch {
                                                message.error(
                                                    '移除失败'
                                                );
                                            }
                                        }}
                                        okText="移除"
                                        cancelText="取消"
                                    >
                                        <Button
                                            size="small"
                                            danger
                                            icon={<DeleteOutlined />}
                                            title="从书架移除"
                                        />
                                    </Popconfirm>
                                </Space>
                            </div>
                        </div>
                    ))}
                </Space>
            )}

            {/* 返回顶部 */}
            <FloatButton.BackTop
                visibilityHeight={400}
                style={{ right: 40, bottom: 40 }}
            />

            {/* ===== 移动图书弹窗 ===== */}
            <Modal
                title={
                    <Space>
                        <SwapOutlined />
                        移动图书到其他书架
                    </Space>
                }
                open={moveModalVisible}
                onOk={handleMoveBook}
                onCancel={() => setMoveModalVisible(false)}
                okText="移动"
                cancelText="取消"
                okButtonProps={{ disabled: !targetShelfId }}
            >
                <div style={{ marginBottom: 8 }}>
                    <Text type="secondary">
                        将《{selectedBook?.title}》移动到：
                    </Text>
                </div>
                <Select
                    placeholder="选择目标书架"
                    style={{ width: '100%' }}
                    size="large"
                    value={targetShelfId}
                    onChange={setTargetShelfId}
                    options={targetShelfOptions}
                />
            </Modal>

            {/* ===== 书架选择器弹窗（添加到其他书架） ===== */}
            <ShelfSelector
                visible={showShelfSelector}
                bookId={selectedBook?.book_id || 0}
                bookTitle={selectedBook?.title || ''}
                onClose={() => setShowShelfSelector(false)}
                onSuccess={() => {
                    message.success('已添加到书架');
                    loadShelfBooks(currentShelfId);
                    setShowShelfSelector(false);
                }}
            />
        </div>
    );
};

export default ShelfView;