// services/api/client.ts
/**
 * 核心 Axios 实例、拦截器、通用工具函数
 *
 * P2 优化：移除 inFlightRequests Map 手动去重，
 * 请求去重与缓存由 hooks/useQueryCache.ts 统一管理。
 */

import axios, {
    type AxiosResponse,
    type AxiosError,
    type AxiosRequestConfig,
} from "axios";

const ERROR_MESSAGES: Record<number, string> = {
    400: "请求参数错误", 401: "未授权访问", 403: "禁止访问",
    404: "请求的资源不存在", 409: "资源冲突", 422: "请求参数格式错误",
    429: "请求过于频繁，请稍后再试", 500: "服务器内部错误",
    502: "网关错误", 503: "服务暂时不可用", 504: "网关超时",
};

interface EnhancedAxiosError extends AxiosError {
    userMessage?: string;
}

const API_BASE_URL = "/api";
const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 2;

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: DEFAULT_TIMEOUT,
    headers: { "Content-Type": "application/json" },
});

// ==================== 请求拦截器 (轻量化) ====================

apiClient.interceptors.request.use(
    (config) => {
        if (import.meta.env.DEV) {
            console.debug(
                `[API] ${config.method?.toUpperCase()} ${config.url}`,
                config.params || config.data || ""
            );
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// ==================== 响应拦截器 ====================

apiClient.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: EnhancedAxiosError) => {
        if (axios.isCancel(error)) return Promise.reject(error);

        const config = error.config as AxiosRequestConfig & { _retry?: number };
        const retryCount = config?._retry || 0;

        if (
            retryCount < MAX_RETRIES &&
            config &&
            (error.response?.status === undefined || error.response?.status >= 500)
        ) {
            config._retry = retryCount + 1;
            const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 10000);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            return apiClient(config);
        }

        error.userMessage = extractErrorMessage(error);
        return Promise.reject(error);
    }
);

// ==================== 通用工具函数 ====================

export function unwrap<T>(response: AxiosResponse): T {
    const body = response.data;
    if (body && typeof body === "object" && "code" in body && "data" in body) {
        if (body.code !== 0 && body.code !== undefined) {
            const err = new Error(body.message || "操作失败") as Error & { code: number };
            err.code = body.code;
            throw err;
        }
        return body.data as T;
    }
    return body as T;
}

export function extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        if ("userMessage" in error && error.userMessage) {
            return (error as EnhancedAxiosError).userMessage!;
        }
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            if (status && ERROR_MESSAGES[status]) return ERROR_MESSAGES[status];
            if (error.response?.data?.message) return error.response.data.message;
            if (error.message === "Network Error") return "网络连接异常，请检查网络";
        }
        if ("code" in error && typeof error.code === "number") return error.message || "操作失败";
        return error.message || "未知错误";
    }
    if (typeof error === "string") return error;
    return "未知错误";
}

export function onNetworkChange(callback: (online: boolean) => void): () => void {
    const handler = () => callback(navigator.onLine);
    window.addEventListener("online", handler);
    window.addEventListener("offline", handler);
    return () => {
        window.removeEventListener("online", handler);
        window.removeEventListener("offline", handler);
    };
}

export default apiClient;
