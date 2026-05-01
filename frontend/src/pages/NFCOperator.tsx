// frontend/src/pages/NFCOperator.tsx
/**
 * NFC 操作页面（外模式统一入口）- React 19 + Ant Design 6
 * 
 * 优化点：
 * - 完整的类型定义
 * - 自定义 Hook 封装数据加载
 * - QR 码生成与展示
 * - 网络状态检测
 * - 复制功能增强
 * - 响应式布局优化
 * - 键盘导航
 * - 主题色适配
 */

import React, {
    useState,
    useCallback,
    useMemo,
    useEffect,
    useRef,
    type FC,
} from 'react';
import {
    Card,
    Input,
    Button,
    Space,
    message,
    Alert,
    Descriptions,
    Select,
    Typography,
    Divider,
    Breadcrumb,
    Steps,
    Collapse,
    Tag,
    Spin,
    Badge,
    QRCode,
    Tooltip,
    theme,
    Row,
    Col,
    type CollapseProps,
    type DescriptionsProps,
} from 'antd';
import {
    ScanOutlined,
    CopyOutlined,
    HomeOutlined,
    InfoCircleOutlined,
    EnvironmentOutlined,
    MobileOutlined,
    WifiOutlined,
    TagOutlined,
    LinkOutlined,
    ExclamationCircleOutlined,
    ArrowRightOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    ReloadOutlined,
    QrcodeOutlined,
    ThunderboltOutlined,
    ApiOutlined,
    DesktopOutlined,
    BookOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { listShelves, extractErrorMessage } from '../services/api';

const { Title, Text, Paragraph } = Typography;

// ==================== 类型定义 ====================

/** 书架选项 */
interface ShelfOption {
    id: number;
    name: string;
}

/** 物理书架信息 */
interface PhysicalShelfInfo {
    location_name: string;
    location_code: string;
    nfc_tag_uid?: string;
    description?: string;
}

/** 映射信息 */
interface MappingInfo {
    mapping_type: string;
    is_active: boolean;
    version: number;
}

/** 书架 NFC 状态 */
interface ShelfNFCStatus {
    logical_shelf: {
        shelf_name: string;
        description?: string;
    };
    physical_shelf?: PhysicalShelfInfo;
    nfc_bound: boolean;
    mapping?: MappingInfo;
    recommended_payload: string;
}

// ==================== 常量 ====================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const BACKEND_PORT = 8000;

// ==================== 工具函数 ====================

/**
 * 获取本地 IP 地址
 */
function getLocalIP(): string {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return hostname;
    }
    return 'localhost';
}

/**
 * 复制文本到剪贴板（兼容非 HTTPS 环境）
 */
async function copyTextToClipboard(text: string): Promise<void> {
    // 优先使用 Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }

    // 降级方案
    return new Promise((resolve, reject) => {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '-9999px';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();

            const success = document.execCommand('copy');
            document.body.removeChild(textarea);

            if (success) {
                resolve();
            } else {
                reject(new Error('execCommand 复制失败'));
            }
        } catch (err) {
            reject(err);
        }
    });
}

// ==================== 自定义 Hook ====================

/**
 * 书架列表 Hook
 */
