// frontend/src/components/AppHeader.tsx
/**
 * 应用顶部导航栏 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 响应式优化（移动端抽屉菜单）
 * - 键盘导航支持
 * - 活动路由高亮
 * - 面包屑集成
 * - 搜索快捷键
 * - 用户操作反馈
 */

import React, { useMemo, useCallback, useState, useEffect, type FC } from 'react';
import {
    Layout,
    Menu,
    Button,
    Dropdown,
    Space,
    Typography,
    Grid,
    Drawer,
    Divider,
    Badge,
    Tooltip,
} from 'antd';
import type { MenuProps } from 'antd';
import {
    BookOutlined,
    ScanOutlined,
    SearchOutlined,
    SettingOutlined,
    DashboardOutlined,
    AppstoreOutlined,
    PlusOutlined,
    MenuOutlined,
    HomeOutlined,
    KeyOutlined,
    ImportOutlined,
    EnvironmentOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, useMatch } from 'react-router-dom';
import ThemeSwitcher from './ThemeSwitcher';
import { useTheme } from '../theme/ThemeContext';

const { Header } = Layout;
const { useBreakpoint } = Grid;
const { Text, Title } = Typography;

// ==================== 类型定义 ====================

/** 导航菜单项配置 */
interface NavMenuItem {
    key: string;
    icon: React.ReactNode;
    label: string;
    children?: NavMenuItem[];
    badge?: number;
    shortcut?: string;
}

/** 组件 Props */
interface AppHeaderProps {
    /** 当前页面标题（用于面包屑） */
    currentTitle?: string;
}

// ==================== 导航配置 ====================

const NAV_ITEMS: NavMenuItem[] = [
    {
        key: '/',
        icon: <HomeOutlined />,
        label: '首页',
        shortcut: 'H',
    },
    {
        key: '/operate',
        icon: <ScanOutlined />,
        label: 'NFC 操作',
        shortcut: 'N',
    },
    {
        key: '/search',
        icon: <SearchOutlined />,
        label: '图书搜索',
        shortcut: 'S',
    },
    {
        key: '/shelf/1',
        icon: <BookOutlined />,
        label: '书架浏览',
    },
    {
        key: '/wall',
        icon: <AppstoreOutlined />,
        label: '封面墙',
    },
    {
        key: '/import',
        icon: <ImportOutlined />,
        label: '批量导入',
    },
    {
        key: 'admin',
        icon: <SettingOutlined />,
        label: '管理',
        children: [
            {
                key: '/admin',
                icon: <DashboardOutlined />,
                label: '仪表盘',
            },
            {
                key: '/admin/shelves',
                icon: <AppstoreOutlined />,
                label: '逻辑书架',
            },
            {
                key: '/admin/physical-shelves',
                icon: <EnvironmentOutlined />,
                label: '物理书架',
            },
            {
                key: '/admin/books',
                icon: <BookOutlined />,
                label: '全部图书',
            },
            {
                key: '/settings/cookie',
                icon: <KeyOutlined />,
                label: '豆瓣 Cookie',
            },
        ],
    },
];

// ==================== 工具函数 ====================

/**
 * 将 NavMenuItem 转换为 Ant Design MenuProps['items']
 */
const toMenuItems = (items: NavMenuItem[]): MenuProps['items'] => {
    return items.map((item): MenuProps['items'][number] => ({
        key: item.key,
        icon: item.icon,
        label: (
            <Space size={4}>
                <span>{item.label}</span>
                {item.shortcut && (
                    <Text
                        type="secondary"
                        style={{ fontSize: 10, opacity: 0.5 }}
                    >
                        ⌘{item.shortcut}
                    </Text>
                )}
            </Space>
        ),
        children: item.children ? toMenuItems(item.children) : undefined,
    }));
};

/**
 * 查找所有叶子节点的 key
 */
const getLeafKeys = (items: NavMenuItem[]): string[] => {
    return items.flatMap((item) => {
        if (item.children) {
            return getLeafKeys(item.children);
        }
        return [item.key];
    });
};

