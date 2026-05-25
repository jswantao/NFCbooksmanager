import { useCallback } from 'react';
import type { FormInstance } from 'antd';

/**
 * 表单草稿管理 Hook
 *
 * 自动保存/加载/清除 localStorage 中的表单草稿。
 * 用于防止用户意外离开页面时丢失已填写的数据。
 *
 * @param form - Ant Design Form 实例
 * @param storageKey - localStorage 存储键名
 */
export function useFormDraft(form: FormInstance, storageKey: string) {
    const saveDraft = useCallback(() => {
        try {
            const values = form.getFieldsValue();
            localStorage.setItem(storageKey, JSON.stringify(values));
        } catch {
            // 静默处理
        }
    }, [form, storageKey]);

    const loadDraft = useCallback((): Record<string, unknown> | null => {
        try {
            const stored = localStorage.getItem(storageKey);
            return stored ? JSON.parse(stored) : null;
        } catch {
            return null;
        }
    }, [storageKey]);

    const clearDraft = useCallback(() => {
        try {
            localStorage.removeItem(storageKey);
        } catch {
            // 静默处理
        }
    }, [storageKey]);

    return { saveDraft, loadDraft, clearDraft };
}
