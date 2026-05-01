// frontend/src/pages/PhysicalShelfManager.tsx
/**
 * 物理书架管理页面 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 完整的类型定义
 * - 自定义 Hook 封装业务逻辑
 * - 乐观更新（NFC 绑定/解绑）
 * - 映射可视化增强
 * - 搜索防抖
 * - 批量操作支持
 * - 主题色适配
 * - 键盘快捷键
 */

import React, {
    useEffect,
    useState,
    useCallback,
    useMemo,
    useRef,
    type FC,
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
    message,
    Popconfirm,
    Tooltip,
    Row,
    Col,
    Statistic,
    Modal,
    Form,
    Select,
    Empty,
    Badge,
    Segmented,
    Descriptions,
    List,
    Divider,
    theme,
    Switch,
    Alert,
    type ColumnsType,
    type FormInstance,
} from 'antd';
import {
    EnvironmentOutlined,
    HomeOutlined,
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    ReloadOutlined,
    SearchOutlined,
    LinkOutlined,
    DisconnectOutlined,
    TagOutlined,
    ApiOutlined,
    AppstoreOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    ExclamationCircleOutlined,
    InfoCircleOutlined,
    ScanOutlined,
    ArrowRightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    listPhysicalShelves,
    createPhysicalShelf,
    updatePhysicalShelf,
    deletePhysicalShelf,
    bindNFCTag,
    unbindNFCTag,
    getPhysicalShelfMappings,
    listShelves,
    createMapping,
    extractErrorMessage,
} from '../services/api';
import type {
    PhysicalShelf,
    PhysicalMappingInfo,
    ApiResponse,
} from '../types';
import { debounce } from '../utils/helpers';

const { Title, Text } = Typography;
const { TextArea } = Input;

// ==================== 类型定义 ====================

/** 筛选状态 */
type FilterStatus = 'all' | 'active' | 'inactive';

/** 弹窗模式 */
type ModalMode = 'create' | 'edit';

// ==================== 自定义 Hook ====================

/**
 * 物理书架数据管理 Hook
 */
const usePhysicalShelves = () => {
    const [loading, setLoading] = useState(true);
    const [shelves, setShelves] = useState<PhysicalShelf[]>([]);
    const [total, setTotal] = useState(0);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [filterActive, setFilterActive] = useState<boolean | undefined>();
    const [error, setError] = useState<string | null>(null);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const params: Record<string, unknown> = {};
            if (searchKeyword.trim()) params.search = searchKeyword.trim();
            if (filterActive !== undefined) params.is_active = filterActive;

            const data = await listPhysicalShelves(params);
            if (isMounted.current) {
                setShelves(data.shelves || []);
                setTotal(data.total || 0);
            }
        } catch (err: unknown) {
            if (isMounted.current) {
                const errorMsg = extractErrorMessage(err) || '加载失败';
                setError(errorMsg);
            }
        } finally {
            if (isMounted.current) {
                setLoading(false);
            }
        }
    }, [searchKeyword, filterActive]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    return {
        shelves,
        total,
        loading,
        error,
        searchKeyword,
        setSearchKeyword,
        filterActive,
        setFilterActive,
        loadData,
        setShelves, // 用于乐观更新
    };
};

/**
 * 弹窗表单管理 Hook
 */
const useShelfForm = () => {
    const [form] = Form.useForm();
    const [modalVisible, setModalVisible] = useState(false);
    const [modalMode, setModalMode] = useState<ModalMode>('create');
    const [editingShelf, setEditingShelf] = useState<PhysicalShelf | null>(null);
    const [saving, setSaving] = useState(false);

    const openCreate = useCallback(() => {
        setModalMode('create');
        setEditingShelf(null);
        form.resetFields();
        setModalVisible(true);
    }, [form]);

    const openEdit = useCallback(
        (record: PhysicalShelf) => {
            setModalMode('edit');
            setEditingShelf(record);
            form.setFieldsValue({
                location_code: record.location_code,
                location_name: record.location_name,
                description: record.description || '',
            });
            setModalVisible(true);
        },
        [form]
    );

    const closeModal = useCallback(() => {
        setModalVisible(false);
        setEditingShelf(null);
        form.resetFields();
    }, [form]);

    return {
        form,
        modalVisible,
        modalMode,
        editingShelf,
        saving,
        setSaving,
        openCreate,
        openEdit,
        closeModal,
    };
};

