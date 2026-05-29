// hooks/useBatchImportWizard.ts
/**
 * 批量导入向导 Hook
 *
 * 管理四步流程（upload → preview → importing → complete）的全量状态与操作
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
    previewImport,
    startImport,
    getImportStatus,
    cancelImportTask,
    previewNedbImport,
    startNedbImport,
    downloadImportTemplate,
    listShelves,
    extractErrorMessage,
} from "../services/api";
import type { ImportPreview, ImportTask } from "../types";

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_RETRIES = 60;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const VALID_EXTENSIONS = ["csv", "xlsx", "xls", "txt", "db"];

export type StepType = "upload" | "preview" | "importing" | "complete";

export interface ShelfOption {
    value: number;
    label: string;
}

export interface WizardState {
    step: StepType;
    file: File | null;
    uploading: boolean;
    preview: ImportPreview | null;
    task: ImportTask | null;
    importing: boolean;
    shelfList: ShelfOption[];
    targetShelfId: number | null;
    autoSync: boolean;
    syncDelay: number;
    showResults: boolean;
    showErrors: boolean;
    uploadError: string | null;
    isNedb: boolean;
    pollRetries: number;
}

export interface WizardActions {
    setTargetShelfId: (id: number | null) => void;
    setAutoSync: (v: boolean) => void;
    setSyncDelay: (v: number) => void;
    setShowResults: (v: boolean) => void;
    setShowErrors: (v: boolean) => void;
    handleFileSelect: (f: File) => void;
    handlePreview: () => Promise<void>;
    handleStartImport: () => Promise<void>;
    handleCancel: () => Promise<void>;
    handleDownloadTemplate: () => Promise<void>;
    handleReset: () => void;
    handleGoHome: () => void;
}

interface MessageAPI {
    success: (msg: string) => void;
    error: (msg: string) => void;
    warning: (msg: string) => void;
}

export function useBatchImportWizard(
    navigate: (path: string) => void,
    messageApi?: MessageAPI
): WizardState & WizardActions {
    const isMounted = useRef(true);
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const previousShelfList = useRef(false);

    const [step, setStep] = useState<StepType>("upload");
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [task, setTask] = useState<ImportTask | null>(null);
    const [importing, setImporting] = useState(false);
    const [shelfList, setShelfList] = useState<ShelfOption[]>([]);
    const [targetShelfId, setTargetShelfId] = useState<number | null>(null);
    const [autoSync, setAutoSync] = useState(true);
    const [syncDelay, setSyncDelay] = useState(1);
    const [showResults, setShowResults] = useState(false);
    const [showErrors, setShowErrors] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [pollRetries, setPollRetries] = useState(0);

    const isNedb = file?.name?.toLowerCase().endsWith(".db") ?? false;
    const msg = messageApi;

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    useEffect(() => {
        if (previousShelfList.current) return;
        previousShelfList.current = true;
        listShelves()
            .then((shelves) => {
                if (isMounted.current) {
                    setShelfList(shelves.map((s) => ({ value: s.logical_shelf_id, label: s.shelf_name })));
                }
            })
            .catch(() => {});
    }, []);

    const startPolling = useCallback((taskId: string) => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);

        pollTimerRef.current = setInterval(async () => {
            if (!isMounted.current) {
                if (pollTimerRef.current) clearInterval(pollTimerRef.current);
                return;
            }
            try {
                const status = await getImportStatus(taskId);
                if (!isMounted.current) return;
                setTask(status);
                setPollRetries((prev) => {
                    const next = prev + 1;
                    if (status.status === "completed" || status.status === "failed" || status.status === "cancelled") {
                        if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
                        setImporting(false);
                        setStep("complete");
                    } else if (next >= MAX_POLL_RETRIES) {
                        if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
                        setImporting(false);
                        setStep("complete");
                    }
                    return next;
                });
            } catch {
                // non-fatal
            }
        }, POLL_INTERVAL_MS);
    }, []);

    useEffect(() => {
        return () => {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        };
    }, []);

    const handleFileSelect = useCallback((f: File) => {
        setFile(f);
        setUploadError(null);
        setPreview(null);
        setTask(null);
        setStep("upload");
    }, []);

    const handlePreview = useCallback(async () => {
        if (!file) return;
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!ext || !VALID_EXTENSIONS.includes(ext)) {
            setUploadError(`不支持的文件格式: .${ext}，支持: ${VALID_EXTENSIONS.join(", ")}`);
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            setUploadError(`文件过大 (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
            return;
        }
        setUploading(true);
        setUploadError(null);
        try {
            const result = isNedb ? await previewNedbImport(file) : await previewImport(file);
            if (isMounted.current) { setPreview(result); setStep("preview"); }
        } catch (err) {
            if (isMounted.current) setUploadError(extractErrorMessage(err));
        } finally {
            if (isMounted.current) setUploading(false);
        }
    }, [file, isNedb]);

    const handleStartImport = useCallback(async () => {
        if (!preview || !file) return;
        setImporting(true);
        setStep("importing");
        setPollRetries(0);
        try {
            const newTask = isNedb
                ? await startNedbImport(file.name, { target_shelf_id: targetShelfId, auto_sync: autoSync, sync_delay: syncDelay })
                : await startImport({ file_name: file.name, target_shelf_id: targetShelfId ?? undefined, auto_sync: autoSync, sync_delay: syncDelay });
            if (isMounted.current) { setTask(newTask); startPolling(newTask.task_id); }
        } catch {
            if (isMounted.current) { setImporting(false); setStep("preview"); }
        }
    }, [preview, file, isNedb, targetShelfId, autoSync, syncDelay, startPolling]);

    const handleCancel = useCallback(async () => {
        if (!task) return;
        try {
            await cancelImportTask(task.task_id);
            if (isMounted.current) { setImporting(false); setStep("preview"); }
        } catch { /* ignore */ }
    }, [task]);

    const handleDownloadTemplate = useCallback(async () => {
        try {
            const blob = await downloadImportTemplate();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "import_template.xlsx"; a.click();
            URL.revokeObjectURL(url);
            msg?.success("模板下载成功");
        } catch {
            msg?.error("模板下载失败");
        }
    }, [msg]);

    const handleReset = useCallback(() => {
        setStep("upload"); setFile(null); setPreview(null); setTask(null);
        setUploading(false); setImporting(false); setUploadError(null); setPollRetries(0);
        msg?.success("已重置，可以重新导入");
    }, [msg]);

    const handleGoHome = useCallback(() => navigate("/"), [navigate]);

    return {
        step, file, uploading, preview, task, importing, shelfList,
        targetShelfId, autoSync, syncDelay, showResults, showErrors,
        uploadError, isNedb, pollRetries,
        setTargetShelfId, setAutoSync, setSyncDelay, setShowResults, setShowErrors,
        handleFileSelect, handlePreview, handleStartImport, handleCancel,
        handleDownloadTemplate, handleReset, handleGoHome,
    };
}
