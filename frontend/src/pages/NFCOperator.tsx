// frontend/src/pages/NFCOperator.tsx
/**
 * NFC 操作页面（外模式统一入口）— 增强版
 *
 * 新增功能：
 * - 操作历史记录（自动保存 + 按类型/时间筛选）
 * - 写入安全确认（二次确认密码）
 * - 新手3步引导（首次进入弹窗）
 * - 帮助提示图标（? 悬停显示说明）
 * - 响应式优化（移动端/桌面端自适应）
 * - 常见故障排查入口
 */

import React, {
    useState, useCallback, useMemo, useEffect, useRef, type FC,
} from 'react';
import {
    Card, Button, Space, message, Alert, Descriptions, Select, Typography,
    Divider, Breadcrumb, Steps, Collapse, Tag, Spin, Badge, QRCode,
    Tooltip, theme, Row, Col, Modal, Input, Timeline, Segmented,
    Popover, Empty, type CollapseProps, type DescriptionsProps,
} from 'antd';
import {
    ScanOutlined, CopyOutlined, HomeOutlined, InfoCircleOutlined,
    EnvironmentOutlined, MobileOutlined, WifiOutlined, TagOutlined,
    LinkOutlined, ArrowRightOutlined, CheckCircleOutlined,
    CloseCircleOutlined, ReloadOutlined, QrcodeOutlined, BookOutlined,
    HistoryOutlined, SafetyOutlined, QuestionCircleOutlined,
    BugOutlined, BulbOutlined, LockOutlined, UnlockOutlined,
    DeleteOutlined, FilterOutlined, ToolOutlined, OrderedListOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { listShelves, extractErrorMessage } from '../services/api';
import { useAsyncData } from '../hooks/useAsyncData';

const { Title, Text, Paragraph } = Typography;

// ==================== 类型定义 ====================

interface ShelfOption {
    logical_shelf_id: number;
    shelf_name: string;
}

interface PhysicalShelfInfo {
    location_name: string;
    location_code: string;
    nfc_tag_uid?: string;
    description?: string;
}

interface MappingInfo {
    mapping_type: string;
    is_active: boolean;
    version: number;
}

interface ShelfNFCStatus {
    logical_shelf: { shelf_name: string; description?: string };
    physical_shelf?: PhysicalShelfInfo;
    nfc_bound: boolean;
    mapping?: MappingInfo;
    recommended_payload: string;
}

/** 操作历史记录条目 */
interface HistoryEntry {
    id: string;
    timestamp: number;
    type: 'shelf_select' | 'status_load' | 'payload_copy' | 'mobile_open' | 'url_copy';
    label: string;
    detail?: string;
    shelfName?: string;
}

// ==================== 常量 ====================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const BACKEND_PORT = 8000;
const HISTORY_MAX = 50;
const PIN_KEY = 'nfc_pin_verified';
const TOUR_KEY = 'nfc_tour_seen';

// ==================== 工具函数 ====================

function getLocalIP(): string {
    const h = window.location.hostname;
    return (h !== 'localhost' && h !== '127.0.0.1') ? h : 'localhost';
}

async function copyTextToClipboard(text: string): Promise<void> {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed'; ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            ok ? resolve() : reject(new Error('复制失败'));
        } catch (e) { reject(e); }
    });
}

// ==================== Hook: 操作历史 ====================

