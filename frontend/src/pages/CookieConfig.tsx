// frontend/src/pages/CookieConfig.tsx
/**
 * 豆瓣 Cookie 配置页面 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 完整的类型定义
 * - 自定义 Hook 封装数据加载
 * - Cookie 有效性倒计时提醒
 * - 安全脱敏展示增强
 * - 一键复制完整 Cookie
 * - 测试结果动画
 * - 浏览器 Cookie 快速导入
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
    Input,
    Button,
    Space,
    Typography,
    message,
    Alert,
    Spin,
    Tag,
    Steps,
    Statistic,
    Row,
    Col,
    Image,
    Rate,
    Popconfirm,
    Tooltip,
    Collapse,
    Breadcrumb,
    theme,
    Divider,
    Modal,
    Descriptions,
    Timeline,
    Progress,
    Skeleton,
    type CollapseProps,
} from 'antd';
import {
    KeyOutlined,
    CheckCircleOutlined,
    ExclamationCircleOutlined,
    DeleteOutlined,
    SaveOutlined,
    ExperimentOutlined,
    EyeOutlined,
    EyeInvisibleOutlined,
    CopyOutlined,
    QuestionCircleOutlined,
    LinkOutlined,
    BookOutlined,
    UserOutlined,
    SafetyOutlined,
    ThunderboltOutlined,
    InfoCircleOutlined,
    HomeOutlined,
    ClockCircleOutlined,
    SettingOutlined,
    ClearOutlined,
    ReloadOutlined,
    WarningOutlined,
    ImportOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    getCookieConfig,
    saveCookieConfig,
    testCookieConfig,
    deleteCookieConfig,
    extractErrorMessage,
} from '../services/api';
import { getCoverUrl } from '../utils/image';
import { formatDate } from '../utils/format';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ==================== 类型定义 ====================

/** Cookie 配置信息 */
interface CookieInfo {
    has_cookie: boolean;
    cookie_preview: string;
    user_agent: string;
    updated_at?: string;
}

/** 测试结果 */
interface TestResult {
    success: boolean;
    message: string;
    cookie_valid: boolean;
    test_book?: {
        title: string;
        author: string;
        cover_url: string;
        publisher: string;
        rating: string;
    };
}

// ==================== 常量 ====================

const TUTORIAL_STEPS = [
    {
        title: '登录豆瓣读书',
        description: (
            <span>
                打开{' '}
                <a
                    href="https://book.douban.com"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    https://book.douban.com
                </a>{' '}
                并使用账号登录
            </span>
        ),
        icon: <LinkOutlined />,
    },
    {
        title: '打开开发者工具',
        description: '按 F12 (或 ⌘⌥I) 打开开发者工具，切换到 Network (网络) 标签',
        icon: <SettingOutlined />,
    },
    {
        title: '刷新页面',
        description: '按 F5 (或 ⌘R) 刷新页面，在请求列表中找到任意一个请求',
        icon: <ReloadOutlined />,
    },
    {
        title: '复制 Cookie',
        description:
            '在 Request Headers 中找到 Cookie 字段，完整复制其值（通常以一长串字符开头）',
        icon: <CopyOutlined />,
    },
    {
        title: '粘贴并保存',
        description: '将复制的 Cookie 粘贴到下方输入框，点击「保存」按钮',
        icon: <SaveOutlined />,
    },
];

const COOKIE_EXPIRY_WARN_DAYS = 3;
const COOKIE_EXPIRY_DANGER_DAYS = 1;

// ==================== 自定义 Hook ====================

/**
 * Cookie 配置数据 Hook
 */
const useCookieConfig = () => {
    const [loading, setLoading] = useState(true);
    const [cookieInfo, setCookieInfo] = useState<CookieInfo | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await getCookieConfig();
            setCookieInfo(data);
        } catch (err: unknown) {
            const errorMsg = extractErrorMessage(err) || '加载配置失败';
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return { cookieInfo, loading, error, load, setCookieInfo };
};

/**
 * Cookie 有效期估算 Hook
 */
