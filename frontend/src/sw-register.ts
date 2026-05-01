// frontend/src/sw-register.ts
/**
 * Service Worker 注册与管理模块 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 完整的类型定义
 * - 事件驱动的更新通知
 * - 可配置的更新策略
 * - 调试模式支持
 * - 更好的错误恢复
 */

// ==================== 类型定义 ====================

/** Service Worker 状态 */
export type SWStatus = 'unsupported' | 'registered' | 'updated' | 'error' | 'offline';

/** 更新策略 */
export type SWUpdateStrategy = 'immediate' | 'idle' | 'manual';

/** SW 配置选项 */
export interface SWOptions {
    /** SW 脚本路径 */
    swUrl?: string;
    /** 注册范围 */
    scope?: string;
    /** 更新策略 */
    updateStrategy?: SWUpdateStrategy;
    /** 更新检查间隔（分钟），0 表示不自动检查 */
    updateInterval?: number;
    /** 是否启用调试日志 */
    debug?: boolean;
    /** 注册成功回调 */
    onSuccess?: (registration: ServiceWorkerRegistration) => void;
    /** 检测到更新回调 */
    onUpdate?: (registration: ServiceWorkerRegistration) => void;
    /** 注册失败回调 */
    onError?: (error: Error) => void;
    /** 状态变化回调 */
    onStatusChange?: (status: SWStatus) => void;
}

/** 缓存统计信息 */
export interface CacheStats {
    caches: Record<string, number>;
    total: number;
}

/** SW 事件类型 */
export type SWEventType = 'registered' | 'updated' | 'error' | 'offline' | 'online';

/** SW 事件监听器 */
type SWEventListener = (data?: unknown) => void;

// ==================== SW 管理器类 ====================

class ServiceWorkerManager {
    private registration: ServiceWorkerRegistration | null = null;
    private status: SWStatus = 'unsupported';
    private options: Required<SWOptions>;
    private listeners: Map<SWEventType, Set<SWEventListener>> = new Map();
    private updateTimer: ReturnType<typeof setInterval> | null = null;
    private isUpdating = false;

    constructor(options: SWOptions = {}) {
        this.options = {
            swUrl: '/sw.js',
            scope: '/',
            updateStrategy: 'idle',
            updateInterval: 60,
            debug: import.meta.env.DEV,
            onSuccess: options.onSuccess ?? (() => {}),
            onUpdate: options.onUpdate ?? (() => {}),
            onError: options.onError ?? (() => {}),
            onStatusChange: options.onStatusChange ?? (() => {}),
        };
    }

    // ==================== 公共 API ====================

    /** 获取当前状态 */
    getStatus(): SWStatus {
        return this.status;
    }

    /** 获取 Service Worker 注册对象 */
    getRegistration(): ServiceWorkerRegistration | null {
        return this.registration;
    }

    /** 检查是否支持 */
    isSupported(): boolean {
        return 'serviceWorker' in navigator;
    }

    /** 是否有待处理的更新 */
    hasPendingUpdate(): boolean {
        return this.status === 'updated';
    }

    /** 检查网络状态 */
    isOnline(): boolean {
        return navigator.onLine;
    }

    // ==================== 注册与更新 ====================

    /** 注册 Service Worker */
    async register(): Promise<ServiceWorkerRegistration | null> {
        if (!this.isSupported()) {
            this.log('浏览器不支持 Service Worker');
            this.setStatus('unsupported');
            return null;
        }

        const { swUrl, scope } = this.options;

        // 仅在 HTTPS 或 localhost 下注册
        if (!this.canRegister()) {
            this.log('非安全上下文，跳过注册');
            this.setStatus('unsupported');
            return null;
        }

        try {
            this.log('正在注册 Service Worker...');

            const registration = await navigator.serviceWorker.register(swUrl, {
                scope,
                updateViaCache: 'none',
            });

            this.registration = registration;
            this.setStatus('registered');
            this.options.onSuccess(registration);
            this.emit('registered', registration);

            // 监听更新
            this.setupUpdateListener(registration);

            // 设置定期检查
            this.setupUpdateInterval();

            // 监听控制器变化
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                this.log('Service Worker 已接管页面');
                if (this.options.updateStrategy === 'immediate') {
                    window.location.reload();
                }
            });

