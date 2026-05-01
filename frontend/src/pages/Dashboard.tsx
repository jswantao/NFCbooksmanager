// frontend/src/pages/Dashboard.tsx
/**
 * 管理仪表盘页面 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 自定义 Hooks 封装数据加载
 * - 时间范围筛选（本周/本月/本季/本年）
 * - 统计卡片入场动画
 * - 排行榜交互增强
 * - 响应式网格优化
 * - 图表加载骨架屏
 * - 导出统计报告
 * - 主题色适配
 */

import React, {
    useEffect,
    useState,
    useCallback,
    useMemo,
    useRef,
    type FC,
} from 'react';
import {
    Card,
    Row,
    Col,
    Statistic,
    Tag,
    Typography,
    Breadcrumb,
    Empty,
    Alert,
    Button,
    Skeleton,
    Tooltip,
    Space,
    Badge,
    Progress,
    Timeline,
    Segmented,
    List,
    Avatar,
    theme,
    Dropdown,
    Divider,
    type MenuProps,
} from 'antd';
import {
    BookOutlined,
    EnvironmentOutlined,
    LinkOutlined,
    DatabaseOutlined,
    SyncOutlined,
    AppstoreOutlined,
    HomeOutlined,
    ReloadOutlined,
    CheckCircleOutlined,
    ExclamationCircleOutlined,
    ClockCircleOutlined,
    UserOutlined,
    FundOutlined,
    PieChartOutlined,
    BarChartOutlined,
    LineChartOutlined,
    TrophyOutlined,
    RocketOutlined,
    StarFilled,
    RiseOutlined,
    FileTextOutlined,
    HeatMapOutlined,
    DownloadOutlined,
    EyeOutlined,
    CalendarOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats, extractErrorMessage } from '../services/api';
import { formatNumber, formatPercent } from '../utils/format';
import ReadingTrendChart from '../components/charts/ReadingTrendChart';
import SourcePieChart from '../components/charts/SourcePieChart';
import RatingBarChart from '../components/charts/RatingBarChart';
import ReadingHeatmap from '../components/charts/ReadingHeatmap';
import LoadingScreen from '../components/LoadingScreen';
import ErrorBoundary from '../components/ErrorBoundary';
import type { DashboardStats } from '../types';

const { Title, Text } = Typography;

// ==================== 常量 ====================

/** 统计卡片配置 */
const STAT_CARDS = [
    {
        key: 'physical_shelves' as const,
        title: '物理书架',
        icon: <EnvironmentOutlined />,
        color: '#3b82f6',
        bgColor: '#eff6ff',
        borderColor: '#bfdbfe',
    },
    {
        key: 'logical_shelves' as const,
        title: '逻辑书架',
        icon: <AppstoreOutlined />,
        color: '#22c55e',
        bgColor: '#f0fdf4',
        borderColor: '#bbf7d0',
    },
    {
        key: 'active_mappings' as const,
        title: '活跃映射',
        icon: <LinkOutlined />,
        color: '#a855f7',
        bgColor: '#faf5ff',
        borderColor: '#e9d5ff',
    },
    {
        key: 'total_books' as const,
        title: '馆藏图书',
        icon: <BookOutlined />,
        color: '#f97316',
        bgColor: '#fff7ed',
        borderColor: '#fed7aa',
    },
    {
        key: 'books_in_shelves' as const,
        title: '上架图书',
        icon: <DatabaseOutlined />,
        color: '#06b6d4',
        bgColor: '#ecfeff',
        borderColor: '#a5f3fc',
    },
] as const;

/** 时间范围选项 */
const TIME_RANGE_OPTIONS = [
    { label: '📅 本周', value: 'week' },
    { label: '📅 本月', value: 'month' },
    { label: '📅 本季', value: 'quarter' },
    { label: '📅 本年', value: 'year' },
];

/** 活动类型配置 */
const ACTIVITY_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    sync: { icon: <SyncOutlined />, color: '#22c55e', label: '同步' },
    add: { icon: <RocketOutlined />, color: '#3b82f6', label: '添加' },
    update: { icon: <RiseOutlined />, color: '#f59e0b', label: '更新' },
    delete: { icon: <ExclamationCircleOutlined />, color: '#ef4444', label: '删除' },
    mapping: { icon: <LinkOutlined />, color: '#a855f7', label: '映射' },
    system: { icon: <FundOutlined />, color: '#6366f1', label: '系统' },
};

