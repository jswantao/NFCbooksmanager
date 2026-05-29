// frontend/src/pages/SmartEntry.tsx
/**
 * SmartEntry - 智能录入与信息补全页面
 *
 * 后端: n8n 工作流
 * 四个 Tab:
 * 1. 单本录入：上传封面 → OCR/ISBN → 自动填充 → 确认保存
 * 2. 信息补全：检测缺失字段 → 自动补全 → 确认更新
 * 3. 批量导入增强：跳转到批量导入页
 * 4. AI 对话：n8n Webhook 驱动的智能对话，支持 ISBN 查询、信息补全等
 */

import React, { useState, useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import {
    Card, Tabs, Upload, Button, Input, Select, Form, Skeleton, Result, Empty,
    Breadcrumb, Typography, Space, message, Table, Tag, Progress,
    Alert, Statistic, Row, Col, Descriptions, Divider,
    type UploadProps, type UploadFile, type TableColumnsType,
} from 'antd';
import {
    UploadOutlined, HomeOutlined, ScanOutlined, SearchOutlined,
    CheckCircleOutlined, LoadingOutlined, ThunderboltOutlined,
    BookOutlined, InboxOutlined, PictureOutlined, EditOutlined,
    EyeOutlined, SaveOutlined, NumberOutlined, CloseCircleOutlined,
    SyncOutlined, QuestionCircleOutlined, ExclamationCircleOutlined,
    RobotOutlined, SendOutlined, ReloadOutlined, UserOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    uploadImageForISBN,
    isbnLookup,
    autoFillForm,
    listMissingBooks,
    enrichBook,
    batchEnrichBooks,
    createBookManual,
    extractErrorMessage,
    listShelves,
    callN8NSmartEntry,
} from '../services/api';
import Markdown from '../components/Markdown';
import UnifiedCover from '../components/UnifiedCover';
import type { AutoFillFormData, MissingFieldsInfo } from '../types';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

// ==================== 常量 ====================

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'bmp'];

const FIELD_LABELS: Record<string, string> = {
    title: '书名', author: '作者', translator: '译者',
    publisher: '出版社', publish_date: '出版日期', pages: '页数',
    price: '定价', binding: '装帧', rating: '评分',
    summary: '内容简介', cover_url: '封面', original_title: '原作名',
    series: '丛书', douban_url: '豆瓣链接',
};

const FIELD_PRIORITY_ORDER = [
    'title', 'author', 'publisher', 'publish_date', 'pages',
    'price', 'binding', 'translator', 'rating', 'summary',
    'cover_url', 'original_title', 'series', 'douban_url',
];

// ==================== 子组件 ====================

/** 信息完整度进度条 */
const CompletenessBar: FC<{ completeness: number }> = ({ completeness }) => {
    const color = completeness >= 90 ? 'var(--color-accent-green)' : completeness >= 70 ? 'var(--color-accent-amber)' : 'var(--color-danger)';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Progress
                percent={completeness}
                size="small"
                style={{ width: 120, margin: 0 }}
                strokeColor={color}
                showInfo={false}
            />
            <Text style={{ fontSize: 12, color, fontWeight: 500 }}>
                {completeness}%
            </Text>
        </div>
    );
};

/** 字段标签渲染 */
const FieldTag: FC<{ field: string; type?: 'missing' | 'filled' }> = ({ field, type }) => {
    const label = FIELD_LABELS[field] || field;
    const color = type === 'missing' ? 'error' : type === 'filled' ? 'success' : 'default';
    return <Tag color={color} style={{ borderRadius: 8, margin: '2px 4px' }}>{label}</Tag>;
};

// ==================== 主组件 ====================

