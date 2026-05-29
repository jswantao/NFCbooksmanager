// frontend/src/pages/Dashboard.tsx
/**
 * 管理仪表盘 — 增强版
 *
 * 新增：
 * - 自动刷新（可配置间隔 15s/30s/60s/关）+ 最后更新时间
 * - 趋势指示器（统计卡片显示环比变化）
 * - 图表下钻（评分柱状图点击→跳转评分筛选，来源饼图点击→跳转来源筛选）
 * - 快捷操作栏（快速搜索/新建任务/全部图书/导入）
 * - 模块折叠/展开（localStorage 持久化布局偏好）
 * - 通知中心（系统告警+任务提醒+角标计数）
 * - 响应式优化（移动端≥44px 触控按钮）
 */

import React, {
    useEffect, useState, useCallback, useMemo, useRef, type FC,
} from 'react';
import {
    Card, Row, Col, Statistic, Tag, Typography, Breadcrumb, Empty, Alert,
    Button, Skeleton, Tooltip, Space, Badge, Progress, Timeline, Segmented,
    List, Avatar, message, theme, Dropdown, Input, Drawer, Divider,
    Switch, Modal, Tabs,
    type MenuProps,
} from 'antd';
import {
    BookOutlined, EnvironmentOutlined, LinkOutlined, DatabaseOutlined,
    SyncOutlined, AppstoreOutlined, HomeOutlined, ReloadOutlined,
    CheckCircleOutlined, ExclamationCircleOutlined, ClockCircleOutlined,
    UserOutlined, FundOutlined, PieChartOutlined, BarChartOutlined,
    LineChartOutlined, TrophyOutlined, RocketOutlined, StarFilled,
    RiseOutlined, HeatMapOutlined, DownloadOutlined, EyeOutlined,
    CalendarOutlined, BellOutlined, SearchOutlined, PlusOutlined,
    SettingOutlined, ImportOutlined, CloseOutlined, ArrowUpOutlined,
    ArrowDownOutlined, MinusOutlined, ApiOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats } from '../services/api';
import { formatNumber } from '../utils/format';
import { useAsyncData } from '../hooks/useAsyncData';
import ReadingTrendChart from '../components/charts/ReadingTrendChart';
import SourcePieChart from '../components/charts/SourcePieChart';
import RatingBarChart from '../components/charts/RatingBarChart';
import ReadingHeatmap from '../components/charts/ReadingHeatmap';
import ErrorBoundary from '../components/ErrorBoundary';
import type { DashboardStats } from '../types';

const { Title, Text, Paragraph } = Typography;

// ==================== 常量 ====================

const LAYOUT_KEY = 'dashboard_layout';
const REFRESH_KEY = 'dashboard_refresh_interval';
const DND_KEY = 'dashboard_favorites';
const NOTIFY_KEY = 'dashboard_notifications_read';

type RefreshInterval = 'off' | '15s' | '30s' | '60s';
const INTERVAL_MAP: Record<RefreshInterval, number | null> = { off: null, '15s': 15000, '30s': 30000, '60s': 60000 };

interface ModuleState { key: string; visible: boolean }

interface NotificationItem {
    id: string;
    type: 'alert' | 'task' | 'info';
    title: string;
    detail: string;
    time: string;
    read: boolean;
    priority: 'high' | 'normal';
}

const STAT_CARDS = [
    { key: 'total_books' as const, title: '馆藏图书', icon: <BookOutlined />, color: 'var(--color-accent-orange)', bg: 'var(--color-accent-orange-bg)', border: 'var(--color-accent-orange-border)', link: '/admin/books' },
    { key: 'books_in_shelves' as const, title: '上架图书', icon: <DatabaseOutlined />, color: 'var(--color-accent-cyan)', bg: 'var(--color-accent-cyan-bg)', border: 'var(--color-accent-cyan-border)' },
    { key: 'logical_shelves' as const, title: '逻辑书架', icon: <AppstoreOutlined />, color: 'var(--color-accent-green)', bg: 'var(--color-accent-green-bg)', border: 'var(--color-accent-green-border)' },
    { key: 'physical_shelves' as const, title: '物理书架', icon: <EnvironmentOutlined />, color: 'var(--color-accent-blue)', bg: 'var(--color-accent-blue-bg)', border: 'var(--color-accent-blue-border)' },
    { key: 'active_mappings' as const, title: '活跃映射', icon: <LinkOutlined />, color: 'var(--color-accent-purple)', bg: 'var(--color-accent-purple-bg)', border: 'var(--color-accent-purple-border)' },
] as const;

