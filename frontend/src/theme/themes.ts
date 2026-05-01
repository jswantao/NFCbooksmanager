// frontend/src/theme/themes.ts
/**
 * 主题配置模块 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 使用 const 对象替代单独变量，便于遍历和管理
 * - 添加系统偏好检测
 * - 主题预设快捷切换
 * - 更完整的 CSS 变量覆盖
 * - 主题元数据丰富化
 */

import type { ThemeConfig } from 'antd';
import { theme } from 'antd';

// ==================== 类型定义 ====================

/** 主题唯一标识 */
export type ThemeKey = 'classic' | 'dark' | 'bamboo' | 'ocean' | 'sakura';

/** 主题元数据 */
export interface ThemeMeta {
    /** 唯一标识 */
    key: ThemeKey;
    /** 显示名称 */
    name: string;
    /** 图标 emoji */
    icon: string;
    /** 描述 */
    description: string;
    /** 标签（用于分类筛选） */
    tags: string[];
    /** 是否为暗色主题 */
    isDark: boolean;
    /** 推荐使用场景 */
    scenario: string;
}

/** 完整主题定义 */
export interface AppTheme {
    key: ThemeKey;
    name: string;
    icon: string;
    description: string;
    tags: string[];
    isDark: boolean;
    scenario: string;
    /** Ant Design 6 主题配置 */
    antdTheme: ThemeConfig;
    /** CSS 自定义变量 */
    cssVariables: Record<string, string>;
    /** 获取主题元数据 */
    meta: ThemeMeta;
}

// ==================== 主题工厂函数 ====================

/**
 * 创建主题对象
 */
const createTheme = (
    key: ThemeKey,
    name: string,
    icon: string,
    description: string,
    tags: string[],
    isDark: boolean,
    scenario: string,
    antdTheme: ThemeConfig,
    cssVariables: Record<string, string>
): AppTheme => {
    const meta: ThemeMeta = { key, name, icon, description, tags, isDark, scenario };
    return {
        ...meta,
        antdTheme,
        cssVariables,
        meta,
    };
};

// ==================== 主题定义 ====================

/** 书香经典 - 默认主题 */
const themeClassic = createTheme(
    'classic',
    '书香经典',
    '📚',
    '温暖马鞍棕，书房木质质感，适合日常阅读管理',
    ['经典', '暖色', '木质', '默认'],
    false,
    '日常阅读管理、长时间使用',
    {
        algorithm: theme.defaultAlgorithm,
        token: {
            colorPrimary: '#8B4513',
            colorPrimaryBg: '#fdf6f0',
            colorPrimaryBgHover: '#fae8d8',
            colorPrimaryBorder: '#e8c8a8',
            colorPrimaryBorderHover: '#d4a574',
            colorPrimaryHover: '#a0522d',
            colorPrimaryActive: '#6b3410',
            colorPrimaryTextHover: '#a0522d',
            colorPrimaryText: '#8B4513',
            colorPrimaryTextActive: '#6b3410',
            colorSuccess: '#52c41a',
            colorSuccessBg: '#f6ffed',
            colorSuccessBgHover: '#d9f7be',
            colorWarning: '#faad14',
            colorWarningBg: '#fffbe6',
            colorWarningBgHover: '#fff1b8',
            colorError: '#ff4d4f',
            colorErrorBg: '#fff2f0',
            colorErrorBgHover: '#ffccc7',
            colorInfo: '#8B4513',
            colorInfoBg: '#fdf6f0',
            colorInfoBgHover: '#fae8d8',
            colorTextBase: '#2c1810',
            colorText: '#2c1810',
            colorTextSecondary: '#6b5e56',
            colorTextTertiary: '#8c7b72',
            colorTextQuaternary: '#b5a79e',
            colorBgLayout: '#fdf8f4',
            colorBgContainer: '#ffffff',
            colorBgElevated: '#ffffff',
            colorBgSpotlight: '#2c1810',
            colorBorder: '#e8d5c8',
            colorBorderSecondary: '#f0e6db',
            colorFill: '#f0e6db',
            colorFillSecondary: '#fdf6f0',
            colorFillTertiary: '#fdf8f4',
            colorFillQuaternary: '#faf5f0',
            borderRadius: 8,
            borderRadiusSM: 6,
            borderRadiusLG: 12,
            borderRadiusXS: 4,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
            fontSize: 14,
            fontSizeLG: 16,
            fontSizeSM: 12,
            lineHeight: 1.5715,
            controlHeight: 36,
            controlHeightLG: 44,
            controlHeightSM: 28,
            paddingContentHorizontal: 16,
            paddingContentVertical: 12,
            motionUnit: 0.1,
            motionBase: 0,
            motionEaseOutCirc: 'cubic-bezier(0.08, 0.82, 0.17, 1)',
            motionEaseInOutCirc: 'cubic-bezier(0.78, 0.14, 0.15, 0.86)',
            motionEaseOut: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
        },
    },
    {
        '--app-bg': '#fdf8f4',
        '--app-bg-secondary': '#faf0e6',
        '--app-card-bg': '#ffffff',
        '--app-card-bg-hover': '#fdf5ef',
        '--app-card-border': '#e8d5c8',
        '--app-text-primary': '#2c1810',
        '--app-text-secondary': '#6b5e56',
        '--app-text-tertiary': '#8c7b72',
        '--app-header-bg': '#ffffff',
        '--app-header-gradient': 'linear-gradient(135deg, #8B4513 0%, #a0522d 100%)',
        '--app-brand-color': '#8B4513',
        '--app-brand-color-hover': '#a0522d',
        '--app-brand-color-light': '#fdf6f0',
        '--app-accent-color': '#22c55e',
        '--app-divider-color': '#e8d5c8',
        '--app-skeleton-color': '#f0e6db',
        '--app-shadow-sm': '0 1px 3px rgba(0,0,0,0.08)',
        '--app-shadow-md': '0 4px 12px rgba(0,0,0,0.1)',
        '--app-shadow-lg': '0 8px 24px rgba(0,0,0,0.12)',
    }
);

