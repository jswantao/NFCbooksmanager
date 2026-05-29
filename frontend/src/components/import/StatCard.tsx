// components/import/StatCard.tsx
// 导入统计卡片子组件

import React, { type FC } from "react";
import { Card, Col, Statistic, Typography } from "antd";

const { Text } = Typography;

interface StatCardProps {
    title: string;
    value: number;
    color?: string;
    icon?: React.ReactNode;
    suffix?: string;
}

const StatCard: FC<StatCardProps> = ({ title, value, color, icon, suffix }) => (
    <Col xs={12} sm={6}>
        <Card
            size="small"
            style={{
                textAlign: "center",
                borderRadius: 10,
                border: color ? `1px solid ${color}30` : undefined,
                background: color ? `${color}08` : undefined,
            }}
        >
            <Statistic
                title={title}
                value={value}
                prefix={icon}
                suffix={suffix ? <Text style={{ fontSize: 12 }}>{suffix}</Text> : undefined}
                styles={{ content: { color: color || undefined, fontSize: 24 } }}
            />
        </Card>
    </Col>
);

export default StatCard;
