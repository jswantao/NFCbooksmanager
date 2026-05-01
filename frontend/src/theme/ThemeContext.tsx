// frontend/src/theme/ThemeContext.tsx
/**
 * 主题上下文 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 系统偏好检测与自动切换
 * - 主题切换动画过渡
 * - 持久化存储增强
 * - 暗色模式媒体查询监听
 * - 主题事件广播
 */

import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useMemo,
    useRef,
    type FC,
} from 'react';
import { ConfigProvider, theme as antTheme } from 'antd';
import type { AppTheme, ThemeKey } from './themes';
import {
    getThemeByKey,
    DEFAULT_THEME_KEY,
    ALL_THEMES,
    isValidThemeKey,
    getSystemPreferredTheme,
} from './themes';

// ==================== 类型定义 ====================

/** 主题上下文值 */
interface ThemeContextValue {
    /** 当前主题对象 */
    currentTheme: AppTheme;
    /** 当前主题键 */
    themeKey: ThemeKey;
    /** 设置主题 */
    setTheme: (key: string) => void;
    /** 切换到下一个主题 */
    nextTheme: () => void;
    /** 所有可用主题 */
    allThemes: AppTheme[];
    /** 是否为暗色主题 */
    isDark: boolean;
    /** 是否跟随系统偏好 */
    followSystem: boolean;
    /** 设置是否跟随系统 */
    setFollowSystem: (follow: boolean) => void;
    /** 切换暗色/亮色模式 */
    toggleDarkMode: () => void;
}

// ==================== 常量 ====================

/** localStorage 存储键 */
const STORAGE_KEYS = {
    THEME: 'bookshelf-theme',
    FOLLOW_SYSTEM: 'bookshelf-follow-system',
} as const;

/** 主题切换过渡时间（ms） */
const THEME_TRANSITION_DURATION = 300;

// ==================== 工具函数 ====================

/**
 * 安全读取 localStorage
 */
const safeGetStorage = <T,>(key: string, fallback: T): T => {
    try {
        const stored = localStorage.getItem(key);
        if (stored === null) return fallback;
        return JSON.parse(stored) as T;
    } catch {
        return fallback;
    }
};

/**
 * 安全写入 localStorage
 */
const safeSetStorage = (key: string, value: unknown): void => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // 静默处理存储失败
    }
};

/**
 * 获取保存的主题键
 */
const getSavedThemeKey = (): string => {
    const saved = safeGetStorage<string | null>(STORAGE_KEYS.THEME, null);
    if (saved && isValidThemeKey(saved)) {
        return saved;
    }
    return getSystemPreferredTheme();
};

/**
 * 获取是否跟随系统偏好
 */
const getSavedFollowSystem = (): boolean => {
    return safeGetStorage<boolean>(STORAGE_KEYS.FOLLOW_SYSTEM, false);
};

// ==================== 创建上下文 ====================

const ThemeContext = createContext<ThemeContextValue>({
    currentTheme: getThemeByKey(DEFAULT_THEME_KEY),
    themeKey: DEFAULT_THEME_KEY,
    setTheme: () => {},
    nextTheme: () => {},
    allThemes: ALL_THEMES,
    isDark: false,
    followSystem: false,
    setFollowSystem: () => {},
    toggleDarkMode: () => {},
});

// ==================== Hook ====================

/** 使用主题上下文 */
export const useTheme = (): ThemeContextValue => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme 必须在 ThemeProvider 内部使用');
    }
    return context;
};

// ==================== Provider 组件 ====================

/**
 * 主题提供者组件
 * 
 * 功能：
 * - 管理主题状态
 * - 应用 CSS 变量到 document
 * - 监听系统暗色模式变化
 * - 主题切换过渡动画
 */
