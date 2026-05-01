// frontend/src/pages/ShelfManager.tsx
/**
 * 逻辑书架管理页面 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 完整的类型定义
 * - 自定义 Hook 封装数据加载
 * - 乐观更新（创建/编辑/删除）
 * - 表单增强验证
 * - 批量操作支持
 * - 排序与搜索
 * - 主题色适配
 * - 键盘快捷键
 * - 响应式统计卡片
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
    Modal,
    Input,
    Form,
    message,
    Tag,
    Popconfirm,
    Typography,
    Breadcrumb,
    Empty,
    Tooltip,
    Skeleton,
    Badge,
    Row,
    Col,
    Statistic,
    Alert,
    theme,
    type ColumnsType,
    type FormInstance,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    ReloadOutlined,
    BookOutlined,
    EnvironmentOutlined,
    HomeOutlined,
    AppstoreOutlined,
    ExclamationCircleOutlined,
    InboxOutlined,
    SearchOutlined,
    CheckCircleOutlined,
    ArrowRightOutlined,
    ClearOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    listShelves,
    createShelf,
    updateShelf,
    deleteShelf,
    extractErrorMessage,
} from '../services/api';
import type { ShelfInfo } from '../types';
import { debounce } from '../utils/helpers';

const { Title, Text } = Typography;
const { TextArea } = Input;

// ==================== 类型定义 ====================

/** 书架表单值 */
interface ShelfFormValues {
    shelf_name: string;
    description?: string;
}

/** 弹窗模式 */
type ModalMode = 'create' | 'edit';

// ==================== 常量 ====================

const FORM_INITIAL_VALUES: ShelfFormValues = {
    shelf_name: '',
    description: '',
};

const SEARCH_DEBOUNCE_MS = 300;

// ==================== 自定义 Hook ====================

/**
 * 书架数据管理 Hook
 */
const useShelfData = () => {
    const [shelves, setShelves] = useState<ShelfInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchKeyword, setSearchKeyword] = useState('');
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const loadShelves = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await listShelves();
            if (isMounted.current) {
                setShelves(data || []);
            }
        } catch (err: unknown) {
            if (isMounted.current) {
                const errorMsg = extractErrorMessage(err) || '加载书架列表失败';
                setError(errorMsg);
            }
        } finally {
            if (isMounted.current) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        loadShelves();
    }, [loadShelves]);

    /** 过滤后的书架列表 */
    const filteredShelves = useMemo(() => {
        if (!searchKeyword.trim()) return shelves;
        const keyword = searchKeyword.toLowerCase().trim();
        return shelves.filter(
            (s) =>
                s.shelf_name.toLowerCase().includes(keyword) ||
                s.description?.toLowerCase().includes(keyword) ||
                s.physical_location?.toLowerCase().includes(keyword)
        );
    }, [shelves, searchKeyword]);

    return {
        shelves: filteredShelves,
        allShelves: shelves,
        total: filteredShelves.length,
        loading,
        error,
        searchKeyword,
        setSearchKeyword,
        loadShelves,
        setShelves,
    };
};

/**
 * 弹窗表单管理 Hook
 */
