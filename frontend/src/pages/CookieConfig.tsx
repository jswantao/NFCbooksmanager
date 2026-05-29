// frontend/src/pages/CookieConfig.tsx
/**
 * 豆瓣 Cookie 配置页面 — 增强版
 *
 * 新增:
 * - 智能解析: 粘贴自动识别 dbcl2/ck/bid 等关键字段,高亮缺失项
 * - 格式校验: 实时检测格式错误,标红提示
 * - 多账号管理: localStorage 保存多个账号Cookie+备注+快速切换
 * - 脱敏增强: 密码风格隐藏+可展开查看完整内容
 * - 浏览器差异提示: Chrome/Firefox/Safari 操作差异标注
 * - FAQ面板: 折叠式常见问题解答
 * - Cookie格式示例: 点击复制标准格式参考
 * - 使用统计: 本地记录调用次数/最近成功时间
 */

import React, { useEffect, useState, useCallback, useMemo, useRef, type FC } from 'react';
import {
    Card, Input, Button, Space, Typography, message, Alert, Spin, Tag, Steps,
    Statistic, Row, Col, Rate, Popconfirm, Tooltip, Collapse, Breadcrumb,
    theme, Divider, Modal, Descriptions, Timeline, Progress, Skeleton,
    Select, Table, Badge, type CollapseProps,
} from 'antd';
import {
    KeyOutlined, CheckCircleOutlined, ExclamationCircleOutlined, DeleteOutlined,
    SaveOutlined, ExperimentOutlined, EyeOutlined, EyeInvisibleOutlined,
    CopyOutlined, QuestionCircleOutlined, LinkOutlined, BookOutlined,
    UserOutlined, SafetyOutlined, ThunderboltOutlined, InfoCircleOutlined,
    HomeOutlined, ClockCircleOutlined, SettingOutlined, ClearOutlined,
    ReloadOutlined, WarningOutlined, ImportOutlined, ChromeOutlined,
    PlusOutlined, SwapOutlined, EditOutlined, StarOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getCookieConfig, saveCookieConfig, testCookieConfig, deleteCookieConfig, extractErrorMessage } from '../services/api';
import { useAsyncData } from '../hooks/useAsyncData';
import { formatDate } from '../utils/format';
import UnifiedCover from '../components/UnifiedCover';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ==================== 类型 ====================

interface CookieInfo { has_cookie: boolean; cookie_preview: string; user_agent: string; updated_at?: string }
interface TestResult { success: boolean; message: string; cookie_valid: boolean; test_book?: { title: string; author: string; cover_url: string; publisher: string; rating: string } }
interface ParsedFields { dbcl2?: string; ck?: string; bid?: string; ll?: string; _vsn_?: string; push_noty?: string; push_doumail?: string; [key: string]: string | undefined }
interface SavedAccount { id: string; label: string; cookie: string; createdAt: string; lastUsed?: string }
interface UsageStats { callCount: number; lastSuccess?: string; lastError?: string; successRate: number }

const REQUIRED_FIELDS = ['dbcl2', 'ck', 'bid'];

// ==================== 工具函数 ====================

function parseCookieFields(raw: string): ParsedFields {
    const fields: ParsedFields = {};
    raw.split(';').forEach((p) => {
        const eq = p.indexOf('=');
        if (eq > 0) { const k = p.slice(0, eq).trim(); const v = p.slice(eq + 1).trim(); if (k) fields[k] = v; }
    });
    return fields;
}

function maskCookie(cookie: string, show: boolean): string {
    if (!cookie) return '';
    if (show) return cookie;
    if (cookie.length <= 50) return cookie;
    return cookie.slice(0, 25) + '●'.repeat(20) + cookie.slice(-15);
}

// ==================== 主组件 ====================

