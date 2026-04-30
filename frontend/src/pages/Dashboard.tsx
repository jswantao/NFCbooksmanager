// frontend/src/pages/Dashboard.tsx
/**
 * 管理仪表盘页面
 * 
 * 提供系统全局统计视图，包含以下模块：
 * 
 * 1. 统计卡片区：物理书架、逻辑书架、活跃映射、馆藏图书、上架图书
 * 2. 图表区域：
 *    - 藏书增长趋势（柱状图）
 *    - 评分分布 + 来源分布（进度条/柱状图）
 *    - 书架利用率（进度条列表）
 * 3. 排行榜：出版社 Top 8、作者 Top 8
 * 4. 活动时间线：最近操作记录
 * 5. 最近添加：最新图书列表
 * 6. 底部概览：今日新增、同步次数、未上架数量
 * 
 * 组件设计：
 * - 统计卡片带入场动画（渐入 + 上移）
 * - 简易柱状图（纯 CSS 实现，无第三方图表库依赖）
 * - 排行榜带奖牌标识（🥇🥈🥉）
 * 
 * 数据来源：GET /api/admin/stats
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    Card,
    Row,
    Col,
    Statistic,
    Spin,
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
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats } from '../services/api';

// ---- 类型定义 ----

const { Title, Text } = Typography;

/** 仪表盘统计数据 */
interface DashboardStats {
    physical_shelves: number;
    logical_shelves: number;
    active_mappings: number;
    total_books: number;
    books_in_shelves: number;
    books_not_in_shelf: number;
    books_by_source: Record<string, number>;
    sync_count: number;
    today_books: number;
    recent_books: RecentBook[];
    monthly_growth: MonthlyGrowth[];
    top_publishers: RankingItem[];
    top_authors: RankingItem[];
    rating_distribution: RatingDistribution[];
    shelf_utilization: ShelfUtilization[];
    recent_activities: ActivityItem[];
}

interface RecentBook {
    book_id: number;
    title: string;
    isbn: string;
    author?: string;
    source: string;
    cover_url?: string;
    rating?: string;
    shelf_name?: string;
    added_at: string;
}

interface MonthlyGrowth {
    month: string;
    count: number;
    year: number;
}

interface RankingItem {
    name: string;
    count: number;
    percentage?: number;
}

interface RatingDistribution {
    range: string;
    count: number;
    color: string;
}

interface ShelfUtilization {
    shelf_name: string;
    book_count: number;
    capacity?: number;
    percentage: number;
}

interface ActivityItem {
    id: number;
    action: string;
    detail: string;
    type: string;
    timestamp: string;
}

// ---- 常量 ----

/** 统计卡片配置 */
const STAT_CARDS = [
    {
        key: 'physical_shelves',
        title: '物理书架',
        icon: <EnvironmentOutlined style={{ fontSize: 28, color: '#3b82f6' }} />,
        color: '#3b82f6',
        bgColor: '#eff6ff',
        borderColor: '#bfdbfe',
    },
    {
        key: 'logical_shelves',
        title: '逻辑书架',
        icon: <AppstoreOutlined style={{ fontSize: 28, color: '#22c55e' }} />,
        color: '#22c55e',
        bgColor: '#f0fdf4',
        borderColor: '#bbf7d0',
    },
    {
        key: 'active_mappings',
        title: '活跃映射',
        icon: <LinkOutlined style={{ fontSize: 28, color: '#a855f7' }} />,
        color: '#a855f7',
        bgColor: '#faf5ff',
        borderColor: '#e9d5ff',
    },
    {
        key: 'total_books',
        title: '馆藏图书',
        icon: <BookOutlined style={{ fontSize: 28, color: '#f97316' }} />,
        color: '#f97316',
        bgColor: '#fff7ed',
        borderColor: '#fed7aa',
    },
    {
        key: 'books_in_shelves',
        title: '上架图书',
        icon: <DatabaseOutlined style={{ fontSize: 28, color: '#06b6d4' }} />,
        color: '#06b6d4',
        bgColor: '#ecfeff',
        borderColor: '#a5f3fc',
    },
];

/** 活动类型图标映射 */
const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
    sync: <SyncOutlined />,
    add: <RocketOutlined />,
    update: <RiseOutlined />,
    delete: <ExclamationCircleOutlined />,
    mapping: <LinkOutlined />,
    system: <FundOutlined />,
};

