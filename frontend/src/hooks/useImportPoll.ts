// frontend/src/hooks/useImportPoll.ts
/**
 * useImportPoll - 导入任务轮询 Hook
 *
 * 从 BatchImport.tsx 提取。轮询检查导入任务状态，
 * 支持超时检测、自动停止、组件卸载清理。
 */

import { useRef, useEffect, useCallback } from 'react';
import { getImportStatus } from '../services/api';
import type { ImportTask } from '../types';

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_RETRIES = 60;

export function useImportPoll() {
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollCountRef = useRef(0);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; stopPoll(); };
    }, []);

    const stopPoll = useCallback(() => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        pollCountRef.current = 0;
    }, []);

    const startPoll = useCallback((
        taskId: string,
        onUpdate: (task: ImportTask) => void,
        onComplete: (task: ImportTask) => void,
        onTimeout: () => void,
    ) => {
        stopPoll();
        pollRef.current = setInterval(async () => {
            if (!isMounted.current) return;
            pollCountRef.current++;
            if (pollCountRef.current > MAX_POLL_RETRIES) { stopPoll(); onTimeout(); return; }
            try {
                const task = await getImportStatus(taskId);
                if (!isMounted.current) return;
                onUpdate(task);
                if (['completed', 'failed', 'cancelled'].includes(task.status)) {
                    stopPoll();
                    onComplete(task);
                }
            } catch { /* 单次轮询失败不中断 */ }
        }, POLL_INTERVAL_MS);
    }, [stopPoll]);

    return { startPoll, stopPoll };
}
