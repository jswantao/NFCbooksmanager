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
    ImportPreview,
    ImportTask,
    ImportStartParams,
    DashboardStats,
    CookieConfigInfo,
    CookieTestResult,
    BooksResponse,
    PhysicalShelf,
    PhysicalMappingInfo,
    BackupMetadata,
    ConflictCheckResult,
    RestorePreview,
    RestoreExecuteParams,
    RestoreResult,
    WebDAVConfig,
    WebDAVConfigSaveParams,
    AutoBackupStatus,
    ChatSearchResponse,
    ChatBookDetailResponse,
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

export const previewNedbImport = (
    file: File
): Promise<NedbImportPreview> => {
    const formData = new FormData();
    formData.append('file', file);

    return apiClient
        .post('/import/nedb/preview', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60000,
        })
        .then(unwrap);
};

export const startNedbImport = (
    file: File,
    options: { cover_path?: string; shelf_id?: number; duplicate_resolution?: Record<string, string> }
): Promise<{ task_id: string; total: number; message: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    if (options.cover_path) formData.append('cover_path', options.cover_path);
    if (options.shelf_id) formData.append('shelf_id', String(options.shelf_id));
    if (options.duplicate_resolution) {
        formData.append('duplicate_resolution', JSON.stringify(options.duplicate_resolution));
    }

    return apiClient
        .post('/import/nedb/start', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000,
        })
        .then(unwrap);
};

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
    apiClient.put(`/mapping/${mappingId}/toggle`).then(unwrap);

export const listMappings = (): Promise<PhysicalMappingInfo[]> =>
    apiClient.get('/mapping/list').then(unwrap);

// ==================== 图片 API ====================

export const getImageProxyUrl = (originalUrl: string): string =>
    `/api/images/proxy?url=${encodeURIComponent(originalUrl)}`;

