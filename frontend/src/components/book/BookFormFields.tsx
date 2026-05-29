// components/book/BookFormFields.tsx
// 图书录入表单字段组件

import React, { type FC } from "react";
import {
    Form, Input, Row, Col, Select, InputNumber, Tag, Tooltip, theme, Divider, Collapse,
} from "antd";
import {
    BookOutlined, UserOutlined, NumberOutlined, CalendarOutlined, FileTextOutlined,
    DollarOutlined, TranslationOutlined, TagsOutlined, LinkOutlined, StarOutlined,
    BarcodeOutlined, EnvironmentOutlined, InfoCircleOutlined, QuestionCircleOutlined,
} from "@ant-design/icons";
import UnifiedCover from "../UnifiedCover";
import type { ShelfOption } from "../../hooks/useBookAddWizard";

const { TextArea } = Input;

const BINDING_OPTIONS = [
    { value: "平装", label: "📖 平装" },
    { value: "精装", label: "📚 精装" },
    { value: "线装", label: "🧵 线装" },
    { value: "骑马钉", label: "📎 骑马钉" },
    { value: "软精装", label: "📕 软精装" },
    { value: "无线胶装", label: "📒 无线胶装" },
    { value: "其他", label: "📔 其他" },
];

const RequiredTag: FC = () => <Tag color="error" style={{ marginLeft: 4, fontSize: 11 }}>必填</Tag>;
const OptionalTag: FC = () => <Tag style={{ marginLeft: 4, fontSize: 11 }}>可选</Tag>;

interface BookFormFieldsProps {
    shelfOptions: ShelfOption[];
    shelfLoading: boolean;
    onValuesChange?: () => void;
}

const BookFormFields: FC<BookFormFieldsProps> = ({ shelfOptions, shelfLoading, onValuesChange }) => {
    const { token } = theme.useToken();
    const coverUrl = Form.useWatch("cover_url");

    return (
        <Row gutter={[16, 0]} onBlur={onValuesChange}>
            {/* 左侧：表单字段 */}
            <Col xs={24} md={16}>
                <Collapse
                    defaultActiveKey={["basic", "detail", "extra"]}
                    style={{ background: "transparent" }}
                    items={[
                        {
                            key: "basic",
                            label: <span><BookOutlined style={{ marginRight: 6 }} />基本信息</span>,
                            children: (
                                <>
                                    <Form.Item name="isbn" label={<span>ISBN <RequiredTag /></span>}
                                        rules={[{ required: true, message: "请输入 ISBN" },
                                            { pattern: /^(?:\d{9}[\dXx]|\d{13})$/, message: "ISBN 格式不正确" }]}
                                        tooltip="10位或13位数字">
                                        <Input prefix={<BarcodeOutlined />} placeholder="如 9787544291163" maxLength={13}
                                            onChange={(e) => { const v = e.target.value.replace(/[-\s]/g, ""); e.target.value = v; }}
                                            style={{ fontFamily: "monospace" }} />
                                    </Form.Item>
                                    <Form.Item name="title" label={<span>书名 <RequiredTag /></span>}
                                        rules={[{ required: true, message: "请输入书名" }, { max: 200 }]}>
                                        <Input prefix={<BookOutlined />} placeholder="请输入书名" maxLength={200} />
                                    </Form.Item>
                                    <Form.Item name="author" label={<span>作者</span>}>
                                        <Input prefix={<UserOutlined />} placeholder="请输入作者" />
                                    </Form.Item>
                                    <Form.Item name="translator" label={<span>译者 <OptionalTag /></span>}>
                                        <Input prefix={<TranslationOutlined />} placeholder="请输入译者" />
                                    </Form.Item>
                                    <Form.Item name="publisher" label="出版社">
                                        <Input prefix={<EnvironmentOutlined />} placeholder="请输入出版社" />
                                    </Form.Item>
                                    <Form.Item name="publish_date" label="出版日期">
                                        <Input prefix={<CalendarOutlined />} placeholder="如 2024-01" />
                                    </Form.Item>
                                </>
                            ),
                        },
                        {
                            key: "detail",
                            label: <span><InfoCircleOutlined style={{ marginRight: 6 }} />详细信息</span>,
                            children: (
                                <Row gutter={16}>
                                    <Col xs={24} sm={12}>
                                        <Form.Item name="pages" label="页数">
                                            <InputNumber prefix={<FileTextOutlined />} placeholder="页数" min={1} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} sm={12}>
                                        <Form.Item name="binding" label="装帧" initialValue="平装">
                                            <Select options={BINDING_OPTIONS} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} sm={12}>
                                        <Form.Item name="price" label="定价">
                                            <Input prefix={<DollarOutlined />} placeholder="如 68.00" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} sm={12}>
                                        <Form.Item name="rating" label="评分"
                                            rules={[{ pattern: /^(?:10(?:\.0)?|[0-9](?:\.[0-9])?)$/, message: "评分范围 0-10" }]}>
                                            <Input prefix={<StarOutlined />} placeholder="0-10" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24}>
                                        <Form.Item name="summary" label="内容简介 <OptionalTag />">
                                            <TextArea rows={4} placeholder="请输入内容简介" maxLength={2000} showCount />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            ),
                        },
                        {
                            key: "extra",
                            label: <span><TagsOutlined style={{ marginRight: 6 }} />附加信息 <OptionalTag /></span>,
                            children: (
                                <Row gutter={16}>
                                    <Col xs={24} sm={12}>
                                        <Form.Item name="original_title" label="原版书名">
                                            <Input prefix={<TranslationOutlined />} placeholder="原版书名" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} sm={12}>
                                        <Form.Item name="series" label="丛书系列">
                                            <Input prefix={<TagsOutlined />} placeholder="所属丛书" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24}>
                                        <Form.Item name="douban_url" label="豆瓣链接"
                                            rules={[{ type: "url", message: "请输入有效 URL", warningOnly: true }]}>
                                            <Input prefix={<LinkOutlined />} placeholder="https://book.douban.com/subject/..." />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24}>
                                        <Form.Item name="shelf_id" label="所属书架">
                                            <Select
                                                placeholder="选择书架（可选）"
                                                allowClear
                                                loading={shelfLoading}
                                                options={shelfOptions.map((s) => ({
                                                    value: s.value,
                                                    label: `${s.label} (${s.count}本)`,
                                                }))}
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            ),
                        },
                    ]}
                />
            </Col>

            {/* 右侧：封面预览 */}
            <Col xs={24} md={8}>
                <div style={{ position: "sticky", top: 80 }}>
                    <Form.Item name="cover_url" label={<span>封面图片 URL <OptionalTag /></span>}
                        tooltip="支持豆瓣图片直链或任何图片 URL">
                        <Input prefix={<LinkOutlined />} placeholder="https://img9.doubanio.com/..." />
                    </Form.Item>
                    <div style={{ marginTop: 8, textAlign: "center" }}>
                        <UnifiedCover
                            src={coverUrl}
                            alt="封面预览"
                            style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}
                            fallback={<div style={{ width: "100%", height: 200, background: "#f5f5f5", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb" }}>暂无封面</div>}
                        />
                    </div>
                </div>
            </Col>
        </Row>
    );
};

export default BookFormFields;
export { RequiredTag, OptionalTag, BINDING_OPTIONS };
