// frontend/src/services/api.ts
/**
 * API 服务层
 * 
 * 封装所有后端 API 调用，提供统一的请求/响应处理。
 * 
 * 设计原则：
 * - 单一入口：所有 API 调用通过 axios 实例统一管理
 * - 错误拦截：统一处理网络错误和业务错误
 * - 类型安全：所有响应使用泛型接口约束
 * - 代理友好：使用相对路径，通过 Vite 代理转发到后端
 * 
 * 代理配置（vite.config.ts）：
 * /api/* → http://localhost:8000/api/*
 * 
 * 三级模式 API 映射：
 * - /api/nfc/*      → 外模式（NFC 读写）
 * - /api/mapping/*  → 中间模式（映射解析）
 * - /api/shelves/*  → 中间模式（书架管理）
 * - /api/books/*    → 内模式（图书数据）
 * - /api/admin/*    → 内模式（管理统计）
 * 
 * 注意：
 * - POST/PUT 请求使用请求体（Body）传递数据，不使用查询参数
 * - GET/DELETE 请求使用查询参数（params）
 */

import axios from 'axios';
import type { AxiosResponse, AxiosError } from 'axios';
import type {
    ApiResponse,
    Book,
    BookDetail,
    BookSyncResult,
    BookWallParams,
    ShelfInfo,
    ShelfBooks,
    ShelfCreateParams,
    ShelfUpdateParams,
    NFCWriteTask,
    NFCReadResult,
    ImportPreview,
    ImportTask,
    ImportStartParams,
    DashboardStats,
    CookieConfigInfo,
    CookieTestResult,
    PaginatedResponse,
    BooksResponse,
} from '../types';

// ==================== 常量配置 ====================

/** API 基础路径（通过 Vite 代理转发到后端） */
const API_BASE_URL = '/api';

/** 请求超时时间（毫秒） */
const REQUEST_TIMEOUT = 30000;

// ==================== Axios 实例 ====================

/**
 * 创建预配置的 axios 实例
 * 
 * 配置项：
 * - baseURL: /api（相对路径，通过 Vite 代理）
 * - timeout: 30 秒超时
 * - headers: JSON 请求头
 */
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: REQUEST_TIMEOUT,
    headers: {
        'Content-Type': 'application/json',
    },
});

// ==================== 请求拦截器 ====================

