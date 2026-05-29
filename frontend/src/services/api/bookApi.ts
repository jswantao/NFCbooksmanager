// services/api/bookApi.ts
// 图书相关 API 函数

import apiClient, { unwrap } from "./client";
import type {
    Book,
    BookDetail,
    BookSyncResult,
    BookWallParams,
    BooksResponse,
} from "../../types";

// ==================== 图书查询 ====================

export const searchBooks = (params: {
    keyword?: string;
    shelf_id?: number;
    source?: string;
    sort_by?: string;
    sort_order?: string;
    limit?: number;
    offset?: number;
}): Promise<BooksResponse> =>
    apiClient.get("/books", { params }).then(unwrap);

export const getBookDetail = (id: string | number): Promise<BookDetail> =>
    apiClient.get(`/books/${id}`).then(unwrap);

export const getBookWall = (params: BookWallParams): Promise<{ books: Book[]; total: number }> =>
    apiClient.get("/books/wall", { params }).then(unwrap);

export const getAllBooks = (params?: {
    search?: string;
    shelf_id?: number;
    source?: string;
    sort_by?: string;
    sort_order?: string;
    limit?: number;
    offset?: number;
}): Promise<BooksResponse> =>
    apiClient.get("/books", { params }).then(unwrap);

export const getAllBooksFlat = (params?: Record<string, unknown>): Promise<Book[]> =>
    apiClient.get("/books/flat", { params }).then(unwrap);

// ==================== 图书同步 ====================

export const syncBookByISBN = (isbn: string): Promise<BookSyncResult> =>
    apiClient.post("/books/sync", { isbn }).then(unwrap);

// ==================== 图书 CRUD ====================

export const createBookManual = (data: Record<string, unknown>): Promise<Book> =>
    apiClient.post("/books", data).then(unwrap);

export const updateBookManual = (id: number, data: Record<string, unknown>): Promise<Book> =>
    apiClient.put(`/books/${id}`, data).then(unwrap);

export const deleteBook = (id: number): Promise<void> =>
    apiClient.delete(`/books/${id}`).then(unwrap);

// ==================== 封面图片 ====================

const IMAGE_PROXY_BASE = "/api/images/proxy";

export const getImageProxyUrl = (url?: string): string => {
    if (!url) return "";
    if (url.startsWith("/uploads/") || url.startsWith("/api/")) return url;
    if (url.startsWith("data:")) return url;
    return `${IMAGE_PROXY_BASE}?url=${encodeURIComponent(url)}`;
};

export const uploadBookCover = (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient.post("/images/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
    }).then(unwrap);
};

export const deleteBookCover = (bookId: number): Promise<void> =>
    apiClient.delete(`/images/cover/${bookId}`).then(unwrap);
