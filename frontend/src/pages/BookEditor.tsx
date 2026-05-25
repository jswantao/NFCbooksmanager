// frontend/src/pages/BookEditor.tsx
/**
 * BookEditor - 统一图书编辑组件
 *
 * 支持两种路由模式：
 * - /books/:bookId/edit       → 独立图书编辑 (globalBookId)
 * - /shelves/:shelfId/books/:index/edit → 书架内图书编辑 (shelfRef)
 */

import React, { useState, useEffect, useCallback, useMemo, type FC } from 'react';
import {
    Card, Form, Input, InputNumber, Button, Select, Skeleton, Result,
    Breadcrumb, Typography, Space, message, Divider,
} from 'antd';
import {
    ArrowLeftOutlined, HomeOutlined, SaveOutlined, UndoOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useBookManager } from '../hooks/useBookManager';
import bookService from '../services/bookService';
import type { BookReference } from '../types/bookRef';
import { resolveBookRef, isGlobalBookId } from '../types/bookRef';

const { Title } = Typography;
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
        }).catch(err => {
            if (cancelled) return;
            setLoadError(err?.response?.data?.detail || err?.message || '加载失败');
        });
        return () => { cancelled = true; };
    }, [numericId]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const currentCoverUrl = Form.useWatch('cover_url', form);
    const currentTitle = Form.useWatch('title', form);
    const currentAuthor = Form.useWatch('author', form);

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
                    <Form.Item name="cover_url" label="封面 URL">
                        <Input placeholder="https://img.doubanio.com/..." />
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
