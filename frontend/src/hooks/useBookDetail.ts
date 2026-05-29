// hooks/useBookDetail.ts
// 图书详情页 Hook：数据加载 + 操作处理

import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getBookDetail, syncBookByISBN, deleteBook } from "../services/api";
import type { BookDetail as BookDetailType } from "../types";

interface UseBookDetailReturn {
    book: BookDetailType | null;
    loading: boolean;
    error: string | null;
    syncing: boolean;
    removing: boolean;
    imagePreviewVisible: boolean;
    showShelfSelector: boolean;
    setImagePreviewVisible: (v: boolean) => void;
    setShowShelfSelector: (v: boolean) => void;
    handleSync: () => Promise<void>;
    handleRemove: () => Promise<void>;
    handleCopyISBN: () => void;
    handleShare: () => void;
}

export function useBookDetail(): UseBookDetailReturn {
    const { bookId } = useParams<{ bookId: string }>();
    const navigate = useNavigate();
    const [book, setBook] = useState<BookDetailType | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [imagePreviewVisible, setImagePreviewVisible] = useState(false);
    const [showShelfSelector, setShowShelfSelector] = useState(false);

    const loadBook = useCallback(async () => {
        if (!bookId) return;
        setLoading(true);
        try {
            const data = await getBookDetail(bookId);
            setBook(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "加载失败");
        } finally {
            setLoading(false);
        }
    }, [bookId]);

    useEffect(() => { loadBook(); }, [loadBook]);

    const handleSync = useCallback(async () => {
        if (!book?.isbn) return;
        setSyncing(true);
        try {
            await syncBookByISBN(book.isbn);
            await loadBook();
        } catch {
            // handled silently
        } finally {
            setSyncing(false);
        }
    }, [book?.isbn, loadBook]);

    const handleRemove = useCallback(async () => {
        if (!bookId) return;
        setRemoving(true);
        try {
            await deleteBook(Number(bookId));
            navigate(-1);
        } catch {
            // handled silently
        } finally {
            setRemoving(false);
        }
    }, [bookId, navigate]);

    const handleCopyISBN = useCallback(() => {
        if (book?.isbn) {
            navigator.clipboard.writeText(book.isbn);
        }
    }, [book?.isbn]);

    const handleShare = useCallback(() => {
        if (book) {
            navigator.share?.({ title: book.title, text: `${book.title} - ${book.author ?? ""}`, url: window.location.href });
        }
    }, [book]);

    return {
        book, loading, error, syncing, removing,
        imagePreviewVisible, showShelfSelector,
        setImagePreviewVisible, setShowShelfSelector,
        handleSync, handleRemove, handleCopyISBN, handleShare,
    };
}