            this.log('注册成功');
            return registration;

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.log('注册失败:', err.message);
            this.setStatus('error');
            this.options.onError(err);
            this.emit('error', err);
            return null;
        }
    }

    /** 手动检查更新 */
    async checkForUpdate(): Promise<boolean> {
        if (!this.registration) return false;

        try {
            this.log('检查更新...');
            await this.registration.update();
            return this.status === 'updated';
        } catch (error) {
            this.log('更新检查失败:', error);
            return false;
        }
    }

    /** 应用更新 */
    async applyUpdate(): Promise<void> {
        if (this.status !== 'updated') return;

        this.log('应用更新...');

        const registration = this.registration;
        if (!registration?.waiting) return;

        // 发送 skipWaiting 消息
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });

        // 等待新 SW 接管控制后刷新
        return new Promise((resolve) => {
            const onControllerChange = () => {
                navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
                window.location.reload();
                resolve();
            };

            navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, { once: true });

            // 超时保护（5 秒后强制刷新）
            setTimeout(() => {
                navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
                window.location.reload();
                resolve();
            }, 5000);
        });
    }

    /** 注销 Service Worker */
    async unregister(): Promise<boolean> {
        if (!this.registration) return false;

        try {
            const success = await this.registration.unregister();
            if (success) {
                this.log('已注销 Service Worker');
                this.registration = null;
                this.setStatus('unsupported');
                this.clearUpdateInterval();
            }
            return success;
        } catch (error) {
            this.log('注销失败:', error);
            return false;
        }
    }

    // ==================== 缓存管理 ====================

    /** 清除所有缓存 */
    async clearAllCache(): Promise<boolean> {
        if (!navigator.serviceWorker.controller) {
            this.log('无激活的 Service Worker 控制器');
            return false;
        }

        try {
            return await this.postMessageWithResponse<boolean>(
                { type: 'CLEAR_CACHE' },
                5000,
                false
            );
        } catch {
            return false;
        }
    }

    /** 获取缓存统计 */
    async getCacheStats(): Promise<CacheStats | null> {
        if (!navigator.serviceWorker.controller) return null;

        try {
            return await this.postMessageWithResponse<CacheStats>(
                { type: 'GET_CACHE_STATS' },
                5000,
                null
            );
        } catch {
            return null;
        }
    }

    // ==================== 推送通知 ====================

    /** 请求通知权限 */
    async requestNotificationPermission(): Promise<NotificationPermission> {
        if (!('Notification' in window)) return 'denied';

        try {
            const permission = await Notification.requestPermission();
            this.log('通知权限:', permission);
            return permission;
        } catch {
            return 'denied';
        }
    }

    /** 获取通知权限状态 */
    getNotificationPermission(): NotificationPermission {
        if (!('Notification' in window)) return 'denied';
        return Notification.permission;
    }

    // ==================== 事件监听 ====================

    /** 添加事件监听器 */
    on(event: SWEventType, listener: SWEventListener): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(listener);

        // 返回取消监听函数
        return () => {
            this.listeners.get(event)?.delete(listener);
        };
    }

    /** 添加网络状态变化监听 */
    onNetworkChange(callback: (online: boolean) => void): () => void {
        const handleOnline = () => callback(true);
        const handleOffline = () => callback(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }

    // ==================== 私有方法 ====================

    /** 检查是否可以注册 */
    private canRegister(): boolean {
        const { hostname, protocol } = window.location;

        // 本地开发环境
        if (
            hostname === 'localhost' ||
            hostname === '[::1]' ||
            /^127\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?){3}$/.test(hostname)
        ) {
            return true;
        }

        // 局域网环境
        if (
            /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname)
        ) {
            return true;
        }

        // HTTPS 环境
        return protocol === 'https:';
    }

    /** 设置更新监听 */
    private setupUpdateListener(registration: ServiceWorkerRegistration): void {
        registration.addEventListener('updatefound', () => {
            const installingWorker = registration.installing;
            if (!installingWorker) return;

            this.log('发现新版本');

            installingWorker.addEventListener('statechange', () => {
                if (
                    installingWorker.state === 'installed' &&
                    navigator.serviceWorker.controller
                ) {
                    this.log('新版本已就绪');
                    this.setStatus('updated');
                    this.options.onUpdate(registration);
                    this.emit('updated', registration);

                    // 根据策略决定是否立即应用
                    if (this.options.updateStrategy === 'immediate') {
                        this.applyUpdate();
                    }
                }
            });
        });
    }

    /** 设置定期更新检查 */
    private setupUpdateInterval(): void {
        if (this.options.updateInterval <= 0) return;

        this.updateTimer = setInterval(() => {
            if (!this.isUpdating) {
                this.checkForUpdate();
            }
        }, this.options.updateInterval * 60 * 1000);
    }

    /** 清除更新定时器 */
    private clearUpdateInterval(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }

    /** 发送消息并等待响应 */
    private postMessageWithResponse<T>(
        message: unknown,
        timeout: number,
        fallback: T
    ): Promise<T> {
        return new Promise((resolve) => {
            const channel = new MessageChannel();
            let resolved = false;

            channel.port1.onmessage = (event) => {
                if (!resolved) {
                    resolved = true;
                    resolve(event.data?.success !== undefined ? event.data.success : event.data);
                }
            };

            navigator.serviceWorker.controller?.postMessage(message, [channel.port2]);

            // 超时处理
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve(fallback);
                }
            }, timeout);
        });
    }

    /** 设置状态 */
    private setStatus(status: SWStatus): void {
        if (this.status !== status) {
            this.status = status;
            this.options.onStatusChange(status);
            this.emit(status as SWEventType);
        }
    }

    /** 触发事件 */
    private emit(event: SWEventType, data?: unknown): void {
        const listeners = this.listeners.get(event);
        if (listeners) {
            listeners.forEach((listener) => {
                try {
                    listener(data);
                } catch (error) {
                    console.error(`[SW] 事件监听器错误 (${event}):`, error);
                }
            });
        }
    }

    /** 调试日志 */
    private log(...args: unknown[]): void {
        if (this.options.debug) {
            console.log('[SW Manager]', ...args);
        }
    }
}

