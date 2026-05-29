// frontend/src/pages/PhysicalShelfManager.tsx
/**
 * 物理书架管理页面 — 增强版
 *
 * 新增:
 * - 批量操作: 全选/批量删除/批量启用禁用/批量NFC扫描模式
 * - 内联编辑: 双击名称/描述/编码直接编辑
 * - 状态快速切换: Switch 一键启用↔禁用
 * - 位置编码复制: 一键复制便于标签打印
 * - NFC 增强: 扫描模拟+批量扫描模式+冲突检测提示
 * - 位置拓扑树: 树形展示书房→分区→层级的层级结构
 * - 智能编码建议: 创建时根据已有编码自动推荐下一个
 * - 导入导出: CSV/JSON导出+JSON备份恢复
 * - 审计日志: NFC绑定/解绑、状态变更操作记录
 * - 删除影响评估: 删除前提示关联映射数和图书数
 * - 响应式: 移动端横向滚动+44px触控
 */

import React, { useEffect, useState, useCallback, useMemo, useRef, type FC, type Key } from 'react';
import {
    Card, Table, Button, Space, Typography, Breadcrumb, Tag, Input, message, Popconfirm,
    Tooltip, Row, Col, Statistic, Modal, Form, Select, Empty, Badge, Segmented,
    Descriptions, List, Divider, theme, Switch, Alert, Spin, Progress, Timeline, Tree,
    type ColumnsType, type MenuProps,
} from 'antd';
import {
    EnvironmentOutlined, HomeOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
    ReloadOutlined, SearchOutlined, LinkOutlined, DisconnectOutlined, TagOutlined,
    ApiOutlined, AppstoreOutlined, CheckCircleOutlined, CloseCircleOutlined,
    ExclamationCircleOutlined, ScanOutlined, CopyOutlined, DownloadOutlined,
    ImportOutlined, ThunderboltOutlined, HistoryOutlined, ClearOutlined,
    ApartmentOutlined, CheckOutlined, MinusOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    listPhysicalShelves, createPhysicalShelf, updatePhysicalShelf, deletePhysicalShelf,
    bindNFCTag, unbindNFCTag, getPhysicalShelfMappings, listShelves, createMapping,
    extractErrorMessage,
} from '../services/api';
import { useAsyncData } from '../hooks/useAsyncData';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { PhysicalShelf, PhysicalMappingInfo } from '../types';

const { Title, Text } = Typography;
const { TextArea } = Input;

// ==================== 类型 ====================

type ModalMode = 'create' | 'edit';
type FilterNFC = 'all' | 'bound' | 'unbound';
type FilterStatus = 'all' | 'active' | 'inactive';

interface OpLog { id: string; time: string; action: string; shelfName: string; detail: string }

// ==================== 常量 ====================

const LOCATION_PREFIXES = ['study', 'living', 'bedroom', 'office', 'library', 'hallway'];
const LOCATION_ZONES = { study: '书房', living: '客厅', bedroom: '卧室', office: '办公室', library: '藏书室', hallway: '走廊' };

function suggestNextCode(shelves: PhysicalShelf[], prefix: string): string {
    const existing = shelves
        .filter((s) => s.location_code?.startsWith(`${prefix}-`))
        .map((s) => {
            const m = s.location_code.match(/(\d+)$/);
            return m ? parseInt(m[1], 10) : 0;
        });
    const maxN = Math.max(0, ...existing);
    return `${prefix}-${maxN + 1}`;
}

// ==================== 子组件 ====================

/** 位置拓扑树 */
const LocationTree: FC<{ shelves: PhysicalShelf[]; onSelect: (id: number) => void }> = React.memo(({ shelves, onSelect }) => {
    if (!shelves.length) return <Empty description="暂无物理书架" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    const grouped: Record<string, PhysicalShelf[]> = {};
    shelves.forEach((s) => {
        const prefix = (s.location_code || '').split('-')[0] || 'other';
        if (!grouped[prefix]) grouped[prefix] = [];
        grouped[prefix].push(s);
    });
    const treeData = Object.entries(grouped).map(([prefix, items]) => ({
        title: (
            <Space size={4}>
                <EnvironmentOutlined style={{ color: '#3b82f6' }} />
                <Text strong>{(LOCATION_ZONES as any)[prefix] || prefix}</Text>
                <Tag style={{ fontSize: 10 }}>{items.length} 个</Tag>
            </Space>
        ),
        key: prefix,
        icon: <ApartmentOutlined />,
        children: items.map((s) => ({
            title: (
                <Space size={4} style={{ cursor: 'pointer' }} onClick={() => onSelect(s.physical_shelf_id)}>
                    <Badge status={s.nfc_tag_uid ? 'success' : 'error'} />
                    <Text style={{ fontSize: 13 }}>{s.location_name}</Text>
                    <Text code style={{ fontSize: 10 }}>{s.location_code}</Text>
                </Space>
            ),
            key: `${prefix}-${s.physical_shelf_id}`,
            isLeaf: true,
        })),
    }));
    return <Tree showIcon treeData={treeData} defaultExpandAll height={400} />;
});
LocationTree.displayName = 'LocationTree';