/**
 * 根据路径获取选中的菜单 key
 */
const getSelectedKey = (pathname: string, items: NavMenuItem[]): string => {
    const leafKeys = getLeafKeys(items);

    // 精确匹配
    if (leafKeys.includes(pathname)) {
        return pathname;
    }

    // 前缀匹配（取最长的）
    const matches = leafKeys
        .filter((key) => key !== '/' && pathname.startsWith(key))
        .sort((a, b) => b.length - a.length);

    if (matches.length > 0) {
        return matches[0];
    }

    // 特殊路径处理
    if (pathname.startsWith('/shelf')) return '/shelf/1';
    if (pathname.startsWith('/admin/shelves')) return '/admin/shelves';
    if (pathname.startsWith('/admin/physical-shelves')) return '/admin/physical-shelves';
    if (pathname.startsWith('/admin/books')) return '/admin/books';
    if (pathname.startsWith('/admin')) return '/admin';

    return '/';
};

/**
 * 获取需要打开的父级菜单 key
 */
const getOpenKeys = (selectedKey: string, items: NavMenuItem[]): string[] => {
    for (const item of items) {
        if (item.children) {
            const childKeys = getLeafKeys(item.children);
            if (childKeys.includes(selectedKey)) {
                return [item.key];
            }
        }
    }
    return [];
};

// ==================== 组件 ====================