const useShelfOptions = () => {
    const [shelfOptions, setShelfOptions] = useState<ShelfOption[]>([]);
    const [loading, setLoading] = useState(false);

    const loadShelves = useCallback(async () => {
        setLoading(true);
        try {
            const data = await listShelves();
            const options = (Array.isArray(data) ? data : []).map((s: any) => ({
                id: s.logical_shelf_id,
                name: s.shelf_name,
            }));
            setShelfOptions(options);
            return options;
        } catch (err: unknown) {
            message.error({
                content: extractErrorMessage(err) || '加载书架列表失败',
                key: 'shelf-load-error',
            });
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadShelves();
    }, [loadShelves]);

    return { shelfOptions, shelvesLoading: loading, refreshShelves: loadShelves };
};

/**
 * NFC 状态加载 Hook
 */
const useNFCStatus = (selectedShelfId: number | undefined) => {
    const [shelfInfo, setShelfInfo] = useState<ShelfNFCStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadStatus = useCallback(async () => {
        if (!selectedShelfId) {
            message.warning({ content: '请先选择书架', key: 'shelf-required' });
            return;
        }

        setLoading(true);
        setError(null);
        setShelfInfo(null);

        try {
            const resp = await fetch(`${API_BASE_URL}/api/nfc/shelf-info/${selectedShelfId}`);
            if (!resp.ok) {
                const errData = await resp.json();
                throw new Error(errData.detail || '加载失败');
            }
            const result = await resp.json();
            setShelfInfo(result);
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : '加载失败';
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    }, [selectedShelfId]);

    useEffect(() => {
        if (selectedShelfId) {
            loadStatus();
        }
    }, [selectedShelfId, loadStatus]);

    return { shelfInfo, isLoading: loading, error, loadStatus };
};

/**
 * 网络地址 Hook
 */
const useNetworkAddress = () => {
    const [localIP, setLocalIP] = useState('localhost');

    useEffect(() => {
        const detectIP = async () => {
            try {
                const resp = await fetch(`${API_BASE_URL}/api/nfc/scan-link`);
                const data = await resp.json();
                if (data.local_ip) {
                    setLocalIP(data.local_ip);
                }
            } catch {
                setLocalIP(getLocalIP());
            }
        };
        detectIP();
    }, []);

    const mobileURL = useMemo(
        () =>
            localIP !== 'localhost'
                ? `http://${localIP}:${BACKEND_PORT}/api/nfc/mobile`
                : `${API_BASE_URL}/api/nfc/mobile`,
        [localIP]
    );

    const isLocalNetwork = localIP !== 'localhost';

    return { localIP, mobileURL, isLocalNetwork };
};

// ==================== 子组件 ====================

/** 地址卡片 */
const AddressCard: FC<{
    mobileURL: string;
    localIP: string;
    isLocalNetwork: boolean;
    onCopy: () => void;
    onOpen: () => void;
}> = React.memo(({ mobileURL, localIP, isLocalNetwork, onCopy, onOpen }) => (
    <Alert
        title={
            <Space size={8}>
                <WifiOutlined />
                <span>手机端访问地址</span>
                {isLocalNetwork && (
                    <Tag color="green" style={{ marginLeft: 4 }}>
                        {localIP}
                    </Tag>
                )}
            </Space>
        }
        description={
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                }}
            >
                <Text
                    code
                    copyable
                    style={{
                        flex: 1,
                        minWidth: 200,
                        fontSize: 13,
                        wordBreak: 'break-all',
                    }}
                >
                    {mobileURL}
                </Text>
                <Space size={6} wrap>
                    <Tooltip title="复制地址">
                        <Button
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={onCopy}
                        >
                            复制
                        </Button>
                    </Tooltip>
                    <Tooltip title="在手机浏览器打开">
                        <Button
                            size="small"
                            icon={<MobileOutlined />}
                            onClick={onOpen}
                        >
                            打开
                        </Button>
                    </Tooltip>
                </Space>
            </div>
        }
        type="info"
        showIcon
        style={{ marginBottom: 24, borderRadius: 10 }}
    />
));
AddressCard.displayName = 'AddressCard';

/** 状态标签 */
const StatusBadge: FC<{
    status: 'success' | 'warning' | 'error' | 'default';
    text: string;
    extra?: React.ReactNode;
}> = ({ status, text, extra }) => (
    <Space size={6}>
        <Badge status={status} />
        <Text type={status === 'success' ? undefined : 'secondary'}>{text}</Text>
        {extra}
    </Space>
);

// ==================== 主组件 ====================

