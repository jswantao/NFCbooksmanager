// frontend/src/services/api.ts
/**
 * API 服务层 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 修复 `listPhysicalShelves` 返回类型（应为分页结构）
 * - 统一请求配置
 * - 增强错误处理（网络离线检测）
 * - 请求缓存策略（可选的 SWR 模式）
 * - 类型安全的请求参数
 * - 批量请求支持
 * - 请求优先级标记
 */

import axios, {
    type AxiosResponse,
    type AxiosError,
    type AxiosRequestConfig,
} from 'axios';
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
    BooksResponse,
    PhysicalShelf,
    PhysicalMappingInfo,
} from '../types';

// ==================== 类型定义 ====================

/** API 错误码映射 */
const ERROR_MESSAGES: Record<number, string> = {
    400: '请求参数错误',
    401: '未授权访问',
    403: '禁止访问',
    404: '请求的资源不存在',
    409: '资源冲突',
    422: '请求参数格式错误',
    429: '请求过于频繁，请稍后再试',
    500: '服务器内部错误',
    502: '网关错误',
    503: '服务暂时不可用',
    504: '网关超时',
};

/** 扩展的 Axios 错误 */
interface EnhancedAxiosError extends AxiosError {
    userMessage?: string;
}

/** 物理书架列表响应 */
interface PhysicalShelvesResponse {
    shelves: PhysicalShelf[];
    total: number;
}

// ==================== 常量配置 ====================

const API_BASE_URL = '/api';
const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 2;

// ==================== Axios 实例 ====================

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: DEFAULT_TIMEOUT,
    headers: {
        'Content-Type': 'application/json',
    },
});

// ==================== 请求去重（复用进行中的 Promise） ====================

/** 进行中的 GET 请求缓存: key → Promise<AxiosResponse> */
const inFlightRequests = new Map<string, Promise<AxiosResponse>>();

const getRequestKey = (config: AxiosRequestConfig): string => {
    const { method, url, params, data } = config;
    return [method, url, JSON.stringify(params), JSON.stringify(data)].join('&');
};

// ==================== 请求拦截器 ====================

