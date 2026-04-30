// frontend/src/components/AppHeader.tsx
/**
 * 应用顶部导航栏组件
 * 
 * 功能：
 * 1. 品牌标识（📚 + 系统名称）点击返回首页
 * 2. 桌面端：水平导航菜单
 * 3. 移动端：汉堡菜单下拉导航
 * 4. 手动录入快捷按钮
 * 
 * 响应式适配：
 * - ≥768px (md)：显示完整水平菜单 + 手动录入按钮
 * - <768px：显示汉堡菜单（包含所有导航项 + 手动录入）
 * 
 * 菜单结构：
 * - 首页 (/)
 * - NFC 写入 (/write)
 * - 图书搜索 (/search)
 * - 书架浏览 (/shelf/1)
 * - 封面墙 (/wall)
 * - 批量导入 (/import)
 * - 管理（子菜单）
 *   - 仪表盘 (/admin)
 *   - 书架管理 (/admin/shelves)
 *   - 豆瓣Cookie (/settings/cookie)
 */

import React, { useMemo, useCallback } from 'react';
import {
    Layout,
    Menu,
    Button,
    Dropdown,
    Space,
    Typography,
    Grid,
} from 'antd';
import type { MenuProps } from 'antd';
import {
    BookOutlined,
    ScanOutlined,
    FormOutlined,
    SearchOutlined,
    SettingOutlined,
    DashboardOutlined,
    AppstoreOutlined,
    PlusOutlined,
    MenuOutlined,
    HomeOutlined,
    KeyOutlined,
    ImportOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

// ---- 常量 ----

const { Header } = Layout;
const { useBreakpoint } = Grid;

/**
 * 导航菜单配置
 * 
 * key 对应路由路径，用于：
 * - 菜单选中状态高亮
 * - 点击导航跳转
 */
const MENU_ITEMS: MenuProps['items'] = [
    {
        key: '/',
        icon: <HomeOutlined />,
        label: '首页',
    },
    {
        key: '/write',
        icon: <FormOutlined />,
        label: 'NFC 写入',
    },
    {
        key: '/search',
        icon: <SearchOutlined />,
        label: '图书搜索',
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
                label: '书架管理',
            },
            {
            key: '/admin/books',  // ⬅ 新增
            icon: <BookOutlined />,
            label: '全部图书',
            },
            {
                key: '/settings/cookie',
                icon: <KeyOutlined />,
                label: '豆瓣Cookie',
            },
        ],
    },
];

// ---- 样式常量 ----

/** 导航栏高度 */
const HEADER_HEIGHT = 64;

/** 底部边框颜色 */
const HEADER_BORDER_COLOR = '#f0e4d8';

/** 品牌色 */
const BRAND_COLOR = '#8B4513';

// ---- 组件 ----

/**
 * AppHeader 组件
 * 
 * 粘性定位在页面顶部，包含品牌标识、导航菜单和操作按钮。
 */
const AppHeader: React.FC = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { md } = useBreakpoint();
    
    /** 是否为移动端（<768px） */
    const isMobile = !md;

    /**
     * 计算当前选中的菜单项 key
     * 
     * 处理逻辑：
     * 1. /admin/shelves → 选中子菜单项
     * 2. /admin/* → 选中 /admin
     * 3. /shelf/* → 选中 /shelf/1（书架浏览）
     * 4. 精确匹配路由路径
     * 5. 无匹配 → 默认首页
     */
    const selectedKey = useMemo(() => {
        // 子路由优先匹配
        if (pathname.startsWith('/admin/shelves')) return '/admin/shelves';
        if (pathname.startsWith('/admin')) return '/admin';
        
        // 书架路径统一选中书架浏览
        if (pathname.startsWith('/shelf')) return '/shelf/1';
        
        // 精确匹配菜单项
        const matchedItem = MENU_ITEMS.find(
            (item) => item?.key === pathname
        );
        return (matchedItem?.key as string) || '/';
    }, [pathname]);

    /**
     * 菜单点击处理
     * 
     * 仅当点击的路径与当前路径不同时才导航，
     * 避免重复导航触发不必要的重渲染。
     */
    const handleMenuClick = useCallback(
        ({ key }: { key: string }) => {
            if (key.startsWith('/') && key !== pathname) {
                navigate(key);
            }
        },
        [navigate, pathname]
    );

    /**
     * 移动端下拉菜单项
     * 
     * 包含所有桌面端菜单项 + 手动录入（移动端无独立按钮）
     */
    const mobileMenuItems: MenuProps['items'] = useMemo(
        () => [
            ...(MENU_ITEMS.map((item) => ({
                ...item,
                children: item?.children,
            })) as MenuProps['items']),
            { type: 'divider' as const },
            {
                key: '/books/add',
                icon: <PlusOutlined />,
                label: '📝 手动录入图书',
            },
        ],
        []
    );

    // ---- 渲染 ----

    return (
        <Header
            style={{
                display: 'flex',
                alignItems: 'center',
                background: '#fff',
                padding: isMobile ? '0 12px' : '0 24px',
                position: 'sticky',
                top: 0,
                zIndex: 100,
                height: HEADER_HEIGHT,
                borderBottom: `1px solid ${HEADER_BORDER_COLOR}`,
            }}
        >
            {/* ---- 品牌标识 ---- */}
            <div
                onClick={() => navigate('/')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') navigate('/');
                }}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginRight: isMobile ? 12 : 32,
                    cursor: 'pointer',
                    flexShrink: 0,
                    userSelect: 'none',
                }}
                aria-label="返回首页"
            >
                <span style={{ fontSize: 28 }} role="img" aria-label="书籍">
                    📚
                </span>
                {!isMobile && (
                    <Typography.Text
                        strong
                        style={{
                            fontSize: 18,
                            color: BRAND_COLOR,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        书房管理系统
                    </Typography.Text>
                )}
            </div>

            {/* ---- 桌面端水平菜单 ---- */}
            {!isMobile ? (
                <Menu
                    mode="horizontal"
                    selectedKeys={[selectedKey]}
                    defaultOpenKeys={['admin']}
                    items={MENU_ITEMS}
                    onClick={handleMenuClick}
                    style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                    }}
                />
            ) : (
                /* 移动端占位（让按钮靠右） */
                <div style={{ flex: 1 }} />
            )}

            {/* ---- 操作按钮区 ---- */}
            <Space
                size={isMobile ? 4 : 12}
                style={{ flexShrink: 0 }}
            >
                {/* 桌面端：手动录入按钮 */}
                {!isMobile && (
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => navigate('/books/add')}
                        style={{ borderRadius: 6 }}
                    >
                        手动录入
                    </Button>
                )}

                {/* 移动端：汉堡菜单下拉 */}
                {isMobile && (
                    <Dropdown
                        menu={{
                            items: mobileMenuItems,
                            selectedKeys: [selectedKey],
                            onClick: ({ key }) => {
                                if (key.startsWith('/')) navigate(key);
                            },
                        }}
                        trigger={['click']}
                        placement="bottomRight"
                    >
                        <Button
                            type="text"
                            icon={
                                <MenuOutlined
                                    style={{ fontSize: 18 }}
                                />
                            }
                            aria-label="打开导航菜单"
                        />
                    </Dropdown>
                )}
            </Space>
        </Header>
    );
};

export default AppHeader;