// ==================== 自定义 Hook ====================

/**
 * 仪表盘数据加载 Hook
 */
const useDashboardData = () => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await getDashboardStats();
            setStats(data);
        } catch (err: unknown) {
            const errorMsg = extractErrorMessage(err) || '加载数据失败';
            setError(errorMsg);
            console.error('[Dashboard] 加载失败:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const refresh = useCallback(() => {
        setRefreshing(true);
        loadData();
    }, [loadData]);

    return { stats, loading, error, refreshing, refresh };
};

// ==================== 子组件 ====================

/**
 * 统计卡片（入场动画）
 */
const StatCard: FC<{
    title: string;
    value: number;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
    borderColor: string;
    loading?: boolean;
    delay?: number;
}> = React.memo(({ title, value, icon, color, bgColor, borderColor, loading, delay = 0 }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setVisible(true), delay);
        return () => clearTimeout(timer);
    }, [delay]);

    return (
        <Card
            hoverable
            style={{
                borderRadius: 14,
                border: `1px solid ${borderColor}`,
                background: bgColor,
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: visible ? 'translateY(0)' : 'translateY(24px)',
                opacity: visible ? 1 : 0,
                height: '100%',
                overflow: 'hidden',
                position: 'relative',
            }}
            styles={{ body: { padding: 22 } }}
        >
            {/* 装饰背景圆 */}
            <div
                style={{
                    position: 'absolute',
                    top: -24,
                    right: -24,
                    width: 90,
                    height: 90,
                    borderRadius: '50%',
                    background: color,
                    opacity: 0.06,
                    pointerEvents: 'none',
                }}
            />

            {loading ? (
                <Skeleton active paragraph={{ rows: 1 }} />
            ) : (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <div style={{ flex: 1 }}>
                        <Text
                            type="secondary"
                            style={{
                                fontSize: 13,
                                fontWeight: 500,
                                display: 'block',
                                marginBottom: 6,
                            }}
                        >
                            {title}
                        </Text>
                        <span
                            style={{
                                fontSize: 34,
                                fontWeight: 700,
                                color,
                                lineHeight: 1,
                            }}
                        >
                            {formatNumber(value)}
                        </span>
                    </div>
                    <div
                        style={{
                            width: 60,
                            height: 60,
                            borderRadius: 16,
                            background: `${color}12`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            marginLeft: 16,
                            fontSize: 28,
                        }}
                    >
                        {icon}
                    </div>
                </div>
            )}
        </Card>
    );
});
StatCard.displayName = 'StatCard';

/**
 * 排行榜列表
 */
const RankingList: FC<{
    data: { name: string; count: number; percentage?: number }[];
    maxShow?: number;
    onItemClick?: (item: { name: string; count: number }) => void;
}> = React.memo(({ data, maxShow = 8, onItemClick }) => {
    const displayData = data.slice(0, maxShow);
    const maxCount = Math.max(...displayData.map((d) => d.count), 1);
    const medals = ['🥇', '🥈', '🥉'];

    if (displayData.length === 0) {
        return (
            <Empty
                description="暂无数据"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {displayData.map((item, index) => {
                const percentage = item.percentage ?? Math.round((item.count / maxCount) * 100);
                const isTop3 = index < 3;
                const barColor = isTop3
                    ? ['#f59e0b', '#a8a29e', '#d4a574'][index]
                    : '#8B4513';

                return (
                    <div
                        key={item.name}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 12px',
                            borderRadius: 10,
                            background: isTop3 ? '#fafaf9' : 'transparent',
                            transition: 'all 0.2s ease',
                            cursor: onItemClick ? 'pointer' : 'default',
                        }}
                        onClick={() => onItemClick?.(item)}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#fdf6f0';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = isTop3 ? '#fafaf9' : 'transparent';
                        }}
                    >
                        {/* 排名 */}
                        <span
                            style={{
                                fontSize: 18,
                                width: 28,
                                textAlign: 'center',
                                flexShrink: 0,
                            }}
                        >
                            {isTop3 ? medals[index] : (
                                <Text type="secondary" style={{ fontSize: 13 }}>
                                    {index + 1}
                                </Text>
                            )}
                        </span>

                        {/* 名称 */}
                        <Text
                            style={{
                                flex: 1,
                                fontSize: 13,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                            title={item.name}
                        >
                            {item.name}
                        </Text>

                        {/* 进度条 */}
                        <div style={{ width: 120 }}>
                            <Progress
                                percent={percentage}
                                strokeColor={barColor}
                                trailColor="#f0e4d8"
                                size="small"
                                showInfo={false}
                            />
                        </div>

                        {/* 数量 */}
                        <Text
                            strong
                            style={{
                                fontSize: 14,
                                minWidth: 36,
                                textAlign: 'right',
                                color: barColor,
                            }}
                        >
                            {item.count}
                        </Text>
                    </div>
                );
            })}
        </div>
    );
});
RankingList.displayName = 'RankingList';