const NFCOperator: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();

    // 书架列表
    const { shelfOptions, shelvesLoading, refreshShelves } = useShelfOptions();

    // 选中的书架
    const [selectedShelfId, setSelectedShelfId] = useState<number | undefined>();
    const [selectedShelfName, setSelectedShelfName] = useState<string>('');

    // NFC 状态
    const { shelfInfo, isLoading, error, loadStatus } =
        useNFCStatus(selectedShelfId);

    // 网络地址
    const { localIP, mobileURL, isLocalNetwork } = useNetworkAddress();

    // ==================== 初始化默认选中 ====================

    useEffect(() => {
        if (shelfOptions.length > 0 && !selectedShelfId) {
            setSelectedShelfId(shelfOptions[0].id);
            setSelectedShelfName(shelfOptions[0].name);
        }
    }, [shelfOptions, selectedShelfId]);

    // ==================== 事件处理 ====================

    const handleShelfChange = useCallback(
        (id: number) => {
            setSelectedShelfId(id);
            const shelf = shelfOptions.find((s) => s.id === id);
            if (shelf) setSelectedShelfName(shelf.name);
        },
        [shelfOptions]
    );

    const handleCopyMobileURL = useCallback(async () => {
        try {
            await copyTextToClipboard(mobileURL);
            message.success({ content: '地址已复制到剪贴板', key: 'copy-url' });
        } catch {
            message.error({ content: '复制失败，请手动复制', key: 'copy-url-error' });
        }
    }, [mobileURL]);

    const handleOpenMobile = useCallback(() => {
        window.open(mobileURL, '_blank');
    }, [mobileURL]);

    const handleCopyPayload = useCallback(async () => {
        if (shelfInfo?.recommended_payload) {
            try {
                await copyTextToClipboard(shelfInfo.recommended_payload);
                message.success({ content: '标签内容已复制', key: 'copy-payload' });
            } catch {
                message.error({ content: '复制失败', key: 'copy-payload-error' });
            }
        }
    }, [shelfInfo]);

    // ==================== 使用说明 ====================

    const guideItems: CollapseProps['items'] = [
        {
            key: 'guide',
            label: (
                <Space size={8}>
                    <InfoCircleOutlined style={{ color: '#3b82f6' }} />
                    <span style={{ fontWeight: 500 }}>NFC 操作指南</span>
                </Space>
            ),
            children: (
                <div>
                    <Steps
                        direction="vertical"
                        size="small"
                        current={-1}
                        items={[
                            {
                                title: '选择目标书架',
                                content:
                                    '从下拉列表中选择需要关联 NFC 标签的逻辑书架',
                                icon: <EnvironmentOutlined />,
                            },
                            {
                                title: '手机端写入标签',
                                content:
                                    '手机浏览器打开上方地址 → 使用 NFC TOOLS PRO → 写入数据',
                                icon: <MobileOutlined />,
                            },
                            {
                                title: '绑定物理书架',
                                content:
                                    '如标签尚未绑定物理书架，手机扫描后将自动跳转绑定页面',
                                icon: <LinkOutlined />,
                            },
                            {
                                title: '扫描验证',
                                content:
                                    '用手机扫描已写入的 NFC 标签，验证是否正确跳转到对应书架',
                                icon: <CheckCircleOutlined />,
                            },
                        ]}
                    />
                    <Alert
                        title="提示"
                        description="推荐使用 NFC TOOLS PRO 应用进行标签读写操作，支持 NDEF 格式数据写入"
                        type="info"
                        showIcon
                        style={{ marginTop: 16, borderRadius: 8 }}
                    />
                </div>
            ),
        },
    ];

    // ==================== 渲染 NFC 状态 ====================

    const renderNFCStatus = () => {
        if (!shelfInfo) return null;

        const descriptionItems: DescriptionsProps['items'] = [
            {
                key: 'logical_shelf',
                label: '逻辑书架',
                span: 2,
                children: (
                    <Space size={4}>
                        <BookOutlined />
                        <Text strong>{shelfInfo.logical_shelf.shelf_name}</Text>
                        {shelfInfo.logical_shelf.description && (
                            <Text type="secondary">
                                ({shelfInfo.logical_shelf.description})
                            </Text>
                        )}
                    </Space>
                ),
            },
        ];

        // 物理书架关联
        if (shelfInfo.physical_shelf) {
            descriptionItems.push(
                {
                    key: 'physical_shelf',
                    label: '关联物理书架',
                    span: 1,
                    children: (
                        <Space size={6}>
                            <EnvironmentOutlined style={{ color: '#22c55e' }} />
                            <Text strong>
                                {shelfInfo.physical_shelf.location_name}
                            </Text>
                            <Tag color="blue">
                                {shelfInfo.physical_shelf.location_code}
                            </Tag>
                        </Space>
                    ),
                },
                {
                    key: 'nfc_tag',
                    label: 'NFC 标签',
                    span: 1,
                    children: shelfInfo.nfc_bound ? (
                        <Space size={6}>
                            <Badge status="success" />
                            <Tag color="green" icon={<TagOutlined />}>
                                {shelfInfo.physical_shelf.nfc_tag_uid}
                            </Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                已绑定
                            </Text>
                        </Space>
                    ) : (
                        <Space size={6}>
                            <Badge status="warning" />
                            <Text type="secondary">未绑定</Text>
                            <Button
                                type="link"
                                size="small"
                                onClick={() =>
                                    navigate('/admin/physical-shelves')
                                }
                            >
                                去绑定 <ArrowRightOutlined />
                            </Button>
                        </Space>
                    ),
                }
            );

            // 映射信息
            if (shelfInfo.mapping) {
                descriptionItems.push({
                    key: 'mapping',
                    label: '映射信息',
                    span: 2,
                    children: (
                        <Space size={8}>
                            <Tag color="purple">
                                {shelfInfo.mapping.mapping_type}
                            </Tag>
                            <Badge
                                status={
                                    shelfInfo.mapping.is_active
                                        ? 'success'
                                        : 'default'
                                }
                                text={
                                    shelfInfo.mapping.is_active
                                        ? '激活'
                                        : '禁用'
                                }
                            />
                            <Text type="secondary">
                                v{shelfInfo.mapping.version}
                            </Text>
                        </Space>
                    ),
                });
            }
        } else {
            descriptionItems.push({
                key: 'no_physical',
                label: '物理书架',
                span: 2,
                children: (
                    <Space size={6}>
                        <CloseCircleOutlined style={{ color: '#f59e0b' }} />
                        <Text type="secondary">未关联物理书架</Text>
                        <Button
                            type="link"
                            size="small"
                            onClick={() =>
                                navigate('/admin/physical-shelves')
                            }
                        >
                            创建映射 <ArrowRightOutlined />
                        </Button>
                    </Space>
                ),
            });
        }

        // 推荐标签内容
        descriptionItems.push({
            key: 'payload',
            label: '推荐标签内容 (JSON)',
            span: 2,
            children: (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                    }}
                >
                    <Text
                        code
                        copyable
                        style={{
                            flex: 1,
                            fontSize: 13,
                            wordBreak: 'break-all',
                            whiteSpace: 'pre-wrap',
                            maxHeight: 80,
                            overflow: 'auto',
                            padding: '8px 12px',
                            borderRadius: 6,
                        }}
                    >
                        {shelfInfo.recommended_payload}
                    </Text>
                    <Tooltip title="复制标签内容">
                        <Button
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={handleCopyPayload}
                        />
                    </Tooltip>
                </div>
            ),
        });

        return (
            <Card
                style={{
                    borderRadius: 14,
                    border: `1px solid #d1fae5`,
                    borderLeft: `4px solid #22c55e`,
                    marginBottom: 24,
                    boxShadow: '0 2px 12px rgba(34,197,94,0.08)',
                }}
                title={
                    <Space size={8}>
                        <CheckCircleOutlined
                            style={{ color: '#22c55e', fontSize: 18 }}
                        />
                        <span>书架 NFC 状态</span>
                        <Tag color="success">已加载</Tag>
                    </Space>
                }
            >
                <Descriptions
                    column={{ xs: 1, sm: 2 }}
                    bordered
                    size="middle"
                    items={descriptionItems}
                    styles={{
                        label: {
                            fontWeight: 500,
                            background: token.colorFillSecondary,
                        },
                    }}
                />

                <Divider style={{ margin: '20px 0' }} />

                {/* QR 码 + 手机端入口 */}
                <Row gutter={[24, 16]} align="middle" justify="center">
                    <Col xs={24} sm={8} style={{ textAlign: 'center' }}>
                        <Text
                            type="secondary"
                            style={{
                                fontSize: 12,
                                display: 'block',
                                marginBottom: 10,
                            }}
                        >
                            <QrcodeOutlined /> 扫码访问手机端
                        </Text>
                        <QRCode
                            value={mobileURL}
                            size={160}
                            bgColor="#fff"
                            style={{
                                margin: '0 auto',
                                borderRadius: 10,
                                border: `1px solid ${token.colorBorderSecondary}`,
                                padding: 8,
                            }}
                        />
                        <Text
                            type="secondary"
                            style={{
                                fontSize: 10,
                                display: 'block',
                                marginTop: 6,
                                wordBreak: 'break-all',
                            }}
                        >
                            {mobileURL}
                        </Text>
                    </Col>
                    <Col xs={24} sm={16}>
                        <div style={{ textAlign: 'center' }}>
                            <MobileOutlined
                                style={{
                                    fontSize: 36,
                                    color: token.colorPrimary,
                                    marginBottom: 12,
                                }}
                            />
                            <Text
                                strong
                                style={{
                                    display: 'block',
                                    fontSize: 16,
                                    marginBottom: 6,
                                }}
                            >
                                手机端操作入口
                            </Text>
                            <Text
                                type="secondary"
                                style={{
                                    display: 'block',
                                    marginBottom: 16,
                                    fontSize: 13,
                                }}
                            >
                                使用手机浏览器打开地址，配合 NFC 应用完成标签操作
                            </Text>
                            <Space wrap size={10}>
                                <Button
                                    type="primary"
                                    size="large"
                                    icon={<MobileOutlined />}
                                    onClick={handleOpenMobile}
                                    style={{ borderRadius: 8 }}
                                >
                                    打开手机端页面
                                </Button>
                                <Button
                                    size="large"
                                    icon={<CopyOutlined />}
                                    onClick={handleCopyMobileURL}
                                    style={{ borderRadius: 8 }}
                                >
                                    复制地址
                                </Button>
                                {!shelfInfo.nfc_bound &&
                                    shelfInfo.physical_shelf && (
                                        <Button
                                            size="large"
                                            icon={<TagOutlined />}
                                            onClick={() =>
                                                navigate(
                                                    '/admin/physical-shelves'
                                                )
                                            }
                                            style={{ borderRadius: 8 }}
                                        >
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

    // ==================== 渲染页面 ====================

    return (
        <div style={{ maxWidth: 780, margin: '0 auto', padding: 24 }}>
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
                                <ScanOutlined /> NFC 操作
                            </span>
                        ),
                    },
                ]}
            />

            {/* 页头 */}
            <div style={{ marginBottom: 24 }}>
                <Title level={2} style={{ marginBottom: 4 }}>
                    <ScanOutlined
                        style={{ marginRight: 12, color: token.colorPrimary }}
                    />
                    NFC 操作中心
                </Title>
                <Text type="secondary">
                    查看书架 NFC 状态，引导手机端完成标签写入与绑定
                </Text>
            </div>

            {/* 手机端地址 */}
            <AddressCard
                mobileURL={mobileURL}
                localIP={localIP}
                isLocalNetwork={isLocalNetwork}
                onCopy={handleCopyMobileURL}
                onOpen={handleOpenMobile}
            />

            {/* 使用说明 */}
            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 14,
                    border: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Collapse ghost items={guideItems} />
            </Card>

            {/* 书架选择 */}
            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 14,
                    border: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                    <div>
                        <label
                            style={{
                                fontWeight: 500,
                                fontSize: 15,
                                display: 'block',
                                marginBottom: 10,
                            }}
                        >
                            <EnvironmentOutlined
                                style={{
                                    color: token.colorPrimary,
                                    marginRight: 6,
                                }}
                            />
                            选择书架查看状态
                        </label>
                        <Select
                            placeholder="选择书架..."
                            style={{ width: '100%' }}
                            size="large"
                            value={selectedShelfId}
                            onChange={handleShelfChange}
                            loading={shelvesLoading}
                            showSearch
                            filterOption={(input, option) =>
                                (option?.label as string)
                                    ?.toLowerCase()
                                    .includes(input.toLowerCase())
                            }
                            options={shelfOptions.map((shelf) => ({
                                value: shelf.id,
                                label: (
                                    <Space size={6}>
                                        <EnvironmentOutlined
                                            style={{ color: token.colorPrimary }}
                                        />
                                        {shelf.name}
                                    </Space>
                                ),
                            }))}
                        />
                    </div>
                    <Button
                        icon={<ReloadOutlined />}
                        loading={isLoading}
                        onClick={loadStatus}
                        size="large"
                        style={{ borderRadius: 8 }}
                    >
                        刷新状态
                    </Button>
                </Space>
            </Card>

            {/* 错误状态 */}
            {error && (
                <Alert
                    title="加载失败"
                    description={error}
                    type="error"
                    showIcon
                    closable
                    style={{ marginBottom: 24, borderRadius: 10 }}
                    action={
                        <Button size="small" onClick={loadStatus}>
                            重试
                        </Button>
                    }
                />
            )}

            {/* 加载状态 */}
            {isLoading && (
                <Card
                    style={{
                        borderRadius: 14,
                        textAlign: 'center',
                        padding: 48,
                        marginBottom: 24,
                        border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                >
                    <Spin size="large">
                        <div style={{ padding: 20 }} />
                    </Spin>
                    <Text
                        type="secondary"
                        style={{ display: 'block', marginTop: 20, fontSize: 14 }}
                    >
                        正在加载书架 NFC 状态...
                    </Text>
                </Card>
            )}

            {/* NFC 状态 */}
            {shelfInfo && renderNFCStatus()}
        </div>
    );
};

export default NFCOperator;