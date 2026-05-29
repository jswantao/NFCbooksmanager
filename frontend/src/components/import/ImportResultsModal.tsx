// components/import/ImportResultsModal.tsx
// 导入结果详情弹窗

import React, { type FC } from "react";
import { Modal, Table, Tag } from "antd";
import StatusTag from "./StatusTag";
import type { ImportTaskResult } from "../../types";
import type { TableColumnsType } from "antd";

interface ImportResultsModalProps {
    open: boolean;
    onClose: () => void;
    results: ImportTaskResult[];
}

const columns: TableColumnsType<ImportTaskResult> = [
    { title: "#", dataIndex: "index", width: 50 },
    { title: "ISBN", dataIndex: "isbn", width: 140 },
    { title: "书名", dataIndex: "title", ellipsis: true },
    {
        title: "状态",
        dataIndex: "status",
        width: 140,
        render: (status: string, record: ImportTaskResult) => (
            <StatusTag status={status} synced={record.synced} />
        ),
    },
];

const ImportResultsModal: FC<ImportResultsModalProps> = ({ open, onClose, results }) => (
    <Modal
        title="导入详细结果"
        open={open}
        onCancel={onClose}
        footer={null}
        width={900}
        style={{ maxWidth: "96vw" }}
        destroyOnHidden
    >
        <Table<ImportTaskResult>
            dataSource={results}
            columns={columns}
            rowKey={(r) => `${r.index}-${r.isbn}`}
            size="small"
            pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
            scroll={{ y: 400 }}
        />
    </Modal>
);

export default ImportResultsModal;
