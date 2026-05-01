// frontend/src/pages/AllBooksManager.tsx
/**
 * 全部图书管理页面 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 自定义 Hooks 封装逻辑
 * - 乐观更新删除
 * - 批量操作确认优化
 * - 搜索防抖
 * - URL 状态同步
 * - 导出功能
 */

import React, {
    useEffect,
    useState,
    useCallback,
    useMemo,
    useRef,
    type FC,
    type Key,
} from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Typography,
    Breadcrumb,
    Tag,
    Input,
    Select,
    message,
    Popconfirm,
    Tooltip,
    Row,
    Col,
    Statistic,
    Segmented,
    Badge,
    Empty,
    Modal,
    Dropdown,
    Divider,
    theme,
    Result,
    type TableColumnsType,
    type TablePaginationConfig,
} from 'antd';
import type { MenuProps } from 'antd';
import {
    BookOutlined,
    HomeOutlined,
    SearchOutlined,
    DeleteOutlined,
    EditOutlined,
    EyeOutlined,
    ReloadOutlined,
    FilterOutlined,
    ExclamationCircleOutlined,
    EnvironmentOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    SyncOutlined,
    DownloadOutlined,
    ClearOutlined,
    MoreOutlined,
    ExportOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getAllBooks, deleteBook, listShelves } from '../services/api';
import VirtualTable from '../components/VirtualTable';
import { debounce } from '../utils/helpers';

const { Title, Text } = Typography;

// ==================== 类型定义 ====================

interface BookItem {
    book_id: number;
    isbn: string;
    title: string;
    author?: string;
    publisher?: string;
    cover_url?: string;
    rating?: string;
    source: string;
    shelf_name?: string;
    shelf_id?: number;
    added_at?: string;
    publish_date?: string;
    price?: string;
    binding?: string;
}

type FilterStatus = 'all' | 'in_shelf' | 'not_in_shelf';
type FilterSource = 'all' | 'douban' | 'manual' | 'isbn' | 'nfc';

interface ShelfOption {
    logical_shelf_id: number;
    shelf_name: string;
}

// ==================== 常量 ====================

const PAGE_SIZE = 50;
const VIRTUAL_SCROLL_THRESHOLD = 500;
const SEARCH_DEBOUNCE_MS = 300;

const SORT_OPTIONS = [
    { value: 'added_at_desc', label: '最近添加' },
    { value: 'added_at_asc', label: '最早添加' },
    { value: 'title_asc', label: '书名 A-Z' },
    { value: 'title_desc', label: '书名 Z-A' },
    { value: 'rating_desc', label: '评分最高' },
    { value: 'rating_asc', label: '评分最低' },
];

const SOURCE_CONFIG: Record<string, { color: string; label: string }> = {
    douban: { color: 'green', label: '豆瓣' },
    manual: { color: 'orange', label: '手动录入' },
    isbn: { color: 'blue', label: 'ISBN' },
    nfc: { color: 'purple', label: 'NFC' },
};

// ==================== 自定义 Hook ====================

/**
 * 图书管理逻辑 Hook
 */
const useBookManager = () => {
    const [books, setBooks] = useState<BookItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [sortBy, setSortBy] = useState('added_at_desc');
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
    const [filterSource, setFilterSource] = useState<FilterSource>('all');
    const [filterShelfId, setFilterShelfId] = useState<number | undefined>();
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    /** 解析排序参数 */
    const parseSortParams = useCallback(
        (value: string): { field: string; order: string } => {
            const idx = value.lastIndexOf('_');
            if (idx === -1) return { field: value, order: 'asc' };
            return {
                field: value.substring(0, idx),
                order: value.substring(idx + 1),
            };
        },
        []
    );

    /** 加载图书列表 */
    const loadBooks = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const { field, order } = parseSortParams(sortBy);
            const params: Record<string, unknown> = {
                sort_by: field,
                order,
                limit: PAGE_SIZE,
                offset: (currentPage - 1) * PAGE_SIZE,
            };

            if (searchKeyword.trim()) params.search = searchKeyword.trim();
            if (filterShelfId) params.shelf_id = filterShelfId;
            if (filterSource !== 'all') params.source = filterSource;

            const data = await getAllBooks(params);

            if (isMounted.current) {
                let booksData = data.books || [];
                
                // 客户端过滤上架状态
                if (filterStatus === 'in_shelf') {
                    booksData = booksData.filter((b: BookItem) => b.shelf_name);
                } else if (filterStatus === 'not_in_shelf') {
                    booksData = booksData.filter((b: BookItem) => !b.shelf_name);
                }

                setBooks(booksData);
                setTotal(data.total);
            }
        } catch (err: any) {
            if (isMounted.current) {
                setError(err?.response?.data?.detail || '加载图书列表失败');
            }
        } finally {
            if (isMounted.current) {
                setLoading(false);
            }
        }
    }, [
        currentPage,
        sortBy,
        filterStatus,
        filterSource,
        filterShelfId,
        searchKeyword,
        parseSortParams,
    ]);

    /** 重置分页并重新加载 */
    const refresh = useCallback(() => {
        setCurrentPage(1);
    }, []);

    return {
        books,
        total,
        loading,
        error,
        currentPage,
        setCurrentPage,
        searchKeyword,
        setSearchKeyword,
        sortBy,
        setSortBy,
        filterStatus,
        setFilterStatus,
        filterSource,
        setFilterSource,
        filterShelfId,
        setFilterShelfId,
        loadBooks,
        refresh,
    };
};

