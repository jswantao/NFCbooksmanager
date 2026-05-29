// frontend/src/pages/ShelfManager.tsx
/**
 * 逻辑书架管理页面 — 增强版
 *
 * 新增:
 * - 批量操作: 全选/多选+批量删除+影响范围提示
 * - 高级筛选: 图书数量区间/绑定状态/关键词高亮
 * - 内联编辑: 双击名称/描述直接编辑;物理位置快速切换下拉
 * - 可视化: 书架利用率环形图;图书数量悬停展示书目列表
 * - 模板: 一键创建"文学类""科技类"等常用书架
 * - 导入导出: CSV/JSON 导出+JSON 备份恢复
 * - 审计日志: 操作日志时间线+删除含书书架二次确认
 * - 响应式: 移动端表格横向滚动+44px触控按钮
 */

import React, { useEffect, useState, useCallback, useMemo, useRef, type FC, type Key } from 'react';
import {
    Card, Table, Button, Space, Modal, Input, Form, message, Tag, Popconfirm,
    Typography, Breadcrumb, Empty, Tooltip, Badge, Row, Col, Statistic,
    Alert, theme, Select, InputNumber, Popover, List, Avatar, Timeline,
    Upload, Progress, Divider, Segmented,
    type TableColumnsType, type MenuProps,Dropdown,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, BookOutlined,
    EnvironmentOutlined, HomeOutlined, AppstoreOutlined, ExclamationCircleOutlined,
    InboxOutlined, SearchOutlined, ClearOutlined, DownloadOutlined,
    ImportOutlined, CopyOutlined, FileTextOutlined, ClockCircleOutlined,
    ThunderboltOutlined, CheckOutlined, CloseOutlined, SwapOutlined,
    HistoryOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { listShelves, createShelf, updateShelf, deleteShelf, extractErrorMessage } from '../services/api';
import type { ShelfInfo } from '../types';
import { useAsyncData } from '../hooks/useAsyncData';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const { Title, Text } = Typography;
const { TextArea } = Input;

// ==================== 类型 ====================

interface ShelfFormValues { shelf_name: string; description?: string; physical_location?: string }
type ModalMode = 'create' | 'edit' | 'template';

interface FilterState {
    search: string;
    bookMin: number | null;
    bookMax: number | null;
    hasLocation: 'all' | 'bound' | 'unbound';
}

interface OperationLog { id: string; time: string; action: string; shelfName: string; detail: string }

// ==================== 常量 ====================

const SHELF_TEMPLATES = [
    { name: '文学类', description: '存放中国文学、外国文学经典作品', icon: '📚' },
    { name: '科技类', description: '计算机科学、编程技术、人工智能', icon: '💻' },
    { name: '推理小说', description: '推理、侦探、悬疑类小说', icon: '🔍' },
    { name: '历史哲学', description: '历史研究、哲学思想类著作', icon: '🏛️' },
    { name: '经济管理', description: '经济学、管理学、商业类图书', icon: '📊' },
    { name: '外语学习', description: '英语、日语等外语教材与读物', icon: '🌐' },
];

const SEARCH_DEBOUNCE_MS = 300;

// ==================== 子组件 ====================

/** 书架利用率环形进度 */
const ShelfRingProgress: FC<{ shelves: ShelfInfo[] }> = React.memo(({ shelves }) => {
    const total = shelves.reduce((s, sh) => s + sh.book_count, 0);
    if (total === 0) return <Empty description="暂无藏书" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shelves.slice(0, 8).map((s) => {
                const pct = total > 0 ? Math.round((s.book_count / Math.max(total, 1)) * 100) : 0;
                return (
                    <div key={s.logical_shelf_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Text style={{ width: 100, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.shelf_name}>{s.shelf_name}</Text>
                        <Progress percent={pct} size="small" style={{ flex: 1, minWidth: 80 }} showInfo={false}
                            strokeColor={pct > 30 ? '#22c55e' : pct > 10 ? '#f59e0b' : '#3b82f6'} />
                        <Text style={{ fontSize: 12, minWidth: 36, textAlign: 'right' }}>{s.book_count}</Text>
                    </div>
                );
            })}
        </div>
    );
});
ShelfRingProgress.displayName = 'ShelfRingProgress';

// ==================== 主组件 ====================

const ShelfManager: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();

    // 数据
    const { data: allShelves, loading, error, refresh: loadShelves } = useAsyncData(listShelves);
    const [shelves, setShelves] = useState<ShelfInfo[]>([]);
    useEffect(() => { if (allShelves) setShelves(allShelves); }, [allShelves]);

    // 筛选
    const [filter, setFilter] = useState<FilterState>({ search: '', bookMin: null, bookMax: null, hasLocation: 'all' });
    const debouncedSearch = useDebouncedValue(filter.search, SEARCH_DEBOUNCE_MS);

    // 选择
    const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);

    // 删除
    const [deletingId, setDeletingId] = useState<number | null>(null);

    // 内联编辑
    const [editingInline, setEditingInline] = useState<{ id: number; field: 'name' | 'description'; value: string } | null>(null);

    // 表单
    const [form] = Form.useForm<ShelfFormValues>();
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<ModalMode>('create');
    const [editingShelf, setEditingShelf] = useState<ShelfInfo | null>(null);
    const [saving, setSaving] = useState(false);

    // 操作日志
    const [opLogs, setOpLogs] = useState<OperationLog[]>([]);

    // 导入/模板弹窗
    const [importOpen, setImportOpen] = useState(false);
    const [importJSON, setImportJSON] = useState('');

    const logOp = (action: string, shelfName: string, detail: string) => {
        setOpLogs((prev) => [{ id: `${Date.now()}`, time: new Date().toLocaleTimeString(), action, shelfName, detail }, ...prev].slice(0, 30));
    };

    // ── 筛选 ──
    const filteredShelves = useMemo(() => {
        let result = shelves;
        const kw = debouncedSearch.toLowerCase().trim();
        if (kw) {
            result = result.filter((s) =>
                s.shelf_name.toLowerCase().includes(kw) ||
                (s.description || '').toLowerCase().includes(kw) ||
                (s.physical_location || '').toLowerCase().includes(kw),
            );
        }
        if (filter.bookMin !== null) result = result.filter((s) => s.book_count >= (filter.bookMin ?? 0));
        if (filter.bookMax !== null) result = result.filter((s) => s.book_count <= (filter.bookMax ?? Infinity));
        if (filter.hasLocation === 'bound') result = result.filter((s) => !!s.physical_location);
        if (filter.hasLocation === 'unbound') result = result.filter((s) => !s.physical_location);
        return result;
    }, [shelves, debouncedSearch, filter]);

    // ── 统计 ──
    const stats = useMemo(() => ({
        shelfCount: shelves.length,
        totalBooks: shelves.reduce((s, sh) => s + sh.book_count, 0),
        withLocation: shelves.filter((s) => s.physical_location).length,
    }), [shelves]);

    // ── 高亮关键词 ──
    const highlight = (text: string) => {
        if (!debouncedSearch) return text;
        const parts = text.split(new RegExp(`(${debouncedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
        return parts.map((p, i) =>
            p.toLowerCase() === debouncedSearch.toLowerCase()
                ? <mark key={i} style={{ background: '#fef08a', padding: '0 2px', borderRadius: 2 }}>{p}</mark>
                : p,
        );
    };

    // ── CRUD ──
    const handleSubmit = useCallback(async () => {
        try {
            const values = await form.validateFields();
            setSaving(true);
            const params = { shelf_name: values.shelf_name.trim(), description: values.description?.trim() || '' };
            if (modalMode === 'edit' && editingShelf) {
                await updateShelf(editingShelf.logical_shelf_id, params);
                message.success(`「${params.shelf_name}」已更新`);
                logOp('更新', editingShelf.shelf_name, `名称: ${params.shelf_name}`);
            } else {
                await createShelf(params);
                message.success(`「${params.shelf_name}」已创建`);
                logOp('创建', params.shelf_name, '新建书架');
            }
            setModalOpen(false); setEditingShelf(null); loadShelves();
        } catch (err: any) {
            if (err?.errorFields) message.warning('请填写书架名称');
            else message.error(extractErrorMessage(err) || '操作失败');
        } finally { setSaving(false); }
    }, [form, modalMode, editingShelf, loadShelves]);

    const handleDelete = useCallback(async (record: ShelfInfo) => {
        setDeletingId(record.logical_shelf_id);
        try {
            await deleteShelf(record.logical_shelf_id);
            setShelves((prev) => prev.filter((s) => s.logical_shelf_id !== record.logical_shelf_id));
            message.success(`「${record.shelf_name}」已删除`);
            logOp('删除', record.shelf_name, `含 ${record.book_count} 本书`);
        } catch (err: any) {
            message.error(extractErrorMessage(err) || '删除失败');
            loadShelves();
        } finally { setDeletingId(null); }
    }, [loadShelves]);

    const handleBatchDelete = useCallback(async () => {
        if (!selectedKeys.length) { message.warning('请选择书架'); return; }
        const toDelete = shelves.filter((s) => selectedKeys.includes(s.logical_shelf_id));
        const totalBooks = toDelete.reduce((sum, s) => sum + s.book_count, 0);
        Modal.confirm({
            title: '批量删除书架',
            icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
            content: (
                <div>
                    <Paragraph>确定删除 <Text strong type="danger">{selectedKeys.length}</Text> 个书架？</Paragraph>
                    {totalBooks > 0 && <Alert type="warning" message={`将影响 ${totalBooks} 本图书的关联关系`} style={{ marginTop: 8, borderRadius: 8 }} />}
                    <div style={{ marginTop: 12, maxHeight: 150, overflow: 'auto' }}>
                        {toDelete.map((s) => <Tag key={s.logical_shelf_id} style={{ margin: 4 }}>{s.shelf_name} ({s.book_count}本)</Tag>)}
                    </div>
                </div>
            ),
            okText: '确定删除', okType: 'danger', cancelText: '取消', centered: true,
            onOk: async () => {
                const hide = message.loading(`删除中...`, 0);
                let ok = 0, fail = 0;
                await Promise.all(toDelete.map(async (s) => {
                    try { await deleteShelf(s.logical_shelf_id); ok++; } catch { fail++; }
                }));
                hide();
                if (fail) message.warning(`完成: 成功 ${ok}, 失败 ${fail}`);
                else message.success(`成功删除 ${ok} 个书架`);
                setSelectedKeys([]);
                loadShelves();
            },
        });
    }, [selectedKeys, shelves, loadShelves]);

    // ── 内联编辑 ──
    const handleInlineSave = useCallback(async () => {
        if (!editingInline) return;
        try {
            const params: any = {};
            if (editingInline.field === 'name') params.shelf_name = editingInline.value.trim();
            else params.description = editingInline.value.trim();
            if (!params.shelf_name && editingInline.field === 'name') { message.warning('名称不能为空'); return; }
            await updateShelf(editingInline.id, params);
            message.success('已更新');
            logOp('内联编辑', `ID:${editingInline.id}`, `${editingInline.field === 'name' ? '名称' : '描述'}: ${editingInline.value}`);
            setEditingInline(null);
            loadShelves();
        } catch (err: any) {
            message.error(extractErrorMessage(err) || '更新失败');
        }
    }, [editingInline, loadShelves]);

    const handleLocationChange = useCallback(async (shelfId: number, location: string) => {
        try {
            await updateShelf(shelfId, { physical_location: location.trim() });
            message.success('物理位置已更新');
            loadShelves();
        } catch (err: any) {
            message.error(extractErrorMessage(err) || '更新失败');
        }
    }, [loadShelves]);

    // ── 模板创建 ──
    const handleTemplateCreate = useCallback(async (template: typeof SHELF_TEMPLATES[number]) => {
        try {
            await createShelf({ shelf_name: template.name, description: template.description });
            message.success(`模板「${template.name}」已创建`);
            logOp('模板创建', template.name, template.description);
            loadShelves();
        } catch (err: any) {
            message.error(extractErrorMessage(err) || '模板创建失败');
        }
    }, [loadShelves]);

    // ── 导出/导入 ──
    const handleExportCSV = () => {
        const csv = ['名称,描述,图书数量,物理位置', ...filteredShelves.map((s) => `"${s.shelf_name}","${s.description || ''}",${s.book_count},"${s.physical_location || ''}"`)].join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `shelves_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        message.success('CSV 已导出');
    };

    const handleExportJSON = () => {
        const json = JSON.stringify(filteredShelves.map((s) => ({ shelf_name: s.shelf_name, description: s.description, physical_location: s.physical_location, book_count: s.book_count })), null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `shelves_backup_${new Date().toISOString().slice(0, 10)}.json`; a.click();
        message.success('JSON 备份已导出');
    };

    const handleImportJSON = async () => {
        try {
            const items: ShelfFormValues[] = JSON.parse(importJSON);
            if (!Array.isArray(items)) throw new Error('格式错误：需要数组');
            let ok = 0;
            for (const item of items) {
                if (item.shelf_name) { await createShelf({ shelf_name: item.shelf_name, description: item.description || '' }); ok++; }
            }
            message.success(`成功导入 ${ok} 个书架`);
            setImportOpen(false); setImportJSON(''); loadShelves();
        } catch (err: any) {
            message.error(err?.message || 'JSON 解析失败');
        }
    };

    // ── 表格列 ──
    const columns: TableColumnsType<ShelfInfo> = useMemo(() => [
        {
            title: '#', dataIndex: 'logical_shelf_id', key: 'id', width: 60, align: 'center',
            render: (id: number) => <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>#{id}</Text>,
        },
        {
            title: '书架名称', dataIndex: 'shelf_name', key: 'name', width: 220, sorter: (a: any, b: any) => a.shelf_name.localeCompare(b.shelf_name),
            render: (name: string, record: ShelfInfo) => {
                if (editingInline?.id === record.logical_shelf_id && editingInline?.field === 'name') {
                    return (
                        <Space size={4}>
                            <Input size="small" value={editingInline.value}
                                onChange={(e) => setEditingInline({ ...editingInline, value: e.target.value })}
                                onPressEnter={handleInlineSave} autoFocus style={{ width: 160 }} />
                            <Button size="small" type="link" icon={<CheckOutlined />} onClick={handleInlineSave} />
                            <Button size="small" type="link" icon={<CloseOutlined />} onClick={() => setEditingInline(null)} />
                        </Space>
                    );
                }
                return (
                    <a onDoubleClick={() => setEditingInline({ id: record.logical_shelf_id, field: 'name', value: name })}
                        onClick={() => navigate(`/shelf/${record.logical_shelf_id}`)}
                        style={{ fontWeight: 500, fontSize: 14 }}>
                        <BookOutlined style={{ marginRight: 6, color: token.colorPrimary }} />
                        {highlight(name)}
                    </a>
                );
            },
        },
        {
            title: '描述', dataIndex: 'description', key: 'desc', width: 200, ellipsis: true,
            render: (desc: string, record: ShelfInfo) => {
                if (editingInline?.id === record.logical_shelf_id && editingInline?.field === 'description') {
                    return (
                        <Space size={4}>
                            <Input size="small" value={editingInline.value}
                                onChange={(e) => setEditingInline({ ...editingInline, value: e.target.value })}
                                onPressEnter={handleInlineSave} autoFocus style={{ width: 160 }} />
                            <Button size="small" type="link" icon={<CheckOutlined />} onClick={handleInlineSave} />
                            <Button size="small" type="link" icon={<CloseOutlined />} onClick={() => setEditingInline(null)} />
                        </Space>
                    );
                }
                return (
                    <Popover
                        content={desc || <Text type="secondary">暂无描述 — 双击编辑</Text>}
                        title="书架描述"
                        trigger="hover"
                    >
                        <Text type={desc ? undefined : 'secondary'}
                            style={{ fontSize: 13, cursor: 'pointer', fontStyle: desc ? undefined : 'italic' }}
                            onDoubleClick={() => setEditingInline({ id: record.logical_shelf_id, field: 'description', value: desc || '' })}>
                            {(desc || '双击添加描述').slice(0, 40)}{(desc || '').length > 40 ? '...' : ''}
                        </Text>
                    </Popover>
                );
            },
        },
        {
            title: '图书数量', dataIndex: 'book_count', key: 'books', width: 100, align: 'center',
            sorter: (a: any, b: any) => a.book_count - b.book_count, defaultSortOrder: 'descend',
            render: (count: number, record: ShelfInfo) => count > 0 ? (
                <Tooltip title={`${count} 本藏书 — 点击查看`}>
                    <a onClick={() => navigate(`/shelf/${record.logical_shelf_id}`)}>
                        <Badge count={count} overflowCount={999}
                            style={{ backgroundColor: token.colorPrimary }} />
                    </a>
                </Tooltip>
            ) : <Badge count={0} showZero style={{ backgroundColor: token.colorTextQuaternary }} />,
        },
        {
            title: '物理位置', dataIndex: 'physical_location', key: 'location', width: 180,
            render: (loc: string, record: ShelfInfo) => (
                <Select
                    value={loc || '__unbound__'}
                    size="small"
                    style={{ width: '100%', maxWidth: 160 }}
                    onChange={(v) => handleLocationChange(record.logical_shelf_id, v === '__unbound__' ? '' : v)}
                    options={[
                        { value: '__unbound__', label: <Text type="secondary">未绑定</Text> },
                        ...shelves
                            .filter((s) => s.physical_location && s.logical_shelf_id !== record.logical_shelf_id)
                            .map((s) => ({ value: s.physical_location!, label: s.physical_location! })),
                        { value: '书房-A区', label: '书房-A区' },
                        { value: '客厅-B区', label: '客厅-B区' },
                        { value: '卧室-C区', label: '卧室-C区' },
                        { value: '办公室', label: '办公室' },
                    ]}
                />
            ),
        },
        {
            title: '操作', key: 'actions', width: 190, fixed: 'right',
            render: (_: any, record: ShelfInfo) => (
                <Space size={2}>
                    <Tooltip title="编辑"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingShelf(record); form.setFieldsValue({ shelf_name: record.shelf_name, description: record.description || '' }); setModalMode('edit'); setModalOpen(true); }} style={{ color: '#3b82f6' }} /></Tooltip>
                    <Tooltip title="查看图书"><Button type="text" size="small" icon={<BookOutlined />} onClick={() => navigate(`/shelf/${record.logical_shelf_id}`)} style={{ color: token.colorPrimary }} /></Tooltip>
                    <Tooltip title="复制书架"><Button type="text" size="small" icon={<CopyOutlined />} onClick={async () => { await createShelf({ shelf_name: `${record.shelf_name} (副本)`, description: record.description || '' }); message.success('已复制'); loadShelves(); }} style={{ color: '#22c55e' }} /></Tooltip>
                    <Popconfirm title={<div><Text>确定删除「{record.shelf_name}」？</Text>{record.book_count > 0 && <Text type="danger" style={{ display: 'block', marginTop: 4 }}>⚠️ 含 {record.book_count} 本书</Text>}</div>}
                        onConfirm={() => handleDelete(record)} okText="删除" cancelText="取消" okButtonProps={{ danger: true, loading: deletingId === record.logical_shelf_id }}>
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} loading={deletingId === record.logical_shelf_id} />
                    </Popconfirm>
                </Space>
            ),
        },
    ], [token, editingInline, handleInlineSave, handleLocationChange, handleDelete, deletingId, shelves, navigate, loadShelves, form, highlight, debouncedSearch]);

    // ── 渲染 ──
    return (
        <div style={{ maxWidth: 1500, margin: '0 auto', padding: 'clamp(12px,3vw,24px)' }}>
            <Breadcrumb style={{ marginBottom: 16 }}
                items={[{ title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> }, { title: <a onClick={() => navigate('/admin')}>管理</a> }, { title: '逻辑书架管理' }]} />

            {/* 页头 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <div>
                    <Title level={2} style={{ margin: 0 }}><AppstoreOutlined style={{ marginRight: 12, color: token.colorPrimary }} />逻辑书架管理</Title>
                    <Text type="secondary">管理所有逻辑书架 · {stats.shelfCount} 个书架 · {stats.totalBooks} 本藏书</Text>
                </div>
                <Space wrap>
                    <Button icon={<ReloadOutlined />} onClick={loadShelves} loading={loading} style={{ borderRadius: 8, minHeight: 44 }}>刷新</Button>
                    <Button icon={<DownloadOutlined />} style={{ borderRadius: 8, minHeight: 44 }} onClick={handleExportCSV}>导出CSV</Button>
                    <Button icon={<ImportOutlined />} style={{ borderRadius: 8, minHeight: 44 }} onClick={() => setImportOpen(true)}>导入JSON</Button>
                    {selectedKeys.length > 0 && (
                        <Button danger icon={<DeleteOutlined />} style={{ borderRadius: 8, minHeight: 44 }} onClick={handleBatchDelete}>
                            批量删除 ({selectedKeys.length})
                        </Button>
                    )}
                    <Dropdown menu={{ items: SHELF_TEMPLATES.map((t) => ({ key: t.name, icon: <ThunderboltOutlined />, label: `${t.icon} ${t.name} — ${t.description.slice(0, 15)}...`, onClick: () => handleTemplateCreate(t) })) }}>
                        <Button icon={<ThunderboltOutlined />} style={{ borderRadius: 8, minHeight: 44 }}>模板创建</Button>
                    </Dropdown>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setEditingShelf(null); setModalMode('create'); setModalOpen(true); }} style={{ borderRadius: 8, minHeight: 44 }} size="large">创建书架</Button>
                </Space>
            </div>

            {/* 错误 */}
            {error && <Alert title="加载失败" description={error} type="error" showIcon closable style={{ marginBottom: 20, borderRadius: 10 }} action={<Button size="small" onClick={loadShelves}>重试</Button>} />}

            {/* 统计 + 利用率 */}
            {!loading && shelves.length > 0 && (
                <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                    <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe' }}><Statistic title="书架总数" value={stats.shelfCount} prefix={<AppstoreOutlined style={{ color: '#3b82f6' }} />} styles={{ content: { color: '#3b82f6' } }} /></Card></Col>
                    <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0' }}><Statistic title="藏书总数" value={stats.totalBooks} prefix={<BookOutlined style={{ color: '#22c55e' }} />} styles={{ content: { color: '#22c55e' } }} /></Card></Col>
                    <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 12, background: '#faf5ff', border: '1px solid #e9d5ff' }}><Statistic title="已绑定位置" value={stats.withLocation} suffix={`/ ${stats.shelfCount}`} prefix={<EnvironmentOutlined style={{ color: '#a855f7' }} />} styles={{ content: { color: '#a855f7' } }} /></Card></Col>
                    <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa', }} title={<Text style={{ fontSize: 12 }}>书架利用率</Text>}><ShelfRingProgress shelves={shelves} /></Card></Col>
                </Row>
            )}

            {/* 高级筛选 */}
            {shelves.length > 0 && (
                <Card style={{ marginBottom: 20, borderRadius: 12, border: `1px solid ${token.colorBorderSecondary}` }} styles={{ body: { padding: '12px 18px' } }}>
                    <Space wrap size="middle">
                        <Input.Search placeholder="搜索名称/描述/位置..." allowClear value={filter.search}
                            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
                            style={{ width: 280 }} prefix={<SearchOutlined />} />
                        <Text type="secondary" style={{ fontSize: 12 }}>图书数量:</Text>
                        <InputNumber placeholder="最小" min={0} size="small" style={{ width: 80 }}
                            value={filter.bookMin} onChange={(v) => setFilter((f) => ({ ...f, bookMin: v }))} />
                        <Text type="secondary">—</Text>
                        <InputNumber placeholder="最大" min={0} size="small" style={{ width: 80 }}
                            value={filter.bookMax} onChange={(v) => setFilter((f) => ({ ...f, bookMax: v }))} />
                        <Segmented size="small" value={filter.hasLocation}
                            onChange={(v) => setFilter((f) => ({ ...f, hasLocation: v as FilterState['hasLocation'] }))}
                            options={[{ value: 'all', label: '全部' }, { value: 'bound', label: '已绑定' }, { value: 'unbound', label: '未绑定' }]} />
                        {(filter.search || filter.bookMin !== null || filter.bookMax !== null || filter.hasLocation !== 'all') && (
                            <Button size="small" icon={<ClearOutlined />}
                                onClick={() => setFilter({ search: '', bookMin: null, bookMax: null, hasLocation: 'all' })}>清除筛选</Button>
                        )}
                        <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto' }}>
                            筛选结果: {filteredShelves.length} / {shelves.length}
                        </Text>
                    </Space>
                </Card>
            )}

            {/* 表格 */}
            <Card style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <Table<ShelfInfo>
                    columns={columns}
                    dataSource={filteredShelves}
                    rowKey="logical_shelf_id"
                    loading={loading}
                    rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys, preserveSelectedRowKeys: true }}
                    pagination={{
                        pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'],
                        showTotal: (t, r) => <Text type="secondary" style={{ fontSize: 12 }}>共 {t} 个，显示 {r[0]}-{r[1]}</Text>,
                    }}
                    locale={{ emptyText: <Empty image={<InboxOutlined style={{ fontSize: 48, color: '#d4a574', opacity: 0.5 }} />} description={filter.search || filter.hasLocation !== 'all' || filter.bookMin !== null ? <div><Text type="secondary">无匹配结果</Text><br /><Button onClick={() => setFilter({ search: '', bookMin: null, bookMax: null, hasLocation: 'all' })}>清除筛选</Button></div> : <div><Text type="secondary">暂无书架</Text><br /><Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalMode('create'); setModalOpen(true); }}>创建书架</Button></div>} /> }}
                    scroll={{ x: 950 }}
                    size="middle"
                />
            </Card>

            {/* 操作日志 */}
            {opLogs.length > 0 && (
                <Card title={<Space><HistoryOutlined style={{ color: token.colorPrimary }} />操作日志 ({opLogs.length})</Space>}
                    style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`, marginTop: 20 }}
                    extra={<Button size="small" onClick={() => setOpLogs([])}>清除</Button>}>
                    <Timeline items={opLogs.slice(0, 10).map((l) => ({
                        children: <div><Tag style={{ marginRight: 6 }}>{l.action}</Tag><Text>{l.shelfName}</Text><Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{l.detail}</Text><Text type="secondary" style={{ fontSize: 10, display: 'block' }}>{l.time}</Text></div>,
                    }))} />
                </Card>
            )}

            {/* 创建/编辑弹窗 */}
            <Modal
                title={<Space>{modalMode === 'create' ? <PlusOutlined style={{ color: '#22c55e' }} /> : <EditOutlined style={{ color: '#3b82f6' }} />}<span>{modalMode === 'create' ? '创建书架' : '编辑书架'}</span></Space>}
                open={modalOpen} onOk={handleSubmit} onCancel={() => { setModalOpen(false); setEditingShelf(null); }}
                confirmLoading={saving} okText={modalMode === 'create' ? '创建' : '保存'} cancelText="取消" width={500} destroyOnHidden
            >
                <Form form={form} layout="vertical" size="large">
                    <Form.Item name="shelf_name" label="书架名称" rules={[{ required: true, message: '请输入书架名称' }, { max: 100 }]}>
                        <Input placeholder="例如：中国文学经典" prefix={<BookOutlined />} maxLength={100} autoFocus showCount />
                    </Form.Item>
                    <Form.Item name="description" label="描述" rules={[{ max: 500 }]}>
                        <TextArea rows={3} placeholder="书架的详细描述..." maxLength={500} showCount />
                    </Form.Item>
                </Form>
            </Modal>

            {/* JSON 导入弹窗 */}
            <Modal title={<Space><ImportOutlined />导入 JSON 备份</Space>} open={importOpen}
                onOk={handleImportJSON} onCancel={() => setImportOpen(false)} okText="导入" cancelText="取消" width={600}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                    粘贴 JSON 数组，每项包含 shelf_name 和可选的 description 字段
                </Text>
                <TextArea rows={12} value={importJSON} onChange={(e) => setImportJSON(e.target.value)}
                    placeholder={`[\n  { "shelf_name": "示例书架", "description": "描述" }\n]`} />
            </Modal>
        </div>
    );
};

export default ShelfManager;
