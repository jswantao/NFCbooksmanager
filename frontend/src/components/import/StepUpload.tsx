// components/import/StepUpload.tsx
// 上传步骤组件

import React, { type FC } from "react";
import {
    Card, Upload, Button, Space, Typography, Alert,
    Input, InputNumber, Select, Switch, Divider, Tooltip, type UploadProps,
} from "antd";
import {
    InboxOutlined, UploadOutlined, FileExcelOutlined, DownloadOutlined,
    BookOutlined, ThunderboltOutlined, InfoCircleOutlined,
} from "@ant-design/icons";
import type { ShelfOption } from "../../hooks/useBatchImportWizard";
import { formatFileSize } from "../../utils/format";

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const VALID_EXTENSIONS = [".csv", ".xlsx", ".xls", ".txt", ".db"];

interface StepUploadProps {
    file: File | null;
    uploading: boolean;
    uploadError: string | null;
    shelfList: ShelfOption[];
    targetShelfId: number | null;
    autoSync: boolean;
    syncDelay: number;
    isNedb: boolean;
    onFileSelect: (f: File) => void;
    onPreview: () => void;
    onDownloadTemplate: () => void;
    onShelfChange: (id: number | null) => void;
    onAutoSyncChange: (v: boolean) => void;
    onSyncDelayChange: (v: number) => void;
}

const uploadProps = (onFile: (f: File) => void): UploadProps => ({
    name: "file",
    multiple: false,
    maxCount: 1,
    accept: VALID_EXTENSIONS.join(","),
    beforeUpload: (file) => {
        onFile(file);
        return false;
    },
    onRemove: () => onFile(null as unknown as File),
    showUploadList: { showPreviewIcon: false },
});

const StepUpload: FC<StepUploadProps> = ({
    file, uploading, uploadError, shelfList, targetShelfId, autoSync, syncDelay,
    isNedb, onFileSelect, onPreview, onDownloadTemplate,
    onShelfChange, onAutoSyncChange, onSyncDelayChange,
}) => (
    <Card style={{ borderRadius: 12, marginBottom: 24 }}>
        <Title level={4} style={{ marginBottom: 20 }}>
            <UploadOutlined style={{ marginRight: 8 }} />
            选择文件
        </Title>

        {uploadError && (
            <Alert
                message={uploadError}
                type="error"
                showIcon
                closable
                style={{ marginBottom: 16, borderRadius: 8 }}
            />
        )}

        <Dragger {...uploadProps(onFileSelect)} style={{ marginBottom: 16 }}>
            <p className="ant-upload-drag-icon">
                <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域</p>
            <p className="ant-upload-hint">
                支持 CSV / Excel / TXT / NeDB (.db) 格式，最大 {formatFileSize(MAX_FILE_SIZE)}
            </p>
        </Dragger>

        {file && (
            <div style={{ marginBottom: 16 }}>
                <Space>
                    <FileExcelOutlined style={{ color: "#52c41a", fontSize: 18 }} />
                    <Text strong>{file.name}</Text>
                    <Text type="secondary">({formatFileSize(file.size)})</Text>
                </Space>
            </div>
        )}

        <Divider />

        <div style={{ marginBottom: 16 }}>
            <Title level={5} style={{ marginBottom: 12 }}>
                <BookOutlined style={{ marginRight: 6 }} />
                导入设置
            </Title>

            <div style={{ marginBottom: 12 }}>
                <Text style={{ display: "block", marginBottom: 4 }}>
                    目标书架
                    <Tooltip title="选择导入后图书存放的书架">
                        <InfoCircleOutlined style={{ marginLeft: 6, color: "#8c8c8c" }} />
                    </Tooltip>
                </Text>
                <Select
                    placeholder="默认书架（可跳过）"
                    allowClear
                    style={{ width: "100%", maxWidth: 400 }}
                    value={targetShelfId}
                    onChange={onShelfChange}
                    options={shelfList}
                />
            </div>

            <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 16 }}>
                <div>
                    <Text style={{ display: "block", marginBottom: 4 }}>自动同步豆瓣</Text>
                    <Switch checked={autoSync} onChange={onAutoSyncChange} />
                </div>
                {autoSync && (
                    <div>
                        <Text style={{ display: "block", marginBottom: 4 }}>同步延迟(秒)</Text>
                        <InputNumber
                            min={0.5}
                            max={10}
                            step={0.5}
                            value={syncDelay}
                            onChange={(v) => v != null && onSyncDelayChange(v)}
                            style={{ width: 120 }}
                        />
                    </div>
                )}
            </div>
        </div>

        <Space>
            <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={onPreview}
                loading={uploading}
                disabled={!file}
                size="large"
            >
                预览导入数据
            </Button>
            <Button icon={<DownloadOutlined />} onClick={onDownloadTemplate}>
                下载模板
            </Button>
        </Space>
    </Card>
);

export default StepUpload;
