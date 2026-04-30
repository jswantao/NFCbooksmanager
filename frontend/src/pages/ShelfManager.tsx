// frontend/src/pages/ShelfManager.tsx
/**
 * 书架管理页面
 * 
 * 提供逻辑书架的完整 CRUD 管理功能。
 * 
 * 功能：
 * - 书架列表展示（表格形式）
 * - 创建新书架（弹窗表单）
 * - 编辑书架信息（弹窗表单）
 * - 删除书架（带确认，检查是否为空）
 * - 快速跳转到书架详情
 * 
 * 表格列：
 * - ID：书架编号
 * - 书架名称：可点击跳转到书架页面
 * - 描述：悬停显示完整内容
 * - 图书数量：Badge 角标
 * - 物理位置：Tag 标签（已绑定/未绑定）
 * - 操作：编辑、查看、删除
 * 
 * 统计卡片：
 * - 书架总数
 * - 藏书总数
 * - 已绑定位（关联物理书架的数量）
 * 
 * 业务规则：
 * - 书架名称在激活状态下必须唯一
 * - 删除前检查是否为空书架（无在架图书）
 * - 创建/编辑使用同一弹窗，通过 editingShelf 状态区分
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
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
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    listShelves,
    createShelf,
    updateShelf,
    deleteShelf,
} from '../services/api';

// ---- 类型定义 ----

const { Title, Text } = Typography;
const { TextArea } = Input;

/** 书架列表项 */
interface ShelfItem {
    logical_shelf_id: number;
    shelf_name: string;
    description: string;
    book_count: number;
    physical_location?: string;
    physical_code?: string;
    created_at?: string;
}

/** 书架表单值 */
interface ShelfFormValues {
    shelf_name: string;
    description?: string;
}

// ---- 常量 ----

/** 表单初始值 */
const FORM_INITIAL_VALUES: ShelfFormValues = {
    shelf_name: '',
    description: '',
};

// ---- 主组件 ----

