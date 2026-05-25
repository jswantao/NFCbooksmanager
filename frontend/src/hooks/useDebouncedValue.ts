import { useState, useEffect } from 'react';

/**
 * 防抖值 Hook
 *
 * 在值变化后延迟指定时间才更新返回值，
 * 用于搜索输入防抖、表单校验等场景。
 *
 * @param value - 原始值
 * @param delayMs - 延迟毫秒数（默认 300）
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return debounced;
}
