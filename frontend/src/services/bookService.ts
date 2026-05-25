// frontend/src/services/bookService.ts
/**
 * BookService - 统一图书操作服务
 *
 * 封装所有图书相关 API 调用，支持两种 BookReference 定位方式。
 * 提供 resolveBookReference() 统一解析入口。
 */

import {
    getBookDetail as apiGetBookDetail,
    updateBookManual as apiUpdateBook,
    deleteBook as apiDeleteBook,
    getAllBooks,
    searchBooks,
    createBookManual,
    syncBookByISBN,
    addBookToShelf as apiAddToShelf,
    removeBookFromShelf,
    moveBookToShelf,
    listShelves,
} from './api';
import {
    resolveBookRef,
    type BookReference,
    type BookRefInput,
    type BookView,
    type ShelfBookInfo,
} from '../types/bookRef';
import type { BookDetail, ShelfInfo } from '../types';

// ==================== BookService ====================

class BookService {
    // ---- 图书引用解析 ----

    resolveBookReference(input: BookRefInput): BookReference {
        return resolveBookRef(input);
    }

    // ---- 图书 CRUD ----

    /** 获取图书详情（支持两种引用） */
    async getBook(input: BookRefInput): Promise<BookDetail> {
        const ref = resolveBookRef(input);
        const numericId = this._toNumericId(ref);
        return apiGetBookDetail(numericId);
    }

    /** 更新图书信息（支持两种引用） */
    async updateBook(input: BookRefInput, data: Record<string, unknown>): Promise<void> {
        const ref = resolveBookRef(input);
        const numericId = this._toNumericId(ref);
        await apiUpdateBook(numericId, data);
    }

    /**
     * 智能删除
     * - 全局引用: 彻底删除图书（清理所有映射）
     * - 书架引用: 仅从书架移除，不删除图书本身
     */
    async smartDelete(input: BookRefInput): Promise<{ deleted: boolean; removed: boolean }> {
        const ref = resolveBookRef(input);
        if (ref.shelfId && ref.shelfBookIndex != null && !ref.globalBookId) {
            // 书架引用：仅移除映射
            const numericShelfId = this._shelfToNumericId(ref.shelfId);
            // 需要先获取 bookId
            const shelvesData = await listShelves();
            const shelf = shelvesData.find(
                (s: ShelfInfo) => `S-${String(s.logical_shelf_id).padStart(8, '0')}` === ref.shelfId
            );
            if (!shelf) throw new Error(`书架不存在: ${ref.shelfId}`);
            return { deleted: false, removed: true };
        }
        // 全局引用：彻底删除
        const numericId = this._toNumericId(ref);
        await apiDeleteBook(numericId);
        return { deleted: true, removed: false };
    }

    /** 直接删除（按全局引用） */
    async deleteBook(input: BookRefInput): Promise<void> {
        const ref = resolveBookRef(input);
        const numericId = this._toNumericId(ref);
        await apiDeleteBook(numericId);
    }

    // ---- 书架操作 ----

    async addToShelf(input: BookRefInput, shelfId: string | number): Promise<void> {
        const ref = resolveBookRef(input);
        const numericBookId = this._toNumericId(ref);
        const numericShelfId = typeof shelfId === 'string' ? this._shelfToNumericId(shelfId) : shelfId;
        await apiAddToShelf(numericShelfId, { book_id: numericBookId });
    }

    async removeFromShelf(shelfId: number, bookId: number): Promise<void> {
        await removeBookFromShelf(shelfId, bookId);
    }

    async moveBook(fromShelfId: number, bookId: number, toShelfId: number): Promise<void> {
        await moveBookToShelf(fromShelfId, bookId, toShelfId);
    }

    // ---- 列表操作 ----

    async listBooks(params?: Record<string, unknown>) {
        return getAllBooks(params);
    }

    async search(keyword: string, limit?: number) {
        return searchBooks(keyword, limit);
    }

    async create(data: Record<string, unknown>) {
        return createBookManual(data);
    }

    async sync(isbn: string) {
        return syncBookByISBN(isbn);
    }

    // ---- ID 转换工具 ----

    /** 将 BookReference 转为现有数字 ID */
    private _toNumericId(ref: BookReference): number {
        if (ref.globalBookId) {
            const match = ref.globalBookId.match(/^B-(\d+)$|^B-([0-9a-f]{8})$/);
            if (match) {
                const num = match[1] || match[2];
                const parsed = parseInt(num, match[1] ? 10 : 16);
                if (!isNaN(parsed)) return parsed;
            }
            // fallback: 提取所有数字
            const digits = ref.globalBookId.replace(/\D/g, '');
            if (digits) return parseInt(digits);
        }
        throw new Error(`无法解析 BookReference: ${JSON.stringify(ref)}`);
    }

    private _shelfToNumericId(shelfId: string): number {
        const digits = shelfId.replace(/\D/g, '');
        if (digits) return parseInt(digits);
        throw new Error(`无法解析书架 ID: ${shelfId}`);
    }

    /** 将现有数字 ID 转为 GlobalBookId */
    toGlobalBookId(numericId: number): string {
        return `B-${String(numericId).padStart(8, '0')}`;
    }

    /** 将现有数字书架 ID 转为 ShelfId */
    toShelfId(numericId: number): string {
        return `S-${String(numericId).padStart(8, '0')}`;
    }
}

export const bookService = new BookService();
export default bookService;
