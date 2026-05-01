// frontend/src/pages/BookManualEdit.tsx
/**
 * 图书编辑页面 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 完整的类型定义
 * - 自定义 Hook 封装数据加载
 * - 未保存更改检测与拦截
 * - 表单字段对比高亮
 * - 封面实时预览
 * - 键盘快捷键保存
 * - 路由守卫（离开确认）
 * - 主题色适配
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
    Divider,
    theme,
    Tooltip,
    Image,
    Descriptions,
    type FormInstance,
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
    BarcodeOutlined,
    CalendarOutlined,
    FileTextOutlined,
    UndoOutlined,
    ExclamationCircleOutlined,
    InfoCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams, useBlocker } from 'react-router-dom';
import {
    getBookDetail,
    updateBookManual,
    extractErrorMessage,
} from '../services/api';
import { getCoverUrl, getPlaceholderCover } from '../utils/image';
import { formatAuthors } from '../utils/format';
import type { BookDetail } from '../types';

const { Title, Text, Paragraph } = Typography;

// ==================== 类型定义 ====================

/** 编辑表单数据结构 */
interface EditFormData {
    title: string;
    author: string;
    translator: string;
    publisher: string;
    publish_date: string;
    pages: number | null;
    price: string;
    binding: string;
    rating: string;
    original_title: string;
    series: string;
    cover_url: string;
    douban_url: string;
    summary: string;
}

/** 原始数据快照（用于对比） */
interface OriginalSnapshot {
    title: string;
    author: string;
    translator: string;
    publisher: string;
    publish_date: string;
    pages: string;
    price: string;
    binding: string;
    rating: string;
    original_title: string;
    series: string;
    cover_url: string;
    douban_url: string;
    summary: string;
}

// ==================== 常量 ====================

const BINDING_OPTIONS = [
    { value: '平装', label: '📖 平装' },
    { value: '精装', label: '📚 精装' },
    { value: '线装', label: '🧵 线装' },
    { value: '骑马钉', label: '📎 骑马钉' },
    { value: '软精装', label: '📕 软精装' },
    { value: '无线胶装', label: '📒 无线胶装' },
    { value: '其他', label: '📔 其他' },
];

// ==================== 工具函数 ====================

/**
 * 提取 bookId（支持 useParams 和 URL 路径解析）
 */
const extractBookId = (params: { id?: string }): number | null => {
    if (params.id) {
        const parsed = parseInt(params.id);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    // 降级：从 URL 路径解析
    const parts = window.location.pathname.split('/');
    const lastPart = parts[parts.length - 1];
    const fromPath = parseInt(lastPart);
    if (!isNaN(fromPath) && fromPath > 0) return fromPath;

    return null;
};

/**
 * 将表单值转换为提交参数
 */
const formToParams = (values: EditFormData): Record<string, string> => {
    const params: Record<string, string> = {};
    Object.entries(values).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            params[key] = String(value);
        }
    });
    return params;
};

// ==================== 自定义 Hook ====================

/**
 * 图书数据加载 Hook
 */
const useBookLoader = (bookId: number | null) => {
    const [loading, setLoading] = useState(true);
    const [bookData, setBookData] = useState<BookDetail | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!bookId || isNaN(bookId)) {
            setError('无法获取图书 ID');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const data = await getBookDetail(bookId);
            setBookData(data);
        } catch (err: unknown) {
            const errorMsg = extractErrorMessage(err) || '加载图书信息失败';
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    }, [bookId]);

    useEffect(() => {
        load();
    }, [load]);

    return { bookData, loading, error, load, setBookData };
};

/**
 * 未保存更改管理 Hook
 */
const useUnsavedChanges = (
    form: FormInstance<EditFormData>,
    isDirty: boolean
) => {
    const [showUnsavedAlert, setShowUnsavedAlert] = useState(false);

    // 路由守卫：离开时确认
    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            isDirty && currentLocation.pathname !== nextLocation.pathname
    );

    useEffect(() => {
        if (blocker.state === 'blocked') {
            Modal.confirm({
                title: '未保存的更改',
                icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
                content: '您有未保存的修改，确定要离开吗？',
                okText: '放弃更改',
                cancelText: '继续编辑',
                okType: 'danger',
                onOk: () => blocker.proceed(),
                onCancel: () => blocker.reset(),
            });
        }
    }, [blocker]);

    // 浏览器关闭/刷新拦截
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    useEffect(() => {
        setShowUnsavedAlert(isDirty);
    }, [isDirty]);

    return { showUnsavedAlert };
};