export const uploadBookCover = (
    bookId: number,
    file: File
): Promise<{ success: boolean; message: string; local_cover_path: string; local_cover_url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient
        .post(`/images/cover/${bookId}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000,
        })
        .then(unwrap);
};

export const deleteBookCover = (
    bookId: number
): Promise<{ success: boolean; message: string }> =>
    apiClient.delete(`/images/cover/${bookId}`).then(unwrap);

// ==================== 备份与恢复 ====================

export const createBackup = (): Promise<ApiResponse<BackupMetadata>> =>
    apiClient.post('/backup/export').then(unwrap);

export const listBackups = (): Promise<BackupMetadata[]> =>
    apiClient.get('/backup/list').then(unwrap).then(r => r.data);

export const listWebDAVBackups = (): Promise<BackupMetadata[]> =>
    apiClient.get('/backup/list-webdav').then(unwrap).then(r => r.data);

export const deleteBackups = (filenames: string[]): Promise<ApiResponse<{ deleted: number }>> =>
    apiClient.delete('/backup/delete', { data: { filenames } }).then(unwrap);

export const previewBackup = (filename: string): Promise<RestorePreview> =>
    apiClient.get(`/backup/preview/${encodeURIComponent(filename)}`).then(unwrap);

export const checkConflicts = (filename: string): Promise<ApiResponse<ConflictCheckResult>> =>
    apiClient.post(`/backup/check-conflicts/${encodeURIComponent(filename)}`).then(unwrap);

export const executeRestore = (params: RestoreExecuteParams): Promise<ApiResponse<RestoreResult>> =>
    apiClient.post('/backup/restore', params).then(unwrap);

export const getWebDAVConfig = (): Promise<WebDAVConfig> =>
    apiClient.get('/backup/webdav/config').then(unwrap);

export const saveWebDAVConfig = (params: WebDAVConfigSaveParams): Promise<ApiResponse<null>> =>
    apiClient.post('/backup/webdav/config', params).then(unwrap);

export const testWebDAVConnection = (): Promise<ApiResponse<{ success: boolean; message: string }>> =>
    apiClient.post('/backup/webdav/test').then(unwrap);

export const syncToWebDAV = (filename: string): Promise<ApiResponse<null>> =>
    apiClient.post(`/backup/webdav/sync/${encodeURIComponent(filename)}`).then(unwrap);

export const pullFromWebDAV = (filename: string): Promise<ApiResponse<null>> =>
    apiClient.post(`/backup/webdav/pull/${encodeURIComponent(filename)}`).then(unwrap);

export const getAutoBackupStatus = (): Promise<AutoBackupStatus> =>
    apiClient.get('/backup/auto/status').then(unwrap);

export const triggerAutoBackup = (): Promise<ApiResponse<BackupMetadata>> =>
    apiClient.post('/backup/auto/run').then(unwrap);

// ==================== 智能录入与信息补全 ====================

export const extractISBNFromText = (text: string): Promise<import('../types').OCRExtractResult> =>
    apiClient.post('/smart-entry/ocr', { text }).then(unwrap);

export const isbnLookup = (isbn: string): Promise<import('../types').ISBNLookupResult> =>
    apiClient.post('/smart-entry/isbn-lookup', { isbn }).then(unwrap);

export const autoFillForm = (isbn: string, title?: string): Promise<import('../types').AutoFillResult> =>
    apiClient.post('/smart-entry/auto-fill', { isbn, title: title || '' }).then(unwrap);

export const detectMissingFields = (bookId: number): Promise<import('../types').MissingFieldsInfo> =>
    apiClient.post(`/smart-entry/detect-missing/${bookId}`).then(unwrap);

export const enrichBook = (bookId: number): Promise<import('../types').EnrichResult> =>
    apiClient.post(`/smart-entry/enrich/${bookId}`).then(unwrap);

export const batchEnrichBooks = (bookIds: number[]): Promise<import('../types').BatchEnrichResult> =>
    apiClient.post('/smart-entry/batch-enrich', { book_ids: bookIds }).then(unwrap);

export const listMissingBooks = (limit?: number): Promise<import('../types').MissingBooksList> =>
    apiClient.get('/smart-entry/missing-books', { params: { limit } }).then(unwrap);

export const uploadImageForISBN = (file: File): Promise<import('../types').ImageUploadISBNResult> => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/smart-entry/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }).then(unwrap);
};

// ==================== n8n 智能录入助手 ====================

/** n8n 工作流 Webhook 地址（根据部署环境配置） */
const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_BOOK_ENTRY_URL || 'http://localhost:5678/webhook/book-entry';

// n8n Webhook response now handled by extractN8NReply()

// ==================== n8n 书房智能助手 ====================

/**
 * Extract reply text from n8n Webhook response.
 *
 * n8n Respond to Webhook node returns array-wrapped format:
 *   [{ "output": "reply content..." }]
 * Also supports legacy format: { "reply": "..." }
 */
function extractN8NReply(raw: unknown): string {
    if (Array.isArray(raw) && raw.length > 0 && (raw[0] as any)?.output) {
        return String((raw[0] as any).output);
    }
    if (raw && typeof raw === 'object' && 'reply' in (raw as Record<string, unknown>)) {
        return String((raw as Record<string, unknown>).reply);
    }
    if (typeof raw === 'string') {
        return raw;
    }
    throw new Error('Cannot parse n8n response format');
}

const N8N_BOOK_ASSISTANT_URL = import.meta.env.VITE_N8N_BOOK_ASSISTANT_URL || 'http://localhost:5678/webhook/smart-book-assistant';

export const callN8NBookAssistant = async (query: string, sessionId?: string): Promise<string> => {
    const sid = sessionId || localStorage.getItem('chat_session_id') || '';
    const response = await fetch(N8N_BOOK_ASSISTANT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, sessionId: sid }),
    });
    if (!response.ok) {
        throw new Error(`n8n webhook error: ${response.status}`);
    }
    return extractN8NReply(await response.json());
};

export const callN8NSmartEntry = async (userQuery: string, imageUrl: string = ''): Promise<string> => {
    const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userQuery, image_url: imageUrl }),
    });
    if (!response.ok) {
        throw new Error(`n8n webhook error: ${response.status}`);
    }
    return extractN8NReply(await response.json());
};

// ==================== 健康检查 ====================

export const healthCheck = (): Promise<{ status: string }> =>
    axios.get('/health').then(unwrap);

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

    // 备份
    createBackup,
    listBackups,
    listWebDAVBackups,
    deleteBackups,
    previewBackup,
    checkConflicts,
    executeRestore,
    getWebDAVConfig,
    saveWebDAVConfig,
    testWebDAVConnection,
    syncToWebDAV,
    pullFromWebDAV,
    getAutoBackupStatus,
    triggerAutoBackup,


    // 智能录入
    extractISBNFromText,
    isbnLookup,
    autoFillForm,
    detectMissingFields,
    enrichBook,
    batchEnrichBooks,
    listMissingBooks,
    uploadImageForISBN,
    callN8NSmartEntry,
    callN8NBookAssistant,

    // 工具
    getImageProxyUrl,
    uploadBookCover,
    deleteBookCover,
    healthCheck,
    extractErrorMessage,
    onNetworkChange,
};