/** 开发环境打印请求日志 */
apiClient.interceptors.request.use(
    (config) => {
        if (import.meta.env.DEV) {
            console.debug(
                `[API Request] ${config.method?.toUpperCase()} ${config.url}`,
                config.params || config.data
            );
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// ==================== 响应拦截器 ====================

/**
 * 统一响应错误处理
 * 
 * 处理层级：
 * 1. 网络错误（无响应）→ 提示网络连接问题
 * 2. 服务端错误（有响应）→ 提取 detail 或 message
 * 3. 业务错误 → 通过 response.data 返回
 */
apiClient.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error: AxiosError<{ detail?: string; message?: string }>) => {
        let errorMessage = '网络错误，请检查连接';

        if (error.response) {
            const { status, data } = error.response;
            errorMessage = data?.detail || data?.message || errorMessage;

            if (status === 404) {
                console.warn(`[API 404] ${error.config?.url}: ${errorMessage}`);
            } else if (status === 400) {
                console.warn(`[API 400] ${error.config?.url}: ${errorMessage}`);
            } else if (status === 422) {
                console.warn(`[API 422] ${error.config?.url}: ${errorMessage} (请求参数格式错误)`);
            } else if (status >= 500) {
                console.error(`[API ${status}] ${error.config?.url}: ${errorMessage}`);
            }
        } else if (error.request) {
            errorMessage = '无法连接到服务器，请检查后端是否启动';
            console.error('[API Network Error]', error.message);
        } else {
            errorMessage = error.message || errorMessage;
            console.error('[API Config Error]', error.message);
        }

        (error as any).userMessage = errorMessage;
        return Promise.reject(error);
    }
);

// ==================== 书架 API ====================

/** 获取所有逻辑书架列表 */
export const listShelves = (): Promise<ShelfInfo[]> =>
    apiClient.get('/shelves/').then((r) => r.data);

/**
 * 创建新逻辑书架
 * 
 * POST /api/shelves/
 * Body: { shelf_name: string, description?: string }
 */
export const createShelf = (data: ShelfCreateParams): Promise<ApiResponse> =>
    apiClient.post('/shelves/', data).then((r) => r.data);

/**
 * 更新书架信息
 * 
 * PUT /api/shelves/{id}
 * Body: { shelf_name?: string, description?: string }
 */
export const updateShelf = (
    id: number,
    data: ShelfUpdateParams
): Promise<ApiResponse> =>
    apiClient.put(`/shelves/${id}`, data).then((r) => r.data);

/** 删除书架（软删除） */
export const deleteShelf = (id: number): Promise<ApiResponse> =>
    apiClient.delete(`/shelves/${id}`).then((r) => r.data);

/**
 * 获取书架中的图书列表
 * 
 * GET /api/shelves/{id}/books?sort_by=...&order=...
 */
export const getShelfBooks = (
    id: number,
    sortBy: string = 'sort_order',
    order: string = 'asc'
): Promise<ShelfBooks> =>
    apiClient
        .get(`/shelves/${id}/books`, {
            params: { sort_by: sortBy, order },
        })
        .then((r) => r.data);

/**
 * 添加图书到书架
 * 
 * POST /api/shelves/{shelfId}/books
 * Body: { book_id: number, sort_order?: number, note?: string }
 */
export const addBookToShelf = (
    shelfId: number,
    bookId: number
): Promise<ApiResponse> =>
    apiClient
        .post(`/shelves/${shelfId}/books`, { book_id: bookId })
        .then((r) => r.data);

/** 从书架移除图书 */
export const removeBookFromShelf = (
    shelfId: number,
    bookId: number
): Promise<ApiResponse> =>
    apiClient
        .delete(`/shelves/${shelfId}/books/${bookId}`)
        .then((r) => r.data);

/**
 * 将图书移动到其他书架
 * 
 * PUT /api/shelves/{fromShelfId}/books/{bookId}/move?target_shelf_id=...
 */
export const moveBookToShelf = (
    fromShelfId: number,
    bookId: number,
    toShelfId: number
): Promise<ApiResponse> =>
    apiClient
        .put(`/shelves/${fromShelfId}/books/${bookId}/move`, null, {
            params: { target_shelf_id: toShelfId },
        })
        .then((r) => r.data);

// ==================== 图书 API ====================

/** 获取图书完整详情 */
export const getBookDetail = (id: number): Promise<BookDetail> =>
    apiClient.get(`/books/${id}`).then((r) => r.data);

/** 获取图书墙数据（分页、排序、筛选） */
export const getBookWall = (
    params: BookWallParams
): Promise<BooksResponse> =>
    apiClient.get('/books/wall', { params }).then((r) => r.data);

/** 获取所有图书列表（包括未上架的） */
export const getAllBooks = (
    params: BookWallParams
): Promise<BooksResponse> =>
    apiClient.get('/books/all', { params }).then((r) => r.data);

/**
 * 根据 ISBN 从豆瓣同步图书数据
 * 
 * POST /api/books/sync
 * Body: { isbn: string }
 */
export const syncBookByISBN = (isbn: string): Promise<BookSyncResult> =>
    apiClient.post('/books/sync', { isbn }).then((r) => r.data);

/**
 * 手动创建图书记录
 * 
 * POST /api/books/manual
 * Body: { isbn, title, author, ... }
 */
export const createBookManual = (
    params: Record<string, any>
): Promise<ApiResponse> =>
    apiClient.post('/books/manual', params).then((r) => r.data);

/**
 * 手动更新图书信息
 * 
 * PUT /api/books/{id}/manual
 * Body: { title?, author?, ... }
 */
export const updateBookManual = (
    id: number,
    params: Record<string, any>
): Promise<ApiResponse> =>
    apiClient.put(`/books/${id}/manual`, params).then((r) => r.data);

/**
 * 搜索图书
 * 
 * GET /api/books/search?keyword=...&limit=...
 */
export const searchBooks = (
    keyword: string,
    limit: number = 20
): Promise<Book[]> =>
    apiClient
        .get('/books/search', { params: { keyword, limit } })
        .then((r) => r.data);

/** 删除图书（级联删除书架关联和同步日志） */
export const deleteBook = (id: number): Promise<ApiResponse> =>
    apiClient.delete(`/books/${id}`).then((r) => r.data);

// ==================== NFC API ====================

/**
 * 生成 NFC 标签写入数据
 * 
 * POST /api/nfc/write
 * Body: { shelf_id: number, shelf_name: string }
 */
export const writeNFCTag = (
    data: { shelf_id: number; shelf_name: string }
): Promise<NFCWriteTask> =>
    apiClient.post('/nfc/write', data).then((r) => r.data);

/**
 * 解析 NFC 标签读取的原始数据
 * 
 * GET /api/nfc/read-tag?tag_uid=...&raw_payload=...
 */
export const readNFCTag = (
    tagUid: string,
    rawPayload: string
): Promise<NFCReadResult> =>
    apiClient
        .get('/nfc/read-tag', {
            params: { tag_uid: tagUid, raw_payload: rawPayload },
        })
        .then((r) => r.data);

/** 获取所有 NFC 写入任务列表 */
export const getNFCTasks = (): Promise<{ tasks: NFCWriteTask[]; total: number }> =>
    apiClient.get('/nfc/tasks').then((r) => r.data);

/** 删除 NFC 写入任务 */
export const deleteNFCTask = (taskId: string): Promise<ApiResponse> =>
    apiClient.delete(`/nfc/tasks/${taskId}`).then((r) => r.data);

// ==================== 管理 API ====================

/** 获取管理仪表盘统计数据 */
export const getDashboardStats = (): Promise<DashboardStats> =>
    apiClient.get('/admin/stats').then((r) => r.data);

/** 获取操作活动日志 */
export const getDashboardLogs = (
    params?: { limit?: number; action_type?: string; days?: number }
): Promise<any[]> =>
    apiClient.get('/admin/logs', { params }).then((r) => r.data);

// ==================== 配置 API ====================

/** 获取 Cookie 配置状态（脱敏） */
export const getCookieConfig = (): Promise<CookieConfigInfo> =>
    apiClient.get('/config/cookie').then((r) => r.data);

/**
 * 保存豆瓣 Cookie
 * 
 * POST /api/config/cookie
 * Body: { cookie: string, user_agent?: string }
 */
export const saveCookieConfig = (data: {
    cookie: string;
    user_agent?: string;
}): Promise<ApiResponse> =>
    apiClient.post('/config/cookie', data).then((r) => r.data);

/** 测试 Cookie 有效性 */
export const testCookieConfig = (): Promise<CookieTestResult> =>
    apiClient.post('/config/cookie/test').then((r) => r.data);

/** 清除 Cookie */
export const deleteCookieConfig = (): Promise<ApiResponse> =>
    apiClient.delete('/config/cookie').then((r) => r.data);

// ==================== 导入 API ====================

/**
 * 预览导入文件
 * 
 * POST /api/import/preview
 * Body: FormData { file: File }
 */
export const previewImport = (file: File): Promise<ImportPreview> => {
    const formData = new FormData();
    formData.append('file', file);

    return apiClient
        .post('/import/preview', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data);
};

/**
 * 启动批量导入任务
 * 
 * POST /api/import/start
 * Body: FormData { file, auto_sync, shelf_id }
 */
export const startImport = (
    file: File,
    options: ImportStartParams
): Promise<{ task_id: string; total: number; message: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    if (options.auto_sync !== undefined) {
        formData.append('auto_sync', String(options.auto_sync));
    }
    if (options.shelf_id) {
        formData.append('shelf_id', String(options.shelf_id));
    }

    return apiClient
        .post('/import/start', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data);
};

/** 查询导入任务进度 */
export const getImportStatus = (taskId: string): Promise<ImportTask> =>
    apiClient.get(`/import/status/${taskId}`).then((r) => r.data);

/** 取消正在进行的导入任务 */
export const cancelImportTask = (taskId: string): Promise<ApiResponse> =>
    apiClient.post(`/import/task/${taskId}/cancel`).then((r) => r.data);

/** 下载导入模板（Excel 格式） */
export const downloadImportTemplate = (): Promise<Blob> =>
    apiClient
        .get('/import/template', { responseType: 'blob' })
        .then((r) => r.data);

// ==================== 默认导出 ====================

export default {
    // 书架
    listShelves,
    createShelf,
    updateShelf,
    deleteShelf,
    getShelfBooks,
    addBookToShelf,
    removeBookFromShelf,
    moveBookToShelf,

    // 图书
    getBookDetail,
    getBookWall,
    syncBookByISBN,
    createBookManual,
    updateBookManual,
    searchBooks,
    deleteBook,

    // NFC
    writeNFCTag,
    readNFCTag,
    getNFCTasks,
    deleteNFCTask,

    // 管理
    getDashboardStats,
    getDashboardLogs,

    // 配置
    getCookieConfig,
    saveCookieConfig,
    testCookieConfig,
    deleteCookieConfig,

    // 导入
    previewImport,
    startImport,
    getImportStatus,
    cancelImportTask,
    downloadImportTemplate,
};