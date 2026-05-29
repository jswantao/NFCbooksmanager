// components/book/BookAddComplete.tsx
// 图书录入完成步骤

import React, { type FC } from "react";
import { Card, Result, Button, Space } from "antd";
import { CheckCircleOutlined, ReloadOutlined, HomeOutlined, EditOutlined } from "@ant-design/icons";

interface BookAddCompleteProps {
    success: boolean;
    bookId?: number;
    onReset: () => void;
    onGoHome: () => void;
    onEdit?: () => void;
}

const BookAddComplete: FC<BookAddCompleteProps> = ({ success, bookId, onReset, onGoHome, onEdit }) => (
    <Card style={{ borderRadius: 12 }}>
        <Result
            status={success ? "success" : "error"}
            title={success ? "录入成功！" : "录入失败"}
            subTitle={
                success
                    ? `图书已成功添加到书架，编号 #${bookId ?? "?"}`
                    : "请检查网络连接后重试，或联系管理员"
            }
            extra={
                <Space>
                    {success && onEdit && (
                        <Button type="primary" icon={<EditOutlined />} onClick={onEdit}>
                            继续完善信息
                        </Button>
                    )}
                    <Button icon={<ReloadOutlined />} onClick={onReset}>
                        {success ? "继续录入" : "重试"}
                    </Button>
                    <Button icon={<HomeOutlined />} onClick={onGoHome}>
                        返回首页
                    </Button>
                </Space>
            }
        />
    </Card>
);

export default BookAddComplete;
