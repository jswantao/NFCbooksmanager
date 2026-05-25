// frontend/src/hooks/useAllBooksData.ts
/**
 * useAllBooksData - 全部图书管理数据加载 Hook
 *
 * 从 AllBooksManager.tsx 提取的 inline useBookManager hook。
 * 封装图书列表加载、筛选、排序、分页等数据管理逻辑。
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { usePagination } from './usePagination';
import { getAllBooks } from '../services/api';
import type { BookItem, FilterStatus, FilterSource } from '../types';

const PAGE_SIZE = 50;

export function useAllBooksData() {
    const [books, setBooks] = useState<BookItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { page: currentPage, setPage: setCurrentPage, resetPage } = usePagination({ pageSize: PAGE_SIZE });
    const [searchKeyword, setSearchKeyword] = useState('');
    const [sortBy, setSortBy] = useState('added_at_desc');
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
    const [filterSource, setFilterSource] = useState<FilterSource>('all');
    const [filterShelfId, setFilterShelfId] = useState<number | undefined>();
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const parseSortParams = useCallback((value: string): { field: string; order: string } => {
        const idx = value.lastIndexOf('_');
        if (idx === -1) return { field: value, order: 'asc' };
        return { field: value.substring(0, idx), order: value.substring(idx + 1) };
    }, []);

    const loadBooks = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { field, order } = parseSortParams(sortBy);
            const params: Record<string, unknown> = {
                sort_by: field, order,
                limit: PAGE_SIZE,
                offset: (currentPage - 1) * PAGE_SIZE,
            };
            if (searchKeyword.trim()) params.search = searchKeyword.trim();
            if (filterShelfId) params.shelf_id = filterShelfId;
            if (filterSource !== 'all') params.source = filterSource;

            const data = await getAllBooks(params);
            if (isMounted.current) {
                let booksData = data.books || [];
                if (filterStatus === 'in_shelf') booksData = booksData.filter((b: BookItem) => b.shelf_name);
                else if (filterStatus === 'not_in_shelf') booksData = booksData.filter((b: BookItem) => !b.shelf_name);
                setBooks(booksData);
                setTotal(data.total);
            }
        } catch (err: any) {
            if (isMounted.current) setError(err?.response?.data?.detail || '加载图书列表失败');
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, [currentPage, sortBy, filterStatus, filterSource, filterShelfId, searchKeyword, parseSortParams]);

    const refresh = useCallback(() => resetPage(), [resetPage]);

    return {
        books, setBooks, total, loading, error,
        currentPage, setCurrentPage, searchKeyword, setSearchKeyword,
        sortBy, setSortBy, filterStatus, setFilterStatus,
        filterSource, setFilterSource, filterShelfId, setFilterShelfId,
        loadBooks, refresh,
    };
}