/** 活动类型颜色映射 */
const ACTIVITY_COLORS: Record<string, string> = {
    sync: '#22c55e',
    add: '#3b82f6',
    update: '#f59e0b',
    delete: '#ef4444',
    mapping: '#a855f7',
    system: '#6366f1',
};

/** 来源标签映射 */
const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
    douban: { label: '豆瓣', color: '#22c55e' },
    manual: { label: '手动录入', color: '#f97316' },
    isbn: { label: 'ISBN 扫描', color: '#3b82f6' },
    nfc: { label: 'NFC 识别', color: '#a855f7' },
};

// ---- 子组件 ----

/**
 * 统计卡片组件（带入场动画）
 */
const StatCard: React.FC<{
    title: string;
    value: number;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
    borderColor: string;
    loading?: boolean;
}> = React.memo(({ title, value, icon, color, bgColor, borderColor, loading }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setVisible(true), 100 * Math.random());
        return () => clearTimeout(timer);
    }, []);

    return (
        <Card
            hoverable
            style={{
                borderRadius: 12,
                border: `1px solid ${borderColor}`,
                background: bgColor,
                boxShadow: '0 2px 8px rgba(139,69,19,.06)',
                transition: 'all 0.4s cubic-bezier(0.4,0,0.2,1)',
                transform: visible ? 'translateY(0)' : 'translateY(20px)',
                opacity: visible ? 1 : 0,
                height: '100%',
                overflow: 'hidden',
                position: 'relative',
            }}
            bodyStyle={{ padding: 20 }}
        >
            {/* 装饰圆形 */}
            <div style={{
                position: 'absolute',
                top: -20,
                right: -20,
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: color,
                opacity: 0.08,
                pointerEvents: 'none',
            }} />

            {loading ? (
                <Skeleton active paragraph={{ rows: 1 }} />
            ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                        <Text type="secondary" style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                            {title}
                        </Text>
                        <span style={{ fontSize: 32, fontWeight: 700, color, lineHeight: 1 }}>
                            {value.toLocaleString()}
                        </span>
                    </div>
                    <div style={{
                        width: 56,
                        height: 56,
                        borderRadius: 14,
                        background: `${color}15`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginLeft: 12,
                    }}>
                        {icon}
                    </div>
                </div>
            )}
        </Card>
    );
});
StatCard.displayName = 'StatCard';

/**
 * 简易柱状图（纯 CSS 实现）
 */
const SimpleBarChart: React.FC<{
    data: { label: string; value: number; color?: string }[];
    height?: number;
}> = React.memo(({ data, height = 200 }) => {
    const maxValue = Math.max(...data.map((d) => d.value), 1);

    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height, paddingTop: 20 }}>
            {data.map((item, index) => (
                <Tooltip key={index} title={`${item.label}: ${item.value}`}>
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        height: '100%',
                        justifyContent: 'flex-end',
                    }}>
                        <Text style={{ fontSize: 11, marginBottom: 4, color: '#6b5e56', fontWeight: 500 }}>
                            {item.value}
                        </Text>
                        <div style={{
                            width: '100%',
                            maxWidth: 40,
                            height: `${(item.value / maxValue) * 100}%`,
                            background: item.color || '#8B4513',
                            borderRadius: '6px 6px 0 0',
                            transition: 'height 0.5s cubic-bezier(0.4,0,0.2,1)',
                            minHeight: 4,
                        }} />
                        <Text style={{ fontSize: 10, marginTop: 4, color: '#8c7b72', whiteSpace: 'nowrap' }}>
                            {item.label}
                        </Text>
                    </div>
                </Tooltip>
            ))}
        </div>
    );
});
SimpleBarChart.displayName = 'SimpleBarChart';

/**
 * 排行榜列表组件
 */