const CookieConfig: FC = () => {
    const navigate = useNavigate(); const { token } = theme.useToken();
    const { data: cookieInfo, loading, error, refresh: load } = useAsyncData(() => import('../services/api').then((m) => m.getCookieConfig()), []);
    const [cookieInput, setCookieInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [testing, setTesting] = useState(false);
    const [showFull, setShowFull] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);

    // ── 智能解析 ──
    const parsedFields = useMemo(() => parseCookieFields(cookieInput), [cookieInput]);
    const parsedKeys = Object.keys(parsedFields);
    const missingFields = REQUIRED_FIELDS.filter((f) => !parsedFields[f]);
    const cookieLength = cookieInput.length;

    // ── 多账号 ──
    const [accounts, setAccounts] = useState<SavedAccount[]>(() => {
        try { return JSON.parse(localStorage.getItem('cookie_accounts') || '[]'); } catch { return []; }
    });
    const [activeAccountId, setActiveAccountId] = useState<string | null>(() => localStorage.getItem('cookie_active_account'));
    const [newAccountLabel, setNewAccountLabel] = useState('');
    const [editLabelOpen, setEditLabelOpen] = useState(false);
    const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');

    const saveAccounts = useCallback((accs: SavedAccount[]) => {
        setAccounts(accs);
        localStorage.setItem('cookie_accounts', JSON.stringify(accs));
    }, []);

    const handleSaveAccount = useCallback(async () => {
        const trimmed = cookieInput.trim();
        if (!trimmed) { message.warning('请输入 Cookie'); return; }
        if (!trimmed.includes('=')) { message.warning('Cookie 格式不正确'); return; }
        setSaving(true);
        try {
            await saveCookieConfig({ cookie: trimmed });
            // Save to local accounts list
            const now = new Date().toISOString();
            const accs = accounts;
            if (activeAccountId) {
                const idx = accs.findIndex((a) => a.id === activeAccountId);
                if (idx >= 0) { accs[idx].cookie = trimmed; accs[idx].lastUsed = now; accs[idx].label = newAccountLabel || accs[idx].label; }
            }
            const id = activeAccountId || `acct_${Date.now()}`;
            const label = newAccountLabel || activeAccountId ? accs.find((a) => a.id === activeAccountId)?.label || `账号 ${accounts.length + 1}` : `账号 ${accounts.length + 1}`;
            if (!activeAccountId) accs.push({ id, label, cookie: trimmed, createdAt: now, lastUsed: now });
            saveAccounts(accs);
            setActiveAccountId(id);
            localStorage.setItem('cookie_active_account', id);
            message.success('Cookie 已保存');
            setCookieInput(''); setNewAccountLabel('');
            load();
        } catch (err: any) { message.error(extractErrorMessage(err) || '保存失败'); }
        finally { setSaving(false); }
    }, [cookieInput, accounts, activeAccountId, newAccountLabel, load, saveAccounts]);

    const handleSwitchAccount = useCallback(async (id: string) => {
        const acc = accounts.find((a) => a.id === id);
        if (!acc) return;
        setSaving(true);
        try {
            await saveCookieConfig({ cookie: acc.cookie });
            setActiveAccountId(id);
            localStorage.setItem('cookie_active_account', id);
            // Update lastUsed
            const accs = accounts.map((a) => a.id === id ? { ...a, lastUsed: new Date().toISOString() } : a);
            saveAccounts(accs);
            message.success(`已切换到「${acc.label}」`);
            load();
        } catch (err: any) { message.error(extractErrorMessage(err) || '切换失败'); }
        finally { setSaving(false); }
    }, [accounts, load, saveAccounts]);

    const handleDeleteAccount = useCallback((id: string) => {
        const accs = accounts.filter((a) => a.id !== id);
        saveAccounts(accs);
        if (activeAccountId === id) { setActiveAccountId(null); localStorage.removeItem('cookie_active_account'); }
        message.success('账号已移除');
    }, [accounts, activeAccountId, saveAccounts]);

    // ── 测试 ──
    const handleTest = useCallback(async () => {
        setTesting(true); setTestResult(null);
        try {
            const result = await testCookieConfig();
            setTestResult(result);
            // Update local stats
            const stats: UsageStats = JSON.parse(localStorage.getItem('cookie_stats') || '{"callCount":0,"successRate":100}');
            stats.callCount++; stats.lastSuccess = result.cookie_valid ? new Date().toISOString() : stats.lastSuccess;
            stats.lastError = !result.cookie_valid ? new Date().toISOString() : stats.lastError;
            stats.successRate = Math.round((stats.callCount - (result.cookie_valid ? 0 : 1)) / stats.callCount * 100);
            localStorage.setItem('cookie_stats', JSON.stringify(stats));
            message[result.cookie_valid ? 'success' : 'warning']({ content: result.message, key: 'test-result' });
        } catch (err: any) { setTestResult({ success: false, message: extractErrorMessage(err) || '测试失败', cookie_valid: false }); message.error({ content: extractErrorMessage(err) || '测试失败', key: 'test-error' }); }
        finally { setTesting(false); }
    }, []);

    // ── 删除 ──
    const handleDelete = useCallback(async () => {
        try {
            await deleteCookieConfig();
            message.success('Cookie 已清除');
            setTestResult(null);
            if (activeAccountId) { const accs = accounts.filter((a) => a.id !== activeAccountId); saveAccounts(accs); setActiveAccountId(null); localStorage.removeItem('cookie_active_account'); }
            load();
        } catch (err: any) { message.error(extractErrorMessage(err) || '清除失败'); }
    }, [load, accounts, activeAccountId, saveAccounts]);

    // ── 使用统计 ──
    const stats = useMemo((): UsageStats => {
        try { return JSON.parse(localStorage.getItem('cookie_stats') || '{"callCount":0,"successRate":100}'); }
        catch { return { callCount: 0, successRate: 100 }; }
    }, [testResult]);

    // ── 状态 ──
    const statusConfig = useMemo(() => {
        if (!cookieInfo) return null;
        return {
            hasCookie: cookieInfo.has_cookie,
            label: cookieInfo.has_cookie ? '已配置' : '未配置',
            color: cookieInfo.has_cookie ? '#22c55e' : '#f59e0b',
            icon: cookieInfo.has_cookie ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />,
        };
    }, [cookieInfo]);

    // ── 教程步骤 ──
    const tutorialItems: CollapseProps['items'] = [{
        key: 'tutorial', label: <Space><QuestionCircleOutlined style={{ color: '#3b82f6' }} /><span style={{ fontWeight: 600 }}>如何获取豆瓣 Cookie？</span></Space>,
        children: (
            <div>
                <Steps direction="vertical" size="small" current={-1}
                    items={[
                        { title: '登录豆瓣读书', description: <span>打开 <a href="https://book.douban.com" target="_blank" rel="noopener">book.douban.com</a> 并登录</span>, icon: <LinkOutlined /> },
                        { title: '打开开发者工具', description: <span>Chrome/Edge: <Tag>F12</Tag> 或 <Tag>Ctrl+Shift+I</Tag> | Firefox: <Tag>F12</Tag> | Safari: <Tag>⌘⌥I</Tag>（需先启用"开发"菜单）</span>, icon: <SettingOutlined /> },
                        { title: '切换到 Network 标签', description: '选择 "Network"(网络) 标签页，确保已勾选 "Preserve log"(保留日志)', icon: <ThunderboltOutlined /> },
                        { title: '刷新并复制 Cookie', description: '按 F5 刷新，点击任意请求 → Request Headers → 找到 Cookie 字段 → 右键 "Copy value"', icon: <CopyOutlined /> },
                        { title: '粘贴保存', description: '粘贴到下方输入框，点击保存。推荐设置账号备注便于管理', icon: <SaveOutlined /> },
                    ]}
                />
                <Alert type="warning" showIcon style={{ marginTop: 16, borderRadius: 8 }}
                    message="注意事项"
                    description={<ul style={{ paddingLeft: 20, margin: 0 }}><li>Cookie 通常 1-7 天过期，需定期更新</li><li>建议使用备用账号避免主账号受限</li><li>Cookie 仅保存在本地服务器，不上传第三方</li></ul>} />
            </div>
        ),
    }];

    // ── FAQ ──
    const faqItems: CollapseProps['items'] = [
        { key: 'q1', label: 'Cookie 为什么经常失效？', children: <Paragraph>豆瓣 Cookie 有效期通常为 1-7 天。浏览器关闭或长时间不访问豆瓣都会导致 Cookie 过期。建议每周更新一次 Cookie。</Paragraph> },
        { key: 'q2', label: '如何延长 Cookie 有效期？', children: <Paragraph>无法手动延长豆瓣 Cookie 有效期。建议开启"自动备份"定期重新获取。使用 Chrome 扩展可一键导出最新 Cookie。</Paragraph> },
        { key: 'q3', label: 'Cookie 复制后格式不对？', children: <Paragraph>确保从 Network 标签的 Request Headers 中复制完整值。不要只复制 dbcl2 字段。Cookie 应包含 dbcl2、ck、bid 等关键字段。</Paragraph> },
        { key: 'q4', label: '测试成功但同步失败？', children: <Paragraph>Cookie 有效但豆瓣可能限制请求频率。建议将同步间隔设置为 2 秒以上，或更换账号。</Paragraph> },
    ];

    // ── 渲染 ──
    if (loading && !cookieInfo) {
        return <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}><Skeleton active paragraph={{ rows: 2 }} /><Card style={{ borderRadius: 12, marginTop: 16 }}><Skeleton active paragraph={{ rows: 8 }} /></Card></div>;
    }

    return (
        <div style={{ maxWidth: 860, margin: '0 auto', padding: 'clamp(12px,3vw,24px)' }}>
            <Breadcrumb style={{ marginBottom: 16 }} items={[{ title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> }, { title: <a onClick={() => navigate('/admin')}><SettingOutlined /> 管理</a> }, { title: <span><SafetyOutlined /> Cookie 配置</span> }]} />

            <Title level={2} style={{ marginBottom: 20 }}><SafetyOutlined style={{ marginRight: 12, color: token.colorPrimary }} />豆瓣 Cookie 配置</Title>

            {error && <Alert title="加载失败" description={error} type="error" showIcon style={{ marginBottom: 16 }} action={<Button size="small" onClick={load} icon={<ReloadOutlined />}>重试</Button>} />}

            {/* 获取教程 */}
            <Card style={{ marginBottom: 20, borderRadius: 12 }}><Collapse ghost items={tutorialItems} /></Card>

            {/* 状态 + 统计 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                <Col xs={24} sm={8}>
                    <Card size="small" style={{ borderRadius: 12, background: cookieInfo?.has_cookie ? '#f0fdf4' : '#fffbeb', border: `1px solid ${cookieInfo?.has_cookie ? '#bbf7d0' : '#fde68a'}` }}>
                        <Statistic title="配置状态" value={cookieInfo?.has_cookie ? '已配置 ✓' : '未配置'} valueStyle={{ color: cookieInfo?.has_cookie ? '#22c55e' : '#f59e0b', fontSize: 18 }} prefix={cookieInfo?.has_cookie ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />} />
                    </Card>
                </Col>
                <Col xs={12} sm={8}>
                    <Card size="small" style={{ borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <Statistic title="调用次数" value={stats.callCount} prefix={<ThunderboltOutlined style={{ color: '#3b82f6' }} />} suffix="次" />
                    </Card>
                </Col>
                <Col xs={12} sm={8}>
                    <Card size="small" style={{ borderRadius: 12, background: '#faf5ff', border: '1px solid #e9d5ff' }}>
                        <Statistic title="成功率" value={stats.successRate} prefix={<CheckCircleOutlined style={{ color: '#a855f7' }} />} suffix="%" valueStyle={{ color: stats.successRate >= 80 ? '#22c55e' : '#f59e0b' }} />
                    </Card>
                </Col>
            </Row>

            {/* 多账号管理 */}
            {accounts.length > 0 && (
                <Card size="small" title={<Space><UserOutlined />多账号管理 ({accounts.length})</Space>}
                    style={{ borderRadius: 12, marginBottom: 20, border: `1px solid ${token.colorBorderSecondary}` }}>
                    <Table dataSource={accounts} rowKey="id" pagination={false} size="small"
                        columns={[
                            { title: '备注名', dataIndex: 'label', key: 'label', render: (label: string, record: SavedAccount) => (
                                <Space>{activeAccountId === record.id ? <Badge status="processing" /> : <Badge status="default" />}<Text strong={activeAccountId === record.id}>{label}</Text>{activeAccountId === record.id && <Tag color="green" style={{ fontSize: 10 }}>当前</Tag>}</Space>) },
                            { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 110, render: (t: string) => new Date(t).toLocaleDateString() },
                            { title: '最近使用', dataIndex: 'lastUsed', key: 'lastUsed', width: 110, render: (t: string) => t ? new Date(t).toLocaleDateString() : '-' },
                            { title: '操作', key: 'actions', width: 140, render: (_: any, record: SavedAccount) => (
                                <Space size={2}>
                                    {activeAccountId !== record.id && <Button type="link" size="small" icon={<SwapOutlined />} onClick={() => handleSwitchAccount(record.id)}>切换</Button>}
                                    <Popconfirm title="移除此账号？" onConfirm={() => handleDeleteAccount(record.id)} okText="移除" cancelText="取消"><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
                                </Space>) },
                        ]} />
                </Card>
            )}

            {/* Cookie 设置 */}
            <Card style={{ marginBottom: 20, borderRadius: 12, border: `1px solid ${token.colorBorderSecondary}` }}
                title={<Space><SettingOutlined style={{ color: token.colorPrimary }} />Cookie 设置</Space>}
                extra={
                    <Space size={4}>
                        <Tooltip title="复制标准格式示例"><Button size="small" icon={<CopyOutlined />}
                            onClick={() => { const sample = `dbcl2="..."; ck="..."; bid="..."`; navigator.clipboard.writeText(sample); message.success('示例格式已复制'); }}>示例</Button></Tooltip>
                        <Tooltip title="快速导入"><Button size="small" icon={<ImportOutlined />} onClick={() => setShowImportModal(true)} /></Tooltip>
                    </Space>
                }>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    {/* 账号备注 */}
                    <Input placeholder="账号备注（如：主账号、备用账号）" value={newAccountLabel} onChange={(e) => setNewAccountLabel(e.target.value)}
                        prefix={<EditOutlined />} style={{ maxWidth: 300 }} allowClear />

                    {/* Cookie 输入 */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <label style={{ fontWeight: 500 }}>Cookie 字符串</label>
                            <Space size={6}>
                                <Text type="secondary" style={{ fontSize: 11 }}>{cookieLength} 字符</Text>
                                {cookieLength > 0 && <Tag color={cookieLength < 500 ? 'orange' : cookieLength < 1000 ? 'blue' : 'green'} style={{ fontSize: 10 }}>{cookieLength < 500 ? '可能不完整' : cookieLength < 1000 ? '基本可用' : '较完整'}</Tag>}
                            </Space>
                        </div>
                        <TextArea rows={6} placeholder='dbcl2="1234567890"; ck="abcdef..."; bid="xyz..."' value={cookieInput}
                            onChange={(e) => setCookieInput(e.target.value)}
                            style={{ borderRadius: 8, fontFamily: 'monospace', fontSize: 13,
                                borderColor: cookieLength > 0 && missingFields.length > 0 ? '#f59e0b' : undefined }} />
                    </div>

                    {/* 智能解析面板 */}
                    {cookieLength > 0 && (
                        <div style={{ padding: 12, background: token.colorFillQuaternary, borderRadius: 8 }}>
                            <Text strong style={{ fontSize: 12 }}>字段解析:</Text>
                            <Space wrap size={[4, 4]} style={{ marginTop: 6 }}>
                                {REQUIRED_FIELDS.map((f) => (
                                    <Tag key={f} color={parsedFields[f] ? 'green' : 'red'} style={{ fontSize: 11 }}>
                                        {f}: {parsedFields[f] ? parsedFields[f]!.slice(0, 12) + '…' : '缺失'}
                                    </Tag>
                                ))}
                                {parsedKeys.filter((k) => !REQUIRED_FIELDS.includes(k)).slice(0, 5).map((k) => (
                                    <Tag key={k} style={{ fontSize: 11 }}>{k}: {parsedFields[k]!.slice(0, 10)}…</Tag>
                                ))}
                                {parsedKeys.length > 8 && <Text type="secondary" style={{ fontSize: 11 }}>+{parsedKeys.length - 8} 更多</Text>}
                            </Space>
                            {missingFields.length > 0 && (
                                <Alert type="warning" message={`缺少关键字段: ${missingFields.join(', ')}。请确认 Cookie 完整复制`} style={{ marginTop: 8, borderRadius: 6 }} />
                            )}
                        </div>
                    )}

                    {/* 按钮 */}
                    <Space size={12} wrap>
                        <Button type="primary" size="large" icon={<SaveOutlined />} loading={saving} onClick={handleSaveAccount}
                            disabled={!cookieInput.trim()} style={{ borderRadius: 8, minHeight: 44 }}>保存{activeAccountId ? '更新' : ''}</Button>
                        <Button size="large" icon={<ExperimentOutlined />} loading={testing} onClick={handleTest}
                            disabled={!cookieInfo?.has_cookie} style={{ borderRadius: 8, minHeight: 44 }}>测试有效性</Button>
                        <Button size="large" icon={<ClearOutlined />} onClick={() => setCookieInput('')} disabled={!cookieInput} style={{ borderRadius: 8, minHeight: 44 }}>清空</Button>
                    </Space>
                </Space>
            </Card>

            {/* Cookie 预览（已配置时） */}
            {cookieInfo?.has_cookie && (
                <Card style={{ marginBottom: 20, borderRadius: 12, border: `1px solid ${token.colorBorderSecondary}` }}
                    title={<Space><EyeOutlined />已保存的 Cookie</Space>}
                    extra={
                        <Space size={4}>
                            <Tooltip title={showFull ? '隐藏' : '显示完整'}><Button size="small" type="text" icon={showFull ? <EyeInvisibleOutlined /> : <EyeOutlined />} onClick={() => setShowFull(!showFull)} /></Tooltip>
                            <Tooltip title="复制"><Button size="small" type="text" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(cookieInfo.cookie_preview); message.success('已复制'); }} /></Tooltip>
                            <Popconfirm title="确定删除 Cookie 配置？" description="删除后豆瓣同步功能将不可用" onConfirm={handleDelete} okText="确定删除" cancelText="取消" okButtonProps={{ danger: true }}>
                                <Button size="small" danger type="text" icon={<DeleteOutlined />} /></Popconfirm>
                        </Space>
                    }>
                    <Text code style={{ fontSize: 12, wordBreak: 'break-all', display: 'block', padding: 10, borderRadius: 8, background: token.colorBgContainer }}>
                        {maskCookie(cookieInfo.cookie_preview, showFull)}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                        {cookieInfo.cookie_preview?.length || 0} 字符
                        {cookieInfo.updated_at && <span> · 更新于 {formatDate(cookieInfo.updated_at, 'full')}</span>}
                    </Text>
                </Card>
            )}

            {/* 测试结果 */}
            {testResult && (
                <Card style={{ marginBottom: 20, borderRadius: 12, borderLeft: `4px solid ${testResult.cookie_valid ? '#22c55e' : '#ef4444'}` }}
                    title={<Space>{testResult.cookie_valid ? <CheckCircleOutlined style={{ color: '#22c55e', fontSize: 18 }} /> : <ExclamationCircleOutlined style={{ color: '#ef4444', fontSize: 18 }} />}<Tag color={testResult.cookie_valid ? 'success' : 'error'}>{testResult.cookie_valid ? '测试通过' : '测试失败'}</Tag></Space>}>
                    <Alert title={testResult.message} type={testResult.cookie_valid ? 'success' : 'error'} showIcon style={{ borderRadius: 8 }} />
                    {testResult.cookie_valid && testResult.test_book && (
                        <div style={{ marginTop: 16, padding: 20, background: token.colorFillSecondary, borderRadius: 12 }}>
                            <Text strong><ThunderboltOutlined style={{ color: '#f59e0b', marginRight: 8 }} />示例图书</Text>
                            <Row gutter={[20, 16]} style={{ marginTop: 12 }}>
                                <Col xs={24} sm={8} style={{ textAlign: 'center' }}>
                                    <UnifiedCover book={testResult.test_book} mode="image" aspectRatio="3/4" borderRadius={10} shadow style={{ width: '100%', maxWidth: 160 }} preview={{ mask: '查看封面' }} />
                                </Col>
                                <Col xs={24} sm={16}>
                                    <Title level={4} style={{ margin: 0 }}>{testResult.test_book.title}</Title>
                                    {testResult.test_book.rating && <div style={{ margin: '8px 0' }}><Rate disabled allowHalf value={parseFloat(testResult.test_book.rating) / 2} style={{ fontSize: 14 }} /><Text strong style={{ fontSize: 18, color: '#f59e0b', marginLeft: 8 }}>{testResult.test_book.rating}</Text></div>}
                                    <Space direction="vertical" size="small">
                                        {testResult.test_book.author && <Text><UserOutlined /> {testResult.test_book.author}</Text>}
                                        {testResult.test_book.publisher && <Text type="secondary"><BookOutlined /> {testResult.test_book.publisher}</Text>}
                                    </Space>
                                </Col>
                            </Row>
                        </div>
                    )}
                    {!testResult.cookie_valid && <Alert type="warning" showIcon style={{ marginTop: 12, borderRadius: 8 }} title="常见原因" description={<ul style={{ paddingLeft: 20, margin: 0 }}><li>Cookie 已过期</li><li>未完整复制</li><li>网络连接问题</li><li>豆瓣临时限制</li></ul>} />}
                </Card>
            )}

            {/* FAQ */}
            <Card title={<Space><QuestionCircleOutlined />常见问题 FAQ</Space>} style={{ borderRadius: 12, marginBottom: 20 }}>
                <Collapse ghost size="small" items={faqItems} />
            </Card>

            {/* 快速导入弹窗 */}
            <Modal title="快速导入 Cookie" open={showImportModal} onCancel={() => setShowImportModal(false)} footer={null} width={520}>
                <Alert title="方法一: 浏览器控制台" type="info" showIcon style={{ marginBottom: 12, borderRadius: 8 }} />
                <Text code copyable style={{ display: 'block', padding: 10, borderRadius: 8, background: token.colorFillSecondary, fontSize: 12, marginBottom: 16 }}>document.cookie</Text>
                <Alert title="方法二: Chrome 扩展" type="info" showIcon style={{ marginBottom: 12, borderRadius: 8 }}
                    description={<span>搜索安装 "EditThisCookie" 扩展 → 打开豆瓣 → 点击扩展图标 → 导出 → 复制全部 Cookie 字符串</span>} />
                <Alert title="方法三: 书签工具" type="info" showIcon style={{ borderRadius: 8 }}
                    description={<span>创建新书签，URL 设为：<Text code copyable style={{ fontSize: 11 }}>{'javascript:navigator.clipboard.writeText(document.cookie);alert("Cookie已复制")'}</Text> → 在豆瓣页面点击书签即可一键复制</span>} />
            </Modal>
        </div>
    );
};

export default CookieConfig;
