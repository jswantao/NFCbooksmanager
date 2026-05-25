import { useState, useEffect, useCallback, useRef } from 'react';
import { extractErrorMessage } from '@services/api';

export interface AsyncDataState<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

/**
 * 通用异步数据加载 Hook
 *
 * 封装了 loading / data / error 三态管理和自动加载逻辑，
 * 替代各页面中重复的 useXxxData 自定义 Hook。
 *
 * @param fetcher - 异步数据获取函数，返回 Promise<T>
 * @param deps - 依赖数组，变化时重新加载（默认 [] 表示仅挂载时加载一次）
 */
export function useAsyncData<T>(
    fetcher: () => Promise<T>,
    deps: React.DependencyList = []
): AsyncDataState<T> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetcher();
            if (mountedRef.current) {
                setData(result);
            }
        } catch (err: unknown) {
            if (mountedRef.current) {
                setError(extractErrorMessage(err) || '加载失败');
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    useEffect(() => {
        mountedRef.current = true;
        load();
        return () => { mountedRef.current = false; };
    }, [load]);

    return { data, loading, error, refresh: load };
}
