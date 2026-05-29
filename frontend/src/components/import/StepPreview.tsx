// components/import/StepPreview.tsx
// 预览确认步骤组件

import React, { type FC } from "react";
import {
    Card, Table, Button, Space, Typography, Tag, Row, Col, Statistic,
    Alert, Descriptions, Tooltip,
} from "antd";
import {
    PlayCircleOutlined, ReloadOutlined, BookOutlined, FileTextOutlined,
    InfoCircleOutlined, ExclamationCircleOutlined,
} from "@ant-design/icons";
import type { ImportPreview } from "../../types";
import type { TableColumnsType } from "antd";

const { Title, Text } = Typography;

interface StepPreviewProps {
    preview: ImportPreview;
    isNedb: boolean;
    onStart: () => void;
    onReset: () => void;
}

const columns: TableColumnsType<Record<string, unknown>> = [
    { title: "#", dataIndex: "index", width: 50 },
    { title: "ISBN", dataIndex: "isbn", width: 130 },
    { title: "书名", dataIndex: "title", ellipsis: true },
    { title: "作者", dataIndex: "author", width: 120, ellipsis: true },
    { title: "出版社", dataIndex: "publisher", width: 120, ellipsis: true },
];

const StepPreview: FC<StepPreviewProps> = ({ preview, isNedb, onStart, onReset }) => (
    <Card style={{ borderRadius: 12, marginBottom: 24 }}>
        <Title level={4} style={{ marginBottom: 20 }}>
            <FileTextOutlined style={{ marginRight: 8 }} />
            预览确认
        </Title>

        {/* 统计信息 */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={6}>
                <Card size="small" style={{ textAlign: "center", borderRadius: 10, background: "#e6f7ff" }}>
                    <Statistic title="总行数" value={preview.total_rows ?? preview.total ?? 0} prefix={<BookOutlined />} styles={{ content: { fontSize: 22 } }} />
                </Card>
            </Col>
            <Col xs={12} sm={6}>
                <Card size="small" style={{ textAlign: "center", borderRadius: 10, background: "#f6ffed" }}>
                    <Statistic title="有效行" value={preview.valid_rows ?? preview.valid ?? 0} prefix={<FileTextOutlined />} styles={{ content: { fontSize: 22, color: "#52c41a" } }} />
                </Card>
            </Col>
            <Col xs={12} sm={6}>
                <Card size="small" style={{ textAlign: "center", borderRadius: 10, background: "#fff7e6" }}>
                    <Statistic title="需更新" value={preview.update_count ?? 0} prefix={<InfoCircleOutlined />} styles={{ content: { fontSize: 22, color: "#faad14" } }} />
                </Card>
            </Col>
            <Col xs={12} sm={6}>
                <Card size="small" style={{ textAlign: "center", borderRadius: 10, background: "#fff2f0" }}>
                    <Statistic title="有警告" value={preview.warning_count ?? 0} prefix={<ExclamationCircleOutlined />} styles={{ content: { fontSize: 22, color: "#ff4d4f" } }} />
                </Card>
            </Col>
        </Row>

        {preview.warnings && preview.warnings.length > 0 && (
            <Alert
                type="warning"
                showIcon
                message="数据警告"
                description={preview.warnings.slice(0, 3).join("；")}
                style={{ marginBottom: 16, borderRadius: 8 }}
            />
        )}

        {isNedb && (
            <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="数据来源">NeDB 数据库</Descriptions.Item>
                <Descriptions.Item label="封面图片">{preview.image_count ?? 0} 张</Descriptions.Item>
            </Descriptions>
        )}

        <Title level={5} style={{ marginBottom: 12 }}>
            数据预览 (前 20 行)
        </Title>
        <Table
            dataSource={(preview.rows ?? []).slice(0, 20)}
            columns={columns}
            rowKey="index"
            size="small"
            pagination={false}
            scroll={{ y: 300 }}
            style={{ marginBottom: 24 }}
        />

        <Space>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={onStart} size="large">
                开始导入
            </Button>
            <Button icon={<ReloadOutlined />} onClick={onReset}>重新选择</Button>
        </Space>
    </Card>
);

export default StepPreview;
