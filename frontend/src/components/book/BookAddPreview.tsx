// components/book/BookAddPreview.tsx
// 图书录入预览确认步骤

import React, { type FC } from "react";
import { Card, Descriptions, Button, Space, Typography, Tag, Divider, theme } from "antd";
import { EditOutlined, SaveOutlined, CheckCircleOutlined } from "@ant-design/icons";
import UnifiedCover from "../UnifiedCover";
import type { BookFormData } from "../../hooks/useBookAddWizard";
import { BINDING_OPTIONS } from "./BookFormFields";

const { Title, Text } = Typography;

interface BookAddPreviewProps {
    data: BookFormData;
    isSubmitting: boolean;
    onEdit: () => void;
    onSubmit: () => void;
}

const BookAddPreview: FC<BookAddPreviewProps> = ({ data, isSubmitting, onEdit, onSubmit }) => {
    const { token } = theme.useToken();
    const bindingLabel = BINDING_OPTIONS.find((o) => o.value === data.binding)?.label ?? data.binding;

    return (
        <div>
            <Card style={{ borderRadius: 12, marginBottom: 24 }}>
                <Title level={4} style={{ marginBottom: 20 }}>
                    <CheckCircleOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
                    确认信息
                </Title>

                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 280 }}>
                        <Descriptions bordered size="small" column={1}>
                            <Descriptions.Item label="ISBN"><Text code>{data.isbn}</Text></Descriptions.Item>
                            <Descriptions.Item label="书名"><Text strong>{data.title}</Text></Descriptions.Item>
                            {data.author && <Descriptions.Item label="作者">{data.author}</Descriptions.Item>}
                            {data.translator && <Descriptions.Item label="译者">{data.translator}</Descriptions.Item>}
                            {data.publisher && <Descriptions.Item label="出版社">{data.publisher}</Descriptions.Item>}
                            {data.publish_date && <Descriptions.Item label="出版日期">{data.publish_date}</Descriptions.Item>}
                            {data.pages != null && <Descriptions.Item label="页数">{data.pages}</Descriptions.Item>}
                            {bindingLabel && <Descriptions.Item label="装帧">{bindingLabel}</Descriptions.Item>}
                            {data.price && <Descriptions.Item label="定价">¥{data.price}</Descriptions.Item>}
                            {data.rating && <Descriptions.Item label="评分">{data.rating} / 10</Descriptions.Item>}
                            {data.original_title && <Descriptions.Item label="原版书名">{data.original_title}</Descriptions.Item>}
                            {data.series && <Descriptions.Item label="丛书">{data.series}</Descriptions.Item>}
                            {data.douban_url && (
                                <Descriptions.Item label="豆瓣">
                                    <a href={data.douban_url} target="_blank" rel="noreferrer">查看</a>
                                </Descriptions.Item>
                            )}
                        </Descriptions>
                    </div>

                    <div style={{ flexShrink: 0, textAlign: "center" }}>
                        <UnifiedCover src={data.cover_url} alt={data.title}
                            style={{ width: 160, borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
                            fallback={<div style={{ width: 160, height: 220, background: "#f5f5f5", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb" }}>暂无封面</div>}
                        />
                    </div>
                </div>

                {data.summary && (
                    <>
                        <Divider />
                        <Text type="secondary">内容简介</Text>
                        <Paragraph style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{data.summary}</Paragraph>
                    </>
                )}
            </Card>

            <Space>
                <Button icon={<EditOutlined />} onClick={onEdit} size="large">返回修改</Button>
                <Button type="primary" icon={<SaveOutlined />} onClick={onSubmit} loading={isSubmitting} size="large">
                    确认录入
                </Button>
            </Space>
        </div>
    );
};

const { Paragraph } = Typography;
export default BookAddPreview;
