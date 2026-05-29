// components/import/StepComplete.tsx
// 导入完成步骤组件

import React, { type FC } from "react";
import { Card, Button, Space, Typography, Result, Row, Col, Statistic, Descriptions } from "antd";
import {
    CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined,
    HomeOutlined, EyeOutlined, ExclamationCircleOutlined, BookOutlined,
} from "@ant-design/icons";
import StatCard from "./StatCard";
import type { ImportTask } from "../../types";

const { Title, Text } = Typography;

interface StepCompleteProps {
    task: ImportTask;
    onShowResults: () => void;
    onShowErrors: () => void;
    onReset: () => void;
    onGoHome: () => void;
}

const StepComplete: FC<StepCompleteProps> = ({
    task, onShowResults, onShowErrors, onReset, onGoHome,
}) => {
    const isSuccess = task.status === "completed";
    const successRate = task.total > 0 ? ((task.success / task.total) * 100).toFixed(1) : "0";

    return (
        <>
            <Card style={{ borderRadius: 12, border: "1px solid #e8e8e8", marginBottom: 24 }}>
                <Result
                    status={isSuccess ? "success" : task.status === "cancelled" ? "warning" : "error"}
                    title={isSuccess ? "导入完成！" : task.status === "cancelled" ? "导入已取消" : "导入异常"}
                    subTitle={
                        isSuccess
                            ? `成功导入 ${task.success} 本图书，成功率 ${successRate}%`
                            : `共处理 ${task.completed} 条，成功 ${task.success} 条，失败 ${task.failed} 条`
                    }
                    extra={
                        <Space>
                            {task.results && task.results.length > 0 && (
                                <Button icon={<EyeOutlined />} onClick={onShowResults}>查看详情</Button>
                            )}
                            {task.errors && task.errors.length > 0 && (
                                <Button icon={<ExclamationCircleOutlined />} onClick={onShowErrors}>
                                    查看错误 ({task.errors.length})
                                </Button>
                            )}
                            <Button type="primary" icon={<ReloadOutlined />} onClick={onReset}>重新导入</Button>
                            <Button icon={<HomeOutlined />} onClick={onGoHome}>返回首页</Button>
                        </Space>
                    }
                />
            </Card>

            {/* 统计概览 */}
            <Card size="small" style={{ borderRadius: 10, marginBottom: 24 }}>
                <Row gutter={[16, 16]}>
                    <Col xs={12} sm={4}>
                        <Statistic title="总处理" value={task.total} prefix={<BookOutlined />} />
                    </Col>
                    <Col xs={12} sm={4}>
                        <Statistic title="成功" value={task.success ?? 0} valueStyle={{ color: "#52c41a" }} prefix={<CheckCircleOutlined />} />
                    </Col>
                    <Col xs={12} sm={4}>
                        <Statistic title="已更新" value={(task as Record<string, number>).updated ?? 0} valueStyle={{ color: "#1890ff" }} />
                    </Col>
                    <Col xs={12} sm={4}>
                        <Statistic title="跳过" value={task.skipped ?? 0} valueStyle={{ color: "#faad14" }} />
                    </Col>
                    <Col xs={12} sm={4}>
                        <Statistic title="失败" value={task.failed ?? 0} valueStyle={{ color: task.failed > 0 ? "#ff4d4f" : undefined }} />
                    </Col>
                    <Col xs={12} sm={4}>
                        <Statistic title="已同步" value={task.synced ?? 0} valueStyle={{ color: "#52c41a" }} />
                    </Col>
                </Row>
            </Card>

            {/* 耗时信息 */}
            {task.started_at && task.finished_at && (
                <Descriptions size="small" bordered style={{ borderRadius: 8, marginBottom: 24 }}>
                    <Descriptions.Item label="开始时间">{task.started_at}</Descriptions.Item>
                    <Descriptions.Item label="结束时间">{task.finished_at}</Descriptions.Item>
                </Descriptions>
            )}
        </>
    );
};

export default StepComplete;