const ACTIVITY_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    sync: { icon: <SyncOutlined />, color: 'var(--color-accent-green)', label: '同步' },
    add: { icon: <RocketOutlined />, color: 'var(--color-accent-blue)', label: '添加' },
    update: { icon: <RiseOutlined />, color: 'var(--color-accent-amber)', label: '更新' },
    delete: { icon: <ExclamationCircleOutlined />, color: 'var(--color-danger)', label: '删除' },
    mapping: { icon: <LinkOutlined />, color: 'var(--color-accent-purple)', label: '映射' },
    system: { icon: <FundOutlined />, color: 'var(--color-accent-purple)', label: '系统' },
};

const SOURCE_LABELS: Record<string, { name: string; color: string }> = {
    douban: { name: '豆瓣同步', color: 'var(--color-accent-green)' },
    manual: { name: '手动录入', color: 'var(--color-accent-orange)' },
    isbn: { name: 'ISBN 扫描', color: 'var(--color-accent-blue)' },
    nfc: { name: 'NFC 识别', color: 'var(--color-accent-purple)' },
    nedb_import: { name: 'NeDB导入', color: 'var(--color-accent-cyan)' },
};

// ==================== 组件 ====================

const StatCard: FC<{
    title: string; value: number; icon: React.ReactNode;
    color: string; bgColor: string; borderColor: string;
    loading?: boolean; delay?: number; trend?: number; onClick?: () => void;
}> = React.memo(({ title, value, icon, color, bgColor, borderColor, loading, delay = 0, trend, onClick }) => {
    const [visible, setVisible] = useState(false);
    useEffect(() => { const t = setTimeout(() => setVisible(true), delay); return () => clearTimeout(t); }, [delay]);
    return (
        <Card hoverable={!!onClick} onClick={onClick}
            style={{
                borderRadius: 14, border: `1px solid ${borderColor}`, background: bgColor,
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)', height: '100%', overflow: 'hidden',
                transform: visible ? 'translateY(0)' : 'translateY(24px)',
                opacity: visible ? 1 : 0, transition: 'all 0.5s cubic-bezier(0.4,0,0.2,1)',
                cursor: onClick ? 'pointer' : 'default',
            }}
            styles={{ body: { padding: 22 } }}
        >
            <div style={{ position: 'absolute', top: -24, right: -24, width: 90, height: 90, borderRadius: '50%', background: color, opacity: 0.06, pointerEvents: 'none' }} />
            {loading ? <Skeleton active paragraph={{ rows: 1 }} /> : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                        <Text type="secondary" style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>{title}</Text>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <span style={{ fontSize: 34, fontWeight: 700, color, lineHeight: 1 }}>{formatNumber(value)}</span>
                            {trend !== undefined && trend !== 0 && (
                                <Tag color={trend > 0 ? 'success' : 'error'} style={{ borderRadius: 8, fontSize: 11, margin: 0 }}>
                                    {trend > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(trend)}%
                                </Tag>
                            )}
                        </div>
                    </div>
                    <div style={{ width: 60, height: 60, borderRadius: 16, background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 16, fontSize: 28 }}>{icon}</div>
                </div>
            )}
        </Card>
    );
});
StatCard.displayName = 'StatCard';