/** 暗夜阅读 - 深色主题 */
const themeDark = createTheme(
    'dark',
    '暗夜阅读',
    '🌙',
    '护眼深色模式，夜间阅读舒适，减少蓝光刺激',
    ['深色', '护眼', '夜间', '科技'],
    true,
    '夜间阅读、低光环境、OLED 屏幕',
    {
        algorithm: theme.darkAlgorithm,
        token: {
            colorPrimary: '#a78bfa',
            colorPrimaryBg: '#1e1b4b',
            colorPrimaryBgHover: '#312e81',
            colorPrimaryBorder: '#4c1d95',
            colorPrimaryBorderHover: '#6d28d9',
            colorPrimaryHover: '#c4b5fd',
            colorPrimaryActive: '#8b5cf6',
            colorPrimaryTextHover: '#c4b5fd',
            colorPrimaryText: '#a78bfa',
            colorPrimaryTextActive: '#8b5cf6',
            colorSuccess: '#34d399',
            colorSuccessBg: '#022c22',
            colorSuccessBgHover: '#064e3b',
            colorWarning: '#fbbf24',
            colorWarningBg: '#451a03',
            colorWarningBgHover: '#78350f',
            colorError: '#f87171',
            colorErrorBg: '#450a0a',
            colorErrorBgHover: '#7f1d1d',
            colorInfo: '#a78bfa',
            colorInfoBg: '#1e1b4b',
            colorInfoBgHover: '#312e81',
            colorTextBase: '#e2e8f0',
            colorText: '#e2e8f0',
            colorTextSecondary: '#94a3b8',
            colorTextTertiary: '#64748b',
            colorTextQuaternary: '#475569',
            colorBgLayout: '#0f172a',
            colorBgContainer: '#1e293b',
            colorBgElevated: '#1e293b',
            colorBgSpotlight: '#e2e8f0',
            colorBorder: '#334155',
            colorBorderSecondary: '#1e293b',
            colorFill: '#1e293b',
            colorFillSecondary: '#334155',
            colorFillTertiary: '#0f172a',
            colorFillQuaternary: '#1a2332',
            borderRadius: 8,
            borderRadiusSM: 6,
            borderRadiusLG: 12,
            borderRadiusXS: 4,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
            fontSize: 14,
            fontSizeLG: 16,
            fontSizeSM: 12,
            lineHeight: 1.5715,
            controlHeight: 36,
            controlHeightLG: 44,
            controlHeightSM: 28,
            paddingContentHorizontal: 16,
            paddingContentVertical: 12,
        },
    },
    {
        '--app-bg': '#0f172a',
        '--app-bg-secondary': '#1a2332',
        '--app-card-bg': '#1e293b',
        '--app-card-bg-hover': '#243050',
        '--app-card-border': '#334155',
        '--app-text-primary': '#e2e8f0',
        '--app-text-secondary': '#94a3b8',
        '--app-text-tertiary': '#64748b',
        '--app-header-bg': '#1e293b',
        '--app-header-gradient': 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
        '--app-brand-color': '#a78bfa',
        '--app-brand-color-hover': '#c4b5fd',
        '--app-brand-color-light': '#1e1b4b',
        '--app-accent-color': '#34d399',
        '--app-divider-color': '#334155',
        '--app-skeleton-color': '#1e293b',
        '--app-shadow-sm': '0 1px 3px rgba(0,0,0,0.3)',
        '--app-shadow-md': '0 4px 12px rgba(0,0,0,0.4)',
        '--app-shadow-lg': '0 8px 24px rgba(0,0,0,0.5)',
    }
);

