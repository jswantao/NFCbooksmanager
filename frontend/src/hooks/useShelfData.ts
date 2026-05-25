// frontend/src/hooks/useShelfData.ts
/**
 * useShelfData - 书架通用数据加载 Hook
 *
 * 为 ShelfManager 和 ShelfView 提供共享的数据加载逻辑:
 * - 书架列表加载
 * - 书架内图书加载
 * - 搜索/排序/防抖
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAsyncData } from './useAsyncData';
import { useDebouncedValue } from './useDebouncedValue';
import { listShelves, getShelfBooks } from '../services/api';
import type { ShelfInfo, ShelfBooks } from '../types';

export function useShelfData(shelfId?: number) {
    const { data: allShelves, loading: shelvesLoading } = useAsyncData(listShelves);
    const [shelfData, setShelfData] = useState<ShelfBooks | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [sortBy, setSortBy] = useState('sort_order');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const debouncedSearch = useDebouncedValue(searchKeyword, 300);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    const loadShelfBooks = useCallback(async (id: number) => {
        setLoading(true);
        setError(null);
        try {
            const data = await getShelfBooks(id, sortBy, sortOrder);
            if (isMountedRef.current) setShelfData(data);
        } catch (err: any) {
            if (isMountedRef.current) setError(err?.response?.data?.detail || '加载书架数据失败');
        } finally {
            if (isMountedRef.current) setLoading(false);
        }
    }, [sortBy, sortOrder]);

    return {
        allShelves: allShelves || [], shelvesLoading,
        shelfData, setShelfData, loading, error,
        searchKeyword, setSearchKeyword, debouncedSearch,
        sortBy, setSortBy, sortOrder, setSortOrder,
        loadShelfBooks,
    };
}