// ==================== 主组件 ====================

const AllBooksManager: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();
    const [searchParams, setSearchParams] = useSearchParams();

    // 图书管理
    const {
        books,
        total,
        loading,
        error,
        currentPage,
        setCurrentPage,
        searchKeyword,
        setSearchKeyword,
        sortBy,
        setSortBy,
        filterStatus,
        setFilterStatus,
        filterSource,
        setFilterSource,
        filterShelfId,
        setFilterShelfId,
        loadBooks,
        refresh,
    } = useBookManager();

    // UI 状态
    const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [shelfList, setShelfList] = useState<ShelfOption[]>([]);
    const isMounted = useRef(true);

    // ==================== 生命周期 ====================

    useEffect(() => {
        isMounted.current = true;
        loadShelfList();
        return () => {
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        loadBooks();
    }, [loadBooks]);

    // ==================== 书架列表 ====================

    const loadShelfList = useCallback(async () => {
        try {
            const data = await listShelves();
            if (isMounted.current) {
                setShelfList(data || []);
            }
        } catch {
            // 静默处理
        }
    }, []);

    // ==================== 操作处理 ====================

    /** 删除单本图书 */
    const handleDelete = useCallback(
        async (record: BookItem) => {
            setDeletingId(record.book_id);
            try {
                await deleteBook(record.book_id);
                message.success(`《${record.title}》已删除`);
                // 乐观更新
                setBooks((prev) => prev.filter((b) => b.book_id !== record.book_id));
            } catch (err: any) {
                message.error(err?.response?.data?.detail || '删除失败');
            } finally {
                setDeletingId(null);
            }
        },
        []
    );

    /** 批量删除 */
    const handleBatchDelete = useCallback(() => {
        if (selectedRowKeys.length === 0) {
            message.warning('请先选择要删除的图书');
            return;
        }

        Modal.confirm({
            title: '批量删除图书',
            icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
            content: (
                <div>
                    <Text>
                        确定要删除选中的{' '}
                        <Text strong type="danger">
                            {selectedRowKeys.length}
                        </Text>{' '}
                        本图书吗？
                    </Text>
                    <br />
                    <Text type="secondary">此操作不可恢复</Text>
                </div>
            ),
            okText: '确定删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                let successCount = 0;
                let failCount = 0;

                const hide = message.loading(`正在删除 ${selectedRowKeys.length} 本...`, 0);

                for (const id of selectedRowKeys) {
                    try {
                        await deleteBook(Number(id));
                        successCount++;
                    } catch {
                        failCount++;
                    }
                }

                hide();

                if (failCount === 0) {
                    message.success(`成功删除 ${successCount} 本图书`);
                } else {
                    message.warning(
                        `删除完成：成功 ${successCount} 本，失败 ${failCount} 本`
                    );
                }

                setSelectedRowKeys([]);
                loadBooks();
            },
        });
    }, [selectedRowKeys, loadBooks]);

    /** 导出选中图书 */
    const handleExport = useCallback(() => {
        const exportData = selectedRowKeys.length > 0
            ? books.filter((b) => selectedRowKeys.includes(b.book_id))
            : books;

        const csv = [
            ['书名', 'ISBN', '作者', '出版社', '来源', '评分', '所在书架'].join(','),
            ...exportData.map((b) =>
                [b.title, b.isbn, b.author || '', b.publisher || '', b.source, b.rating || '', b.shelf_name || '']
                    .map((v) => `"${v}"`)
                    .join(',')
            ),
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `books_export_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        message.success('导出成功');
    }, [books, selectedRowKeys]);

    // ==================== 防抖搜索 ====================

    const debouncedSearch = useMemo(
        () =>
            debounce((value: string) => {
                setSearchKeyword(value);
                setCurrentPage(1);
            }, SEARCH_DEBOUNCE_MS),
        [setSearchKeyword, setCurrentPage]
    );

    // ==================== 统计数据 ====================

    const stats = useMemo(() => {
        const inShelf = books.filter((b) => b.shelf_name).length;
        return {
            inShelf,
            notInShelf: books.length - inShelf,
            doubanCount: books.filter((b) => b.source === 'douban').length,
            manualCount: books.filter((b) => b.source === 'manual').length,
        };
    }, [books]);

    // ==================== 批量操作菜单 ====================

    const batchMenuItems: MenuProps['items'] = [
        {
            key: 'delete',
            icon: <DeleteOutlined />,
            label: `删除选中 (${selectedRowKeys.length})`,
            danger: true,
            onClick: handleBatchDelete,
        },
        {
            key: 'export',
            icon: <ExportOutlined />,
            label: selectedRowKeys.length > 0 ? '导出选中' : '导出全部',
            onClick: handleExport,
        },
        {
            key: 'clear',
            icon: <ClearOutlined />,
            label: '清除选择',
            disabled: selectedRowKeys.length === 0,
            onClick: () => setSelectedRowKeys([]),
        },
    ];

    // ==================== 表格列定义 ====================

    const columns: TableColumnsType<BookItem> = useMemo(
        () => [
            {
                title: 'ID',
                dataIndex: 'book_id',
                key: 'book_id',
                width: 70,
                align: 'center',
                render: (id: number) => (
                    <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                        #{id}
                    </Text>
                ),
            },
            {
                title: '书名',
                dataIndex: 'title',
                key: 'title',
                width: 280,
                ellipsis: true,
                sorter: true,
                render: (title: string, record: BookItem) => {
                    const detailPath = record.shelf_id
                        ? `/shelf/${record.shelf_id}/book/${record.book_id}`
                        : `/shelf/1/book/${record.book_id}`;
                    return (
                        <a
                            onClick={() => navigate(detailPath)}
                            style={{ fontWeight: 500 }}
                            title={title}
                        >
                            {title}
                        </a>
                    );
                },
            },
            {
                title: 'ISBN',
                dataIndex: 'isbn',
                key: 'isbn',
                width: 160,
                render: (isbn: string) => (
                    <Text code style={{ fontSize: 12 }} copyable>
                        {isbn}
                    </Text>
                ),
            },
            {
                title: '作者',
                dataIndex: 'author',
                key: 'author',
                width: 140,
                ellipsis: true,
                render: (author: string) =>
                    author || (
                        <Text type="secondary" italic>
                            未知
                        </Text>
                    ),
            },
            {
                title: '来源',
                dataIndex: 'source',
                key: 'source',
                width: 100,
                align: 'center',
                filters: [
                    { text: '豆瓣', value: 'douban' },
                    { text: '手动录入', value: 'manual' },
                    { text: 'ISBN', value: 'isbn' },
                    { text: 'NFC', value: 'nfc' },
                ],
                onFilter: (value, record) => record.source === value,
                render: (source: string) => {
                    const config = SOURCE_CONFIG[source] || {
                        color: 'default',
                        label: source,
                    };
                    return (
                        <Tag color={config.color} style={{ borderRadius: 10 }}>
                            {config.label}
                        </Tag>
                    );
                },
            },
            {
                title: '评分',
                dataIndex: 'rating',
                key: 'rating',
                width: 80,
                align: 'center',
                sorter: (a, b) =>
                    parseFloat(a.rating || '0') - parseFloat(b.rating || '0'),
                render: (rating: string) =>
                    rating ? (
                        <Badge
                            count={rating}
                            style={{ backgroundColor: '#f59e0b' }}
                        />
                    ) : (
                        <Text type="secondary">-</Text>
                    ),
            },
            {
                title: '所在书架',
                dataIndex: 'shelf_name',
                key: 'shelf_name',
                width: 150,
                ellipsis: true,
                filters: shelfList.map((s) => ({
                    text: s.shelf_name,
                    value: s.logical_shelf_id,
                })),
                onFilter: (value, record) => record.shelf_id === value,
                render: (shelfName: string, record: BookItem) =>
                    shelfName && record.shelf_id ? (
                        <Tooltip title={`跳转到「${shelfName}」`}>
                            <Tag
                                color="blue"
                                icon={<EnvironmentOutlined />}
                                style={{ cursor: 'pointer', borderRadius: 10 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/shelf/${record.shelf_id}`);
                                }}
                            >
                                {shelfName}
                            </Tag>
                        </Tooltip>
                    ) : (
                        <Tag
                            color="default"
                            icon={<CloseCircleOutlined />}
                            style={{ borderRadius: 10 }}
                        >
                            未上架
                        </Tag>
                    ),
            },
            {
                title: '操作',
                key: 'action',
                width: 200,
                fixed: 'right',
                render: (_: unknown, record: BookItem) => {
                    const detailPath = record.shelf_id
                        ? `/shelf/${record.shelf_id}/book/${record.book_id}`
                        : `/shelf/1/book/${record.book_id}`;

                    return (
                        <Space size={4}>
                            <Tooltip title="查看详情">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<EyeOutlined />}
                                    onClick={() => navigate(detailPath)}
                                    style={{ color: token.colorPrimary }}
                                />
                            </Tooltip>
                            <Tooltip title="编辑信息">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<EditOutlined />}
                                    onClick={() =>
                                        navigate(`/books/edit/${record.book_id}`)
                                    }
                                    style={{ color: '#3b82f6' }}
                                />
                            </Tooltip>
                            <Popconfirm
                                title={`确定删除《${record.title}》？`}
                                description="此操作不可恢复"
                                onConfirm={() => handleDelete(record)}
                                okText="确定"
                                cancelText="取消"
                                okButtonProps={{ danger: true }}
                            >
                                <Button
                                    type="text"
                                    size="small"
                                    danger
                                    icon={<DeleteOutlined />}
                                    loading={deletingId === record.book_id}
                                />
                            </Popconfirm>
                        </Space>
                    );
                },
            },
        ],
        [navigate, handleDelete, deletingId, shelfList, token]
    );

    // ==================== 虚拟滚动列 ====================

    const virtualColumns = useMemo(
        () => [
            {
                key: 'id',
                title: 'ID',
                width: 60,
                render: (record: BookItem) => (
                    <Text
                        type="secondary"
                        style={{ fontSize: 11, fontFamily: 'monospace' }}
                    >
                        #{record.book_id}
                    </Text>
                ),
            },
            {
                key: 'title',
                title: '书名',
                width: 240,
                render: (record: BookItem) => {
                    const detailPath = record.shelf_id
                        ? `/shelf/${record.shelf_id}/book/${record.book_id}`
                        : `/shelf/1/book/${record.book_id}`;
                    return (
                        <a
                            onClick={() => navigate(detailPath)}
                            style={{
                                fontWeight: 500,
                                fontSize: 13,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'block',
                            }}
                            title={record.title}
                        >
                            {record.title}
                        </a>
                    );
                },
            },
            {
                key: 'author',
                title: '作者',
                width: 120,
                render: (record: BookItem) => (
                    <Text
                        style={{
                            fontSize: 12,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'block',
                        }}
                    >
                        {record.author || <Text type="secondary" italic>未知</Text>}
                    </Text>
                ),
            },
            {
                key: 'source',
                title: '来源',
                width: 80,
                render: (record: BookItem) => {
                    const config = SOURCE_CONFIG[record.source] || {
                        color: 'default',
                        label: record.source,
                    };
                    return (
                        <Tag
                            color={config.color}
                            style={{ borderRadius: 10, fontSize: 10, margin: 0 }}
                        >
                            {config.label}
                        </Tag>
                    );
                },
            },
            {
                key: 'shelf',
                title: '书架',
                width: 120,
                render: (record: BookItem) =>
                    record.shelf_name ? (
                        <Tag
                            color="blue"
                            style={{ borderRadius: 10, fontSize: 10, margin: 0 }}
                        >
                            {record.shelf_name}
                        </Tag>
                    ) : (
                        <Tag
                            color="default"
                            style={{ borderRadius: 10, fontSize: 10, margin: 0 }}
                        >
                            未上架
                        </Tag>
                    ),
            },
            {
                key: 'actions',
                title: '操作',
                width: 150,
                render: (record: BookItem) => {
                    const detailPath = record.shelf_id
                        ? `/shelf/${record.shelf_id}/book/${record.book_id}`
                        : `/shelf/1/book/${record.book_id}`;
                    return (
                        <Space size={4}>
                            <Button
                                type="text"
                                size="small"
                                icon={<EyeOutlined />}
                                onClick={() => navigate(detailPath)}
                                style={{ color: token.colorPrimary }}
                            />
                            <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() =>
                                    navigate(`/books/edit/${record.book_id}`)
                                }
                                style={{ color: '#3b82f6' }}
                            />
                            <Popconfirm
                                title="删除？"
                                onConfirm={() => handleDelete(record)}
                                okButtonProps={{ danger: true, size: 'small' }}
                            >
                                <Button
                                    type="text"
                                    size="small"
                                    danger
                                    icon={<DeleteOutlined />}
                                    loading={deletingId === record.book_id}
                                />
                            </Popconfirm>
                        </Space>
                    );
                },
            },
        ],
        [navigate, handleDelete, deletingId, token]
    );

    // ==================== 分页配置 ====================

    const paginationConfig: TablePaginationConfig = {
        current: currentPage,
        pageSize: PAGE_SIZE,
        total,
        onChange: (page) => setCurrentPage(page),
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total, range) => (
            <Text type="secondary" style={{ fontSize: 13 }}>
                共 {total} 本，显示第 {range[0]}-{range[1]} 本
            </Text>
        ),
    };

    // ==================== 渲染表格 ====================

    const renderTable = () => {
        if (books.length > VIRTUAL_SCROLL_THRESHOLD) {
            return (
                <VirtualTable
                    data={books as unknown as Record<string, unknown>[]}
                    columns={virtualColumns}
                    rowHeight={56}
                    headerHeight={48}
                    height={700}
                    emptyText="暂无图书数据"
                />
            );
        }

        return (
            <Table<BookItem>
                columns={columns}
                dataSource={books}
                rowKey="book_id"
                loading={loading}
                rowSelection={{
                    selectedRowKeys,
                    onChange: setSelectedRowKeys,
                    preserveSelectedRowKeys: true,
                }}
                pagination={paginationConfig}
                locale={{
                    emptyText: (
                        <Empty
                            image={
                                <BookOutlined
                                    style={{ fontSize: 48, color: '#d4a574' }}
                                />
                            }
                            description="暂无图书数据"
                        />
                    ),
                }}
                scroll={{ x: 1300 }}
                size="middle"
            />
        );
    };

    // ==================== 渲染页面 ====================

    return (
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: 24 }}>
            {/* 面包屑 */}
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
                    {
                        title: (
                            <a onClick={() => navigate('/admin')}>管理</a>
                        ),
                    },
                    { title: '全部图书' },
                ]}
            />

            {/* 头部 */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: 16,
                    marginBottom: 24,
                }}
            >
                <div>
                    <Title level={2} style={{ margin: 0 }}>
                        <BookOutlined
                            style={{ marginRight: 12, color: token.colorPrimary }}
                        />
                        全部图书管理
                    </Title>
                    <Text
                        type="secondary"
                        style={{ display: 'block', marginTop: 4 }}
                    >
                        管理所有已录入的图书 · 共 {total} 本
                        {books.length > VIRTUAL_SCROLL_THRESHOLD && (
                            <Tag color="blue" style={{ marginLeft: 8 }}>
                                虚拟滚动模式
                            </Tag>
                        )}
                    </Text>
                </div>
                <Space wrap>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={() => loadBooks()}
                        loading={loading}
                        style={{ borderRadius: 8 }}
                    >
                        刷新
                    </Button>
                    {selectedRowKeys.length > 0 && (
                        <Dropdown menu={{ items: batchMenuItems }}>
                            <Button
                                danger
                                icon={<DeleteOutlined />}
                                style={{ borderRadius: 8 }}
                            >
                                批量操作 ({selectedRowKeys.length})
                            </Button>
                        </Dropdown>
                    )}
                </Space>
            </div>

            {/* 统计卡片 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={8}>
                    <Card
                        size="small"
                        style={{
                            borderRadius: 12,
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                        }}
                    >
                        <Statistic
                            title="图书总数"
                            value={total}
                            prefix={<BookOutlined style={{ color: '#3b82f6' }} />}
                            valueStyle={{ color: '#3b82f6' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card
                        size="small"
                        style={{
                            borderRadius: 12,
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                        }}
                    >
                        <Statistic
                            title="豆瓣来源"
                            value={stats.doubanCount}
                            prefix={<SyncOutlined style={{ color: '#22c55e' }} />}
                            valueStyle={{ color: '#22c55e' }}
                            suffix={`/ ${total}`}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card
                        size="small"
                        style={{
                            borderRadius: 12,
                            background: '#faf5ff',
                            border: '1px solid #e9d5ff',
                        }}
                    >
                        <Statistic
                            title="已上架"
                            value={stats.inShelf}
                            prefix={
                                <CheckCircleOutlined style={{ color: '#a855f7' }} />
                            }
                            valueStyle={{ color: '#a855f7' }}
                            suffix={`/ ${total}`}
                        />
                    </Card>
                </Col>
            </Row>

            {/* 筛选工具栏 */}
            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 12,
                    border: `1px solid ${token.colorBorderSecondary}`,
                }}
                styles={{ body: { padding: '16px 20px' } }}
            >
                <Space wrap size="middle">
                    <Input.Search
                        placeholder="搜索书名/作者/ISBN..."
                        allowClear
                        defaultValue={searchKeyword}
                        onChange={(e) => debouncedSearch(e.target.value)}
                        onSearch={(value) => {
                            setSearchKeyword(value || '');
                            setCurrentPage(1);
                        }}
                        style={{ width: 280 }}
                        prefix={<SearchOutlined />}
                    />
                    <Segmented
                        options={[
                            { label: '全部', value: 'all' },
                            {
                                label: `已上架 (${stats.inShelf})`,
                                value: 'in_shelf',
                            },
                            {
                                label: `未上架 (${stats.notInShelf})`,
                                value: 'not_in_shelf',
                            },
                        ]}
                        value={filterStatus}
                        onChange={(v) => {
                            setFilterStatus(v as FilterStatus);
                            setCurrentPage(1);
                        }}
                    />
                    <Select
                        value={filterSource}
                        onChange={(v) => {
                            setFilterSource(v as FilterSource);
                            setCurrentPage(1);
                        }}
                        style={{ width: 140 }}
                        options={[
                            { value: 'all', label: '全部来源' },
                            {
                                value: 'douban',
                                label: `豆瓣 (${stats.doubanCount})`,
                            },
                            {
                                value: 'manual',
                                label: `手动 (${stats.manualCount})`,
                            },
                            { value: 'isbn', label: 'ISBN' },
                            { value: 'nfc', label: 'NFC' },
                        ]}
                        prefix={<FilterOutlined />}
                    />
                    <Select
                        value={filterShelfId || 0}
                        onChange={(v) => {
                            setFilterShelfId(v === 0 ? undefined : v);
                            setCurrentPage(1);
                        }}
                        style={{ width: 180 }}
                        options={[
                            { value: 0, label: '全部书架' },
                            ...shelfList.map((s) => ({
                                value: s.logical_shelf_id,
                                label: s.shelf_name,
                            })),
                        ]}
                        prefix={<EnvironmentOutlined />}
                    />
                    <Select
                        value={sortBy}
                        onChange={(v) => {
                            setSortBy(v);
                            setCurrentPage(1);
                        }}
                        style={{ width: 140 }}
                        options={SORT_OPTIONS}
                    />
                </Space>
            </Card>

            {/* 表格 */}
            <Card
                style={{
                    borderRadius: 12,
                    boxShadow: '0 2px 8px rgba(139,69,19,.06)',
                    border: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                {error ? (
                    <Result
                        status="error"
                        title="加载失败"
                        subTitle={error}
                        extra={
                            <Button
                                type="primary"
                                icon={<ReloadOutlined />}
                                onClick={() => loadBooks()}
                            >
                                重试
                            </Button>
                        }
                    />
                ) : (
                    renderTable()
                )}
            </Card>
        </div>
    );
};

export default AllBooksManager;