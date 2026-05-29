// components/import/ImportErrorsModal.tsx
// 导入错误详情弹窗

import React, { type FC } from "react";
import { Modal, Table, Alert } from "antd";
import type { ImportTaskError } from "../../types";
import type { TableColumnsType } from "antd";

interface ImportErrorsModalProps {
    open: boolean;
    onClose: () => void;
    errors: ImportTaskError[];
}

const columns: TableColumnsType<ImportTaskError> = [
    { title: "#", dataIndex: "index", width: 50 },
    { title: "ISBN", dataIndex: "isbn", width: 140 },
    { title: "书名", dataIndex: "title", ellipsis: true },
    {
        title: "错误信息",
        dataIndex: "error",
        width: 200,
        render: (error: string) => (
            <span style={{ color: "#ff4d4f", fontSize: 12 }}>{error}</span>
        ),
    },
];

const ImportErrorsModal: FC<ImportErrorsModalProps> = ({ open, onClose, errors }) => (
    <Modal
        title="导入错误详情"
        open={open}
        onCancel={onClose}
        footer={null}
        width={700}
        style={{ maxWidth: "94vw" }}
        destroyOnHidden
    >
        <Alert
            title={`共 ${errors.length} 条错误`}
            type="warning"
            showIcon
            style={{ marginBottom: 16, borderRadius: 8 }}
        />
        <Table<ImportTaskError>
            dataSource={errors}
            columns={columns}
            rowKey={(r) => `${r.index}-${r.isbn}`}
            size="small"
            pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
            scroll={{ y: 400 }}
        />
    </Modal>
);

export default ImportErrorsModal;
