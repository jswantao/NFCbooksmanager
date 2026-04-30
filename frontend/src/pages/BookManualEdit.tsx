// frontend/src/pages/BookManualEdit.tsx
/**
 * 手动编辑图书页面
 * 
 * 修改已有图书的元数据信息。所有字段均可修改（除 ISBN 只读）。
 * 
 * 路由：/books/edit/:id
 * 
 * 功能特性：
 * - 自动加载现有图书信息填充表单
 * - ISBN 字段只读（不可修改）
 * - 变更追踪（检测是否有未保存的修改）
 * - 未保存更改时显示提示
 * - 封面预览实时更新
 * - 保存后正确跳转到图书详情页
 * 
 * 跳转规则：
 * - 保存成功 → /shelf/{shelfId}/book/{bookId}
 * - 点击"查看详情" → /shelf/{shelfId}/book/{bookId}
 * - 面包屑中点击书名 → /shelf/{shelfId}/book/{bookId}
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
    Card,
    Form,
    Input,
    Button,
    Space,
    Typography,
    message,
    Row,
    Col,
    Select,
    Skeleton,
    Breadcrumb,
    Alert,
    Result,
    Popconfirm,
    InputNumber,
} from 'antd';
import {
    BookOutlined,
    UserOutlined,
    HomeOutlined,
    DollarOutlined,
    TranslationOutlined,
    TagsOutlined,
    LinkOutlined,
    StarOutlined,
    ArrowLeftOutlined,
    SaveOutlined,
    EditOutlined,
    ClearOutlined,
    EyeOutlined,
    LoadingOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { getBookDetail, updateBookManual } from '../services/api';
import { getCoverUrl, getPlaceholderCover } from '../utils/image';

// ---- 类型定义 ----

const { Title, Text } = Typography;

/** 装帧类型选项 */
const BINDING_OPTIONS = ['平装', '精装', '线装', '骑马钉', '软精装', '其他'];

// ---- 主组件 ----

