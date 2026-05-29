// hooks/useInfiniteBookWall.ts
// 封面墙无限滚动数据加载 Hook

import { useState, useEffect, useCallback, useRef } from "react";
import { getBookWall } from "../services/api";
import type { Book } from "../types";

const PAGE_SIZE = 40;

interface UseInfiniteBookWallReturn {
    books: Book[];
    total: number;
    loading: boolean;
    loadingMore: boolean;
    hasMore: boolean;
    error: string | null;
    loadMore: () => void;
    refresh: () => void;
}

export function useInfiniteBookWall(
    shelfId?: number,
    sortBy?: string,
    searchText?: string
): UseInfiniteBookWallReturn {
    const [books, setBooks] = useState<Book[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [offset, setOffset] = useState(0);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const fetchBooks = useCallback(async (append: boolean = false) => {
        const currentOffset = append ? offset : 0;
        if (!append) setLoading(true);

        try {
            const result = await getBookWall({
                shelf_id: shelfId,
                sort_by: sortBy,
                search: searchText || undefined,
                limit: PAGE_SIZE,
                offset: currentOffset,
            });
            if (isMounted.current) {
                if (append) {
                    setBooks((prev) => [...prev, ...result.books]);
                    setOffset((prev) => prev + PAGE_SIZE);
                } else {
                    setBooks(result.books);
                    setOffset(PAGE_SIZE);
                }
                setTotal(result.total);
                setError(null);
            }
        } catch (err) {
            if (isMounted.current) {
                setError(err instanceof Error ? err.message : "加载失败");
            }
        } finally {
            if (isMounted.current) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [shelfId, sortBy, searchText, offset]);

    useEffect(() => {
        setBooks([]);
        setOffset(0);
        setTotal(0);
        fetchBooks(false);
    }, [shelfId, sortBy, searchText]);

    const loadMore = useCallback(() => {
        if (loadingMore || books.length >= total) return;
        setLoadingMore(true);
        fetchBooks(true);
    }, [loadingMore, books.length, total, fetchBooks]);

    const refresh = useCallback(() => {
        setBooks([]);
        setOffset(0);
        setTotal(0);
        fetchBooks(false);
    }, [fetchBooks]);

    return {
        books, total,
        loading, loadingMore,
        hasMore: books.length < total,
        error,
        loadMore, refresh,
    };
}