// ==================== 单例导出 ====================

/** 全局 SW 管理器实例 */
export const swManager = new ServiceWorkerManager({
    debug: import.meta.env.DEV,
    updateInterval: 60,
    updateStrategy: 'idle',
    onStatusChange: (status) => {
        // 分发自定义事件，供 React 组件监听
        window.dispatchEvent(new CustomEvent('sw-status-change', { detail: status }));
    },
});

// ==================== 便捷函数（保持向后兼容） ====================

/**
 * @deprecated 请使用 swManager.register()
 */
export function registerSW(
    onUpdate?: () => void,
    onSuccess?: () => void
): void {
    swManager.on('updated', onUpdate || (() => {}));
    swManager.on('registered', onSuccess || (() => {}));
    swManager.register();
}

/**
 * @deprecated 请使用 swManager.hasPendingUpdate()
 */
export function hasUpdate(): boolean {
    return swManager.hasPendingUpdate();
}

/**
 * @deprecated 请使用 swManager.applyUpdate()
 */
export function applyUpdate(): void {
    swManager.applyUpdate();
}

/**
 * @deprecated 请使用 swManager.clearAllCache()
 */
export function clearAllCache(): Promise<boolean> {
    return swManager.clearAllCache();
}

/**
 * @deprecated 请使用 swManager.getCacheStats()
 */
export function getCacheStats(): Promise<CacheStats | null> {
    return swManager.getCacheStats();
}

/**
 * @deprecated 请使用 swManager.requestNotificationPermission()
 */
export function requestNotificationPermission(): Promise<NotificationPermission> {
    return swManager.requestNotificationPermission();
}

/**
 * @deprecated 请使用 swManager.getNotificationPermission()
 */
export function getNotificationPermission(): NotificationPermission {
    return swManager.getNotificationPermission();
}

/**
 * @deprecated 请使用 swManager.isOnline()
 */
export function isOnline(): boolean {
    return swManager.isOnline();
}

/**
 * @deprecated 请使用 swManager.onNetworkChange(callback)
 */
export function onNetworkChange(callback: (online: boolean) => void): () => void {
    return swManager.onNetworkChange(callback);
}