const useOperationHistory = () => {
    const [history, setHistory] = useState<HistoryEntry[]>(() => {
        try {
            const saved = localStorage.getItem('nfc_history');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [filterType, setFilterType] = useState<string>('all');

    const addEntry = useCallback((entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
        const newEntry: HistoryEntry = {
            ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: Date.now(),
        };
        setHistory((prev) => {
            const next = [newEntry, ...prev].slice(0, HISTORY_MAX);
            localStorage.setItem('nfc_history', JSON.stringify(next));
            return next;
        });
    }, []);

    const clearHistory = useCallback(() => {
        setHistory([]);
        localStorage.removeItem('nfc_history');
        message.success('操作历史已清除');
    }, []);

    const filtered = useMemo(() => {
        if (filterType === 'all') return history;
        return history.filter((h) => h.type === filterType);
    }, [history, filterType]);

    const undoLast = useCallback(() => {
        setHistory((prev) => {
            const next = prev.slice(1);
            localStorage.setItem('nfc_history', JSON.stringify(next));
            return next;
        });
        message.success('已撤销最近操作记录');
    }, []);

    return { history: filtered, total: history.length, filterType, setFilterType, addEntry, clearHistory, undoLast };
};

// ==================== Hook: NFC 状态 ====================

const useNFCStatus = (selectedShelfId: number | undefined) => {
    const [shelfInfo, setShelfInfo] = useState<ShelfNFCStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadStatus = useCallback(async () => {
        if (!selectedShelfId) { message.warning({ content: '请先选择书架', key: 'shelf-required' }); return; }
        setLoading(true); setError(null); setShelfInfo(null);
        try {
            const resp = await fetch(`${API_BASE_URL}/api/nfc/shelf-info/${selectedShelfId}`);
            if (!resp.ok) { const ed = await resp.json(); throw new Error(ed.detail || '加载失败'); }
            setShelfInfo(await resp.json());
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '加载失败');
        } finally { setLoading(false); }
    }, [selectedShelfId]);

    useEffect(() => { if (selectedShelfId) loadStatus(); }, [selectedShelfId, loadStatus]);
    return { shelfInfo, isLoading: loading, error, loadStatus };
};

// ==================== Hook: 网络地址 ====================

const useNetworkAddress = () => {
    const [localIP, setLocalIP] = useState('localhost');
    useEffect(() => {
        (async () => {
            try {
                const resp = await fetch(`${API_BASE_URL}/api/nfc/scan-link`);
                const data = await resp.json();
                if (data.local_ip) setLocalIP(data.local_ip);
            } catch { setLocalIP(getLocalIP()); }
        })();
    }, []);
    const mobileURL = useMemo(
        () => localIP !== 'localhost' ? `http://${localIP}:${BACKEND_PORT}/api/nfc/mobile` : `${API_BASE_URL}/api/nfc/mobile`,
        [localIP],
    );
    return { localIP, mobileURL, isLocalNetwork: localIP !== 'localhost' };
};

// ==================== 子组件 ====================

const HistoryTimeline: FC<{
    history: HistoryEntry[];
    onClear: () => void;
    onUndo: () => void;
    filterType: string;
    onFilterChange: (v: string) => void;
}> = React.memo(({ history, onClear, onUndo, filterType, onFilterChange }) => {
    if (history.length === 0) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无操作记录" />;
    }
    const typeIcons: Record<string, React.ReactNode> = {
        shelf_select: <EnvironmentOutlined />,
        status_load: <ReloadOutlined />,
        payload_copy: <CopyOutlined />,
        mobile_open: <MobileOutlined />,
        url_copy: <LinkOutlined />,
    };
    const typeColors: Record<string, string> = {
        shelf_select: '#3b82f6', status_load: '#22c55e', payload_copy: '#f59e0b',
        mobile_open: '#8b5cf6', url_copy: '#06b6d4',
    };
    return (
        <div>
            <Space style={{ marginBottom: 12 }} wrap>
                <Segmented
                    size="small"
                    value={filterType}
                    onChange={(v) => onFilterChange(v as string)}
                    options={[
                        { value: 'all', label: '全部' },
                        { value: 'shelf_select', label: '选择' },
                        { value: 'status_load', label: '加载' },
                        { value: 'payload_copy', label: '复制' },
                    ]}
                />
                <Button size="small" onClick={onUndo} disabled={history.length === 0}>撤销</Button>
                <Button size="small" danger onClick={onClear} disabled={history.length === 0}>清除</Button>
            </Space>
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
                <Timeline
                    items={history.slice(0, 20).map((h) => ({
                        color: typeColors[h.type] || '#999',
                        dot: typeIcons[h.type],
                        children: (
                            <div>
                                <Text style={{ fontSize: 13 }}>{h.label}</Text>
                                {h.detail && <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{h.detail}</Text>}
                                <Text type="secondary" style={{ fontSize: 10 }}>
                                    {new Date(h.timestamp).toLocaleTimeString()}
                                </Text>
                            </div>
                        ),
                    }))}
                />
            </div>
        </div>
    );
});
HistoryTimeline.displayName = 'HistoryTimeline';

/** 帮助提示图标 */
const HelpIcon: FC<{ tip: string }> = ({ tip }) => (
    <Tooltip title={tip}>
        <QuestionCircleOutlined style={{ color: '#94a3b8', cursor: 'help', marginLeft: 4, fontSize: 13 }} />
    </Tooltip>
);

/** 安全确认弹窗 */
const SecurityConfirmModal: FC<{
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
    description: string;
}> = ({ open, onConfirm, onCancel, title, description }) => {
    const [pin, setPin] = useState('');
    const [pinError, setPinError] = useState(false);

    const handleOk = () => {
        if (pin === '123456') { // 默认 PIN，生产环境应改为用户自定义
            setPin(''); setPinError(false);
            localStorage.setItem(PIN_KEY, 'true');
            onConfirm();
        } else {
            setPinError(true);
        }
    };

    const handleCancel = () => { setPin(''); setPinError(false); onCancel(); };

    return (
        <Modal title={<Space><SafetyOutlined style={{ color: '#f59e0b' }} />{title}</Space>}
            open={open} onOk={handleOk} onCancel={handleCancel}
            okText="确认" cancelText="取消" centered
        >
            <Alert message={description} type="warning" showIcon style={{ marginBottom: 16, borderRadius: 8 }} />
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>请输入安全 PIN 码确认操作：</Text>
            <Input.Password
                placeholder="输入 PIN 码（默认 123456）"
                value={pin}
                onChange={(e) => { setPin(e.target.value); setPinError(false); }}
                status={pinError ? 'error' : undefined}
                maxLength={6}
                autoFocus
            />
            {pinError && <Text type="danger" style={{ fontSize: 12 }}>PIN 码错误，请重试</Text>}
        </Modal>
    );
};

// ==================== 主组件 ====================

const NFCOperator: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();

    // 书架数据
    const { data: shelvesRaw, loading: shelvesLoading } = useAsyncData(() => listShelves(), []);
    const shelves: ShelfOption[] = shelvesRaw ?? [];

    // 选中书架
    const [selectedShelfId, setSelectedShelfId] = useState<number | undefined>();
    const [selectedShelfName, setSelectedShelfName] = useState('');

    // NFC 状态
    const { shelfInfo, isLoading, error, loadStatus } = useNFCStatus(selectedShelfId);

    // 网络地址
    const { localIP, mobileURL, isLocalNetwork } = useNetworkAddress();

    // 操作历史
    const { history, total: historyTotal, filterType, setFilterType, addEntry, clearHistory, undoLast } = useOperationHistory();

    // 新手引导
    const [tourOpen, setTourOpen] = useState(false);
    const [tourStep, setTourStep] = useState(0);

    // 安全确认
    const [securityOpen, setSecurityOpen] = useState(false);
    const [securityAction, setSecurityAction] = useState<(() => void) | null>(null);

    // 故障排查面板
    const [troubleshootOpen, setTroubleshootOpen] = useState(false);

    // ── 首次进入引导 ──
    useEffect(() => {
        const seen = localStorage.getItem(TOUR_KEY);
        if (!seen) setTourOpen(true);
    }, []);

    const finishTour = () => {
        setTourOpen(false);
        localStorage.setItem(TOUR_KEY, 'true');
        message.success('引导完成！可以鼠标悬停 ? 图标查看帮助');
    };

    // ── 初始化默认选中 ──
    useEffect(() => {
        if (shelves.length > 0 && !selectedShelfId) {
            setSelectedShelfId(shelves[0].logical_shelf_id);
            setSelectedShelfName(shelves[0].shelf_name);
        }
    }, [shelves, selectedShelfId]);

    // ── 写入安全控制 ──
    const requireSecurity = useCallback((action: () => void) => {
        const verified = localStorage.getItem(PIN_KEY);
        if (verified === 'true') { action(); return; }
        setSecurityAction(() => action);
        setSecurityOpen(true);
    }, []);

    // ── 事件处理 ──
    const handleShelfChange = useCallback((id: number) => {
        setSelectedShelfId(id);
        const shelf = shelves.find((s) => s.logical_shelf_id === id);
        if (shelf) {
            setSelectedShelfName(shelf.shelf_name);
            addEntry({ type: 'shelf_select', label: `选择了书架「${shelf.shelf_name}」`, shelfName: shelf.shelf_name });
        }
    }, [shelves, addEntry]);

    const handleLoadStatus = useCallback(() => {
        requireSecurity(() => {
            loadStatus();
            addEntry({ type: 'status_load', label: '加载 NFC 状态', shelfName: selectedShelfName || undefined });
        });
    }, [requireSecurity, loadStatus, addEntry, selectedShelfName]);

    const handleCopyMobileURL = useCallback(async () => {
        try {
            await copyTextToClipboard(mobileURL);
            message.success({ content: '地址已复制', key: 'copy-url' });
            addEntry({ type: 'url_copy', label: '复制了手机端地址' });
        } catch {
            message.error({ content: '复制失败，请手动复制', key: 'copy-url-error' });
        }
    }, [mobileURL, addEntry]);

    const handleOpenMobile = useCallback(() => {
        window.open(mobileURL, '_blank');
        addEntry({ type: 'mobile_open', label: '打开了手机端页面' });
    }, [mobileURL, addEntry]);

    const handleCopyPayload = useCallback(async () => {
        if (shelfInfo?.recommended_payload) {
            try {
                await copyTextToClipboard(shelfInfo.recommended_payload);
                message.success({ content: '标签内容已复制', key: 'copy-payload' });
                addEntry({
                    type: 'payload_copy',
                    label: '复制了NFC标签内容',
                    detail: shelfInfo.recommended_payload.slice(0, 60) + '...',
                    shelfName: selectedShelfName || undefined,
                });
            } catch {
                message.error({ content: '复制失败', key: 'copy-payload-error' });
            }
        }
    }, [shelfInfo, addEntry, selectedShelfName]);

    // ── 帮助提示文案 ──
    const helpTips = useMemo(() => ({
        shelfSelect: '选择需要写入NFC标签的逻辑书架。书架必须已关联物理书架才能正常写入。',
        payload: '此JSON数据为NFC标签推荐写入内容。复制后粘贴到NFC TOOLS PRO的NDEF记录中即可写入。',
        mobileURL: '手机端通过此地址访问NFC操作页面，支持扫码或浏览器直接打开。需确保手机与电脑在同一网络。',
        qrcode: '使用手机扫码快速打开移动端页面。二维码内容即为移动端URL。',
        security: '写入NFC标签是敏感操作。首次执行需要输入PIN码确认，后续会话中无需重复输入。',
        history: '记录最近的NFC相关操作（选择书架、加载状态、复制内容等），方便回溯操作轨迹。',
    }), []);

    // ── 引导步骤 ──
    const tourSteps = [
        {
            title: '选择书架',
            description: '从下拉列表中选择需要关联NFC标签的书架，系统会自动加载该书架的状态信息。',
            icon: <EnvironmentOutlined style={{ color: '#3b82f6' }} />,
        },
        {
            title: '获取标签内容',
            description: '点击"刷新状态"加载推荐标签数据，复制JSON内容后在手机NFC应用中写入标签。',
            icon: <QrcodeOutlined style={{ color: '#22c55e' }} />,
        },
        {
            title: '手机端操作',
            description: '用手机扫码或打开地址访问移动端页面，配合NFC TOOLS PRO完成标签读写与绑定。',
            icon: <MobileOutlined style={{ color: '#8b5cf6' }} />,
        },
    ];

    // ── 渲染 NFC 状态 ──
    const renderNFCStatus = () => {
        if (!shelfInfo) return null;

        const descriptionItems: DescriptionsProps['items'] = [
            {
                key: 'logical_shelf', label: '逻辑书架', span: { xs: 2, sm: 2 },
                children: (
                    <Space size={4}>
                        <BookOutlined /><Text strong>{shelfInfo.logical_shelf.shelf_name}</Text>
                        {shelfInfo.logical_shelf.description && <Text type="secondary">({shelfInfo.logical_shelf.description})</Text>}
                    </Space>
                ),
            },
        ];

        if (shelfInfo.physical_shelf) {
            descriptionItems.push(
                {
                    key: 'physical_shelf', label: '关联物理书架', span: { xs: 2, sm: 1 },
                    children: (
                        <Space size={6}>
                            <EnvironmentOutlined style={{ color: '#22c55e' }} />
                            <Text strong>{shelfInfo.physical_shelf.location_name}</Text>
                            <Tag color="blue">{shelfInfo.physical_shelf.location_code}</Tag>
                        </Space>
                    ),
                },
                {
                    key: 'nfc_tag', label: 'NFC 标签', span: { xs: 2, sm: 1 },
                    children: shelfInfo.nfc_bound ? (
                        <Space size={6}>
                            <Badge status="success" />
                            <Tag color="green" icon={<TagOutlined />}>{shelfInfo.physical_shelf?.nfc_tag_uid}</Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>已绑定</Text>
                        </Space>
                    ) : (
                        <Space size={6}>
                            <Badge status="warning" /><Text type="secondary">未绑定</Text>
                            <Button type="link" size="small" onClick={() => navigate('/admin/physical-shelves')}>
                                去绑定 <ArrowRightOutlined />
                            </Button>
                        </Space>
                    ),
                },
            );
            if (shelfInfo.mapping) {
                descriptionItems.push({
                    key: 'mapping', label: '映射信息', span: 2,
                    children: (
                        <Space size={8}>
                            <Tag color="purple">{shelfInfo.mapping.mapping_type}</Tag>
                            <Badge status={shelfInfo.mapping.is_active ? 'success' : 'default'}
                                text={shelfInfo.mapping.is_active ? '激活' : '禁用'} />
                            <Text type="secondary">v{shelfInfo.mapping.version}</Text>
                        </Space>
                    ),
                });
            }
        } else {
            descriptionItems.push({
                key: 'no_physical', label: '物理书架', span: 2,
                children: (
                    <Space size={6}>
                        <CloseCircleOutlined style={{ color: '#f59e0b' }} />
                        <Text type="secondary">未关联物理书架</Text>
                        <Button type="link" size="small" onClick={() => navigate('/admin/physical-shelves')}>
                            创建映射 <ArrowRightOutlined />
                        </Button>
                    </Space>
                ),
            });
        }

        // 推荐标签内容
        descriptionItems.push({
            key: 'payload', label: (
                <span>推荐标签内容 (JSON) <HelpIcon tip={helpTips.payload} /></span>
            ), span: 2,
            children: (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Text code copyable style={{
                        flex: 1, fontSize: 12, wordBreak: 'break-all', whiteSpace: 'pre-wrap',
                        maxHeight: 72, overflow: 'auto', padding: '8px 12px', borderRadius: 6,
                    }}>
                        {shelfInfo.recommended_payload}
                    </Text>
                    <Tooltip title="复制标签内容">
                        <Button size="small" icon={<CopyOutlined />} onClick={handleCopyPayload} />
                    </Tooltip>
                </div>
            ),
        });

        return (
            <Card
                style={{
                    borderRadius: 14, border: '1px solid #d1fae5', borderLeft: '4px solid #22c55e',
                    marginBottom: 24, boxShadow: '0 2px 12px rgba(34,197,94,0.08)',
                }}
                title={
                    <Space size={8}>
                        <CheckCircleOutlined style={{ color: '#22c55e', fontSize: 18 }} />
                        <span>书架 NFC 状态</span>
                        <Tag color="success">已加载</Tag>
                    </Space>
                }
            >
                <Descriptions
                    column={{ xs: 1, sm: 2 }} bordered size="middle"
                    items={descriptionItems}
                    styles={{ label: { fontWeight: 500, background: token.colorFillSecondary } }}
                />
                <Divider style={{ margin: '20px 0' }} />

                {/* QR 码 + 手机端入口 */}
                <Row gutter={[24, 16]} align="middle" justify="center">
                    <Col xs={24} sm={8} style={{ textAlign: 'center' }}>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
                            <QrcodeOutlined /> 扫码访问手机端
                        </Text>
                        <QRCode value={mobileURL} size={160} bgColor="#fff"
                            style={{ margin: '0 auto', borderRadius: 10,
                                border: `1px solid ${token.colorBorderSecondary}`, padding: 8 }}
                        />
                        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 6, wordBreak: 'break-all' }}>
                            {mobileURL}
                        </Text>
                    </Col>
                    <Col xs={24} sm={16}>
                        <div style={{ textAlign: 'center' }}>
                            <MobileOutlined style={{ fontSize: 36, color: token.colorPrimary, marginBottom: 12 }} />
                            <Text strong style={{ display: 'block', fontSize: 16, marginBottom: 6 }}>手机端操作入口</Text>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
                                使用手机浏览器打开地址，配合 NFC 应用完成标签操作
                            </Text>
                            <Space wrap size={10}>
                                <Button type="primary" size="large" icon={<MobileOutlined />}
                                    onClick={handleOpenMobile} style={{ borderRadius: 8 }}>
                                    打开手机端页面
                                </Button>
                                <Button size="large" icon={<CopyOutlined />}
                                    onClick={handleCopyMobileURL} style={{ borderRadius: 8 }}>
                                    复制地址
                                </Button>
                                {!shelfInfo.nfc_bound && shelfInfo.physical_shelf && (
                                    <Button size="large" icon={<TagOutlined />}
                                        onClick={() => navigate('/admin/physical-shelves')}
                                        style={{ borderRadius: 8 }}>
                                        绑定 NFC 标签
                                    </Button>
                                )}
                            </Space>
                        </div>
                    </Col>
                </Row>
            </Card>
        );
    };

    // 故障排查内容
    const troubleshootItems = [
        { issue: '手机无法访问页面', solution: '确保手机和电脑连接同一WiFi网络；检查防火墙是否阻止端口8000；尝试关闭手机移动数据', icon: <WifiOutlined /> },
        { issue: 'NFC标签无法读取', solution: '确认手机支持NFC功能且已开启；检查NFC标签是否损坏；尝试重新贴靠手机NFC感应区', icon: <ScanOutlined /> },
        { issue: '标签内容写入失败', solution: '使用NFC TOOLS PRO → 写入 → NDEF记录 → 粘贴JSON数据；确保标签为NDEF可写格式', icon: <TagOutlined /> },
        { issue: '书架状态加载失败', solution: '确认后端服务正常运行(检查 http://localhost:8000/docs)；刷新页面重试；查看浏览器控制台错误信息', icon: <ReloadOutlined /> },
    ];

    // ── 渲染页面 ──
    return (
        <div style={{ maxWidth: 860, margin: '0 auto', padding: 'clamp(12px, 3vw, 24px)' }}>
            {/* 面包屑 */}
            <Breadcrumb style={{ marginBottom: 16 }}
                items={[
                    { title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> },
                    { title: <span><ScanOutlined /> NFC 操作</span> },
                ]}
            />

            {/* 页头 */}
            <div style={{ marginBottom: 24 }}>
                <Title level={2} style={{ marginBottom: 4 }}>
                    <ScanOutlined style={{ marginRight: 12, color: token.colorPrimary }} />
                    NFC 操作中心
                    <Tooltip title="重新查看引导">
                        <Button type="link" size="small" icon={<BulbOutlined />}
                            onClick={() => { setTourStep(0); setTourOpen(true); }}
                            style={{ marginLeft: 8 }}>
                            引导
                        </Button>
                    </Tooltip>
                </Title>
                <Text type="secondary">查看书架 NFC 状态，引导手机端完成标签写入与绑定</Text>
            </div>

            {/* 手机端地址 */}
            <Alert
                title={
                    <Space size={8}>
                        <WifiOutlined /><span>手机端访问地址</span>
                        {isLocalNetwork && <Tag color="green">{localIP}</Tag>}
                        <HelpIcon tip={helpTips.mobileURL} />
                    </Space>
                }
                description={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <Text code copyable style={{ flex: 1, minWidth: 200, fontSize: 13, wordBreak: 'break-all' }}>
                            {mobileURL}
                        </Text>
                        <Space size={6} wrap>
                            <Button size="small" icon={<CopyOutlined />} onClick={handleCopyMobileURL}>复制</Button>
                            <Button size="small" icon={<MobileOutlined />} onClick={handleOpenMobile}>打开</Button>
                        </Space>
                    </div>
                }
                type="info" showIcon style={{ marginBottom: 24, borderRadius: 10 }}
            />

            {/* 操作指南（可折叠） */}
            <Card style={{ marginBottom: 24, borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}` }}>
                <Collapse
                    ghost
                    items={[{
                        key: 'guide', label: (
                            <Space size={8}>
                                <InfoCircleOutlined style={{ color: '#3b82f6' }} />
                                <span style={{ fontWeight: 500 }}>NFC 操作指南</span>
                            </Space>
                        ),
                        children: (
                            <div>
                                <Steps direction="vertical" size="small" current={-1}
                                    items={[
                                        { title: '选择目标书架', description: '从下拉列表中选择需要关联 NFC 标签的逻辑书架', icon: <EnvironmentOutlined /> },
                                        { title: '手机端写入标签', description: '手机浏览器打开上方地址 → 使用 NFC TOOLS PRO → 写入数据', icon: <MobileOutlined /> },
                                        { title: '绑定物理书架', description: '如标签尚未绑定物理书架，手机扫描后将自动跳转绑定页面', icon: <LinkOutlined /> },
                                        { title: '扫描验证', description: '用手机扫描已写入的 NFC 标签，验证是否正确跳转到对应书架', icon: <CheckCircleOutlined /> },
                                    ]}
                                />
                                <Alert message="推荐使用 NFC TOOLS PRO 应用进行标签读写操作，支持 NDEF 格式数据写入"
                                    type="info" showIcon style={{ marginTop: 16, borderRadius: 8 }} />
                            </div>
                        ),
                    }]}
                />
            </Card>

            {/* 书架选择 + 操作历史（两栏布局） */}
            <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
                {/* 书架选择 */}
                <Col xs={24} lg={14}>
                    <Card style={{
                        borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`,
                        height: '100%',
                    }}>
                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                            <div>
                                <label style={{ fontWeight: 500, fontSize: 15, display: 'block', marginBottom: 10 }}>
                                    <EnvironmentOutlined style={{ color: token.colorPrimary, marginRight: 6 }} />
                                    选择书架查看状态
                                    <HelpIcon tip={helpTips.shelfSelect} />
                                </label>
                                <Select
                                    placeholder="选择书架..." style={{ width: '100%' }} size="large"
                                    value={selectedShelfId} onChange={handleShelfChange}
                                    loading={shelvesLoading} showSearch
                                    filterOption={(input, option) =>
                                        (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                                    }
                                    options={shelves.map((shelf) => ({
                                        value: shelf.logical_shelf_id,
                                        label: (
                                            <Space size={6}>
                                                <EnvironmentOutlined style={{ color: token.colorPrimary }} />
                                                {shelf.shelf_name}
                                            </Space>
                                        ),
                                    }))}
                                />
                            </div>
                            <Space wrap>
                                <Button icon={<ReloadOutlined />} loading={isLoading}
                                    onClick={handleLoadStatus} size="large" style={{ borderRadius: 8 }}>
                                    刷新状态
                                </Button>
                                <Popover
                                    content={
                                        <div style={{ maxWidth: 320 }}>
                                            {troubleshootItems.map((item, idx) => (
                                                <div key={idx} style={{ marginBottom: idx < troubleshootItems.length - 1 ? 12 : 0 }}>
                                                    <Space align="start" size={8}>
                                                        {item.icon}
                                                        <div>
                                                            <Text strong style={{ fontSize: 13 }}>{item.issue}</Text>
                                                            <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>{item.solution}</Text>
                                                        </div>
                                                    </Space>
                                                </div>
                                            ))}
                                        </div>
                                    }
                                    title={<Space><BugOutlined />常见故障排查</Space>}
                                    trigger="click"
                                    placement="bottomRight"
                                >
                                    <Button icon={<ToolOutlined />} size="large" style={{ borderRadius: 8 }}>
                                        故障排查
                                    </Button>
                                </Popover>
                            </Space>
                        </Space>
                    </Card>
                </Col>

                {/* 操作历史 */}
                <Col xs={24} lg={10}>
                    <Card
                        title={
                            <Space size={6}>
                                <HistoryOutlined style={{ color: token.colorPrimary }} />
                                <span>操作历史 ({historyTotal})</span>
                                <HelpIcon tip={helpTips.history} />
                            </Space>
                        }
                        style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}` }}
                    >
                        <HistoryTimeline
                            history={history}
                            onClear={clearHistory}
                            onUndo={undoLast}
                            filterType={filterType}
                            onFilterChange={setFilterType}
                        />
                    </Card>
                </Col>
            </Row>

            {/* 错误 */}
            {error && (
                <Alert title="加载失败" description={error} type="error" showIcon closable
                    style={{ marginBottom: 24, borderRadius: 10 }}
                    action={<Button size="small" onClick={loadStatus}>重试</Button>}
                />
            )}

            {/* 加载 */}
            {isLoading && (
                <Card style={{ borderRadius: 14, textAlign: 'center', padding: 48, marginBottom: 24, border: `1px solid ${token.colorBorderSecondary}` }}>
                    <Spin size="large"><div style={{ padding: 20 }} /></Spin>
                    <Text type="secondary" style={{ display: 'block', marginTop: 20, fontSize: 14 }}>
                        正在加载书架 NFC 状态...
                    </Text>
                </Card>
            )}

            {/* NFC 状态 */}
            {shelfInfo && renderNFCStatus()}

            {/* 新手引导弹窗 */}
            <Modal
                title={<Space><BulbOutlined style={{ color: '#f59e0b' }} />NFC 操作快速引导 ({tourStep + 1}/3)</Space>}
                open={tourOpen}
                onOk={tourStep < 2 ? () => setTourStep((s) => s + 1) : finishTour}
                onCancel={finishTour}
                okText={tourStep < 2 ? '下一步' : '开始使用'}
                cancelText="跳过引导"
                centered
                width={480}
            >
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>
                        {tourSteps[tourStep].icon}
                    </div>
                    <Title level={4} style={{ marginBottom: 8 }}>{tourSteps[tourStep].title}</Title>
                    <Paragraph type="secondary" style={{ fontSize: 14, maxWidth: 360, margin: '0 auto' }}>
                        {tourSteps[tourStep].description}
                    </Paragraph>
                    <div style={{ marginTop: 24 }}>
                        <Steps
                            size="small" current={tourStep}
                            items={tourSteps.map((s) => ({ title: '' }))}
                        />
                    </div>
                </div>
            </Modal>

            {/* 安全确认弹窗 */}
            <SecurityConfirmModal
                open={securityOpen}
                onConfirm={() => { securityOpen && setSecurityOpen(false); securityAction?.(); setSecurityAction(null); }}
                onCancel={() => { setSecurityOpen(false); setSecurityAction(null); }}
                title="写入操作确认"
                description="即将执行 NFC 标签写入/绑定操作。此操作将更新物理书架与 NFC 标签的关联关系。"
            />
        </div>
    );
};

export default NFCOperator;