/** 墨竹青翠 - 绿色主题 */
const themeBamboo = createTheme(
    'bamboo',
    '墨竹青翠',
    '🎋',
    '墨绿竹林风，清新自然格调，缓解视觉疲劳',
    ['绿色', '自然', '清新', '护眼'],
    false,
    '长时间阅读、自然风格偏好',
    {
        algorithm: theme.defaultAlgorithm,
        token: {
            colorPrimary: '#166534',
            colorPrimaryBg: '#f0fdf4',
            colorPrimaryBgHover: '#dcfce7',
            colorPrimaryBorder: '#86efac',
            colorPrimaryBorderHover: '#4ade80',
            colorPrimaryHover: '#15803d',
            colorPrimaryActive: '#14532d',
            colorPrimaryTextHover: '#15803d',
            colorPrimaryText: '#166534',
            colorPrimaryTextActive: '#14532d',
            colorSuccess: '#22c55e',
            colorSuccessBg: '#f0fdf4',
            colorSuccessBgHover: '#dcfce7',
            colorWarning: '#f59e0b',
            colorWarningBg: '#fffbeb',
            colorWarningBgHover: '#fef3c7',
            colorError: '#ef4444',
            colorErrorBg: '#fef2f2',
            colorErrorBgHover: '#fee2e2',
            colorInfo: '#166534',
            colorInfoBg: '#f0fdf4',
            colorInfoBgHover: '#dcfce7',
            colorTextBase: '#14532d',
            colorText: '#14532d',
            colorTextSecondary: '#4d7c5a',
            colorTextTertiary: '#6b9a7a',
            colorTextQuaternary: '#9ab8a5',
            colorBgLayout: '#f0fdf4',
            colorBgContainer: '#ffffff',
            colorBgElevated: '#ffffff',
            colorBgSpotlight: '#14532d',
            colorBorder: '#bbf7d0',
            colorBorderSecondary: '#dcfce7',
            colorFill: '#dcfce7',
            colorFillSecondary: '#f0fdf4',
            colorFillTertiary: '#f7fee7',
            colorFillQuaternary: '#fafcf5',
            borderRadius: 8,
            borderRadiusSM: 6,
            borderRadiusLG: 12,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
            fontSize: 14,
            lineHeight: 1.5715,
            controlHeight: 36,
        },
    },
    {
        '--app-bg': '#f0fdf4',
        '--app-bg-secondary': '#dcfce7',
        '--app-card-bg': '#ffffff',
        '--app-card-bg-hover': '#f0fdf4',
        '--app-card-border': '#bbf7d0',
        '--app-text-primary': '#14532d',
        '--app-text-secondary': '#4d7c5a',
        '--app-text-tertiary': '#6b9a7a',
        '--app-header-bg': '#ffffff',
        '--app-header-gradient': 'linear-gradient(135deg, #166534 0%, #15803d 100%)',
        '--app-brand-color': '#166534',
        '--app-brand-color-hover': '#15803d',
        '--app-brand-color-light': '#f0fdf4',
        '--app-accent-color': '#22c55e',
        '--app-divider-color': '#bbf7d0',
        '--app-skeleton-color': '#dcfce7',
        '--app-shadow-sm': '0 1px 3px rgba(22,101,52,0.08)',
        '--app-shadow-md': '0 4px 12px rgba(22,101,52,0.1)',
        '--app-shadow-lg': '0 8px 24px rgba(22,101,52,0.12)',
    }
);

