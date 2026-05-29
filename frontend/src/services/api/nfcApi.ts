// services/api/nfcApi.ts
// NFC 标签相关 API 函数

import apiClient, { unwrap } from "./client";
import type { NFCWriteTask } from "../../types";

export const writeNFCTag = (shelfId: number): Promise<NFCWriteTask> =>
    apiClient.post("/nfc/write", { shelf_id: shelfId }).then(unwrap);

export const getNFCTasks = (): Promise<NFCWriteTask[]> =>
    apiClient.get("/nfc/tasks").then(unwrap);

export const deleteNFCTask = (taskId: string): Promise<void> =>
    apiClient.delete(`/nfc/tasks/${taskId}`).then(unwrap);

export const getNFCMobileUrl = (): Promise<{ url: string }> =>
    apiClient.get("/nfc/mobile-url").then(unwrap);
