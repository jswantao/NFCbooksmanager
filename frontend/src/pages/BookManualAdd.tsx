// frontend/src/pages/BookManualAdd.tsx
/**
 * 手动录入图书页面 - React 19 + Ant Design 6
 *
 * 架构：useBookAddWizard (步骤+提交) + BookFormFields + BookAddPreview + BookAddComplete
 */

import React, { useEffect, useCallback, type FC } from "react";
import { Card, Form, Button, Space, Typography, Steps, Breadcrumb, App, theme } from "antd";
import {
    BookOutlined, HomeOutlined, FormOutlined, EyeOutlined, CheckCircleOutlined,
    SaveOutlined, ArrowLeftOutlined, PlusOutlined, ClearOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useBookAddWizard, type BookFormData } from "../hooks/useBookAddWizard";
import { useFormDraft } from "../hooks/useFormDraft";
import BookFormFields from "../components/book/BookFormFields";
import BookAddPreview from "../components/book/BookAddPreview";
import BookAddComplete from "../components/book/BookAddComplete";

const { Title } = Typography;
const DRAFT_STORAGE_KEY = "book-manual-add-draft";

const STEPS = [
    { title: "填写信息", icon: <FormOutlined /> },
    { title: "预览确认", icon: <EyeOutlined /> },
    { title: "完成录入", icon: <CheckCircleOutlined /> },
];

const BookManualAdd: FC = () => {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const { token } = theme.useToken();
    const [form] = Form.useForm<BookFormData>();

    const wiz = useBookAddWizard();
    const { saveDraft, loadDraft, clearDraft } = useFormDraft(form, DRAFT_STORAGE_KEY);

    useEffect(() => {
        wiz.loadShelves();
        const draft = loadDraft();
        if (draft?.isbn) {
            form.setFieldsValue(draft);
            message.info({ content: "已恢复上次未完成的录入", key: "draft-restore", duration: 3 });
        }
    }, []);

    useEffect(() => {
        const interval = setInterval(saveDraft, 30000);
        return () => clearInterval(interval);
    }, [saveDraft]);

    const handlePreview = useCallback(async () => {
        try {
            await form.validateFields(["isbn", "title"]);
            const values = form.getFieldsValue();
            const snapshot: BookFormData = {
                isbn: String(values.isbn ?? "").trim(),
                title: String(values.title ?? "").trim(),
                author: String(values.author ?? "").trim(),
                translator: String(values.translator ?? "").trim(),
                publisher: String(values.publisher ?? "").trim(),
                publish_date: String(values.publish_date ?? "").trim(),
                cover_url: String(values.cover_url ?? "").trim(),
                summary: String(values.summary ?? "").trim(),
                pages: values.pages ? Number(values.pages) : null,
                price: String(values.price ?? "").trim(),
                binding: String(values.binding || "平装").trim(),
                rating: String(values.rating ?? "").trim(),
                original_title: String(values.original_title ?? "").trim(),
                series: String(values.series ?? "").trim(),
                douban_url: String(values.douban_url ?? "").trim(),
                shelf_id: values.shelf_id ? Number(values.shelf_id) : undefined,
            };
            wiz.goToPreview(snapshot);
            saveDraft();
        } catch {
            message.warning({ content: "请先填写 ISBN 和书名", key: "validate-warning" });
        }
    }, [form, wiz, saveDraft, message]);

    const handleSubmit = useCallback(async () => {
        if (!wiz.formSnapshot) return;
        try {
            await wiz.handleSubmit(wiz.formSnapshot);
            clearDraft();
            message.success({ content: "图书录入成功！", key: "add-success" });
        } catch (err) {
            message.error({ content: `录入失败: ${err instanceof Error ? err.message : "未知错误"}`, key: "add-error" });
        }
    }, [wiz, clearDraft, message]);

    const stepContent = () => {
        switch (wiz.currentStep) {
            case 0:
                return (
                    <Card style={{ borderRadius: 12 }}>
                        <BookFormFields
                            shelfOptions={wiz.shelfOptions}
                            shelfLoading={wiz.shelfLoading}
                            onValuesChange={saveDraft}
                        />
                        <div style={{ textAlign: "right", marginTop: 24, borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 16 }}>
                            <Space>
                                <Button icon={<ClearOutlined />} onClick={() => { form.resetFields(); clearDraft(); }}>
                                    清空
                                </Button>
                                <Button type="primary" icon={<EyeOutlined />} onClick={handlePreview} size="large">
                                    预览信息
                                </Button>
                            </Space>
                        </div>
                    </Card>
                );
            case 1:
                return wiz.formSnapshot ? (
                    <BookAddPreview
                        data={wiz.formSnapshot}
                        isSubmitting={wiz.isSubmitting}
                        onEdit={wiz.goToEdit}
                        onSubmit={handleSubmit}
                    />
                ) : null;
            case 2:
                return (
                    <BookAddComplete
                        success={wiz.createdResult?.success ?? false}
                        bookId={wiz.createdResult?.data?.book_id}
                        onReset={wiz.resetSteps}
                        onGoHome={() => navigate("/")}
                        onEdit={() => wiz.createdResult?.data?.book_id && navigate(`/books/${wiz.createdResult.data.book_id}/edit`)}
                    />
                );
        }
    };

    return (
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
            <Breadcrumb
                style={{ marginBottom: 16 }}
                items={[
                    { title: <a onClick={() => navigate("/")}><HomeOutlined /> 首页</a> },
                    { title: <span><BookOutlined /> 手动录入</span> },
                ]}
            />

            <Title level={2} style={{ marginBottom: 24 }}>
                <PlusOutlined style={{ marginRight: 12, color: token.colorPrimary }} />
                手动录入图书
            </Title>

            <Card style={{ marginBottom: 24, borderRadius: 12 }}>
                <Steps current={wiz.currentStep} items={STEPS} size="small" />
            </Card>

            <Form form={form} layout="vertical" style={{ maxWidth: "100%" }}>
                {stepContent()}
            </Form>
        </div>
    );
};

export default BookManualAdd;
