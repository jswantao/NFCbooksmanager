// hooks/useBookTable.ts
// 全量图书管理 Hook：分页/搜索/排序/筛选/批量操作

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getAllBooks, deleteBook, listShelves, extractErrorMessage } from "../services/api";
import type { Book, ShelfInfo } from "../types";

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;

export interface BookTableState {
    books: Book[];
    total: number;
    loading: boolean;
    error: string | null;
    currentPage: number;
    pageSize: number;
    searchKeyword: string;
    sortBy: string;
    sortOrder: "asc" | "desc";
    filterShelfId: number | null;
    filterSource: string;
    filterStatus: string;
    selectedRowKeys: number[];
    shelfList: Array<{ value: number; label: string }>;
    deleting: boolean;
    batchModalOpen: boolean;
    batchAction: "move" | "tag" | null;
    setCurrentPage: (v: number) => void;
    setPageSize: (v: number) => void;
    setSearchKeyword: (v: string) => void;
    setSortBy: (v: string) => void;
    setSortOrder: (v: "asc" | "desc") => void;
    setFilterShelfId: (v: number | null) => void;
    setFilterSource: (v: string) => void;
    setFilterStatus: (v: string) => void;
    setSelectedRowKeys: (v: number[]) => void;
    setBatchModalOpen: (v: boolean) => void;
    setBatchAction: (v: "move" | "tag" | null) => void;
    handleDelete: (id: number) => Promise<void>;
    handleBatchDelete: () => Promise<void>;
    refresh: () => void;
}

export function useBookTable(): BookTableState {
    const [books, setBooks] = useState<Book[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(PAGE_SIZE);
    const [searchKeyword, setSearchKeyword] = useState("");
    const [sortBy, setSortBy] = useState("added_at");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [filterShelfId, setFilterShelfId] = useState<number | null>(null);
    const [filterSource, setFilterSource] = useState("");
    const [filterStatus, setFilterStatus] = useState("");
    const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
    const [shelfList, setShelfList] = useState<Array<{ value: number; label: string }>>([]);
    const [deleting, setDeleting] = useState(false);
    const [batchModalOpen, setBatchModalOpen] = useState(false);
    const [batchAction, setBatchAction] = useState<"move" | "tag" | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        listShelves().then((s) => isMounted.current && setShelfList(s.map((sh) => ({ value: sh.logical_shelf_id, label: sh.shelf_name })))).catch(() => {});
        return () => { isMounted.current = false; };
    }, []);

    const fetchBooks = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getAllBooks({
                search: searchKeyword || undefined,
                shelf_id: filterShelfId ?? undefined,
                source: filterSource || undefined,
                sort_by: sortBy,
                sort_order: sortOrder,
                limit: pageSize,
                offset: (currentPage - 1) * pageSize,
            });
            if (isMounted.current) {
                setBooks(result.books ?? []);
                setTotal(result.total ?? 0);
                setError(null);
            }
        } catch (err) {
            if (isMounted.current) setError(extractErrorMessage(err));
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, [searchKeyword, filterShelfId, filterSource, sortBy, sortOrder, currentPage, pageSize]);

    useEffect(() => { fetchBooks(); }, [fetchBooks]);

    const refresh = useCallback(() => fetchBooks(), [fetchBooks]);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setCurrentPage(1);
        }, SEARCH_DEBOUNCE_MS);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [searchKeyword]);

    const handleDelete = useCallback(async (id: number) => {
        setDeleting(true);
        try { await deleteBook(id); refresh(); } catch { /* silent */ }
        finally { setDeleting(false); }
    }, [refresh]);

    const handleBatchDelete = useCallback(async () => {
        setDeleting(true);
        try {
            for (const id of selectedRowKeys) await deleteBook(id);
            setSelectedRowKeys([]);
            refresh();
        } catch { /* silent */ }
        finally { setDeleting(false); }
    }, [selectedRowKeys, refresh]);

    return {
        books, total, loading, error, currentPage, pageSize,
        searchKeyword, sortBy, sortOrder, filterShelfId, filterSource, filterStatus,
        selectedRowKeys, shelfList, deleting, batchModalOpen, batchAction,
        setCurrentPage, setPageSize, setSearchKeyword, setSortBy, setSortOrder,
        setFilterShelfId, setFilterSource, setFilterStatus,
        setSelectedRowKeys, setBatchModalOpen, setBatchAction,
        handleDelete, handleBatchDelete, refresh,
    };
}