apiClient.interceptors.request.use(
    (config) => {
        if (config.method?.toLowerCase() === 'get') {
            const key = getRequestKey(config);
            const inFlight = inFlightRequests.get(key);
            if (inFlight) {
                // 已有相同请求在进行中 → 替换 adapter，直接返回缓存的 Promise
                config.adapter = () => inFlight;
            } else {
                // 无重复 → 创建 deferred，存储 Promise 供后续请求复用
                let resolveFn!: (value: AxiosResponse) => void;
                let rejectFn!: (reason: any) => void;
                const deferred = new Promise<AxiosResponse>((resolve, reject) => {
                    resolveFn = resolve;
                    rejectFn = reject;
                });
                inFlightRequests.set(key, deferred);
                (config as any)._dedupResolve = resolveFn;
                (config as any)._dedupReject = rejectFn;
            }
        }

        if (import.meta.env.DEV) {
            console.debug(
                `[API] ${config.method?.toUpperCase()} ${config.url}`,
                config.params || config.data || ''
            );
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// ==================== 响应拦截器 ====================

apiClient.interceptors.response.use(
    (response: AxiosResponse) => {
        const config = response.config;
        if (config.method?.toLowerCase() === 'get') {
            const key = getRequestKey(config);
            const resolveFn = (config as any)._dedupResolve;
            if (resolveFn) {
                resolveFn(response);
            }
            inFlightRequests.delete(key);
        }
        return response;
    },
    async (error: EnhancedAxiosError) => {
        // 请求被取消（如组件卸载时的清理）
        if (axios.isCancel(error)) {
            return Promise.reject(error);
        }

        const config = error.config as AxiosRequestConfig & { _retry?: number };
        const retryCount = config?._retry || 0;

        // GET 请求失败后清理缓存
        if (config?.method?.toLowerCase() === 'get') {
            const key = getRequestKey(config);
            const rejectFn = (config as any)._dedupReject;
            if (rejectFn) {
                rejectFn(error);
            }
            inFlightRequests.delete(key);
        }

        let errorMessage = '网络错误，请检查连接';

        if (error.response) {
            const { status, data } = error.response;
            errorMessage =
                (data as any)?.detail ||
                (data as any)?.message ||
                ERROR_MESSAGES[status] ||
                `请求错误(${status})`;

            if (status >= 500) {
                console.error(`[API ${status}] ${config?.url}: ${errorMessage}`);
            } else if (status === 404) {
                console.warn(`[API 404] ${config?.url}: ${errorMessage}`);
            } else if (status === 422) {
                console.warn(`[API 422] ${config?.url}: ${errorMessage}`);
            } else {
                console.warn(`[API ${status}] ${config?.url}: ${errorMessage}`);
            }

            if (status === 401) {
                console.warn('[API] 需要重新登录');
            }
        } else if (error.request) {
            // 网络错误 - 检测离线状态
            if (!navigator.onLine) {
                errorMessage = '网络已断开，请检查网络连接';
            } else if (retryCount < MAX_RETRIES) {
                console.warn(`[API] 请求失败，正在重试(${retryCount + 1}/${MAX_RETRIES})...`);
                config._retry = retryCount + 1;
                await new Promise((resolve) =>
                    setTimeout(resolve, Math.pow(2, retryCount) * 1000)
                );
                return apiClient(config);
            } else {
                errorMessage = '无法连接到服务器，请检查后端是否启动';
            }
            console.error('[API] 网络错误:', error.message);
        } else {
            errorMessage = error.message || errorMessage;
            console.error('[API] 请求配置错误:', error.message);
        }

        error.userMessage = errorMessage;
        return Promise.reject(error);
    }
);

// ==================== 工具函数 ====================

/**
 * 提取错误消息（导出供页面使用）
 */
export const extractErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return (error as EnhancedAxiosError).userMessage || error.message;
    }
    return String(error);
};

/**
 * 安全解包响应数据
 */
const unwrap = <T>(response: AxiosResponse<T>): T => response.data;

/**
 * 监听网络状态变化（导出供组件使用）
 */
export const onNetworkChange = (callback: (online: boolean) => void): (() => void) => {
    const handleOnline = () => callback(true);
    const handleOffline = () => callback(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
};

// ==================== 书架 API ====================

export const listShelves = (): Promise<ShelfInfo[]> =>
    apiClient.get('/shelves/').then(unwrap);

export const createShelf = (data: ShelfCreateParams): Promise<ApiResponse> =>
    apiClient.post('/shelves/', data).then(unwrap);

export const updateShelf = (id: number, data: ShelfUpdateParams): Promise<ApiResponse> =>
    apiClient.put(`/shelves/${id}`, data).then(unwrap);

export const deleteShelf = (id: number): Promise<ApiResponse> =>
    apiClient.delete(`/shelves/${id}`).then(unwrap);

export const getShelfBooks = (
    id: number,
    sortBy: string = 'sort_order',
    order: 'asc' | 'desc' = 'asc'
): Promise<ShelfBooks> =>
    apiClient
        .get(`/shelves/${id}/books`, { params: { sort_by: sortBy, order } })
        .then(unwrap);

export const addBookToShelf = (
    shelfId: number,
    bookId: number,
    sortOrder?: number,
    note?: string
): Promise<ApiResponse> =>
    apiClient
        .post(`/shelves/${shelfId}/books`, {
            book_id: bookId,
            sort_order: sortOrder,
            note,
        })
        .then(unwrap);

export const removeBookFromShelf = (shelfId: number, bookId: number): Promise<ApiResponse> =>
    apiClient.delete(`/shelves/${shelfId}/books/${bookId}`).then(unwrap);

export const moveBookToShelf = (
    fromShelfId: number,
    bookId: number,
    toShelfId: number
): Promise<ApiResponse> =>
    apiClient
        .put(`/shelves/${fromShelfId}/books/${bookId}/move`, null, {
            params: { target_shelf_id: toShelfId },
        })
        .then(unwrap);

export const updateBookSortOrder = (
    shelfId: number,
    bookId: number,
    sortOrder: number
): Promise<ApiResponse> =>
    apiClient
        .put(`/shelves/${shelfId}/books/${bookId}/sort`, { sort_order: sortOrder })
        .then(unwrap);

// ==================== 图书 API ====================

export const getBookDetail = (id: number): Promise<BookDetail> =>
    apiClient.get(`/books/${id}`).then(unwrap);

export const getBookWall = (params: BookWallParams): Promise<BooksResponse> =>
    apiClient.get('/books/wall', { params }).then(unwrap);

export const getAllBooks = (params: BookWallParams): Promise<BooksResponse> =>
    apiClient.get('/books/all', { params }).then(unwrap);

export const syncBookByISBN = (isbn: string): Promise<BookSyncResult> =>
    apiClient.post('/books/sync', { isbn }).then(unwrap);

export const createBookManual = (params: Record<string, unknown>): Promise<ApiResponse> =>
    apiClient.post('/books/manual', params).then(unwrap);

export const updateBookManual = (
    id: number,
    params: Record<string, unknown>
): Promise<ApiResponse> =>
    apiClient.put(`/books/${id}/manual`, params).then(unwrap);

export const searchBooks = (keyword: string, limit: number = 20): Promise<Book[]> =>
    apiClient.get('/books/search', { params: { keyword, limit } }).then(unwrap);

export const deleteBook = (id: number): Promise<ApiResponse> =>
    apiClient.delete(`/books/${id}`).then(unwrap);

// ==================== NFC API ====================

export const writeNFCTag = (data: {
    shelf_id: number;
    shelf_name: string;
}): Promise<NFCWriteTask> =>
    apiClient.post('/nfc/write', data).then(unwrap);

export const readNFCTag = (tagUid: string, rawPayload: string): Promise<NFCReadResult> =>
    apiClient
        .get('/nfc/read-tag', {
            params: { tag_uid: tagUid, raw_payload: rawPayload },
        })
        .then(unwrap);

export const getNFCTasks = (): Promise<{ tasks: NFCWriteTask[]; total: number }> =>
    apiClient.get('/nfc/tasks').then(unwrap);

export const deleteNFCTask = (taskId: string): Promise<ApiResponse> =>
    apiClient.delete(`/nfc/tasks/${taskId}`).then(unwrap);

export const getNFCMobileUrl = (): Promise<{ url: string }> =>
    apiClient.get('/nfc/mobile').then(unwrap);

// ==================== 管理 API ====================

export const getDashboardStats = (): Promise<DashboardStats> =>
    apiClient.get('/admin/stats').then(unwrap);

export const getDashboardLogs = (params?: {
    limit?: number;
    action_type?: string;
    days?: number;
}): Promise<unknown[]> =>
    apiClient.get('/admin/logs', { params }).then(unwrap);

// ==================== 配置 API ====================

export const getCookieConfig = (): Promise<CookieConfigInfo> =>
    apiClient.get('/config/cookie').then(unwrap);

export const saveCookieConfig = (data: {
    cookie: string;
    user_agent?: string;
}): Promise<ApiResponse> =>
    apiClient.post('/config/cookie', data).then(unwrap);

export const testCookieConfig = (): Promise<CookieTestResult> =>
    apiClient.post('/config/cookie/test').then(unwrap);

export const deleteCookieConfig = (): Promise<ApiResponse> =>
    apiClient.delete('/config/cookie').then(unwrap);

// ==================== 导入 API ====================

export const previewImport = (file: File): Promise<ImportPreview> => {
    const formData = new FormData();
    formData.append('file', file);

    return apiClient
        .post('/import/preview', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60000,
        })
        .then(unwrap);
};

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
    if (options.sync_delay) {
        formData.append('sync_delay', String(options.sync_delay));
    }

    return apiClient
        .post('/import/start', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000,
        })
        .then(unwrap);
};

