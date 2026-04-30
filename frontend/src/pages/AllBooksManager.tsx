// frontend/src/pages/AllBooksManager.tsx
/**
 * 总图书管理页面
 * 
 * 管理所有已录入的图书，无论是否上架。
 * 
 * 功能：
 * - 列表展示所有图书（分页、排序、搜索）
 * - 快速筛选：全部/已上架/未上架
 * - 按来源筛选：豆瓣/手动/ISBN/NFC
 * - 批量操作：选择后批量删除
 * - 单本操作：编辑、查看详情、删除
 * - 快速跳转到图书详情或所在书架
 * 
 * 数据来源：GET /api/books/all（包含所有图书，包括未上架的）
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
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
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getAllBooks, deleteBook, listShelves } from '../services/api';

// ---- 类型定义 ----

const { Title, Text } = Typography;

/** 图书列表项（扩展） */
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

/** 筛选状态 */
type FilterStatus = 'all' | 'in_shelf' | 'not_in_shelf';
type FilterSource = 'all' | 'douban' | 'manual' | 'isbn' | 'nfc';

/** 排序方式 */
const SORT_OPTIONS = [
    { value: 'added_at_desc', label: '最近添加' },
    { value: 'added_at_asc', label: '最早添加' },
    { value: 'title_asc', label: '书名 A-Z' },
    { value: 'title_desc', label: '书名 Z-A' },
    { value: 'rating_desc', label: '评分最高' },
    { value: 'rating_asc', label: '评分最低' },
];

/** 每页数量 */
const PAGE_SIZE = 50;

/** 来源标签映射 */
const SOURCE_CONFIG: Record<string, { color: string; label: string }> = {
    douban: { color: 'green', label: '豆瓣' },
    manual: { color: 'orange', label: '手动录入' },
    isbn: { color: 'blue', label: 'ISBN' },
    nfc: { color: 'purple', label: 'NFC' },
};

// ---- 主组件 ----

