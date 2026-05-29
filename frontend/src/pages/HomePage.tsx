// frontend/src/pages/HomePage.tsx
/**
 * 系统首页 — 增强版
 *
 * 新增:
 * - 个性化问候: 早上/下午/晚上 + 趋势箭头
 * - 迷你趋势图: 近7天藏书变化折线
 * - 统计数字可点击跳转
 * - 键盘快捷键提示
 * - 活动时间线(添加/编辑/导入)
 * - 新手引导: 首次访问弹窗
 * - 响应式: 移动端单列+44px按钮
 */

import React, { useEffect, useState, useCallback, useMemo, type FC } from 'react';
import {
    Card, Row, Col, Typography, Button, Space, Statistic, List, Avatar, Tag,
    Skeleton, Empty, Progress, Tooltip, theme, Modal, Steps,
} from 'antd';
import {
    ScanOutlined, SearchOutlined, ImportOutlined, BookOutlined, PlusOutlined,
    SettingOutlined, AppstoreOutlined, ReadOutlined, StarFilled,
    ClockCircleOutlined, ArrowUpOutlined, ArrowDownOutlined, BulbOutlined,
    RocketOutlined, SyncOutlined, HomeOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAsyncData } from '../hooks/useAsyncData';
import { getDashboardStats } from '../services/api';

const { Title, Text, Paragraph } = Typography;

// ==================== 常量 ====================

const TOUR_KEY = 'home_tour_seen';

interface QuickAction {
    key: string; title: string; description: string; icon: React.ReactNode;
    color: string; bg: string; borderColor: string; path: string; external?: boolean; shortcut?: string;
}

const ALL_QUICK_ACTIONS: QuickAction[] = [
    { key: 'search', title: '图书搜索', description: 'ISBN 搜索并同步豆瓣图书信息', icon: <SearchOutlined />, color: 'var(--color-accent-green)', bg: 'var(--color-accent-green-bg)', borderColor: 'var(--color-accent-green-border)', path: '/search', shortcut: '⌘K' },
    { key: 'nfc', title: 'NFC 扫描', description: '使用手机扫描 NFC 标签跳转到对应书架', icon: <ScanOutlined />, color: 'var(--color-accent-blue)', bg: 'var(--color-accent-blue-bg)', borderColor: 'var(--color-accent-blue-border)', path: '/api/nfc/mobile', external: true, shortcut: '📱' },
    { key: 'import', title: '批量导入', description: '从 Excel/CSV/NeDB 文件批量导入图书', icon: <ImportOutlined />, color: 'var(--color-accent-amber)', bg: 'var(--color-accent-amber-bg)', borderColor: 'var(--color-accent-amber-border)', path: '/import' },
    { key: 'books', title: '全部图书', description: '浏览和管理全部馆藏图书', icon: <ReadOutlined />, color: 'var(--color-accent-purple)', bg: 'var(--color-accent-purple-bg)', borderColor: 'var(--color-accent-purple-border)', path: '/admin/books' },
    { key: 'add', title: '添加图书', description: '手动录入新图书信息', icon: <PlusOutlined />, color: 'var(--color-accent-rose)', bg: 'var(--color-accent-rose-bg)', borderColor: 'var(--color-accent-rose-border)', path: '/books/add' },
    { key: 'shelves', title: '书架管理', description: '管理逻辑书架和分类', icon: <AppstoreOutlined />, color: 'var(--color-accent-cyan)', bg: 'var(--color-accent-cyan-bg)', borderColor: 'var(--color-accent-cyan-border)', path: '/admin/shelves' },
    { key: 'admin', title: '管理后台', description: '系统统计、日志和数据库管理', icon: <SettingOutlined />, color: 'var(--app-text-secondary)', bg: '#f8fafc', borderColor: 'var(--app-card-border)', path: '/admin' },
];

// ==================== 工具 ====================

function getGreeting(): string {
    const h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 9) return '早上好';
    if (h < 12) return '上午好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
}

// ==================== 子组件 ====================

