// frontend/src/services/api.ts
/**
 * API 服务层 - React 19 + Ant Design 6
 *
 * 重构说明：
 * - 核心客户端已拆分至 api/client.ts
 * - 各业务域 API 函数已拆分至 api/{domain}Api.ts
 * - 本文件保留所有导出以维持向后兼容
 * - 新代码建议直接从 "@services/api/{domain}Api" 导入
 */

import axios from "axios";

// ==================== 核心客户端（本地导入 + 导出） ====================
import { unwrap, extractErrorMessage, onNetworkChange, default as apiClient } from "./api/client";
export { unwrap, extractErrorMessage, onNetworkChange, apiClient };

// ==================== 图书 ====================
import {
    searchBooks,
    getBookDetail,
    getBookWall,
    getAllBooks,
    getAllBooksFlat,
    syncBookByISBN,
    createBookManual,
    updateBookManual,
    deleteBook,
    getImageProxyUrl,
    uploadBookCover,
    deleteBookCover,
} from "./api/bookApi";
export {
    searchBooks,
    getBookDetail,
    getBookWall,
    getAllBooks,
    getAllBooksFlat,
    syncBookByISBN,
    createBookManual,
    updateBookManual,
    deleteBook,
    getImageProxyUrl,
    uploadBookCover,
    deleteBookCover,
};

// ==================== 书架 ====================
import {
    listShelves,
    createShelf,
    updateShelf,
    deleteShelf,
    getShelfBooks,
    addBookToShelf,
    removeBookFromShelf,
    moveBookToShelf,
    updateBookSortOrder,
} from "./api/shelfApi";
export {
    listShelves,
    createShelf,
    updateShelf,
    deleteShelf,
    getShelfBooks,
    addBookToShelf,
    removeBookFromShelf,
    moveBookToShelf,
    updateBookSortOrder,
};

// ==================== NFC ====================
import {
    writeNFCTag,
    getNFCTasks,
    deleteNFCTask,
    getNFCMobileUrl,
} from "./api/nfcApi";
export { writeNFCTag, getNFCTasks, deleteNFCTask, getNFCMobileUrl };

// ==================== 管理 ====================
import { getDashboardStats, getDashboardLogs } from "./api/adminApi";
export { getDashboardStats, getDashboardLogs };

// ==================== 配置 ====================
import { getCookieConfig, saveCookieConfig, testCookieConfig, deleteCookieConfig } from "./api/configApi";
export { getCookieConfig, saveCookieConfig, testCookieConfig, deleteCookieConfig };

// ==================== 导入 ====================
import {
    previewImport,
    startImport,
    getImportStatus,
    cancelImportTask,
    downloadImportTemplate,
    previewNedbImport,
    startNedbImport,
} from "./api/importApi";
export {
    previewImport,
    startImport,
    getImportStatus,
    cancelImportTask,
    downloadImportTemplate,
    previewNedbImport,
    startNedbImport,
};

// ==================== 物理书架 ====================
import {
    listPhysicalShelves,
    createPhysicalShelf,
    updatePhysicalShelf,
    deletePhysicalShelf,
    bindNFCTag,
    unbindNFCTag,
    getPhysicalShelfMappings,
} from "./api/physicalShelfApi";
export {
    listPhysicalShelves,
    createPhysicalShelf,
    updatePhysicalShelf,
    deletePhysicalShelf,
    bindNFCTag,
    unbindNFCTag,
    getPhysicalShelfMappings,
};

// ==================== 映射 ====================
import { createMapping, deleteMapping, listMappings } from "./api/mappingApi";
export { createMapping, deleteMapping, listMappings };

// ==================== 备份 ====================
import {
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
} from "./api/backupApi";
export {
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
};

// ==================== 智能录入 ====================
import {
    extractISBNFromText,
    isbnLookup,
    autoFillForm,
    detectMissingFields,
    enrichBook,
    batchEnrichBooks,
    listMissingBooks,
    uploadImageForISBN,
} from "./api/smartEntryApi";
export {
    extractISBNFromText,
    isbnLookup,
    autoFillForm,
    detectMissingFields,
    enrichBook,
    batchEnrichBooks,
    listMissingBooks,
    uploadImageForISBN,
};

// ==================== AI 对话 ====================
import { chatSearch, chatGetBookDetail, callN8NSmartEntry, callN8NBookAssistant } from "./api/chatApi";
export { chatSearch, chatGetBookDetail, callN8NSmartEntry, callN8NBookAssistant };

// ==================== 健康检查 ====================
export const healthCheck = (): Promise<{ status: string }> =>
    axios.get("/health").then(unwrap);

// ==================== 默认导出（向后兼容） ====================
export default {
    listShelves, createShelf, updateShelf, deleteShelf,
    getShelfBooks, addBookToShelf, removeBookFromShelf, moveBookToShelf, updateBookSortOrder,
    getBookDetail, getBookWall, getAllBooks, syncBookByISBN,
    createBookManual, updateBookManual, searchBooks, deleteBook,
    writeNFCTag, getNFCTasks, deleteNFCTask, getNFCMobileUrl,
    getDashboardStats, getDashboardLogs,
    getCookieConfig, saveCookieConfig, testCookieConfig, deleteCookieConfig,
    previewImport, startImport, getImportStatus, cancelImportTask, downloadImportTemplate,
    listPhysicalShelves, createPhysicalShelf, updatePhysicalShelf, deletePhysicalShelf,
    bindNFCTag, unbindNFCTag, getPhysicalShelfMappings,
    createMapping, deleteMapping, listMappings,
    createBackup, listBackups, listWebDAVBackups, deleteBackups,
    previewBackup, checkConflicts, executeRestore,
    getWebDAVConfig, saveWebDAVConfig, testWebDAVConnection,
    syncToWebDAV, pullFromWebDAV, getAutoBackupStatus, triggerAutoBackup,
    extractISBNFromText, isbnLookup, autoFillForm, detectMissingFields,
    enrichBook, batchEnrichBooks, listMissingBooks, uploadImageForISBN,
    callN8NSmartEntry, callN8NBookAssistant,
    getImageProxyUrl, uploadBookCover, deleteBookCover,
    healthCheck, extractErrorMessage, onNetworkChange,
} as const;