const AllBooksManager: React.FC = () => {
    const navigate = useNavigate();

    // ==================== 状态 ====================

    const [loading, setLoading] = useState(true);
    const [books, setBooks] = useState<BookItem[]>([]);
    const [total, setTotal] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [sortBy, setSortBy] = useState('added_at_desc');
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
    const [filterSource, setFilterSource] = useState<FilterSource>('all');
    const [error, setError] = useState<string | null>(null);

    /** 选中的行 */
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

    /** 删除中 */
    const [deletingId, setDeletingId] = useState<number | null>(null);

    /** 所有书架列表（用于筛选） */
    const [shelfList, setShelfList] = useState<any[]>([]);
    const [filterShelfId, setFilterShelfId] = useState<number | undefined>();

    /** 组件挂载状态 */
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
    }, [currentPage, sortBy, filterStatus, filterSource, filterShelfId]);

    // ==================== 数据加载 ====================

    /** 加载书架列表 */
    const loadShelfList = useCallback(async () => {
        try {
            const data = await listShelves();
            if (isMounted.current) {
                setShelfList(data || []);
            }
        } catch {
            // 静默失败
        }
    }, []);

    /**
     * 加载图书列表
     * 
     * 使用 getAllBooks API，获取所有图书（包括未上架的）。
     */
    const loadBooks = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const [field, order] = sortBy.split('_');
            const params: any = {
                sort_by: field,
                order,
                limit: PAGE_SIZE,
                offset: (currentPage - 1) * PAGE_SIZE,
            };

            // 书架筛选
            if (filterShelfId) {
                // 暂不支持通过 API 筛选书架，后端未实现
                // params.shelf_id = filterShelfId;
            }

            const data = await getAllBooks(params);

            if (isMounted.current) {
                let filteredBooks = data.books || [];
                
                // 前端补充筛选（上架/未上架状态、来源）
                if (filterStatus === 'in_shelf') {
                    filteredBooks = filteredBooks.filter(
                        (b: BookItem) => b.shelf_name
                    );
                } else if (filterStatus === 'not_in_shelf') {
                    filteredBooks = filteredBooks.filter(
                        (b: BookItem) => !b.shelf_name
                    );
                }

                if (filterSource !== 'all') {
                    filteredBooks = filteredBooks.filter(
                        (b: BookItem) => b.source === filterSource
                    );
                }

                setBooks(filteredBooks);
                setTotal(filteredBooks.length);
            }
        } catch (err: any) {
            if (isMounted.current) {
                setError(err?.response?.data?.detail || '加载图书列表失败');
            }
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, [currentPage, sortBy, filterStatus, filterSource, filterShelfId]);

    // ==================== 删除操作 ====================

    /** 删除单本图书 */
    const handleDelete = useCallback(
        async (record: BookItem) => {
            setDeletingId(record.book_id);
            try {
                await deleteBook(record.book_id);
                message.success(`《${record.title}》已删除`);
                loadBooks();
            } catch (err: any) {
                message.error(
                    err?.response?.data?.detail || '删除失败'
                );
            } finally {
                setDeletingId(null);
            }
        },
        [loadBooks]
    );

    /** 批量删除 */
    const handleBatchDelete = useCallback(async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('请先选择要删除的图书');
            return;
        }

        Modal.confirm({
            title: '批量删除图书',
            icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
            content: `确定要删除选中的 ${selectedRowKeys.length} 本图书吗？此操作不可恢复。`,
            okText: '确定删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                let successCount = 0;
                let failCount = 0;

                for (const id of selectedRowKeys) {
                    try {
                        await deleteBook(Number(id));
                        successCount++;
                    } catch {
                        failCount++;
                    }
                }

                message.success(
                    `删除完成：成功 ${successCount} 本` +
                    (failCount > 0 ? `，失败 ${failCount} 本` : '')
                );

                setSelectedRowKeys([]);
                loadBooks();
            },
        });
    }, [selectedRowKeys, loadBooks]);

    // ==================== 衍生数据 ====================

    /** 统计数据 */
    const stats = useMemo(() => {
        const inShelf = books.filter((b) => b.shelf_name).length;
        const notInShelf = books.length - inShelf;
        const doubanCount = books.filter((b) => b.source === 'douban').length;
        const manualCount = books.filter((b) => b.source === 'manual').length;

        return { inShelf, notInShelf, doubanCount, manualCount };
    }, [books]);

    // ==================== 表格列配置 ====================

    const columns: ColumnsType<BookItem> = useMemo(
        () => [
            {
                title: 'ID',
                dataIndex: 'book_id',
                key: 'book_id',
                width: 70,
                align: 'center',
                render: (id: number) => (
                    <Text
                        type="secondary"
                        style={{ fontSize: 12, fontFamily: 'monospace' }}
                    >
                        #{id}
                    </Text>
                ),
            },
            {
                title: '书名',
                dataIndex: 'title',
                key: 'title',
                width: 250,
                ellipsis: true,
                render: (title: string, record: BookItem) => (
                    <a
                        onClick={() =>
                            navigate(
                                record.shelf_id
                                    ? `/shelf/${record.shelf_id}/book/${record.book_id}`
                                    : `/shelf/1/book/${record.book_id}`
                            )
                        }
                        style={{ fontWeight: 500 }}
                    >
                        {title}
                    </a>
                ),
            },
            {
                title: 'ISBN',
                dataIndex: 'isbn',
                key: 'isbn',
                width: 150,
                render: (isbn: string) => (
                    <Text
                        code
                        style={{ fontSize: 12 }}
                        copyable
                    >
                        {isbn}
                    </Text>
                ),
            },
            {
                title: '作者',
                dataIndex: 'author',
                key: 'author',
                width: 150,
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
                        <Tag
                            color={config.color}
                            style={{ borderRadius: 10 }}
                        >
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
                    parseFloat(a.rating || '0') -
                    parseFloat(b.rating || '0'),
                render: (rating: string) =>
                    rating ? (
                        <Badge
                            count={rating}
                            style={{
                                backgroundColor: '#f59e0b',
                            }}
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
                render: (shelfName: string, record: BookItem) =>
                    shelfName && record.shelf_id ? (
                        <Tooltip title={`跳转到「${shelfName}」`}>
                            <Tag
                                color="blue"
                                icon={<EnvironmentOutlined />}
                                style={{
                                    cursor: 'pointer',
                                    borderRadius: 10,
                                }}
                                onClick={() =>
                                    navigate(
                                        `/shelf/${record.shelf_id}`
                                    )
                                }
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
                render: (_: any, record: BookItem) => (
                    <Space size="small">
                        <Tooltip title="查看详情">
                            <Button
                                type="text"
                                size="small"
                                icon={<EyeOutlined />}
                                onClick={() =>
                                    // ✅ 修复：根据是否有书架决定跳转路径
                                    navigate(
                                        record.shelf_id
                                            ? `/shelf/${record.shelf_id}/book/${record.book_id}`
                                            : `/shelf/1/book/${record.book_id}`
                                    )
                                }
                                style={{ color: '#8B4513' }}
                            />
                        </Tooltip>
                        <Tooltip title="编辑信息">
                            <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() =>
                                    navigate(
                                        `/books/edit/${record.book_id}`
                                    )
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
                                loading={
                                    deletingId === record.book_id
                                }
                            />
                        </Popconfirm>
                    </Space>
                ),
            },
        ],
        [navigate, handleDelete, deletingId]
    );

    // ==================== 渲染 ====================

    return (
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: 24 }}>
            {/* 面包屑导航 */}
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
                            <a onClick={() => navigate('/admin')}>
                                管理
                            </a>
                        ),
                    },
                    { title: '全部图书' },
                ]}
            />

            {/* 页面标题 */}
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
                        <BookOutlined
                            style={{ marginRight: 12, color: '#8B4513' }}
                        />
                        全部图书管理
                    </Title>
                    <Text
                        type="secondary"
                        style={{ display: 'block', marginTop: 4 }}
                    >
                        管理所有已录入的图书 · 共 {total} 本
                    </Text>
                </div>

                <Space wrap>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={loadBooks}
                        loading={loading}
                        style={{ borderRadius: 8 }}
                    >
                        刷新
                    </Button>
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
                            prefix={
                                <BookOutlined
                                    style={{ color: '#3b82f6' }}
                                />
                            }
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
                            prefix={
                                <SyncOutlined
                                    style={{ color: '#22c55e' }}
                                />
                            }
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
                                <CheckCircleOutlined
                                    style={{ color: '#a855f7' }}
                                />
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
                    border: '1px solid #e8d5c8',
                }}
            >
                <Space wrap size="middle">
                    {/* 搜索 */}
                    <Input.Search
                        placeholder="搜索书名/作者/ISBN..."
                        allowClear
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        onSearch={loadBooks}
                        style={{ width: 280 }}
                        prefix={<SearchOutlined />}
                    />

                    {/* 上架状态筛选 */}
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

                    {/* 来源筛选 */}
                    <Select
                        value={filterSource}
                        onChange={(v) => {
                            setFilterSource(v);
                            setCurrentPage(1);
                        }}
                        style={{ width: 130 }}
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

                    {/* 书架筛选 */}
                    <Select
                        value={filterShelfId || 0}
                        onChange={(v) => {
                            setFilterShelfId(
                                v === 0 ? undefined : v
                            );
                            setCurrentPage(1);
                        }}
                        style={{ width: 160 }}
                        options={[
                            { value: 0, label: '全部书架' },
                            ...shelfList.map((s: any) => ({
                                value: s.logical_shelf_id,
                                label: s.shelf_name,
                            })),
                        ]}
                        prefix={<EnvironmentOutlined />}
                    />

                    {/* 排序 */}
                    <Select
                        value={sortBy}
                        onChange={(v) => {
                            setSortBy(v);
                            setCurrentPage(1);
                        }}
                        style={{ width: 140 }}
                        options={SORT_OPTIONS}
                    />

                    {/* 批量删除 */}
                    {selectedRowKeys.length > 0 && (
                        <Button
                            danger
                            icon={<DeleteOutlined />}
                            onClick={handleBatchDelete}
                        >
                            删除选中 ({selectedRowKeys.length})
                        </Button>
                    )}
                </Space>
            </Card>

            {/* 表格 */}
            <Card
                style={{
                    borderRadius: 12,
                    boxShadow: '0 2px 8px rgba(139,69,19,.06)',
                    border: '1px solid #e8d5c8',
                }}
            >
                <Table<BookItem>
                    columns={columns}
                    dataSource={books}
                    rowKey="book_id"
                    loading={loading}
                    rowSelection={{
                        selectedRowKeys,
                        onChange: setSelectedRowKeys,
                    }}
                    pagination={{
                        current: currentPage,
                        pageSize: PAGE_SIZE,
                        total: total,
                        onChange: (page) => setCurrentPage(page),
                        showSizeChanger: true,
                        showTotal: (total, range) => (
                            <Text
                                type="secondary"
                                style={{ fontSize: 13 }}
                            >
                                共 {total} 本，显示第 {range[0]}-
                                {range[1]} 本
                            </Text>
                        ),
                    }}
                    locale={{
                        emptyText: (
                            <Empty
                                image={
                                    <BookOutlined
                                        style={{
                                            fontSize: 48,
                                            color: '#d4a574',
                                        }}
                                    />
                                }
                                description="暂无图书数据"
                            />
                        ),
                    }}
                    scroll={{ x: 1200 }}
                />
            </Card>
        </div>
    );
};

export default AllBooksManager;