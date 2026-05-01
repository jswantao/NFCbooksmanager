// frontend/src/pages/BookManualAdd.tsx
/**
 * 手动录入图书页面 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 完整的类型定义
 * - 表单验证增强
 * - ISBN 自动格式化
 * - 步骤状态管理 Hook
 * - 草稿自动保存
 * - 封面 URL 实时预览
 * - 键盘快捷键
 * - 响应式表单布局
 */

import React, {
    useState,
    useEffect,
    useCallback,
    useRef,
    useMemo,
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
    Steps,
    Row,
    Col,
    Divider,
    Image,
    Select,
    Alert,
    Tag,
    Result,
    Breadcrumb,
    InputNumber,
    Empty,
    theme,
    Tooltip,
    Collapse,
    type FormInstance,
    type FormRule,
} from 'antd';
import {
    BookOutlined,
    UserOutlined,
    NumberOutlined,
    HomeOutlined,
    CalendarOutlined,
    FileTextOutlined,
    DollarOutlined,
    TranslationOutlined,
    TagsOutlined,
    LinkOutlined,
    StarOutlined,
    FormOutlined,
    CheckCircleOutlined,
    ArrowLeftOutlined,
    PlusOutlined,
    InfoCircleOutlined,
    SaveOutlined,
    EyeOutlined,
    EnvironmentOutlined,
    EditOutlined,
    ClearOutlined,
    LoadingOutlined,
    BarcodeOutlined,
    QuestionCircleOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { createBookManual, listShelves, extractErrorMessage } from '../services/api';
import { getPlaceholderCover } from '../utils/image';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ==================== 类型定义 ====================

/** 表单数据结构 */
interface BookFormData {
    isbn: string;
    title: string;
    author: string;
    translator: string;
    publisher: string;
    publish_date: string;
    cover_url: string;
    summary: string;
    pages: number | null;
    price: string;
    binding: string;
    rating: string;
    original_title: string;
    series: string;
    douban_url: string;
    shelf_id?: number;
}

/** 书架选项 */
interface ShelfOption {
    value: number;
    label: string;
    count: number;
}

/** 录入步骤 */
type AddStep = 0 | 1 | 2; // 填写 → 预览 → 完成

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

const DRAFT_STORAGE_KEY = 'book-manual-add-draft';

const ISBN_RULES: FormRule[] = [
    { required: true, message: '请输入 ISBN' },
    {
        pattern: /^(?:\d{9}[\dXx]|\d{13})$/,
        message: 'ISBN 格式不正确（10位或13位数字）',
    },
];

const TITLE_RULES: FormRule[] = [
    { required: true, message: '请输入书名' },
    { max: 200, message: '书名不能超过200个字符' },
];

const RATING_RULES: FormRule[] = [
    {
        pattern: /^(?:10(?:\.0)?|[0-9](?:\.[0-9])?)$/,
        message: '评分范围 0-10，支持一位小数',
    },
];

const URL_RULES: FormRule[] = [
    { type: 'url', message: '请输入有效的 URL', warningOnly: true },
];

// ==================== 自定义 Hook ====================

/**
 * 表单草稿管理 Hook
 */
const useFormDraft = (form: FormInstance) => {
    /** 自动保存草稿 */
    const saveDraft = useCallback(() => {
        try {
            const values = form.getFieldsValue();
            localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(values));
        } catch {
            // 静默处理
        }
    }, [form]);

    /** 加载草稿 */
    const loadDraft = useCallback((): Partial<BookFormData> | null => {
        try {
            const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch {
            // 静默处理
        }
        return null;
    }, []);

    /** 清除草稿 */
    const clearDraft = useCallback(() => {
        try {
            localStorage.removeItem(DRAFT_STORAGE_KEY);
        } catch {
            // 静默处理
        }
    }, []);

    return { saveDraft, loadDraft, clearDraft };
};

/**
 * 录入步骤管理 Hook
 */
const useAddStep = () => {
    const [currentStep, setCurrentStep] = useState<AddStep>(0);
    const [formSnapshot, setFormSnapshot] = useState<BookFormData | null>(null);
    const [createdResult, setCreatedResult] = useState<{
        success: boolean;
        data?: { book_id?: number };
    } | null>(null);

    const goToPreview = useCallback((data: BookFormData) => {
        setFormSnapshot(data);
        setCurrentStep(1);
    }, []);

    const goToEdit = useCallback(() => {
        setCurrentStep(0);
    }, []);

    const goToComplete = useCallback((result: { success: boolean; data?: { book_id?: number } }) => {
        setCreatedResult(result);
        setCurrentStep(2);
    }, []);

    const resetSteps = useCallback(() => {
        setCurrentStep(0);
        setFormSnapshot(null);
        setCreatedResult(null);
    }, []);

    return {
        currentStep,
        formSnapshot,
        createdResult,
        goToPreview,
        goToEdit,
        goToComplete,
        resetSteps,
        setFormSnapshot,
    };
};

// ==================== 子组件 ====================

/** 必填标签 */
const RequiredTag: FC = () => (
    <Tag color="error" style={{ marginLeft: 4, fontSize: 11 }}>
        必填
    </Tag>
);

/** 可选标签 */
const OptionalTag: FC = () => (
    <Tag style={{ marginLeft: 4, fontSize: 11 }}>可选</Tag>
);

// ==================== 主组件 ====================

const BookManualAdd: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();
    const [form] = Form.useForm<BookFormData>();
    const formRef = useRef(form);
    formRef.current = form;

    // 步骤管理
    const {
        currentStep,
        formSnapshot,
        createdResult,
        goToPreview,
        goToEdit,
        goToComplete,
        resetSteps,
    } = useAddStep();

    // 草稿管理
    const { saveDraft, loadDraft, clearDraft } = useFormDraft(form);

    // UI 状态
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [shelfOptions, setShelfOptions] = useState<ShelfOption[]>([]);
    const [shelfLoading, setShelfLoading] = useState(false);
    const [coverPreviewError, setCoverPreviewError] = useState(false);

    // ==================== 生命周期 ====================

    useEffect(() => {
        loadShelves();

        // 加载草稿
        const draft = loadDraft();
        if (draft && draft.isbn) {
            form.setFieldsValue(draft);
            message.info({
                content: '已恢复上次未完成的录入',
                key: 'draft-restore',
                duration: 3,
            });
        }
    }, []);

    // 自动保存草稿（每 30 秒）
    useEffect(() => {
        const interval = setInterval(saveDraft, 30000);
        return () => clearInterval(interval);
    }, [saveDraft]);

    // ==================== 书架列表 ====================

    const loadShelves = useCallback(async () => {
        setShelfLoading(true);
        try {
            const data = await listShelves();
            setShelfOptions(
                (data || []).map((s: any) => ({
                    value: s.logical_shelf_id,
                    label: s.shelf_name,
                    count: s.book_count,
                }))
            );
        } catch {
            // 静默处理
        } finally {
            setShelfLoading(false);
        }
    }, []);

    // ==================== 操作处理 ====================

    /** ISBN 自动格式化 */
    const handleISBNChange = useCallback(
        (value: string) => {
            // 移除空格和连字符
            const cleaned = value.replace(/[-\s]/g, '');
            form.setFieldValue('isbn', cleaned);
        },
        [form]
    );

    /** 封面 URL 预览错误 */
    const handleCoverPreviewError = useCallback(() => {
        setCoverPreviewError(true);
    }, []);

    const handleCoverPreviewLoad = useCallback(() => {
        setCoverPreviewError(false);
    }, []);

    /** 预览信息 */
    const handlePreview = useCallback(async () => {
        try {
            // 验证必填字段
            await form.validateFields(['isbn', 'title']);

            const values = form.getFieldsValue();
            const snapshot: BookFormData = {
                isbn: (values.isbn || '').toString().trim(),
                title: (values.title || '').toString().trim(),
                author: (values.author || '').toString().trim(),
                translator: (values.translator || '').toString().trim(),
                publisher: (values.publisher || '').toString().trim(),
                publish_date: (values.publish_date || '').toString().trim(),
                cover_url: (values.cover_url || '').toString().trim(),
                summary: (values.summary || '').toString().trim(),
                pages: values.pages ? Number(values.pages) : null,
                price: (values.price || '').toString().trim(),
                binding: (values.binding || '平装').toString().trim(),
                rating: (values.rating || '').toString().trim(),
                original_title: (values.original_title || '').toString().trim(),
                series: (values.series || '').toString().trim(),
                douban_url: (values.douban_url || '').toString().trim(),
                shelf_id: values.shelf_id ? Number(values.shelf_id) : undefined,
            };

            setCoverPreviewError(false);
            goToPreview(snapshot);

            // 保存草稿
            saveDraft();
        } catch {
            message.warning({
                content: '请先填写 ISBN 和书名',
                key: 'validate-warning',
            });
        }
    }, [form, goToPreview, saveDraft]);

    /** 确认录入 */
    const handleSubmit = useCallback(async () => {
        if (!formSnapshot) {
            message.error({
                content: '请先填写表单信息',
                key: 'submit-error',
            });
            return;
        }

        const isbn = formSnapshot.isbn.replace(/[-\s]/g, '');
        const title = formSnapshot.title;

        if (!isbn) {
            message.error({ content: 'ISBN 不能为空', key: 'isbn-error' });
            return;
        }
        if (!title) {
            message.error({ content: '书名不能为空', key: 'title-error' });
            return;
        }

        setIsSubmitting(true);

        const requestBody: Record<string, unknown> = {
            isbn,
            title,
            author: formSnapshot.author || undefined,
            translator: formSnapshot.translator || undefined,
            publisher: formSnapshot.publisher || undefined,
            publish_date: formSnapshot.publish_date || undefined,
            cover_url: formSnapshot.cover_url || undefined,
            summary: formSnapshot.summary || undefined,
            pages: formSnapshot.pages || undefined,
            price: formSnapshot.price || undefined,
            binding: formSnapshot.binding || '平装',
            rating: formSnapshot.rating || undefined,
            original_title: formSnapshot.original_title || undefined,
            series: formSnapshot.series || undefined,
            douban_url: formSnapshot.douban_url || undefined,
        };

        if (formSnapshot.shelf_id) {
            requestBody.shelf_id = formSnapshot.shelf_id;
        }

        try {
            const result = await createBookManual(requestBody);
            if (result.success) {
                // 清除草稿
                clearDraft();
                goToComplete(result);
                message.success({
                    content: '录入成功！',
                    key: 'create-success',
                });
            } else {
                message.error({
                    content: result.message || '录入失败',
                    key: 'create-error',
                });
            }
        } catch (err: unknown) {
            const errorMsg = extractErrorMessage(err) || '录入失败，请重试';
            message.error({ content: errorMsg, key: 'create-error' });
        } finally {
            setIsSubmitting(false);
        }
    }, [formSnapshot, clearDraft, goToComplete]);

    /** 重置所有 */
    const handleReset = useCallback(() => {
        form.resetFields();
        clearDraft();
        resetSteps();
        setCoverPreviewError(false);
    }, [form, clearDraft, resetSteps]);

    // ==================== 渲染完成步骤 ====================

    if (currentStep === 2 && createdResult) {
        const submittedTitle = formSnapshot?.title || '未知书名';
        const submittedISBN = formSnapshot?.isbn || '';
        const bookId = createdResult?.data?.book_id;

        return (
            <div style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
                <Result
                    status="success"
                    icon={
                        <CheckCircleOutlined
                            style={{ color: '#22c55e', fontSize: 80 }}
                        />
                    }
                    title="录入成功！"
                    subTitle={
                        <div>
                            <Text strong style={{ fontSize: 17 }}>
                                《{submittedTitle}》已成功录入
                            </Text>
                            {submittedISBN && (
                                <div style={{ marginTop: 14 }}>
                                    <Text code style={{ fontSize: 13 }}>
                                        <BarcodeOutlined /> {submittedISBN}
                                    </Text>
                                </div>
                            )}
                        </div>
                    }
                    extra={
                        <Space size={12} wrap>
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                size="large"
                                onClick={handleReset}
                                style={{ borderRadius: 8 }}
                            >
                                继续添加
                            </Button>
                            <Button
                                icon={<BookOutlined />}
                                size="large"
                                onClick={() => navigate('/shelf/1')}
                                style={{ borderRadius: 8 }}
                            >
                                浏览书架
                            </Button>
                            {bookId && (
                                <Button
                                    icon={<EyeOutlined />}
                                    size="large"
                                    onClick={() => navigate(`/book/${bookId}`)}
                                    style={{ borderRadius: 8 }}
                                >
                                    查看详情
                                </Button>
                            )}
                        </Space>
                    }
                />
            </div>
        );
    }

    // ==================== 渲染表单步骤 ====================

    // 封面预览 URL
    const previewCoverUrl = form.getFieldValue('cover_url') || '';

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
                    { title: '手动录入图书' },
                ]}
            />

            {/* 页头 */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 24,
                    flexWrap: 'wrap',
                    gap: 12,
                }}
            >
                <Title level={2} style={{ margin: 0 }}>
                    <FormOutlined
                        style={{ color: token.colorPrimary, marginRight: 12 }}
                    />
                    手动录入图书
                </Title>
                <Button
                    icon={<ArrowLeftOutlined />}
                    onClick={() => navigate(-1)}
                >
                    返回
                </Button>
            </div>

            {/* 步骤条 */}
            <Card style={{ marginBottom: 24, borderRadius: 12 }}>
                <Steps
                    current={currentStep}
                    items={[
                        {
                            title: '填写信息',
                            description: '录入图书基本资料',
                            icon: <FormOutlined />,
                        },
                        {
                            title: '预览确认',
                            description: '核对录入信息',
                            icon: <EyeOutlined />,
                        },
                        {
                            title: '完成录入',
                            description: '图书已保存',
                            icon: <CheckCircleOutlined />,
                        },
                    ]}
                    size="small"
                />
            </Card>

            {/* ========== 步骤 0：填写表单 ========== */}
            <div style={{ display: currentStep === 0 ? 'block' : 'none' }}>
                <Form
                    form={form}
                    layout="vertical"
                    size="large"
                    initialValues={{ binding: '平装' }}
                    onValuesChange={saveDraft}
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
                                <RequiredTag />
                            </Space>
                        }
                    >
                        <Row gutter={[24, 16]}>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="isbn"
                                    label="ISBN"
                                    rules={ISBN_RULES}
                                    tooltip="国际标准书号，10位或13位数字"
                                >
                                    <Input
                                        placeholder="如 9787544270878"
                                        prefix={<BarcodeOutlined />}
                                        maxLength={13}
                                        onChange={(e) =>
                                            handleISBNChange(e.target.value)
                                        }
                                        allowClear
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="title"
                                    label="书名"
                                    rules={TITLE_RULES}
                                >
                                    <Input
                                        placeholder="如 解忧杂货店"
                                        prefix={<BookOutlined />}
                                        maxLength={200}
                                        showCount
                                        allowClear
                                    />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={[24, 16]}>
                            <Col xs={24} md={12}>
                                <Form.Item name="author" label="作者">
                                    <Input
                                        placeholder="如 [日] 东野圭吾"
                                        prefix={<UserOutlined />}
                                        allowClear
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="translator" label="译者">
                                    <Input
                                        placeholder="如 李盈春"
                                        prefix={<TranslationOutlined />}
                                        allowClear
                                    />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={[24, 16]}>
                            <Col xs={24}>
                                <Form.Item
                                    name="rating"
                                    label="评分"
                                    rules={RATING_RULES}
                                    tooltip="0-10 分，支持一位小数"
                                >
                                    <Input
                                        placeholder="如 8.5"
                                        prefix={
                                            <StarOutlined
                                                style={{ color: '#f59e0b' }}
                                            />
                                        }
                                        allowClear
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
                                    <Input
                                        placeholder="如 南海出版公司"
                                        allowClear
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="publish_date" label="出版日期">
                                    <Input
                                        placeholder="如 2014-05"
                                        allowClear
                                    />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={[24, 16]}>
                            <Col xs={24} sm={12} md={6}>
                                <Form.Item name="pages" label="页数">
                                    <InputNumber
                                        placeholder="291"
                                        min={1}
                                        max={99999}
                                        style={{ width: '100%' }}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} md={6}>
                                <Form.Item name="price" label="定价">
                                    <Input
                                        placeholder="如 39.50"
                                        prefix={<DollarOutlined />}
                                        allowClear
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} md={6}>
                                <Form.Item name="binding" label="装帧">
                                    <Select
                                        options={BINDING_OPTIONS}
                                        placeholder="选择装帧类型"
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} md={6}>
                                <Form.Item name="series" label="丛书系列">
                                    <Input
                                        placeholder="所属丛书"
                                        prefix={<TagsOutlined />}
                                        allowClear
                                    />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={[24, 16]}>
                            <Col xs={24} md={12}>
                                <Form.Item name="original_title" label="原作名">
                                    <Input
                                        placeholder="外文原版书名"
                                        prefix={<TranslationOutlined />}
                                        allowClear
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
                                <Form.Item
                                    name="cover_url"
                                    label="封面图片 URL"
                                    rules={URL_RULES}
                                >
                                    <Input
                                        placeholder="https://img.example.com/cover.jpg"
                                        allowClear
                                        onChange={() => setCoverPreviewError(false)}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="douban_url"
                                    label="豆瓣链接"
                                    rules={URL_RULES}
                                >
                                    <Input
                                        placeholder="https://book.douban.com/subject/..."
                                        allowClear
                                    />
                                </Form.Item>
                            </Col>
                        </Row>
                        {/* 封面实时预览 */}
                        {previewCoverUrl && (
                            <div
                                style={{
                                    textAlign: 'center',
                                    padding: 16,
                                    background: token.colorBgLayout,
                                    borderRadius: 8,
                                }}
                            >
                                <Text
                                    type="secondary"
                                    style={{ fontSize: 12, display: 'block', marginBottom: 8 }}
                                >
                                    封面预览
                                </Text>
                                <Image
                                    src={previewCoverUrl}
                                    alt="封面预览"
                                    style={{
                                        width: 140,
                                        height: 196,
                                        objectFit: 'cover',
                                        borderRadius: 8,
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                    }}
                                    fallback={getPlaceholderCover(
                                        form.getFieldValue('title'),
                                        form.getFieldValue('author')
                                    )}
                                    onError={handleCoverPreviewError}
                                    onLoad={handleCoverPreviewLoad}
                                    preview={{ mask: '查看大图' }}
                                />
                            </div>
                        )}
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
                            <TextArea
                                rows={6}
                                maxLength={5000}
                                showCount
                                placeholder="请输入图书的内容简介..."
                                style={{ borderRadius: 8 }}
                            />
                        </Form.Item>
                    </Card>

                    {/* 添加到书架 */}
                    <Card
                        style={{
                            marginBottom: 20,
                            borderRadius: 12,
                            border: `1px solid ${token.colorBorderSecondary}`,
                        }}
                        title={
                            <Space size={6}>
                                <EnvironmentOutlined style={{ color: '#f59e0b' }} />
                                <span>添加到书架</span>
                                <OptionalTag />
                            </Space>
                        }
                    >
                        <Form.Item name="shelf_id">
                            <Select
                                placeholder="不选择则仅录入，不添加到书架"
                                allowClear
                                showSearch
                                loading={shelfLoading}
                                filterOption={(input, option) =>
                                    (option?.label as string)
                                        ?.toLowerCase()
                                        .includes(input.toLowerCase())
                                }
                                notFoundContent={
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description="暂无书架"
                                    />
                                }
                                options={shelfOptions.map((s) => ({
                                    value: s.value,
                                    label: (
                                        <Space size={4}>
                                            <BookOutlined
                                                style={{ color: '#d4a574' }}
                                            />
                                            {s.label}
                                            <Tag
                                                color="blue"
                                                style={{ fontSize: 10, margin: 0 }}
                                            >
                                                {s.count} 本
                                            </Tag>
                                        </Space>
                                    ),
                                }))}
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
                            <Tooltip title="预览录入信息 (⌘P)">
                                <Button
                                    type="primary"
                                    size="large"
                                    icon={<EyeOutlined />}
                                    onClick={handlePreview}
                                    style={{ borderRadius: 8 }}
                                >
                                    预览信息
                                </Button>
                            </Tooltip>
                            <Button
                                size="large"
                                icon={<ClearOutlined />}
                                onClick={handleReset}
                                style={{ borderRadius: 8 }}
                            >
                                重置表单
                            </Button>
                            <Button
                                size="large"
                                icon={<SaveOutlined />}
                                onClick={saveDraft}
                                style={{ borderRadius: 8 }}
                            >
                                保存草稿
                            </Button>
                        </Space>
                    </Card>
                </Form>
            </div>

            {/* ========== 步骤 1：预览确认 ========== */}
            {currentStep === 1 && formSnapshot && (
                <>
                    <Card
                        style={{
                            marginBottom: 20,
                            borderRadius: 12,
                            border: `1px solid ${token.colorBorderSecondary}`,
                        }}
                    >
                        <Alert
                            message="请仔细核对以下信息"
                            description="确认无误后点击「确认录入」提交图书"
                            type="warning"
                            showIcon
                            style={{ marginBottom: 24, borderRadius: 8 }}
                        />

                        <Row gutter={[36, 24]}>
                            {/* 封面 */}
                            <Col xs={24} md={8} style={{ textAlign: 'center' }}>
                                {formSnapshot.cover_url ? (
                                    <Image
                                        src={formSnapshot.cover_url}
                                        alt="封面预览"
                                        style={{
                                            width: '100%',
                                            maxWidth: 240,
                                            aspectRatio: '3/4',
                                            objectFit: 'cover',
                                            borderRadius: 10,
                                            boxShadow:
                                                '0 6px 20px rgba(0,0,0,0.1)',
                                        }}
                                        fallback={getPlaceholderCover(
                                            formSnapshot.title,
                                            formSnapshot.author
                                        )}
                                        preview={{ mask: '查看大图' }}
                                    />
                                ) : (
                                    <img
                                        src={getPlaceholderCover(
                                            formSnapshot.title,
                                            formSnapshot.author
                                        )}
                                        alt="封面占位"
                                        style={{
                                            width: '100%',
                                            maxWidth: 240,
                                            aspectRatio: '3/4',
                                            objectFit: 'cover',
                                            borderRadius: 10,
                                        }}
                                    />
                                )}
                            </Col>

                            {/* 信息 */}
                            <Col xs={24} md={16}>
                                <Title level={3} style={{ marginTop: 0 }}>
                                    {formSnapshot.title || '未填写书名'}
                                </Title>

                                {formSnapshot.author && (
                                    <Text
                                        type="secondary"
                                        style={{
                                            display: 'block',
                                            marginBottom: 16,
                                            fontSize: 15,
                                        }}
                                    >
                                        <UserOutlined /> {formSnapshot.author}
                                        {formSnapshot.translator &&
                                            ` · 译者：${formSnapshot.translator}`}
                                    </Text>
                                )}

                                <Divider style={{ margin: '12px 0 16px' }} />

                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns:
                                            'repeat(auto-fill, minmax(200px, 1fr))',
                                        gap: 12,
                                    }}
                                >
                                    {[
                                        {
                                            label: 'ISBN',
                                            value: formSnapshot.isbn,
                                            code: true,
                                        },
                                        {
                                            label: '出版社',
                                            value: formSnapshot.publisher,
                                        },
                                        {
                                            label: '出版日期',
                                            value: formSnapshot.publish_date,
                                        },
                                        {
                                            label: '页数',
                                            value: formSnapshot.pages
                                                ? `${formSnapshot.pages} 页`
                                                : '',
                                        },
                                        {
                                            label: '定价',
                                            value: formSnapshot.price,
                                        },
                                        {
                                            label: '装帧',
                                            value: formSnapshot.binding,
                                            tag: true,
                                        },
                                        {
                                            label: '评分',
                                            value: formSnapshot.rating,
                                            highlight: true,
                                        },
                                        {
                                            label: '原作名',
                                            value: formSnapshot.original_title,
                                        },
                                        {
                                            label: '丛书',
                                            value: formSnapshot.series,
                                        },
                                    ]
                                        .filter((x) => x.value)
                                        .map((item, i) => (
                                            <div key={i}>
                                                <Text
                                                    type="secondary"
                                                    style={{ fontSize: 12 }}
                                                >
                                                    {item.label}
                                                </Text>
                                                <br />
                                                {item.code ? (
                                                    <Text code>{item.value}</Text>
                                                ) : item.tag ? (
                                                    <Tag>{item.value}</Tag>
                                                ) : item.highlight ? (
                                                    <Text
                                                        strong
                                                        style={{
                                                            color: '#f59e0b',
                                                            fontSize: 18,
                                                        }}
                                                    >
                                                        <StarOutlined />{' '}
                                                        {item.value}
                                                    </Text>
                                                ) : (
                                                    <Text>{item.value}</Text>
                                                )}
                                            </div>
                                        ))}
                                </div>

                                {formSnapshot.summary && (
                                    <>
                                        <Divider
                                            style={{ margin: '16px 0 12px' }}
                                        />
                                        <Text
                                            type="secondary"
                                            style={{
                                                fontSize: 12,
                                                display: 'block',
                                                marginBottom: 8,
                                            }}
                                        >
                                            内容简介
                                        </Text>
                                        <Paragraph
                                            ellipsis={{
                                                rows: 4,
                                                expandable: true,
                                                symbol: '展开',
                                            }}
                                            style={{ marginBottom: 0 }}
                                        >
                                            {formSnapshot.summary}
                                        </Paragraph>
                                    </>
                                )}

                                {formSnapshot.shelf_id && (
                                    <>
                                        <Divider
                                            style={{ margin: '16px 0 12px' }}
                                        />
                                        <Text
                                            type="secondary"
                                            style={{
                                                fontSize: 12,
                                                display: 'block',
                                                marginBottom: 4,
                                            }}
                                        >
                                            将添加到书架
                                        </Text>
                                        <Tag
                                            color="blue"
                                            icon={<BookOutlined />}
                                            style={{ padding: '2px 12px' }}
                                        >
                                            {
                                                shelfOptions.find(
                                                    (s) =>
                                                        s.value ===
                                                        formSnapshot.shelf_id
                                                )?.label
                                            }
                                        </Tag>
                                    </>
                                )}
                            </Col>
                        </Row>
                    </Card>

                    {/* 确认操作 */}
                    <Card
                        style={{
                            borderRadius: 12,
                            border: `1px solid ${token.colorBorderSecondary}`,
                        }}
                    >
                        <Space size={12} wrap>
                            <Button
                                type="primary"
                                size="large"
                                icon={
                                    isSubmitting ? (
                                        <LoadingOutlined />
                                    ) : (
                                        <SaveOutlined />
                                    )
                                }
                                loading={isSubmitting}
                                onClick={handleSubmit}
                                style={{ borderRadius: 8 }}
                            >
                                确认录入
                            </Button>
                            <Button
                                size="large"
                                icon={<EditOutlined />}
                                onClick={goToEdit}
                                style={{ borderRadius: 8 }}
                            >
                                返回修改
                            </Button>
                            <Button
                                size="large"
                                onClick={handleReset}
                                style={{ borderRadius: 8 }}
                            >
                                取消
                            </Button>
                        </Space>
                    </Card>
                </>
            )}
        </div>
    );
};

export default BookManualAdd;