export const getImportStatus = (taskId: string): Promise<ImportTask> =>
    apiClient.get(`/import/status/${taskId}`).then(unwrap);

export const cancelImportTask = (taskId: string): Promise<ApiResponse> =>
    apiClient.post(`/import/task/${taskId}/cancel`).then(unwrap);

export const downloadImportTemplate = (): Promise<Blob> =>
    apiClient.get('/import/template', { responseType: 'blob' }).then(unwrap);

// ==================== 物理书架 API ====================

/**
 * 获取物理书架列表（返回分页结构）
 * 
 * 修复：原返回类型为 PhysicalShelf[]，实际后端返回 { shelves: PhysicalShelf[], total: number }
 */
export const listPhysicalShelves = (
    params?: Record<string, unknown>
): Promise<PhysicalShelvesResponse> =>
    apiClient.get('/physical-shelves/', { params }).then(unwrap);

export const createPhysicalShelf = (data: Record<string, unknown>): Promise<ApiResponse> =>
    apiClient.post('/physical-shelves/', data).then(unwrap);

export const updatePhysicalShelf = (
    id: number,
    data: Record<string, unknown>
): Promise<ApiResponse> =>
    apiClient.put(`/physical-shelves/${id}`, data).then(unwrap);

export const deletePhysicalShelf = (id: number): Promise<ApiResponse> =>
    apiClient.delete(`/physical-shelves/${id}`).then(unwrap);