const BookManualEdit: React.FC = () => {
    const navigate = useNavigate();
    const [form] = Form.useForm();

    // ==================== 获取图书 ID ====================

    /**
     * 从 URL 路径中手动解析图书 ID
     * 
     * 作为 useParams 的备用方案，确保在 Suspense/lazy 组件中也能正确获取参数。
     * 格式：/books/edit/2 → 提取 2
     * 
     * @returns 解析到的图书 ID，无效时返回 null
     */
    const getBookIdFromUrl = (): number | null => {
        const pathParts = window.location.pathname.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        const idNum = parseInt(lastPart);

        console.log('[BookManualEdit] URL 解析:', {
            pathname: window.location.pathname,
            pathParts,
            lastPart,
            idNum,
        });

        if (!isNaN(idNum) && idNum > 0) {
            return idNum;
        }
        return null;
    };

    // 优先使用 React Router 的 useParams，回退到 URL 手动解析
    const params = useParams<{ id: string }>();
    const bookId = params.id ? parseInt(params.id) : getBookIdFromUrl();

    console.log('[BookManualEdit] 最终解析的 bookId:', bookId);

    // ==================== 状态 ====================

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [bookData, setBookData] = useState<any>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [hasChanges, setHasChanges] = useState(false);

    // ==================== 路径生成 ====================

    /**
     * 获取图书详情页的完整路径
     * 
     * 根据图书是否在书架中返回正确的详情页 URL：
     * - 有书架：/shelf/{shelfId}/book/{bookId}
     * - 无书架：/shelf/1/book/{bookId}（默认书架）
     * 
     * @returns 详情页路径
     */
    const getDetailUrl = useCallback((): string => {
        if (bookData?.shelf_id) {
            return `/shelf/${bookData.shelf_id}/book/${bookId}`;
        }
        // 图书不在任何书架时，跳转到默认书架（ID=1）
        return `/shelf/1/book/${bookId}`;
    }, [bookData, bookId]);

    // ==================== 数据加载 ====================

    /**
     * 加载图书现有信息并填充表单
     * 
     * 处理流程：
     * 1. 校验 bookId 有效性
     * 2. 调用 API 获取图书详情
     * 3. 将数据填充到表单字段
     * 4. 处理 pages 从字符串到数字的转换
     */
    const loadBookData = useCallback(async () => {
        // 校验 bookId
        if (!bookId || isNaN(bookId)) {
            console.error('[BookManualEdit] 无效的 bookId:', bookId);
            setLoadError(
                `无法获取图书 ID（当前路径: ${window.location.pathname}，` +
                `useParams: ${JSON.stringify(params)}）`
            );
            setLoading(false);
            return;
        }

        console.log('[BookManualEdit] 开始加载图书 ID:', bookId);
        setLoading(true);
        setLoadError(null);

        try {
            const data = await getBookDetail(bookId);
            console.log('[BookManualEdit] 获取到的图书数据:', {
                title: data?.title,
                book_id: data?.book_id,
                shelf_id: data?.shelf_id,
            });

            setBookData(data);

            // 填充表单（字符串字段空值处理，pages 转为数字）
            form.setFieldsValue({
                title: data.title || '',
                author: data.author || '',
                translator: data.translator || '',
                publisher: data.publisher || '',
                publish_date: data.publish_date || '',
                pages: data.pages ? parseInt(data.pages) : undefined,
                price: data.price || '',
                binding: data.binding || '',
                rating: data.rating || '',
                original_title: data.original_title || '',
                series: data.series || '',
                cover_url: data.cover_url || '',
                douban_url: data.douban_url || '',
                summary: data.summary || '',
            });
        } catch (error: any) {
            const errorMsg =
                error?.response?.data?.detail ||
                error?.userMessage ||
                `加载图书 #${bookId} 失败，请检查网络连接`;
            setLoadError(errorMsg);
            console.error('[BookManualEdit] 加载失败:', error);
        } finally {
            setLoading(false);
        }
    }, [bookId, form, params]);

    useEffect(() => {
        loadBookData();
    }, [loadBookData]);

    // ==================== 保存操作 ====================

    /**
     * 保存修改
     * 
     * 仅提交有变化的字段（减少网络传输）。
     * 保存成功后跳转到图书详情页。
     */
    const handleSave = useCallback(async () => {
        if (!bookId) return;

        try {
            // 校验表单
            const values = await form.validateFields();
            setSaving(true);

            // 构建更新参数（仅包含非空字段）
            const params: Record<string, string> = {};
            Object.entries(values).forEach(([key, value]) => {
                if (value !== undefined && value !== '') {
                    params[key] = String(value);
                }
            });

            console.log('[BookManualEdit] 保存参数:', params);

            // 调用 API 更新
            await updateBookManual(bookId, params);

            message.success('图书信息已更新');
            setHasChanges(false);

            // ✅ 保存成功后跳转到正确的详情页
            navigate(getDetailUrl());
        } catch (error: any) {
            if (error.errorFields) {
                // 表单校验失败
                message.warning('请检查表单中的错误');
            } else {
                // API 错误
                message.error(
                    error?.response?.data?.detail || '保存失败，请重试'
                );
            }
            console.error('[BookManualEdit] 保存失败:', error);
        } finally {
            setSaving(false);
        }
    }, [form, bookId, navigate, getDetailUrl]);

    // ==================== 取消操作 ====================

    /**
     * 放弃修改并返回
     * 
     * 有未保存更改时弹出确认框。
     */
    const handleCancel = useCallback(() => {
        if (hasChanges) {
            // Popconfirm 会先弹出确认框，确认后才执行
        }
        navigate(-1);
    }, [hasChanges, navigate]);

    // ==================== 渲染：加载状态 ====================

    if (loading) {
        return (
            <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
                {/* 骨架屏模拟页面结构 */}
                <Skeleton active paragraph={{ rows: 4 }} />
                <Card style={{ borderRadius: 12, marginTop: 16 }}>
                    <Skeleton active paragraph={{ rows: 8 }} />
                </Card>
            </div>
        );
    }

    // ==================== 渲染：错误状态 ====================

    if (loadError || !bookData) {
        return (
            <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
                {/* 返回按钮 */}
                <Button
                    icon={<ArrowLeftOutlined />}
                    onClick={() => navigate(-1)}
                >
                    返回
                </Button>

                {/* 错误结果 */}
                <Card style={{ borderRadius: 12, marginTop: 16 }}>
                    <Result
                        status="error"
                        title="加载失败"
                        subTitle={loadError || '图书不存在或已被删除'}
                        extra={[
                            <Button
                                key="retry"
                                type="primary"
                                onClick={loadBookData}
                            >
                                重试
                            </Button>,
                            <Button
                                key="home"
                                onClick={() => navigate('/')}
                            >
                                返回首页
                            </Button>,
                        ]}
                    >
                        {/* 调试信息（便于排查问题） */}
                        <div
                            style={{
                                marginTop: 16,
                                padding: 12,
                                background: '#f5f5f5',
                                borderRadius: 8,
                                textAlign: 'left',
                                fontSize: 12,
                            }}
                        >
                            <Text type="secondary">
                                调试信息：<br />
                                URL: {window.location.pathname}<br />
                                useParams: {JSON.stringify(params)}<br />
                                解析的 bookId: {bookId}<br />
                                bookId 类型: {typeof bookId}
                            </Text>
                        </div>
                    </Result>
                </Card>
            </div>
        );
    }

    // ==================== 主渲染 ====================

    return (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
            {/* ===== 面包屑导航 ===== */}
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
                            // ✅ 点击书名跳转到正确的详情页
                            <a onClick={() => navigate(getDetailUrl())}>
                                <BookOutlined /> {bookData.title}
                            </a>
                        ),
                    },
                    { title: '编辑信息' },
                ]}
            />

            {/* ===== 页面标题 ===== */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 24,
                }}
            >
                <Title level={2} style={{ margin: 0 }}>
                    <EditOutlined
                        style={{ color: '#8B4513', marginRight: 12 }}
                    />
                    编辑图书信息
                </Title>

                {/* 返回按钮（有未保存更改时弹出确认） */}
                {hasChanges ? (
                    <Popconfirm
                        title="确定放弃未保存的修改？"
                        description="所有未保存的更改将丢失"
                        onConfirm={handleCancel}
                        okText="确定放弃"
                        cancelText="继续编辑"
                    >
                        <Button icon={<ArrowLeftOutlined />}>返回</Button>
                    </Popconfirm>
                ) : (
                    <Button
                        icon={<ArrowLeftOutlined />}
                        onClick={handleCancel}
                    >
                        返回
                    </Button>
                )}
            </div>

            {/* ===== 未保存更改提示 ===== */}
            {hasChanges && (
                <Alert
                    message="有未保存的更改"
                    description="请记得保存您的修改，否则更改将丢失"
                    type="info"
                    showIcon
                    style={{ marginBottom: 24, borderRadius: 8 }}
                    action={
                        <Button
                            type="primary"
                            size="small"
                            icon={<SaveOutlined />}
                            loading={saving}
                            onClick={handleSave}
                        >
                            立即保存
                        </Button>
                    }
                />
            )}

            {/* ===== 编辑表单 ===== */}
            <Form
                form={form}
                layout="vertical"
                size="large"
                onValuesChange={() => setHasChanges(true)}
            >
                {/* 基本信息 */}
                <Card
                    style={{
                        marginBottom: 24,
                        borderRadius: 12,
                        border: '1px solid #e8d5c8',
                    }}
                    title="基本信息"
                >
                    <Row gutter={[24, 16]}>
                        {/* ISBN（只读） */}
                        <Col xs={24} md={12}>
                            <Form.Item label="ISBN">
                                <Input
                                    value={bookData.isbn}
                                    disabled
                                    style={{ background: '#fafaf9' }}
                                />
                                <Text
                                    type="secondary"
                                    style={{ fontSize: 12 }}
                                >
                                    ISBN 不可修改
                                </Text>
                            </Form.Item>
                        </Col>

                        {/* 书名（必填） */}
                        <Col xs={24} md={12}>
                            <Form.Item
                                name="title"
                                label="书名"
                                rules={[
                                    {
                                        required: true,
                                        message: '请输入书名',
                                    },
                                ]}
                            >
                                <Input placeholder="书名" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={[24, 16]}>
                        {/* 作者 */}
                        <Col xs={24} md={12}>
                            <Form.Item name="author" label="作者">
                                <Input placeholder="作者姓名" />
                            </Form.Item>
                        </Col>

                        {/* 译者 */}
                        <Col xs={24} md={12}>
                            <Form.Item name="translator" label="译者">
                                <Input placeholder="译者姓名" />
                            </Form.Item>
                        </Col>
                    </Row>
                </Card>

                {/* 出版信息 */}
                <Card
                    style={{
                        marginBottom: 24,
                        borderRadius: 12,
                        border: '1px solid #e8d5c8',
                    }}
                    title="出版信息"
                >
                    <Row gutter={[24, 16]}>
                        <Col xs={24} md={12}>
                            <Form.Item name="publisher" label="出版社">
                                <Input placeholder="出版社名称" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item
                                name="publish_date"
                                label="出版日期"
                            >
                                <Input placeholder="如 2014-05" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={[24, 16]}>
                        <Col xs={24} sm={12} md={6}>
                            <Form.Item name="pages" label="页数">
                                <InputNumber
                                    min={1}
                                    placeholder="页数"
                                    style={{ width: '100%' }}
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={6}>
                            <Form.Item name="price" label="定价">
                                <Input placeholder="如 39.50元" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={6}>
                            <Form.Item name="binding" label="装帧">
                                <Select
                                    allowClear
                                    placeholder="选择装帧类型"
                                >
                                    {BINDING_OPTIONS.map((binding) => (
                                        <Select.Option
                                            key={binding}
                                            value={binding}
                                        >
                                            {binding}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={6}>
                            <Form.Item name="rating" label="评分">
                                <Input placeholder="如 8.5" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={[24, 16]}>
                        <Col xs={24} md={12}>
                            <Form.Item
                                name="original_title"
                                label="原作名"
                            >
                                <Input placeholder="外文原版书名" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="series" label="丛书系列">
                                <Input placeholder="所属丛书名称" />
                            </Form.Item>
                        </Col>
                    </Row>
                </Card>

                {/* 封面与链接 */}
                <Card
                    style={{
                        marginBottom: 24,
                        borderRadius: 12,
                        border: '1px solid #e8d5c8',
                    }}
                    title="封面与链接"
                >
                    <Row gutter={[24, 16]}>
                        <Col xs={24} md={12}>
                            <Form.Item name="cover_url" label="封面 URL">
                                <Input placeholder="https://img.example.com/cover.jpg" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item
                                name="douban_url"
                                label="豆瓣链接"
                            >
                                <Input placeholder="https://book.douban.com/subject/xxx/" />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* 封面预览 */}
                    {(form.getFieldValue('cover_url') ||
                        bookData.title) && (
                        <div style={{ marginTop: 8 }}>
                            <img
                                src={
                                    getCoverUrl(
                                        form.getFieldValue('cover_url')
                                    ) ||
                                    getPlaceholderCover(
                                        form.getFieldValue('title') ||
                                            bookData.title,
                                        form.getFieldValue('author') ||
                                            bookData.author
                                    )
                                }
                                alt="封面预览"
                                style={{
                                    width: 120,
                                    borderRadius: 8,
                                    boxShadow:
                                        '0 2px 8px rgba(139,69,19,.1)',
                                }}
                                onError={(e) => {
                                    // 封面加载失败时使用占位图
                                    const target =
                                        e.target as HTMLImageElement;
                                    target.src = getPlaceholderCover(
                                        form.getFieldValue('title') ||
                                            bookData.title,
                                        form.getFieldValue('author') ||
                                            bookData.author
                                    );
                                }}
                            />
                        </div>
                    )}
                </Card>

                {/* 内容简介 */}
                <Card
                    style={{
                        marginBottom: 24,
                        borderRadius: 12,
                        border: '1px solid #e8d5c8',
                    }}
                    title="内容简介"
                >
                    <Form.Item name="summary">
                        <Input.TextArea
                            rows={6}
                            maxLength={5000}
                            showCount
                            placeholder="图书的内容简介..."
                        />
                    </Form.Item>
                </Card>

                {/* ===== 底部操作按钮 ===== */}
                <Card
                    style={{
                        borderRadius: 12,
                        border: '1px solid #e8d5c8',
                    }}
                >
                    <Space size="middle">
                        {/* 保存修改 */}
                        <Button
                            type="primary"
                            size="large"
                            icon={
                                saving ? (
                                    <LoadingOutlined />
                                ) : (
                                    <SaveOutlined />
                                )
                            }
                            loading={saving}
                            onClick={handleSave}
                        >
                            保存修改
                        </Button>

                        {/* 取消（有修改时弹出确认） */}
                        {hasChanges ? (
                            <Popconfirm
                                title="确定放弃修改？"
                                description="所有未保存的更改将丢失"
                                onConfirm={handleCancel}
                                okText="确定放弃"
                                cancelText="继续编辑"
                            >
                                <Button
                                    size="large"
                                    icon={<ClearOutlined />}
                                >
                                    取消
                                </Button>
                            </Popconfirm>
                        ) : (
                            <Button
                                size="large"
                                icon={<ClearOutlined />}
                                onClick={handleCancel}
                            >
                                取消
                            </Button>
                        )}

                        {/* ✅ 查看详情（跳转到正确的详情页） */}
                        <Button
                            size="large"
                            icon={<EyeOutlined />}
                            onClick={() => navigate(getDetailUrl())}
                        >
                            查看详情
                        </Button>
                    </Space>
                </Card>
            </Form>
        </div>
    );
};

export default BookManualEdit;