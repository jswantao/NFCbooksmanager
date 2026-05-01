// frontend/src/pages/HomePage.tsx
/**
 * 系统首页 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 自定义 Hook 封装数据加载
 * - 快捷操作卡片交互增强
 * - 欢迎横幅动画
 * - 最近图书骨架屏优化
 * - 书架概览进度条
 * - 响应式布局优化
 * - 键盘导航支持
 * - 主题色适配
 */

import React, {
    useEffect,
    useState,
    useCallback,
    useMemo,
    type FC,
} from 'react';
import {
    Card,
    Row,
    Col,
    Typography,
    Button,
    Space,
    Statistic,
    List,
    Avatar,
    Tag,
    Skeleton,
    Empty,
    Progress,
    Tooltip,
    theme,
    Badge,
} from 'antd';
import {
    ScanOutlined,
    SearchOutlined,
    PlusOutlined,
    BookOutlined,
    AppstoreOutlined,
    ImportOutlined,
    DashboardOutlined,
    EnvironmentOutlined,
    RightOutlined,
    SyncOutlined,
    RocketOutlined,
    ThunderboltOutlined,
    StarFilled,
    HomeOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats, extractErrorMessage } from '../services/api';
import { formatNumber } from '../utils/format';
import type { DashboardStats } from '../types';

const { Title, Text, Paragraph } = Typography;

// ==================== 类型定义 ====================

interface QuickAction {
    key: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
    path: string;
    external?: boolean;
    shortcut?: string;
}

// ==================== 常量 ====================

const QUICK_ACTIONS: QuickAction[] = [
    {
        key: 'nfc',
        title: 'NFC 扫描',
        description: '使用手机扫描 NFC 标签，自动跳转到对应书架',
        icon: <ScanOutlined />,
        color: '#3b82f6',
        bgColor: '#eff6ff',
        path: '/api/nfc/mobile',
        external: true,
        shortcut: '📱',
    },
    {
        key: 'search',
        title: '图书搜索',
        description: '通过 ISBN 搜索并同步豆瓣图书信息',
        icon: <SearchOutlined />,
        color: '#22c55e',
        bgColor: '#f0fdf4',
        path: '/search',
        shortcut: '⌘K',
    },
    {
        key: 'add',
        title: '手动录入',
        description: '手动添加图书信息，支持完整元数据录入',
        icon: <PlusOutlined />,
        color: '#f97316',
        bgColor: '#fff7ed',
        path: '/books/add',
        shortcut: '✍️',
    },
    {
        key: 'wall',
        title: '封面墙',
        description: '以封面网格形式浏览所有藏书',
        icon: <AppstoreOutlined />,
        color: '#a855f7',
        bgColor: '#faf5ff',
        path: '/wall',
        shortcut: '🖼️',
    },
    {
        key: 'import',
        title: '批量导入',
        description: '从 Excel/CSV 文件批量导入图书',
        icon: <ImportOutlined />,
        color: '#06b6d4',
        bgColor: '#ecfeff',
        path: '/import',
        shortcut: '📥',
    },
    {
        key: 'dashboard',
        title: '管理仪表盘',
        description: '查看系统统计数据和图表分析',
        icon: <DashboardOutlined />,
        color: '#8B4513',
        bgColor: '#fdf6f0',
        path: '/admin',
        shortcut: '📊',
    },
];

// ==================== 自定义 Hook ====================

/**
 * 首页数据加载 Hook
 */
const useHomeData = () => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<DashboardStats | null>(null);

    const loadStats = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getDashboardStats();
            setStats(data);
        } catch (err: unknown) {
            console.error('[HomePage] 加载统计失败:', extractErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    return { stats, loading, refresh: loadStats };
};

// ==================== 子组件 ====================

/**
 * 快捷操作卡片
 */
const ActionCard: FC<{
    action: QuickAction;
    onClick: () => void;
    delay: number;
}> = React.memo(({ action, onClick, delay }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setVisible(true), delay);
        return () => clearTimeout(timer);
    }, [delay]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
            }
        },
        [onClick]
    );

    return (
        <Card
            hoverable
            onClick={onClick}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            role="button"
            aria-label={`${action.title}: ${action.description}`}
            style={{
                borderRadius: 14,
                border: `1px solid ${action.color}20`,
                height: '100%',
                cursor: 'pointer',
                transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: visible ? 'translateY(0)' : 'translateY(20px)',
                opacity: visible ? 1 : 0,
            }}
            styles={{ body: { padding: 22 } }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                {/* 图标 */}
                <div
                    style={{
                        width: 56,
                        height: 56,
                        borderRadius: 14,
                        background: action.bgColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: action.color,
                        fontSize: 26,
                        transition: 'transform 0.2s ease',
                    }}
                    className="action-icon"
                >
                    {action.icon}
                </div>

                {/* 内容 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 4,
                        }}
                    >
                        <Text strong style={{ fontSize: 16 }}>
                            {action.title}
                        </Text>
                        {action.shortcut && (
                            <Text
                                style={{
                                    fontSize: 14,
                                    opacity: 0.6,
                                }}
                            >
                                {action.shortcut}
                            </Text>
                        )}
                    </div>
                    <Text
                        type="secondary"
                        style={{
                            fontSize: 13,
                            lineHeight: 1.5,
                            display: 'block',
                        }}
                    >
                        {action.description}
                    </Text>
                </div>

                {/* 箭头 */}
                <RightOutlined
                    style={{
                        color: '#8c7b72',
                        fontSize: 14,
                        marginTop: 6,
                        flexShrink: 0,
                        transition: 'transform 0.2s ease',
                    }}
                    className="action-arrow"
                />
            </div>
        </Card>
    );
});
ActionCard.displayName = 'ActionCard';

