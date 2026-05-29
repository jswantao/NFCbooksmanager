// services/api/physicalShelfApi.ts
// 物理书架相关 API 函数

import apiClient, { unwrap } from "./client";
import type { PhysicalShelf, PhysicalMappingInfo } from "../../types";

interface PhysicalShelvesResponse {
    shelves: PhysicalShelf[];
    total: number;
}

export const listPhysicalShelves = (params?: {
    search?: string;
    limit?: number;
    offset?: number;
}): Promise<PhysicalShelvesResponse> =>
    apiClient.get("/physical-shelves", { params }).then(unwrap);

export const createPhysicalShelf = (data: Record<string, unknown>): Promise<PhysicalShelf> =>
    apiClient.post("/physical-shelves", data).then(unwrap);

export const updatePhysicalShelf = (id: number, data: Record<string, unknown>): Promise<PhysicalShelf> =>
    apiClient.put(`/physical-shelves/${id}`, data).then(unwrap);

export const deletePhysicalShelf = (id: number): Promise<void> =>
    apiClient.delete(`/physical-shelves/${id}`).then(unwrap);

export const bindNFCTag = (shelfId: number, tagUid: string): Promise<PhysicalShelf> =>
    apiClient.post(`/physical-shelves/${shelfId}/bind-nfc`, { tag_uid: tagUid }).then(unwrap);

export const unbindNFCTag = (shelfId: number): Promise<PhysicalShelf> =>
    apiClient.post(`/physical-shelves/${shelfId}/unbind-nfc`).then(unwrap);

export const getPhysicalShelfMappings = (shelfId: number): Promise<PhysicalMappingInfo[]> =>
    apiClient.get(`/physical-shelves/${shelfId}/mappings`).then(unwrap);