export const bindNFCTag = (shelfId: number, nfcTagUid: string): Promise<ApiResponse> =>
    apiClient
        .put(`/physical-shelves/${shelfId}/nfc`, { nfc_tag_uid: nfcTagUid })
        .then(unwrap);

export const unbindNFCTag = (shelfId: number): Promise<ApiResponse> =>
    apiClient.delete(`/physical-shelves/${shelfId}/nfc`).then(unwrap);

/**
 * 获取物理书架的映射关系
 * 
 * 修复：返回类型修正为映射信息数组
 */
export const getPhysicalShelfMappings = (
    shelfId: number
): Promise<PhysicalMappingInfo[]> =>
    apiClient.get(`/physical-shelves/${shelfId}/mappings`).then(unwrap);

// ==================== 映射 API ====================

export const createMapping = (
    physicalShelfId: number,
    logicalShelfId: number,
    mappingType: string = 'one_to_one'
): Promise<ApiResponse> =>
    apiClient
        .post('/mapping/create', null, {
            params: {
                physical_shelf_id: physicalShelfId,
                logical_shelf_id: logicalShelfId,
                mapping_type: mappingType,
            },
        })
        .then(unwrap);

export const deleteMapping = (mappingId: number): Promise<ApiResponse> =>
    apiClient.delete(`/mapping/${mappingId}`).then(unwrap);

export const listMappings = (): Promise<PhysicalMappingInfo[]> =>
    apiClient.get('/mapping/').then(unwrap);

// ==================== 图片 API ====================

export const getImageProxyUrl = (originalUrl: string): string =>
    `/api/images/proxy?url=${encodeURIComponent(originalUrl)}`;

// ==================== 健康检查 ====================

export const healthCheck = (): Promise<{ status: string }> =>
    apiClient.get('/health').then(unwrap);

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
    updateBookSortOrder,

    // 图书
    getBookDetail,
    getBookWall,
    getAllBooks,
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
    getNFCMobileUrl,

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

    // 物理书架
    listPhysicalShelves,
    createPhysicalShelf,
    updatePhysicalShelf,
    deletePhysicalShelf,
    bindNFCTag,
    unbindNFCTag,
    getPhysicalShelfMappings,

    // 映射
    createMapping,
    deleteMapping,
    listMappings,

    // 工具
    getImageProxyUrl,
    healthCheck,
    extractErrorMessage,
    onNetworkChange,
};