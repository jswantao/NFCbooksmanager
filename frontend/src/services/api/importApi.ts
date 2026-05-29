// services/api/importApi.ts
// 批量导入相关 API 函数

import apiClient, { unwrap } from "./client";
import type {
    ImportPreview,
    ImportTask,
    ImportStartParams,
    NedbImportPreview,
} from "../../types";

// ==================== Excel/CSV 导入 ====================

export const previewImport = (file: File): Promise<ImportPreview> => {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient.post("/import/preview", formData, {
        headers: { "Content-Type": "multipart/form-data" },
    }).then(unwrap);
};

export const startImport = (params: ImportStartParams): Promise<ImportTask> =>
    apiClient.post("/import/start", params).then(unwrap);

export const getImportStatus = (taskId: string): Promise<ImportTask> =>
    apiClient.get(`/import/status/${taskId}`).then(unwrap);

export const cancelImportTask = (taskId: string): Promise<void> =>
    apiClient.post(`/import/cancel/${taskId}`).then(unwrap);

export const downloadImportTemplate = (): Promise<Blob> =>
    apiClient.get("/import/template", { responseType: "blob" }).then((res) => res.data);

// ==================== NeDB 导入 ====================

export const previewNedbImport = (file: File): Promise<NedbImportPreview> => {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient.post("/import/nedb/preview", formData, {
        headers: { "Content-Type": "multipart/form-data" },
    }).then(unwrap);
};

export const startNedbImport = (fileName: string, options?: Record<string, unknown>): Promise<ImportTask> =>
    apiClient.post("/import/nedb/start", { file_name: fileName, ...options }).then(unwrap);