// ==================== 主组件 ====================

const Dashboard: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();

    // 数据
    const { stats, loading, error, refreshing, refresh } = useDashboardData();

    // 时间范围
    const [timeRange, setTimeRange] = useState<string>('month');

    // ==================== 衍生数据 ====================

    /** 来源分布（饼图格式） */
    const sourcePieData = useMemo(() => {
        if (!stats?.books_by_source) return [];

        const sourceLabels: Record<string, { name: string; color: string; icon?: string }> = {
            douban: { name: '豆瓣同步', color: '#22c55e', icon: '🟢' },
            manual: { name: '手动录入', color: '#f97316', icon: '🟠' },
            isbn: { name: 'ISBN 扫描', color: '#3b82f6', icon: '🔵' },
            nfc: { name: 'NFC 识别', color: '#a855f7', icon: '🟣' },
        };

        return Object.entries(stats.books_by_source)
            .filter(([, count]) => count > 0)
            .map(([source, count]) => ({
                name: sourceLabels[source]?.name || source,
                value: count,
                color: sourceLabels[source]?.color || '#8c7b72',
                icon: sourceLabels[source]?.icon,
            }));
    }, [stats]);

    /** 评分分布 */
    const ratingBarData = useMemo(() => {
        if (!stats?.rating_distribution) return [];
        return stats.rating_distribution.filter((item) => item.count > 0);
    }, [stats]);

    /** 热力图数据 */
    const heatmapData = useMemo(() => {
        if (
            !stats?.shelf_utilization?.length ||
            !stats?.monthly_growth?.length
        ) {
            return null;
        }

        const months = stats.monthly_growth.map((m) => m.month);
        const categories = stats.shelf_utilization.map((s) => s.shelf_name);
        const totalGrowth = stats.monthly_growth.reduce((sum, m) => sum + m.count, 0) || 1;

        const matrixData = stats.shelf_utilization.map((shelf) =>
            stats.monthly_growth.map((month) =>
                Math.max(1, Math.round((shelf.book_count * month.count) / totalGrowth))
            )
        );

        return { months, categories, data: matrixData };
    }, [stats]);

    /** 增长趋势 */
    const trendData = useMemo(() => {
        if (!stats?.monthly_growth) return [];
        return stats.monthly_growth;
    }, [stats]);

    // ==================== 导出报告 ====================

    const handleExport = useCallback(() => {
        if (!stats) return;

        const report = {
            统计时间: new Date().toISOString(),
            物理书架: stats.physical_shelves,
            逻辑书架: stats.logical_shelves,
            活跃映射: stats.active_mappings,
            馆藏图书: stats.total_books,
            上架图书: stats.books_in_shelves,
            未上架: stats.books_not_in_shelf,
            今日新增: stats.today_books,
            同步次数: stats.sync_count,
            来源分布: stats.books_by_source,
            评分分布: stats.rating_distribution,
            书架利用率: stats.shelf_utilization,
        };

        const blob = new Blob([JSON.stringify(report, null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dashboard-report-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        message.success('报告已下载');
    }, [stats]);

    const exportMenuItems: MenuProps['items'] = [
        {
            key: 'json',
            icon: <DownloadOutlined />,
            label: '导出 JSON',
            onClick: handleExport,
        },
    ];

    // ==================== 渲染加载状态 ====================

    if (loading && !stats) {
        return (
            <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
                <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 24 }} />
                <Row gutter={[16, 16]}>
                    {STAT_CARDS.map((_, index) => (
                        <Col xs={24} sm={12} lg={8} xl={24 / 5} key={index}>
                            <Card style={{ borderRadius: 12 }}>
                                <Skeleton active paragraph={{ rows: 1 }} />
                            </Card>
                        </Col>
                    ))}
                </Row>
                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col xs={24} lg={12}>
                        <Card style={{ borderRadius: 12, minHeight: 400 }}>
                            <Skeleton active paragraph={{ rows: 8 }} />
                        </Card>
                    </Col>
                    <Col xs={24} lg={12}>
                        <Card style={{ borderRadius: 12, minHeight: 400 }}>
                            <Skeleton active paragraph={{ rows: 8 }} />
                        </Card>
                    </Col>
                </Row>
            </div>
        );
    }

    // ==================== 渲染错误状态 ====================

    if (error && !stats) {
        return (
            <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
                <Breadcrumb
                    style={{ marginBottom: 16 }}
                    items={[
                        { title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> },
                        { title: '管理仪表盘' },
                    ]}
                />
                <Alert
                    message="数据加载失败"
                    description={error}
                    type="error"
                    showIcon
                    style={{ borderRadius: 10 }}
                    action={
                        <Button type="primary" size="small" onClick={refresh}>
                            重试
                        </Button>
                    }
                />
            </div>
        );
    }

    if (!stats) return null;

    // ==================== 主渲染 ====================

    return (
        <ErrorBoundary>
            <div style={{ maxWidth: 1600, margin: '0 auto', padding: 24 }}>
                {/* 面包屑 */}
                <Breadcrumb
                    style={{ marginBottom: 16 }}
                    items={[
                        {
                            title: (
                                <a onClick={() => navigate('/')}>
                                    <HomeOutlined /> 首页
                                </a>
                            ),
                        },
                        {
                            title: (
                                <span>
                                    <FundOutlined /> 管理仪表盘
                                </span>
                            ),
                        },
                    ]}
                />

                {/* 页头 */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 16,
                        marginBottom: 28,
                    }}
                >
                    <div>
                        <Title level={2} style={{ margin: 0 }}>
                            <FundOutlined
                                style={{ marginRight: 12, color: token.colorPrimary }}
                            />
                            管理仪表盘
                        </Title>
                        <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                            系统概览与数据分析 · 共 {formatNumber(stats.total_books)} 本藏书
                        </Text>
                    </div>

                    <Space wrap size={12}>
                        <Segmented
                            options={TIME_RANGE_OPTIONS}
                            value={timeRange}
                            onChange={(v) => setTimeRange(v as string)}
                            size="middle"
                        />
                        <Tooltip title="刷新数据">
                            <Button
                                icon={<ReloadOutlined spin={refreshing} />}
                                onClick={refresh}
                                loading={refreshing}
                                style={{ borderRadius: 8 }}
                            >
                                刷新
                            </Button>
                        </Tooltip>
                        <Dropdown menu={{ items: exportMenuItems }}>
                            <Button
                                icon={<DownloadOutlined />}
                                style={{ borderRadius: 8 }}
                            >
                                导出
                            </Button>
                        </Dropdown>
                    </Space>
                </div>

                {/* 统计卡片 */}
                <Row gutter={[18, 18]} style={{ marginBottom: 28 }}>
                    {STAT_CARDS.map((config, index) => (
                        <Col xs={24} sm={12} md={8} lg={24 / 5} key={config.key}>
                            <StatCard
                                title={config.title}
                                value={(stats[config.key] as number) || 0}
                                icon={config.icon}
                                color={config.color}
                                bgColor={config.bgColor}
                                borderColor={config.borderColor}
                                loading={loading}
                                delay={index * 60}
                            />
                        </Col>
                    ))}
                </Row>

                {/* 主要内容区 */}
                <Row gutter={[18, 18]}>
                    {/* 左侧列 */}
                    <Col xs={24} lg={12}>
                        {/* 增长趋势 */}
                        {trendData.length > 0 && (
                            <Card
                                title={
                                    <Space size={6}>
                                        <LineChartOutlined style={{ color: token.colorPrimary }} />
                                        <span>藏书增长趋势</span>
                                    </Space>
                                }
                                style={{
                                    borderRadius: 14,
                                    border: `1px solid ${token.colorBorderSecondary}`,
                                    marginBottom: 18,
                                }}
                                loading={loading}
                            >
                                <ReadingTrendChart
                                    data={trendData}
                                    height={300}
                                    loading={loading}
                                />
                            </Card>
                        )}

                        {/* 评分分布 + 来源分布 */}
                        <Row gutter={[18, 18]}>
                            <Col xs={24} sm={12}>
                                <Card
                                    title={
                                        <Space size={6}>
                                            <StarFilled style={{ color: '#f59e0b' }} />
                                            <span>评分分布</span>
                                        </Space>
                                    }
                                    style={{
                                        borderRadius: 14,
                                        border: `1px solid ${token.colorBorderSecondary}`,
                                        marginBottom: 18,
                                    }}
                                    loading={loading}
                                >
                                    {ratingBarData.length > 0 ? (
                                        <RatingBarChart
                                            data={ratingBarData}
                                            height={280}
                                            layout="vertical"
                                            loading={loading}
                                        />
                                    ) : (
                                        <Empty
                                            description="暂无评分数据"
                                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        />
                                    )}
                                </Card>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Card
                                    title={
                                        <Space size={6}>
                                            <PieChartOutlined style={{ color: token.colorPrimary }} />
                                            <span>来源分布</span>
                                        </Space>
                                    }
                                    style={{
                                        borderRadius: 14,
                                        border: `1px solid ${token.colorBorderSecondary}`,
                                        marginBottom: 18,
                                    }}
                                    loading={loading}
                                >
                                    {sourcePieData.length > 0 ? (
                                        <SourcePieChart
                                            data={sourcePieData}
                                            height={300}
                                            showLegend
                                            showCenterLabel
                                            loading={loading}
                                        />
                                    ) : (
                                        <Empty
                                            description="暂无数据"
                                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        />
                                    )}
                                </Card>
                            </Col>
                        </Row>

                        {/* 书架利用率 */}
                        {stats.shelf_utilization?.length > 0 && (
                            <Card
                                title={
                                    <Space size={6}>
                                        <BarChartOutlined style={{ color: token.colorPrimary }} />
                                        <span>书架利用率</span>
                                    </Space>
                                }
                                style={{
                                    borderRadius: 14,
                                    border: `1px solid ${token.colorBorderSecondary}`,
                                    marginBottom: 18,
                                }}
                            >
                                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                                    {stats.shelf_utilization.map((item, index) => {
                                        const percent = Math.round(item.percentage);
                                        const strokeColor =
                                            percent > 80
                                                ? '#ef4444'
                                                : percent > 60
                                                ? '#f59e0b'
                                                : '#22c55e';

                                        return (
                                            <div key={index}>
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        marginBottom: 6,
                                                    }}
                                                >
                                                    <Text style={{ fontSize: 13 }}>
                                                        {item.shelf_name}
                                                    </Text>
                                                    <Space size={4}>
                                                        <Text strong style={{ fontSize: 13 }}>
                                                            {item.book_count} 本
                                                        </Text>
                                                        <Text
                                                            type="secondary"
                                                            style={{ fontSize: 11 }}
                                                        >
                                                            ({percent}%)
                                                        </Text>
                                                    </Space>
                                                </div>
                                                <Progress
                                                    percent={percent}
                                                    strokeColor={strokeColor}
                                                    trailColor={token.colorFillSecondary}
                                                    size="small"
                                                    showInfo={false}
                                                />
                                            </div>
                                        );
                                    })}
                                </Space>
                            </Card>
                        )}
                    </Col>

                    {/* 右侧列 */}
                    <Col xs={24} lg={12}>
                        {/* 出版社排行 */}
                        <Card
                            title={
                                <Space size={6}>
                                    <TrophyOutlined style={{ color: '#f59e0b' }} />
                                    <span>出版社排行</span>
                                </Space>
                            }
                            style={{
                                borderRadius: 14,
                                border: `1px solid ${token.colorBorderSecondary}`,
                                marginBottom: 18,
                            }}
                        >
                            <RankingList data={stats.top_publishers || []} maxShow={8} />
                        </Card>

                        {/* 作者排行 */}
                        <Card
                            title={
                                <Space size={6}>
                                    <UserOutlined style={{ color: token.colorPrimary }} />
                                    <span>作者排行</span>
                                </Space>
                            }
                            style={{
                                borderRadius: 14,
                                border: `1px solid ${token.colorBorderSecondary}`,
                                marginBottom: 18,
                            }}
                        >
                            <RankingList data={stats.top_authors || []} maxShow={8} />
                        </Card>

                        {/* 最近活动 */}
                        {stats.recent_activities?.length > 0 && (
                            <Card
                                title={
                                    <Space size={6}>
                                        <ClockCircleOutlined style={{ color: token.colorPrimary }} />
                                        <span>最近活动</span>
                                    </Space>
                                }
                                style={{
                                    borderRadius: 14,
                                    border: `1px solid ${token.colorBorderSecondary}`,
                                    marginBottom: 18,
                                }}
                            >
                                <Timeline
                                    items={stats.recent_activities.slice(0, 8).map((activity) => {
                                        const config =
                                            ACTIVITY_CONFIG[activity.type] || ACTIVITY_CONFIG.system;
                                        return {
                                            color: config.color,
                                            dot: config.icon,
                                            children: (
                                                <div>
                                                    <Space size={4}>
                                                        <Tag
                                                            color={config.color}
                                                            style={{ fontSize: 10, margin: 0 }}
                                                        >
                                                            {config.label}
                                                        </Tag>
                                                        <Text style={{ fontSize: 13 }}>
                                                            {activity.detail}
                                                        </Text>
                                                    </Space>
                                                    <br />
                                                    <Text
                                                        type="secondary"
                                                        style={{ fontSize: 11 }}
                                                    >
                                                        {activity.timestamp}
                                                    </Text>
                                                </div>
                                            ),
                                        };
                                    })}
                                />
                            </Card>
                        )}

                        {/* 最近添加 */}
                        <Card
                            title={
                                <Space size={6}>
                                    <BookOutlined style={{ color: token.colorPrimary }} />
                                    <span>最近添加</span>
                                </Space>
                            }
                            style={{
                                borderRadius: 14,
                                border: `1px solid ${token.colorBorderSecondary}`,
                                marginBottom: 18,
                            }}
                        >
                            {stats.recent_books?.length > 0 ? (
                                <List
                                    dataSource={stats.recent_books.slice(0, 5)}
                                    renderItem={(book) => (
                                        <List.Item
                                            style={{
                                                padding: '10px 0',
                                                cursor: 'pointer',
                                                borderRadius: 8,
                                            }}
                                            onClick={() =>
                                                navigate(`/shelf/1/book/${book.book_id}`)
                                            }
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
                                                    >
                                                        {book.title}
                                                    </Text>
                                                }
                                                description={
                                                    <Space size={6}>
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
                                                            }}
                                                        >
                                                            {book.source === 'douban'
                                                                ? '豆瓣'
                                                                : '手动'}
                                                        </Tag>
                                                    </Space>
                                                }
                                            />
                                        </List.Item>
                                    )}
                                />
                            ) : (
                                <Empty
                                    description="暂无图书"
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                />
                            )}
                        </Card>
                    </Col>
                </Row>

                {/* 热力图 */}
                {heatmapData && heatmapData.data.length > 0 && (
                    <Card
                        title={
                            <Space size={6}>
                                <HeatMapOutlined style={{ color: token.colorPrimary }} />
                                <span>书架月度分布热力图</span>
                            </Space>
                        }
                        style={{
                            borderRadius: 14,
                            border: `1px solid ${token.colorBorderSecondary}`,
                            marginBottom: 18,
                        }}
                    >
                        <ReadingHeatmap
                            months={heatmapData.months}
                            categories={heatmapData.categories}
                            data={heatmapData.data}
                            height={420}
                            loading={loading}
                        />
                    </Card>
                )}

                {/* 底部概览 */}
                <Card
                    style={{
                        borderRadius: 14,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        marginTop: 8,
                        background: `linear-gradient(135deg, ${token.colorPrimaryBg} 0%, ${token.colorBgLayout} 100%)`,
                    }}
                >
                    <Row gutter={[24, 16]} justify="center">
                        <Col>
                            <Statistic
                                title="今日新增"
                                value={stats.today_books || 0}
                                prefix={
                                    <RocketOutlined style={{ color: '#3b82f6' }} />
                                }
                                valueStyle={{ color: '#3b82f6', fontSize: 22 }}
                                suffix="本"
                            />
                        </Col>
                        <Col>
                            <Statistic
                                title="同步次数"
                                value={stats.sync_count || 0}
                                prefix={
                                    <SyncOutlined style={{ color: '#22c55e' }} />
                                }
                                valueStyle={{ color: '#22c55e', fontSize: 22 }}
                                suffix="次"
                            />
                        </Col>
                        <Col>
                            <Statistic
                                title="待上架"
                                value={stats.books_not_in_shelf || 0}
                                prefix={
                                    <ExclamationCircleOutlined
                                        style={{ color: '#f59e0b' }}
                                    />
                                }
                                valueStyle={{ color: '#f59e0b', fontSize: 22 }}
                                suffix="本"
                            />
                        </Col>
                    </Row>
                </Card>
            </div>
        </ErrorBoundary>
    );
};

export default Dashboard;
export type { DashboardStats };