const SmartEntry: FC = () => {
    const navigate = useNavigate();

    // ---- Tab 1: 单本录入状态 ----
    const [activeTab, setActiveTab] = useState('single');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);
    const [lookingUp, setLookingUp] = useState(false);
    const [manualISBN, setManualISBN] = useState('');
    const [extractedISBN, setExtractedISBN] = useState<string | null>(null);
    const [formData, setFormData] = useState<AutoFillFormData | null>(null);
    const [step, setStep] = useState<'input' | 'fill' | 'confirm'>('input');
    const [saving, setSaving] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [lookupError, setLookupError] = useState<string | null>(null);
    const [lookupSource, setLookupSource] = useState<string>('');
    const [shelfList, setShelfList] = useState<{ value: number; label: string }[]>([]);
    const [targetShelfId, setTargetShelfId] = useState<number | undefined>(undefined);

    // ---- Tab 2: 信息补全状态 ----
    const [missingBooks, setMissingBooks] = useState<MissingFieldsInfo[]>([]);
    const [missingLoading, setMissingLoading] = useState(false);
    const [selectedBooks, setSelectedBooks] = useState<number[]>([]);
    const [enriching, setEnriching] = useState(false);
    const [enrichResults, setEnrichResults] = useState<Array<{
        book_id: number; title: string; filled: string[]; skipped: string[]; success: boolean;
    }> | null>(null);

    // ---- 图片上传 ----
    const imageFileList: UploadFile[] = useMemo(() => {
        if (!imageFile) return [];
        return [{
            uid: '-1',
            name: imageFile.name,
            status: 'done' as const,
            size: imageFile.size,
            url: imagePreview || undefined,
        }];
    }, [imageFile, imagePreview]);

    const uploadProps: UploadProps = useMemo(() => ({
        accept: '.jpg,.jpeg,.png,.webp,.bmp',
        maxCount: 1,
        showUploadList: { showRemoveIcon: true, showPreviewIcon: true },
        fileList: imageFileList,
        beforeUpload: (f: File) => {
            const ext = f.name.split('.').pop()?.toLowerCase() || '';
            if (!IMAGE_EXTENSIONS.includes(ext)) {
                message.error('不支持的图片格式');
                return Upload.LIST_IGNORE;
            }
            if (f.size > MAX_IMAGE_SIZE) {
                message.error('图片不能超过 5MB');
                return Upload.LIST_IGNORE;
            }
            setImageFile(f);
            setScanError(null);
            setExtractedISBN(null);
            setFormData(null);
            setStep('input');
            const reader = new FileReader();
            reader.onload = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(f);
            return false;
        },
        onRemove: () => {
            setImageFile(null);
            setImagePreview(null);
            setExtractedISBN(null);
            setFormData(null);
            setScanError(null);
            setStep('input');
        },
    }), [imageFileList]);

    // ---- 条形码扫描 ----
    const handleScanBarcode = useCallback(async () => {
        if (!imageFile) return;
        setScanning(true);
        setScanError(null);
        try {
            const result = await uploadImageForISBN(imageFile);
            if (result.success && result.isbn) {
                setExtractedISBN(result.isbn);
                setManualISBN(result.isbn);
                message.success(`识别到 ISBN: ${result.isbn}`);
            } else {
                setScanError(result.message || '未识别到 ISBN，请手动输入');
            }
        } catch (err) {
            setScanError(extractErrorMessage(err) || '扫描失败');
        } finally {
            setScanning(false);
        }
    }, [imageFile]);

    // ---- ISBN 查询 ----
    const handleLookup = useCallback(async () => {
        const isbn = extractedISBN || manualISBN.trim();
        if (!isbn) return;
        setLookingUp(true);
        setLookupError(null);
        try {
            const result = await autoFillForm(isbn);
            if (result.success && result.form_data) {
                setFormData(result.form_data);
                setLookupSource(result.source || result.form_data.source || '');
                setStep('fill');
                message.success(result.message);
            } else {
                setLookupError(result.message || '未找到图书信息');
            }
        } catch (err) {
            setLookupError(extractErrorMessage(err) || '查询失败');
        } finally {
            setLookingUp(false);
        }
    }, [extractedISBN, manualISBN]);

    // ---- 确认保存 ----

    const handleConfirmSave = useCallback(async () => {
        if (!formData || !formData.isbn) return;
        setSaving(true);
        try {
            await createBookManual({
                isbn: formData.isbn,
                title: formData.title || '',
                author: formData.author,
                translator: formData.translator,
                publisher: formData.publisher,
                publish_date: formData.publish_date,
                cover_url: formData.cover_url,
                summary: formData.summary,
                pages: formData.pages,
                price: formData.price,
                binding: formData.binding,
                original_title: formData.original_title,
                series: formData.series,
                rating: formData.rating,
                douban_url: formData.douban_url,
                source: 'smart_entry',
                shelf_id: targetShelfId || undefined,
            });
            setStep('confirm');
            const shelfMsg = targetShelfId ? '，已加入书架' : '';
            message.success(`《${formData.title}》已录入成功${shelfMsg}！`);
        } catch (err) {
            message.error(extractErrorMessage(err) || '保存失败');
        } finally {
            setSaving(false);
        }
    }, [formData, targetShelfId]);

    const handleResetEntry = useCallback(() => {
        setImageFile(null);
        setImagePreview(null);
        setExtractedISBN(null);
        setManualISBN('');
        setFormData(null);
        setScanError(null);
        setLookupError(null);
        setLookupSource('');
        setTargetShelfId(undefined);
        setStep('input');
    }, []);

    // ---- 加载书架列表 ----
    const loadShelfList = useCallback(async () => {
        try {
            const data = await listShelves();
            setShelfList(
                (data || []).map((s: any) => ({
                    value: s.logical_shelf_id,
                    label: s.shelf_name,
                })),
            );
        } catch {
            // 静默处理
        }
    }, []);

    // 组件挂载时加载书架列表
    useEffect(() => { loadShelfList(); }, [loadShelfList]);

    // ---- 加载缺失图书列表 ----
    const handleLoadMissing = useCallback(async () => {
        setMissingLoading(true);
        try {
            const data = await listMissingBooks(50);
            setMissingBooks(data.books || []);
            setEnrichResults(null);
        } catch (err) {
            message.error(extractErrorMessage(err) || '加载失败');
        } finally {
            setMissingLoading(false);
        }
    }, []);

    // ---- 单本补全 ----
    const handleEnrichSingle = useCallback(async (bookId: number) => {
        setEnriching(true);
        try {
            const result = await enrichBook(bookId);
            if (result.success) {
                message.success(result.message);
                handleLoadMissing();
            } else {
                message.warning(result.message);
            }
        } catch (err) {
            message.error(extractErrorMessage(err) || '补全失败');
        } finally {
            setEnriching(false);
        }
    }, [handleLoadMissing]);

    // ---- 批量补全 ----
    const handleBatchEnrich = useCallback(async () => {
        if (selectedBooks.length === 0) {
            message.warning('请先选择需要补全的图书');
            return;
        }
        setEnriching(true);
        try {
            const result = await batchEnrichBooks(selectedBooks);
            setEnrichResults(result.results || []);
            message.success(result.message);
            handleLoadMissing();
        } catch (err) {
            message.error(extractErrorMessage(err) || '批量补全失败');
        } finally {
            setEnriching(false);
        }
    }, [selectedBooks, handleLoadMissing]);

    const [form] = Form.useForm();

    // ---- Tab 4: n8n AI 对话状态 ----
    interface ChatMessageItem {
        id: string;
        role: 'user' | 'assistant';
        content: string;
        timestamp: number;
    }
    const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);
    const chatListRef = useRef<HTMLDivElement>(null);

    const n8nSuggestions = [
        '帮我录入这本书（上传封面照片）',
        '有哪些书信息不全？',
        '帮我补全《三体》的信息',
        '9787549021680 查询这本书',
    ];

    // ---- 缺失图书表格列 ----
    const missingColumns: TableColumnsType<MissingFieldsInfo> = useMemo(() => [
        {
            title: '书名',
            dataIndex: 'title',
            key: 'title',
            width: 200,
            ellipsis: true,
            render: (title: string, record: MissingFieldsInfo) => (
                <Space direction="vertical" size={0}>
                    <Text strong ellipsis style={{ maxWidth: 180 }}>{title || '(无书名)'}</Text>
                    {record.isbn && <Text type="secondary" style={{ fontSize: 11 }}>ISBN: {record.isbn}</Text>}
                </Space>
            ),
        },
        {
            title: '完整度',
            dataIndex: 'completeness',
            key: 'completeness',
            width: 140,
            sorter: (a, b) => a.completeness - b.completeness,
            defaultSortOrder: 'ascend',
            render: (v: number) => <CompletenessBar completeness={v} />,
        },
        {
            title: '缺失字段',
            dataIndex: 'missing_fields',
            key: 'missing_fields',
            render: (fields: string[]) => (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {fields.map(f => <FieldTag key={f} field={f} type="missing" />)}
                </div>
            ),
        },
        {
            title: '建议',
            dataIndex: 'suggestion',
            key: 'suggestion',
            width: 250,
            ellipsis: true,
        },
        {
            title: '操作',
            key: 'action',
            width: 100,
            render: (_: unknown, record: MissingFieldsInfo) => (
                <Button
                    type="primary"
                    size="small"
                    icon={<ThunderboltOutlined />}
                    loading={enriching}
                    onClick={() => handleEnrichSingle(record.book_id)}
                >
                    补全
                </Button>
            ),
        },
    ], [enriching, handleEnrichSingle]);

    // ==================== 渲染 Tab 1: 单本录入 ====================

    const renderSingleEntry = () => (
        <div>
            {/* 步骤指示 */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                <Space size={48}>
                    {[
                        { key: 'input', icon: <PictureOutlined />, label: '上传/输入' },
                        { key: 'fill', icon: <EditOutlined />, label: '自动填充' },
                        { key: 'confirm', icon: <CheckCircleOutlined />, label: '确认保存' },
                    ].map((s, i, arr) => (
                        <React.Fragment key={s.key}>
                            <div style={{
                                textAlign: 'center',
                                opacity: step === s.key || (step === 'confirm' && s.key === 'confirm') ? 1 : 0.4,
                            }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: '50%',
                                    background: step === s.key ? '#8B4513' : '#e5e7eb',
                                    color: step === s.key ? '#fff' : 'var(--app-text-secondary)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 6px', fontSize: 18,
                                }}>
                                    {s.icon}
                                </div>
                                <Text style={{ fontSize: 12 }}>{s.label}</Text>
                            </div>
                            {i < arr.length - 1 && (
                                <div style={{
                                    width: 40, height: 2,
                                    background: step === arr[i + 1].key || step === 'confirm' ? '#8B4513' : '#e5e7eb',
                                    alignSelf: 'center', marginBottom: 18,
                                }} />
                            )}
                        </React.Fragment>
                    ))}
                </Space>
            </div>

            {/* 步骤 1：上传/输入 */}
            {step === 'input' && (
                <Card style={{ borderRadius: 12 }}>
                    <Title level={5} style={{ marginTop: 0 }}>
                        <PictureOutlined style={{ marginRight: 8 }} />
                        上传图书封面或 ISBN 条形码
                    </Title>
                    <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                        上传封面照片或 ISBN 条形码图片，系统将自动识别 ISBN 并查询图书信息。
                        也可直接手动输入 ISBN。
                    </Paragraph>

                    <Row gutter={24}>
                        <Col xs={24} md={12}>
                            <Dragger {...uploadProps} style={{ borderRadius: 12 }}>
                                <p style={{ fontSize: 48, color: '#8B4513', opacity: 0.3 }}>
                                    <InboxOutlined />
                                </p>
                                <p style={{ fontSize: 16, fontWeight: 500 }}>点击或拖拽图片到此区域</p>
                                <p style={{ color: '#999', fontSize: 13 }}>支持 JPG/PNG/WebP/BMP，最大 5MB</p>
                            </Dragger>
                            {imageFile && (
                                <div style={{ marginTop: 12, textAlign: 'center' }}>
                                    <Button
                                        type="primary"
                                        icon={<ScanOutlined />}
                                        loading={scanning}
                                        onClick={handleScanBarcode}
                                        style={{ borderRadius: 8 }}
                                    >
                                        {scanning ? '正在扫描...' : '扫描条形码'}
                                    </Button>
                                </div>
                            )}
                            {scanError && (
                                <Alert
                                    message={scanError}
                                    type="warning"
                                    showIcon
                                    style={{ marginTop: 8, borderRadius: 8 }}
                                />
                            )}
                        </Col>
                        <Col xs={24} md={12}>
                            <div style={{
                                padding: 16, background: '#f9fafb', borderRadius: 12,
                                border: '1px solid #f0f0f0', height: '100%',
                            }}>
                                <Text strong>手动输入 ISBN</Text>
                                <div style={{ marginTop: 12 }}>
                                    <Input
                                        size="large"
                                        placeholder="输入 ISBN-10 或 ISBN-13"
                                        value={manualISBN}
                                        onChange={e => {
                                            setManualISBN(e.target.value);
                                            setScanError(null);
                                        }}
                                        prefix={<NumberOutlined style={{ color: '#999' }} />}
                                        onPressEnter={handleLookup}
                                        style={{ borderRadius: 8 }}
                                    />
                                </div>
                                <div style={{ marginTop: 16 }}>
                                    <Button
                                        type="primary"
                                        size="large"
                                        block
                                        icon={<SearchOutlined />}
                                        loading={lookingUp}
                                        onClick={handleLookup}
                                        disabled={!manualISBN.trim() && !extractedISBN}
                                        style={{ borderRadius: 8 }}
                                    >
                                        {lookingUp ? '正在查询...' : '查询图书信息'}
                                    </Button>
                                </div>
                                {extractedISBN && (
                                    <Alert
                                        message={`已识别 ISBN: ${extractedISBN}`}
                                        type="success"
                                        showIcon
                                        style={{ marginTop: 12, borderRadius: 8 }}
                                    />
                                )}
                                {lookupError && (
                                    <Alert
                                        message={lookupError}
                                        type="error"
                                        showIcon
                                        style={{ marginTop: 12, borderRadius: 8 }}
                                    />
                                )}
                            </div>
                        </Col>
                    </Row>
                </Card>
            )}

            {/* 步骤 2：自动填充 */}
            {step === 'fill' && formData && (
                <Card style={{ borderRadius: 12 }}>
                    <Title level={5} style={{ marginTop: 0 }}>
                        <EditOutlined style={{ marginRight: 8 }} />
                        确认图书信息
                    </Title>
                    <Paragraph type="secondary">
                        以下信息从{' '}
                        {lookupSource === 'douban' && <Tag color="green">豆瓣</Tag>}
                        {lookupSource === 'google_books' && <Tag color="blue">Google Books</Tag>}
                        {lookupSource === 'taiwan_isbn' && <Tag color="cyan">台湾ISBN</Tag>}
                        {lookupSource === 'openlibrary' && <Tag color="orange">OpenLibrary</Tag>}
                        {!lookupSource && <Tag>未知来源</Tag>}
                        {' '}获取
                        {lookupSource !== 'douban' && lookupSource !== '' && (
                            <Text style={{ fontSize: 12, color: 'var(--color-accent-amber)', marginLeft: 8 }}>
                                <ExclamationCircleOutlined /> 非豆瓣源数据可能缺少中文信息，建议核对
                            </Text>
                        )}
                        ，请核对后保存。
                    </Paragraph>

                    {/* 封面预览 */}
                    {formData.cover_url && (
                        <div style={{ textAlign: 'center', marginBottom: 16 }}>
                            <UnifiedCover
                                coverUrl={formData.cover_url}
                                title={formData.title}
                                author={formData.author}
                                mode="image"
                                width={120}
                                borderRadius={8}
                                shadow
                                preview={{ mask: '查看大图' }}
                            />
                        </div>
                    )}

                    {/* 字段展示 */}
                    <Descriptions
                        bordered
                        size="small"
                        column={{ xs: 1, sm: 2 }}
                        style={{ marginBottom: 16 }}
                        items={FIELD_PRIORITY_ORDER
                            .filter(f => formData[f as keyof AutoFillFormData])
                            .map(f => ({
                                key: f,
                                label: FIELD_LABELS[f] || f,
                                children: String(formData[f as keyof AutoFillFormData] || ''),
                            }))}
                    />

                    {/* 书架选择 */}
                    <div style={{
                        padding: '12px 16px', background: '#f9fafb', borderRadius: 10,
                        marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                        <BookOutlined style={{ color: '#8B4513', fontSize: 16 }} />
                        <span style={{ fontSize: 14, whiteSpace: 'nowrap' }}>添加到书架：</span>
                        <Select
                            value={targetShelfId}
                            onChange={(v) => setTargetShelfId(v)}
                            placeholder="选择书架（可选）"
                            allowClear
                            style={{ flex: 1, maxWidth: 260 }}
                            options={shelfList}
                        />
                        <Tag color="purple">智能录入</Tag>
                        {lookupSource && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                数据源: {lookupSource === 'douban' ? '豆瓣' : lookupSource === 'google_books' ? 'Google Books' : lookupSource === 'taiwan_isbn' ? '台湾ISBN' : 'OpenLibrary'}
                            </Text>
                        )}
                    </div>

                    <Space size={12}>
                        <Button
                            type="primary"
                            size="large"
                            icon={<SaveOutlined />}
                            loading={saving}
                            onClick={handleConfirmSave}
                            style={{ borderRadius: 8 }}
                        >
                            确认录入
                        </Button>
                        <Button size="large" onClick={handleResetEntry}>重新开始</Button>
                        <Button
                            size="large"
                            onClick={() => navigate(`/books/add`)}
                        >
                            手动编辑
                        </Button>
                    </Space>
                </Card>
            )}

            {/* 步骤 3：完成 */}
            {step === 'confirm' && formData && (
                <Card style={{ borderRadius: 12 }}>
                    <Result
                        status="success"
                        title={`《${formData.title}》录入成功！`}
                        subTitle={formData.author ? `作者: ${formData.author}` : undefined}
                        extra={[
                            <Button
                                key="view"
                                type="primary"
                                icon={<EyeOutlined />}
                                onClick={() => navigate('/wall')}
                                style={{ borderRadius: 8 }}
                            >
                                查看封面墙
                            </Button>,
                            <Button
                                key="continue"
                                icon={<SyncOutlined />}
                                onClick={handleResetEntry}
                            >
                                继续录入
                            </Button>,
                            <Button
                                key="import"
                                icon={<UploadOutlined />}
                                onClick={() => setActiveTab('batch')}
                            >
                                批量导入
                            </Button>,
                        ]}
                    />
                </Card>
            )}
        </div>
    );

    // ==================== 渲染 Tab 2: 信息补全 ====================

    const renderEnrich = () => (
        <div>
            <Card style={{ borderRadius: 12, marginBottom: 24 }}>
                <Title level={5} style={{ marginTop: 0 }}>
                    <ThunderboltOutlined style={{ marginRight: 8 }} />
                    信息补全
                </Title>
                <Paragraph type="secondary">
                    自动检测馆藏中信息不完整的图书，通过 ISBN 查询豆瓣、Google Books 等数据源，
                    自动补全缺失的作者、出版社、简介等信息。
                </Paragraph>

                <Space size={12}>
                    <Button
                        type="primary"
                        icon={<SearchOutlined />}
                        loading={missingLoading}
                        onClick={handleLoadMissing}
                        style={{ borderRadius: 8 }}
                    >
                        {missingLoading ? '正在扫描...' : '扫描信息不完整的图书'}
                    </Button>
                    {missingBooks.length > 0 && (
                        <Button
                            type="primary"
                            danger
                            icon={<ThunderboltOutlined />}
                            loading={enriching}
                            onClick={handleBatchEnrich}
                            disabled={selectedBooks.length === 0}
                            style={{ borderRadius: 8 }}
                        >
                            批量补全选中 ({selectedBooks.length})
                        </Button>
                    )}
                </Space>
            </Card>

            {missingLoading && (
                <Card style={{ borderRadius: 12 }}>
                    <Skeleton active paragraph={{ rows: 8 }} />
                </Card>
            )}

            {!missingLoading && missingBooks.length === 0 && enrichResults === null && (
                <Card style={{ borderRadius: 12 }}>
                    <Empty
                        image={<QuestionCircleOutlined style={{ fontSize: 72, color: 'var(--app-skeleton-color)' }} />}
                        description="点击「扫描信息不完整的图书」开始检测"
                    />
                </Card>
            )}

            {!missingLoading && missingBooks.length === 0 && enrichResults !== null && (
                <Card style={{ borderRadius: 12 }}>
                    <Result
                        status="success"
                        title="所有图书信息已完整"
                        icon={<CheckCircleOutlined style={{ color: 'var(--color-accent-green)' }} />}
                    />
                </Card>
            )}

            {missingBooks.length > 0 && (
                <Card style={{ borderRadius: 12 }}>
                    <Alert
                        message={`找到 ${missingBooks.length} 本信息不完整的图书`}
                        type="info"
                        showIcon
                        style={{ marginBottom: 16, borderRadius: 8 }}
                    />
                    <Table<MissingFieldsInfo>
                        dataSource={missingBooks}
                        columns={missingColumns}
                        rowKey="book_id"
                        rowSelection={{
                            selectedRowKeys: selectedBooks,
                            onChange: (keys) => setSelectedBooks(keys as number[]),
                        }}
                        size="small"
                        pagination={{ pageSize: 20, showTotal: t => `共 ${t} 本` }}
                        scroll={{ x: 800 }}
                    />
                </Card>
            )}

            {enrichResults && enrichResults.length > 0 && (
                <Card style={{ borderRadius: 12, marginTop: 24 }} title="补全结果">
                    {enrichResults.map((r, i) => (
                        <div key={i} style={{
                            padding: '8px 12px', marginBottom: 8, borderRadius: 8,
                            background: r.success ? 'var(--color-accent-green-bg)' : 'var(--color-danger-bg)',
                            border: `1px solid ${r.success ? 'var(--color-accent-green-border)' : 'var(--color-danger-border)'}`,
                        }}>
                            <Space>
                                {r.success
                                    ? <CheckCircleOutlined style={{ color: 'var(--color-accent-green)' }} />
                                    : <CloseCircleOutlined style={{ color: 'var(--color-danger)' }} />
                                }
                                <Text strong>{r.title}</Text>
                                {r.filled.length > 0 && (
                                    <Text type="secondary">
                                        已补全: {r.filled.join('、')}
                                    </Text>
                                )}
                                {r.skipped.length > 0 && (
                                    <Text type="warning">
                                        跳过: {r.skipped.join('、')}
                                    </Text>
                                )}
                            </Space>
                        </div>
                    ))}
                </Card>
            )}
        </div>
    );

    // ---- n8n 聊天处理 ----
    const handleChatSend = useCallback(async () => {
        const query = chatInput.trim();
        if (!query || chatLoading) return;

        const userMsg: ChatMessageItem = {
            id: `u-${Date.now()}`,
            role: 'user',
            content: query,
            timestamp: Date.now(),
        };
        setChatMessages(prev => [...prev, userMsg]);
        setChatInput('');
        setChatLoading(true);
        setChatError(null);

        try {
            const reply = await callN8NSmartEntry(query, '');
            const aiMsg: ChatMessageItem = {
                id: `a-${Date.now()}`,
                role: 'assistant',
                content: reply,
                timestamp: Date.now(),
            };
            setChatMessages(prev => [...prev, aiMsg]);
        } catch (err) {
            const errorMsg = extractErrorMessage(err) || '助手暂时无法回复，请稍后再试';
            setChatError(errorMsg);
            setChatMessages(prev => [...prev, {
                id: `e-${Date.now()}`,
                role: 'assistant',
                content: `抱歉，${errorMsg}`,
                timestamp: Date.now(),
            }]);
        } finally {
            setChatLoading(false);
            // 滚动到底部
            setTimeout(() => {
                if (chatListRef.current) {
                    chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
                }
            }, 100);
        }
    }, [chatInput, chatLoading]);

    const handleChatKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleChatSend();
        }
    }, [handleChatSend]);

    const handleSuggestionClick = useCallback((q: string) => {
        setChatInput(q);
    }, []);

    // ==================== 渲染 Tab 4: n8n AI 对话 ====================

    const renderN8NChat = () => (
        <div style={{ display: 'flex', flexDirection: 'column', height: 520 }}>
            {/* 消息列表 */}
            <div
                ref={chatListRef}
                style={{
                    flex: 1,
                    overflow: 'auto',
                    padding: '12px 0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                }}
            >
                {chatMessages.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <RobotOutlined style={{ fontSize: 48, color: 'var(--app-skeleton-color)', marginBottom: 16 }} />
                        <Title level={5} style={{ color: 'var(--app-text-secondary)' }}>
                            你好，我是智能录入助手
                        </Title>
                        <Paragraph type="secondary" style={{ maxWidth: 400, margin: '0 auto' }}>
                            我可以帮你录入新书、查询 ISBN、补全图书信息。
                            <br />
                            直接输入你的需求，我会帮你处理～
                        </Paragraph>
                        {/* 建议问题 */}
                        <div style={{
                            display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
                            marginTop: 20, maxWidth: 500, margin: '20px auto 0',
                        }}>
                            {n8nSuggestions.map(q => (
                                <Tag
                                    key={q}
                                    style={{
                                        cursor: 'pointer', borderRadius: 16, padding: '4px 14px',
                                        fontSize: 12, border: '1px solid #e5e7eb',
                                    }}
                                    onClick={() => handleSuggestionClick(q)}
                                >
                                    {q}
                                </Tag>
                            ))}
                        </div>
                    </div>
                )}

                {chatMessages.map(msg => (
                    <div
                        key={msg.id}
                        style={{
                            display: 'flex',
                            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            padding: '0 8px',
                        }}
                    >
                        <div style={{
                            display: 'flex',
                            gap: 8,
                            maxWidth: '80%',
                            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                        }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: '50%',
                                background: msg.role === 'user' ? '#8B4513' : '#f0f0f0',
                                color: msg.role === 'user' ? '#fff' : 'var(--app-text-secondary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0, fontSize: 14,
                            }}>
                                {msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                            </div>
                            <div style={{
                                padding: '10px 14px',
                                borderRadius: 12,
                                background: msg.role === 'user' ? '#8B4513' : '#f3f4f6',
                                color: msg.role === 'user' ? '#fff' : '#1f2937',
                                fontSize: 14,
                                lineHeight: 1.6,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            }}>
                                {msg.role === 'assistant' ? <Markdown content={msg.content} isAssistant /> : msg.content}
                            </div>
                        </div>
                    </div>
                ))}

                {chatLoading && (
                    <div style={{ display: 'flex', gap: 8, padding: '0 8px', alignItems: 'center' }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: '#f0f0f0', color: 'var(--app-text-secondary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14,
                        }}>
                            <RobotOutlined />
                        </div>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                            <LoadingOutlined style={{ marginRight: 6 }} />
                            正在思考...
                        </Text>
                    </div>
                )}
            </div>

            {/* 输入区域 */}
            <div style={{
                borderTop: '1px solid #f0f0f0',
                padding: '12px 0 0',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-end',
            }}>
                <Input.TextArea
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    placeholder="输入你想做的事情，如：帮我录入这本书..."
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    disabled={chatLoading}
                    style={{ borderRadius: 10, resize: 'none' }}
                />
                <Button
                    type="primary"
                    icon={chatLoading ? <LoadingOutlined /> : <SendOutlined />}
                    onClick={handleChatSend}
                    loading={chatLoading}
                    disabled={!chatInput.trim()}
                    style={{
                        borderRadius: 10,
                        background: '#8B4513',
                        borderColor: '#8B4513',
                        flexShrink: 0,
                    }}
                />
            </div>

            {/* 错误重试 */}
            {chatError && (
                <Alert
                    message={chatError}
                    type="warning"
                    showIcon
                    closable
                    onClose={() => setChatError(null)}
                    style={{ marginTop: 8, borderRadius: 8 }}
                />
            )}
        </div>
    );

    // ==================== 渲染 Tab 3: 批量导入 ====================

    const renderBatchImport = () => (
        <Card style={{ borderRadius: 12 }}>
            <Title level={5} style={{ marginTop: 0 }}>
                <UploadOutlined style={{ marginRight: 8 }} />
                批量导入增强
            </Title>
            <Paragraph type="secondary">
                批量导入功能已集成 AI 智能补全能力。导入过程中，系统会自动：
            </Paragraph>
            <ul style={{ paddingLeft: 20, color: 'var(--app-text-secondary)' }}>
                <li>校验 ISBN 格式有效性</li>
                <li>标记已存在的图书，避免重复导入</li>
                <li>导入后自动同步豆瓣数据（需配置 Cookie）</li>
                <li>导入完成后可通过「信息补全」为遗漏字段自动查询外部数据源</li>
            </ul>
            <Alert
                message="建议工作流"
                description="先通过批量导入录入 ISBN 列表 → 导入完成后使用「信息补全」标签页自动补全缺失信息 → 最后手动核查确认。"
                type="info"
                showIcon
                style={{ borderRadius: 8, marginBottom: 16 }}
            />
            <Button
                type="primary"
                size="large"
                icon={<UploadOutlined />}
                onClick={() => navigate('/import')}
                style={{ borderRadius: 8 }}
            >
                前往批量导入
            </Button>
        </Card>
    );

    // ==================== Tab 配置 ====================

    const tabItems = useMemo(() => [
        {
            key: 'single',
            label: (
                <span>
                    <ScanOutlined /> 单本录入
                </span>
            ),
            children: renderSingleEntry(),
        },
        {
            key: 'enrich',
            label: (
                <span>
                    <ThunderboltOutlined /> 信息补全
                </span>
            ),
            children: renderEnrich(),
        },
        {
            key: 'batch',
            label: (
                <span>
                    <UploadOutlined /> 批量导入
                </span>
            ),
            children: renderBatchImport(),
        },
        {
            key: 'chat',
            label: (
                <span>
                    <RobotOutlined /> AI 对话
                </span>
            ),
            children: renderN8NChat(),
        },
    ], [step, formData, imageFile, scanning, lookingUp, saving, scanError, lookupError,
        extractedISBN, manualISBN, imagePreview, missingBooks, missingLoading,
        selectedBooks, enriching, enrichResults, chatMessages, chatInput,
        chatLoading, chatError]);

    // ==================== 页面渲染 ====================

    return (
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
            <Breadcrumb
                style={{ marginBottom: 16 }}
                items={[
                    { title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> },
                    { title: '智能录入' },
                ]}
            />

            <Title level={3} style={{ marginBottom: 24 }}>
                <ThunderboltOutlined style={{ marginRight: 12, color: '#8B4513' }} />
                智能录入
            </Title>

            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
                size="large"
                style={{ minHeight: 500 }}
            />
        </div>
    );
};

export default SmartEntry;
