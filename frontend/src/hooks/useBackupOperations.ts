// frontend/src/hooks/useBackupOperations.ts
/**
 * useBackupOperations - 备份操作的业务逻辑 Hook
 *
 * 封装所有备份管理操作：创建、删除、同步、下载、恢复、WebDAV 配置、自动备份触发。
 * 替代 BackupManager 组件中内联的 8 个 handle* 函数。
 */

import { useState, useCallback } from 'react';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
    createBackup, deleteBackups,
    syncToWebDAV, pullFromWebDAV,
    saveWebDAVConfig, testWebDAVConnection,
    triggerAutoBackup,
} from '../services/api';

export function useBackupOperations(onSuccess: () => void) {
    const navigate = useNavigate();
    const [exporting, setExporting] = useState(false);
    const [syncingFiles, setSyncingFiles] = useState<Set<string>>(new Set());
    const [pullingFiles, setPullingFiles] = useState<Set<string>>(new Set());
    const [webdavTesting, setWebdavTesting] = useState(false);
    const [webdavSaving, setWebdavSaving] = useState(false);
    const [autoRunning, setAutoRunning] = useState(false);

    const handleExport = useCallback(async () => {
        setExporting(true);
        try {
            const res = await createBackup();
            message.success(`备份已创建: ${res.data?.filename ?? '成功'}`);
            onSuccess();
        } catch (e: any) {
            message.error(e?.message || '备份创建失败');
        } finally {
            setExporting(false);
        }
    }, [onSuccess]);

    const handleDelete = useCallback(async (filenames: string[]) => {
        try {
            const res = await deleteBackups(filenames);
            message.success(res.message || `已删除 ${filenames.length} 个文件`);
            onSuccess();
        } catch (e: any) {
            message.error(e?.message || '删除失败');
        }
    }, [onSuccess]);

    const handleSync = useCallback(async (filename: string) => {
        setSyncingFiles(prev => new Set(prev).add(filename));
        try {
            await syncToWebDAV(filename);
            message.success(`已同步 ${filename} 到云端`);
            onSuccess();
        } catch (e: any) {
            message.error(e?.message || '同步失败');
        } finally {
            setSyncingFiles(prev => { const n = new Set(prev); n.delete(filename); return n; });
        }
    }, [onSuccess]);

    const handlePull = useCallback(async (filename: string) => {
        setPullingFiles(prev => new Set(prev).add(filename));
        try {
            await pullFromWebDAV(filename);
            message.success(`已从云端下载 ${filename}`);
            onSuccess();
        } catch (e: any) {
            message.error(e?.message || '下载失败');
        } finally {
            setPullingFiles(prev => { const n = new Set(prev); n.delete(filename); return n; });
        }
    }, [onSuccess]);

    const handleRestore = useCallback((filename: string) => {
        navigate(`/admin/backup/restore/${encodeURIComponent(filename)}`);
    }, [navigate]);

    const handleWebdavTest = useCallback(async () => {
        setWebdavTesting(true);
        try {
            const res = await testWebDAVConnection();
            if (res.success) {
                message.success(res.data?.message || '连接成功');
            } else {
                message.warning(res.data?.message || '连接失败');
            }
        } catch (e: any) {
            message.error(e?.message || '测试失败');
        } finally {
            setWebdavTesting(false);
        }
    }, []);

    const handleWebdavSave = useCallback(async (values: any) => {
        setWebdavSaving(true);
        try {
            await saveWebDAVConfig(values);
            message.success('WebDAV 配置已保存');
            onSuccess();
        } catch (e: any) {
            message.error(e?.message || '保存失败');
        } finally {
            setWebdavSaving(false);
        }
    }, [onSuccess]);

    const handleAutoRun = useCallback(async () => {
        setAutoRunning(true);
        try {
            const res = await triggerAutoBackup();
            message.success(res.message || '自动备份已执行');
            onSuccess();
        } catch (e: any) {
            message.error(e?.message || '备份失败');
        } finally {
            setAutoRunning(false);
        }
    }, [onSuccess]);

    return {
        exporting, syncingFiles, pullingFiles,
        webdavTesting, webdavSaving, autoRunning,
        handleExport, handleDelete, handleSync, handlePull,
        handleRestore, handleWebdavTest, handleWebdavSave, handleAutoRun,
    };
}
