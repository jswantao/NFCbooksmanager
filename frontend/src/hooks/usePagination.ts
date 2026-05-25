import { useState, useMemo, useCallback } from 'react';

export interface PaginationState {
    page: number;
    pageSize: number;
    offset: number;
    setPage: (page: number) => void;
    resetPage: () => void;
}

/**
 * 分页状态 Hook
 *
 * 管理当前页码、每页条数和偏移量。
 * filter 变更时自动重置到第 1 页。
 *
 * @param options.pageSize - 每页条数（默认 20）
 */
export function usePagination(options?: { pageSize?: number }): PaginationState {
    const pageSize = options?.pageSize ?? 20;
    const [page, setPage] = useState(1);

    const offset = useMemo(() => (page - 1) * pageSize, [page, pageSize]);

    const resetPage = useCallback(() => setPage(1), []);

    return { page, pageSize, offset, setPage, resetPage };
}