// ==================== 子组件 ====================

/** 封面预览组件 */
const CoverPreview: FC<{
    coverUrl: string;
    title: string;
    author?: string;
}> = ({ coverUrl, title, author }) => {
    const [previewError, setPreviewError] = useState(false);

    const displayUrl = useMemo(() => {
        if (!coverUrl || previewError) {
            return getPlaceholderCover(title, author);
        }
        return getCoverUrl(coverUrl);
    }, [coverUrl, title, author, previewError]);

    const handleError = useCallback(() => {
        setPreviewError(true);
    }, []);

    // 当 coverUrl 变化时重置错误状态
    useEffect(() => {
        setPreviewError(false);
    }, [coverUrl]);

    return (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                封面预览
            </Text>
            <Image
                src={displayUrl}
                alt="封面预览"
                style={{
                    width: 140,
                    height: 196,
                    objectFit: 'cover',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
                fallback={getPlaceholderCover(title, author)}
                onError={handleError}
                preview={{ mask: '查看大图' }}
            />
        </div>
    );
};

// ==================== 主组件 ====================

const BookManualEdit: FC = () => {
    const navigate = useNavigate();
    const params = useParams<{ id: string }>();
    const { token } = theme.useToken();
    const [form] = Form.useForm<EditFormData>();

    // ==================== 状态 ====================

    const bookId = useMemo(() => extractBookId(params), [params]);
    const { bookData, loading, error, load } = useBookLoader(bookId);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [originalSnapshot, setOriginalSnapshot] = useState<OriginalSnapshot | null>(null);

    // 未保存更改管理
    const { showUnsavedAlert } = useUnsavedChanges(form, hasChanges);

    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // ==================== 派生数据 ====================

    /** 获取图书详情页 URL */
    const getDetailUrl = useCallback((): string => {
        if (bookData?.shelf_id) {
            return `/shelf/${bookData.shelf_id}/book/${bookId}`;
        }
        return `/shelf/1/book/${bookId}`;
    }, [bookData, bookId]);

    /** 表单值填充 */
    useEffect(() => {
        if (!bookData) return;

        const formValues: EditFormData = {
            title: bookData.title || '',
            author: bookData.author || '',
            translator: bookData.translator || '',
            publisher: bookData.publisher || '',
            publish_date: bookData.publish_date || '',
            pages: bookData.pages ? parseInt(bookData.pages) : null,
            price: bookData.price || '',
            binding: bookData.binding || '',
            rating: bookData.rating || '',
            original_title: bookData.original_title || '',
            series: bookData.series || '',
            cover_url: bookData.cover_url || '',
            douban_url: bookData.douban_url || '',
            summary: bookData.summary || '',
        };

        form.setFieldsValue(formValues);

        // 保存原始快照
        setOriginalSnapshot({
            title: formValues.title,
            author: formValues.author,
            translator: formValues.translator,
            publisher: formValues.publisher,
            publish_date: formValues.publish_date,
            pages: formValues.pages !== null ? String(formValues.pages) : '',
            price: formValues.price,
            binding: formValues.binding,
            rating: formValues.rating,
            original_title: formValues.original_title,
            series: formValues.series,
            cover_url: formValues.cover_url,
            douban_url: formValues.douban_url,
            summary: formValues.summary,
        });

        setHasChanges(false);
    }, [bookData, form]);

    // ==================== 事件处理 ====================

    /** 表单值变化 */
    const handleValuesChange = useCallback(() => {
        setHasChanges(true);
    }, []);

    /** 保存修改 */
    const handleSave = useCallback(async () => {
        if (!bookId) return;

        try {
            const values = await form.validateFields();
            setSaving(true);

            const saveParams = formToParams(values);
            await updateBookManual(bookId, saveParams);

            if (isMounted.current) {
                message.success({
                    content: '图书信息已更新',
                    key: 'edit-save-success',
                });
                setHasChanges(false);
                // 延迟跳转，让用户看到成功提示
                setTimeout(() => {
                    navigate(getDetailUrl());
                }, 500);
            }
        } catch (err: unknown) {
            if (isMounted.current) {
                // 表单验证错误
                if ((err as any)?.errorFields) {
                    message.warning({
                        content: '请检查表单中的错误',
                        key: 'edit-validate-error',
                    });
                    return;
                }
                const errorMsg = extractErrorMessage(err) || '保存失败，请重试';
                message.error({
                    content: errorMsg,
                    key: 'edit-save-error',
                });
            }
        } finally {
            if (isMounted.current) {
                setSaving(false);
            }
        }
    }, [bookId, form, navigate, getDetailUrl]);

    /** 恢复原始值 */
    const handleReset = useCallback(() => {
        if (originalSnapshot) {
            form.setFieldsValue({
                title: originalSnapshot.title,
                author: originalSnapshot.author,
                translator: originalSnapshot.translator,
                publisher: originalSnapshot.publisher,
                publish_date: originalSnapshot.publish_date,
                pages: originalSnapshot.pages ? parseInt(originalSnapshot.pages) : null,
                price: originalSnapshot.price,
                binding: originalSnapshot.binding,
                rating: originalSnapshot.rating,
                original_title: originalSnapshot.original_title,
                series: originalSnapshot.series,
                cover_url: originalSnapshot.cover_url,
                douban_url: originalSnapshot.douban_url,
                summary: originalSnapshot.summary,
            });
            setHasChanges(false);
            message.info('已恢复原始值');
        }
    }, [form, originalSnapshot]);

    /** 返回处理 */
    const handleBack = useCallback(() => {
        if (hasChanges) {
            Modal.confirm({
                title: '放弃修改？',
                icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
                content: '您有未保存的更改，确定要返回吗？',
                okText: '放弃',
                cancelText: '继续编辑',
                okType: 'danger',
                onOk: () => navigate(-1),
            });
        } else {
            navigate(-1);
        }
    }, [hasChanges, navigate]);

    /** 键盘快捷键 */
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // ⌘S / Ctrl+S → 保存
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSave]);

    // 需要动态导入 Modal（避免顶层引用问题）
    const [Modal, setModal] = useState<any>(null);
    useEffect(() => {
        import('antd').then(({ Modal: AntModal }) => setModal(() => AntModal));
    }, []);

    // ==================== 渲染加载状态 ====================

    if (loading) {
        return (
            <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
                <Skeleton active paragraph={{ rows: 2 }} />
                <Card style={{ borderRadius: 12, marginTop: 16 }}>
                    <Skeleton active paragraph={{ rows: 10 }} />
                </Card>
            </div>
        );
    }

    // ==================== 渲染错误状态 ====================

    if (error || !bookData) {
        return (
            <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
                <Button
                    icon={<ArrowLeftOutlined />}
                    onClick={() => navigate(-1)}
                    style={{ marginBottom: 16 }}
                >
                    返回
                </Button>
                <Card style={{ borderRadius: 12 }}>
                    <Result
                        status="error"
                        title="加载失败"
                        subTitle={error || '未找到该图书'}
                        extra={[
                            <Button
                                key="retry"
                                type="primary"
                                onClick={load}
                                icon={<UndoOutlined />}
                            >
                                重试
                            </Button>,
                            <Button
                                key="home"
                                onClick={() => navigate('/')}
                                icon={<HomeOutlined />}
                            >
                                返回首页
                            </Button>,
                        ]}
                    />
                    {/* 调试信息 */}
                    {import.meta.env.DEV && (
                        <div
                            style={{
                                marginTop: 16,
                                padding: 12,
                                background: token.colorFillSecondary,
                                borderRadius: 8,
                                fontSize: 12,
                            }}
                        >
                            <Text type="secondary">
                                URL: {window.location.pathname}
                                <br />
                                params.id: {params.id ?? 'undefined'}
                                <br />
                                bookId: {bookId ?? 'null'}
                            </Text>
                        </div>
                    )}
                </Card>
            </div>
        );
    }

    // ==================== 渲染正常状态 ====================

    const currentCoverUrl = Form.useWatch('cover_url', form);
    const currentTitle = Form.useWatch('title', form);
    const currentAuthor = Form.useWatch('author', form);

    return (
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
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
                            <a onClick={() => navigate(getDetailUrl())}>
                                <BookOutlined /> {bookData.title}
                            </a>
                        ),
                    },
                    { title: '编辑信息' },
                ]}
            />

            {/* 页头 */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 20,
                    flexWrap: 'wrap',
                    gap: 12,
                }}
            >
                <div>
                    <Title level={2} style={{ margin: 0 }}>
                        <EditOutlined
                            style={{ color: token.colorPrimary, marginRight: 12 }}
                        />
                        编辑图书信息
                    </Title>
                    <Text type="secondary" style={{ marginTop: 4, display: 'block' }}>
                        <BarcodeOutlined /> ISBN: {bookData.isbn}
                        {bookData.shelf_name && (
                            <>
                                {' '}· <BookOutlined /> {bookData.shelf_name}
                            </>
                        )}
                    </Text>
                </div>
                <Space size={8}>
                    {hasChanges ? (
                        <Popconfirm
                            title="放弃修改？"
                            onConfirm={() => navigate(-1)}
                            okText="放弃"
                            cancelText="取消"
                        >
                            <Button icon={<ArrowLeftOutlined />}>返回</Button>
                        </Popconfirm>
                    ) : (
                        <Button
                            icon={<ArrowLeftOutlined />}
                            onClick={handleBack}
                        >
                            返回
                        </Button>
                    )}
                </Space>
            </div>

            {/* 未保存提示 */}
            {showUnsavedAlert && (
                <Alert
                    message={
                        <Space>
                            <ExclamationCircleOutlined />
                            有未保存的更改
                        </Space>
                    }
                    description="请保存修改后再离开，或点击恢复按钮撤销更改"
                    type="warning"
                    showIcon={false}
                    style={{ marginBottom: 20, borderRadius: 8 }}
                    action={
                        <Space size={8}>
                            <Button
                                type="primary"
                                size="small"
                                icon={<SaveOutlined />}
                                loading={saving}
                                onClick={handleSave}
                            >
                                立即保存
                            </Button>
                            <Button
                                size="small"
                                icon={<UndoOutlined />}
                                onClick={handleReset}
                            >
                                恢复原始
                            </Button>
                        </Space>
                    }
                />
            )}

            {/* 编辑表单 */}
            <Form
                form={form}
                layout="vertical"
                size="large"
                onValuesChange={handleValuesChange}
            >
                {/* 基本信息 */}
                <Card
                    style={{
                        marginBottom: 20,
                        borderRadius: 12,
                        border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                    title={
                        <Space size={6}>
                            <InfoCircleOutlined style={{ color: '#3b82f6' }} />
                            <span>基本信息</span>
                        </Space>
                    }
                >
                    <Row gutter={[24, 16]}>
                        <Col xs={24} md={12}>
                            <Form.Item label="ISBN">
                                <Input
                                    value={bookData.isbn}
                                    disabled
                                    style={{ background: token.colorFillSecondary }}
                                />
                                <Text
                                    type="secondary"
                                    style={{ fontSize: 11, marginTop: 4, display: 'block' }}
                                >
                                    ISBN 不可修改
                                </Text>
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item
                                name="title"
                                label="书名"
                                rules={[
                                    { required: true, message: '书名不能为空' },
                                    { max: 200, message: '书名不能超过200个字符' },
                                ]}
                            >
                                <Input
                                    prefix={<BookOutlined />}
                                    placeholder="请输入书名"
                                    showCount
                                    maxLength={200}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={[24, 16]}>
                        <Col xs={24} md={12}>
                            <Form.Item name="author" label="作者">
                                <Input
                                    prefix={<UserOutlined />}
                                    placeholder="请输入作者"
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="translator" label="译者">
                                <Input
                                    prefix={<TranslationOutlined />}
                                    placeholder="请输入译者"
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={[24, 16]}>
                        <Col xs={24} md={12}>
                            <Form.Item name="rating" label="评分">
                                <Input
                                    prefix={
                                        <StarOutlined style={{ color: '#f59e0b' }} />
                                    }
                                    placeholder="0-10，如 8.5"
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                </Card>

                {/* 出版信息 */}
                <Card
                    style={{
                        marginBottom: 20,
                        borderRadius: 12,
                        border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                    title={
                        <Space size={6}>
                            <CalendarOutlined style={{ color: '#22c55e' }} />
                            <span>出版信息</span>
                        </Space>
                    }
                >
                    <Row gutter={[24, 16]}>
                        <Col xs={24} md={12}>
                            <Form.Item name="publisher" label="出版社">
                                <Input placeholder="请输入出版社" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="publish_date" label="出版日期">
                                <Input placeholder="如 2014-05" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={[24, 16]}>
                        <Col xs={24} sm={12} md={6}>
                            <Form.Item name="pages" label="页数">
                                <InputNumber
                                    min={1}
                                    max={99999}
                                    style={{ width: '100%' }}
                                    placeholder="页数"
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={6}>
                            <Form.Item name="price" label="定价">
                                <Input
                                    prefix={<DollarOutlined />}
                                    placeholder="如 39.50"
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={6}>
                            <Form.Item name="binding" label="装帧">
                                <Select
                                    options={BINDING_OPTIONS}
                                    placeholder="选择装帧"
                                    allowClear
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} md={6}>
                            <Form.Item name="series" label="丛书系列">
                                <Input
                                    prefix={<TagsOutlined />}
                                    placeholder="丛书名称"
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={[24, 16]}>
                        <Col xs={24} md={12}>
                            <Form.Item name="original_title" label="原作名">
                                <Input
                                    prefix={<TranslationOutlined />}
                                    placeholder="外文原版书名"
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                </Card>

                {/* 封面与链接 */}
                <Card
                    style={{
                        marginBottom: 20,
                        borderRadius: 12,
                        border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                    title={
                        <Space size={6}>
                            <LinkOutlined style={{ color: '#a855f7' }} />
                            <span>封面与链接</span>
                        </Space>
                    }
                >
                    <Row gutter={[24, 16]}>
                        <Col xs={24} md={12}>
                            <Form.Item name="cover_url" label="封面图片 URL">
                                <Input placeholder="https://..." />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="douban_url" label="豆瓣链接">
                                <Input placeholder="https://book.douban.com/subject/..." />
                            </Form.Item>
                        </Col>
                    </Row>
                    {/* 封面预览 */}
                    <CoverPreview
                        coverUrl={currentCoverUrl || bookData.cover_url || ''}
                        title={currentTitle || bookData.title}
                        author={currentAuthor || bookData.author}
                    />
                </Card>

                {/* 内容简介 */}
                <Card
                    style={{
                        marginBottom: 20,
                        borderRadius: 12,
                        border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                    title={
                        <Space size={6}>
                            <FileTextOutlined style={{ color: '#f97316' }} />
                            <span>内容简介</span>
                        </Space>
                    }
                >
                    <Form.Item name="summary">
                        <Input.TextArea
                            rows={7}
                            maxLength={5000}
                            showCount
                            placeholder="请输入图书的内容简介..."
                            style={{ borderRadius: 8 }}
                        />
                    </Form.Item>
                </Card>

                {/* 操作按钮 */}
                <Card
                    style={{
                        borderRadius: 12,
                        border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                >
                    <Space size={12} wrap>
                        <Tooltip title="保存修改 (⌘S)">
                            <Button
                                type="primary"
                                size="large"
                                icon={saving ? <LoadingOutlined /> : <SaveOutlined />}
                                loading={saving}
                                onClick={handleSave}
                                style={{ borderRadius: 8 }}
                            >
                                保存修改
                            </Button>
                        </Tooltip>
                        {hasChanges && (
                            <Button
                                size="large"
                                icon={<UndoOutlined />}
                                onClick={handleReset}
                                style={{ borderRadius: 8 }}
                            >
                                恢复原始值
                            </Button>
                        )}
                        <Button
                            size="large"
                            icon={<EyeOutlined />}
                            onClick={() => navigate(getDetailUrl())}
                            style={{ borderRadius: 8 }}
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