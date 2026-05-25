// frontend/src/hooks/useBookManager.ts
/**
 * useBookManager - 统一图书管理 Hook
 *
 * 封装 BookService 调用，提供 loading/error 状态管理和常用操作。
 * 支持全局 ID 和书架定位两种引用方式。
 */

import { useState, useCallback, useRef } from 'react';
import bookService from '../services/bookService';
import type { BookReference, BookRefInput } from '../types/bookRef';
import type { BookDetail } from '../types';

export interface BookManagerState {
    loading: boolean;
    error: string | null;
    currentBook: BookDetail | null;
}

export interface BookManagerActions {
    getBook: (ref: BookRefInput) => Promise<BookDetail | null>;
    updateBook: (ref: BookRefInput, data: Record<string, unknown>) => Promise<void>;
    deleteBook: (ref: BookRefInput) => Promise<void>;
    smartDelete: (ref: BookRefInput) => Promise<{ deleted: boolean; removed: boolean }>;
    resolveRef: (input: BookRefInput) => BookReference;
}

export function useBookManager(): BookManagerState & BookManagerActions {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentBook, setCurrentBook] = useState<BookDetail | null>(null);
    const mountedRef = useRef(true);

    const withLoading = useCallback(async <T>(fn: () => Promise<T>): Promise<T | null> => {
        setLoading(true);
        setError(null);
        try {
            const result = await fn();
            if (mountedRef.current) return result;
            return null;
        } catch (err: any) {
            if (mountedRef.current) {
                const msg = err?.response?.data?.detail || err?.message || '操作失败';
                setError(msg);
            }
            throw err;
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, []);

    const getBook = useCallback(async (ref: BookRefInput): Promise<BookDetail | null> => {
        const book = await withLoading(() => bookService.getBook(ref));
        if (book && mountedRef.current) setCurrentBook(book);
        return book;
    }, [withLoading]);

    const updateBook = useCallback(async (ref: BookRefInput, data: Record<string, unknown>) => {
        await withLoading(() => bookService.updateBook(ref, data));
    }, [withLoading]);

    const deleteBook = useCallback(async (ref: BookRefInput) => {
        await withLoading(() => bookService.deleteBook(ref));
        if (mountedRef.current) setCurrentBook(null);
    }, [withLoading]);

    const smartDelete = useCallback(async (ref: BookRefInput) => {
        const result = await withLoading(() => bookService.smartDelete(ref));
        return result || { deleted: false, removed: false };
    }, [withLoading]);

    const resolveRef = useCallback((input: BookRefInput): BookReference => {
        return bookService.resolveBookReference(input);
    }, []);

    return {
        loading,
        error,
        currentBook,
        getBook,
        updateBook,
        deleteBook,
        smartDelete,
        resolveRef,
    };
}