const useCookieAgeWarning = (updatedAt?: string) => {
    const warning = useMemo(() => {
        if (!updatedAt) return null;

        const updated = new Date(updatedAt).getTime();
        const now = Date.now();
        const daysSinceUpdate = (now - updated) / (1000 * 60 * 60 * 24);

        if (daysSinceUpdate >= COOKIE_EXPIRY_DANGER_DAYS) {
            return {
                level: 'danger' as const,
                message: `已超过 ${Math.floor(daysSinceUpdate)} 天未更新，Cookie 可能已过期`,
                icon: <WarningOutlined style={{ color: '#ef4444' }} />,
            };
        }

        if (daysSinceUpdate >= COOKIE_EXPIRY_WARN_DAYS) {
            return {
                level: 'warning' as const,
                message: `已配置 ${Math.floor(daysSinceUpdate)} 天，建议定期更新`,
                icon: <ClockCircleOutlined style={{ color: '#f59e0b' }} />,
            };
        }

        return {
            level: 'success' as const,
            message: `最近更新于 ${formatDate(updatedAt, 'full')}`,
            icon: <CheckCircleOutlined style={{ color: '#22c55e' }} />,
        };
    }, [updatedAt]);

    return warning;
};

// ==================== 工具函数 ====================

/**
 * 安全脱敏 Cookie（仅显示前 20 和后 10 字符）
 */
const maskCookie = (cookie: string): string => {
    if (!cookie) return '';
    if (cookie.length <= 40) return cookie;
    return `${cookie.slice(0, 20)}...${cookie.slice(-10)}`;
};

/**
 * 估计 Cookie 字符数
 */
const estimateCookieLength = (cookie: string): string => {
    const len = cookie.length;
    if (len < 500) return `${len} 字符（可能不完整）`;
    if (len < 1000) return `${len} 字符（基本可用）`;
    if (len < 2000) return `${len} 字符（较完整）`;
    return `${len} 字符（完整）`;
};

// ==================== 主组件 ====================

