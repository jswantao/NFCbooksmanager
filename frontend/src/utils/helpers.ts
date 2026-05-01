// frontend/src/utils/helpers.ts
/**
 * 通用工具函数 - React 19 + Ant Design 6
 * 
 * 提供防抖、节流等通用工具函数
 */

/**
 * 防抖函数
 * @param fn 需要防抖的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout>;

    return function (this: any, ...args: Parameters<T>) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            fn.apply(this, args);
        }, delay);
    };
}

/**
 * 节流函数
 * @param fn 需要节流的函数
 * @param interval 间隔时间（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
    fn: T,
    interval: number
): (...args: Parameters<T>) => void {
    let lastTime = 0;

    return function (this: any, ...args: Parameters<T>) {
        const now = Date.now();
        if (now - lastTime >= interval) {
            lastTime = now;
            fn.apply(this, args);
        }
    };
}

/**
 * 深拷贝（基于 JSON）
 */
export function deepClone<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    return JSON.parse(JSON.stringify(obj));
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 安全解析 JSON
 */
export function safeJsonParse<T>(str: string, fallback: T): T {
    try {
        return JSON.parse(str) as T;
    } catch {
        return fallback;
    }
}

/**
 * 延迟执行
 */
export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 类名合并
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
    return classes.filter(Boolean).join(' ');
}

/**
 * 获取数组随机元素
 */
export function randomItem<T>(arr: T[]): T | undefined {
    if (!arr.length) return undefined;
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 范围限制
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}