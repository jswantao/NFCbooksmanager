// services/api/adminApi.ts
// 管理后台相关 API 函数

import apiClient, { unwrap } from "./client";
import type { DashboardStats } from "../../types";

export const getDashboardStats = (): Promise<DashboardStats> =>
    apiClient.get("/admin/stats").then(unwrap);

export const getDashboardLogs = (params?: {
    action_type?: string;
    entity_type?: string;
    limit?: number;
    offset?: number;
}): Promise<{ logs: unknown[]; total: number }> =>
    apiClient.get("/admin/logs", { params }).then(unwrap);
