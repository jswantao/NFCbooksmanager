// services/api/mappingApi.ts
// 物理-逻辑书架映射相关 API 函数

import apiClient, { unwrap } from "./client";

export const createMapping = (physicalShelfId: number, logicalShelfId: number): Promise<unknown> =>
    apiClient.post("/mapping", {
        physical_shelf_id: physicalShelfId,
        logical_shelf_id: logicalShelfId,
    }).then(unwrap);

export const deleteMapping = (mappingId: number): Promise<void> =>
    apiClient.delete(`/mapping/${mappingId}`).then(unwrap);

export const listMappings = (): Promise<unknown[]> =>
    apiClient.get("/mapping").then(unwrap);
