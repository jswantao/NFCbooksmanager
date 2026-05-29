// services/api/backupApi.ts
// 备份与恢复相关 API 函数

import apiClient, { unwrap } from "./client";
import type {
    BackupMetadata,
    ConflictCheckResult,
    RestorePreview,
    RestoreExecuteParams,
    RestoreResult,
    WebDAVConfig,
    WebDAVConfigSaveParams,
    AutoBackupStatus,
} from "../../types";

// ==================== 本地备份 ====================

export const createBackup = (): Promise<BackupMetadata> =>
    apiClient.post("/backup/create").then(unwrap);

export const listBackups = (): Promise<BackupMetadata[]> =>
    apiClient.get("/backup/list").then(unwrap);

export const deleteBackups = (filenames: string[]): Promise<void> =>
    apiClient.post("/backup/delete", { filenames }).then(unwrap);

// ==================== 恢复 ====================

export const previewBackup = (filename: string): Promise<RestorePreview> =>
    apiClient.get(`/backup/preview/${filename}`).then(unwrap);

export const checkConflicts = (filename: string): Promise<ConflictCheckResult> =>
    apiClient.get(`/backup/conflicts/${filename}`).then(unwrap);

export const executeRestore = (params: RestoreExecuteParams): Promise<RestoreResult> =>
    apiClient.post("/backup/restore", params).then(unwrap);

// ==================== WebDAV 云备份 ====================

export const getWebDAVConfig = (): Promise<WebDAVConfig> =>
    apiClient.get("/backup/webdav/config").then(unwrap);

export const saveWebDAVConfig = (params: WebDAVConfigSaveParams): Promise<void> =>
    apiClient.post("/backup/webdav/config", params).then(unwrap);

export const testWebDAVConnection = (): Promise<{ success: boolean; message: string }> =>
    apiClient.post("/backup/webdav/test").then(unwrap);

export const syncToWebDAV = (): Promise<{ success: boolean; message: string }> =>
    apiClient.post("/backup/webdav/sync").then(unwrap);

export const listWebDAVBackups = (): Promise<BackupMetadata[]> =>
    apiClient.get("/backup/webdav/list").then(unwrap);

export const pullFromWebDAV = (filename: string): Promise<{ success: boolean; message: string }> =>
    apiClient.post("/backup/webdav/pull", { filename }).then(unwrap);

// ==================== 自动备份 ====================

export const getAutoBackupStatus = (): Promise<AutoBackupStatus> =>
    apiClient.get("/backup/auto/status").then(unwrap);

export const triggerAutoBackup = (): Promise<{ success: boolean; message: string }> =>
    apiClient.post("/backup/auto/trigger").then(unwrap);