const CookieConfig: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();

    // 数据
    const { cookieInfo, loading, error, load } = useCookieConfig();

    // 表单状态
    const [cookieInput, setCookieInput] = useState('');
    const [saving, setSaving] = useState(false);

    // 测试状态
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [testing, setTesting] = useState(false);

    // UI 状态
    const [showFullCookie, setShowFullCookie] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);

    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Cookie 有效期警告
    const ageWarning = useCookieAgeWarning(cookieInfo?.updated_at);

    // ==================== 操作处理 ====================

    /** 保存 Cookie */
    const handleSave = useCallback(async () => {
        const trimmed = cookieInput.trim();

        if (!trimmed) {
            message.warning({ content: '请输入 Cookie', key: 'cookie-empty' });
            return;
        }

        if (!trimmed.includes('=')) {
            message.warning({
                content: 'Cookie 格式不正确，请检查是否完整复制',
                key: 'cookie-invalid',
            });
            return;
        }

        setSaving(true);

        try {
            await saveCookieConfig({ cookie: trimmed });
            if (isMounted.current) {
                message.success({
                    content: 'Cookie 已保存',
                    key: 'cookie-save-success',
                });
                setCookieInput('');
                await load();
            }
        } catch (err: unknown) {
            if (isMounted.current) {
                const errorMsg = extractErrorMessage(err) || '保存失败';
                message.error({
                    content: errorMsg,
                    key: 'cookie-save-error',
                });
            }
        } finally {
            if (isMounted.current) {
                setSaving(false);
            }
        }
    }, [cookieInput, load]);

    /** 测试 Cookie */
    const handleTest = useCallback(async () => {
        setTesting(true);
        setTestResult(null);

        try {
            const result = await testCookieConfig();
            if (isMounted.current) {
                setTestResult(result);
                const msgKey = 'cookie-test-result';
                if (result.cookie_valid) {
                    message.success({ content: result.message, key: msgKey });
                } else {
                    message.warning({ content: result.message, key: msgKey });
                }
            }
        } catch (err: unknown) {
            if (isMounted.current) {
                const errorMsg = extractErrorMessage(err) || '测试失败';
                setTestResult({
                    success: false,
                    message: errorMsg,
                    cookie_valid: false,
                });
                message.error({ content: errorMsg, key: 'cookie-test-error' });
            }
        } finally {
            if (isMounted.current) {
                setTesting(false);
            }
        }
    }, []);

    /** 删除 Cookie */
    const handleDelete = useCallback(async () => {
        try {
            await deleteCookieConfig();
            if (isMounted.current) {
                message.success({
                    content: 'Cookie 已清除',
                    key: 'cookie-delete-success',
                });
                setTestResult(null);
                await load();
            }
        } catch (err: unknown) {
            if (isMounted.current) {
                message.error({
                    content: extractErrorMessage(err) || '清除失败',
                    key: 'cookie-delete-error',
                });
            }
        }
    }, [load]);

    /** 复制 Cookie */
    const handleCopyCookie = useCallback(() => {
        if (cookieInfo?.cookie_preview) {
            navigator.clipboard.writeText(cookieInfo.cookie_preview);
            message.success({
                content: '已复制 Cookie（脱敏版本）',
                key: 'cookie-copy',
            });
        }
    }, [cookieInfo]);

    /** 快速导入 */
    const handleQuickImport = useCallback(() => {
        setShowImportModal(true);
    }, []);

    // ==================== 状态配置 ====================

    const statusConfig = useMemo(() => {
        if (!cookieInfo) return null;

        return {
            hasCookie: cookieInfo.has_cookie,
            statusText: cookieInfo.has_cookie ? '已配置' : '未配置',
            statusColor: cookieInfo.has_cookie ? '#22c55e' : '#f59e0b',
            statusIcon: cookieInfo.has_cookie ? (
                <CheckCircleOutlined />
            ) : (
                <ExclamationCircleOutlined />
            ),
        };
    }, [cookieInfo]);

    // ==================== 渲染教程 ====================

    const tutorialItems: CollapseProps['items'] = [
        {
            key: 'tutorial',
            label: (
                <Space size={8}>
                    <QuestionCircleOutlined style={{ color: '#3b82f6' }} />
                    <span style={{ fontWeight: 600 }}>如何获取豆瓣 Cookie？</span>
                </Space>
            ),
            children: (
                <div>
                    <Alert
                        title="获取步骤"
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                    <Steps
                        direction="vertical"
                        size="small"
                        current={-1}
                        items={TUTORIAL_STEPS.map((step) => ({
                            title: step.title,
                            content: step.description,
                            icon: step.icon,
                        }))}
                    />
                    <Alert
                        title="注意事项"
                        description={
                            <ul style={{ paddingLeft: 20, margin: 0 }}>
                                <li>Cookie 通常 1-7 天后过期，需定期更新</li>
                                <li>建议使用备用账号，避免主账号异常请求被限制</li>
                                <li>Cookie 仅保存在服务器本地，不会上传第三方</li>
                                <li>同步失败时可使用手动录入功能作为备用方案</li>
                            </ul>
                        }
                        type="warning"
                        showIcon
                        style={{ marginTop: 16 }}
                    />
                </div>
            ),
        },
    ];

    // ==================== 渲染状态卡片 ====================

    const renderStatusCard = () => {
        if (!statusConfig) return null;

        return (
            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 12,
                    border: `1px solid ${token.colorBorderSecondary}`,
                }}
                title={
                    <Space size={6}>
                        <KeyOutlined style={{ color: token.colorPrimary }} />
                        <span>配置状态</span>
                    </Space>
                }
            >
                <Row gutter={[24, 24]}>
                    <Col xs={24} sm={8}>
                        <Card
                            size="small"
                            style={{
                                background:
                                    statusConfig.hasCookie
                                        ? token.colorSuccessBg
                                        : token.colorWarningBg,
                                border: `1px solid ${
                                    statusConfig.hasCookie
                                        ? token.colorSuccessBorder
                                        : token.colorWarningBorder
                                }`,
                                borderRadius: 10,
                            }}
                        >
                            <Statistic
                                title="配置状态"
                                value={statusConfig.statusText}
                                styles={{ content: { color: statusConfig.statusColor } }}
                                prefix={statusConfig.statusIcon}
                            />
                        </Card>
                    </Col>

                    {cookieInfo?.updated_at && (
                        <Col xs={24} sm={8}>
                            <Card
                                size="small"
                                style={{
                                    borderRadius: 10,
                                    background: token.colorFillSecondary,
                                }}
                            >
                                <Statistic
                                    title="最后更新"
                                    value={formatDate(
                                        cookieInfo.updated_at,
                                        'date'
                                    )}
                                    prefix={<ClockCircleOutlined />}
                                    styles={{ content: { fontSize: 16 } }}
                                />
                            </Card>
                        </Col>
                    )}
                </Row>

                {/* Cookie 有效期警告 */}
                {ageWarning && (
                    <Alert
                        title={ageWarning.message}
                        type={ageWarning.level === 'danger' ? 'error' : ageWarning.level}
                        showIcon
                        icon={ageWarning.icon}
                        style={{ marginTop: 16, borderRadius: 8 }}
                        action={
                            ageWarning.level !== 'success' && (
                                <Button
                                    size="small"
                                    type="primary"
                                    onClick={() => {
                                        const textarea = document.querySelector<HTMLTextAreaElement>(
                                            'textarea[placeholder*="Cookie"]'
                                        );
                                        textarea?.focus();
                                    }}
                                >
                                    更新 Cookie
                                </Button>
                            )
                        }
                    />
                )}

                {/* Cookie 预览 */}
                {cookieInfo?.has_cookie && (
                    <div
                        style={{
                            marginTop: 16,
                            padding: 16,
                            background: token.colorFillSecondary,
                            borderRadius: 10,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 10,
                                flexWrap: 'wrap',
                                gap: 8,
                            }}
                        >
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Cookie 预览（脱敏）
                            </Text>
                            <Space size={4}>
                                <Tooltip title="复制脱敏 Cookie">
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={<CopyOutlined />}
                                        onClick={handleCopyCookie}
                                    />
                                </Tooltip>
                                <Tooltip
                                    title={
                                        showFullCookie
                                            ? '隐藏完整 Cookie'
                                            : '显示完整 Cookie'
                                    }
                                >
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={
                                            showFullCookie ? (
                                                <EyeInvisibleOutlined />
                                            ) : (
                                                <EyeOutlined />
                                            )
                                        }
                                        onClick={() =>
                                            setShowFullCookie(!showFullCookie)
                                        }
                                    />
                                </Tooltip>
                                <Popconfirm
                                    title="确定删除 Cookie 配置？"
                                    description="删除后豆瓣同步功能将不可用"
                                    onConfirm={handleDelete}
                                    okText="确定删除"
                                    cancelText="取消"
                                    okButtonProps={{ danger: true }}
                                >
                                    <Button
                                        size="small"
                                        danger
                                        type="text"
                                        icon={<DeleteOutlined />}
                                    />
                                </Popconfirm>
                            </Space>
                        </div>
                        <Text
                            code
                            style={{
                                fontSize: 12,
                                wordBreak: 'break-all',
                                maxHeight: showFullCookie ? 'none' : 60,
                                overflow: 'hidden',
                                display: 'block',
                                padding: 8,
                                borderRadius: 6,
                                background: token.colorBgContainer,
                            }}
                        >
                            {cookieInfo.cookie_preview}
                        </Text>
                        <Text
                            type="secondary"
                            style={{
                                fontSize: 11,
                                marginTop: 6,
                                display: 'block',
                            }}
                        >
                            {estimateCookieLength(cookieInfo.cookie_preview)}
                        </Text>
                    </div>
                )}
            </Card>
        );
    };

    // ==================== 渲染设置卡片 ====================

    const renderSettingsCard = () => (
        <Card
            style={{
                marginBottom: 24,
                borderRadius: 12,
                border: `1px solid ${token.colorBorderSecondary}`,
            }}
            title={
                <Space size={6}>
                    <SettingOutlined style={{ color: token.colorPrimary }} />
                    <span>Cookie 设置</span>
                </Space>
            }
            extra={
                <Button
                    size="small"
                    icon={<ImportOutlined />}
                    onClick={handleQuickImport}
                >
                    快速导入
                </Button>
            }
        >
            <Space orientation="vertical" size="large" style={{ width: '100%' }}>
                {/* 输入区域 */}
                <div>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 8,
                        }}
                    >
                        <label style={{ fontWeight: 500 }}>
                            Cookie 字符串
                        </label>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            已输入 {cookieInput.length} 字符
                        </Text>
                    </div>
                    <TextArea
                        rows={6}
                        placeholder='dbcl2="..."; ck="..."; bid="..."'
                        value={cookieInput}
                        onChange={(e) => setCookieInput(e.target.value)}
                        style={{
                            borderRadius: 8,
                            fontFamily: 'monospace',
                            fontSize: 13,
                        }}
                    />
                    <Text
                        type="secondary"
                        style={{
                            fontSize: 11,
                            marginTop: 4,
                            display: 'block',
                        }}
                    >
                        从浏览器开发者工具的 Request Headers 中复制完整的 Cookie 值
                    </Text>
                </div>

                {/* 操作按钮 */}
                <Space size={12} wrap>
                    <Tooltip title="保存 Cookie 配置">
                        <Button
                            type="primary"
                            size="large"
                            icon={<SaveOutlined />}
                            loading={saving}
                            onClick={handleSave}
                            style={{ borderRadius: 8 }}
                            disabled={!cookieInput.trim()}
                        >
                            保存
                        </Button>
                    </Tooltip>
                    <Tooltip title="测试 Cookie 是否有效">
                        <Button
                            size="large"
                            icon={<ExperimentOutlined />}
                            loading={testing}
                            onClick={handleTest}
                            disabled={!cookieInfo?.has_cookie}
                            style={{ borderRadius: 8 }}
                        >
                            测试有效性
                        </Button>
                    </Tooltip>
                    <Button
                        size="large"
                        icon={<ClearOutlined />}
                        onClick={() => setCookieInput('')}
                        disabled={!cookieInput}
                        style={{ borderRadius: 8 }}
                    >
                        清空
                    </Button>
                </Space>
            </Space>
        </Card>
    );

    // ==================== 渲染测试结果 ====================

    const renderTestResult = () => {
        if (!testResult) return null;

        return (
            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 12,
                    borderLeft: `4px solid ${
                        testResult.cookie_valid ? '#22c55e' : '#ef4444'
                    }`,
                    animation: 'fadeIn 0.4s ease-out',
                }}
                title={
                    <Space size={8}>
                        {testResult.cookie_valid ? (
                            <CheckCircleOutlined style={{ color: '#22c55e', fontSize: 20 }} />
                        ) : (
                            <ExclamationCircleOutlined style={{ color: '#ef4444', fontSize: 20 }} />
                        )}
                        <Tag
                            color={testResult.cookie_valid ? 'success' : 'error'}
                            style={{ borderRadius: 6 }}
                        >
                            {testResult.cookie_valid ? '测试通过' : '测试失败'}
                        </Tag>
                    </Space>
                }
            >
                <Alert
                    title={testResult.message}
                    type={testResult.cookie_valid ? 'success' : 'error'}
                    showIcon
                    style={{ borderRadius: 8 }}
                />

                {/* 测试成功：展示示例图书 */}
                {testResult.cookie_valid && testResult.test_book && (
                    <div
                        style={{
                            marginTop: 20,
                            padding: 24,
                            background: token.colorFillSecondary,
                            borderRadius: 12,
                        }}
                    >
                        <Text strong style={{ fontSize: 14 }}>
                            <ThunderboltOutlined
                                style={{ color: '#f59e0b', marginRight: 8 }}
                            />
                            示例图书（验证数据获取正常）
                        </Text>
                        <Row gutter={[24, 16]} style={{ marginTop: 16 }}>
                            {/* 封面 */}
                            <Col xs={24} sm={8} style={{ textAlign: 'center' }}>
                                {testResult.test_book.cover_url ? (
                                    <Image
                                        src={getCoverUrl(
                                            testResult.test_book.cover_url
                                        )}
                                        alt={testResult.test_book.title}
                                        style={{
                                            width: '100%',
                                            maxWidth: 180,
                                            borderRadius: 10,
                                            boxShadow:
                                                '0 4px 12px rgba(0,0,0,0.1)',
                                        }}
                                        fallback="data:image/svg+xml,..."
                                        preview={{ mask: '查看封面' }}
                                    />
                                ) : (
                                    <div
                                        style={{
                                            aspectRatio: '3/4',
                                            maxWidth: 180,
                                            margin: '0 auto',
                                            background:
                                                token.colorFillSecondary,
                                            borderRadius: 10,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <BookOutlined
                                            style={{
                                                fontSize: 44,
                                                color: '#d4a574',
                                            }}
                                        />
                                    </div>
                                )}
                            </Col>

                            {/* 信息 */}
                            <Col xs={24} sm={16}>
                                <Title level={4} style={{ marginTop: 0 }}>
                                    {testResult.test_book.title}
                                </Title>

                                {testResult.test_book.rating && (
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            marginBottom: 12,
                                        }}
                                    >
                                        <Rate
                                            disabled
                                            allowHalf
                                            value={
                                                parseFloat(
                                                    testResult.test_book.rating
                                                ) / 2
                                            }
                                            style={{ fontSize: 16 }}
                                        />
                                        <Text
                                            strong
                                            style={{
                                                fontSize: 20,
                                                color: '#f59e0b',
                                            }}
                                        >
                                            {testResult.test_book.rating}
                                        </Text>
                                    </div>
                                )}

                                <Space
                                    orientation="vertical"
                                    size="small"
                                >
                                    {testResult.test_book.author && (
                                        <div>
                                            <UserOutlined
                                                style={{ color: '#8c7b72' }}
                                            />{' '}
                                            <Text>
                                                {testResult.test_book.author}
                                            </Text>
                                        </div>
                                    )}
                                    {testResult.test_book.publisher && (
                                        <div>
                                            <BookOutlined
                                                style={{ color: '#8c7b72' }}
                                            />{' '}
                                            <Text type="secondary">
                                                {testResult.test_book.publisher}
                                            </Text>
                                        </div>
                                    )}
                                </Space>
                            </Col>
                        </Row>
                    </div>
                )}

                {/* 测试失败：提示 */}
                {!testResult.cookie_valid && (
                    <Alert
                        title="常见原因"
                        description={
                            <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                                <li>Cookie 已过期（通常 1-7 天有效）</li>
                                <li>Cookie 未完整复制</li>
                                <li>网络连接问题</li>
                                <li>豆瓣临时限制访问</li>
                            </ul>
                        }
                        type="warning"
                        showIcon
                        style={{ marginTop: 16, borderRadius: 8 }}
                    />
                )}
            </Card>
        );
    };

    // ==================== 渲染页面 ====================

    if (loading) {
        return (
            <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
                <Skeleton active paragraph={{ rows: 2 }} />
                <Card style={{ borderRadius: 12, marginTop: 16 }}>
                    <Skeleton active paragraph={{ rows: 8 }} />
                </Card>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
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
                            <a onClick={() => navigate('/admin')}>
                                <SettingOutlined /> 管理
                            </a>
                        ),
                    },
                    {
                        title: (
                            <span>
                                <SafetyOutlined /> Cookie 配置
                            </span>
                        ),
                    },
                ]}
            />

            {/* 标题 */}
            <Title level={2} style={{ marginBottom: 24 }}>
                <SafetyOutlined
                    style={{ marginRight: 12, color: token.colorPrimary }}
                />
                豆瓣 Cookie 配置
            </Title>

            {/* 错误状态 */}
            {error && (
                <Alert
                    title="加载失败"
                    description={error}
                    type="error"
                    showIcon
                    style={{ marginBottom: 16 }}
                    action={
                        <Button
                            size="small"
                            onClick={load}
                            icon={<ReloadOutlined />}
                        >
                            重试
                        </Button>
                    }
                />
            )}

            {/* 获取教程 */}
            <Card style={{ marginBottom: 24, borderRadius: 12 }}>
                <Collapse ghost items={tutorialItems} />
            </Card>

            {/* 状态卡片 */}
            {renderStatusCard()}

            {/* 设置卡片 */}
            {renderSettingsCard()}

            {/* 测试结果 */}
            {renderTestResult()}

            {/* 快速导入弹窗 */}
            <Modal
                title="快速导入 Cookie"
                open={showImportModal}
                onCancel={() => setShowImportModal(false)}
                footer={null}
                width={500}
            >
                <Alert
                    title="在浏览器控制台中执行以下命令获取 Cookie"
                    type="info"
                    showIcon
                    style={{ marginBottom: 16, borderRadius: 8 }}
                />
                <Text
                    code
                    copyable
                    style={{
                        display: 'block',
                        padding: 12,
                        borderRadius: 8,
                        background: token.colorFillSecondary,
                        fontSize: 13,
                    }}
                >
                    document.cookie
                </Text>
                <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
                    将结果粘贴到输入框中保存
                </Text>
            </Modal>

            {/* 动画 */}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default CookieConfig;
export type { CookieInfo, TestResult };