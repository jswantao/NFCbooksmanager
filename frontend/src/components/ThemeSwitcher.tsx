// frontend/src/components/ThemeSwitcher.tsx
/**
 * 主题切换器组件 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 主题预览色块
 * - 键盘快捷键切换
 * - 暗色/亮色快速切换
 * - 动画过渡效果
 * - 系统偏好提示
 */

import React, { useCallback, useEffect, type FC } from 'react';
import {
    Dropdown,
    Button,
    Space,
    Typography,
    Tooltip,
    Divider,
    Switch,
    theme as antTheme,
    type MenuProps,
} from 'antd';
import {
    BgColorsOutlined,
    CheckOutlined,
    SunOutlined,
    MoonOutlined,
    DesktopOutlined,
} from '@ant-design/icons';
import { useTheme } from '../theme/ThemeContext';

const { Text } = Typography;

// ==================== 类型定义 ====================

interface ThemeSwitcherProps {
    /** 是否显示主题名称 */
    showLabel?: boolean;
    /** 按钮大小 */
    size?: 'small' | 'middle' | 'large';
}

// ==================== 组件 ====================

const ThemeSwitcher: FC<ThemeSwitcherProps> = ({
    showLabel = false,
    size = 'middle',
}) => {
    const {
        currentTheme,
        themeKey,
        setTheme,
        allThemes,
        isDark,
        toggleDarkMode,
        followSystem,
        setFollowSystem,
        nextTheme,
    } = useTheme();

    const { token } = antTheme.useToken();

    // ==================== 键盘快捷键 ====================

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // ⌘T / Ctrl+T → 下一个主题
            if ((e.metaKey || e.ctrlKey) && e.key === 't') {
                e.preventDefault();
                nextTheme();
            }
            // ⌘⇧D / Ctrl+Shift+D → 切换暗色模式
            if (
                (e.metaKey || e.ctrlKey) &&
                e.shiftKey &&
                e.key === 'D'
            ) {
                e.preventDefault();
                toggleDarkMode();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [nextTheme, toggleDarkMode]);

    // ==================== 菜单项 ====================

    const menuItems: MenuProps['items'] = [
        // 主题列表
        ...allThemes.map((theme) => ({
            key: theme.key,
            label: (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        minWidth: 200,
                        padding: '6px 0',
                    }}
                >
                    <Space size={10}>
                        {/* 主题预览色块 */}
                        <div
                            style={{
                                width: 20,
                                height: 20,
                                borderRadius: 6,
                                background:
                                    theme.cssVariables['--app-header-gradient'] ||
                                    theme.cssVariables['--app-brand-color'],
                                flexShrink: 0,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                            }}
                        />
                        <div>
                            <Space size={6}>
                                <span style={{ fontSize: 16 }}>{theme.icon}</span>
                                <Text strong style={{ fontSize: 14 }}>
                                    {theme.name}
                                </Text>
                            </Space>
                            <br />
                            <Text
                                type="secondary"
                                style={{ fontSize: 11 }}
                            >
                                {theme.isDark ? '🌙 暗色' : '☀️ 亮色'} ·{' '}
                                {theme.description}
                            </Text>
                        </div>
                    </Space>
                    {themeKey === theme.key && (
                        <CheckOutlined
                            style={{
                                color: theme.cssVariables['--app-brand-color'],
                                fontSize: 16,
                                flexShrink: 0,
                            }}
                        />
                    )}
                </div>
            ),
            onClick: () => setTheme(theme.key),
        })),

        { type: 'divider' as const },

        // 快捷操作
        {
            key: 'follow-system',
            label: (
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '4px 0',
                    }}
                >
                    <Space size={8}>
                        <DesktopOutlined
                            style={{ color: token.colorTextSecondary }}
                        />
                        <Text style={{ fontSize: 13 }}>跟随系统</Text>
                    </Space>
                    <Switch
                        size="small"
                        checked={followSystem}
                        onChange={(checked) => setFollowSystem(checked)}
                        onClick={(_, e) => e.stopPropagation()}
                    />
                </div>
            ),
            onClick: () => {}, // 不处理点击，由 Switch 处理
        },
    ];

    // ==================== 渲染 ====================

    const brandColor =
        currentTheme.cssVariables['--app-brand-color'] || '#8B4513';

    return (
        <Dropdown
            menu={{ items: menuItems }}
            trigger={['click']}
            placement="bottomRight"
            styles={{ root: { minWidth: 240 } }}
        >
            <Tooltip
                title={
                    <Space orientation="vertical" size={0}>
                        <span>切换主题</span>
                        <Text style={{ fontSize: 10, opacity: 0.7 }}>
                            ⌘T 下一个 · ⌘⇧D 暗色模式
                        </Text>
                    </Space>
                }
            >
                <Button
                    type="text"
                    size={size}
                    icon={
                        <BgColorsOutlined
                            style={{
                                fontSize: size === 'small' ? 16 : 18,
                                color: brandColor,
                            }}
                        />
                    }
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        borderRadius: 8,
                    }}
                >
                    {showLabel ? (
                        <Space size={4}>
                            <span style={{ fontSize: 14 }}>
                                {currentTheme.icon}
                            </span>
                            <Text
                                style={{
                                    fontSize: 13,
                                    color: brandColor,
                                    fontWeight: 500,
                                }}
                            >
                                {currentTheme.name}
                            </Text>
                        </Space>
                    ) : (
                        <span style={{ fontSize: 16 }}>{currentTheme.icon}</span>
                    )}
                </Button>
            </Tooltip>
        </Dropdown>
    );
};

export default ThemeSwitcher;