const ShelfManager: React.FC = () => {
    const navigate = useNavigate();
    const [form] = Form.useForm<ShelfFormValues>();

    // ==================== 状态 ====================

    const [shelves, setShelves] = useState<ShelfItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState<number | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingShelf, setEditingShelf] = useState<ShelfItem | null>(null);
    const [error, setError] = useState<string | null>(null);

    // ==================== 数据加载 ====================

    /** 加载书架列表 */
    const loadShelves = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await listShelves();
            setShelves(data || []);
        } catch (err: any) {
            const errorMsg =
                err?.response?.data?.detail || '加载书架列表失败';
            setError(errorMsg);
            console.error('[ShelfManager] 加载失败:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadShelves();
    }, [loadShelves]);

    // ==================== 弹窗操作 ====================

    /** 打开创建弹窗 */
    const handleOpenCreate = useCallback(() => {
        setEditingShelf(null);
        form.resetFields();
        setModalVisible(true);
    }, [form]);

    /** 打开编辑弹窗 */
    const handleOpenEdit = useCallback(
        (record: ShelfItem) => {
            setEditingShelf(record);
            form.setFieldsValue({
                shelf_name: record.shelf_name,
                description: record.description,
            });
            setModalVisible(true);
        },
        [form]
    );

    /** 关闭弹窗 */
    const handleCloseModal = useCallback(() => {
        setModalVisible(false);
        setEditingShelf(null);
        form.resetFields();
    }, [form]);

    // ==================== 提交操作 ====================

    /**
     * 提交书架表单（创建或更新）
     * 
     * 通过 editingShelf 是否为 null 判断是创建还是编辑模式。
     */
    const handleSubmit = useCallback(async () => {
        try {
            const values = await form.validateFields();
            setSaving(true);

            const params = {
                shelf_name: values.shelf_name.trim(),
                description: values.description?.trim() || '',
            };

            if (editingShelf) {
                // 编辑模式
                await updateShelf(editingShelf.logical_shelf_id, params);
                message.success(`书架「${params.shelf_name}」已更新`);
            } else {
                // 创建模式
                await createShelf(params);
                message.success(`书架「${params.shelf_name}」已创建`);
            }

            setModalVisible(false);
            setEditingShelf(null);
            form.resetFields();
            await loadShelves();
        } catch (error: any) {
            if (error.errorFields) {
                message.warning('请填写书架名称');
            } else {
                const errorMsg =
                    error?.response?.data?.detail || '操作失败，请重试';
                message.error(errorMsg);
            }
        } finally {
            setSaving(false);
        }
    }, [form, editingShelf, loadShelves]);

    // ==================== 删除操作 ====================

    /** 删除书架 */
    const handleDelete = useCallback(
        async (record: ShelfItem) => {
            setDeleting(record.logical_shelf_id);
            try {
                await deleteShelf(record.logical_shelf_id);
                message.success(`书架「${record.shelf_name}」已删除`);
                await loadShelves();
            } catch (error: any) {
                const errorMsg =
                    error?.response?.data?.detail || '删除失败，请重试';
                message.error(errorMsg);
            } finally {
                setDeleting(null);
            }
        },
        [loadShelves]
    );

    // ==================== 导航 ====================

    /** 查看书架 */
    const handleViewShelf = useCallback(
        (shelfId: number) => {
            navigate(`/shelf/${shelfId}`);
        },
        [navigate]
    );

    // ==================== 衍生数据 ====================

    /** 藏书总数 */
    const totalBooks = useMemo(
        () => shelves.reduce((sum, shelf) => sum + shelf.book_count, 0),
        [shelves]
    );

    /** 已绑定物理位置的书架数 */
    const shelvesWithLocation = useMemo(
        () => shelves.filter((s) => s.physical_location).length,
        [shelves]
    );

    // ==================== 表格列配置 ====================

    const columns: ColumnsType<ShelfItem> = useMemo(
        () => [
            {
                title: 'ID',
                dataIndex: 'logical_shelf_id',
                key: 'logical_shelf_id',
                width: 70,
                align: 'center',
                render: (id: number) => (
                    <Text
                        type="secondary"
                        style={{
                            fontSize: 12,
                            fontFamily: 'monospace',
                        }}
                    >
                        #{id}
                    </Text>
                ),
            },
            {
                title: '书架名称',
                dataIndex: 'shelf_name',
                key: 'shelf_name',
                render: (name: string, record: ShelfItem) => (
                    <a
                        onClick={() =>
                            handleViewShelf(record.logical_shelf_id)
                        }
                        style={{ fontWeight: 500, fontSize: 15 }}
                    >
                        <BookOutlined
                            style={{ marginRight: 8, color: '#8B4513' }}
                        />
                        {name}
                    </a>
                ),
            },
            {
                title: '描述',
                dataIndex: 'description',
                key: 'description',
                ellipsis: true,
                render: (desc: string) =>
                    desc ? (
                        <Tooltip title={desc} placement="topLeft">
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                {desc}
                            </Text>
                        </Tooltip>
                    ) : (
                        <Text
                            type="secondary"
                            style={{
                                fontSize: 13,
                                fontStyle: 'italic',
                            }}
                        >
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
                render: (count: number) => (
                    <Badge
                        count={count}
                        showZero
                        overflowCount={999}
                        style={{
                            backgroundColor:
                                count > 0 ? '#8B4513' : '#d4a574',
                        }}
                        title={`${count} 本藏书`}
                    />
                ),
            },
            {
                title: '物理位置',
                dataIndex: 'physical_location',
                key: 'physical_location',
                width: 150,
                render: (location: string) =>
                    location ? (
                        <Tag
                            color="green"
                            icon={<EnvironmentOutlined />}
                            style={{ borderRadius: 10 }}
                        >
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
                width: 180,
                fixed: 'right',
                render: (_: any, record: ShelfItem) => (
                    <Space size="small">
                        <Tooltip title="编辑书架">
                            <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => handleOpenEdit(record)}
                                style={{ color: '#3b82f6' }}
                            />
                        </Tooltip>

                        <Tooltip title="查看书架">
                            <Button
                                type="text"
                                size="small"
                                icon={<BookOutlined />}
                                onClick={() =>
                                    handleViewShelf(
                                        record.logical_shelf_id
                                    )
                                }
                                style={{ color: '#8B4513' }}
                            />
                        </Tooltip>

                        <Popconfirm
                            title="确定要删除这个书架吗？"
                            description={
                                <div>
                                    <p>
                                        删除后相关的映射和图书关联也会被删除。
                                    </p>
                                    {record.book_count > 0 && (
                                        <p
                                            style={{
                                                color: '#ef4444',
                                                margin: 0,
                                            }}
                                        >
                                            书架中有 {record.book_count}{' '}
                                            本图书！
                                        </p>
                                    )}
                                </div>
                            }
                            onConfirm={() => handleDelete(record)}
                            okText="确定删除"
                            cancelText="取消"
                            okButtonProps={{
                                danger: true,
                                loading:
                                    deleting ===
                                    record.logical_shelf_id,
                            }}
                            icon={
                                <ExclamationCircleOutlined
                                    style={{ color: '#ff4d4f' }}
                                />
                            }
                        >
                            <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                loading={
                                    deleting ===
                                    record.logical_shelf_id
                                }
                            />
                        </Popconfirm>
                    </Space>
                ),
            },
        ],
        [handleOpenEdit, handleViewShelf, handleDelete, deleting]
    );

    // ==================== 渲染 ====================

    return (
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
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
                                <AppstoreOutlined /> 管理
                            </a>
                        ),
                    },
                    { title: '书架管理' },
                ]}
            />

            {/* 页面标题 */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 24,
                }}
            >
                <div>
                    <Title level={2} style={{ margin: 0 }}>
                        <AppstoreOutlined
                            style={{ marginRight: 12, color: '#8B4513' }}
                        />
                        书架管理
                    </Title>
                    <Text
                        type="secondary"
                        style={{ display: 'block', marginTop: 4 }}
                    >
                        管理所有逻辑书架，共 {shelves.length} 个书架 ·{' '}
                        {totalBooks} 本藏书
                    </Text>
                </div>

                <Space wrap>
                    <Tooltip title="刷新列表">
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={loadShelves}
                            loading={loading}
                            style={{ borderRadius: 8 }}
                        >
                            刷新
                        </Button>
                    </Tooltip>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={handleOpenCreate}
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
                    style={{ marginBottom: 24, borderRadius: 8 }}
                    action={
                        <Button size="small" onClick={loadShelves}>
                            重试
                        </Button>
                    }
                />
            )}

            {/* 统计卡片 */}
            {!loading && shelves.length > 0 && (
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
                                value={shelves.length}
                                prefix={
                                    <AppstoreOutlined
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
                                title="藏书总数"
                                value={totalBooks}
                                prefix={
                                    <BookOutlined
                                        style={{ color: '#22c55e' }}
                                    />
                                }
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
                                title="已绑定位"
                                value={shelvesWithLocation}
                                suffix={`/ ${shelves.length}`}
                                prefix={
                                    <EnvironmentOutlined
                                        style={{ color: '#a855f7' }}
                                    />
                                }
                                valueStyle={{ color: '#a855f7' }}
                            />
                        </Card>
                    </Col>
                </Row>
            )}

            {/* 表格卡片 */}
            <Card
                style={{
                    borderRadius: 12,
                    boxShadow: '0 2px 8px rgba(139,69,19,.06)',
                    border: '1px solid #e8d5c8',
                }}
            >
                <Table<ShelfItem>
                    columns={columns}
                    dataSource={shelves}
                    rowKey="logical_shelf_id"
                    loading={loading}
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        showTotal: (total, range) => (
                            <Text
                                type="secondary"
                                style={{ fontSize: 13 }}
                            >
                                共 {total} 个书架，显示第 {range[0]}-
                                {range[1]} 个
                            </Text>
                        ),
                    }}
                    locale={{
                        emptyText: (
                            <Empty
                                image={
                                    <InboxOutlined
                                        style={{
                                            fontSize: 48,
                                            color: '#d4a574',
                                        }}
                                    />
                                }
                                description={
                                    <div>
                                        <Text
                                            type="secondary"
                                            style={{
                                                fontSize: 15,
                                                display: 'block',
                                                marginBottom: 8,
                                            }}
                                        >
                                            暂无书架
                                        </Text>
                                        <Text
                                            type="secondary"
                                            style={{ fontSize: 13 }}
                                        >
                                            点击「创建书架」按钮添加您的第一个书架
                                        </Text>
                                    </div>
                                }
                            >
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    onClick={handleOpenCreate}
                                >
                                    创建书架
                                </Button>
                            </Empty>
                        ),
                    }}
                    scroll={{ x: 800 }}
                />
            </Card>

            {/* ===== 创建/编辑弹窗 ===== */}
            <Modal
                title={
                    <Space>
                        {editingShelf ? (
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
                onCancel={handleCloseModal}
                confirmLoading={saving}
                okText={editingShelf ? '保存修改' : '创建书架'}
                cancelText="取消"
                maskClosable={!saving}
                width={520}
                styles={{ body: { padding: 24 } }}
            >
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={FORM_INITIAL_VALUES}
                >
                    <Form.Item
                        name="shelf_name"
                        label="书架名称"
                        rules={[
                            {
                                required: true,
                                message: '请输入书架名称',
                            },
                            {
                                max: 100,
                                message: '书架名称不能超过 100 个字符',
                            },
                            {
                                whitespace: true,
                                message: '书架名称不能为纯空格',
                            },
                        ]}
                        tooltip="给书架起一个有意义的名字，如中国文学经典"
                    >
                        <Input
                            placeholder="例如：中国文学经典、计算机科学、推理小说"
                            prefix={
                                <BookOutlined style={{ color: '#8c7b72' }} />
                            }
                            style={{ borderRadius: 8 }}
                            maxLength={100}
                            autoFocus
                        />
                    </Form.Item>

                    <Form.Item
                        name="description"
                        label="描述"
                        rules={[
                            {
                                max: 500,
                                message: '描述不能超过 500 个字符',
                            },
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
export type { ShelfItem, ShelfFormValues };