const RankingList: React.FC<{
    data: RankingItem[];
    maxShow?: number;
}> = React.memo(({ data, maxShow = 8 }) => {
    const displayData = data.slice(0, maxShow);
    const maxCount = Math.max(...displayData.map((d) => d.count), 1);
    const medals = ['🥇', '🥈', '🥉'];

    if (displayData.length === 0) {
        return <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {displayData.map((item, index) => (
                <div
                    key={item.name}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: index < 3 ? '#fafaf9' : 'transparent',
                        transition: 'background 0.2s ease',
                    }}
                >
                    <span style={{ fontSize: 18, width: 28, textAlign: 'center' }}>
                        {index < 3 ? medals[index] : (
                            <Text type="secondary" style={{ fontSize: 13 }}>{index + 1}</Text>
                        )}
                    </span>
                    <Text style={{
                        flex: 1,
                        fontSize: 13,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {item.name}
                    </Text>
                    <div style={{ width: 100 }}>
                        <Progress
                            percent={item.percentage || Math.round((item.count / maxCount) * 100)}
                            strokeColor={index < 3 ? ['#f59e0b', '#a8a29e', '#d4a574'][index] : '#8B4513'}
                            trailColor="#f0e4d8"
                            size="small"
                            showInfo={false}
                        />
                    </div>
                    <Text strong style={{ fontSize: 13, minWidth: 30, textAlign: 'right' }}>
                        {item.count}
                    </Text>
                </div>
            ))}
        </div>
    );
});
RankingList.displayName = 'RankingList';

// ---- 主组件 ----

