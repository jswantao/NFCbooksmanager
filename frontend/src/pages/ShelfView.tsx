// frontend/src/pages/ShelfView.tsx
/**
 * 书架浏览页面 — 增强版
 *
 * 新增:
 * - 书架容量可视化 + 阅读统计
 * - 物理位置可点击跳转
 * - 视图密度切换: 2/3/4/5列网格 | 列表 | 紧凑
 * - 高级筛选面板: 作者/出版社/年份/评分区间
 * - 批量操作: 多选→批量移动/删除
 * - 排序持久化: localStorage记忆
 * - 移动端响应式: 44px按钮
 */

import React, { useEffect, useState, useCallback, useMemo, useRef, type FC, type Key } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Card, Row, Col, Empty, Tag, Badge, Space, Input, Segmented, Typography, Button,
    Select, Dropdown, message, Popconfirm, Tooltip, Modal, Breadcrumb, FloatButton,
    Skeleton, Alert, theme, Progress, Statistic, InputNumber, type MenuProps,
} from 'antd';
import {
    SearchOutlined, EnvironmentOutlined, BookOutlined, AppstoreOutlined,
    UnorderedListOutlined, SortAscendingOutlined, PlusOutlined, SwapOutlined,
    DeleteOutlined, EditOutlined, ExclamationCircleOutlined, ReloadOutlined,
    FilterOutlined, HomeOutlined, RightOutlined, LeftOutlined, EyeOutlined,
    ClearOutlined, BarChartOutlined, CheckSquareOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { getShelfBooks, removeBookFromShelf, listShelves, moveBookToShelf, extractErrorMessage, addBookToShelf } from '../services/api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';
import BookCard from '../components/BookCard';
import ShelfSelector from '../components/ShelfSelector';
import type { Book, ShelfBooks, ShelfInfo } from '../types';

const { Title, Text, Paragraph } = Typography;

// ==================== 常量 ====================

const SORT_OPTIONS = [
    { value: 'sort_order', label: '默认排序' },
    { value: 'title', label: '书名' },
    { value: 'author', label: '作者' },
    { value: 'added_at', label: '添加时间' },
    { value: 'rating', label: '评分' },
    { value: 'publish_date', label: '出版时间' },
];

// ==================== 主组件 ====================

const ShelfView: FC = () => {
    const { shelfId } = useParams<{ shelfId: string }>();
    const navigate = useNavigate();
    const { token } = theme.useToken();

    const [currentShelfId, setCurrentShelfId] = useState(() => { const p = parseInt(shelfId || '1'); return isNaN(p) ? 1 : p; });
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');
    const [gridCols, setGridCols] = useState<number>(() => { try { return parseInt(localStorage.getItem('shelf_grid_cols') || '4'); } catch { return 4; } });
    const [searchKeyword, setSearchKeyword] = useState('');
    const [sortBy, setSortBy] = useState(() => localStorage.getItem(`shelf_sort_${shelfId}`) || 'sort_order');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    // 高级筛选
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [filterAuthor, setFilterAuthor] = useState('');
    const [filterPublisher, setFilterPublisher] = useState('');
    const [filterYearMin, setFilterYearMin] = useState<number | null>(null);
    const [filterYearMax, setFilterYearMax] = useState<number | null>(null);
    const [filterRatingMin, setFilterRatingMin] = useState<number | null>(null);

    // 数据
    const [shelfData, setShelfData] = useState<ShelfBooks | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [allShelves, setAllShelves] = useState<ShelfInfo[]>([]);

    // 批量操作
    const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);

    // 移动
    const [moveModalOpen, setMoveModalOpen] = useState(false);
    const [selectedBook, setSelectedBook] = useState<Book | null>(null);
    const [targetShelfId, setTargetShelfId] = useState<number | null>(null);
    const [targetShelfOptions, setTargetShelfOptions] = useState<{ value: number; label: string }[]>([]);
    const [showShelfSelector, setShowShelfSelector] = useState(false);

    const debouncedKeyword = useDebouncedValue(searchKeyword, 250);
    const isMountedRef = useRef(true);

    // ── 路由同步 ──
    useEffect(() => { if (shelfId) { const p = parseInt(shelfId); if (!isNaN(p)) { setCurrentShelfId(p); setSearchKeyword(''); setSelectedKeys([]); } } }, [shelfId]);
    useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

    // ── 加载数据 ──
    useEffect(() => { let c = false; (async () => { try { const d = await listShelves(); if (!c) setAllShelves(d || []); } catch {} })(); return () => { c = true; }; }, []);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true); setError(null);
            try {
                const data = await getShelfBooks(currentShelfId, sortBy, sortOrder);
                if (!cancelled) setShelfData(data);
            } catch (err: any) { if (!cancelled) setError(extractErrorMessage(err) || '加载失败'); }
            finally { if (!cancelled) setLoading(false); }
        };
        load();
        return () => { cancelled = true; };
    }, [currentShelfId, sortBy, sortOrder]);

    const refreshBooks = useCallback(async () => {
        try { setShelfData(await getShelfBooks(currentShelfId, sortBy, sortOrder)); }
        catch (err: any) { message.error(extractErrorMessage(err) || '刷新失败'); }
    }, [currentShelfId, sortBy, sortOrder]);

    // 键盘快捷键
    useKeyboardShortcut('ArrowLeft', () => { const i = allShelves.findIndex(s => s.logical_shelf_id === currentShelfId); if (i > 0) navigate(`/shelf/${allShelves[i - 1].logical_shelf_id}`); }, { enabled: allShelves.length > 1 });
    useKeyboardShortcut('ArrowRight', () => { const i = allShelves.findIndex(s => s.logical_shelf_id === currentShelfId); if (i < allShelves.length - 1) navigate(`/shelf/${allShelves[i + 1].logical_shelf_id}`); }, { enabled: allShelves.length > 1 });

    // ── 排序持久化 ──
    const handleSortChange = useCallback((v: string) => { setSortBy(v); localStorage.setItem(`shelf_sort_${currentShelfId}`, v); }, [currentShelfId]);
    const handleGridColsChange = useCallback((v: number) => { setGridCols(v); localStorage.setItem('shelf_grid_cols', String(v)); }, []);

    // ── 筛选 ──
    const filteredBooks = useMemo(() => {
        if (!shelfData?.books) return [];
        let result = shelfData.books;
        const kw = debouncedKeyword.toLowerCase().trim();
        if (kw) result = result.filter((b: Book) => (b.title || '').toLowerCase().includes(kw) || (b.author || '').toLowerCase().includes(kw) || (b.isbn || '').includes(kw) || (b.publisher || '').toLowerCase().includes(kw));
        if (filterAuthor) result = result.filter((b: Book) => (b.author || '').toLowerCase().includes(filterAuthor.toLowerCase()));
        if (filterPublisher) result = result.filter((b: Book) => (b.publisher || '').toLowerCase().includes(filterPublisher.toLowerCase()));
        if (filterYearMin !== null) result = result.filter((b: Book) => { const y = parseInt((b.publish_date || '').slice(0, 4)); return !isNaN(y) && y >= filterYearMin!; });
        if (filterYearMax !== null) result = result.filter((b: Book) => { const y = parseInt((b.publish_date || '').slice(0, 4)); return !isNaN(y) && y <= filterYearMax!; });
        if (filterRatingMin !== null) result = result.filter((b: Book) => { const r = parseFloat(b.rating || '0'); return r >= filterRatingMin!; });
        return result;
    }, [shelfData, debouncedKeyword, filterAuthor, filterPublisher, filterYearMin, filterYearMax, filterRatingMin]);

    const hasAdvancedFilter = filterAuthor || filterPublisher || filterYearMin !== null || filterYearMax !== null || filterRatingMin !== null;
    const clearAdvanced = () => { setFilterAuthor(''); setFilterPublisher(''); setFilterYearMin(null); setFilterYearMax(null); setFilterRatingMin(null); };

    // ── 操作 ──
    const handleMoveBook = useCallback(async () => { if (!selectedBook || !targetShelfId) return; try { await moveBookToShelf(currentShelfId, selectedBook.book_id, targetShelfId); message.success('已移动'); setMoveModalOpen(false); refreshBooks(); } catch (err: any) { message.error(extractErrorMessage(err) || '移动失败'); } }, [selectedBook, targetShelfId, currentShelfId, refreshBooks]);

    const handleRemoveBook = useCallback(async (book: Book) => { try { await removeBookFromShelf(currentShelfId, book.book_id); message.success('已移除'); refreshBooks(); } catch (err: any) { message.error(extractErrorMessage(err) || '移除失败'); } }, [currentShelfId, refreshBooks]);

    const handleBatchMove = useCallback(async () => {
        if (!selectedKeys.length || !targetShelfId) return;
        const hide = message.loading('移动中...', 0); let ok = 0, fail = 0;
        await Promise.all(selectedKeys.map(async (id) => { try { await moveBookToShelf(currentShelfId, Number(id), targetShelfId); ok++; } catch { fail++; } }));
        hide();
        if (fail) message.warning(`完成: 成功 ${ok}, 失败 ${fail}`); else message.success(`成功移动 ${ok} 本`);
        setSelectedKeys([]); setMoveModalOpen(false); refreshBooks();
    }, [selectedKeys, targetShelfId, currentShelfId, refreshBooks]);

    const handleBatchRemove = useCallback(() => {
        if (!selectedKeys.length) return;
        Modal.confirm({ title: '批量移除', icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />, content: `确定移除选中的 ${selectedKeys.length} 本图书？`, okText: '移除', okType: 'danger', cancelText: '取消', centered: true,
            onOk: async () => {
                const hide = message.loading('移除中...', 0); let ok = 0;
                await Promise.all(selectedKeys.map(async (id) => { try { await removeBookFromShelf(currentShelfId, Number(id)); ok++; } catch {} }));
                hide(); message.success(`成功移除 ${ok} 本`); setSelectedKeys([]); refreshBooks();
            } });
    }, [selectedKeys, currentShelfId, refreshBooks]);

    const currentIndex = useMemo(() => allShelves.findIndex(s => s.logical_shelf_id === currentShelfId), [allShelves, currentShelfId]);

    const shelfSelectOptions = useMemo(() => allShelves.map(s => ({ value: s.logical_shelf_id, label: <Space size={4}><BookOutlined style={{ color: token.colorPrimary }} />{s.shelf_name}<Tag color="blue" style={{ fontSize: 10, margin: 0 }}>{s.book_count}</Tag></Space> })), [allShelves, token]);

    // ── 容量 ──
    const capacity = useMemo(() => {
        const total = shelfData?.total_count || 0;
        const max = Math.max(total, 50);
        return { total, max, pct: Math.min(100, Math.round((total / max) * 100)), overLimit: total > 200 };
    }, [shelfData]);

    // ── 加载状态 ──
    if (loading && !shelfData) return (
        <div style={{ maxWidth: 1500, margin: '0 auto', padding: 24 }}>
            <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 16 }} />
            <Row gutter={[16, 16]}>{Array.from({ length: 8 }).map((_, i) => (<Col xs={12} sm={8} md={6} lg={24 / gridCols} key={i}><Card style={{ borderRadius: 12 }}><Skeleton.Image active style={{ width: '100%', height: 240, borderRadius: 10 }} /><Skeleton active paragraph={{ rows: 2 }} /></Card></Col>))}</Row>
        </div>
    );
    if (error && !shelfData) return (<div style={{ maxWidth: 1500, margin: '0 auto', padding: 24 }}><Alert title="加载失败" description={error} type="error" showIcon style={{ borderRadius: 10 }} action={<Button size="small" onClick={refreshBooks}>重试</Button>} /></div>);
    if (!shelfData) return null;

    return (
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: 'clamp(12px,3vw,24px)' }}>
            {/* 导航 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <Breadcrumb items={[{ title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> }, { title: shelfData.shelf_name }]} />
                {allShelves.length > 1 && (
                    <Space size={4}>
                        <Tooltip title="上一个 (←)"><Button icon={<LeftOutlined />} disabled={currentIndex <= 0} onClick={() => navigate(`/shelf/${allShelves[currentIndex - 1].logical_shelf_id}`)} size="small" style={{ minHeight: 44 }} /></Tooltip>
                        <Select value={currentShelfId} onChange={(v) => navigate(`/shelf/${v}`)} style={{ minWidth: 200 }} size="middle" showSearch options={shelfSelectOptions as any}
                            filterOption={(input, option: any) => option?.label?.props?.children?.[1]?.toLowerCase?.()?.includes(input.toLowerCase()) ?? false} />
                        <Tooltip title="下一个 (→)"><Button icon={<RightOutlined />} disabled={currentIndex >= allShelves.length - 1} onClick={() => navigate(`/shelf/${allShelves[currentIndex + 1].logical_shelf_id}`)} size="small" style={{ minHeight: 44 }} /></Tooltip>
                        <Text type="secondary" style={{ fontSize: 11 }}>{currentIndex + 1}/{allShelves.length}</Text>
                    </Space>
                )}
            </div>

            {/* 书架信息 */}
            <Card style={{ marginBottom: 20, background: `linear-gradient(135deg,${token.colorPrimaryBg},#fef3c7)`, borderLeft: `4px solid ${token.colorPrimary}`, borderRadius: 14 }}>
                <Row justify="space-between" align="middle" wrap>
                    <Col>
                        <Title level={2} style={{ margin: 0 }}><BookOutlined style={{ color: token.colorPrimary }} /> {shelfData.shelf_name}</Title>
                        {shelfData.description && <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0, marginLeft: 34 }} ellipsis={{ rows: 2 }}>{shelfData.description}</Paragraph>}
                        {shelfData.physical_info && (
                            <Space style={{ marginLeft: 34, marginTop: 6 }} size={6}>
                                <Tag color="green" icon={<EnvironmentOutlined />} style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/physical-shelves')}>{shelfData.physical_info.physical_location}</Tag>
                                <Badge status="processing" text="已映射" />
                            </Space>
                        )}
                    </Col>
                    <Col>
                        <Row gutter={[24, 12]} align="middle">
                            <Col><Statistic title="本架藏书" value={capacity.total} valueStyle={{ color: token.colorPrimary, fontSize: 28, fontWeight: 700 }} /></Col>
                            <Col>
                                <div style={{ width: 100 }}><Progress percent={capacity.pct} size="small" status={capacity.overLimit ? 'exception' : 'active'} strokeColor={capacity.pct > 80 ? '#f59e0b' : token.colorPrimary} /></div>
                                <Text type="secondary" style={{ fontSize: 11 }}>容量 {capacity.pct}%</Text>
                            </Col>
                            {debouncedKeyword && <Col><Statistic title="筛选结果" value={filteredBooks.length} valueStyle={{ color: token.colorWarning, fontSize: 22, fontWeight: 600 }} /></Col>}
                        </Row>
                    </Col>
                </Row>
            </Card>

            {/* 工具栏 */}
            <Card style={{ marginBottom: 20, borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}` }} styles={{ body: { padding: '12px 18px' } }}>
                <Row justify="space-between" wrap gutter={[12, 10]}>
                    <Col><Space wrap size={8}>
                        <Input.Search placeholder="搜索书名/作者/ISBN" allowClear value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} style={{ width: 240 }} prefix={<SearchOutlined />} />
                        <Select value={sortBy} onChange={handleSortChange} style={{ width: 120 }} options={SORT_OPTIONS} />
                        <Button icon={<SortAscendingOutlined rotate={sortOrder === 'desc' ? 180 : 0} />} onClick={() => setSortOrder(p => p === 'asc' ? 'desc' : 'asc')} style={{ minHeight: 44 }}>{sortOrder === 'asc' ? '升序' : '降序'}</Button>
                        <Button icon={<FilterOutlined />} type={showAdvanced || hasAdvancedFilter ? 'primary' : 'default'} onClick={() => setShowAdvanced(v => !v)} style={{ minHeight: 44 }}>{hasAdvancedFilter ? `筛选✓` : '高级筛选'}</Button>
                    </Space></Col>
                    <Col><Space wrap size={8}>
                        {selectedKeys.length > 0 && (
                            <>
                                <Button danger icon={<DeleteOutlined />} onClick={handleBatchRemove} style={{ minHeight: 44 }}>批量移除 ({selectedKeys.length})</Button>
                                <Button icon={<SwapOutlined />} onClick={async () => { try { const s = await listShelves(); setTargetShelfOptions(s.filter((sh: ShelfInfo) => sh.logical_shelf_id !== currentShelfId).map((sh: ShelfInfo) => ({ value: sh.logical_shelf_id, label: `${sh.shelf_name} (${sh.book_count}本)` }))); setMoveModalOpen(true); } catch {} }} style={{ minHeight: 44 }}>批量移动</Button>
                            </>
                        )}
                        <Segmented size="middle" value={viewMode} onChange={(v) => setViewMode(v as any)} options={[{ value: 'grid', icon: <AppstoreOutlined /> }, { value: 'list', icon: <UnorderedListOutlined /> }, { value: 'compact', label: '紧凑' }]} />
                        {viewMode === 'grid' && <Segmented size="small" value={gridCols} onChange={(v) => handleGridColsChange(v as number)} options={[2, 3, 4, 5].map(n => ({ value: n, label: `${n}列` }))} />}
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/search')} style={{ borderRadius: 8, minHeight: 44 }}>添加图书</Button>
                    </Space></Col>
                </Row>

                {/* 高级筛选面板 */}
                {showAdvanced && (
                    <div style={{ marginTop: 14, padding: 14, background: token.colorFillQuaternary, borderRadius: 10 }}>
                        <Row gutter={[12, 10]}>
                            <Col xs={12} sm={8} md={4}><Input placeholder="作者筛选" value={filterAuthor} onChange={(e) => setFilterAuthor(e.target.value)} allowClear size="small" /></Col>
                            <Col xs={12} sm={8} md={4}><Input placeholder="出版社筛选" value={filterPublisher} onChange={(e) => setFilterPublisher(e.target.value)} allowClear size="small" /></Col>
                            <Col xs={12} sm={8} md={4}><Space size={4}><InputNumber placeholder="年份起" min={1900} max={2030} value={filterYearMin} onChange={(v) => setFilterYearMin(v)} size="small" style={{ width: 90 }} /><Text type="secondary">—</Text><InputNumber placeholder="年份止" min={1900} max={2030} value={filterYearMax} onChange={(v) => setFilterYearMax(v)} size="small" style={{ width: 90 }} /></Space></Col>
                            <Col xs={12} sm={8} md={4}><InputNumber placeholder="最低评分(0-10)" min={0} max={10} value={filterRatingMin} onChange={(v) => setFilterRatingMin(v)} size="small" style={{ width: 140 }} /></Col>
                            <Col><Button size="small" icon={<ClearOutlined />} onClick={clearAdvanced}>清除筛选</Button></Col>
                        </Row>
                    </div>
                )}

                {(debouncedKeyword || hasAdvancedFilter) && (
                    <div style={{ marginTop: 10 }}><Space size={4}><FilterOutlined /><Text type="secondary" style={{ fontSize: 12 }}>找到 {filteredBooks.length} 本 / 共 {shelfData.total_count} 本</Text></Space></div>
                )}
            </Card>

            {/* 图书列表 */}
            {filteredBooks.length === 0 ? (
                <Card style={{ borderRadius: 14, textAlign: 'center', padding: 48 }}>
                    <Empty image={<div style={{ fontSize: 56, opacity: 0.3 }}>{debouncedKeyword || hasAdvancedFilter ? '🔍' : '📚'}</div>}
                        description={<Text type="secondary">{debouncedKeyword || hasAdvancedFilter ? '无匹配图书' : '此书架暂无图书'}</Text>}>
                        <Space>{debouncedKeyword || hasAdvancedFilter ? <Button icon={<ClearOutlined />} onClick={() => { setSearchKeyword(''); clearAdvanced(); }}>清除筛选</Button> : <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/search')}>添加图书</Button>}</Space>
                    </Empty>
                </Card>
            ) : viewMode === 'grid' || viewMode === 'compact' ? (
                <Row gutter={[viewMode === 'compact' ? 10 : 16, viewMode === 'compact' ? 10 : 16]}>
                    {filteredBooks.map((book: Book) => (
                        <Col xs={12} sm={8} md={6} lg={24 / gridCols} key={book.book_id}>
                            <div style={{ position: 'relative' }}>
                                <BookCard book={book} viewMode={viewMode === 'compact' ? 'compact' : 'grid'}
                                    onClick={() => navigate(`/shelf/${currentShelfId}/book/${book.book_id}`)} />
                                <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
                                    <Dropdown menu={{ items: [
                                        { key: 'detail', icon: <EyeOutlined />, label: '查看详情', onClick: () => navigate(`/shelf/${currentShelfId}/book/${book.book_id}`) },
                                        { type: 'divider' as const },
                                        { key: 'move', icon: <SwapOutlined />, label: '移动到...', onClick: async () => { setSelectedBook(book); try { const s = await listShelves(); setTargetShelfOptions(s.filter((sh: ShelfInfo) => sh.logical_shelf_id !== currentShelfId).map((sh: ShelfInfo) => ({ value: sh.logical_shelf_id, label: `${sh.shelf_name} (${sh.book_count}本)` }))); setMoveModalOpen(true); } catch {} } },
                                        { key: 'remove', icon: <DeleteOutlined />, label: '从书架移除', danger: true, onClick: () => handleRemoveBook(book) },
                                    ] }} trigger={['click']}>
                                        <Button size="small" shape="circle" icon={<EditOutlined />} onClick={e => e.stopPropagation()} style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }} />
                                    </Dropdown>
                                </div>
                            </div>
                        </Col>
                    ))}
                </Row>
            ) : (
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    {filteredBooks.map((book: Book) => (
                        <div key={book.book_id} style={{ position: 'relative' }}>
                            <BookCard book={book} viewMode="list" onClick={() => navigate(`/shelf/${currentShelfId}/book/${book.book_id}`)} />
                            <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
                                <Space size={4}>
                                    <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/shelf/${currentShelfId}/book/${book.book_id}`)} />
                                    <Popconfirm title={`移除《${book.title}》？`} onConfirm={() => handleRemoveBook(book)} okText="移除" cancelText="取消" okButtonProps={{ danger: true }}>
                                        <Button size="small" danger icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                </Space>
                            </div>
                        </div>
                    ))}
                </Space>
            )}
            <FloatButton.BackTop visibilityHeight={400} style={{ right: 40, bottom: 40 }} />

            {/* 移动弹窗 */}
            <Modal title={<Space><SwapOutlined />移动图书</Space>} open={moveModalOpen} onOk={selectedKeys.length > 0 ? handleBatchMove : handleMoveBook}
                onCancel={() => { setMoveModalOpen(false); setTargetShelfId(null); }} okText="移动" cancelText="取消" okButtonProps={{ disabled: !targetShelfId }} width={460} style={{ maxWidth: '94vw' }}>
                {selectedBook && !selectedKeys.length && <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>将《<Text strong>{selectedBook.title}</Text>》移动到：</Text>}
                {selectedKeys.length > 0 && <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>将选中的 <Text strong>{selectedKeys.length}</Text> 本图书移动到：</Text>}
                <Select placeholder="选择目标书架" style={{ width: '100%' }} size="large" value={targetShelfId} onChange={setTargetShelfId} options={targetShelfOptions} showSearch filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())} />
            </Modal>

            <ShelfSelector visible={showShelfSelector} bookId={selectedBook?.book_id || 0} bookTitle={selectedBook?.title || ''}
                onClose={() => setShowShelfSelector(false)} onSuccess={() => { message.success('已添加'); setShowShelfSelector(false); refreshBooks(); }} existingShelfIds={[currentShelfId]} />
        </div>
    );
};

export default ShelfView;
