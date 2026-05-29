// services/api/shelfApi.ts
// 书架相关 API 函数

import apiClient, { unwrap } from "./client";
import type {
    ShelfInfo,
    ShelfBooks,
    ShelfCreateParams,
    ShelfUpdateParams,
} from "../../types";

// ==================== 书架 CRUD ====================

export const listShelves = (): Promise<ShelfInfo[]> =>
    apiClient.get("/shelves").then(unwrap);

export const createShelf = (data: ShelfCreateParams): Promise<ShelfInfo> =>
    apiClient.post("/shelves", data).then(unwrap);

export const updateShelf = (id: number, data: ShelfUpdateParams): Promise<ShelfInfo> =>
    apiClient.put(`/shelves/${id}`, data).then(unwrap);

export const deleteShelf = (id: number): Promise<void> =>
    apiClient.delete(`/shelves/${id}`).then(unwrap);

// ==================== 书架内图书操作 ====================

export const getShelfBooks = (shelfId: number): Promise<ShelfBooks> =>
    apiClient.get(`/shelves/${shelfId}/books`).then(unwrap);

export const addBookToShelf = (shelfId: number, isbn: string): Promise<void> =>
    apiClient.post(`/shelves/${shelfId}/books`, { isbn }).then(unwrap);

export const removeBookFromShelf = (shelfId: number, isbn: string): Promise<void> =>
    apiClient.delete(`/shelves/${shelfId}/books/${isbn}`).then(unwrap);

export const moveBookToShelf = (isbn: string, fromShelfId: number, toShelfId: number): Promise<void> =>
    apiClient.post("/shelves/move-book", { isbn, from_shelf_id: fromShelfId, to_shelf_id: toShelfId }).then(unwrap);

export const updateBookSortOrder = (shelfId: number, isbn: string, sortOrder: number): Promise<void> =>
    apiClient.put(`/shelves/${shelfId}/books/${isbn}/sort`, { sort_order: sortOrder }).then(unwrap);