// ==================== 主组件 ====================

const HomePage: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();

    // 数据
    const { stats, loading } = useHomeData();

    // ==================== 事件处理 ====================

    const handleActionClick = useCallback(
        (action: QuickAction) => {
            if (action.external) {
                window.open(action.path, '_blank');
            } else {
                navigate(action.path);
            }
        },
        [navigate]
    );

    const handleBookClick = useCallback(
        (bookId: number) => {
            navigate(`/shelf/1/book/${bookId}`);
        },
        [navigate]
    );

    const handleShelfClick = useCallback(
        (shelfId?: number) => {
            navigate(shelfId ? `/shelf/${shelfId}` : '/shelf/1');
        },
        [navigate]
    );

    // ==================== 渲染欢迎横幅 ====================

    const renderHeroBanner = () => {
        const gradientColors = [
            token.colorPrimary,
            token.colorPrimaryHover || '#a0522d',
            '#6b3410',
        ];

        return (
            <Card
                style={{
                    marginBottom: 28,
                    borderRadius: 20,
                    background: `linear-gradient(135deg, ${gradientColors[0]} 0%, ${gradientColors[1]} 50%, ${gradientColors[2]} 100%)`,
                    border: 'none',
                    overflow: 'hidden',
                    position: 'relative',
                    boxShadow: '0 8px 32px rgba(139, 69, 19, 0.25)',
                }}
                styles={{ body: { padding: '32px 36px' } }}
            >
                {/* 装饰背景 */}
                <div
                    style={{
                        position: 'absolute',
                        top: -50,
                        right: -30,
                        fontSize: 160,
                        opacity: 0.06,
                        color: '#fff',
                        pointerEvents: 'none',
                        animation: 'hero-float 6s ease-in-out infinite',
                    }}
                >
                    📚
                </div>
                <div
                    style={{
                        position: 'absolute',
                        bottom: -30,
                        left: '20%',
                        fontSize: 80,
                        opacity: 0.04,
                        color: '#fff',
                        pointerEvents: 'none',
                        animation: 'hero-float 8s ease-in-out infinite reverse',
                    }}
                >
                    📖
                </div>

                <Row gutter={[28, 28]} align="middle">
                    {/* 左侧文本 */}
                    <Col xs={24} md={16}>
                        <div style={{ position: 'relative', zIndex: 1 }}>
                            <Title
                                level={1}
                                style={{
                                    color: '#fff',
                                    marginBottom: 10,
                                    fontSize: 'clamp(24px, 4vw, 38px)',
                                    fontWeight: 800,
                                    letterSpacing: '-0.02em',
                                }}
                            >
                                📚 书房管理系统
                            </Title>
                            <Paragraph
                                style={{
                                    color: 'rgba(255,255,255,0.88)',
                                    fontSize: 'clamp(14px, 2vw, 17px)',
                                    marginBottom: 20,
                                    maxWidth: 560,
                                    lineHeight: 1.6,
                                }}
                            >
                                基于 NFC 技术连接实体书架与数字信息，支持豆瓣数据同步、
                                封面墙展示、批量导入等智能图书管理功能
                            </Paragraph>
                            <Space wrap size={12}>
                                <Button
                                    type="primary"
                                    size="large"
                                    icon={<ScanOutlined />}
                                    onClick={() =>
                                        window.open('/api/nfc/mobile', '_blank')
                                    }
                                    style={{
                                        borderRadius: 10,
                                        background: '#fff',
                                        color: token.colorPrimary,
                                        border: 'none',
                                        fontWeight: 600,
                                        height: 48,
                                        paddingInline: 24,
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    }}
                                >
                                    打开手机端 NFC
                                </Button>
                                <Button
                                    size="large"
                                    ghost
                                    icon={<SearchOutlined />}
                                    onClick={() => navigate('/search')}
                                    style={{
                                        borderRadius: 10,
                                        color: '#fff',
                                        borderColor: 'rgba(255,255,255,0.4)',
                                        height: 48,
                                        paddingInline: 24,
                                    }}
                                >
                                    搜索图书 (⌘K)
                                </Button>
                            </Space>
                        </div>
                    </Col>

                    {/* 右侧统计 */}
                    <Col xs={24} md={8}>
                        {loading ? (
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <Skeleton
                                    active
                                    paragraph={{ rows: 2 }}
                                    title={false}
                                />
                            </div>
                        ) : stats ? (
                            <Row
                                gutter={[12, 12]}
                                style={{ position: 'relative', zIndex: 1 }}
                            >
                                <Col span={12}>
                                    <Card
                                        size="small"
                                        style={{
                                            borderRadius: 12,
                                            background: 'rgba(255,255,255,0.14)',
                                            border: '1px solid rgba(255,255,255,0.18)',
                                            textAlign: 'center',
                                            backdropFilter: 'blur(8px)',
                                        }}
                                    >
                                        <Statistic
                                            title={
                                                <span
                                                    style={{
                                                        color: 'rgba(255,255,255,0.7)',
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    📚 馆藏图书
                                                </span>
                                            }
                                            value={stats.total_books || 0}
                                            styles={{
                                                content: {
                                                    color: '#fff',
                                                    fontSize: 26,
                                                    fontWeight: 700,
                                                },
                                            }}
                                            suffix={
                                                <span
                                                    style={{
                                                        color: 'rgba(255,255,255,0.5)',
                                                        fontSize: 13,
                                                    }}
                                                >
                                                    本
                                                </span>
                                            }
                                        />
                                    </Card>
                                </Col>
                                <Col span={12}>
                                    <Card
                                        size="small"
                                        style={{
                                            borderRadius: 12,
                                            background: 'rgba(255,255,255,0.14)',
                                            border: '1px solid rgba(255,255,255,0.18)',
                                            textAlign: 'center',
                                            backdropFilter: 'blur(8px)',
                                        }}
                                    >
                                        <Statistic
                                            title={
                                                <span
                                                    style={{
                                                        color: 'rgba(255,255,255,0.7)',
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    📂 书架数量
                                                </span>
                                            }
                                            value={stats.logical_shelves || 0}
                                            styles={{
                                                content: {
                                                    color: '#fff',
                                                    fontSize: 26,
                                                    fontWeight: 700,
                                                },
                                            }}
                                            suffix={
                                                <span
                                                    style={{
                                                        color: 'rgba(255,255,255,0.5)',
                                                        fontSize: 13,
                                                    }}
                                                >
                                                    个
                                                </span>
                                            }
                                        />
                                    </Card>
                                </Col>
                                <Col span={12}>
                                    <Card
                                        size="small"
                                        style={{
                                            borderRadius: 12,
                                            background: 'rgba(255,255,255,0.14)',
                                            border: '1px solid rgba(255,255,255,0.18)',
                                            textAlign: 'center',
                                            backdropFilter: 'blur(8px)',
                                        }}
                                    >
                                        <Statistic
                                            title={
                                                <span
                                                    style={{
                                                        color: 'rgba(255,255,255,0.7)',
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    🆕 今日新增
                                                </span>
                                            }
                                            value={stats.today_books || 0}
                                            styles={{
                                                content: {
                                                    color: '#fff',
                                                    fontSize: 26,
                                                    fontWeight: 700,
                                                },
                                            }}
                                            suffix={
                                                <span
                                                    style={{
                                                        color: 'rgba(255,255,255,0.5)',
                                                        fontSize: 13,
                                                    }}
                                                >
                                                    本
                                                </span>
                                            }
                                        />
                                    </Card>
                                </Col>
                                <Col span={12}>
                                    <Card
                                        size="small"
                                        style={{
                                            borderRadius: 12,
                                            background: 'rgba(255,255,255,0.14)',
                                            border: '1px solid rgba(255,255,255,0.18)',
                                            textAlign: 'center',
                                            backdropFilter: 'blur(8px)',
                                        }}
                                    >
                                        <Statistic
                                            title={
                                                <span
                                                    style={{
                                                        color: 'rgba(255,255,255,0.7)',
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    🔗 活跃映射
                                                </span>
                                            }
                                            value={stats.active_mappings || 0}
                                            styles={{
                                                content: {
                                                    color: '#fff',
                                                    fontSize: 26,
                                                    fontWeight: 700,
                                                },
                                            }}
                                            suffix={
                                                <span
                                                    style={{
                                                        color: 'rgba(255,255,255,0.5)',
                                                        fontSize: 13,
                                                    }}
                                                >
                                                    个
                                                </span>
                                            }
                                        />
                                    </Card>
                                </Col>
                            </Row>
                        ) : null}
                    </Col>
                </Row>
            </Card>
        );
    };

    // ==================== 渲染快捷操作 ====================

    const renderQuickActions = () => (
        <>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 18,
                }}
            >
                <Title level={3} style={{ margin: 0 }}>
                    <ThunderboltOutlined
                        style={{ marginRight: 10, color: token.colorPrimary }}
                    />
                    快捷操作
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                    点击或使用快捷键
                </Text>
            </div>
            <Row gutter={[16, 16]} style={{ marginBottom: 28 }}>
                {QUICK_ACTIONS.map((action, index) => (
                    <Col xs={24} sm={12} md={8} lg={8} key={action.key}>
                        <ActionCard
                            action={action}
                            onClick={() => handleActionClick(action)}
                            delay={index * 80}
                        />
                    </Col>
                ))}
            </Row>
        </>
    );

    // ==================== 渲染最近添加 + 书架概览 ====================

    const renderBottomSection = () => (
        <Row gutter={[24, 24]}>
            {/* 最近添加 */}
            <Col xs={24} md={12}>
                <Card
                    title={
                        <Space size={6}>
                            <StarFilled style={{ color: '#f59e0b' }} />
                            <span>最近添加</span>
                            {stats?.recent_books?.length ? (
                                <Badge
                                    count={stats.recent_books.length}
                                    size="small"
                                    style={{ backgroundColor: token.colorPrimary }}
                                />
                            ) : null}
                        </Space>
                    }
                    extra={
                        <Button
                            type="text"
                            size="small"
                            onClick={() => navigate('/wall')}
                        >
                            查看全部 <RightOutlined />
                        </Button>
                    }
                    style={{
                        borderRadius: 14,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        height: '100%',
                    }}
                    styles={{ body: { padding: '12px 20px' } }}
                >
                    {loading ? (
                        <div>
                            {[1, 2, 3, 4, 5].map((i) => (
                                <Skeleton
                                    key={i}
                                    active
                                    avatar={{ size: 40, shape: 'square' }}
                                    paragraph={{ rows: 1 }}
                                    title={{ width: '60%' }}
                                />
                            ))}
                        </div>
                    ) : stats?.recent_books?.length ? (
                        <List
                            dataSource={stats.recent_books.slice(0, 5)}
                            renderItem={(book) => (
                                <List.Item
                                    style={{
                                        padding: '10px 0',
                                        cursor: 'pointer',
                                        borderRadius: 8,
                                        transition: 'background 0.15s ease',
                                    }}
                                    onClick={() => handleBookClick(book.book_id)}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background =
                                            token.colorFillSecondary;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                    }}
                                >
                                    <List.Item.Meta
                                        avatar={
                                            <Avatar
                                                shape="square"
                                                size={44}
                                                icon={<BookOutlined />}
                                                style={{
                                                    background: token.colorPrimaryBg,
                                                    color: token.colorPrimary,
                                                    borderRadius: 8,
                                                }}
                                            />
                                        }
                                        title={
                                            <Text
                                                style={{ fontSize: 14 }}
                                                ellipsis
                                                title={book.title}
                                            >
                                                {book.title}
                                            </Text>
                                        }
                                        description={
                                            <Space size={6} wrap>
                                                <Text
                                                    type="secondary"
                                                    style={{ fontSize: 11 }}
                                                >
                                                    {book.isbn}
                                                </Text>
                                                <Tag
                                                    color={
                                                        book.source === 'douban'
                                                            ? 'green'
                                                            : 'orange'
                                                    }
                                                    style={{
                                                        fontSize: 10,
                                                        margin: 0,
                                                        padding: '0 6px',
                                                        lineHeight: '18px',
                                                    }}
                                                >
                                                    {book.source === 'douban'
                                                        ? '豆瓣'
                                                        : '手动'}
                                                </Tag>
                                                {book.rating && (
                                                    <Text
                                                        style={{
                                                            fontSize: 11,
                                                            color: '#f59e0b',
                                                        }}
                                                    >
                                                        ⭐ {book.rating}
                                                    </Text>
                                                )}
                                            </Space>
                                        }
                                    />
                                </List.Item>
                            )}
                            split
                        />
                    ) : (
                        <Empty
                            description="暂无图书"
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            style={{ padding: 20 }}
                        >
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={() => navigate('/books/add')}
                                size="small"
                            >
                                添加图书
                            </Button>
                        </Empty>
                    )}
                </Card>
            </Col>

            {/* 书架概览 */}
            <Col xs={24} md={12}>
                <Card
                    title={
                        <Space size={6}>
                            <EnvironmentOutlined
                                style={{ color: token.colorPrimary }}
                            />
                            <span>书架概览</span>
                            {stats?.shelf_utilization?.length ? (
                                <Badge
                                    count={stats.shelf_utilization.length}
                                    size="small"
                                    style={{ backgroundColor: token.colorPrimary }}
                                />
                            ) : null}
                        </Space>
                    }
                    extra={
                        <Button
                            type="text"
                            size="small"
                            onClick={() => navigate('/admin/shelves')}
                        >
                            管理书架 <RightOutlined />
                        </Button>
                    }
                    style={{
                        borderRadius: 14,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        height: '100%',
                    }}
                    styles={{ body: { padding: '12px 20px' } }}
                >
                    {loading ? (
                        <div>
                            {[1, 2, 3, 4, 5].map((i) => (
                                <Skeleton
                                    key={i}
                                    active
                                    paragraph={{ rows: 1 }}
                                    title={{ width: '40%' }}
                                />
                            ))}
                        </div>
                    ) : stats?.shelf_utilization?.length ? (
                        <List
                            dataSource={stats.shelf_utilization.slice(0, 5)}
                            renderItem={(shelf) => {
                                const percent = Math.round(shelf.percentage);
                                const strokeColor =
                                    percent > 80
                                        ? '#ef4444'
                                        : percent > 60
                                        ? '#f59e0b'
                                        : '#22c55e';

                                return (
                                    <List.Item
                                        style={{
                                            padding: '10px 0',
                                            cursor: 'pointer',
                                            borderRadius: 8,
                                            transition: 'background 0.15s ease',
                                        }}
                                        onClick={() =>
                                            handleShelfClick(
                                                (shelf as any).shelf_id
                                            )
                                        }
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background =
                                                token.colorFillSecondary;
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background =
                                                'transparent';
                                        }}
                                    >
                                        <List.Item.Meta
                                            avatar={
                                                <div
                                                    style={{
                                                        width: 44,
                                                        height: 44,
                                                        borderRadius: 10,
                                                        background:
                                                            'linear-gradient(135deg, #fef3c7, #fde68a)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    <BookOutlined
                                                        style={{
                                                            color: '#92400e',
                                                            fontSize: 18,
                                                        }}
                                                    />
                                                </div>
                                            }
                                            title={
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent:
                                                            'space-between',
                                                        alignItems: 'center',
                                                    }}
                                                >
                                                    <Text
                                                        style={{ fontSize: 14 }}
                                                        ellipsis
                                                    >
                                                        {shelf.shelf_name}
                                                    </Text>
                                                    <Text
                                                        strong
                                                        style={{
                                                            fontSize: 13,
                                                            color: strokeColor,
                                                        }}
                                                    >
                                                        {shelf.book_count} 本
                                                    </Text>
                                                </div>
                                            }
                                            description={
                                                <Progress
                                                    percent={percent}
                                                    strokeColor={strokeColor}
                                                    railColor={
                                                        token.colorFillSecondary
                                                    }
                                                    size="small"
                                                    showInfo={false}
                                                    style={{ marginBottom: 0 }}
                                                />
                                            }
                                        />
                                    </List.Item>
                                );
                            }}
                            split
                        />
                    ) : (
                        <Empty
                            description="暂无书架"
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            style={{ padding: 20 }}
                        >
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={() => navigate('/admin/shelves')}
                                size="small"
                            >
                                创建书架
                            </Button>
                        </Empty>
                    )}
                </Card>
            </Col>
        </Row>
    );

    // ==================== 渲染页面 ====================

    return (
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
            {/* 欢迎横幅 */}
            {renderHeroBanner()}

            {/* 快捷操作 */}
            {renderQuickActions()}

            {/* 最近添加 + 书架概览 */}
            {renderBottomSection()}

            {/* 悬停动画样式 */}
            <style>{`
                @keyframes hero-float {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-15px) rotate(5deg); }
                }
                .action-card:hover .action-icon {
                    transform: scale(1.08);
                }
                .action-card:hover .action-arrow {
                    transform: translateX(4px);
                }
            `}</style>
        </div>
    );
};

export default HomePage;