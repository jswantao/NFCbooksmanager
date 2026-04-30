// frontend/src/pages/BookManualAdd.tsx
/**
 * 手动录入图书页面
 * 
 * 采用两步式流程：
 * 1. 填写信息：分区域填写图书元数据
 * 2. 预览确认：预览填写的信息，确认后提交
 * 3. 录入成功：显示结果并提供后续操作
 * 
 * ⚠️ 关键设计：
 * Form 组件必须始终挂载在 DOM 中（使用 style={{ display: 'none' }} 隐藏），
 * 否则切换步骤时 Form.Item 消失会导致 getFieldsValue() 返回空对象。
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { createBookManual, listShelves } from '../services/api';
import { getPlaceholderCover } from '../utils/image';

// ---- 类型定义 ----

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

/** 装帧类型选项 */
const BINDING_OPTIONS = ['平装', '精装', '线装', '骑马钉', '软精装', '其他'];

/**
 * 预览时存储的表单快照
 * 
 * 在点击预览时保存表单值，避免因 Form.Item 卸载导致数据丢失。
 */
interface FormSnapshot {
    isbn: string;
    title: string;
    author: string;
    translator: string;
    publisher: string;
    publish_date: string;
    cover_url: string;
    summary: string;
    pages: string;
    price: string;
    binding: string;
    rating: string;
    original_title: string;
    series: string;
    douban_url: string;
    shelf_id?: number;
}

// ---- 主组件 ----

