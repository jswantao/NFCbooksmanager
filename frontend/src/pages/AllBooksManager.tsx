// frontend/src/pages/AllBooksManager.tsx
/**
 * 全部图书管理页面 - 增强版
 *
 * 功能：
 * - 批量操作：删除 / 移动书架 / 修改标签
 * - 搜索筛选：书名/作者/ISBN/标签多字段组合 + 来源/书架/上架状态
 * - 表格列：封面缩略图 / 评分 / 书架位置 / 标签 / 价格 / 出版日期 / 列自定义
 * - 导出：CSV 导出（含全部字段）
 * - 内联编辑：标签 / 评分
 * - 分页：优化大数据量加载 + 总数统计
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
    Checkbox,
    Rate,
    InputNumber,
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
    SwapOutlined,
    TagsOutlined,
    StarOutlined,
    SettingOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { listShelves, updateBookManual, deleteBook, getAllBooks, addBookToShelf } from '../services/api';
import UnifiedCover from '../components/UnifiedCover';
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
    local_cover_path?: string;
    douban_url?: string;
    rating?: string;
    source: string;
    shelf_name?: string;
    shelf_id?: number;
    added_at?: string;
    publish_date?: string;
    price?: string;
    binding?: string;
    tags?: string;
}

type FilterStatus = 'all' | 'in_shelf' | 'not_in_shelf';
type FilterSource = 'all' | 'douban' | 'manual' | 'isbn' | 'nfc' | 'nedb_import';

interface ShelfOption {
    logical_shelf_id: number;
    shelf_name: string;
}

// ==================== 常量 ====================

const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 350;

const SORT_OPTIONS = [
    { value: 'created_at_desc', label: '最近添加' },
    { value: 'created_at_asc', label: '最早添加' },
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
    nedb_import: { color: 'cyan', label: 'NeDB导入' },
};

const ALL_COLUMNS = ['cover', 'title', 'isbn', 'author', 'publisher', 'publish_date', 'price', 'source', 'rating', 'tags', 'shelf', 'actions'] as const;
type ColumnKey = typeof ALL_COLUMNS[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
    cover: '封面', title: '书名', isbn: 'ISBN', author: '作者',
    publisher: '出版社', publish_date: '出版日期', price: '价格',
    source: '来源', rating: '评分', tags: '标签', shelf: '书架', actions: '操作',
};

const CSV_FIELDS = [
    { key: 'book_id', label: 'ID' },
    { key: 'title', label: '书名' },
    { key: 'author', label: '作者' },
    { key: 'isbn', label: 'ISBN' },
    { key: 'publisher', label: '出版社' },
    { key: 'publish_date', label: '出版日期' },
    { key: 'price', label: '价格' },
    { key: 'binding', label: '装帧' },
    { key: 'source', label: '来源' },
    { key: 'rating', label: '评分' },
    { key: 'tags', label: '标签' },
    { key: 'shelf_name', label: '所在书架' },
];

// ==================== 主组件 ====================

const AllBooksManager: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();

    // ── 数据状态 ──
    const [books, setBooks] = useState<BookItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const isMounted = useRef(true);

    // ── 分页 / 筛选 / 排序 ──
    const [currentPage, setCurrentPage] = useState(1);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [sortBy, setSortBy] = useState('created_at_desc');
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
    const [filterSource, setFilterSource] = useState<FilterSource>('all');
    const [filterShelfId, setFilterShelfId] = useState<number | undefined>();

    // ── 选择 / 操作 ──
    const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [shelfList, setShelfList] = useState<ShelfOption[]>([]);

    // ── 内联编辑 ──
    const [editingRating, setEditingRating] = useState<{ id: number; val: number } | null>(null);
    const [editingTagsId, setEditingTagsId] = useState<number | null>(null);
    const [editTagsValue, setEditTagsValue] = useState('');

    // ── 模态框 ──
    const [batchShelfOpen, setBatchShelfOpen] = useState(false);
    const [batchShelfId, setBatchShelfId] = useState<number | null>(null);
    const [batchTagsOpen, setBatchTagsOpen] = useState(false);
    const [batchTagsValue, setBatchTagsValue] = useState('');
    const [batchTagsMode, setBatchTagsMode] = useState<'set' | 'add' | 'remove'>('add');

    // ── 列自定义 ──
    const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(() => {
        const saved = localStorage.getItem('admin_columns');
        return saved ? (JSON.parse(saved) as ColumnKey[]) : [...ALL_COLUMNS];
    });

    // ── 生命周期 ──
    useEffect(() => { isMounted.current = true; return () => { isMounted.current = false; }; }, []);

    useEffect(() => { loadShelfList(); }, []);

    const loadShelfList = useCallback(async () => {
        try {
            const data = await listShelves();
            if (isMounted.current) setShelfList(data || []);
        } catch { /* 静默 */ }
    }, []);

    // ── 数据加载 ──
    const parseSortParams = useCallback((value: string) => {
        const idx = value.lastIndexOf('_');
        return idx === -1 ? { field: value, order: 'asc' } : { field: value.substring(0, idx), order: value.substring(idx + 1) };
    }, []);

    const loadBooks = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { field, order } = parseSortParams(sortBy);
            const params: Record<string, unknown> = {
                sort_by: field, order, limit: PAGE_SIZE, offset: (currentPage - 1) * PAGE_SIZE,
            };
            if (searchKeyword.trim()) params.search = searchKeyword.trim();
            if (filterShelfId) params.shelf_id = filterShelfId;
            if (filterSource !== 'all') params.source = filterSource;

            const data = await getAllBooks(params);
            if (isMounted.current) {
                let booksData = data.books || [];
                if (filterStatus === 'in_shelf') booksData = booksData.filter((b: BookItem) => b.shelf_name);
                else if (filterStatus === 'not_in_shelf') booksData = booksData.filter((b: BookItem) => !b.shelf_name);
                setBooks(booksData);
                setTotal(data.total);
            }
        } catch (err: any) {
            if (isMounted.current) setError(err?.response?.data?.detail || '加载图书列表失败');
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, [currentPage, sortBy, filterStatus, filterSource, filterShelfId, searchKeyword, parseSortParams]);

    useEffect(() => { loadBooks(); }, [loadBooks]);

    // ── 防抖搜索 ──
    const debouncedSearch = useMemo(
        () => debounce((value: string) => { setSearchKeyword(value); setCurrentPage(1); }, SEARCH_DEBOUNCE_MS),
        [],
    );

    // ── 统计数据 ──
    const stats = useMemo(() => {
        const inShelf = books.filter((b) => b.shelf_name).length;
        return {
            inShelf, notInShelf: books.length - inShelf,
            doubanCount: books.filter((b) => b.source === 'douban').length,
            manualCount: books.filter((b) => b.source === 'manual').length,
            nedbCount: books.filter((b) => b.source === 'nedb_import').length,
        };
    }, [books]);

    // ── 删除操作 ──
    const handleDelete = useCallback(async (record: BookItem) => {
        setDeletingId(record.book_id);
        try {
            await deleteBook(record.book_id);
            message.success(`《${record.title}》已删除`);
            setBooks((prev) => prev.filter((b) => b.book_id !== record.book_id));
        } catch (err: any) {
            message.error(err?.response?.data?.detail || '删除失败');
        } finally {
            setDeletingId(null);
            loadBooks();
        }
    }, [loadBooks]);

    const handleBatchDelete = useCallback(async () => {
        if (selectedRowKeys.length === 0) return;
        const hide = message.loading(`正在删除 ${selectedRowKeys.length} 本图书...`, 0);
        let ok = 0, fail = 0;
        await Promise.all(selectedRowKeys.map(async (id) => {
            try { await deleteBook(Number(id)); ok++; } catch { fail++; }
        }));
        hide();
        if (fail === 0) message.success(`成功删除 ${ok} 本`);
        else message.warning(`删除完成：成功 ${ok} 本，失败 ${fail} 本`);
        setSelectedRowKeys([]);
        loadBooks();
    }, [selectedRowKeys, loadBooks]);

    const confirmBatchDelete = useCallback(() => {
        if (selectedRowKeys.length === 0) { message.warning('请先选择图书'); return; }
        Modal.confirm({
            title: '批量删除图书',
            icon: <ExclamationCircleOutlined style={{ color: 'var(--color-danger)' }} />,
            content: <Text>确定删除选中的 <Text strong type="danger">{selectedRowKeys.length}</Text> 本图书？此操作不可恢复。</Text>,
            okText: '确定删除', okType: 'danger', cancelText: '取消', centered: true,
            onOk: handleBatchDelete,
        });
    }, [selectedRowKeys, handleBatchDelete]);

    // ── 批量移动书架 ──
    const handleBatchMoveShelf = useCallback(async () => {
        if (!batchShelfId || selectedRowKeys.length === 0) return;
        // Call API for each book to add to shelf
        // Note: this uses the existing shelf_book logic; each book needs individual API call
        const hide = message.loading(`正在移动 ${selectedRowKeys.length} 本图书...`, 0);
        let ok = 0, fail = 0;
        await Promise.all(selectedRowKeys.map(async (bookId) => {
            try {
                await addBookToShelf(batchShelfId, Number(bookId));
                ok++;
            } catch { fail++; }
        }));
        hide();
        if (fail === 0) message.success(`成功移动 ${ok} 本图书`);
        else message.warning(`移动完成：成功 ${ok} 本，失败 ${fail} 本`);
        setBatchShelfOpen(false);
        setBatchShelfId(null);
        setSelectedRowKeys([]);
        loadBooks();
    }, [batchShelfId, selectedRowKeys, loadBooks]);

    // ── 批量修改标签 ──
    const handleBatchEditTags = useCallback(async () => {
        if (selectedRowKeys.length === 0) return;
        const tagsVal = batchTagsValue.trim();
        if (!tagsVal && batchTagsMode === 'add') { message.warning('请输入标签'); return; }

        const hide = message.loading(`正在更新 ${selectedRowKeys.length} 本图书的标签...`, 0);

        // Read current tags for each book, modify, then update
        const booksToUpdate = books.filter((b) => selectedRowKeys.includes(b.book_id));
        let ok = 0, fail = 0;

        await Promise.all(booksToUpdate.map(async (book) => {
            try {
                let newTags: string[];
                const currentTags = (book.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
                if (batchTagsMode === 'set') {
                    newTags = tagsVal.split(',').map((t) => t.trim()).filter(Boolean);
                } else if (batchTagsMode === 'add') {
                    const addTags = tagsVal.split(',').map((t) => t.trim()).filter(Boolean);
                    newTags = [...new Set([...currentTags, ...addTags])];
                } else {
                    const removeTags = tagsVal.split(',').map((t) => t.trim()).filter(Boolean);
                    newTags = currentTags.filter((t) => !removeTags.includes(t));
                }
                await updateBookManual(book.book_id, { tags: newTags.join(', ') });
                ok++;
            } catch { fail++; }
        }));

        hide();
        if (fail === 0) message.success(`成功更新 ${ok} 本图书标签`);
        else message.warning(`标签更新完成：成功 ${ok} 本，失败 ${fail} 本`);
        setBatchTagsOpen(false);
        setBatchTagsValue('');
        setSelectedRowKeys([]);
        loadBooks();
    }, [selectedRowKeys, books, batchTagsValue, batchTagsMode, loadBooks]);

    // ── 内联编辑评分 ──
    const handleSaveRating = useCallback(async (record: BookItem, value: number) => {
        try {
            await updateBookManual(record.book_id, { rating: String(value) });
            message.success(`《${record.title}》评分已更新`);
            setEditingRating(null);
            loadBooks();
        } catch (err: any) {
            message.error(err?.response?.data?.detail || '更新失败');
            setEditingRating(null);
        }
    }, [loadBooks]);

    // ── 内联编辑标签 ──
    const handleSaveTags = useCallback(async (record: BookItem) => {
        try {
            await updateBookManual(record.book_id, { tags: editTagsValue });
            message.success(`《${record.title}》标签已更新`);
            setEditingTagsId(null);
            loadBooks();
        } catch (err: any) {
            message.error(err?.response?.data?.detail || '更新失败');
            setEditingTagsId(null);
        }
    }, [editTagsValue, loadBooks]);

    // ── 批量菜单 ──
    const batchMenuItems: MenuProps['items'] = [
        { key: 'delete', icon: <DeleteOutlined />, label: `批量删除 (${selectedRowKeys.length})`, danger: true, onClick: confirmBatchDelete },
        { key: 'shelf', icon: <SwapOutlined />, label: `移动到书架 (${selectedRowKeys.length})`, onClick: () => setBatchShelfOpen(true) },
        { key: 'tags', icon: <TagsOutlined />, label: `批量修改标签 (${selectedRowKeys.length})`, onClick: () => setBatchTagsOpen(true) },
        { type: 'divider' },
        { key: 'export', icon: <ExportOutlined />, label: selectedRowKeys.length > 0 ? '导出选中' : '导出当前页', onClick: () => handleExport() },
        { key: 'clear', icon: <ClearOutlined />, label: '清除选择', disabled: selectedRowKeys.length === 0, onClick: () => setSelectedRowKeys([]) },
    ];

    // ── 列自定义菜单 ──
    const columnMenuItems: MenuProps['items'] = ALL_COLUMNS
        .filter((k) => k !== 'actions')
        .map((key) => ({
            key,
            label: (
                <Checkbox checked={visibleColumns.includes(key)} onChange={() => toggleColumn(key)}>
                    {COLUMN_LABELS[key]}
                </Checkbox>
            ),
        }));

    const toggleColumn = (key: ColumnKey) => {
        setVisibleColumns((prev) => {
            const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
            localStorage.setItem('admin_columns', JSON.stringify(next));
            return next;
        });
    };

    // ── 导出 ──
    const handleExport = useCallback(() => {
        const exportData = selectedRowKeys.length > 0
            ? books.filter((b) => selectedRowKeys.includes(b.book_id))
            : books;

        const headers = CSV_FIELDS.map((f) => f.label);
        const rows = exportData.map((b) =>
            CSV_FIELDS.map((f) => {
                const val = (b as any)[f.key] ?? '';
                return `"${String(val).replace(/"/g, '""')}"`;
            }).join(','),
        );

        const csv = ['﻿' + headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `books_export_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        message.success(`已导出 ${exportData.length} 条记录`);
    }, [books, selectedRowKeys]);

    // ── 表格列定义 ──
    const columns: TableColumnsType<BookItem> = useMemo(() => {
        const allCols: TableColumnsType<BookItem> = [];

        if (visibleColumns.includes('cover')) {
            allCols.push({
                title: '封面', key: 'cover', width: 60, align: 'center', fixed: 'left',
                render: (_: unknown, record: BookItem) => (
                    <UnifiedCover
                        book={record}
                        mode="lazy"
                        width={40}
                        aspectRatio="40/56"
                        borderRadius={4}
                        shadow={false}
                    />
                ),
            });
        }
        if (visibleColumns.includes('title')) {
            allCols.push({
                title: '书名', dataIndex: 'title', key: 'title', width: 260, ellipsis: true, sorter: true,
                render: (title: string, record: BookItem) => {
                    const path = record.shelf_id ? `/shelf/${record.shelf_id}/book/${record.book_id}` : `/shelf/1/book/${record.book_id}`;
                    return <a onClick={() => navigate(path)} style={{ fontWeight: 500 }} title={title}>{title}</a>;
                },
            });
        }
        if (visibleColumns.includes('isbn')) {
            allCols.push({
                title: 'ISBN', dataIndex: 'isbn', key: 'isbn', width: 150,
                render: (isbn: string) => <Text code style={{ fontSize: 11 }} copyable>{isbn}</Text>,
            });
        }
        if (visibleColumns.includes('author')) {
            allCols.push({
                title: '作者', dataIndex: 'author', key: 'author', width: 130, ellipsis: true,
                render: (author: string) => author || <Text type="secondary" italic>未知</Text>,
            });
        }
        if (visibleColumns.includes('publisher')) {
            allCols.push({
                title: '出版社', dataIndex: 'publisher', key: 'publisher', width: 140, ellipsis: true,
                render: (v: string) => v || <Text type="secondary">-</Text>,
            });
        }
        if (visibleColumns.includes('publish_date')) {
            allCols.push({
                title: '出版日期', dataIndex: 'publish_date', key: 'publish_date', width: 100, align: 'center',
                render: (v: string) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">-</Text>,
            });
        }
        if (visibleColumns.includes('price')) {
            allCols.push({
                title: '价格', dataIndex: 'price', key: 'price', width: 80, align: 'right',
                render: (v: string) => v ? <Text style={{ fontSize: 12 }}>¥{v}</Text> : <Text type="secondary">-</Text>,
            });
        }
        if (visibleColumns.includes('source')) {
            allCols.push({
                title: '来源', dataIndex: 'source', key: 'source', width: 90, align: 'center',
                filters: Object.entries(SOURCE_CONFIG).map(([v, cfg]) => ({ text: cfg.label, value: v })),
                onFilter: (value, record) => record.source === value,
                render: (source: string) => {
                    const cfg = SOURCE_CONFIG[source] || { color: 'default', label: source };
                    return <Tag color={cfg.color} style={{ borderRadius: 10, margin: 0, fontSize: 11 }}>{cfg.label}</Tag>;
                },
            });
        }
        if (visibleColumns.includes('rating')) {
            allCols.push({
                title: '评分', dataIndex: 'rating', key: 'rating', width: 110, align: 'center',
                sorter: (a, b) => parseFloat(a.rating || '0') - parseFloat(b.rating || '0'),
                render: (rating: string, record: BookItem) => {
                    if (editingRating && editingRating.id === record.book_id) {
                        return (
                            <Space size={4}>
                                <InputNumber
                                    min={0} max={10} step={0.5}
                                    value={editingRating.val}
                                    onChange={(v) => setEditingRating({ id: record.book_id, val: v ?? 0 })}
                                    size="small" style={{ width: 70 }} autoFocus
                                    onPressEnter={() => handleSaveRating(record, editingRating.val)}
                                />
                                <Button size="small" type="link" onClick={() => handleSaveRating(record, editingRating.val)}>保存</Button>
                                <Button size="small" type="link" onClick={() => setEditingRating(null)}>取消</Button>
                            </Space>
                        );
                    }
                    const num = parseFloat(rating);
                    return (
                        <Tooltip title="点击编辑评分">
                            <span
                                onClick={() => setEditingRating({ id: record.book_id, val: isNaN(num) ? 0 : num })}
                                style={{ cursor: 'pointer' }}
                            >
                                {!isNaN(num) ? (
                                    <Badge count={rating} style={{ backgroundColor: 'var(--color-accent-amber)' }} />
                                ) : (
                                    <Text type="secondary" style={{ fontSize: 11 }}>点击评分</Text>
                                )}
                            </span>
                        </Tooltip>
                    );
                },
            });
        }
        if (visibleColumns.includes('tags')) {
            allCols.push({
                title: '标签', dataIndex: 'tags', key: 'tags', width: 160, ellipsis: true,
                render: (tags: string, record: BookItem) => {
                    if (editingTagsId === record.book_id) {
                        return (
                            <Space size={4}>
                                <Input
                                    size="small" style={{ width: 120 }}
                                    value={editTagsValue}
                                    onChange={(e) => setEditTagsValue(e.target.value)}
                                    placeholder="逗号分隔" autoFocus
                                    onPressEnter={() => handleSaveTags(record)}
                                />
                                <Button size="small" type="link" onClick={() => handleSaveTags(record)}>保存</Button>
                                <Button size="small" type="link" onClick={() => setEditingTagsId(null)}>取消</Button>
                            </Space>
                        );
                    }
                    const tagList = (tags || '').split(',').map((t) => t.trim()).filter(Boolean);
                    return (
                        <Tooltip title="点击编辑标签">
                            <span
                                onClick={() => { setEditingTagsId(record.book_id); setEditTagsValue(tags || ''); }}
                                style={{ cursor: 'pointer' }}
                            >
                                {tagList.length > 0
                                    ? tagList.slice(0, 3).map((t, i) => (
                                        <Tag key={i} style={{ margin: '1px', borderRadius: 8, fontSize: 11 }}>{t}</Tag>
                                    ))
                                    : <Text type="secondary" style={{ fontSize: 11 }}>点击添加</Text>
                                }
                                {tagList.length > 3 && <Text type="secondary" style={{ fontSize: 10 }}> +{tagList.length - 3}</Text>}
                            </span>
                        </Tooltip>
                    );
                },
            });
        }
        if (visibleColumns.includes('shelf')) {
            allCols.push({
                title: '所在书架', dataIndex: 'shelf_name', key: 'shelf', width: 140, ellipsis: true,
                filters: shelfList.map((s) => ({ text: s.shelf_name, value: s.logical_shelf_id })),
                onFilter: (value, record) => record.shelf_id === value,
                render: (shelfName: string, record: BookItem) =>
                    shelfName && record.shelf_id ? (
                        <Tooltip title={`跳转到「${shelfName}」`}>
                            <Tag color="blue" icon={<EnvironmentOutlined />}
                                style={{ cursor: 'pointer', borderRadius: 10, margin: 0 }}
                                onClick={(e) => { e.stopPropagation(); navigate(`/shelf/${record.shelf_id}`); }}
                            >{shelfName}</Tag>
                        </Tooltip>
                    ) : (
                        <Tag color="default" icon={<CloseCircleOutlined />} style={{ borderRadius: 10, margin: 0 }}>未上架</Tag>
                    ),
            });
        }
        if (visibleColumns.includes('actions')) {
            allCols.push({
                title: '操作', key: 'actions', width: 170, fixed: 'right',
                render: (_: unknown, record: BookItem) => {
                    const detailPath = record.shelf_id ? `/shelf/${record.shelf_id}/book/${record.book_id}` : `/shelf/1/book/${record.book_id}`;
                    return (
                        <Space size={2}>
                            <Tooltip title="详情"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => navigate(detailPath)} style={{ color: token.colorPrimary }} /></Tooltip>
                            <Tooltip title="编辑"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => navigate(`/books/edit/${record.book_id}`)} style={{ color: 'var(--color-accent-blue)' }} /></Tooltip>
                            <Tooltip title="评分">
                                <Button type="text" size="small" icon={<StarOutlined />}
                                    onClick={() => {
                                        const num = parseFloat(record.rating || '0');
                                        setEditingRating({ id: record.book_id, val: isNaN(num) ? 0 : num });
                                    }}
                                    style={{ color: 'var(--color-accent-amber)' }}
                                />
                            </Tooltip>
                            <Popconfirm
                                title={`确定删除《${record.title}》？`}
                                description="此操作不可恢复"
                                onConfirm={() => handleDelete(record)}
                                okText="确定" cancelText="取消"
                                okButtonProps={{ danger: true }}
                            >
                                <Button type="text" size="small" danger icon={<DeleteOutlined />} loading={deletingId === record.book_id} />
                            </Popconfirm>
                        </Space>
                    );
                },
            });
        }

        return allCols;
    }, [visibleColumns, editingRating, editingTagsId, editTagsValue, deletingId, shelfList, token, navigate, handleDelete, handleSaveRating, handleSaveTags]);

    // ── 分页 ──
    const paginationConfig: TablePaginationConfig = {
        current: currentPage,
        pageSize: PAGE_SIZE,
        total,
        onChange: (page) => setCurrentPage(page),
        showSizeChanger: true,
        pageSizeOptions: ['50', '100', '200', '500'],
        showQuickJumper: true,
        showTotal: (t, range) => (
            <Text type="secondary" style={{ fontSize: 12 }}>
                共 <Text strong>{t}</Text> 本，显示 {range[0]}-{range[1]}
            </Text>
        ),
    };

    // ── 渲染 ──
    if (error) {
        return (
            <Result status="error" title="加载失败" subTitle={error}
                extra={<Button type="primary" icon={<ReloadOutlined />} onClick={loadBooks}>重试</Button>}
            />
        );
    }

    return (
        <div style={{ maxWidth: 1800, margin: '0 auto', padding: 24 }}>
            {/* 面包屑 */}
            <Breadcrumb style={{ marginBottom: 16 }}
                items={[
                    { title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> },
                    { title: <a onClick={() => navigate('/admin')}>管理</a> },
                    { title: '全部图书' },
                ]}
            />

            {/* 头部 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <div>
                    <Title level={3} style={{ margin: 0 }}><BookOutlined style={{ marginRight: 10, color: token.colorPrimary }} />全部图书管理</Title>
                    <Text type="secondary" style={{ display: 'block', marginTop: 2 }}>管理所有已录入图书 · 共 <Text strong>{total}</Text> 本</Text>
                </div>
                <Space wrap>
                    <Button icon={<ReloadOutlined />} onClick={loadBooks} loading={loading} style={{ borderRadius: 8 }}>刷新</Button>
                    <Dropdown menu={{ items: columnMenuItems }} trigger={['click']}>
                        <Button icon={<SettingOutlined />} style={{ borderRadius: 8 }}>列设置</Button>
                    </Dropdown>
                    <Button icon={<DownloadOutlined />} onClick={handleExport} style={{ borderRadius: 8 }}>导出</Button>
                    {selectedRowKeys.length > 0 && (
                        <Dropdown menu={{ items: batchMenuItems }}>
                            <Button danger icon={<DeleteOutlined />} style={{ borderRadius: 8 }}>
                                批量操作 ({selectedRowKeys.length})
                            </Button>
                        </Dropdown>
                    )}
                </Space>
            </div>

            {/* 统计卡片 */}
            <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 12, background: 'var(--color-accent-blue-bg)', border: '1px solid var(--color-accent-blue-border)' }}><Statistic title="图书总数" value={total} prefix={<BookOutlined style={{ color: 'var(--color-accent-blue)' }} />} styles={{ content: { color: 'var(--color-accent-blue)', fontSize: 22 } }} /></Card></Col>
                <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 12, background: 'var(--color-accent-green-bg)', border: '1px solid var(--color-accent-green-border)' }}><Statistic title="豆瓣来源" value={stats.doubanCount} prefix={<SyncOutlined style={{ color: 'var(--color-accent-green)' }} />} styles={{ content: { color: 'var(--color-accent-green)', fontSize: 22 } }} suffix={<Text style={{ fontSize: 12 }}>/ {total}</Text>} /></Card></Col>
                <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 12, background: 'var(--color-accent-purple-bg)', border: '1px solid var(--color-accent-purple-border)' }}><Statistic title="已上架" value={stats.inShelf} prefix={<CheckCircleOutlined style={{ color: 'var(--color-accent-purple)' }} />} styles={{ content: { color: 'var(--color-accent-purple)', fontSize: 22 } }} suffix={<Text style={{ fontSize: 12 }}>/ {total}</Text>} /></Card></Col>
                <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 12, background: 'var(--color-accent-cyan-bg)', border: '1px solid var(--color-accent-cyan-border)' }}><Statistic title="NeDB导入" value={stats.nedbCount} prefix={<DownloadOutlined style={{ color: 'var(--color-accent-cyan)' }} />} styles={{ content: { color: 'var(--color-accent-cyan)', fontSize: 22 } }} suffix={<Text style={{ fontSize: 12 }}>/ {total}</Text>} /></Card></Col>
            </Row>

            {/* 筛选工具栏 */}
            <Card style={{ marginBottom: 20, borderRadius: 12, border: `1px solid ${token.colorBorderSecondary}` }}
                styles={{ body: { padding: '12px 16px' } }}>
                <Space wrap size="middle">
                    <Input.Search
                        placeholder="搜索书名/作者/ISBN/出版社/标签..."
                        allowClear
                        defaultValue={searchKeyword}
                        onChange={(e) => debouncedSearch(e.target.value)}
                        onSearch={(value) => { setSearchKeyword(value || ''); setCurrentPage(1); }}
                        style={{ width: 300 }}
                        prefix={<SearchOutlined />}
                    />
                    <Segmented
                        options={[
                            { label: '全部', value: 'all' },
                            { label: `已上架 (${stats.inShelf})`, value: 'in_shelf' },
                            { label: `未上架 (${stats.notInShelf})`, value: 'not_in_shelf' },
                        ]}
                        value={filterStatus}
                        onChange={(v) => { setFilterStatus(v as FilterStatus); setCurrentPage(1); }}
                    />
                    <Select value={filterSource}
                        onChange={(v) => { setFilterSource(v as FilterSource); setCurrentPage(1); }}
                        style={{ width: 130 }}
                        options={[
                            { value: 'all', label: '全部来源' },
                            { value: 'douban', label: `豆瓣 (${stats.doubanCount})` },
                            { value: 'manual', label: `手动 (${stats.manualCount})` },
                            { value: 'nedb_import', label: `NeDB (${stats.nedbCount})` },
                            { value: 'isbn', label: 'ISBN' },
                            { value: 'nfc', label: 'NFC' },
                        ]}
                    />
                    <Select value={filterShelfId || 0}
                        onChange={(v) => { setFilterShelfId(v === 0 ? undefined : v); setCurrentPage(1); }}
                        style={{ width: 150 }}
                        options={[
                            { value: 0, label: '全部书架' },
                            ...shelfList.map((s) => ({ value: s.logical_shelf_id, label: s.shelf_name })),
                        ]}
                    />
                    <Select value={sortBy}
                        onChange={(v) => { setSortBy(v); setCurrentPage(1); }}
                        style={{ width: 130 }}
                        options={SORT_OPTIONS}
                    />
                </Space>
            </Card>

            {/* 表格 */}
            <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,.04)', border: `1px solid ${token.colorBorderSecondary}` }}>
                <Table<BookItem>
                    columns={columns}
                    dataSource={books}
                    rowKey="book_id"
                    loading={loading}
                    rowSelection={{
                        selectedRowKeys,
                        onChange: setSelectedRowKeys,
                        preserveSelectedRowKeys: false,
                    }}
                    pagination={paginationConfig}
                    locale={{
                        emptyText: (
                            <Empty image={<BookOutlined style={{ fontSize: 48, color: 'var(--app-brand-color-hover)' }} />} description="暂无图书数据" />
                        ),
                    }}
                    scroll={{ x: 'max-content' }}
                    size="small"
                    showSorterTooltip={{ target: 'full-header' }}
                />
            </Card>

            {/* 批量移动书架弹窗 */}
            <Modal title="批量移动到书架" open={batchShelfOpen} onOk={handleBatchMoveShelf}
                onCancel={() => { setBatchShelfOpen(false); setBatchShelfId(null); }}
                okText="确认移动" cancelText="取消" okButtonProps={{ disabled: !batchShelfId }}
            >
                <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                    将选中的 {selectedRowKeys.length} 本图书移动到指定书架
                </Text>
                <Select
                    value={batchShelfId}
                    onChange={(v) => setBatchShelfId(v)}
                    style={{ width: '100%' }}
                    placeholder="选择目标书架"
                    options={shelfList.map((s) => ({ value: s.logical_shelf_id, label: s.shelf_name }))}
                />
            </Modal>

            {/* 批量修改标签弹窗 */}
            <Modal title="批量修改标签" open={batchTagsOpen} onOk={handleBatchEditTags}
                onCancel={() => { setBatchTagsOpen(false); setBatchTagsValue(''); }}
                okText="确认更新" cancelText="取消"
            >
                <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                    为选中的 {selectedRowKeys.length} 本图书修改标签
                </Text>
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <Segmented
                        options={[
                            { value: 'add', label: '添加' },
                            { value: 'remove', label: '移除' },
                            { value: 'set', label: '替换' },
                        ]}
                        value={batchTagsMode}
                        onChange={(v) => setBatchTagsMode(v as 'set' | 'add' | 'remove')}
                    />
                    <Input
                        placeholder={batchTagsMode === 'add' ? '输入要添加的标签（逗号分隔）' : batchTagsMode === 'remove' ? '输入要移除的标签（逗号分隔）' : '输入新标签（逗号分隔）'}
                        value={batchTagsValue}
                        onChange={(e) => setBatchTagsValue(e.target.value)}
                    />
                </Space>
            </Modal>
        </div>
    );
};

export default AllBooksManager;