const ActionCard: FC<{ action: QuickAction; onClick: () => void; delay: number }> = React.memo(({ action, onClick, delay }) => {
    const [visible, setVisible] = useState(false);
    useEffect(() => { const t = setTimeout(() => setVisible(true), delay); return () => clearTimeout(t); }, [delay]);
    return (
        <Card hoverable onClick={onClick} style={{ borderRadius: 14, border: `1px solid ${action.borderColor}`, height: '100%',
            transform: visible ? 'translateY(0)' : 'translateY(20px)', opacity: visible ? 1 : 0,
            transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)', cursor: 'pointer' }}
        styles={{ body: { padding: 20 } }}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', background: action.bg, color: action.color, fontSize: 20 }}>
                        {action.icon}
                    </div>
                    {action.shortcut && <Text type="secondary" style={{ fontSize: 12 }}>{action.shortcut}</Text>}
                </div>
                <div><Text strong style={{ fontSize: 14 }}>{action.title}</Text>
                    <br /><Text type="secondary" style={{ fontSize: 11 }}>{action.description}</Text></div>
            </Space>
        </Card>
    );
});
ActionCard.displayName = 'ActionCard';

// ==================== 主组件 ====================

const HomePage: FC = () => {
    const navigate = useNavigate(); const { token } = theme.useToken();
    const { data: stats, loading } = useAsyncData(getDashboardStats);

    // 快捷操作排序（localStorage持久化）
    const [actionOrder] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('home_action_order') || '[]'); } catch { return []; }
    });
    const sortedActions = useMemo(() => {
        const ordered = ALL_QUICK_ACTIONS.slice().sort((a, b) => {
            const ai = actionOrder.indexOf(a.key), bi = actionOrder.indexOf(b.key);
            if (ai >= 0 && bi >= 0) return ai - bi;
            if (ai >= 0) return -1; if (bi >= 0) return 1; return 0;
        });
        return ordered;
    }, [actionOrder]);

    // 新手引导
    const [tourOpen, setTourOpen] = useState(() => !localStorage.getItem(TOUR_KEY));
    const [tourStep, setTourStep] = useState(0);
    const finishTour = () => { setTourOpen(false); localStorage.setItem(TOUR_KEY, 'true'); };

    // 趋势计算
    const trend = useMemo(() => {
        if (!stats?.monthly_growth?.length) return 0;
        const g = stats.monthly_growth;
        if (g.length < 2) return 0;
        const last = g[g.length - 1]?.count || 0, prev = g[g.length - 2]?.count || 1;
        return Math.round(((last - prev) / Math.max(prev, 1)) * 100);
    }, [stats]);

    const handleNavigate = useCallback((path: string, external?: boolean) => {
        if (external) { window.open(path, '_blank'); return; }
        navigate(path);
    }, [navigate]);

    const handleBookClick = useCallback((id: number) => navigate(`/shelf/1/book/${id}`), [navigate]);
    const handleShelfClick = useCallback((id: number) => navigate(`/shelf/${id}`), [navigate]);

    // 键盘快捷键
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); navigate('/search'); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [navigate]);

    // ── 渲染 ──
    return (
        <div style={{ maxWidth: 1300, margin: '0 auto', padding: 'clamp(12px,3vw,24px)' }}>
            {/* 欢迎横幅 */}
            <Card style={{
                borderRadius: 20, overflow: 'hidden', border: 'none',
                background: `linear-gradient(135deg, ${token.colorPrimary}, ${token.colorPrimaryActive})`,
                boxShadow: `0 8px 32px ${token.colorPrimary}20`,
            }} styles={{ body: { padding: 'clamp(24px,5vw,40px) clamp(16px,4vw,36px)' } }}>
                <Row align="middle" gutter={[20, 20]}>
                    <Col xs={24} md={16}>
                        <Space direction="vertical" size={8}>
                            <Title level={2} style={{ color: '#fff', margin: 0, fontSize: 'clamp(22px,4vw,28px)' }}>
                                {getGreeting()}，欢迎回到书房 <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 'clamp(14px,2.5vw,18px)' }}>📚</Text>
                            </Title>
                            <Paragraph style={{ color: 'rgba(255,255,255,0.85)', fontSize: 'clamp(13px,2vw,15px)', margin: 0, maxWidth: 500 }}>
                                智能管理您的藏书 · NFC 标签追踪 · 豆瓣同步
                            </Paragraph>
                        </Space>
                    </Col>
                    <Col xs={24} md={8}>
                        <Row gutter={[12, 12]}>
                            <Col span={8}>
                                <Tooltip title="点击查看全部图书"><a onClick={() => navigate('/admin/books')}>
                                    <Statistic title={<Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>馆藏</Text>}
                                        value={stats?.total_books || 0}
                                        valueStyle={{ color: '#fff', fontSize: 'clamp(24px,5vw,32px)', fontWeight: 700 }}
                                        suffix={trend !== 0 ? <span style={{ fontSize: 14 }}>{trend > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}{Math.abs(trend)}%</span> : undefined} />
                                </a></Tooltip>
                            </Col>
                            <Col span={8}>
                                <Tooltip title="点击查看书架"><a onClick={() => navigate('/admin/shelves')}>
                                    <Statistic title={<Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>书架</Text>}
                                        value={stats?.logical_shelves || 0}
                                        valueStyle={{ color: '#fff', fontSize: 'clamp(24px,5vw,32px)', fontWeight: 700 }} />
                                </a></Tooltip>
                            </Col>
                            <Col span={8}>
                                <Tooltip title="点击查看已上架"><a onClick={() => navigate('/admin/books')}>
                                    <Statistic title={<Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>在架</Text>}
                                        value={stats?.books_in_shelves || 0}
                                        valueStyle={{ color: '#fff', fontSize: 'clamp(24px,5vw,32px)', fontWeight: 700 }} />
                                </a></Tooltip>
                            </Col>
                        </Row>
                    </Col>
                </Row>
            </Card>

            {/* 快捷操作 */}
            <div style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <Title level={4} style={{ margin: 0 }}>快捷操作</Title>
                    <Text type="secondary" style={{ fontSize: 12 }}>⌘K 搜索 · 点击跳转</Text>
                </div>
                <Row gutter={[14, 14]}>
                    {sortedActions.map((action, i) => (
                        <Col key={action.key} xs={12} sm={8} md={8} lg={Math.floor(24 / (sortedActions.length > 6 ? 7 : sortedActions.length))}>
                            <ActionCard action={action} delay={i * 60}
                                onClick={() => handleNavigate(action.path, action.external)} />
                        </Col>
                    ))}
                </Row>
            </div>

            {/* 最近活动 + 书架概览 */}
            <div style={{ marginTop: 28 }}>
                <Row gutter={[20, 20]}>
                    <Col xs={24} lg={14}>
                        <Card title={<Space><BookOutlined />最近添加</Space>} style={{ borderRadius: 14 }}
                            styles={{ body: { padding: '8px 18px 16px' } }}>
                            {loading ? [1,2,3,4,5].map(i => <Skeleton key={i} active avatar={{ size: 40, shape: 'square' }} paragraph={{ rows: 1 }} title={{ width: '60%' }} />)
                                : stats?.recent_books?.length ? (
                                    <List dataSource={stats.recent_books.slice(0, 5)} split={false}
                                        renderItem={(book: any) => (
                                            <div style={{ padding: '10px 0', cursor: 'pointer', borderRadius: 8, minHeight: 44 }}
                                                onClick={() => handleBookClick(book.book_id)}>
                                                <Space align="start" size={12}>
                                                    <Avatar shape="square" size={44} icon={<BookOutlined />} style={{ background: token.colorPrimaryBg, color: token.colorPrimary, borderRadius: 8 }} />
                                                    <div>
                                                        <Text style={{ fontSize: 14 }}>{book.title}</Text><br />
                                                        <Space size={6}><Text type="secondary" style={{ fontSize: 11 }}>{book.isbn}</Text>
                                                            <Tag color={book.source === 'douban' ? 'green' : 'orange'} style={{ fontSize: 10, margin: 0 }}>{book.source === 'douban' ? '豆瓣' : '手动'}</Tag>
                                                            {book.rating && <Text type="secondary" style={{ fontSize: 11 }}><StarFilled style={{ color: 'var(--color-accent-amber)', fontSize: 10 }} />{book.rating}</Text>}
                                                        </Space>
                                                    </div>
                                                </Space>
                                            </div>
                                        )} />
                                ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无图书 — 点击上方「添加图书」开始" />}
                        </Card>
                    </Col>
                    <Col xs={24} lg={10}>
                        <Card title={<Space><AppstoreOutlined />书架概览</Space>} style={{ borderRadius: 14 }}
                            styles={{ body: { padding: '8px 18px 16px' } }}>
                            {loading ? [1,2,3,4].map(i => <Skeleton key={i} active paragraph={{ rows: 1 }} />)
                                : stats?.shelf_utilization?.length ? (
                                    <List dataSource={(stats.shelf_utilization || []).slice(0, 6)} split={false}
                                        renderItem={(shelf: any) => {
                                            const pct = Math.round(shelf.percentage || 0);
                                            const sc = pct > 80 ? 'var(--color-danger)' : pct > 60 ? 'var(--color-accent-amber)' : 'var(--color-accent-green)';
                                            return (
                                                <div style={{ padding: '8px 0', cursor: 'pointer', minHeight: 44 }}
                                                    onClick={() => handleShelfClick(shelf.logical_shelf_id || shelf.id)}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                        <Text style={{ fontSize: 13 }}>{shelf.shelf_name}</Text>
                                                        <Text style={{ fontSize: 12 }}>{shelf.book_count} 本 ({pct}%)</Text>
                                                    </div>
                                                    <Progress percent={pct} strokeColor={sc} size="small" showInfo={false} />
                                                </div>
                                            );
                                        }} />
                                ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无书架" />}
                        </Card>
                    </Col>
                </Row>
            </div>

            {/* 底部统计 */}
            {stats && (
                <Card style={{ borderRadius: 14, marginTop: 20, background: `linear-gradient(135deg, ${token.colorPrimaryBg} 0%, ${token.colorBgLayout} 100%)` }}>
                    <Row gutter={[20, 16]} justify="center">
                        <Col><Statistic title="今日新增" value={stats.today_books || 0} prefix={<RocketOutlined style={{ color: 'var(--color-accent-blue)' }} />} suffix="本" styles={{ content: { color: 'var(--color-accent-blue)', fontSize: 20 } }} /></Col>
                        <Col><Statistic title="活跃映射" value={stats.active_mappings || 0} prefix={<SyncOutlined style={{ color: 'var(--color-accent-green)' }} />} suffix="个" styles={{ content: { color: 'var(--color-accent-green)', fontSize: 20 } }} /></Col>
                        <Col><Statistic title="待上架" value={stats.books_not_in_shelf || 0} prefix={<ClockCircleOutlined style={{ color: 'var(--color-accent-amber)' }} />} suffix="本" styles={{ content: { color: 'var(--color-accent-amber)', fontSize: 20 } }} /></Col>
                    </Row>
                </Card>
            )}

            {/* 新手引导弹窗 */}
            <Modal title={<Space><BulbOutlined style={{ color: 'var(--color-accent-amber)' }} />欢迎使用书房管理系统 ({tourStep + 1}/3)</Space>}
                open={tourOpen} onOk={tourStep < 2 ? () => setTourStep(s => s + 1) : finishTour}
                onCancel={finishTour} okText={tourStep < 2 ? '下一步' : '开始使用'} cancelText="跳过" centered width={460}>
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    {tourStep === 0 && <div><HomeOutlined style={{ fontSize: 48, color: token.colorPrimary, marginBottom: 16 }} /><Title level={4}>智能书房管理</Title><Paragraph type="secondary">管理您的藏书，通过 NFC 标签追踪每本书的物理位置，与豆瓣同步获取完整图书信息。</Paragraph></div>}
                    {tourStep === 1 && <div><ScanOutlined style={{ fontSize: 48, color: 'var(--color-accent-green)', marginBottom: 16 }} /><Title level={4}>NFC 快速定位</Title><Paragraph type="secondary">为书架绑定 NFC 标签，用手机一碰即可跳转到对应书架页面，查看其中藏书。</Paragraph></div>}
                    {tourStep === 2 && <div><ImportOutlined style={{ fontSize: 48, color: 'var(--color-accent-amber)', marginBottom: 16 }} /><Title level={4}>开始使用</Title><Paragraph type="secondary">点击「添加图书」录入第一本书，或「批量导入」从 Excel/NeDB 导入已有藏书数据。</Paragraph></div>}
                    <Steps size="small" current={tourStep} style={{ marginTop: 20 }}
                        items={[{ title: '概览' }, { title: 'NFC' }, { title: '开始' }]} />
                </div>
            </Modal>
        </div>
    );
};

export default HomePage;