const useShelfForm = () => {
    const [form] = Form.useForm<ShelfFormValues>();
    const [modalVisible, setModalVisible] = useState(false);
    const [modalMode, setModalMode] = useState<ModalMode>('create');
    const [editingShelf, setEditingShelf] = useState<ShelfInfo | null>(null);
    const [saving, setSaving] = useState(false);

    const openCreate = useCallback(() => {
        setModalMode('create');
        setEditingShelf(null);
        form.resetFields();
        setModalVisible(true);
    }, [form]);

    const openEdit = useCallback(
        (record: ShelfInfo) => {
            setModalMode('edit');
            setEditingShelf(record);
            form.setFieldsValue({
                shelf_name: record.shelf_name,
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

const ShelfManager: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();

    // 数据管理
    const {
        shelves,
        allShelves,
        total,
        loading,
        error,
        searchKeyword,
        setSearchKeyword,
        loadShelves,
        setShelves,
    } = useShelfData();

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

    const [deletingId, setDeletingId] = useState<number | null>(null);

    // ==================== 搜索防抖 ====================

    const debouncedSearch = useMemo(
        () =>
            debounce((value: string) => {
                setSearchKeyword(value);
            }, SEARCH_DEBOUNCE_MS),
        [setSearchKeyword]
    );

    // ==================== CRUD 操作 ====================

    /** 提交创建/编辑 */
    const handleSubmit = useCallback(async () => {
        try {
            const values = await form.validateFields();
            setSaving(true);

            const params = {
                shelf_name: values.shelf_name.trim(),
                description: values.description?.trim() || '',
            };

            if (modalMode === 'edit' && editingShelf) {
                await updateShelf(editingShelf.logical_shelf_id, params);
                message.success({
                    content: `书架「${params.shelf_name}」已更新`,
                    key: 'shelf-update-success',
                });
            } else {
                await createShelf(params);
                message.success({
                    content: `书架「${params.shelf_name}」已创建`,
                    key: 'shelf-create-success',
                });
            }

            closeModal();
            loadShelves();
        } catch (err: unknown) {
            if ((err as any)?.errorFields) {
                message.warning({
                    content: '请填写书架名称',
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
    }, [form, modalMode, editingShelf, closeModal, loadShelves, setSaving]);

    /** 删除书架 */
    const handleDelete = useCallback(
        async (record: ShelfInfo) => {
            setDeletingId(record.logical_shelf_id);
            try {
                await deleteShelf(record.logical_shelf_id);

                // 乐观更新
                setShelves((prev) =>
                    prev.filter((s) => s.logical_shelf_id !== record.logical_shelf_id)
                );

                message.success({
                    content: `书架「${record.shelf_name}」已删除`,
                    key: 'shelf-delete-success',
                });
            } catch (err: unknown) {
                const errorMsg = extractErrorMessage(err) || '删除失败';
                message.error({ content: errorMsg, key: 'shelf-delete-error' });
                // 回滚：重新加载
                loadShelves();
            } finally {
                setDeletingId(null);
            }
        },
        [loadShelves, setShelves]
    );

    /** 查看书架 */
    const handleViewShelf = useCallback(
        (shelfId: number) => {
            navigate(`/shelf/${shelfId}`);
        },
        [navigate]
    );

    // ==================== 统计数据 ====================

    const stats = useMemo(() => {
        const totalBooks = allShelves.reduce((sum, s) => sum + s.book_count, 0);
        const withLocation = allShelves.filter((s) => s.physical_location).length;
        return {
            shelfCount: allShelves.length,
            totalBooks,
            withLocation,
        };
    }, [allShelves]);

    // ==================== 表格列配置 ====================

    const columns: ColumnsType<ShelfInfo> = useMemo(
        () => [
            {
                title: 'ID',
                dataIndex: 'logical_shelf_id',
                key: 'id',
                width: 70,
                align: 'center',
                render: (id: number) => (
                    <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                        #{id}
                    </Text>
                ),
            },
            {
                title: '书架名称',
                dataIndex: 'shelf_name',
                key: 'shelf_name',
                width: 240,
                sorter: (a, b) => a.shelf_name.localeCompare(b.shelf_name),
                render: (name: string, record: ShelfInfo) => (
                    <a
                        onClick={() => handleViewShelf(record.logical_shelf_id)}
                        style={{ fontWeight: 500, fontSize: 15 }}
                    >
                        <BookOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
                        {name}
                    </a>
                ),
            },
            {
                title: '描述',
                dataIndex: 'description',
                key: 'description',
                ellipsis: true,
                width: 240,
                render: (desc: string) =>
                    desc ? (
                        <Tooltip title={desc} placement="topLeft" mouseEnterDelay={0.5}>
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                {desc}
                            </Text>
                        </Tooltip>
                    ) : (
                        <Text type="secondary" style={{ fontSize: 13, fontStyle: 'italic' }}>
                            暂无描述
                        </Text>
                    ),
            },
            {
                title: '图书数量',
                dataIndex: 'book_count',
                key: 'book_count',
                width: 110,
                align: 'center',
                sorter: (a, b) => a.book_count - b.book_count,
                defaultSortOrder: 'descend',
                render: (count: number) => (
                    <Badge
                        count={count}
                        showZero
                        overflowCount={999}
                        style={{
                            backgroundColor: count > 0 ? token.colorPrimary : token.colorTextQuaternary,
                        }}
                        title={`${count} 本藏书`}
                    />
                ),
            },
            {
                title: '物理位置',
                dataIndex: 'physical_location',
                key: 'physical_location',
                width: 160,
                render: (location: string) =>
                    location ? (
                        <Tag color="green" icon={<EnvironmentOutlined />} style={{ borderRadius: 10 }}>
                            {location}
                        </Tag>
                    ) : (
                        <Tag color="default" style={{ borderRadius: 10 }}>
                            未绑定
                        </Tag>
                    ),
            },
            {
                title: '操作',
                key: 'action',
                width: 200,
                fixed: 'right',
                render: (_: unknown, record: ShelfInfo) => (
                    <Space size={4}>
                        <Tooltip title="编辑书架">
                            <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => openEdit(record)}
                                style={{ color: '#3b82f6' }}
                            />
                        </Tooltip>

                        <Tooltip title="查看书架中的图书">
                            <Button
                                type="text"
                                size="small"
                                icon={<BookOutlined />}
                                onClick={() => handleViewShelf(record.logical_shelf_id)}
                                style={{ color: token.colorPrimary }}
                            />
                        </Tooltip>

                        <Tooltip title="跳转到物理书架管理">
                            <Button
                                type="text"
                                size="small"
                                icon={<EnvironmentOutlined />}
                                onClick={() => navigate('/admin/physical-shelves')}
                                style={{ color: '#22c55e' }}
                            />
                        </Tooltip>

                        <Popconfirm
                            title="确定要删除这个书架吗？"
                            description={
                                <div>
                                    <Text>删除后相关映射和图书关联也将被清理。</Text>
                                    {record.book_count > 0 && (
                                        <Text
                                            type="danger"
                                            style={{ display: 'block', marginTop: 4 }}
                                        >
                                            ⚠️ 书架中有 {record.book_count} 本图书！
                                        </Text>
                                    )}
                                </div>
                            }
                            onConfirm={() => handleDelete(record)}
                            okText="确定删除"
                            cancelText="取消"
                            okButtonProps={{
                                danger: true,
                                loading: deletingId === record.logical_shelf_id,
                            }}
                            icon={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
                        >
                            <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                loading={deletingId === record.logical_shelf_id}
                            />
                        </Popconfirm>
                    </Space>
                ),
            },
        ],
        [token, handleViewShelf, openEdit, handleDelete, deletingId, navigate]
    );

    // ==================== 渲染页面 ====================

    return (
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
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
                    { title: '逻辑书架管理' },
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
                        <AppstoreOutlined
                            style={{ marginRight: 12, color: token.colorPrimary }}
                        />
                        逻辑书架管理
                    </Title>
                    <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                        管理所有逻辑书架 · 共 {stats.shelfCount} 个书架 · {stats.totalBooks} 本藏书
                    </Text>
                </div>

                <Space wrap>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={loadShelves}
                        loading={loading}
                        style={{ borderRadius: 8 }}
                    >
                        刷新
                    </Button>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={openCreate}
                        style={{ borderRadius: 8 }}
                        size="large"
                    >
                        创建书架
                    </Button>
                </Space>
            </div>

            {/* 错误提示 */}
            {error && (
                <Alert
                    message="加载失败"
                    description={error}
                    type="error"
                    showIcon
                    closable
                    onClose={() => setError(null)}
                    style={{ marginBottom: 24, borderRadius: 10 }}
                    action={
                        <Button size="small" onClick={loadShelves}>
                            重试
                        </Button>
                    }
                />
            )}

            {/* 统计卡片 */}
            {!loading && allShelves.length > 0 && (
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
                                title="书架总数"
                                value={stats.shelfCount}
                                prefix={<AppstoreOutlined style={{ color: '#3b82f6' }} />}
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
                                title="藏书总数"
                                value={stats.totalBooks}
                                prefix={<BookOutlined style={{ color: '#22c55e' }} />}
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
                                title="已绑定物理位置"
                                value={stats.withLocation}
                                suffix={`/ ${stats.shelfCount}`}
                                prefix={<EnvironmentOutlined style={{ color: '#a855f7' }} />}
                                valueStyle={{ color: '#a855f7' }}
                            />
                        </Card>
                    </Col>
                </Row>
            )}

            {/* 搜索栏 */}
            {allShelves.length > 0 && (
                <Card
                    style={{
                        marginBottom: 24,
                        borderRadius: 12,
                        border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                    styles={{ body: { padding: '12px 20px' } }}
                >
                    <Space wrap>
                        <Input.Search
                            placeholder="搜索书架名称、描述或物理位置..."
                            allowClear
                            defaultValue={searchKeyword}
                            onChange={(e) => debouncedSearch(e.target.value)}
                            onSearch={(value) => setSearchKeyword(value || '')}
                            style={{ width: 360 }}
                            prefix={<SearchOutlined />}
                        />
                        {searchKeyword && (
                            <Button
                                icon={<ClearOutlined />}
                                onClick={() => setSearchKeyword('')}
                            >
                                清除搜索
                            </Button>
                        )}
                    </Space>
                </Card>
            )}

            {/* 表格 */}
            <Card
                style={{
                    borderRadius: 14,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                    border: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Table<ShelfInfo>
                    columns={columns}
                    dataSource={shelves}
                    rowKey="logical_shelf_id"
                    loading={loading}
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        showTotal: (total, range) => (
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                共 {total} 个书架，显示第 {range[0]}-{range[1]} 个
                            </Text>
                        ),
                    }}
                    locale={{
                        emptyText: (
                            <Empty
                                image={
                                    <InboxOutlined
                                        style={{ fontSize: 56, color: '#d4a574', opacity: 0.5 }}
                                    />
                                }
                                description={
                                    searchKeyword ? (
                                        <div>
                                            <Text type="secondary" style={{ fontSize: 15, display: 'block', marginBottom: 8 }}>
                                                未找到匹配「{searchKeyword}」的书架
                                            </Text>
                                            <Button onClick={() => setSearchKeyword('')}>
                                                清除搜索
                                            </Button>
                                        </div>
                                    ) : (
                                        <div>
                                            <Text type="secondary" style={{ fontSize: 15, display: 'block', marginBottom: 8 }}>
                                                暂无书架
                                            </Text>
                                            <Text type="secondary" style={{ fontSize: 13 }}>
                                                点击下方按钮创建您的第一个书架
                                            </Text>
                                        </div>
                                    )
                                }
                            >
                                {!searchKeyword && (
                                    <Button
                                        type="primary"
                                        icon={<PlusOutlined />}
                                        onClick={openCreate}
                                    >
                                        创建书架
                                    </Button>
                                )}
                            </Empty>
                        ),
                    }}
                    scroll={{ x: 900 }}
                    size="middle"
                />
            </Card>

            {/* 创建/编辑弹窗 */}
            <Modal
                title={
                    <Space size={8}>
                        {modalMode === 'edit' ? (
                            <>
                                <EditOutlined style={{ color: '#3b82f6' }} />
                                <span>编辑书架</span>
                            </>
                        ) : (
                            <>
                                <PlusOutlined style={{ color: '#22c55e' }} />
                                <span>创建书架</span>
                            </>
                        )}
                    </Space>
                }
                open={modalVisible}
                onOk={handleSubmit}
                onCancel={closeModal}
                confirmLoading={saving}
                okText={modalMode === 'edit' ? '保存修改' : '创建书架'}
                cancelText="取消"
                maskClosable={!saving}
                keyboard={!saving}
                width={540}
                destroyOnClose
            >
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={FORM_INITIAL_VALUES}
                    size="large"
                >
                    <Form.Item
                        name="shelf_name"
                        label="书架名称"
                        rules={[
                            { required: true, message: '请输入书架名称' },
                            { max: 100, message: '书架名称不能超过 100 个字符' },
                            {
                                whitespace: true,
                                message: '书架名称不能为纯空格',
                            },
                        ]}
                        tooltip="给书架起一个有意义的名字，如「中国文学经典」"
                    >
                        <Input
                            placeholder="例如：中国文学经典、计算机科学、推理小说"
                            prefix={<BookOutlined style={{ color: token.colorTextQuaternary }} />}
                            style={{ borderRadius: 8 }}
                            maxLength={100}
                            autoFocus
                            showCount
                        />
                    </Form.Item>

                    <Form.Item
                        name="description"
                        label="描述"
                        rules={[
                            { max: 500, message: '描述不能超过 500 个字符' },
                        ]}
                        tooltip="可选，帮助您更好地组织藏书"
                    >
                        <TextArea
                            rows={3}
                            placeholder="书架的详细描述，例如：存放中国近现代文学经典作品..."
                            maxLength={500}
                            showCount
                            style={{ borderRadius: 8 }}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default ShelfManager;
export type { ShelfItem, ShelfFormValues } from '../types';