const BookManualAdd: React.FC = () => {
    const navigate = useNavigate();
    const [form] = Form.useForm();
    const formRef = useRef(form);
    formRef.current = form;

    // ==================== 状态 ====================

    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [shelfOptions, setShelfOptions] = useState<any[]>([]);
    const [createdResult, setCreatedResult] = useState<any>(null);

    /**
     * ⚠️ 关键修复：表单快照
     * 
     * 在切换到预览步骤时保存表单值。
     * 这确保了即使 Form.Item 在后续步骤中不可见，
     * 提交时仍能获取到完整的表单数据。
     */
    const [formSnapshot, setFormSnapshot] = useState<FormSnapshot | null>(null);

    // ==================== 数据加载 ====================

    useEffect(() => {
        listShelves()
            .then((data) =>
                setShelfOptions(
                    data.map((shelf: any) => ({
                        value: shelf.logical_shelf_id,
                        label: shelf.shelf_name,
                        count: shelf.book_count,
                    }))
                )
            )
            .catch(() => {
                // 静默失败
            });
    }, []);

    // ==================== 表单提交 ====================

    const handleSubmit = useCallback(async () => {
        try {
            // ⚠️ 使用快照数据提交（而非从 Form 实例读取）
            if (!formSnapshot) {
                message.error('请先填写表单信息');
                return;
            }

            const isbn = formSnapshot.isbn.replace(/[-\s]/g, '');
            const title = formSnapshot.title;

            if (!isbn) {
                message.error('ISBN 不能为空');
                return;
            }
            if (!title) {
                message.error('书名不能为空');
                return;
            }

            setIsSubmitting(true);

            const requestBody: Record<string, any> = {
                isbn,
                title,
                author: formSnapshot.author,
                translator: formSnapshot.translator,
                publisher: formSnapshot.publisher,
                publish_date: formSnapshot.publish_date,
                cover_url: formSnapshot.cover_url,
                summary: formSnapshot.summary,
                pages: formSnapshot.pages,
                price: formSnapshot.price,
                binding: formSnapshot.binding,
                rating: formSnapshot.rating,
                original_title: formSnapshot.original_title,
                series: formSnapshot.series,
                douban_url: formSnapshot.douban_url,
            };

            if (formSnapshot.shelf_id) {
                requestBody.shelf_id = Number(formSnapshot.shelf_id);
            }

            console.log('[BookManualAdd] 请求体:', JSON.stringify(requestBody, null, 2));

            const result = await createBookManual(requestBody);

            if (result.success) {
                setCreatedResult(result);
                setCurrentStep(2);
                message.success('图书录入成功！');
            } else {
                message.error(result.message || '录入失败');
            }
        } catch (error: any) {
            console.error('[BookManualAdd] 提交失败:', error);

            if (error?.response?.data?.detail) {
                message.error(error.response.data.detail);
            } else if (error?.userMessage) {
                message.error(error.userMessage);
            } else {
                message.error('录入失败，请检查网络连接');
            }
        } finally {
            setIsSubmitting(false);
        }
    }, [formSnapshot]);

    // ==================== 重置 ====================

    const handleReset = useCallback(() => {
        form.resetFields();
        setFormSnapshot(null);
        setCurrentStep(0);
        setCreatedResult(null);
    }, [form]);

    // ==================== 渲染：成功页面 ====================

    if (currentStep === 2 && createdResult) {
        const submittedISBN = formSnapshot?.isbn || '';
        const submittedTitle = formSnapshot?.title || '未知书名';
        const bookId = createdResult?.data?.book_id;

        return (
            <div style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
                <Result
                    status="success"
                    icon={<CheckCircleOutlined style={{ color: '#22c55e', fontSize: 72 }} />}
                    title="图书录入成功！"
                    subTitle={
                        <div>
                            <Text strong style={{ fontSize: 16 }}>
                                《{submittedTitle}》已成功录入
                            </Text>
                            {submittedISBN && (
                                <div style={{ marginTop: 12 }}>
                                    <Text code>ISBN: {submittedISBN}</Text>
                                </div>
                            )}
                        </div>
                    }
                    extra={
                        <Space size="middle">
                            <Button type="primary" icon={<PlusOutlined />} size="large" onClick={handleReset}>
                                继续添加
                            </Button>
                            <Button icon={<BookOutlined />} size="large" onClick={() => navigate('/shelf/1')}>
                                浏览书架
                            </Button>
                            {bookId && (
                                <Button icon={<EyeOutlined />} size="large" onClick={() => navigate(`/book/${bookId}`)}>
                                    查看详情
                                </Button>
                            )}
                        </Space>
                    }
                />
            </div>
        );
    }

    // ==================== 渲染：表单页面 ====================

    return (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
            {/* 面包屑导航 */}
            <Breadcrumb
                style={{ marginBottom: 16 }}
                items={[
                    { title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> },
                    { title: '手动录入图书' },
                ]}
            />

            {/* 页面标题 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <Title level={2} style={{ margin: 0 }}>
                    <FormOutlined style={{ color: '#8B4513', marginRight: 12 }} />
                    手动录入图书
                </Title>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
            </div>

            {/* 步骤指示器 */}
            <Card style={{ marginBottom: 24, borderRadius: 12 }}>
                <Steps
                    current={currentStep}
                    items={[
                        { title: '填写信息', icon: <FormOutlined /> },
                        { title: '预览确认', icon: <EyeOutlined /> },
                    ]}
                />
            </Card>

            {/* ===== Form 始终挂载，通过 display 控制可见性 ===== */}
            {/* ⚠️ 关键修复：不使用条件渲染，而是用 display: none 隐藏 */}
            <div style={{ display: currentStep === 0 ? 'block' : 'none' }}>
                <Form
                    form={form}
                    layout="vertical"
                    size="large"
                    onValuesChange={(changedValues, allValues) => {
                        console.log('[BookManualAdd] 表单值变化:', JSON.stringify(allValues));
                    }}
                >
                    {/* 基本信息（必填） */}
                    <Card
                        style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #e8d5c8' }}
                        title={
                            <Space>
                                <InfoCircleOutlined style={{ color: '#3b82f6' }} />
                                基本信息
                                <Tag color="error">必填</Tag>
                            </Space>
                        }
                    >
                        <Row gutter={[24, 16]}>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="isbn"
                                    label="ISBN"
                                    rules={[
                                        { required: true, message: '请输入 ISBN' },
                                        { pattern: /^\d{9}[\dXx]$|^\d{13}$/, message: 'ISBN 格式不正确（10 或 13 位）' },
                                    ]}
                                >
                                    <Input placeholder="9787544270878" prefix={<NumberOutlined />} maxLength={13} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="title"
                                    label="书名"
                                    rules={[
                                        { required: true, message: '请输入书名' },
                                        { max: 200, message: '书名不能超过 200 个字符' },
                                    ]}
                                >
                                    <Input placeholder="解忧杂货店" prefix={<BookOutlined />} />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={[24, 16]}>
                            <Col xs={24} md={12}>
                                <Form.Item name="author" label="作者">
                                    <Input placeholder="[日] 东野圭吾" prefix={<UserOutlined />} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="translator" label="译者">
                                    <Input placeholder="李盈春" prefix={<TranslationOutlined />} />
                                </Form.Item>
                            </Col>
                        </Row>
                    </Card>

                    {/* 出版信息 */}
                    <Card
                        style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #e8d5c8' }}
                        title={<Space><CalendarOutlined style={{ color: '#22c55e' }} />出版信息</Space>}
                    >
                        <Row gutter={[24, 16]}>
                            <Col xs={24} md={12}>
                                <Form.Item name="publisher" label="出版社">
                                    <Input placeholder="南海出版公司" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="publish_date" label="出版日期">
                                    <Input placeholder="2014-05" />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={[24, 16]}>
                            <Col xs={24} sm={12} md={6}>
                                <Form.Item name="pages" label="页数">
                                    <InputNumber placeholder="291" min={1} style={{ width: '100%' }} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} md={6}>
                                <Form.Item name="price" label="定价">
                                    <Input placeholder="39.50元" prefix={<DollarOutlined />} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} md={6}>
                                <Form.Item name="binding" label="装帧" initialValue="平装">
                                    <Select>
                                        {BINDING_OPTIONS.map((b) => (
                                            <Select.Option key={b} value={b}>{b}</Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} md={6}>
                                <Form.Item
                                    name="rating"
                                    label="评分"
                                    rules={[{ pattern: /^\d(\.\d)?$|^10$/, message: '评分范围 0-10' }]}
                                >
                                    <Input placeholder="8.5" prefix={<StarOutlined style={{ color: '#f59e0b' }} />} />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={[24, 16]}>
                            <Col xs={24} md={12}>
                                <Form.Item name="original_title" label="原作名">
                                    <Input prefix={<TranslationOutlined />} placeholder="外文原版书名" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="series" label="丛书系列">
                                    <Input prefix={<TagsOutlined />} placeholder="所属丛书名称" />
                                </Form.Item>
                            </Col>
                        </Row>
                    </Card>

                    {/* 封面与链接 */}
                    <Card
                        style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #e8d5c8' }}
                        title={<Space><LinkOutlined style={{ color: '#a855f7' }} />封面与链接</Space>}
                    >
                        <Row gutter={[24, 16]}>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="cover_url"
                                    label="封面图片 URL"
                                    rules={[{ type: 'url', warningOnly: true }]}
                                >
                                    <Input placeholder="https://img.example.com/cover.jpg" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    name="douban_url"
                                    label="豆瓣链接"
                                    rules={[{ type: 'url', warningOnly: true }]}
                                >
                                    <Input placeholder="https://book.douban.com/subject/xxx/" />
                                </Form.Item>
                            </Col>
                        </Row>
                    </Card>

                    {/* 内容简介 */}
                    <Card
                        style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #e8d5c8' }}
                        title={<Space><FileTextOutlined style={{ color: '#f97316' }} />内容简介</Space>}
                    >
                        <Form.Item name="summary">
                            <TextArea rows={6} maxLength={5000} showCount placeholder="图书的内容简介..." />
                        </Form.Item>
                    </Card>

                    {/* 添加到书架（可选） */}
                    <Card
                        style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #e8d5c8' }}
                        title={
                            <Space>
                                <EnvironmentOutlined style={{ color: '#f59e0b' }} />
                                添加到书架
                                <Tag>可选</Tag>
                            </Space>
                        }
                    >
                        <Form.Item name="shelf_id">
                            <Select
                                placeholder="不选择则仅录入，不加入书架"
                                allowClear
                                showSearch
                                filterOption={(input, option) =>
                                    (option?.children as string)?.includes(input)
                                }
                                notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无书架" />}
                            >
                                {shelfOptions.map((shelf) => (
                                    <Select.Option key={shelf.value} value={shelf.value}>
                                        <BookOutlined style={{ color: '#d4a574' }} /> {shelf.label}
                                        <Tag color="blue" style={{ fontSize: 11, marginLeft: 8 }}>
                                            {shelf.count} 本
                                        </Tag>
                                    </Select.Option>
                                ))}
                            </Select>
                        </Form.Item>
                    </Card>

                    {/* 底部操作按钮 */}
                    <Card style={{ borderRadius: 12, border: '1px solid #e8d5c8' }}>
                        <Space size="middle">
                            <Button
                                type="primary"
                                size="large"
                                icon={<EyeOutlined />}
                                onClick={async () => {
                                    try {
                                        // ⚠️ 先校验必填字段
                                        await formRef.current.validateFields(['isbn', 'title']);
                                        
                                        // ✅ 保存表单快照
                                        const allValues = formRef.current.getFieldsValue();
                                        console.log('[BookManualAdd] 保存表单快照:', JSON.stringify(allValues, null, 2));
                                        
                                        setFormSnapshot({
                                            isbn: (allValues.isbn || '').toString().trim(),
                                            title: (allValues.title || '').toString().trim(),
                                            author: (allValues.author || '').toString().trim(),
                                            translator: (allValues.translator || '').toString().trim(),
                                            publisher: (allValues.publisher || '').toString().trim(),
                                            publish_date: (allValues.publish_date || '').toString().trim(),
                                            cover_url: (allValues.cover_url || '').toString().trim(),
                                            summary: (allValues.summary || '').toString().trim(),
                                            pages: allValues.pages ? String(allValues.pages) : '',
                                            price: (allValues.price || '').toString().trim(),
                                            binding: (allValues.binding || '').toString().trim(),
                                            rating: (allValues.rating || '').toString().trim(),
                                            original_title: (allValues.original_title || '').toString().trim(),
                                            series: (allValues.series || '').toString().trim(),
                                            douban_url: (allValues.douban_url || '').toString().trim(),
                                            shelf_id: allValues.shelf_id ? Number(allValues.shelf_id) : undefined,
                                        });
                                        
                                        setCurrentStep(1);
                                    } catch (err) {
                                        message.warning('请先填写 ISBN 和书名');
                                    }
                                }}
                            >
                                预览信息
                            </Button>
                            <Button size="large" icon={<ClearOutlined />} onClick={handleReset}>
                                重置表单
                            </Button>
                        </Space>
                    </Card>
                </Form>
            </div>

            {/* ===== 步骤 1：预览确认（使用快照数据渲染） ===== */}
            {currentStep === 1 && formSnapshot && (
                <>
                    <Card style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #e8d5c8' }}>
                        <Alert
                            message="请仔细核对以下信息，确认无误后点击「确认录入」"
                            type="warning"
                            showIcon
                            style={{ marginBottom: 24, borderRadius: 8 }}
                        />

                        <Row gutter={[32, 24]}>
                            <Col xs={24} md={8} style={{ textAlign: 'center' }}>
                                {formSnapshot.cover_url ? (
                                    <Image
                                        src={formSnapshot.cover_url}
                                        style={{ width: 200, height: 280, objectFit: 'cover', borderRadius: 8 }}
                                        fallback={getPlaceholderCover(formSnapshot.title, formSnapshot.author)}
                                    />
                                ) : (
                                    <img
                                        src={getPlaceholderCover(formSnapshot.title, formSnapshot.author)}
                                        alt="封面预览"
                                        style={{ width: 200, height: 280, objectFit: 'cover', borderRadius: 8 }}
                                    />
                                )}
                            </Col>
                            <Col xs={24} md={16}>
                                <Title level={3}>{formSnapshot.title || '未填写书名'}</Title>
                                <Divider />
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))',
                                        gap: 12,
                                    }}
                                >
                                    {[
                                        { label: 'ISBN', value: formSnapshot.isbn, isCode: true },
                                        { label: '作者', value: formSnapshot.author, isStrong: true },
                                        { label: '译者', value: formSnapshot.translator },
                                        { label: '出版社', value: formSnapshot.publisher },
                                        { label: '出版日期', value: formSnapshot.publish_date },
                                        { label: '页数', value: formSnapshot.pages ? `${formSnapshot.pages} 页` : '' },
                                        { label: '定价', value: formSnapshot.price },
                                        { label: '装帧', value: formSnapshot.binding },
                                        { label: '评分', value: formSnapshot.rating },
                                        { label: '原作名', value: formSnapshot.original_title },
                                        { label: '丛书', value: formSnapshot.series },
                                    ]
                                        .filter((item) => item.value)
                                        .map((item, index) => (
                                            <div key={index}>
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    {item.label}
                                                </Text>
                                                <br />
                                                {item.isCode ? (
                                                    <Text code>{item.value}</Text>
                                                ) : item.isStrong ? (
                                                    <Text strong>{item.value}</Text>
                                                ) : (
                                                    <Text>{item.value}</Text>
                                                )}
                                            </div>
                                        ))}
                                </div>
                                {formSnapshot.summary && (
                                    <>
                                        <Divider />
                                        <Text type="secondary">内容简介</Text>
                                        <Paragraph
                                            ellipsis={{ rows: 4, expandable: true }}
                                            style={{ marginTop: 8 }}
                                        >
                                            {formSnapshot.summary}
                                        </Paragraph>
                                    </>
                                )}
                            </Col>
                        </Row>
                    </Card>

                    <Card style={{ borderRadius: 12, border: '1px solid #e8d5c8' }}>
                        <Space size="middle">
                            <Button
                                type="primary"
                                size="large"
                                icon={isSubmitting ? <LoadingOutlined /> : <SaveOutlined />}
                                loading={isSubmitting}
                                onClick={handleSubmit}
                            >
                                确认录入
                            </Button>
                            <Button
                                size="large"
                                icon={<EditOutlined />}
                                onClick={() => setCurrentStep(0)}
                            >
                                返回修改
                            </Button>
                            <Button size="large" onClick={handleReset}>取消</Button>
                        </Space>
                    </Card>
                </>
            )}
        </div>
    );
};

export default BookManualAdd;