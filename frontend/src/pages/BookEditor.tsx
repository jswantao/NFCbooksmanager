// frontend/src/pages/BookEditor.tsx
/**
 * BookEditor - 统一图书编辑组件（含本地封面上传）
 *
 * 支持两种路由模式：
 * - /books/:bookId/edit       → 独立图书编辑 (globalBookId)
 * - /shelves/:shelfId/books/:index/edit → 书架内图书编辑 (shelfRef)
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, type FC } from 'react';
import {
    Card, Form, Input, InputNumber, Button, Select, Skeleton, Result,
    Breadcrumb, Typography, Space, message, Divider, Upload,
} from 'antd';
import {
    ArrowLeftOutlined, HomeOutlined, SaveOutlined, UndoOutlined,
    UploadOutlined, DeleteOutlined, PictureOutlined,
} from '@ant-design/icons';
import type { UploadFile, RcFile } from 'antd/es/upload';
import { useNavigate, useParams } from 'react-router-dom';
import { useBookManager } from '../hooks/useBookManager';
import bookService from '../services/bookService';
import { uploadBookCover, deleteBookCover } from '../services/api';
import { extractErrorMessage } from '../services/api';
import type { BookReference } from '../types/bookRef';
import { resolveBookRef, isGlobalBookId } from '../types/bookRef';
import UnifiedCover from '../components/UnifiedCover';

const { Title, Text } = Typography;
const { TextArea } = Input;

const BINDING_OPTIONS = [
    { value: '平装', label: '平装' }, { value: '精装', label: '精装' },
    { value: '线装', label: '线装' }, { value: '其他', label: '其他' },
];

interface EditFormData {
    title: string; author: string; translator: string; publisher: string;
    publish_date: string; pages: number | null; price: string; binding: string;
    rating: string; original_title: string; series: string;
    cover_url: string; douban_url: string; summary: string;
}

const BookEditor: FC = () => {
    const navigate = useNavigate();
    const params = useParams<{ bookId?: string; shelfId?: string; index?: string }>();
    const [form] = Form.useForm<EditFormData>();
    const { loading, error, getBook, updateBook } = useBookManager();

    const [saving, setSaving] = useState(false);
    const [bookData, setBookData] = useState<any>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [localCoverPath, setLocalCoverPath] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const coverUrlValue = Form.useWatch('cover_url', form);
    const currentTitle = Form.useWatch('title', form);
    const currentAuthor = Form.useWatch('author', form);

    const doubanUrlValue = Form.useWatch('douban_url', form);

    // ---- 构建 BookReference ----
    const bookRef = useMemo((): BookReference | null => {
        if (params.bookId) {
            return resolveBookRef(params.bookId);
        }
        if (params.shelfId && params.index) {
            const idx = parseInt(params.index);
            if (!isNaN(idx)) return { shelfId: params.shelfId, shelfBookIndex: idx };
        }
        return null;
    }, [params.bookId, params.shelfId, params.index]);

    const numericId = useMemo(() => {
        if (!bookRef) return null;
        if (bookRef.globalBookId) {
            const digits = bookRef.globalBookId.replace(/\D/g, '');
            return digits ? parseInt(digits) : null;
        }
        return null;
    }, [bookRef]);

    const isGlobalMode = params.bookId != null;

    // ---- 加载数据 ----
    useEffect(() => {
        if (!bookRef || !numericId) return;
        let cancelled = false;
        getBook(numericId).then(book => {
            if (cancelled || !book) return;
            setBookData(book);
            setLocalCoverPath(book.local_cover_path || null);
        }).catch(err => {
            if (cancelled) return;
            setLoadError(err?.response?.data?.detail || err?.message || '加载失败');
        });
        return () => { cancelled = true; };
    }, [numericId]); // getBook is stable (useCallback), bookRef guard doesn't need to retrigger

    // ---- 填充表单 ----
    useEffect(() => {
        if (!bookData) return;
        form.setFieldsValue({
            title: bookData.title || '',
            author: bookData.author || '',
            translator: bookData.translator || '',
            publisher: bookData.publisher || '',
            publish_date: bookData.publish_date || '',
            pages: bookData.pages ? parseInt(bookData.pages as string) : null,
            price: bookData.price || '',
            binding: bookData.binding || '',
            rating: bookData.rating || '',
            original_title: bookData.original_title || '',
            series: bookData.series || '',
            cover_url: bookData.cover_url || '',
            douban_url: bookData.douban_url || '',
            summary: bookData.summary || '',
        });
    }, [bookData, form]);

    // ---- 封面上传 ----
    const handleUpload = useCallback(async (file: RcFile) => {
        if (!numericId) return;
        setUploading(true);
        try {
            const result = await uploadBookCover(numericId, file);
            setLocalCoverPath(result.local_cover_path);
            message.success({ content: '封面上传成功', key: 'cover-upload' });
        } catch (err: unknown) {
            message.error({ content: extractErrorMessage(err) || '上传失败', key: 'cover-upload' });
        } finally {
            setUploading(false);
        }
    }, [numericId]);

    const handleDeleteCover = useCallback(async () => {
        if (!numericId) return;
        setDeleting(true);
        try {
            await deleteBookCover(numericId);
            setLocalCoverPath(null);
            message.success({ content: '本地封面已删除', key: 'cover-delete' });
        } catch (err: unknown) {
            message.error({ content: extractErrorMessage(err) || '删除失败', key: 'cover-delete' });
        } finally {
            setDeleting(false);
        }
    }, [numericId]);

    // ---- 保存 ----
    const handleSave = useCallback(async () => {
        if (!numericId) return;
        try {
            const values = await form.validateFields();
            setSaving(true);
            await updateBook(numericId, values);
            message.success('图书信息已保存');
            if (isGlobalMode) {
                navigate(`/shelf/1/book/${numericId}`, { replace: true });
            } else {
                navigate(-1);
            }
        } catch (err: any) {
            if (err?.errorFields) {
                message.warning('请检查表单中的必填项');
            } else {
                message.error(err?.response?.data?.detail || err?.message || '保存失败');
            }
        } finally {
            setSaving(false);
        }
    }, [numericId, form, updateBook, navigate, isGlobalMode]);

    const handleBack = useCallback(() => {
        if (isGlobalMode && numericId) {
            navigate(`/shelf/1/book/${numericId}`);
        } else {
            navigate(-1);
        }
    }, [navigate, isGlobalMode, numericId]);

    // ---- 渲染 ----
    if (loading && !bookData) {
        return <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
            <Skeleton active paragraph={{ rows: 12 }} />
        </div>;
    }

    if (loadError || (!loading && !bookData)) {
        return <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
            <Result status="error" title="加载失败"
                subTitle={loadError || '未找到该图书'}
                extra={[
                    <Button key="back" onClick={handleBack} icon={<ArrowLeftOutlined />}>返回</Button>,
                ]} />
        </div>;
    }

    const hasDoubanCover = !!coverUrlValue;
    const hasLocalCover = !!localCoverPath;

    return (
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
            <Breadcrumb style={{ marginBottom: 16 }} items={[
                { title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> },
                isGlobalMode
                    ? { title: <a onClick={() => navigate('/admin/books')}>图书管理</a> }
                    : { title: <a onClick={() => navigate(-1)}>书架</a> },
                { title: `编辑: ${bookData?.title || '图书'}` },
            ]} />

            <Title level={4} style={{ marginBottom: 24 }}>
                编辑图书 {bookData?.title ? `- ${bookData.title}` : ''}
            </Title>

            <Card>
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    {/* 封面预览与上传 */}
                    <Form.Item label="图书封面">
                        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <div style={{
                                width: 140,
                                borderRadius: 10,
                                overflow: 'hidden',
                                boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                                flexShrink: 0,
                            }}>
                                <UnifiedCover
                                    book={{ cover_url: coverUrlValue, local_cover_path: localCoverPath, douban_url: doubanUrlValue, title: currentTitle, author: currentAuthor }}
                                    mode="image"
                                    width={140}
                                    aspectRatio="140/196"
                                    borderRadius={0}
                                    shadow={false}
                                    preview={{ mask: '查看大图' }}
                                />
                            </div>
                            <div style={{ flex: 1, minWidth: 200 }}>
                                {hasDoubanCover && (
                                    <div style={{
                                        padding: '6px 12px', borderRadius: 8, marginBottom: 12,
                                        background: '#f0fdf4', border: '1px solid #bbf7d0',
                                        fontSize: 13, color: '#166534',
                                    }}>
                                        已设置豆瓣封面（优先显示）
                                    </div>
                                )}
                                {hasLocalCover && (
                                    <div style={{
                                        padding: '6px 12px', borderRadius: 8, marginBottom: 12,
                                        background: '#eff6ff', border: '1px solid #bfdbfe',
                                        fontSize: 13, color: '#1d4ed8',
                                    }}>
                                        已上传本地封面{hasDoubanCover ? '（备选）' : '（当前显示）'}
                                    </div>
                                )}
                                {!hasDoubanCover && !hasLocalCover && (
                                    <div style={{
                                        padding: '6px 12px', borderRadius: 8, marginBottom: 12,
                                        background: '#fffbeb', border: '1px solid #fde68a',
                                        fontSize: 13, color: '#92400e',
                                    }}>
                                        暂无封面图片，可上传本地封面
                                    </div>
                                )}
                                <Space size={8} wrap>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        title="上传本地封面图片"
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleUpload(file as RcFile);
                                            e.target.value = '';
                                        }}
                                    />
                                    <Button
                                        icon={<UploadOutlined />}
                                        onClick={() => fileInputRef.current?.click()}
                                        loading={uploading}
                                        size="middle"
                                    >
                                        {hasLocalCover ? '替换本地封面' : '上传本地封面'}
                                    </Button>
                                    {hasLocalCover && (
                                        <Button
                                            icon={<DeleteOutlined />}
                                            danger
                                            onClick={handleDeleteCover}
                                            loading={deleting}
                                            size="middle"
                                        >
                                            删除本地封面
                                        </Button>
                                    )}
                                </Space>
                                <div style={{ marginTop: 8 }}>
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                        支持 JPG/PNG/WebP，最大 5MB
                                    </Text>
                                </div>
                            </div>
                        </div>
                    </Form.Item>

                    <Form.Item name="cover_url" label="豆瓣封面 URL">
                        <Input placeholder="https://img.doubanio.com/view/subject/..." />
                    </Form.Item>

                    <Form.Item name="title" label="书名"
                        rules={[{ required: true, message: '请输入书名' }]}>
                        <Input placeholder="书名" />
                    </Form.Item>
                    <Form.Item name="author" label="作者">
                        <Input placeholder="作者" />
                    </Form.Item>
                    <Form.Item name="translator" label="译者">
                        <Input placeholder="译者" />
                    </Form.Item>
                    <Form.Item name="publisher" label="出版社">
                        <Input placeholder="出版社" />
                    </Form.Item>
                    <Form.Item name="publish_date" label="出版日期">
                        <Input placeholder="如 2020-01-15" />
                    </Form.Item>
                    <Form.Item name="pages" label="页数">
                        <InputNumber min={1} style={{ width: '100%' }} placeholder="页数" />
                    </Form.Item>
                    <Form.Item name="price" label="定价">
                        <Input placeholder="如 59.00" />
                    </Form.Item>
                    <Form.Item name="binding" label="装帧">
                        <Select options={BINDING_OPTIONS} placeholder="选择装帧类型" />
                    </Form.Item>
                    <Form.Item name="rating" label="评分">
                        <Input placeholder="如 8.5" />
                    </Form.Item>
                    <Form.Item name="original_title" label="原作名">
                        <Input placeholder="原作名" />
                    </Form.Item>
                    <Form.Item name="series" label="丛书">
                        <Input placeholder="丛书系列" />
                    </Form.Item>
                    <Form.Item name="douban_url" label="豆瓣链接">
                        <Input placeholder="https://book.douban.com/subject/..." />
                    </Form.Item>
                    <Form.Item name="summary" label="内容简介">
                        <TextArea rows={4} placeholder="内容简介" />
                    </Form.Item>

                    <Divider />
                    <Space>
                        <Button type="primary" htmlType="submit"
                            loading={saving} icon={<SaveOutlined />} size="large">
                            保存修改
                        </Button>
                        <Button onClick={handleBack} icon={<ArrowLeftOutlined />} size="large">
                            取消
                        </Button>
                    </Space>
                </Form>
            </Card>
        </div>
    );
};

export default BookEditor;
