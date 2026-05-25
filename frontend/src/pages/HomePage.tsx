// frontend/src/pages/HomePage.tsx
/**
 * 系统首页 - React 19 + Ant Design 6
 */

import React, { useEffect, useState, useCallback, type FC } from 'react';
import {
    Card, Row, Col, Typography, Button, Space, Statistic,
    List, Avatar, Tag, Skeleton, Empty, Progress, Tooltip, theme, Badge,
} from 'antd';
import {
    ScanOutlined, SearchOutlined, ImportOutlined,
    BookOutlined, PlusOutlined, SettingOutlined,
    AppstoreOutlined, ReadOutlined, StarFilled, EnvironmentOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAsyncData } from '../hooks/useAsyncData';
import { getDashboardStats } from '../services/api';

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
    { key: 'nfc', title: 'NFC 扫描', description: '使用手机扫描 NFC 标签，自动跳转到对应书架',
        icon: <ScanOutlined />, color: '#3b82f6', bgColor: '#eff6ff', path: '/api/nfc/mobile', external: true, shortcut: '📱' },
    { key: 'search', title: '图书搜索', description: '通过 ISBN 搜索并同步豆瓣图书信息',
        icon: <SearchOutlined />, color: '#22c55e', bgColor: '#f0fdf4', path: '/search', shortcut: '⌘K' },
    { key: 'import', title: '批量导入', description: '从 Excel/CSV/TXT 文件批量导入图书',
        icon: <ImportOutlined />, color: '#f59e0b', bgColor: '#fffbeb', path: '/import' },
    { key: 'books', title: '全部图书', description: '浏览和管理全部馆藏图书',
        icon: <ReadOutlined />, color: '#8b5cf6', bgColor: '#f5f3ff', path: '/admin/books' },
    { key: 'add', title: '添加图书', description: '手动录入新图书信息',
        icon: <PlusOutlined />, color: '#ec4899', bgColor: '#fdf2f8', path: '/books/add' },
    { key: 'shelves', title: '书架管理', description: '管理逻辑书架和分类',
        icon: <AppstoreOutlined />, color: '#14b8a6', bgColor: '#f0fdfa', path: '/admin/shelves' },
    { key: 'admin', title: '管理后台', description: '系统统计、日志和数据库管理',
        icon: <SettingOutlined />, color: '#64748b', bgColor: '#f8fafc', path: '/admin' },
];

// ==================== ActionCard 子组件 ====================

const ActionCard: FC<{ action: QuickAction; onClick: () => void; delay: number }> = React.memo(
    ({ action, onClick, delay }) => {
        const [visible, setVisible] = useState(false);
        useEffect(() => { const t = setTimeout(() => setVisible(true), delay); return () => clearTimeout(t); }, [delay]);

        return (
            <Card hoverable onClick={onClick} role="button" tabIndex={0}
                aria-label={`${action.title}: ${action.description}`}
                style={{
                    borderRadius: 14, border: `1px solid ${action.color}20`, height: '100%',
                    cursor: 'pointer', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: visible ? 'translateY(0)' : 'translateY(20px)', opacity: visible ? 1 : 0,
                }}
                styles={{ body: { padding: 22 } }}>
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            background: action.bgColor, color: action.color, fontSize: 20, flexShrink: 0 }}>
                            {action.icon}
                        </div>
                        {action.shortcut && (
                            <Text type="secondary" style={{ fontSize: 13, fontFamily: 'monospace' }}>{action.shortcut}</Text>
                        )}
                    </div>
                    <div>
                        <Text strong style={{ fontSize: 15 }}>{action.title}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.5 }}>{action.description}</Text>
                    </div>
                </Space>
            </Card>
        );
    }
);

// ==================== HomePage 主组件 ====================

