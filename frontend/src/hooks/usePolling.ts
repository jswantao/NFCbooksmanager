import { useEffect, useRef, useCallback } from 'react';

export interface PollingOptions<T> {
    /** 轮询间隔（毫秒），默认 1500 */
    intervalMs?: number;
    /** 最大轮询次数，默认 60 */
    maxRetries?: number;
    /** 轮询数据更新回调 */
    onUpdate?: (data: T) => void;
    /** 轮询完成回调（任务结束） */
    onComplete?: (data: T) => void;
    /** 超时回调 */
    onTimeout?: () => void;
    /** 判断是否完成的函数，默认检查 status 字段 */
    isFinished?: (data: T) => boolean;
    /** 数据获取函数 */
    fetcher: (taskId: string) => Promise<T>;
}

/**
 * 通用轮询 Hook
 *
 * 用于导入进度追踪、同步状态轮询等场景。
 * 自动处理挂载安全、超时、完成检测。
 *
 * @example
 * const { startPoll, stopPoll } = usePolling<ImportTask>({
 *     fetcher: getImportStatus,
 *     onUpdate: (t) => setProgress(t.progress),
 *     onComplete: (t) => setResult(t),
 * });
 * startPoll(taskId);
 */
export function usePolling<T>(options: PollingOptions<T>) {
    const {
        intervalMs = 1500,
        maxRetries = 60,
        onUpdate,
        onComplete,
        onTimeout,
        isFinished,
        fetcher,
    } = options;

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const countRef = useRef(0);
    const mountedRef = useRef(true);
    const optionsRef = useRef(options);
    optionsRef.current = options;

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            stopPoll();
        };
    }, []);

    const stopPoll = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        countRef.current = 0;
    }, []);

    const startPoll = useCallback((taskId: string) => {
        stopPoll();
        countRef.current = 0;
        const opts = optionsRef.current;
        const checkFinished = opts.isFinished
            || ((d: T) => ['completed', 'failed', 'cancelled'].includes((d as any).status));

        pollRef.current = setInterval(async () => {
            if (!mountedRef.current) return;

            countRef.current++;
            if (countRef.current > maxRetries) {
                stopPoll();
                onTimeout?.();
                return;
            }

            try {
                const data = await fetcher(taskId);
                if (!mountedRef.current) return;
                onUpdate?.(data);

                if (checkFinished(data)) {
                    stopPoll();
                    onComplete?.(data);
                }
            } catch {
                // 单次失败不中断轮询
            }
        }, intervalMs);
    }, [stopPoll, intervalMs, maxRetries, onUpdate, onComplete, onTimeout, fetcher]);

    return { startPoll, stopPoll };
}
