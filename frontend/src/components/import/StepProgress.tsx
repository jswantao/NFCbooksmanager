// components/import/StepProgress.tsx
// 导入进行中步骤组件

import React, { type FC } from "react";
import { Card, Progress, Button, Space, Typography, Row, Col, Statistic, Alert } from "antd";
import {
    SyncOutlined, StopOutlined, CheckCircleOutlined, CloseCircleOutlined,
    LoadingOutlined,
} from "@ant-design/icons";
import type { ImportTask } from "../../types";

const { Title, Text } = Typography;

interface StepProgressProps {
    task: ImportTask;
    onCancel: () => void;
}

const StepProgress: FC<StepProgressProps> = ({ task, onCancel }) => {
    const progress = task.progress ?? (task.total > 0 ? Math.round((task.completed / task.total) * 100) : 0);
    const isFinished = ["completed", "failed", "cancelled"].includes(task.status);

    const statusColor = task.status === "failed" ? "#ff4d4f"
        : task.status === "cancelled" ? "#faad14"
        : "#52c41a";

    return (
        <Card style={{ borderRadius: 12, marginBottom: 24 }}>
            <Title level={4} style={{ marginBottom: 20 }}>
                {isFinished ? <CheckCircleOutlined style={{ marginRight: 8, color: statusColor }} />
                    : <SyncOutlined spin style={{ marginRight: 8 }} />}
                {isFinished ? "导入完成" : "正在导入..."}
            </Title>

            <div style={{ textAlign: "center", marginBottom: 24 }}>
                <Progress
                    type="circle"
                    percent={progress}
                    status={task.status === "failed" ? "exception"
                        : task.status === "completed" ? "success"
                        : "active"}
                    size={140}
                />
                <div style={{ marginTop: 12 }}>
                    <Text type="secondary">
                        {task.completed ?? 0} / {task.total ?? 0} 条已处理
                    </Text>
                </div>
            </div>

            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={12} sm={6}>
                    <Statistic title="成功" value={task.success ?? 0} valueStyle={{ color: "#52c41a" }} prefix={<CheckCircleOutlined />} />
                </Col>
                <Col xs={12} sm={6}>
                    <Statistic title="失败" value={task.failed ?? 0} valueStyle={{ color: "#ff4d4f" }} prefix={<CloseCircleOutlined />} />
                </Col>
                <Col xs={12} sm={6}>
                    <Statistic title="跳过" value={task.skipped ?? 0} valueStyle={{ color: "#faad14" }} />
                </Col>
                <Col xs={12} sm={6}>
                    <Statistic title="已同步" value={task.synced ?? 0} valueStyle={{ color: "#1890ff" }} prefix={<LoadingOutlined />} />
                </Col>
            </Row>

            {task.error && (
                <Alert
                    type="error"
                    message="导入错误"
                    description={task.error}
                    showIcon
                    style={{ marginBottom: 16, borderRadius: 8 }}
                />
            )}

            {!isFinished && (
                <Space>
                    <Button danger icon={<StopOutlined />} onClick={onCancel}>取消导入</Button>
                </Space>
            )}
        </Card>
    );
};

export default StepProgress;
