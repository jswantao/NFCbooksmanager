// components/import/QuickTips.tsx
// 导入快捷技巧提示

import React, { type FC } from "react";
import { Card, Typography, Space } from "antd";
import { BulbOutlined } from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;

const QuickTips: FC = () => (
    <Card
        size="small"
        style={{ borderRadius: 12, background: "#fffbe6", border: "1px solid #ffe58f" }}
        styles={{ body: { padding: "12px 16px" } }}
    >
        <Space align="start">
            <BulbOutlined style={{ color: "#faad14", fontSize: 18, marginTop: 3 }} />
            <div>
                <Text strong style={{ color: "#ad6800" }}>导入提示</Text>
                <Paragraph style={{ margin: "4px 0 0", fontSize: 12, color: "#8c6900" }}>
                    请确保文件包含 ISBN、书名等关键列。CSV 文件建议使用 UTF-8 编码。
                    导入过程中请勿关闭页面，系统会自动去重和同步豆瓣数据。
                </Paragraph>
            </div>
        </Space>
    </Card>
);

export default QuickTips;