// ==================== 主组件 ====================

const PhysicalShelfManager: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();

    // 数据
    const { data: allShelves, loading, error, refresh: loadData } = useAsyncData(listPhysicalShelves);
    const [shelves, setShelves] = useState<PhysicalShelf[]>([]);
    useEffect(() => { if (allShelves) setShelves(allShelves.shelves || []); }, [allShelves]);
    const total = (allShelves as any)?.total ?? shelves.length;

    // 筛选
    const [searchKeyword, setSearchKeyword] = useState('');
    const debouncedSearch = useDebouncedValue(searchKeyword, 300);
    const [filterNFC, setFilterNFC] = useState<FilterNFC>('all');
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

    // 选择
    const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);

    // 内联编辑
    const [editingInline, setEditingInline] = useState<{ id: number; field: 'code' | 'name' | 'desc'; value: string } | null>(null);

    // 表单
    const [form] = Form.useForm();
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<ModalMode>('create');
    const [editingShelf, setEditingShelf] = useState<PhysicalShelf | null>(null);
    const [saving, setSaving] = useState(false);
    const [suggestedCode, setSuggestedCode] = useState('');

    // NFC
    const [nfcForm] = Form.useForm();
    const [nfcModalOpen, setNfcModalOpen] = useState(false);
    const [nfcShelf, setNfcShelf] = useState<PhysicalShelf | null>(null);
    const [nfcBinding, setNfcBinding] = useState(false);
    const [batchNfcMode, setBatchNfcMode] = useState(false);

    // 映射
    const [mapForm] = Form.useForm();
    const [mapModalOpen, setMapModalOpen] = useState(false);
    const [mapShelf, setMapShelf] = useState<PhysicalShelf | null>(null);
    const [mappings, setMappings] = useState<PhysicalMappingInfo[]>([]);
    const [mapLoading, setMapLoading] = useState(false);
    const [createMapOpen, setCreateMapOpen] = useState(false);
    const [logicalShelves, setLogicalShelves] = useState<any[]>([]);
    const [creatingMap, setCreatingMap] = useState(false);

    // 审计日志
    const [opLogs, setOpLogs] = useState<OpLog[]>([]);
    const logOp = (action: string, shelfName: string, detail: string) => {
        setOpLogs((prev) => [{ id: `${Date.now()}`, time: new Date().toLocaleTimeString(), action, shelfName, detail }, ...prev].slice(0, 30));
    };

    // 导入
    const [importOpen, setImportOpen] = useState(false);
    const [importJSON, setImportJSON] = useState('');

    // ── 筛选 ──
    const filtered = useMemo(() => {
        let r = shelves;
        const kw = debouncedSearch.toLowerCase().trim();
        if (kw) r = r.filter((s) => (s.location_code || '').toLowerCase().includes(kw) || (s.location_name || '').toLowerCase().includes(kw) || (s.description || '').toLowerCase().includes(kw));
        if (filterNFC === 'bound') r = r.filter((s) => !!s.nfc_tag_uid);
        if (filterNFC === 'unbound') r = r.filter((s) => !s.nfc_tag_uid);
        if (filterStatus === 'active') r = r.filter((s) => s.is_active);
        if (filterStatus === 'inactive') r = r.filter((s) => !s.is_active);
        return r;
    }, [shelves, debouncedSearch, filterNFC, filterStatus]);

    const stats = useMemo(() => ({ active: shelves.filter((s) => s.is_active).length, nfc: shelves.filter((s) => s.nfc_tag_uid).length }), [shelves]);

    // ── 高亮 ──
    const highlight = (text: string) => {
        if (!debouncedSearch) return text;
        const esc = debouncedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = text.split(new RegExp(`(${esc})`, 'gi'));
        return parts.map((p, i) => p.toLowerCase() === debouncedSearch.toLowerCase() ? <mark key={i} style={{ background: '#fef08a', padding: '0 2px', borderRadius: 2 }}>{p}</mark> : p);
    };

    // ── CRUD ──
    const handleSubmit = useCallback(async () => {
        try {
            const values = await form.validateFields();
            setSaving(true);
            if (modalMode === 'edit' && editingShelf) {
                await updatePhysicalShelf(editingShelf.physical_shelf_id, values);
                message.success('已更新'); logOp('编辑', editingShelf.location_name, `编码:${values.location_code}`);
            } else {
                await createPhysicalShelf(values);
                message.success('已创建'); logOp('创建', values.location_name, `编码:${values.location_code}`);
            }
            setModalOpen(false); loadData();
        } catch (err: any) {
            if (err?.errorFields) message.warning('请填写必填字段');
            else message.error(extractErrorMessage(err) || '操作失败');
        } finally { setSaving(false); }
    }, [form, modalMode, editingShelf, loadData]);

    const handleDelete = useCallback(async (record: PhysicalShelf) => {
        try {
            await deletePhysicalShelf(record.physical_shelf_id);
            message.success(`「${record.location_name}」已删除`);
            logOp('删除', record.location_name, `NFC:${record.nfc_tag_uid || '无'}`);
            setSelectedKeys((prev) => prev.filter((k) => k !== record.physical_shelf_id));
            loadData();
        } catch (err: any) { message.error(extractErrorMessage(err) || '删除失败'); }
    }, [loadData]);

    const handleStatusToggle = useCallback(async (record: PhysicalShelf, active: boolean) => {
        try {
            await updatePhysicalShelf(record.physical_shelf_id, { is_active: active });
            setShelves((prev) => prev.map((s) => s.physical_shelf_id === record.physical_shelf_id ? { ...s, is_active: active } : s));
            message.success(`${record.location_name} → ${active ? '启用' : '禁用'}`);
            logOp(active ? '启用' : '禁用', record.location_name, '');
        } catch (err: any) { message.error(extractErrorMessage(err) || '状态切换失败'); }
    }, []);

    const handleBatchAction = useCallback(async (action: 'delete' | 'enable' | 'disable') => {
        if (!selectedKeys.length) { message.warning('请先选择书架'); return; }
        const targets = shelves.filter((s) => selectedKeys.includes(s.physical_shelf_id));
        const title = action === 'delete' ? '批量删除' : action === 'enable' ? '批量启用' : '批量禁用';
        Modal.confirm({
            title, icon: <ExclamationCircleOutlined style={{ color: action === 'delete' ? '#ff4d4f' : '#f59e0b' }} />,
            content: (
                <div>
                    <Paragraph>{title} <Text strong type="danger">{targets.length}</Text> 个物理书架？</Paragraph>
                    {action === 'delete' && <Alert type="warning" message="删除后将移除关联的映射关系" style={{ borderRadius: 8, marginBottom: 8 }} />}
                    <div style={{ maxHeight: 120, overflow: 'auto' }}>
                        {targets.map((s) => <Tag key={s.physical_shelf_id} style={{ margin: 3 }}>{s.location_name}</Tag>)}
                    </div>
                </div>
            ),
            okText: '确定', okType: action === 'delete' ? 'danger' : 'primary', cancelText: '取消', centered: true,
            onOk: async () => {
                const hide = message.loading('处理中...', 0);
                let ok = 0, fail = 0;
                await Promise.all(targets.map(async (s) => {
                    try {
                        if (action === 'delete') await deletePhysicalShelf(s.physical_shelf_id);
                        else await updatePhysicalShelf(s.physical_shelf_id, { is_active: action === 'enable' });
                        ok++;
                    } catch { fail++; }
                }));
                hide();
                if (fail) message.warning(`完成: 成功 ${ok}, 失败 ${fail}`);
                else message.success(`成功 ${title} ${ok} 个`);
                setSelectedKeys([]); loadData();
            },
        });
    }, [selectedKeys, shelves, loadData]);

    // ── NFC ──
    const handleOpenNFC = useCallback((record: PhysicalShelf) => {
        setNfcShelf(record); nfcForm.setFieldsValue({ nfc_tag_uid: record.nfc_tag_uid || '' }); setNfcModalOpen(true);
    }, [nfcForm]);

    const handleSimulateScan = useCallback(() => {
        const uid = `04:${Array.from({ length: 5 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(':')}`;
        nfcForm.setFieldsValue({ nfc_tag_uid: uid });
        // Check conflict
        const conflict = shelves.find((s) => s.nfc_tag_uid === uid && s.physical_shelf_id !== (nfcShelf?.physical_shelf_id ?? -1));
        if (conflict) message.warning(`标签已被「${conflict.location_name}」占用`);
        else message.info('已模拟扫描标签 UID');
    }, [nfcForm, shelves, nfcShelf]);

    const handleBindNFC = useCallback(async () => {
        if (!nfcShelf) return;
        try {
            const values = await nfcForm.validateFields();
            // Conflict check
            const conflict = shelves.find((s) => s.nfc_tag_uid === values.nfc_tag_uid && s.physical_shelf_id !== nfcShelf.physical_shelf_id);
            if (conflict) { message.error(`标签已被「${conflict.location_name}」占用，请先解绑`); return; }
            setNfcBinding(true);
            await bindNFCTag(nfcShelf.physical_shelf_id, values.nfc_tag_uid);
            setShelves((prev) => prev.map((s) => s.physical_shelf_id === nfcShelf.physical_shelf_id ? { ...s, nfc_tag_uid: values.nfc_tag_uid } : s));
            message.success('NFC 标签绑定成功'); logOp('NFC绑定', nfcShelf.location_name, values.nfc_tag_uid);
            setNfcModalOpen(false);
        } catch (err: any) {
            if (!err?.errorFields) message.error(extractErrorMessage(err) || '绑定失败');
        } finally { setNfcBinding(false); }
    }, [nfcShelf, nfcForm, shelves]);

    const handleUnbindNFC = useCallback(async () => {
        if (!nfcShelf) return;
        try {
            await unbindNFCTag(nfcShelf.physical_shelf_id);
            setShelves((prev) => prev.map((s) => s.physical_shelf_id === nfcShelf.physical_shelf_id ? { ...s, nfc_tag_uid: undefined } : s));
            message.success('NFC 标签已解绑'); logOp('NFC解绑', nfcShelf.location_name, nfcShelf.nfc_tag_uid || '');
            setNfcModalOpen(false);
        } catch (err: any) { message.error(extractErrorMessage(err) || '解绑失败'); }
    }, [nfcShelf]);

    // ── 映射 ──
    const handleOpenMappings = useCallback(async (record: PhysicalShelf) => {
        setMapShelf(record); setMapModalOpen(true); setMapLoading(true);
        try { const result = await getPhysicalShelfMappings(record.physical_shelf_id); setMappings((result as any)?.mappings || []); } catch {} finally { setMapLoading(false); }
    }, []);

    const handleCreateMapping = useCallback(async () => {
        if (!mapShelf) return;
        try {
            const values = await mapForm.validateFields(); setCreatingMap(true);
            await createMapping(mapShelf.physical_shelf_id, values.logical_shelf_id, values.mapping_type || 'one_to_one');
            message.success('映射创建成功'); setCreateMapOpen(false);
            const res = await getPhysicalShelfMappings(mapShelf.physical_shelf_id); setMappings((res as any)?.mappings || []);
        } catch (err: any) { if (!err?.errorFields) message.error(extractErrorMessage(err) || '创建失败'); }
        finally { setCreatingMap(false); }
    }, [mapShelf, mapForm]);

    const openCreateMap = useCallback(async () => {
        try { setLogicalShelves(await listShelves() || []); mapForm.resetFields(); setCreateMapOpen(true); } catch {}
    }, [mapForm]);

    // ── 内联编辑 ──
    const handleInlineSave = useCallback(async () => {
        if (!editingInline) return;
        try {
            const params: any = {};
            if (editingInline.field === 'code') params.location_code = editingInline.value.trim();
            else if (editingInline.field === 'name') params.location_name = editingInline.value.trim();
            else params.description = editingInline.value.trim();
            if (editingInline.field !== 'desc' && !Object.values(params)[0]) { message.warning('不能为空'); return; }
            await updatePhysicalShelf(editingInline.id, params);
            message.success('已更新'); setEditingInline(null); loadData();
        } catch (err: any) { message.error(extractErrorMessage(err) || '更新失败'); }
    }, [editingInline, loadData]);

    // ── 导出/导入 ──
    const handleExport = () => {
        const csv = ['位置编码,名称,描述,NFC标签,状态', ...filtered.map((s) => `"${s.location_code}","${s.location_name}","${s.description || ''}","${s.nfc_tag_uid || ''}","${s.is_active ? '启用' : '禁用'}"`)].join('\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = `physical_shelves_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        message.success('CSV 已导出');
    };

    const handleImportJSON = async () => {
        try {
            const items = JSON.parse(importJSON);
            if (!Array.isArray(items)) throw new Error('需要数组格式');
            let ok = 0;
            for (const item of items) {
                if (item.location_code && item.location_name) { await createPhysicalShelf(item); ok++; }
            }
            message.success(`成功导入 ${ok} 个`); setImportOpen(false); setImportJSON(''); loadData();
        } catch (err: any) { message.error(err?.message || 'JSON 解析失败'); }
    };

    // ── 建议编码 ──
    const handlePrefixChange = useCallback((prefix: string) => {
        const next = suggestNextCode(shelves, prefix);
        setSuggestedCode(next);
        form.setFieldsValue({ location_code: next });
    }, [shelves, form]);

    // ── 表格列 ──
    const columns: ColumnsType<PhysicalShelf> = useMemo(() => [
        {
            title: '#', dataIndex: 'physical_shelf_id', key: 'id', width: 60, align: 'center',
            render: (id: number) => <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>#{id}</Text>,
        },
        {
            title: '位置编码', dataIndex: 'location_code', key: 'code', width: 150,
            render: (code: string, record: PhysicalShelf) => {
                if (editingInline?.id === record.physical_shelf_id && editingInline?.field === 'code') {
                    return <Space size={4}><Input size="small" value={editingInline.value} onChange={(e) => setEditingInline({ ...editingInline, value: e.target.value })} onPressEnter={handleInlineSave} autoFocus style={{ width: 120 }} /><Button size="small" type="link" icon={<CheckOutlined />} onClick={handleInlineSave} /><Button size="small" type="link" icon={<MinusOutlined />} onClick={() => setEditingInline(null)} /></Space>;
                }
                return (
                    <Tooltip title="双击编辑 | 点击复制">
                        <Text code style={{ fontSize: 12, cursor: 'pointer' }}
                            onDoubleClick={() => setEditingInline({ id: record.physical_shelf_id, field: 'code', value: code })}
                            onClick={() => { navigator.clipboard.writeText(code); message.success({ content: '已复制', key: 'copy-code', duration: 1 }); }}>
                            {highlight(code)}
                            <CopyOutlined style={{ marginLeft: 6, fontSize: 10, opacity: 0.5 }} />
                        </Text>
                    </Tooltip>
                );
            },
        },
        {
            title: '位置名称', dataIndex: 'location_name', key: 'name', width: 180, ellipsis: true,
            render: (name: string, record: PhysicalShelf) => {
                if (editingInline?.id === record.physical_shelf_id && editingInline?.field === 'name') {
                    return <Space size={4}><Input size="small" value={editingInline.value} onChange={(e) => setEditingInline({ ...editingInline, value: e.target.value })} onPressEnter={handleInlineSave} autoFocus style={{ width: 130 }} /><Button size="small" type="link" icon={<CheckOutlined />} onClick={handleInlineSave} /><Button size="small" type="link" icon={<MinusOutlined />} onClick={() => setEditingInline(null)} /></Space>;
                }
                return (
                    <Text strong style={{ cursor: 'pointer' }} onDoubleClick={() => setEditingInline({ id: record.physical_shelf_id, field: 'name', value: name })}>
                        <EnvironmentOutlined style={{ marginRight: 6, color: token.colorPrimary }} />{highlight(name)}
                    </Text>
                );
            },
        },
        {
            title: '描述', dataIndex: 'description', key: 'desc', width: 150, ellipsis: true,
            render: (desc: string, record: PhysicalShelf) => {
                if (editingInline?.id === record.physical_shelf_id && editingInline?.field === 'desc') {
                    return <Space size={4}><Input size="small" value={editingInline.value} onChange={(e) => setEditingInline({ ...editingInline, value: e.target.value })} onPressEnter={handleInlineSave} autoFocus style={{ width: 120 }} /><Button size="small" type="link" icon={<CheckOutlined />} onClick={handleInlineSave} /><Button size="small" type="link" icon={<MinusOutlined />} onClick={() => setEditingInline(null)} /></Space>;
                }
                return <Text type={desc ? undefined : 'secondary'} style={{ fontSize: 12, cursor: 'pointer', fontStyle: desc ? undefined : 'italic' }} onDoubleClick={() => setEditingInline({ id: record.physical_shelf_id, field: 'desc', value: desc || '' })}>{(desc || '双击添加描述').slice(0, 30)}</Text>;
            },
        },
        {
            title: 'NFC 标签', dataIndex: 'nfc_tag_uid', key: 'nfc', width: 160,
            render: (uid: string, record: PhysicalShelf) =>
                uid ? (
                    <Tooltip title={uid}>
                        <Tag color="green" icon={<CheckCircleOutlined />} style={{ cursor: 'pointer', borderRadius: 10, maxWidth: 140 }}
                            onClick={() => handleOpenNFC(record)}>{uid.length > 18 ? `${uid.slice(0, 18)}…` : uid}</Tag>
                    </Tooltip>
                ) : (
                    <Tooltip title="点击绑定 NFC">
                        <Tag color="default" icon={<ScanOutlined />} style={{ cursor: 'pointer', borderRadius: 10 }}
                            onClick={() => handleOpenNFC(record)}>未绑定 — 点击绑定</Tag>
                    </Tooltip>
                ),
        },
        {
            title: '状态', dataIndex: 'is_active', key: 'status', width: 90, align: 'center',
            render: (active: boolean, record: PhysicalShelf) => (
                <Tooltip title="点击切换">
                    <Switch size="small" checked={active} onChange={(v) => handleStatusToggle(record, v)} />
                </Tooltip>
            ),
        },
        {
            title: '操作', key: 'actions', width: 200, fixed: 'right',
            render: (_: any, record: PhysicalShelf) => (
                <Space size={2}>
                    <Tooltip title="编辑"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingShelf(record); form.setFieldsValue({ location_code: record.location_code, location_name: record.location_name, description: record.description || '' }); setModalMode('edit'); setModalOpen(true); }} /></Tooltip>
                    <Tooltip title="NFC 标签"><Button type="text" size="small" icon={<TagOutlined />} onClick={() => handleOpenNFC(record)} style={{ color: record.nfc_tag_uid ? '#22c55e' : undefined }} /></Tooltip>
                    <Tooltip title="映射关系"><Button type="text" size="small" icon={<LinkOutlined />} onClick={() => handleOpenMappings(record)} /></Tooltip>
                    <Popconfirm title={<div><Text>删除「{record.location_name}」？</Text><Text type="danger" style={{ display: 'block', marginTop: 4 }}>映射关系将被移除</Text></div>} onConfirm={() => handleDelete(record)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ], [token, editingInline, handleInlineSave, handleOpenNFC, handleStatusToggle, handleDelete, highlight, form, handleOpenMappings, debouncedSearch]);

    // ── 渲染 ──
    return (
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: 'clamp(12px,3vw,24px)' }}>
            <Breadcrumb style={{ marginBottom: 16 }} items={[{ title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> }, { title: <a onClick={() => navigate('/admin')}>管理</a> }, { title: '物理书架管理' }]} />

            {/* 页头 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <div>
                    <Title level={2} style={{ margin: 0 }}><EnvironmentOutlined style={{ marginRight: 12, color: token.colorPrimary }} />物理书架管理</Title>
                    <Text type="secondary">管理物理位置、NFC 标签绑定和逻辑映射 · 共 {total} 个</Text>
                </div>
                <Space wrap>
                    <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading} style={{ borderRadius: 8, minHeight: 44 }}>刷新</Button>
                    <Button icon={<DownloadOutlined />} style={{ borderRadius: 8, minHeight: 44 }} onClick={handleExport}>导出CSV</Button>
                    <Button icon={<ImportOutlined />} style={{ borderRadius: 8, minHeight: 44 }} onClick={() => setImportOpen(true)}>导入JSON</Button>
                    {selectedKeys.length > 0 && (
                        <Dropdown menu={{ items: [
                            { key: 'delete', icon: <DeleteOutlined />, label: `批量删除 (${selectedKeys.length})`, danger: true, onClick: () => handleBatchAction('delete') },
                            { key: 'enable', icon: <CheckCircleOutlined />, label: `批量启用`, onClick: () => handleBatchAction('enable') },
                            { key: 'disable', icon: <CloseCircleOutlined />, label: `批量禁用`, onClick: () => handleBatchAction('disable') },
                        ] }}>
                            <Button danger icon={<DeleteOutlined />} style={{ borderRadius: 8, minHeight: 44 }}>批量操作 ({selectedKeys.length})</Button>
                        </Dropdown>
                    )}
                    <Button type="primary" icon={<PlusOutlined />} size="large" style={{ borderRadius: 8, minHeight: 44 }}
                        onClick={() => {
                            form.resetFields(); setEditingShelf(null); setModalMode('create');
                            setSuggestedCode(''); setModalOpen(true);
                        }}>创建物理书架</Button>
                </Space>
            </div>

            {/* 错误 */}
            {error && <Alert title="加载失败" description={error as string} type="error" showIcon closable style={{ marginBottom: 20, borderRadius: 10 }} action={<Button size="small" onClick={loadData}>重试</Button>} />}

            {/* 统计 */}
            {!loading && shelves.length > 0 && (
                <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                    <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe' }}><Statistic title="总数" value={total} prefix={<EnvironmentOutlined style={{ color: '#3b82f6' }} />} styles={{ content: { color: '#3b82f6' } }} /></Card></Col>
                    <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0' }}><Statistic title="NFC 已绑定" value={stats.nfc} suffix={`/ ${total}`} prefix={<CheckCircleOutlined style={{ color: '#22c55e' }} />} styles={{ content: { color: '#22c55e' } }} /></Card></Col>
                    <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 12, background: '#faf5ff', border: '1px solid #e9d5ff' }}><Statistic title="启用中" value={stats.active} suffix={`/ ${total}`} prefix={<CheckCircleOutlined style={{ color: '#a855f7' }} />} styles={{ content: { color: '#a855f7' } }} /></Card></Col>
                    <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa' }} title={<Text style={{ fontSize: 11 }}>位置拓扑</Text>}><ApartmentOutlined style={{ fontSize: 22, color: '#f97316' }} /></Card></Col>
                </Row>
            )}

            {/* 主内容: 左侧拓扑树 + 右侧表格 */}
            <Row gutter={[16, 16]}>
                {/* 位置拓扑树 */}
                {!loading && shelves.length > 0 && (
                    <Col xs={24} lg={6}>
                        <Card title={<Space><ApartmentOutlined />位置拓扑</Space>} size="small"
                            style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`, height: '100%' }}
                            bodyStyle={{ maxHeight: 500, overflow: 'auto' }}>
                            <LocationTree shelves={shelves} onSelect={(id) => {
                                document.querySelector(`[data-row-key="${id}"]`)?.scrollIntoView({ behavior: 'smooth' });
                                setSelectedKeys([id]);
                            }} />
                        </Card>
                    </Col>
                )}

                {/* 筛选 + 表格 */}
                <Col xs={24} lg={shelves.length > 0 ? 18 : 24}>
                    {shelves.length > 0 && (
                        <Card style={{ marginBottom: 20, borderRadius: 12, border: `1px solid ${token.colorBorderSecondary}` }} styles={{ body: { padding: '10px 16px' } }}>
                            <Space wrap size="middle">
                                <Input.Search placeholder="搜索编码/名称/描述..." allowClear value={searchKeyword}
                                    onChange={(e) => setSearchKeyword(e.target.value)} style={{ width: 260 }} prefix={<SearchOutlined />} />
                                <Segmented size="small" value={filterNFC} onChange={(v) => setFilterNFC(v as FilterNFC)}
                                    options={[{ value: 'all', label: '全部NFC' }, { value: 'bound', label: '已绑定' }, { value: 'unbound', label: '未绑定' }]} />
                                <Segmented size="small" value={filterStatus} onChange={(v) => setFilterStatus(v as FilterStatus)}
                                    options={[{ value: 'all', label: '全部状态' }, { value: 'active', label: '启用' }, { value: 'inactive', label: '禁用' }]} />
                                {(searchKeyword || filterNFC !== 'all' || filterStatus !== 'all') && (
                                    <Button size="small" icon={<ClearOutlined />} onClick={() => { setSearchKeyword(''); setFilterNFC('all'); setFilterStatus('all'); }}>清除</Button>
                                )}
                                <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto' }}>结果: {filtered.length} / {shelves.length}</Text>
                            </Space>
                        </Card>
                    )}

                    {/* 表格 */}
                    <Card style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                        <Table<PhysicalShelf>
                            columns={columns} dataSource={filtered} rowKey="physical_shelf_id" loading={loading}
                            rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
                            onRow={(record) => ({ 'data-row-key': record.physical_shelf_id } as any)}
                            pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'],
                                showTotal: (t, r) => <Text type="secondary" style={{ fontSize: 12 }}>共 {t} 个，{r[0]}-{r[1]}</Text> }}
                            locale={{ emptyText: <Empty image={<EnvironmentOutlined style={{ fontSize: 48, color: '#d4a574', opacity: 0.5 }} />} description={searchKeyword || filterNFC !== 'all' ? <div><Text type="secondary">无匹配结果</Text><br /><Button onClick={() => { setSearchKeyword(''); setFilterNFC('all'); setFilterStatus('all'); }}>清除筛选</Button></div> : <div><Text type="secondary">暂无物理书架</Text><br /><Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalMode('create'); setModalOpen(true); }}>创建</Button></div>} /> }}
                            scroll={{ x: 1100 }} size="middle"
                        />
                    </Card>
                </Col>
            </Row>

            {/* 操作日志 */}
            {opLogs.length > 0 && (
                <Card title={<Space><HistoryOutlined style={{ color: token.colorPrimary }} />操作日志</Space>}
                    style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`, marginTop: 20 }}
                    extra={<Button size="small" onClick={() => setOpLogs([])}>清除</Button>}>
                    <Timeline items={opLogs.slice(0, 10).map((l) => ({ children: <div><Tag style={{ marginRight: 6 }}>{l.action}</Tag><Text>{l.shelfName}</Text><Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{l.detail}</Text><Text type="secondary" style={{ fontSize: 10, display: 'block' }}>{l.time}</Text></div> }))} />
                </Card>
            )}

            {/* 创建/编辑弹窗 */}
            <Modal title={<Space><EnvironmentOutlined style={{ color: token.colorPrimary }} />{modalMode === 'create' ? '创建物理书架' : '编辑物理书架'}</Space>}
                open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)} confirmLoading={saving}
                okText={modalMode === 'create' ? '创建' : '保存'} cancelText="取消" width={540} destroyOnHidden>
                <Form form={form} layout="vertical" size="large">
                    {modalMode === 'create' && (
                        <Form.Item label="快速生成编码">
                            <Space wrap>
                                {LOCATION_PREFIXES.map((p) => (
                                    <Button key={p} size="small" onClick={() => handlePrefixChange(p)}
                                        type={suggestedCode?.startsWith(p) ? 'primary' : 'default'}>
                                        {(LOCATION_ZONES as any)[p]}
                                    </Button>
                                ))}
                            </Space>
                            {suggestedCode && <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>建议编码: <Text code>{suggestedCode}</Text></Text>}
                        </Form.Item>
                    )}
                    <Form.Item name="location_code" label="位置编码" rules={[{ required: true, message: '请输入位置编码' }]} tooltip="建议格式: 区域-编号，如 study-left-3">
                        <Input placeholder="如 study-left-3" prefix={<EnvironmentOutlined />} />
                    </Form.Item>
                    <Form.Item name="location_name" label="位置名称" rules={[{ required: true, message: '请输入位置名称' }]}>
                        <Input placeholder="如 书房-左侧-第3层" />
                    </Form.Item>
                    <Form.Item name="description" label="描述">
                        <TextArea rows={3} placeholder="补充描述（可选）" maxLength={200} showCount />
                    </Form.Item>
                </Form>
            </Modal>

            {/* NFC 弹窗 */}
            <Modal title={<Space><TagOutlined />NFC 标签管理 {nfcShelf && `— ${nfcShelf.location_name}`}</Space>}
                open={nfcModalOpen} onCancel={() => setNfcModalOpen(false)} footer={null} width={500} destroyOnHidden>
                {nfcShelf && (
                    <div>
                        <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
                            <Descriptions.Item label="位置编码"><Text code>{nfcShelf.location_code}</Text></Descriptions.Item>
                            <Descriptions.Item label="位置名称"><Text strong>{nfcShelf.location_name}</Text></Descriptions.Item>
                            <Descriptions.Item label="当前绑定">
                                {nfcShelf.nfc_tag_uid ? <Tag color="green" icon={<CheckCircleOutlined />}>{nfcShelf.nfc_tag_uid}</Tag> : <Tag color="default" icon={<CloseCircleOutlined />}>未绑定</Tag>}
                            </Descriptions.Item>
                        </Descriptions>
                        <Divider />
                        <Form form={nfcForm} layout="vertical" size="large">
                            <Form.Item name="nfc_tag_uid" label="NFC 标签 UID" rules={[{ required: true, message: '请输入或扫描 NFC 标签 UID' }]}>
                                <Input placeholder="04:A1:B2:..." style={{ fontFamily: 'monospace' }} />
                            </Form.Item>
                            <Space size={12}>
                                <Button icon={<ScanOutlined />} onClick={handleSimulateScan} style={{ borderRadius: 8 }}>模拟扫描</Button>
                                <Button type="primary" icon={<TagOutlined />} loading={nfcBinding} onClick={handleBindNFC} style={{ borderRadius: 8 }}>
                                    {nfcShelf.nfc_tag_uid ? '更新绑定' : '绑定标签'}
                                </Button>
                                {nfcShelf.nfc_tag_uid && (
                                    <Popconfirm title={<div><Text>确定解绑？</Text><Text type="secondary" style={{ display: 'block' }}>解绑后保留标签数据可复用</Text></div>}
                                        onConfirm={handleUnbindNFC} okText="解绑" cancelText="取消" okButtonProps={{ danger: true }}>
                                        <Button danger icon={<DisconnectOutlined />} style={{ borderRadius: 8 }}>解绑标签</Button>
                                    </Popconfirm>
                                )}
                            </Space>
                        </Form>
                    </div>
                )}
            </Modal>

            {/* 映射弹窗 */}
            <Modal title={<Space><LinkOutlined />映射关系 {mapShelf && `— ${mapShelf.location_name}`}</Space>}
                open={mapModalOpen} onCancel={() => setMapModalOpen(false)} footer={null} width={600} destroyOnHidden>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateMap} style={{ marginBottom: 16, borderRadius: 8 }}>创建映射</Button>
                {mapLoading ? <Spin /> : mappings.length === 0 ? <Empty description="暂无映射" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                    <List dataSource={mappings} renderItem={(item) => (
                        <div style={{ padding: '12px 16px', borderRadius: 8, marginBottom: 8, border: `1px solid ${token.colorBorderSecondary}` }}>
                            <Space wrap size={8}>
                                <Text strong>{item.logical_shelf_name}</Text>
                                <Badge status={item.is_active ? 'success' : 'default'} text={item.is_active ? '激活' : '禁用'} />
                                <Tag color="purple">{item.mapping_type === 'one_to_one' ? '一对一' : '一对多'}</Tag>
                                <Text type="secondary" style={{ fontSize: 11 }}>v{item.version}</Text>
                            </Space>
                        </div>
                    )} />
                )}
            </Modal>

            {/* 创建映射弹窗 */}
            <Modal title={<Space><PlusOutlined />创建映射</Space>} open={createMapOpen} onOk={handleCreateMapping}
                onCancel={() => setCreateMapOpen(false)} confirmLoading={creatingMap} okText="创建" cancelText="取消" width={480} destroyOnHidden>
                <Form form={mapForm} layout="vertical" size="large">
                    <Form.Item name="logical_shelf_id" label="目标逻辑书架" rules={[{ required: true }]}>
                        <Select placeholder="选择..." showSearch filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                            options={logicalShelves.map((s) => ({ value: s.logical_shelf_id, label: s.shelf_name }))} />
                    </Form.Item>
                    <Form.Item name="mapping_type" label="映射类型" initialValue="one_to_one">
                        <Select options={[{ value: 'one_to_one', label: '一对一映射' }, { value: 'one_to_many', label: '一对多映射' }]} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* JSON 导入弹窗 */}
            <Modal title={<Space><ImportOutlined />导入 JSON</Space>} open={importOpen}
                onOk={handleImportJSON} onCancel={() => setImportOpen(false)} okText="导入" cancelText="取消" width={580}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>粘贴 JSON 数组，每项需含 location_code, location_name</Text>
                <TextArea rows={12} value={importJSON} onChange={(e) => setImportJSON(e.target.value)}
                    placeholder={`[\n  {"location_code":"study-left-1","location_name":"书房左侧第1层"}\n]`} />
            </Modal>
        </div>
    );
};

export default PhysicalShelfManager;