export const ThemeProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
    // 主题状态
    const [themeKey, setThemeKey] = useState<ThemeKey>(() => {
        return getSavedThemeKey() as ThemeKey;
    });
    const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => {
        return getThemeByKey(getSavedThemeKey());
    });
    const [followSystem, setFollowSystemState] = useState<boolean>(() => {
        return getSavedFollowSystem();
    });

    // 过渡状态
    const isTransitioning = useRef(false);
    const transitionTimeout = useRef<ReturnType<typeof setTimeout>>();

    // 前一个主题键（用于回退）
    const previousThemeKey = useRef<ThemeKey>(themeKey);

    // ==================== 主题设置 ====================

    /**
     * 设置主题
     */
    const setTheme = useCallback((key: string) => {
        if (!isValidThemeKey(key)) {
            console.warn(`[Theme] 无效的主题键: ${key}`);
            return;
        }

        if (isTransitioning.current) return;

        const theme = getThemeByKey(key);
        previousThemeKey.current = themeKey;
        setThemeKey(key as ThemeKey);
        setCurrentTheme(theme);

        // 如果手动设置主题，取消跟随系统
        if (followSystem) {
            setFollowSystemState(false);
            safeSetStorage(STORAGE_KEYS.FOLLOW_SYSTEM, false);
        }

        safeSetStorage(STORAGE_KEYS.THEME, key);

        // 触发过渡动画
        startTransition();

        // 广播主题变更事件
        window.dispatchEvent(new CustomEvent('theme-change', {
            detail: { key, theme },
        }));
    }, [themeKey, followSystem]);

    /**
     * 切换到下一个主题（循环）
     */
    const nextTheme = useCallback(() => {
        const currentIndex = ALL_THEMES.findIndex(t => t.key === themeKey);
        const nextIndex = (currentIndex + 1) % ALL_THEMES.length;
        setTheme(ALL_THEMES[nextIndex].key);
    }, [themeKey, setTheme]);

    /**
     * 设置是否跟随系统
     */
    const setFollowSystem = useCallback((follow: boolean) => {
        setFollowSystemState(follow);
        safeSetStorage(STORAGE_KEYS.FOLLOW_SYSTEM, follow);

        if (follow) {
            const systemTheme = getSystemPreferredTheme();
            setTheme(systemTheme);
        }
    }, [setTheme]);

    /**
     * 切换暗色/亮色模式
     */
    const toggleDarkMode = useCallback(() => {
        if (currentTheme.isDark) {
            // 切换到亮色主题
            const lightThemes = ALL_THEMES.filter(t => !t.isDark);
            const currentIndex = lightThemes.findIndex(t => t.key === themeKey);
            const nextIndex = (currentIndex + 1) % lightThemes.length;
            setTheme(lightThemes[nextIndex]?.key || DEFAULT_THEME_KEY);
        } else {
            // 切换到暗色主题
            const darkThemes = ALL_THEMES.filter(t => t.isDark);
            setTheme(darkThemes[0]?.key || 'dark');
        }
    }, [themeKey, currentTheme.isDark, setTheme]);

    // ==================== 过渡动画 ====================

    /**
     * 启动主题切换过渡
     */
    const startTransition = useCallback(() => {
        isTransitioning.current = true;

        // 清除之前的超时
        if (transitionTimeout.current) {
            clearTimeout(transitionTimeout.current);
        }

        transitionTimeout.current = setTimeout(() => {
            isTransitioning.current = false;
        }, THEME_TRANSITION_DURATION);
    }, []);

    // ==================== CSS 变量应用 ====================

    useEffect(() => {
        const root = document.documentElement;
        const vars = currentTheme.cssVariables;

        // 批量设置 CSS 变量
        Object.entries(vars).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });

        // 设置 data 属性用于 CSS 选择器
        root.setAttribute('data-theme', currentTheme.key);
        root.setAttribute('data-theme-mode', currentTheme.isDark ? 'dark' : 'light');

        // 更新 meta theme-color
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            const headerBg = vars['--app-header-bg'] || vars['--app-bg'] || '#ffffff';
            metaThemeColor.setAttribute('content', headerBg);
        }
    }, [currentTheme]);

    // ==================== 系统偏好监听 ====================

    useEffect(() => {
        if (!followSystem) return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const handleChange = (e: MediaQueryListEvent) => {
            const systemTheme = e.matches ? 'dark' : 'classic';
            console.log('[Theme] 系统偏好变更:', systemTheme);
            setTheme(systemTheme);
        };

        mediaQuery.addEventListener('change', handleChange);

        return () => {
            mediaQuery.removeEventListener('change', handleChange);
        };
    }, [followSystem, setTheme]);

    // ==================== 清理 ====================

    useEffect(() => {
        return () => {
            if (transitionTimeout.current) {
                clearTimeout(transitionTimeout.current);
            }
        };
    }, []);

    // ==================== 上下文值 ====================

    const contextValue = useMemo<ThemeContextValue>(() => ({
        currentTheme,
        themeKey,
        setTheme,
        nextTheme,
        allThemes: ALL_THEMES,
        isDark: currentTheme.isDark,
        followSystem,
        setFollowSystem,
        toggleDarkMode,
    }), [currentTheme, themeKey, setTheme, nextTheme, followSystem, setFollowSystem, toggleDarkMode]);

    return (
        <ThemeContext.Provider value={contextValue}>
            <ConfigProvider theme={currentTheme.antdTheme}>
                <div
                    className={`theme-wrapper theme-${currentTheme.key}`}
                    style={{
                        transition: `background-color ${THEME_TRANSITION_DURATION}ms ease, color ${THEME_TRANSITION_DURATION}ms ease`,
                        minHeight: '100vh',
                    }}
                >
                    {children}
                </div>
            </ConfigProvider>
        </ThemeContext.Provider>
    );
};