// services/api/index.ts
// API 模块统一导出

export { default as apiClient, unwrap, extractErrorMessage, onNetworkChange } from "./client";

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
} from "./bookApi";

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
} from "./shelfApi";

export {
    writeNFCTag,
    getNFCTasks,
    deleteNFCTask,
    getNFCMobileUrl,
} from "./nfcApi";

export {
    getDashboardStats,
    getDashboardLogs,
} from "./adminApi";

export {
    getCookieConfig,
    saveCookieConfig,
    testCookieConfig,
    deleteCookieConfig,
} from "./configApi";

export {
    previewImport,
    startImport,
    getImportStatus,
    cancelImportTask,
    downloadImportTemplate,
    previewNedbImport,
    startNedbImport,
} from "./importApi";

export {
    listPhysicalShelves,
    createPhysicalShelf,
    updatePhysicalShelf,
    deletePhysicalShelf,
    bindNFCTag,
    unbindNFCTag,
    getPhysicalShelfMappings,
} from "./physicalShelfApi";

export {
    createMapping,
    deleteMapping,
    listMappings,
} from "./mappingApi";

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
} from "./backupApi";

export {
    extractISBNFromText,
    isbnLookup,
    autoFillForm,
    detectMissingFields,
    enrichBook,
    batchEnrichBooks,
    listMissingBooks,
    uploadImageForISBN,
} from "./smartEntryApi";

export {
    chatSearch,
    chatGetBookDetail,
    callN8NSmartEntry,
    callN8NBookAssistant,
} from "./chatApi";