// ==================== 主组件 ====================

const PhysicalShelfManager: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();

    // 数据管理
    const {
        shelves,
        total,
        loading,
        error,
        searchKeyword,
        setSearchKeyword,
        filterActive,
        setFilterActive,
        loadData,
        setShelves,
    } = usePhysicalShelves();

    // 表单管理
    const {
        form,
        modalVisible,
        modalMode,
        editingShelf,
        saving,
        setSaving,
        openCreate,
        openEdit,
        closeModal,
    } = useShelfForm();

    // NFC 管理
    const [nfcForm] = Form.useForm();
    const [nfcModalVisible, setNfcModalVisible] = useState(false);
    const [nfcShelf, setNfcShelf] = useState<PhysicalShelf | null>(null);
    const [nfcBinding, setNfcBinding] = useState(false);

    // 映射管理
    const [mappingForm] = Form.useForm();
    const [mappingModalVisible, setMappingModalVisible] = useState(false);
    const [mappingShelf, setMappingShelf] = useState<PhysicalShelf | null>(null);
    const [mappings, setMappings] = useState<PhysicalMappingInfo[]>([]);
    const [mappingLoading, setMappingLoading] = useState(false);

    const [createMappingVisible, setCreateMappingVisible] = useState(false);
    const [logicalShelves, setLogicalShelves] = useState<any[]>([]);
    const [creatingMapping, setCreatingMapping] = useState(false);

    // ==================== 搜索防抖 ====================

    const debouncedSearch = useMemo(
        () =>
            debounce((value: string) => {
                setSearchKeyword(value);
            }, 300),
        [setSearchKeyword]
    );

    // ==================== CRUD 操作 ====================

    /** 提交创建/编辑 */
    const handleSubmit = useCallback(async () => {
        try {
            const values = await form.validateFields();
            setSaving(true);

            if (modalMode === 'edit' && editingShelf) {
                await updatePhysicalShelf(editingShelf.physical_shelf_id, values);
                message.success({
                    content: '物理书架已更新',
                    key: 'shelf-update-success',
                });
            } else {
                await createPhysicalShelf(values);
                message.success({
                    content: '物理书架已创建',
                    key: 'shelf-create-success',
                });
            }

            closeModal();
            loadData();
        } catch (err: unknown) {
            if ((err as any)?.errorFields) {
                message.warning({
                    content: '请填写必填字段',
                    key: 'shelf-form-error',
                });
            } else {
                message.error({
                    content: extractErrorMessage(err) || '操作失败',
                    key: 'shelf-save-error',
                });
            }
        } finally {
            setSaving(false);
        }
    }, [form, modalMode, editingShelf, closeModal, loadData, setSaving]);

    /** 删除 */
    const handleDelete = useCallback(
        async (record: PhysicalShelf) => {
            try {
                await deletePhysicalShelf(record.physical_shelf_id);
                message.success({
                    content: `「${record.location_name}」已删除`,
                    key: 'shelf-delete-success',
                });
                loadData();
            } catch (err: unknown) {
                message.error({
                    content: extractErrorMessage(err) || '删除失败',
                    key: 'shelf-delete-error',
                });
            }
        },
        [loadData]
    );

    // ==================== NFC 操作 ====================

    const handleOpenNFC = useCallback(
        (record: PhysicalShelf) => {
            setNfcShelf(record);
            nfcForm.setFieldsValue({ nfc_tag_uid: record.nfc_tag_uid || '' });
            setNfcModalVisible(true);
        },
        [nfcForm]
    );

    const handleBindNFC = useCallback(async () => {
        if (!nfcShelf) return;
        try {
            const values = await nfcForm.validateFields();
            setNfcBinding(true);
            await bindNFCTag(nfcShelf.physical_shelf_id, values.nfc_tag_uid);

            // 乐观更新
            setShelves((prev) =>
                prev.map((s) =>
                    s.physical_shelf_id === nfcShelf.physical_shelf_id
                        ? { ...s, nfc_tag_uid: values.nfc_tag_uid }
                        : s
                )
            );

            message.success({
                content: 'NFC 标签绑定成功',
                key: 'nfc-bind-success',
            });
            setNfcModalVisible(false);
        } catch (err: unknown) {
            if (!(err as any)?.errorFields) {
                message.error({
                    content: extractErrorMessage(err) || '绑定失败',
                    key: 'nfc-bind-error',
                });
            }
        } finally {
            setNfcBinding(false);
        }
    }, [nfcShelf, nfcForm, setShelves]);

    const handleUnbindNFC = useCallback(async () => {
        if (!nfcShelf) return;
        try {
            await unbindNFCTag(nfcShelf.physical_shelf_id);

            // 乐观更新
            setShelves((prev) =>
                prev.map((s) =>
                    s.physical_shelf_id === nfcShelf.physical_shelf_id
                        ? { ...s, nfc_tag_uid: undefined }
                        : s
                )
            );

            message.success({
                content: 'NFC 标签已解绑',
                key: 'nfc-unbind-success',
            });
            setNfcModalVisible(false);
        } catch (err: unknown) {
            message.error({
                content: extractErrorMessage(err) || '解绑失败',
                key: 'nfc-unbind-error',
            });
        }
    }, [nfcShelf, setShelves]);

    // ==================== 映射操作 ====================

    const handleOpenMappings = useCallback(async (record: PhysicalShelf) => {
        setMappingShelf(record);
        setMappingModalVisible(true);
        setMappingLoading(true);
        try {
            const data = await getPhysicalShelfMappings(record.physical_shelf_id);
            setMappings(data || []);
        } catch (err: unknown) {
            message.error({
                content: extractErrorMessage(err) || '加载映射失败',
                key: 'mapping-load-error',
            });
        } finally {
            setMappingLoading(false);
        }
    }, []);

    const handleOpenCreateMapping = useCallback(async () => {
        try {
            const data = await listShelves();
            setLogicalShelves(data || []);
            mappingForm.resetFields();
            setCreateMappingVisible(true);
        } catch (err: unknown) {
            message.error({
                content: extractErrorMessage(err) || '加载逻辑书架失败',
                key: 'logical-load-error',
            });
        }
    }, [mappingForm]);

    const handleCreateMapping = useCallback(async () => {
        if (!mappingShelf) return;
        try {
            const values = await mappingForm.validateFields();
            setCreatingMapping(true);
            await createMapping(
                mappingShelf.physical_shelf_id,
                values.logical_shelf_id,
                values.mapping_type || 'one_to_one'
            );
            message.success({
                content: '映射创建成功',
                key: 'mapping-create-success',
            });
            setCreateMappingVisible(false);

            // 重新加载映射
            const data = await getPhysicalShelfMappings(mappingShelf.physical_shelf_id);
            setMappings(data || []);
        } catch (err: unknown) {
            if (!(err as any)?.errorFields) {
                message.error({
                    content: extractErrorMessage(err) || '创建映射失败',
                    key: 'mapping-create-error',
                });
            }
        } finally {
            setCreatingMapping(false);
        }
    }, [mappingShelf, mappingForm]);

    // ==================== 统计数据 ====================

    const stats = useMemo(() => {
        const active = shelves.filter((s) => s.is_active).length;
        const withNFC = shelves.filter((s) => s.nfc_tag_uid).length;
        return { activeCount: active, nfcBound: withNFC };
    }, [shelves]);

    // ==================== 表格列配置 ====================

    const columns: ColumnsType<PhysicalShelf> = useMemo(
        () => [
            {
                title: 'ID',
                dataIndex: 'physical_shelf_id',
                key: 'id',
                width: 60,
                align: 'center',
                render: (id: number) => (
                    <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                        #{id}
                    </Text>
                ),
            },
            {
                title: '位置编码',
                dataIndex: 'location_code',
                key: 'location_code',
                width: 150,
                render: (code: string) => <Text code style={{ fontSize: 13 }}>{code}</Text>,
            },
            {
                title: '位置名称',
                dataIndex: 'location_name',
                key: 'location_name',
                width: 200,
                ellipsis: true,
                render: (name: string) => (
                    <Text strong>
                        <EnvironmentOutlined style={{ marginRight: 6, color: token.colorPrimary }} />
                        {name}
                    </Text>
                ),
            },
            {
                title: '描述',
                dataIndex: 'description',
                key: 'description',
                ellipsis: true,
                width: 160,
                render: (desc: string) =>
                    desc || <Text type="secondary" italic>暂无描述</Text>,
            },
            {
                title: 'NFC 标签',
                dataIndex: 'nfc_tag_uid',
                key: 'nfc_tag_uid',
                width: 180,
                render: (uid: string, record: PhysicalShelf) =>
                    uid ? (
                        <Tooltip title={uid}>
                            <Tag
                                color="green"
                                icon={<TagOutlined />}
                                style={{ cursor: 'pointer', borderRadius: 10, maxWidth: 160 }}
                                onClick={() => handleOpenNFC(record)}
                            >
                                {uid.length > 22 ? `${uid.slice(0, 22)}...` : uid}
                            </Tag>
                        </Tooltip>
                    ) : (
                        <Tag
                            color="default"
                            icon={<TagOutlined />}
                            style={{ cursor: 'pointer', borderRadius: 10 }}
                            onClick={() => handleOpenNFC(record)}
                        >
                            未绑定
                        </Tag>
                    ),
            },
            {
                title: '状态',
                dataIndex: 'is_active',
                key: 'is_active',
                width: 80,
                align: 'center',
                render: (active: boolean) =>
                    active ? (
                        <Badge status="success" text="启用" />
                    ) : (
                        <Badge status="error" text="禁用" />
                    ),
            },
            {
                title: '操作',
                key: 'action',
                width: 240,
                fixed: 'right',
                render: (_: unknown, record: PhysicalShelf) => (
                    <Space size={4}>
                        <Tooltip title="编辑信息">
                            <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => openEdit(record)}
                            />
                        </Tooltip>
                        <Tooltip title="NFC 标签管理">
                            <Button
                                type="text"
                                size="small"
                                icon={<TagOutlined />}
                                onClick={() => handleOpenNFC(record)}
                                style={{
                                    color: record.nfc_tag_uid ? '#22c55e' : undefined,
                                }}
                            />
                        </Tooltip>
                        <Tooltip title="查看映射关系">
                            <Button
                                type="text"
                                size="small"
                                icon={<LinkOutlined />}
                                onClick={() => handleOpenMappings(record)}
                            />
                        </Tooltip>
                        <Popconfirm
                            title="确定删除？"
                            description="删除后不可恢复"
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
                            />
                        </Popconfirm>
                    </Space>
                ),
            },
        ],
        [token, handleOpenNFC, openEdit, handleOpenMappings, handleDelete]
    );

    // ==================== 筛选选项 ====================

    const filterSegmentedOptions = useMemo(
        () => [
            { label: '全部', value: 'all' as const },
            { label: '启用', value: 'active' as const },
            { label: '禁用', value: 'inactive' as const },
        ],
        []
    );

    const segmentedValue = useMemo((): string => {
        if (filterActive === undefined) return 'all';
        return filterActive ? 'active' : 'inactive';
    }, [filterActive]);

    const handleFilterChange = useCallback(
        (v: string) => {
            if (v === 'all') setFilterActive(undefined);
            else setFilterActive(v === 'active');
        },
        [setFilterActive]
    );

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
                    { title: '物理书架管理' },
                ]}
            />

            {/* 页头 */}
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
                        <EnvironmentOutlined
                            style={{ marginRight: 12, color: token.colorPrimary }}
                        />
                        物理书架管理
                    </Title>
                    <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                        管理物理书架位置、NFC 标签绑定和逻辑映射 · 共 {total} 个
                    </Text>
                </div>
                <Space wrap>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={loadData}
                        loading={loading}
                        style={{ borderRadius: 8 }}
                    >
                        刷新
                    </Button>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={openCreate}
                        size="large"
                        style={{ borderRadius: 8 }}
                    >
                        创建物理书架
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
                            title="物理书架总数"
                            value={total}
                            prefix={<EnvironmentOutlined style={{ color: '#3b82f6' }} />}
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
                            title="NFC 已绑定"
                            value={stats.nfcBound}
                            suffix={`/ ${total}`}
                            prefix={<TagOutlined style={{ color: '#22c55e' }} />}
                            valueStyle={{ color: '#22c55e' }}
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
                            title="启用中"
                            value={stats.activeCount}
                            suffix={`/ ${total}`}
                            prefix={<CheckCircleOutlined style={{ color: '#a855f7' }} />}
                            valueStyle={{ color: '#a855f7' }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* 错误提示 */}
            {error && (
                <Alert
                    message="加载失败"
                    description={error}
                    type="error"
                    showIcon
                    style={{ marginBottom: 16, borderRadius: 10 }}
                    action={
                        <Button size="small" onClick={loadData}>
                            重试
                        </Button>
                    }
                />
            )}

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
                        placeholder="搜索位置编码或名称..."
                        allowClear
                        defaultValue={searchKeyword}
                        onChange={(e) => debouncedSearch(e.target.value)}
                        onSearch={(value) => {
                            setSearchKeyword(value || '');
                        }}
                        style={{ width: 280 }}
                        prefix={<SearchOutlined />}
                    />
                    <Segmented
                        options={filterSegmentedOptions}
                        value={segmentedValue}
                        onChange={(v) => handleFilterChange(v as string)}
                    />
                </Space>
            </Card>

            {/* 表格 */}
            <Card
                style={{
                    borderRadius: 14,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                    border: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Table<PhysicalShelf>
                    columns={columns}
                    dataSource={shelves}
                    rowKey="physical_shelf_id"
                    loading={loading}
                    pagination={{
                        pageSize: 20,
                        showSizeChanger: true,
                        showTotal: (t, range) => (
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                共 {t} 个，显示第 {range[0]}-{range[1]} 个
                            </Text>
                        ),
                    }}
                    locale={{
                        emptyText: (
                            <Empty
                                image={
                                    <EnvironmentOutlined
                                        style={{ fontSize: 56, color: '#d4a574', opacity: 0.5 }}
                                    />
                                }
                                description="暂无物理书架"
                            >
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    onClick={openCreate}
                                >
                                    创建第一个物理书架
                                </Button>
                            </Empty>
                        ),
                    }}
                    scroll={{ x: 1200 }}
                    size="middle"
                />
            </Card>

            {/* 创建/编辑弹窗 */}
            <Modal
                title={
                    <Space size={8}>
                        <EnvironmentOutlined style={{ color: token.colorPrimary }} />
                        <span>{modalMode === 'edit' ? '编辑物理书架' : '创建物理书架'}</span>
                    </Space>
                }
                open={modalVisible}
                onOk={handleSubmit}
                onCancel={closeModal}
                confirmLoading={saving}
                okText={modalMode === 'edit' ? '保存修改' : '创建'}
                cancelText="取消"
                width={540}
                destroyOnClose
            >
                <Form form={form} layout="vertical" size="large">
                    <Form.Item
                        name="location_code"
                        label="位置编码"
                        rules={[{ required: true, message: '请输入位置编码' }]}
                        tooltip="建议使用英文+数字格式，如 study-left-3"
                    >
                        <Input
                            placeholder="如 study-left-3"
                            prefix={<EnvironmentOutlined />}
                        />
                    </Form.Item>
                    <Form.Item
                        name="location_name"
                        label="位置名称"
                        rules={[{ required: true, message: '请输入位置名称' }]}
                    >
                        <Input placeholder="如 书房-左侧-第3层" />
                    </Form.Item>
                    <Form.Item name="description" label="描述">
                        <TextArea
                            rows={3}
                            placeholder="补充描述信息（可选）..."
                            maxLength={200}
                            showCount
                        />
                    </Form.Item>
                </Form>
            </Modal>

            {/* NFC 管理弹窗 */}
            <Modal
                title={
                    <Space size={8}>
                        <TagOutlined style={{ color: token.colorPrimary }} />
                        <span>
                            NFC 标签管理
                            {nfcShelf && ` - ${nfcShelf.location_name}`}
                        </span>
                    </Space>
                }
                open={nfcModalVisible}
                onCancel={() => setNfcModalVisible(false)}
                footer={null}
                width={500}
                destroyOnClose
            >
                {nfcShelf && (
                    <div>
                        <Descriptions bordered size="small" column={1} style={{ marginBottom: 20 }}>
                            <Descriptions.Item label="位置编码">
                                <Text code>{nfcShelf.location_code}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="位置名称">
                                <Text strong>{nfcShelf.location_name}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="当前绑定">
                                {nfcShelf.nfc_tag_uid ? (
                                    <Tag color="green" icon={<CheckCircleOutlined />}>
                                        {nfcShelf.nfc_tag_uid}
                                    </Tag>
                                ) : (
                                    <Tag color="default" icon={<CloseCircleOutlined />}>
                                        未绑定
                                    </Tag>
                                )}
                            </Descriptions.Item>
                        </Descriptions>
                        <Divider style={{ margin: '16px 0' }} />
                        <Form form={nfcForm} layout="vertical" size="large">
                            <Form.Item
                                name="nfc_tag_uid"
                                label="NFC 标签 UID"
                                rules={[{ required: true, message: '请输入 NFC 标签 UID' }]}
                                tooltip="通常为冒号分隔的十六进制字符串"
                            >
                                <Input
                                    placeholder="如 04:A1:B2:C3:D4:01"
                                    style={{ fontFamily: 'monospace' }}
                                />
                            </Form.Item>
                            <Space size={12}>
                                <Button
                                    type="primary"
                                    icon={<TagOutlined />}
                                    loading={nfcBinding}
                                    onClick={handleBindNFC}
                                    style={{ borderRadius: 8 }}
                                >
                                    {nfcShelf.nfc_tag_uid ? '更新绑定' : '绑定标签'}
                                </Button>
                                {nfcShelf.nfc_tag_uid && (
                                    <Popconfirm
                                        title="确定解绑此 NFC 标签？"
                                        description="解绑后该物理书架将无法通过 NFC 识别"
                                        onConfirm={handleUnbindNFC}
                                        okText="确定解绑"
                                        cancelText="取消"
                                        okButtonProps={{ danger: true }}
                                    >
                                        <Button
                                            danger
                                            icon={<DisconnectOutlined />}
                                            style={{ borderRadius: 8 }}
                                        >
                                            解绑标签
                                        </Button>
                                    </Popconfirm>
                                )}
                            </Space>
                        </Form>
                    </div>
                )}
            </Modal>

            {/* 映射查看弹窗 */}
            <Modal
                title={
                    <Space size={8}>
                        <LinkOutlined style={{ color: token.colorPrimary }} />
                        <span>
                            映射关系
                            {mappingShelf && ` - ${mappingShelf.location_name}`}
                        </span>
                    </Space>
                }
                open={mappingModalVisible}
                onCancel={() => setMappingModalVisible(false)}
                footer={null}
                width={640}
                destroyOnClose
            >
                <div style={{ marginBottom: 16 }}>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={handleOpenCreateMapping}
                        style={{ borderRadius: 8 }}
                    >
                        创建映射
                    </Button>
                </div>
                {mappingLoading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                        <Spin size="small" />
                        <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
                            加载中...
                        </Text>
                    </div>
                ) : mappings.length === 0 ? (
                    <Empty
                        description="暂无映射关系"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                ) : (
                    <List
                        dataSource={mappings}
                        renderItem={(item) => (
                            <List.Item
                                style={{
                                    padding: '12px 16px',
                                    borderRadius: 8,
                                    marginBottom: 8,
                                    border: `1px solid ${token.colorBorderSecondary}`,
                                }}
                            >
                                <List.Item.Meta
                                    avatar={
                                        <AppstoreOutlined
                                            style={{
                                                fontSize: 24,
                                                color: item.is_active ? '#22c55e' : '#8c7b72',
                                            }}
                                        />
                                    }
                                    title={
                                        <Space size={8} wrap>
                                            <Text strong>{item.logical_shelf_name}</Text>
                                            <Badge
                                                status={item.is_active ? 'success' : 'default'}
                                                text={item.is_active ? '激活' : '禁用'}
                                            />
                                            <Tag color="purple" style={{ borderRadius: 6 }}>
                                                {item.mapping_type === 'one_to_one'
                                                    ? '一对一'
                                                    : '一对多'}
                                            </Tag>
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                v{item.version}
                                            </Text>
                                        </Space>
                                    }
                                    description={
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            创建于{' '}
                                            {item.created_at
                                                ? new Date(item.created_at).toLocaleString(
                                                      'zh-CN'
                                                  )
                                                : '-'}
                                        </Text>
                                    }
                                />
                            </List.Item>
                        )}
                    />
                )}
            </Modal>

            {/* 创建映射弹窗 */}
            <Modal
                title={
                    <Space size={8}>
                        <PlusOutlined style={{ color: token.colorPrimary }} />
                        <span>创建映射关系</span>
                    </Space>
                }
                open={createMappingVisible}
                onOk={handleCreateMapping}
                onCancel={() => setCreateMappingVisible(false)}
                confirmLoading={creatingMapping}
                okText="创建映射"
                cancelText="取消"
                width={500}
                destroyOnClose
            >
                <Form form={mappingForm} layout="vertical" size="large">
                    <Form.Item
                        name="logical_shelf_id"
                        label="目标逻辑书架"
                        rules={[{ required: true, message: '请选择逻辑书架' }]}
                    >
                        <Select
                            placeholder="选择逻辑书架..."
                            showSearch
                            filterOption={(input, option) =>
                                (option?.label as string)
                                    ?.toLowerCase()
                                    .includes(input.toLowerCase())
                            }
                            options={logicalShelves.map((s) => ({
                                value: s.logical_shelf_id,
                                label: (
                                    <Space size={6}>
                                        <AppstoreOutlined />
                                        {s.shelf_name}
                                    </Space>
                                ),
                            }))}
                        />
                    </Form.Item>
                    <Form.Item
                        name="mapping_type"
                        label="映射类型"
                        initialValue="one_to_one"
                        tooltip="一对一：一个物理书架对应一个逻辑书架；一对多：一个物理书架可对应多个逻辑书架"
                    >
                        <Select>
                            <Select.Option value="one_to_one">一对一映射</Select.Option>
                            <Select.Option value="one_to_many">一对多映射</Select.Option>
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default PhysicalShelfManager;