const Dashboard: React.FC = () => {
    const navigate = useNavigate();

    // ==================== 状态 ====================

    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [timeRange, setTimeRange] = useState<string>('month');

    // ==================== 数据加载 ====================

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await getDashboardStats();
            setStats(data as DashboardStats);
        } catch (err: any) {
            const errorMsg = err?.response?.data?.detail || err?.message || '加载数据失败';
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

    // ==================== 衍生数据 ====================

    /** 来源分布数据 */
    const booksBySource = useMemo(() => {
        if (!stats?.books_by_source) return null;
        const entries = Object.entries(stats.books_by_source).filter(([, count]) => count > 0);
        if (entries.length === 0) return null;

        const total = entries.reduce((sum, [, count]) => sum + count, 0) || 1;

        return entries.map(([source, count]) => {
            const config = SOURCE_LABELS[source] || { label: source, color: '#8c7b72' };
            return {
                label: config.label,
                value: count,
                color: config.color,
                percentage: Math.round((count / total) * 100),
            };
        });
    }, [stats]);

    /** 评分分布数据 */
    const ratingData = useMemo(() => {
        if (!stats?.rating_distribution) return [];
        return stats.rating_distribution
            .filter((item) => item.count > 0)
            .map((item) => ({
                label: item.range,
                value: item.count,
                color: item.color,
            }));
    }, [stats]);

    // ==================== 渲染：加载状态 ====================

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
            </div>
        );
    }

    // ==================== 渲染：错误状态 ====================

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
                    style={{ borderRadius: 8 }}
                    action={
                        <Button type="primary" size="small" onClick={loadData}>
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
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
            {/* 面包屑 */}
            <Breadcrumb
                style={{ marginBottom: 16 }}
                items={[
                    { title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> },
                    { title: <span><FundOutlined /> 管理仪表盘</span> },
                ]}
            />

            {/* 页面标题 */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 24,
            }}>
                <div>
                    <Title level={2} style={{ margin: 0 }}>
                        <FundOutlined style={{ marginRight: 12, color: '#8B4513' }} />
                        管理仪表盘
                    </Title>
                    <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                        系统概览与数据分析 · 共 {stats.total_books} 本藏书
                    </Text>
                </div>

                <Space wrap>
                    <Segmented
                        options={[
                            { label: '本月', value: 'month' },
                            { label: '本季', value: 'quarter' },
                            { label: '本年', value: 'year' },
                        ]}
                        value={timeRange}
                        onChange={(v) => setTimeRange(v as string)}
                    />
                    <Tooltip title="刷新数据">
                        <Button
                            icon={<ReloadOutlined spin={refreshing} />}
                            onClick={() => { setRefreshing(true); loadData(); }}
                            loading={refreshing}
                            style={{ borderRadius: 8 }}
                        >
                            刷新
                        </Button>
                    </Tooltip>
                </Space>
            </div>

            {/* ===== 统计卡片 ===== */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {STAT_CARDS.map((config) => (
                    <Col xs={24} sm={12} lg={8} xl={24 / 5} key={config.key}>
                        <StatCard
                            title={config.title}
                            value={(stats[config.key as keyof DashboardStats] as number) || 0}
                            icon={config.icon}
                            color={config.color}
                            bgColor={config.bgColor}
                            borderColor={config.borderColor}
                            loading={loading}
                        />
                    </Col>
                ))}
            </Row>

            {/* ===== 主要内容区 ===== */}
            <Row gutter={[16, 16]}>
                {/* 左侧列 */}
                <Col xs={24} lg={12}>
                    {/* 增长趋势 */}
                    {stats.monthly_growth?.length > 0 && (
                        <Card
                            title={<span><LineChartOutlined style={{ marginRight: 8, color: '#8B4513' }} />藏书增长趋势</span>}
                            style={{ borderRadius: 12, border: '1px solid #e8d5c8', marginBottom: 16 }}
                        >
                            <SimpleBarChart
                                data={stats.monthly_growth.map((item) => ({
                                    label: item.month,
                                    value: item.count,
                                    color: '#8B4513',
                                }))}
                                height={200}
                            />
                        </Card>
                    )}

                    {/* 评分分布 + 来源分布 */}
                    <Row gutter={[16, 16]}>
                        <Col xs={24} sm={12}>
                            <Card
                                title={<span><StarFilled style={{ marginRight: 8, color: '#f59e0b' }} />评分分布</span>}
                                style={{ borderRadius: 12, border: '1px solid #e8d5c8', marginBottom: 16 }}
                            >
                                {ratingData.length > 0 ? (
                                    <SimpleBarChart data={ratingData} height={180} />
                                ) : (
                                    <Empty description="暂无评分数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                )}
                            </Card>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Card
                                title={<span><PieChartOutlined style={{ marginRight: 8, color: '#8B4513' }} />来源分布</span>}
                                style={{ borderRadius: 12, border: '1px solid #e8d5c8', marginBottom: 16 }}
                            >
                                {booksBySource ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
                                        {booksBySource.map((item, index) => (
                                            <div key={index}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <Space>
                                                        <Badge color={item.color} />
                                                        <Text style={{ fontSize: 13 }}>{item.label}</Text>
                                                    </Space>
                                                    <Space>
                                                        <Text strong style={{ fontSize: 13 }}>{item.value} 本</Text>
                                                        <Text type="secondary" style={{ fontSize: 12 }}>({item.percentage}%)</Text>
                                                    </Space>
                                                </div>
                                                <Progress
                                                    percent={item.percentage}
                                                    strokeColor={item.color}
                                                    trailColor="#f0e4d8"
                                                    size="small"
                                                    showInfo={false}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                )}
                            </Card>
                        </Col>
                    </Row>

                    {/* 书架利用率 */}
                    {stats.shelf_utilization?.length > 0 && (
                        <Card
                            title={<span><BarChartOutlined style={{ marginRight: 8, color: '#8B4513' }} />书架利用率</span>}
                            style={{ borderRadius: 12, border: '1px solid #e8d5c8', marginBottom: 16 }}
                        >
                            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                                {stats.shelf_utilization.map((item, index) => (
                                    <div key={index}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <Text style={{ fontSize: 13 }}>{item.shelf_name}</Text>
                                            <Text strong style={{ fontSize: 13 }}>{item.book_count} 本</Text>
                                        </div>
                                        <Progress
                                            percent={Math.round(item.percentage)}
                                            strokeColor={item.percentage > 80 ? '#ef4444' : item.percentage > 60 ? '#f59e0b' : '#22c55e'}
                                            trailColor="#f0e4d8"
                                            size="small"
                                            showInfo={false}
                                        />
                                    </div>
                                ))}
                            </Space>
                        </Card>
                    )}
                </Col>

                {/* 右侧列 */}
                <Col xs={24} lg={12}>
                    {/* 出版社排行 */}
                    <Card
                        title={<span><TrophyOutlined style={{ marginRight: 8, color: '#f59e0b' }} />出版社排行</span>}
                        style={{ borderRadius: 12, border: '1px solid #e8d5c8', marginBottom: 16 }}
                    >
                        <RankingList data={stats.top_publishers || []} maxShow={8} />
                    </Card>

                    {/* 作者排行 */}
                    <Card
                        title={<span><UserOutlined style={{ marginRight: 8, color: '#8B4513' }} />作者排行</span>}
                        style={{ borderRadius: 12, border: '1px solid #e8d5c8', marginBottom: 16 }}
                    >
                        <RankingList data={stats.top_authors || []} maxShow={8} />
                    </Card>

                    {/* 最近活动 */}
                    {stats.recent_activities?.length > 0 && (
                        <Card
                            title={<span><ClockCircleOutlined style={{ marginRight: 8, color: '#8B4513' }} />最近活动</span>}
                            style={{ borderRadius: 12, border: '1px solid #e8d5c8', marginBottom: 16 }}
                        >
                            <Timeline
                                items={stats.recent_activities.map((activity) => ({
                                    color: ACTIVITY_COLORS[activity.type] || '#8c7b72',
                                    dot: ACTIVITY_ICONS[activity.type] || <FileTextOutlined />,
                                    children: (
                                        <div>
                                            <Text style={{ fontSize: 14, display: 'block' }}>{activity.detail}</Text>
                                            <Text type="secondary" style={{ fontSize: 12 }}>{activity.timestamp}</Text>
                                        </div>
                                    ),
                                }))}
                            />
                        </Card>
                    )}

                    {/* 最近添加 */}
                    <Card
                        title={<span><BookOutlined style={{ marginRight: 8, color: '#8B4513' }} />最近添加</span>}
                        style={{ borderRadius: 12, border: '1px solid #e8d5c8' }}
                    >
                        {stats.recent_books?.length > 0 ? (
                            <List
                                dataSource={stats.recent_books.slice(0, 5)}
                                renderItem={(book) => (
                                    <List.Item
                                        style={{ padding: '8px 0', cursor: 'pointer' }}
                                        onClick={() => navigate(`/book/${book.book_id}`)}
                                    >
                                        <List.Item.Meta
                                            avatar={
                                                <Avatar
                                                    shape="square"
                                                    size={40}
                                                    icon={<BookOutlined />}
                                                    style={{ background: '#fdf6f0', color: '#8B4513', borderRadius: 6 }}
                                                />
                                            }
                                            title={<Text style={{ fontSize: 14 }} ellipsis>{book.title}</Text>}
                                            description={
                                                <Space size={4}>
                                                    <Text type="secondary" style={{ fontSize: 12 }}>{book.isbn}</Text>
                                                    <Tag
                                                        color={book.source === 'douban' ? 'green' : 'orange'}
                                                        style={{ fontSize: 11, lineHeight: '16px', padding: '0 4px' }}
                                                    >
                                                        {book.source === 'douban' ? '豆瓣' : '手动'}
                                                    </Tag>
                                                </Space>
                                            }
                                        />
                                    </List.Item>
                                )}
                            />
                        ) : (
                            <Empty description="暂无图书" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                    </Card>
                </Col>
            </Row>

            {/* ===== 底部概览 ===== */}
            <Card
                style={{
                    borderRadius: 12,
                    border: '1px solid #e8d5c8',
                    marginTop: 16,
                    background: 'linear-gradient(135deg, #fdf6f0 0%, #fafaf9 100%)',
                }}
            >
                <Row gutter={[16, 16]} justify="center">
                    <Col>
                        <Statistic
                            title="今日新增"
                            value={stats.today_books || 0}
                            prefix={<RocketOutlined style={{ color: '#3b82f6' }} />}
                            valueStyle={{ color: '#3b82f6', fontSize: 20 }}
                            suffix="本"
                        />
                    </Col>
                    <Col>
                        <Statistic
                            title="同步次数"
                            value={stats.sync_count || 0}
                            prefix={<SyncOutlined style={{ color: '#22c55e' }} />}
                            valueStyle={{ color: '#22c55e', fontSize: 20 }}
                            suffix="次"
                        />
                    </Col>
                    <Col>
                        <Statistic
                            title="未上架"
                            value={stats.books_not_in_shelf || 0}
                            prefix={<ExclamationCircleOutlined style={{ color: '#f59e0b' }} />}
                            valueStyle={{ color: '#f59e0b', fontSize: 20 }}
                            suffix="本"
                        />
                    </Col>
                </Row>
            </Card>
        </div>
    );
};

export default Dashboard;
export type { DashboardStats };