/** 海洋之蓝 - 蓝色主题 */
const themeOcean = createTheme(
    'ocean',
    '海洋之蓝',
    '🌊',
    '深海蓝调，专业科技感，适合高效工作',
    ['蓝色', '科技', '专业', '冷静'],
    false,
    '专业工作、技术管理、专注模式',
    {
        algorithm: theme.defaultAlgorithm,
        token: {
            colorPrimary: '#1e40af',
            colorPrimaryBg: '#eff6ff',
            colorPrimaryBgHover: '#dbeafe',
            colorPrimaryBorder: '#93c5fd',
            colorPrimaryBorderHover: '#60a5fa',
            colorPrimaryHover: '#1e3a8a',
            colorPrimaryActive: '#1e3a5f',
            colorPrimaryTextHover: '#1e3a8a',
            colorPrimaryText: '#1e40af',
            colorPrimaryTextActive: '#1e3a5f',
            colorSuccess: '#10b981',
            colorSuccessBg: '#ecfdf5',
            colorSuccessBgHover: '#d1fae5',
            colorWarning: '#f59e0b',
            colorWarningBg: '#fffbeb',
            colorWarningBgHover: '#fef3c7',
            colorError: '#ef4444',
            colorErrorBg: '#fef2f2',
            colorErrorBgHover: '#fee2e2',
            colorInfo: '#1e40af',
            colorInfoBg: '#eff6ff',
            colorInfoBgHover: '#dbeafe',
            colorTextBase: '#1e3a5f',
            colorText: '#1e3a5f',
            colorTextSecondary: '#64748b',
            colorTextTertiary: '#94a3b8',
            colorTextQuaternary: '#b0bec5',
            colorBgLayout: '#eff6ff',
            colorBgContainer: '#ffffff',
            colorBgElevated: '#ffffff',
            colorBgSpotlight: '#1e3a5f',
            colorBorder: '#bfdbfe',
            colorBorderSecondary: '#dbeafe',
            colorFill: '#dbeafe',
            colorFillSecondary: '#eff6ff',
            colorFillTertiary: '#f0f9ff',
            colorFillQuaternary: '#f5faff',
            borderRadius: 8,
            borderRadiusSM: 6,
            borderRadiusLG: 12,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
            fontSize: 14,
            lineHeight: 1.5715,
            controlHeight: 36,
        },
    },
    {
        '--app-bg': '#eff6ff',
        '--app-bg-secondary': '#dbeafe',
        '--app-card-bg': '#ffffff',
        '--app-card-bg-hover': '#eff6ff',
        '--app-card-border': '#bfdbfe',
        '--app-text-primary': '#1e3a5f',
        '--app-text-secondary': '#64748b',
        '--app-text-tertiary': '#94a3b8',
        '--app-header-bg': '#ffffff',
        '--app-header-gradient': 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)',
        '--app-brand-color': '#1e40af',
        '--app-brand-color-hover': '#1e3a8a',
        '--app-brand-color-light': '#eff6ff',
        '--app-accent-color': '#10b981',
        '--app-divider-color': '#bfdbfe',
        '--app-skeleton-color': '#dbeafe',
        '--app-shadow-sm': '0 1px 3px rgba(30,64,175,0.08)',
        '--app-shadow-md': '0 4px 12px rgba(30,64,175,0.1)',
        '--app-shadow-lg': '0 8px 24px rgba(30,64,175,0.12)',
    }
);

