// components/import/StatusTag.tsx
// 导入状态标签子组件

import React, { type FC } from "react";
import { Tag } from "antd";

interface StatusTagProps {
    status: string;
    synced?: boolean;
}

const StatusTag: FC<StatusTagProps> = React.memo(({ status, synced }) => {
    const statusMap: Record<string, { color: string; text: string }> = {
        success: { color: "success", text: synced ? "成功(已同步)" : "成功" },
        updated: { color: "processing", text: synced ? "已更新(已同步)" : "已更新" },
        merged: { color: "processing", text: "已合并" },
        kept: { color: "default", text: "保留" },
        failed: { color: "error", text: "失败" },
        skipped: { color: "warning", text: "跳过" },
        pending: { color: "processing", text: "待处理" },
    };
    const config = statusMap[status] || { color: "default" as const, text: status };
    return <Tag color={config.color} style={{ borderRadius: 10, margin: 0 }}>{config.text}</Tag>;
});
StatusTag.displayName = "StatusTag";

export default StatusTag;