const HomePage: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();
    const { data: stats, loading } = useAsyncData(getDashboardStats);

    const handleNavigate = useCallback((path: string, external?: boolean) => {
        if (external) { window.open(path, '_blank'); return; }
        navigate(path);
    }, [navigate]);

    const handleBookClick = useCallback((id: number) => navigate(`/shelf/1/book/${id}`), [navigate]);
    const handleShelfClick = useCallback((id: number) => navigate(`/shelf/${id}`), [navigate]);

    // ==================== 渲染函数 ====================

    const renderBookItem = (book: any) => (
        <div style={{ padding: '10px 0', cursor: 'pointer', borderRadius: 8, transition: 'background 0.15s ease' }}
            onClick={() => handleBookClick(book.book_id)}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = token.colorFillSecondary}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            <Space align="start" size={12}>
                <Avatar shape="square" size={44} icon={<BookOutlined />}
                    style={{ background: token.colorPrimaryBg, color: token.colorPrimary, borderRadius: 8 }} />
                <div>
                    <Text style={{ fontSize: 14 }} ellipsis>{book.title}</Text>
                    <br />
                    <Space size={6} wrap>
                        <Text type="secondary" style={{ fontSize: 11 }}>{book.isbn}</Text>
                        <Tag color={book.source === 'douban' ? 'green' : 'orange'}
                            style={{ fontSize: 10, margin: 0, padding: '0 6px', lineHeight: '18px' }}>
                            {book.source === 'douban' ? '豆瓣' : '手动'}
                        </Tag>
                        {book.rating && (
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                <StarFilled style={{ color: '#f59e0b', fontSize: 10, marginRight: 2 }} />
                                {book.rating}
                            </Text>
                        )}
                    </Space>
                </div>
            </Space>
        </div>
    );

    const renderShelfItem = (shelf: any) => (
        <div style={{ padding: '10px 0', cursor: 'pointer', borderRadius: 8, transition: 'background 0.15s ease' }}
            onClick={() => handleShelfClick(shelf.logical_shelf_id)}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = token.colorFillSecondary}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            <Space align="start" size={12}>
                <div style={{ width: 44, height: 44, borderRadius: 10,
                    background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <BookOutlined style={{ color: '#92400e', fontSize: 18 }} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong style={{ fontSize: 14 }}>{shelf.shelf_name}</Text>
                        <Badge count={shelf.book_count || 0} overflowCount={999} style={{ background: token.colorPrimary }} />
                    </div>
                    {shelf.physical_location && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            <EnvironmentOutlined style={{ marginRight: 4, fontSize: 11 }} />
                            {shelf.physical_location}
                        </Text>
                    )}
                    {shelf.book_count > 0 && (
                        <Progress percent={Math.min(100, ((shelf.book_count || 0) / 50) * 100)}
                            showInfo={false} size="small" strokeColor={token.colorPrimary}
                            style={{ marginTop: 4, marginBottom: 0 }} />
                    )}
                </div>
            </Space>
        </div>
    );

    // ==================== 主渲染 ====================

    return (
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 24px 48px' }}>
            {/* 欢迎横幅 */}
            <Card style={{
                borderRadius: 20, overflow: 'hidden', border: 'none',
                background: `linear-gradient(135deg, ${token.colorPrimary}, ${token.colorPrimaryActive})`,
                boxShadow: `0 8px 32px ${token.colorPrimary}20`,
            }} styles={{ body: { padding: '40px 36px' } }}>
                <Row align="middle" gutter={[24, 24]}>
                    <Col xs={24} md={16}>
                        <Space direction="vertical" size={12}>
                            <Title level={2} style={{ color: '#fff', margin: 0, fontSize: 28 }}>欢迎回到书房 📚</Title>
                            <Paragraph style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, margin: 0, maxWidth: 500 }}>
                                智能管理您的藏书，通过 NFC 标签追踪位置，与豆瓣同步图书信息
                            </Paragraph>
                        </Space>
                    </Col>
                    <Col xs={24} md={8}>
                        <Row gutter={[16, 16]}>
                            <Col span={8}>
                                <Statistic title={<Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>馆藏</Text>}
                                    value={stats?.total_books || 0}
                                    valueStyle={{ color: '#fff', fontSize: 32, fontWeight: 700 }} />
                            </Col>
                            <Col span={8}>
                                <Statistic title={<Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>书架</Text>}
                                    value={stats?.total_shelves || 0}
                                    valueStyle={{ color: '#fff', fontSize: 32, fontWeight: 700 }} />
                            </Col>
                            <Col span={8}>
                                <Statistic title={<Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>在架</Text>}
                                    value={stats?.books_in_shelf || 0}
                                    valueStyle={{ color: '#fff', fontSize: 32, fontWeight: 700 }} />
                            </Col>
                        </Row>
                    </Col>
                </Row>
            </Card>

            {/* 快捷操作 */}
            <div style={{ marginTop: 24 }}>
                <Title level={4} style={{ marginBottom: 16 }}>快捷操作</Title>
                <Row gutter={[16, 16]}>
                    {QUICK_ACTIONS.map((action, i) => (
                        <Col key={action.key} xs={24} sm={12} md={8} lg={6}>
                            <ActionCard action={action} delay={i * 80}
                                onClick={() => handleNavigate(action.path, action.external)} />
                        </Col>
                    ))}
                </Row>
            </div>

            {/* 最近活动 */}
            <div style={{ marginTop: 32 }}>
                <Title level={4} style={{ marginBottom: 16 }}>最近活动</Title>
                <Row gutter={[24, 24]}>
                    <Col xs={24} lg={14}>
                        <Card title={<Space><BookOutlined /> 最近添加</Space>} style={{ borderRadius: 14 }}
                            styles={{ body: { padding: '8px 20px 16px' } }}>
                            {loading ? (
                                <div style={{ padding: 12 }}>
                                    {[1,2,3,4,5].map(i => <Skeleton key={i} active avatar={{ size: 40, shape: 'square' }}
                                        paragraph={{ rows: 1 }} title={{ width: '60%' }} />)}
                                </div>
                            ) : stats?.recent_books?.length ? (
                                <List dataSource={stats.recent_books.slice(0, 5)}
                                    renderItem={(book: any) => <List.Item style={{ padding: 0 }}>{renderBookItem(book)}</List.Item>}
                                    split={false} />
                            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无图书" />}
                        </Card>
                    </Col>
                    <Col xs={24} lg={10}>
                        <Card title={<Space><AppstoreOutlined /> 书架概览</Space>} style={{ borderRadius: 14 }}
                            styles={{ body: { padding: '8px 20px 16px' } }}>
                            {loading ? (
                                <div style={{ padding: 12 }}>
                                    {[1,2,3,4].map(i => <Skeleton key={i} active paragraph={{ rows: 1 }} />)}
                                </div>
                            ) : stats?.recent_shelves?.length ? (
                                <List dataSource={stats.recent_shelves.slice(0, 5)}
                                    renderItem={(shelf: any) => <List.Item style={{ padding: 0 }}>{renderShelfItem(shelf)}</List.Item>}
                                    split={false} />
                            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无书架" />}
                        </Card>
                    </Col>
                </Row>
            </div>
        </div>
    );
};

export default HomePage;