/** 樱花纷飞 - 粉色主题 */
const themeSakura = createTheme(
    'sakura',
    '樱花纷飞',
    '🌸',
    '柔美樱花粉，温馨浪漫气息，阅读心情愉悦',
    ['粉色', '温馨', '浪漫', '柔和'],
    false,
    '休闲阅读、文学欣赏、轻松氛围',
    {
        algorithm: theme.defaultAlgorithm,
        token: {
            colorPrimary: '#be185d',
            colorPrimaryBg: '#fdf2f8',
            colorPrimaryBgHover: '#fce7f3',
            colorPrimaryBorder: '#f9a8d4',
            colorPrimaryBorderHover: '#f472b6',
            colorPrimaryHover: '#9d174d',
            colorPrimaryActive: '#831843',
            colorPrimaryTextHover: '#9d174d',
            colorPrimaryText: '#be185d',
            colorPrimaryTextActive: '#831843',
            colorSuccess: '#22c55e',
            colorSuccessBg: '#f0fdf4',
            colorSuccessBgHover: '#dcfce7',
            colorWarning: '#f59e0b',
            colorWarningBg: '#fffbeb',
            colorWarningBgHover: '#fef3c7',
            colorError: '#ef4444',
            colorErrorBg: '#fef2f2',
            colorErrorBgHover: '#fee2e2',
            colorInfo: '#be185d',
            colorInfoBg: '#fdf2f8',
            colorInfoBgHover: '#fce7f3',
            colorTextBase: '#4a1942',
            colorText: '#4a1942',
            colorTextSecondary: '#9d6b8a',
            colorTextTertiary: '#c49db3',
            colorTextQuaternary: '#d4b8c8',
            colorBgLayout: '#fdf2f8',
            colorBgContainer: '#ffffff',
            colorBgElevated: '#ffffff',
            colorBgSpotlight: '#4a1942',
            colorBorder: '#fce7f3',
            colorBorderSecondary: '#fdf2f8',
            colorFill: '#fce7f3',
            colorFillSecondary: '#fdf2f8',
            colorFillTertiary: '#fff5f9',
            colorFillQuaternary: '#fffafc',
            borderRadius: 12,
            borderRadiusSM: 8,
            borderRadiusLG: 16,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
            fontSize: 14,
            lineHeight: 1.5715,
            controlHeight: 36,
        },
    },
    {
        '--app-bg': '#fdf2f8',
        '--app-bg-secondary': '#fce7f3',
        '--app-card-bg': '#ffffff',
        '--app-card-bg-hover': '#fdf2f8',
        '--app-card-border': '#fce7f3',
        '--app-text-primary': '#4a1942',
        '--app-text-secondary': '#9d6b8a',
        '--app-text-tertiary': '#c49db3',
        '--app-header-bg': '#ffffff',
        '--app-header-gradient': 'linear-gradient(135deg, #be185d 0%, #db2777 100%)',
        '--app-brand-color': '#be185d',
        '--app-brand-color-hover': '#9d174d',
        '--app-brand-color-light': '#fdf2f8',
        '--app-accent-color': '#f472b6',
        '--app-divider-color': '#fce7f3',
        '--app-skeleton-color': '#fce7f3',
        '--app-shadow-sm': '0 1px 3px rgba(190,24,93,0.08)',
        '--app-shadow-md': '0 4px 12px rgba(190,24,93,0.1)',
        '--app-shadow-lg': '0 8px 24px rgba(190,24,93,0.12)',
    }
);

// ==================== 主题注册表 ====================

/** 所有主题的注册表 */
export const THEME_REGISTRY: Record<ThemeKey, AppTheme> = {
    classic: themeClassic,
    dark: themeDark,
    bamboo: themeBamboo,
    ocean: themeOcean,
    sakura: themeSakura,
};

/** 主题列表（保持原有导出兼容） */
export const ALL_THEMES: AppTheme[] = Object.values(THEME_REGISTRY);

/** 默认主题键 */
export const DEFAULT_THEME_KEY: ThemeKey = 'classic';

// ==================== 工具函数 ====================

/**
 * 根据键获取主题
 * @param key - 主题键
 * @returns 主题对象，未找到时返回默认主题
 */
export const getThemeByKey = (key: string): AppTheme => {
    return THEME_REGISTRY[key as ThemeKey] || themeClassic;
};

/**
 * 验证主题键是否有效
 */
export const isValidThemeKey = (key: string): key is ThemeKey => {
    return key in THEME_REGISTRY;
};

/**
 * 获取主题元数据列表（用于选择器展示）
 */
export const getThemeMetaList = (): ThemeMeta[] => {
    return ALL_THEMES.map(({ key, name, icon, description, tags, isDark, scenario }) => ({
        key,
        name,
        icon,
        description,
        tags,
        isDark,
        scenario,
    }));
};

/**
 * 根据系统偏好获取推荐主题
 * @returns 推荐的主题键
 */
export const getSystemPreferredTheme = (): ThemeKey => {
    if (typeof window === 'undefined') return DEFAULT_THEME_KEY;

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'classic';
};

/**
 * 获取暗色主题列表
 */
export const getDarkThemes = (): AppTheme[] => {
    return ALL_THEMES.filter(t => t.isDark);
};

/**
 * 获取亮色主题列表
 */
export const getLightThemes = (): AppTheme[] => {
    return ALL_THEMES.filter(t => !t.isDark);
};