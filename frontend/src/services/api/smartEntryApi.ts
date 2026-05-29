// services/api/smartEntryApi.ts
// 智能录入相关 API 函数

import apiClient, { unwrap } from "./client";
import type {
    ISBNLookupResult,
    AutoFillResult,
    MissingFieldsInfo,
    EnrichResult,
    BatchEnrichResult,
    MissingBooksList,
    ImageUploadISBNResult,
} from "../../types";

export const extractISBNFromText = (text: string): Promise<{ isbn: string }> =>
    apiClient.post("/smart-entry/extract-isbn", { text }).then(unwrap);

export const isbnLookup = (isbn: string): Promise<ISBNLookupResult> =>
    apiClient.get(`/smart-entry/lookup/${isbn}`).then(unwrap);

export const autoFillForm = (isbn: string): Promise<AutoFillResult> =>
    apiClient.post("/smart-entry/auto-fill", { isbn }).then(unwrap);

export const detectMissingFields = (bookId: number): Promise<MissingFieldsInfo> =>
    apiClient.get(`/smart-entry/detect-missing/${bookId}`).then(unwrap);

export const enrichBook = (bookId: number): Promise<EnrichResult> =>
    apiClient.post(`/smart-entry/enrich/${bookId}`).then(unwrap);

export const batchEnrichBooks = (bookIds: number[]): Promise<BatchEnrichResult> =>
    apiClient.post("/smart-entry/batch-enrich", { book_ids: bookIds }).then(unwrap);

export const listMissingBooks = (limit?: number): Promise<MissingBooksList> =>
    apiClient.get("/smart-entry/missing-books", { params: { limit } }).then(unwrap);

export const uploadImageForISBN = (file: File): Promise<ImageUploadISBNResult> => {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient.post("/smart-entry/upload-image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
    }).then(unwrap);
};
