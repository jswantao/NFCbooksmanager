import { useEffect } from 'react';

interface ShortcutOptions {
    /** 需要的修饰键 */
    modifier?: 'ctrl' | 'meta' | 'none';
    /** 是否忽略输入框内的按键（默认 true） */
    ignoreInputs?: boolean;
    /** 是否启用（默认 true） */
    enabled?: boolean;
}

/**
 * 键盘快捷键 Hook
 *
 * 注册全局键盘快捷键，自动跳过 input/textarea/select 内的按键。
 *
 * @param key - 按键名称（如 's', 'ArrowLeft', 'Escape'）
 * @param handler - 回调函数
 * @param options - 配置选项
 */
export function useKeyboardShortcut(
    key: string,
    handler: () => void,
    options: ShortcutOptions = {}
): void {
    const { modifier = 'none', ignoreInputs = true, enabled = true } = options;

    useEffect(() => {
        if (!enabled) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (ignoreInputs) {
                const tag = (e.target as HTMLElement)?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            }

            const modMatch =
                modifier === 'meta' ? (e.metaKey || e.ctrlKey) :
                modifier === 'ctrl' ? e.ctrlKey :
                true;

            if (modMatch && e.key.toLowerCase() === key.toLowerCase()) {
                e.preventDefault();
                handler();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [key, handler, modifier, ignoreInputs, enabled]);
}
