// frontend/src/hooks/useRestoreWizard.ts
/**
 * useRestoreWizard - 恢复向导的业务逻辑 Hook
 *
 * 封装恢复向导的完整状态机：
 * Step 0: 备份预览
 * Step 1: 冲突检测 + 冲突解决策略选择
 * Step 2: 恢复结果展示
 *
 * 替代 BackupRestore 组件中内联的所有状态和事件处理逻辑。
 */

import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import {
    previewBackup, checkConflicts, executeRestore,
} from '../services/api';
import type {
    RestorePreview, ConflictCheckResult, RestoreResult, ConflictResolution,
} from '../types';

export function useRestoreWizard(filename: string | undefined) {
    const [step, setStep] = useState(0);
    const [preview, setPreview] = useState<RestorePreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [conflicts, setConflicts] = useState<ConflictCheckResult | null>(null);
    const [conflictsLoading, setConflictsLoading] = useState(false);
    const [resolutions, setResolutions] = useState<Record<string, string>>({});
    const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
    const [restoring, setRestoring] = useState(false);
    const [dryRunning, setDryRunning] = useState(false);

    // Step 0: 自动加载备份预览
    useEffect(() => {
        if (!filename) return;
        setPreviewLoading(true);
        previewBackup(filename)
            .then(setPreview)
            .catch(e => message.error(e?.message || '加载备份预览失败'))
            .finally(() => setPreviewLoading(false));
    }, [filename]);

    // Step 1: 检测冲突
    const handleCheckConflicts = useCallback(async () => {
        if (!filename) return;
        setConflictsLoading(true);
        try {
            const res = await checkConflicts(filename);
            setConflicts(res.data ?? null);
            setStep(1);
        } catch (e: any) {
            message.error(e?.message || '冲突检测失败');
        } finally {
            setConflictsLoading(false);
        }
    }, [filename]);

    const handleResolutionChange = useCallback((key: string, action: string) => {
        setResolutions(prev => ({ ...prev, [key]: action }));
    }, []);

    const buildConflictKey = useCallback((c: ConflictCheckResult['conflicts'][0]) =>
        `${c.table}|${c.pk_column}|${c.pk_value}`, []);

    const buildResolutions = useCallback((): ConflictResolution[] => {
        return (conflicts?.conflicts ?? []).map(c => ({
            table: c.table,
            pk_column: c.pk_column,
            pk_value: c.pk_value,
            action: (resolutions[buildConflictKey(c)] || 'skip') as ConflictResolution['action'],
        }));
    }, [conflicts, resolutions, buildConflictKey]);

    // Dry run
    const handleDryRun = useCallback(async () => {
        if (!filename) return;
        setDryRunning(true);
        try {
            const res = await executeRestore({
                filename,
                resolutions: buildResolutions(),
                dry_run: true,
            });
            setRestoreResult(res.data ?? null);
            setStep(2);
        } catch (e: any) {
            message.error(e?.message || '预览恢复失败');
        } finally {
            setDryRunning(false);
        }
    }, [filename, buildResolutions]);

    // 正式恢复
    const handleExecuteRestore = useCallback(async () => {
        if (!filename) return;
        setRestoring(true);
        try {
            const res = await executeRestore({
                filename,
                resolutions: buildResolutions(),
                dry_run: false,
            });
            setRestoreResult(res.data ?? null);
            setStep(2);
            if (res.success) message.success(res.message || '恢复完成');
        } catch (e: any) {
            message.error(e?.message || '恢复失败');
        } finally {
            setRestoring(false);
        }
    }, [filename, buildResolutions]);

    const hasConflicts = (conflicts?.total_conflicts ?? 0) > 0;

    return {
        step, setStep,
        preview, previewLoading,
        conflicts, conflictsLoading, hasConflicts,
        resolutions, handleResolutionChange, buildConflictKey,
        restoreResult, restoring, dryRunning,
        handleCheckConflicts, handleDryRun, handleExecuteRestore,
    };
}