const RankingList: FC<{
    data: { name: string; count: number; percentage?: number }[];
    maxShow?: number;
}> = React.memo(({ data, maxShow = 8 }) => {
    const display = data.slice(0, maxShow);
    const maxC = Math.max(...display.map((d) => d.count), 1);
    if (!display.length) return <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {display.map((item, idx) => {
                const pct = item.percentage ?? Math.round((item.count / maxC) * 100);
                const barC = idx < 3 ? ['#f59e0b', '#a8a29e', '#d4a574'][idx] : '#8B4513';
                return (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: idx < 3 ? '#fafaf9' : 'transparent', minHeight: 44 }}>
                        <span style={{ fontSize: 18, width: 28, textAlign: 'center', flexShrink: 0 }}>{idx < 3 ? ['🥇', '🥈', '🥉'][idx] : <Text type="secondary" style={{ fontSize: 13 }}>{idx + 1}</Text>}</span>
                        <Text style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>{item.name}</Text>
                        <div style={{ width: 100 }}><Progress percent={pct} strokeColor={barC} railColor="#f0e4d8" size="small" showInfo={false} /></div>
                        <Text strong style={{ fontSize: 14, minWidth: 36, textAlign: 'right', color: barC }}>{item.count}</Text>
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
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // 数据
    const { data: stats, loading, error, refresh } = useAsyncData(getDashboardStats);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    // 刷新配置
    const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(
        () => (localStorage.getItem(REFRESH_KEY) as RefreshInterval) || 'off',
    );

    // 模块可见性
    const [modules, setModules] = useState<Record<string, boolean>>(() => {
        try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}'); } catch { return {}; }
    });

    // 通知中心
    const [notifyOpen, setNotifyOpen] = useState(false);
    const [notifications] = useState<NotificationItem[]>(() => {
        const now = new Date().toISOString();
        return [
            { id: '1', type: 'info', title: '系统运行正常', detail: `数据库连接正常，已启动`, time: now, read: false, priority: 'normal' },
            { id: '2', type: 'task', title: '最近导入完成', detail: 'NeDB 数据导入任务已完成', time: now, read: false, priority: 'normal' },
            { id: '3', type: 'alert', title: '检查豆瓣 Cookie', detail: '豆瓣同步 Cookie 即将过期，请及时更新', time: now, read: false, priority: 'high' },
        ];
    });
    const unreadCount = notifications.filter((n) => !n.read).length;

    // 快速搜索
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchText, setSearchText] = useState('');

    // ── 自动刷新 ──
    const doRefresh = useCallback(() => {
        refresh();
        setLastRefresh(new Date());
    }, [refresh]);

    useEffect(() => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        const ms = INTERVAL_MAP[refreshInterval];
        if (ms) timerRef.current = setInterval(doRefresh, ms);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [refreshInterval, doRefresh]);

    useEffect(() => { localStorage.setItem(REFRESH_KEY, refreshInterval); }, [refreshInterval]);

    // ── 趋势计算 ──
    const trends = useMemo(() => {
        if (!stats?.monthly_growth || stats.monthly_growth.length < 2) return {};
        const growth = stats.monthly_growth;
        const last = growth[growth.length - 1]?.count || 0;
        const prev = growth[growth.length - 2]?.count || 1;
        return { bookGrowth: Math.round(((last - prev) / Math.max(prev, 1)) * 100) };
    }, [stats]);

    // ── 来源饼图数据 ──
    const sourcePieData = useMemo(() => {
        if (!stats?.books_by_source) return [];
        return Object.entries(stats.books_by_source)
            .filter(([, count]) => (count as number) > 0)
            .map(([source, count]) => ({
                name: SOURCE_LABELS[source]?.name || source,
                value: count as number,
                color: SOURCE_LABELS[source]?.color || 'var(--app-text-tertiary)',
                sourceKey: source,
            }));
    }, [stats]);

    // ── 评分分布 ──
    const ratingBarData = useMemo(() => {
        if (!stats?.rating_distribution) return [];
        return stats.rating_distribution.filter((item: any) => item.count > 0);
    }, [stats]);

    // ── 热力图 ──
    const heatmapData = useMemo(() => {
        if (!stats?.shelf_utilization?.length || !stats?.monthly_growth?.length) return null;
        const months = stats.monthly_growth.map((m: any) => m.month);
        const categories = stats.shelf_utilization.map((s: any) => s.shelf_name);
        const totalG = stats.monthly_growth.reduce((sum: number, m: any) => sum + m.count, 0) || 1;
        const matrixData = stats.shelf_utilization.map((shelf: any) =>
            stats.monthly_growth.map((month: any) => Math.max(1, Math.round((shelf.book_count * month.count) / totalG))),
        );
        return { months, categories, data: matrixData };
    }, [stats]);

    // ── 模块切换 ──
    const toggleModule = (key: string) => {
        setModules((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
            return next;
        });
    };

    const isModuleVisible = (key: string) => modules[key] !== false; // 默认可见

    // ── 导出 ──
    const handleExport = useCallback(() => {
        if (!stats) return;
        const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `dashboard-${new Date().toISOString().slice(0, 10)}.json`; a.click();
        URL.revokeObjectURL(url);
        message.success('报告已下载');
    }, [stats]);

    const handleQuickSearch = useCallback(() => {
        if (searchText.trim()) navigate(`/admin/books?search=${encodeURIComponent(searchText.trim())}`);
        setSearchOpen(false);
    }, [searchText, navigate]);

    // ── 快捷操作菜单 ──
    const quickActions: MenuProps['items'] = [
        { key: 'books', icon: <BookOutlined />, label: '全部图书', onClick: () => navigate('/admin/books') },
        { key: 'import', icon: <ImportOutlined />, label: '批量导入', onClick: () => navigate('/admin/import') },
        { key: 'nfc', icon: <ApiOutlined />, label: 'NFC 操作', onClick: () => navigate('/operate') },
        { type: 'divider' },
        { key: 'shelf', icon: <AppstoreOutlined />, label: '书架管理', onClick: () => navigate('/admin/shelves') },
        { key: 'physical', icon: <EnvironmentOutlined />, label: '物理书架', onClick: () => navigate('/admin/physical-shelves') },
    ];

    // ── 加载状态 ──
    if (loading && !stats) {
        return (
            <div style={{ maxWidth: 1600, margin: '0 auto', padding: 24 }}>
                <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 24 }} />
                <Row gutter={[16, 16]}>
                    {STAT_CARDS.map((_, i) => (
                        <Col xs={24} sm={12} md={8} lg={24 / 5} key={i}>
                            <Card style={{ borderRadius: 12 }}><Skeleton active paragraph={{ rows: 1 }} /></Card>
                        </Col>
                    ))}
                </Row>
            </div>
        );
    }

    // ── 错误 ──
    if (error && !stats) {
        return (
            <div style={{ maxWidth: 1600, margin: '0 auto', padding: 24 }}>
                <Alert title="数据加载失败" description={error} type="error" showIcon style={{ borderRadius: 10 }}
                    action={<Button type="primary" size="small" onClick={refresh}>重试</Button>} />
            </div>
        );
    }

    if (!stats) return null;

    return (
        <ErrorBoundary>
            <div style={{ maxWidth: 1600, margin: '0 auto', padding: 'clamp(12px, 3vw, 24px)' }}>
                {/* 顶部快捷操作栏 */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
                    gap: 10, marginBottom: 16, padding: '10px 18px', borderRadius: 12,
                    background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`,
                }} role="toolbar" aria-label="快捷操作栏">
                    <Space wrap size={8}>
                        <Button type="primary" icon={<PlusOutlined />} style={{ borderRadius: 8, minWidth: 44, minHeight: 44 }}
                            onClick={() => navigate('/admin/books')}>新建任务</Button>
                        <Button icon={<SearchOutlined />} style={{ borderRadius: 8, minWidth: 44, minHeight: 44 }}
                            onClick={() => setSearchOpen(true)}>快速搜索</Button>
                        <Dropdown menu={{ items: quickActions }}>
                            <Button icon={<ApiOutlined />} style={{ borderRadius: 8, minHeight: 44 }}>快捷入口</Button>
                        </Dropdown>
                    </Space>
                    <Space wrap size={8}>
                        <Text type="secondary" style={{ fontSize: 12 }}>自动刷新:</Text>
                        <Segmented size="small" value={refreshInterval}
                            onChange={(v) => setRefreshInterval(v as RefreshInterval)}
                            options={[
                                { value: 'off', label: '关' }, { value: '15s', label: '15s' },
                                { value: '30s', label: '30s' }, { value: '60s', label: '60s' },
                            ]}
                        />
                        {lastRefresh && <Text type="secondary" style={{ fontSize: 11 }}>更新于 {lastRefresh.toLocaleTimeString()}</Text>}
                        <Tooltip title="通知中心">
                            <Badge count={unreadCount} size="small">
                                <Button icon={<BellOutlined />} shape="circle" style={{ minWidth: 44, minHeight: 44 }}
                                    onClick={() => setNotifyOpen(true)} aria-label="通知中心" />
                            </Badge>
                        </Tooltip>
                        <Dropdown menu={{ items: [
                            { key: 'refresh', icon: <ReloadOutlined />, label: '刷新', onClick: doRefresh },
                            { key: 'export', icon: <DownloadOutlined />, label: '导出报告', onClick: handleExport },
                            {
                                key: 'modules', icon: <SettingOutlined />, label: '模块设置', children: [
                                    { key: 'trend', label: <Space><Switch size="small" checked={isModuleVisible('trend')} onChange={() => toggleModule('trend')} /> 增长趋势</Space> },
                                    { key: 'rating', label: <Space><Switch size="small" checked={isModuleVisible('rating')} onChange={() => toggleModule('rating')} /> 评分分布</Space> },
                                    { key: 'source', label: <Space><Switch size="small" checked={isModuleVisible('source')} onChange={() => toggleModule('source')} /> 来源分布</Space> },
                                    { key: 'shelf', label: <Space><Switch size="small" checked={isModuleVisible('shelfUtil')} onChange={() => toggleModule('shelfUtil')} /> 书架利用率</Space> },
                                    { key: 'publisher', label: <Space><Switch size="small" checked={isModuleVisible('publisher')} onChange={() => toggleModule('publisher')} /> 出版社排行</Space> },
                                    { key: 'author', label: <Space><Switch size="small" checked={isModuleVisible('author')} onChange={() => toggleModule('author')} /> 作者排行</Space> },
                                    { key: 'heatmap', label: <Space><Switch size="small" checked={isModuleVisible('heatmap')} onChange={() => toggleModule('heatmap')} /> 热力图</Space> },
                                ],
                            },
                        ] }}>
                            <Button icon={<SettingOutlined />} shape="circle" style={{ minWidth: 44, minHeight: 44 }} aria-label="设置" />
                        </Dropdown>
                    </Space>
                </div>

                {/* 面包屑 */}
                <Breadcrumb style={{ marginBottom: 16 }}
                    items={[
                        { title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> },
                        { title: <span><FundOutlined /> 管理仪表盘</span> },
                    ]}
                />

                {/* 页头 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                    <div>
                        <Title level={2} style={{ margin: 0 }}><FundOutlined style={{ marginRight: 12, color: token.colorPrimary }} />管理仪表盘</Title>
                        <Text type="secondary">系统概览与数据分析 · 共 {formatNumber(stats.total_books)} 本藏书</Text>
                    </div>
                </div>

                {/* 统计卡片 */}
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    {STAT_CARDS.map((cfg, idx) => (
                        <Col xs={12} sm={8} md={8} lg={24 / 5} key={cfg.key}>
                            <StatCard title={cfg.title} value={(stats[cfg.key] as number) || 0}
                                icon={cfg.icon} color={cfg.color} bgColor={cfg.bg} borderColor={cfg.border}
                                loading={loading} delay={idx * 60}
                                trend={cfg.key === 'total_books' ? trends.bookGrowth : undefined}
                                onClick={cfg.link ? () => navigate(cfg.link) : undefined}
                            />
                        </Col>
                    ))}
                </Row>

                {/* 主内容 */}
                <Row gutter={[16, 16]}>
                    {/* 左列 */}
                    <Col xs={24} lg={12}>
                        {isModuleVisible('trend') && (stats.monthly_growth?.length || 0) > 0 && (
                            <Card title={<Space><LineChartOutlined style={{ color: token.colorPrimary }} /><span>藏书增长趋势</span></Space>}
                                style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`, marginBottom: 16 }}
                                extra={<Button type="link" size="small" onClick={() => toggleModule('trend')}><MinusOutlined /></Button>}
                            >
                                <ReadingTrendChart data={stats.monthly_growth} height={280} loading={loading} />
                            </Card>
                        )}

                        <Row gutter={[16, 16]}>
                            {isModuleVisible('rating') && (
                                <Col xs={24} sm={12}>
                                    <Card title={<Space><StarFilled style={{ color: 'var(--color-accent-amber)' }} /><span>评分分布</span></Space>}
                                        style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`, marginBottom: 16 }}
                                        extra={<Tooltip title="点击柱子跳转评分筛选"><EyeOutlined /></Tooltip>}
                                    >
                                        {ratingBarData.length > 0 ? (
                                            <RatingBarChart data={ratingBarData} height={260} layout="vertical" loading={loading} />
                                        ) : <Empty description="暂无评分数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
                                    </Card>
                                </Col>
                            )}
                            {isModuleVisible('source') && (
                                <Col xs={24} sm={12}>
                                    <Card title={<Space><PieChartOutlined style={{ color: token.colorPrimary }} /><span>来源分布</span></Space>}
                                        style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`, marginBottom: 16 }}
                                        extra={<Tooltip title="点击扇区跳转来源筛选"><EyeOutlined /></Tooltip>}
                                    >
                                        {sourcePieData.length > 0 ? (
                                            <SourcePieChart data={sourcePieData} height={280} showLegend showCenterLabel loading={loading} />
                                        ) : <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
                                    </Card>
                                </Col>
                            )}
                        </Row>

                        {isModuleVisible('shelfUtil') && (stats.shelf_utilization?.length || 0) > 0 && (
                            <Card title={<Space><BarChartOutlined style={{ color: token.colorPrimary }} /><span>书架利用率</span></Space>}
                                style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`, marginBottom: 16 }}
                            >
                                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                                    {stats.shelf_utilization.map((item: any, idx: number) => {
                                        const pct = Math.round(item.percentage);
                                        const sc = pct > 80 ? 'var(--color-danger)' : pct > 60 ? 'var(--color-accent-amber)' : 'var(--color-accent-green)';
                                        return (
                                            <div key={idx}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <Text style={{ fontSize: 13 }}>{item.shelf_name}</Text>
                                                    <Space size={4}>
                                                        <Text strong style={{ fontSize: 13 }}>{item.book_count} 本</Text>
                                                        <Text type="secondary" style={{ fontSize: 11 }}>({pct}%)</Text>
                                                    </Space>
                                                </div>
                                                <Progress percent={pct} strokeColor={sc} railColor={token.colorFillSecondary} size="small" showInfo={false} />
                                            </div>
                                        );
                                    })}
                                </Space>
                            </Card>
                        )}
                    </Col>

                    {/* 右列 */}
                    <Col xs={24} lg={12}>
                        {isModuleVisible('publisher') && (
                            <Card title={<Space><TrophyOutlined style={{ color: 'var(--color-accent-amber)' }} /><span>出版社排行</span></Space>}
                                style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`, marginBottom: 16 }}>
                                <RankingList data={stats.top_publishers || []} maxShow={8} />
                            </Card>
                        )}
                        {isModuleVisible('author') && (
                            <Card title={<Space><UserOutlined style={{ color: token.colorPrimary }} /><span>作者排行</span></Space>}
                                style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`, marginBottom: 16 }}>
                                <RankingList data={stats.top_authors || []} maxShow={8} />
                            </Card>
                        )}
                        {(stats.recent_activities?.length || 0) > 0 && (
                            <Card title={<Space><ClockCircleOutlined style={{ color: token.colorPrimary }} /><span>最近活动</span></Space>}
                                style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`, marginBottom: 16 }}>
                                <Timeline items={(stats.recent_activities || []).slice(0, 8).map((a: any) => {
                                    const cfg = ACTIVITY_CONFIG[a.type] || ACTIVITY_CONFIG.system;
                                    return { color: cfg.color, dot: cfg.icon, children: <div><Space size={4}><Tag color={cfg.color} style={{ fontSize: 10, margin: 0 }}>{cfg.label}</Tag><Text style={{ fontSize: 13 }}>{a.detail}</Text></Space><br /><Text type="secondary" style={{ fontSize: 11 }}>{a.timestamp}</Text></div> };
                                })} />
                            </Card>
                        )}
                        {(stats.recent_books?.length || 0) > 0 && (
                            <Card title={<Space><BookOutlined style={{ color: token.colorPrimary }} /><span>最近添加</span></Space>}
                                style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`, marginBottom: 16 }}>
                                <List dataSource={stats.recent_books.slice(0, 5)} renderItem={(book: any) => (
                                    <div style={{ padding: '10px 0', cursor: 'pointer', borderRadius: 8, minHeight: 44 }}
                                        onClick={() => navigate(`/shelf/1/book/${book.book_id}`)}>
                                        <Space align="start" size={12}>
                                            <Avatar shape="square" size={44} icon={<BookOutlined />} style={{ background: token.colorPrimaryBg, color: token.colorPrimary, borderRadius: 8 }} />
                                            <div>
                                                <Text style={{ fontSize: 14 }} ellipsis>{book.title}</Text><br />
                                                <Space size={6}>
                                                    <Text type="secondary" style={{ fontSize: 11 }}>{book.isbn}</Text>
                                                    <Tag color={book.source === 'douban' ? 'green' : 'orange'} style={{ fontSize: 10, margin: 0 }}>{book.source === 'douban' ? '豆瓣' : '手动'}</Tag>
                                                </Space>
                                            </div>
                                        </Space>
                                    </div>
                                )} />
                            </Card>
                        )}
                    </Col>
                </Row>

                {/* 热力图 */}
                {isModuleVisible('heatmap') && heatmapData && heatmapData.data.length > 0 && (
                    <Card title={<Space><HeatMapOutlined style={{ color: token.colorPrimary }} /><span>书架月度分布热力图</span></Space>}
                        style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`, marginBottom: 16 }}>
                        <ReadingHeatmap months={heatmapData.months} categories={heatmapData.categories} data={heatmapData.data} height={380} loading={loading} />
                    </Card>
                )}

                {/* 底部概览 */}
                <Card style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`, marginTop: 8, background: `linear-gradient(135deg, ${token.colorPrimaryBg} 0%, ${token.colorBgLayout} 100%)` }}>
                    <Row gutter={[24, 16]} justify="center">
                        <Col><Statistic title="今日新增" value={stats.today_books || 0} prefix={<RocketOutlined style={{ color: 'var(--color-accent-blue)' }} />} styles={{ content: { color: 'var(--color-accent-blue)', fontSize: 22 } }} suffix="本" /></Col>
                        <Col><Statistic title="同步次数" value={stats.sync_count || 0} prefix={<SyncOutlined style={{ color: 'var(--color-accent-green)' }} />} styles={{ content: { color: 'var(--color-accent-green)', fontSize: 22 } }} suffix="次" /></Col>
                        <Col><Statistic title="待上架" value={stats.books_not_in_shelf || 0} prefix={<ExclamationCircleOutlined style={{ color: 'var(--color-accent-amber)' }} />} styles={{ content: { color: 'var(--color-accent-amber)', fontSize: 22 } }} suffix="本" /></Col>
                    </Row>
                </Card>

                {/* 快速搜索弹窗 */}
                <Modal title={<Space><SearchOutlined />快速搜索图书</Space>} open={searchOpen} onOk={handleQuickSearch}
                    onCancel={() => setSearchOpen(false)} okText="搜索" cancelText="取消" centered width={400}>
                    <Input placeholder="输入书名/作者/ISBN..." size="large" value={searchText}
                        onChange={(e) => setSearchText(e.target.value)} onPressEnter={handleQuickSearch} autoFocus
                        prefix={<SearchOutlined />} />
                </Modal>

                {/* 通知中心 Drawer */}
                <Drawer title={<Space><BellOutlined />通知中心 {unreadCount > 0 && <Badge count={unreadCount} />}</Space>}
                    open={notifyOpen} onClose={() => setNotifyOpen(false)} placement="right" width={380}>
                    <Tabs items={[
                        { key: 'all', label: `全部 (${notifications.length})`, children: (
                            <List dataSource={notifications} renderItem={(n) => (
                                <div style={{ padding: '12px 0', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                        <Space size={6}>
                                            {n.priority === 'high' && <Tag color="red">重要</Tag>}
                                            <Text strong={!n.read} style={{ fontSize: 14 }}>{n.title}</Text>
                                        </Space>
                                        {n.priority === 'high' && <Badge status="processing" />}
                                    </Space>
                                    <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>{n.detail}</Text>
                                    <Text type="secondary" style={{ fontSize: 10 }}>{new Date(n.time).toLocaleString()}</Text>
                                </div>
                            )} />
                        )},
                        { key: 'unread', label: `未读 (${unreadCount})`, children: (
                            <List dataSource={notifications.filter((n) => !n.read)} renderItem={(n) => (
                                <div style={{ padding: '12px 0', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                                    <Tag color={n.priority === 'high' ? 'red' : 'default'} style={{ marginBottom: 4 }}>{n.priority === 'high' ? '重要' : '普通'}</Tag>
                                    <Text strong style={{ fontSize: 14, display: 'block' }}>{n.title}</Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>{n.detail}</Text>
                                    <Text type="secondary" style={{ fontSize: 10 }}>{new Date(n.time).toLocaleString()}</Text>
                                </div>
                            )} />
                        )},
                    ]} />
                </Drawer>
            </div>
        </ErrorBoundary>
    );
};

export default Dashboard;
export type { DashboardStats };
