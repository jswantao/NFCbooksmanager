// hooks/useQueryCache.ts
/**
 * 统一数据查询缓存层
 *
 * 替代 service/api/client.ts 中的 inFlightRequests Map 手动去重，
 * 提供基于 React 的请求缓存、去重、stale-while-revalidate 模式。
 *
 * 核心能力：
 * 1. 请求去重：相同查询复用进行中的 Promise
 * 2. 缓存管理：staleTime / gcTime 控制缓存生命周期
 * 3. 自动重取：窗口焦点恢复时刷新 stale 数据
 * 4. 缓存失效：数据变更后手动 invalidate
 *
 * 用法:
 *   const { data, loading, error, refetch } = useQuery(
 *     ["books", params],
 *     () => searchBooks(params)
 *   );
 */

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";

// ==================== 类型定义 ====================

type QueryKey = readonly unknown[];
type QueryFn<T> = () => Promise<T>;

interface CacheEntry<T> {
    data: T;
    updatedAt: number;
    staleAt: number;
    gcAt: number;
}

interface QueryState<T> {
    data: T | undefined;
    loading: boolean;
    error: string | null;
}

interface QueryOptions {
    staleTime?: number;   // 默认 30s，stale 后自动后台刷新
    gcTime?: number;       // 默认 5min，超过后清除缓存
    enabled?: boolean;
}

const DEFAULT_STALE_TIME = 30_000;
const DEFAULT_GC_TIME = 300_000;

// ==================== 缓存存储 ====================

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function serializeKey(key: QueryKey): string {
    return JSON.stringify(key);
}

function subscribe(key: string, callback: () => void): () => void {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(callback);
    return () => {
        listeners.get(key)?.delete(callback);
    };
}

function notify(key: string) {
    listeners.get(key)?.forEach((cb) => cb());
}

function getCacheSnapshot<T>(key: string): CacheEntry<T> | undefined {
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    if (entry && Date.now() > entry.gcAt) {
        cache.delete(key);
        return undefined;
    }
    return entry;
}

function setCache<T>(key: string, data: T, staleTime: number, gcTime: number) {
    const now = Date.now();
    cache.set(key, {
        data,
        updatedAt: now,
        staleAt: now + staleTime,
        gcAt: now + gcTime,
    });
    notify(key);
}

function isStale(key: string): boolean {
    const entry = cache.get(key);
    return !entry || Date.now() > (entry as CacheEntry<unknown>).staleAt;
}

/** 手动失效缓存 */
export function invalidateCache(keyPrefix?: string) {
    if (keyPrefix) {
        for (const [k] of cache) {
            if (k.startsWith(keyPrefix)) { cache.delete(k); notify(k); }
        }
    } else {
        cache.clear();
        for (const [, l] of listeners) l.forEach((cb) => cb());
    }
}

/** 清除所有缓存（用于登出等场景） */
export function clearAllCache() {
    cache.clear();
    inFlight.clear();
    for (const [, l] of listeners) l.forEach((cb) => cb());
    listeners.clear();
}

// ==================== React Hook ====================

export function useQuery<T>(
    queryKey: QueryKey,
    queryFn: QueryFn<T>,
    options: QueryOptions = {}
): QueryState<T> & { refetch: () => Promise<void> } {
    const { staleTime = DEFAULT_STALE_TIME, gcTime = DEFAULT_GC_TIME, enabled = true } = options;
    const key = serializeKey(queryKey);
    const [state, setState] = useState<QueryState<T>>({ data: undefined, loading: true, error: null });
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // Subscribe to cache changes
    useEffect(() => {
        return subscribe(key, () => {
            const entry = getCacheSnapshot<T>(key);
            if (mountedRef.current && entry) {
                setState({ data: entry.data, loading: false, error: null });
            }
        });
    }, [key]);

    const fetchData = useCallback(async (force = false) => {
        if (!enabled) return;

        // Check cache
        if (!force && !isStale(key)) {
            const entry = getCacheSnapshot<T>(key);
            if (entry) {
                setState({ data: entry.data, loading: false, error: null });
                return;
            }
        }

        // Dedup: reuse in-flight request
        const existingPromise = inFlight.get(key);
        if (existingPromise) {
            try {
                const data = await existingPromise as T;
                if (mountedRef.current) setState({ data, loading: false, error: null });
                return;
            } catch (err) {
                if (mountedRef.current) setState((s) => ({ ...s, loading: false }));
                return;
            }
        }

        setState((s) => ({ ...s, loading: s.data === undefined }));

        const promise = queryFn();
        inFlight.set(key, promise);

        try {
            const data = await promise;
            setCache(key, data, staleTime, gcTime);
            if (mountedRef.current) setState({ data, loading: false, error: null });
        } catch (err) {
            const msg = err instanceof Error ? err.message : "请求失败";
            if (mountedRef.current) setState((s) => ({ ...s, error: msg, loading: false }));
        } finally {
            inFlight.delete(key);
        }
    }, [key, queryFn, staleTime, gcTime, enabled]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Window focus refetch for stale data
    useEffect(() => {
        const handleFocus = () => {
            if (document.visibilityState === "visible" && isStale(key)) {
                fetchData(true);
            }
        };
        window.addEventListener("visibilitychange", handleFocus);
        window.addEventListener("focus", handleFocus);
        return () => {
            window.removeEventListener("visibilitychange", handleFocus);
            window.removeEventListener("focus", handleFocus);
        };
    }, [key, fetchData]);

    const refetch = useCallback(async () => {
        await fetchData(true);
    }, [fetchData]);

    return { ...state, refetch };
}

// ==================== 分页查询 Hook ====================

export function usePaginatedQuery<T>(
    queryKey: QueryKey,
    queryFn: (params: { limit: number; offset: number }) => Promise<{ items: T[]; total: number }>,
    options: QueryOptions & { pageSize?: number } = {}
) {
    const [page, setPage] = useState(1);
    const [pageSize] = useState(options.pageSize ?? 30);

    const fullKey = [...queryKey, { page, pageSize }] as const;
    const { data, loading, error, refetch } = useQuery(fullKey, () =>
        queryFn({ limit: pageSize, offset: (page - 1) * pageSize })
    );

    return {
        items: (data as { items: T[]; total: number } | undefined)?.items ?? [],
        total: (data as { items: T[]; total: number } | undefined)?.total ?? 0,
        loading,
        error,
        page,
        pageSize,
        setPage,
        refetch,
    };
}