const AppHeader: FC<AppHeaderProps> = ({ currentTitle }) => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { md } = useBreakpoint();
    const { currentTheme } = useTheme();
    const isMobile = !md;

    // 移动端抽屉状态
    const [drawerOpen, setDrawerOpen] = useState(false);

    // 主题变量
    const brandColor = currentTheme.cssVariables['--app-brand-color'] || '#8B4513';
    const headerBg = currentTheme.cssVariables['--app-header-bg'] || '#ffffff';
    const headerBorder = currentTheme.cssVariables['--app-card-border'] || '#e8d5c8';
    const headerGradient = currentTheme.cssVariables['--app-header-gradient'] || 
        'linear-gradient(135deg, #8B4513, #a0522d)';

    // 计算选中和展开的菜单
    const selectedKey = useMemo(
        () => getSelectedKey(pathname, NAV_ITEMS),
        [pathname]
    );

    const defaultOpenKeys = useMemo(
        () => getOpenKeys(selectedKey, NAV_ITEMS),
        [selectedKey]
    );

    // ==================== 事件处理 ====================

    /** 菜单点击处理 */
    const handleMenuClick = useCallback(
        ({ key }: { key: string }) => {
            if (key.startsWith('/') && key !== pathname) {
                navigate(key);
                // 移动端关闭抽屉
                if (isMobile) {
                    setDrawerOpen(false);
                }
            }
        },
        [navigate, pathname, isMobile]
    );

    /** Logo 点击 */
    const handleLogoClick = useCallback(() => {
        navigate('/');
        setDrawerOpen(false);
    }, [navigate]);

    /** 键盘事件 */
    const handleLogoKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleLogoClick();
            }
        },
        [handleLogoClick]
    );

    // ==================== 键盘快捷键 ====================

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // ⌘K / Ctrl+K → 搜索
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                navigate('/search');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigate]);

    // ==================== 移动端菜单 ====================

    const mobileMenuItems = useMemo<MenuProps['items']>(() => [
        ...toMenuItems(NAV_ITEMS),
        { type: 'divider' as const },
        {
            key: '/books/add',
            icon: <PlusOutlined />,
            label: '手动录入图书',
        },
    ], []);

    // ==================== 渲染 ====================

    /** Logo 区域 */
    const renderLogo = () => (
        <div
            onClick={handleLogoClick}
            onKeyDown={handleLogoKeyDown}
            role="button"
            tabIndex={0}
            aria-label="返回首页"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginRight: isMobile ? 12 : 32,
                cursor: 'pointer',
                flexShrink: 0,
                userSelect: 'none',
                transition: 'opacity 0.2s ease',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.8';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
            }}
        >
            <span style={{ fontSize: 28, lineHeight: 1 }}>📚</span>
            {!isMobile && (
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <Text
                        strong
                        style={{
                            fontSize: 18,
                            color: brandColor,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        书房管理系统
                    </Text>
                    {currentTitle && (
                        <Text
                            type="secondary"
                            style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                        >
                            {currentTitle}
                        </Text>
                    )}
                </div>
            )}
        </div>
    );

    /** 桌面端导航菜单 */
    const renderDesktopMenu = () => (
        <Menu
            mode="horizontal"
            selectedKeys={[selectedKey]}
            defaultOpenKeys={defaultOpenKeys}
            items={toMenuItems(NAV_ITEMS)}
            onClick={handleMenuClick}
            style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                minWidth: 0,
            }}
            subMenuCloseDelay={0.3}
        />
    );

    /** 操作按钮区域 */
    const renderActions = () => (
        <Space size={isMobile ? 8 : 12} style={{ flexShrink: 0 }}>
            {/* 搜索快捷键提示 */}
            {!isMobile && (
                <Tooltip title="搜索图书 (⌘K)">
                    <Button
                        type="text"
                        icon={<SearchOutlined />}
                        onClick={() => navigate('/search')}
                        aria-label="搜索图书"
                    />
                </Tooltip>
            )}

            {/* 主题切换 */}
            <ThemeSwitcher />

            {/* 手动录入按钮 */}
            {!isMobile && (
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => navigate('/books/add')}
                    style={{
                        borderRadius: 8,
                        background: headerGradient,
                        border: 'none',
                        boxShadow: '0 2px 8px rgba(139, 69, 19, 0.3)',
                    }}
                >
                    手动录入
                </Button>
            )}

            {/* 移动端菜单按钮 */}
            {isMobile && (
                <Button
                    type="text"
                    icon={<MenuOutlined style={{ fontSize: 18 }} />}
                    onClick={() => setDrawerOpen(true)}
                    aria-label="打开导航菜单"
                />
            )}
        </Space>
    );

    return (
        <>
            <Header
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: headerBg,
                    padding: isMobile ? '0 16px' : '0 24px',
                    position: 'sticky',
                    top: 0,
                    zIndex: 100,
                    height: 64,
                    borderBottom: `1px solid ${headerBorder}`,
                    backdropFilter: 'blur(8px)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}
            >
                {renderLogo()}
                {!isMobile && renderDesktopMenu()}
                {isMobile && <div style={{ flex: 1 }} />}
                {renderActions()}
            </Header>

            {/* 移动端抽屉菜单 */}
            <Drawer
                title={
                    <Space>
                        <span style={{ fontSize: 24 }}>📚</span>
                        <Text strong style={{ fontSize: 16 }}>
                            书房管理系统
                        </Text>
                    </Space>
                }
                placement="right"
                onClose={() => setDrawerOpen(false)}
                open={drawerOpen}
                width={300}
                styles={{
                    body: { padding: '12px 0' },
                }}
                extra={
                    <ThemeSwitcher />
                }
            >
                <Menu
                    mode="inline"
                    selectedKeys={[selectedKey]}
                    defaultOpenKeys={defaultOpenKeys}
                    items={mobileMenuItems}
                    onClick={handleMenuClick}
                    style={{ border: 'none' }}
                />
                <Divider style={{ margin: '12px 0' }} />
                <div style={{ padding: '0 24px' }}>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        block
                        onClick={() => {
                            navigate('/books/add');
                            setDrawerOpen(false);
                        }}
                        style={{
                            borderRadius: 8,
                            background: headerGradient,
                            border: 'none',
                            height: 44,
                        }}
                    >
                        手动录入图书
                    </Button>
                </div>
            </Drawer>
        </>
    );
};

export default AppHeader;