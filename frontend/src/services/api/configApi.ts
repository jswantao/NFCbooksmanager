// services/api/configApi.ts
// 配置相关 API 函数

import apiClient, { unwrap } from "./client";
import type { CookieConfigInfo, CookieTestResult } from "../../types";

export const getCookieConfig = (): Promise<CookieConfigInfo> =>
    apiClient.get("/config/cookie").then(unwrap);

export const saveCookieConfig = (cookie: string): Promise<void> =>
    apiClient.post("/config/cookie", { cookie }).then(unwrap);

export const testCookieConfig = (): Promise<CookieTestResult> =>
    apiClient.post("/config/cookie/test").then(unwrap);

export const deleteCookieConfig = (): Promise<void> =>
    apiClient.delete("/config/cookie").then(unwrap);
