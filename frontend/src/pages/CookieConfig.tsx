// frontend/src/pages/CookieConfig.tsx
/**
 * 豆瓣 Cookie 配置页面
 * 
 * 管理豆瓣 Cookie 的完整生命周期：查看、保存、测试、删除。
 * 
 * 功能模块：
 * 1. 获取教程：折叠面板展示从浏览器获取 Cookie 的步骤
 * 2. Cookie 状态：显示当前配置状态（已配置/未配置）和有效性
 * 3. Cookie 输入：输入框保存新的 Cookie 字符串
 * 4. 测试结果：展示 Cookie 测试的详细反馈
 * 5. 使用建议：Cookie 维护的最佳实践
 * 
 * Cookie 安全：
 * - 完整 Cookie 不通过 API 返回，仅显示脱敏预览
 * - 保存和测试操作分离
 * - 删除时需要确认
 * - 本地存储，不上传第三方
 * 
 * 测试机制：
 * - 使用预定义 ISBN（9787544270878）发起实际搜索请求
 * - 成功获取图书标题说明 Cookie 有效
 * - 失败则提供排查建议
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
    Switch,
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
    StarFilled,
    BookOutlined,
    UserOutlined,
    ReloadOutlined,
    SafetyOutlined,
    ThunderboltOutlined,
    InfoCircleOutlined,
    HomeOutlined,
    ClockCircleOutlined,
    SettingOutlined,
    ClearOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    getCookieConfig,
    saveCookieConfig,
    testCookieConfig,
    deleteCookieConfig,
} from '../services/api';
import { getCoverUrl } from '../utils/image';

// ---- 类型定义 ----

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

/** Cookie 配置信息 */
interface CookieInfo {
    has_cookie: boolean;
    cookie_preview: string;
    user_agent: string;
    updated_at?: string;
}

/** Cookie 测试结果 */
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

// ---- 常量 ----

/** 豆瓣登录地址 */
const DOUBAN_LOGIN_URL = 'https://accounts.douban.com/passport/login';

/** 测试用图书豆瓣页面 */
const DOUBAN_TEST_URL = 'https://book.douban.com/subject/25862578/';

/** Cookie 获取步骤 */
const TUTORIAL_STEPS = [
    {
        title: '登录豆瓣',
        description: (
            <span>
                打开浏览器访问{' '}
                <a
                    href="https://book.douban.com"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    https://book.douban.com
                </a>
                {' '}并登录您的账号
            </span>
        ),
    },
    {
        title: '打开开发者工具',
        description:
            '按 F12（Mac: Cmd+Option+I）打开开发者工具，切换到 Network（网络）标签',
    },
    {
        title: '刷新页面',
        description:
            '按 F5（Mac: Cmd+R）刷新页面，在请求列表中找到任意一个请求（如 subject/xxx/）',
    },
    {
        title: '复制 Cookie',
        description: (
            <div>
                <p>点击请求，在 Request Headers 中找到 Cookie 字段</p>
                <p style={{ color: '#8c7b72', fontSize: '13px' }}>
                    技巧：右键请求 → Copy → Copy as cURL，可获取完整请求信息
                </p>
            </div>
        ),
    },
    {
        title: '粘贴并保存',
        description:
            '将 Cookie 字符串完整粘贴到下方输入框，点击「保存 Cookie」按钮',
    },
];

// ---- 主组件 ----

const CookieConfig: React.FC = () => {
    const navigate = useNavigate();

    // ==================== 状态 ====================

    const [loading, setLoading] = useState(true);
    const [testing, setTesting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const [cookieInfo, setCookieInfo] = useState<CookieInfo | null>(null);
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [cookieInput, setCookieInput] = useState('');
    const [userAgentInput, setUserAgentInput] = useState('');
    const [showFullCookie, setShowFullCookie] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // ==================== 数据加载 ====================

    /** 加载 Cookie 配置状态 */
    const loadCookieInfo = useCallback(async () => {
        setLoading(true);
        setLoadError(null);

        try {
            const data = await getCookieConfig();
            setCookieInfo(data);
        } catch (error: any) {
            const errorMsg =
                error?.response?.data?.detail || '加载配置失败';
            setLoadError(errorMsg);
            console.error('[CookieConfig] 加载失败:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadCookieInfo();
    }, [loadCookieInfo]);

    // ==================== 保存操作 ====================

    /** 保存 Cookie 配置 */
    const handleSaveCookie = useCallback(async () => {
        if (!cookieInput.trim()) {
            message.warning('请输入 Cookie 字符串');
            return;
        }

        // 基本格式验证
        if (!cookieInput.includes('=') || cookieInput.length < 20) {
            message.warning('Cookie 格式不正确，请检查是否完整复制');
            return;
        }

        setSaving(true);
        try {
            await saveCookieConfig({
                cookie: cookieInput.trim(),
                user_agent: userAgentInput.trim(),
            });

            message.success('Cookie 保存成功！');
            setCookieInput('');
            setUserAgentInput('');
            setTestResult(null);
            setShowFullCookie(false);
            await loadCookieInfo();
        } catch (error: any) {
            message.error(
                error?.response?.data?.detail || '保存失败，请重试'
            );
        } finally {
            setSaving(false);
        }
    }, [cookieInput, userAgentInput, loadCookieInfo]);

    // ==================== 测试操作 ====================

    /** 测试 Cookie 有效性 */
    const handleTestCookie = useCallback(async () => {
        setTesting(true);
        setTestResult(null);

        try {
            const result = await testCookieConfig();
            setTestResult(result);

            if (result.cookie_valid) {
                message.success('Cookie 测试通过！图书信息获取正常');
            } else {
                message.warning(result.message || 'Cookie 无效');
            }
        } catch (error: any) {
            const errorMsg =
                error?.response?.data?.detail || '测试失败，请检查网络';
            setTestResult({
                success: false,
                message: errorMsg,
                cookie_valid: false,
            });
            message.error(errorMsg);
        } finally {
            setTesting(false);
        }
    }, []);

    // ==================== 删除操作 ====================

    /** 删除 Cookie 配置 */
    const handleDeleteCookie = useCallback(async () => {
        setDeleting(true);
        try {
            await deleteCookieConfig();
            message.success('Cookie 已清除，系统将使用备用数据源');
            setTestResult(null);
            setShowFullCookie(false);
            await loadCookieInfo();
        } catch (error: any) {
            message.error(
                error?.response?.data?.detail || '清除失败'
            );
        } finally {
            setDeleting(false);
        }
    }, [loadCookieInfo]);

    // ==================== 复制操作 ====================

    /** 复制 Cookie 到剪贴板（注意：此处为脱敏版本） */
    const handleCopyCookie = useCallback(async () => {
        if (cookieInfo?.cookie_preview) {
            try {
                await navigator.clipboard.writeText(
                    cookieInfo.cookie_preview
                );
                message.success('已复制到剪贴板');
            } catch {
                message.error('复制失败，请手动复制');
            }
        }
    }, [cookieInfo]);

    // ==================== 衍生数据 ====================

    /** Cookie 状态配置 */
    const statusConfig = useMemo(() => {
        if (!cookieInfo) return null;

        return {
            hasCookie: cookieInfo.has_cookie,
            isValid: testResult?.cookie_valid,
            statusText: cookieInfo.has_cookie ? '已配置' : '未配置',
            statusColor: cookieInfo.has_cookie ? '#22c55e' : '#f59e0b',
            validText: testResult
                ? testResult.cookie_valid
                    ? '有效'
                    : '无效'
                : '未测试',
            validColor: testResult
                ? testResult.cookie_valid
                    ? '#22c55e'
                    : '#ef4444'
                : '#8c7b72',
        };
    }, [cookieInfo, testResult]);

    // ==================== 渲染：加载状态 ====================

    if (loading) {
        return (
            <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
                <Card style={{ borderRadius: 12 }}>
                    <div
                        style={{
                            textAlign: 'center',
                            padding: '60px 0',
                        }}
                    >
                        <Spin size="large">
                            <div style={{ padding: 30 }} />
                        </Spin>
                        <Text
                            type="secondary"
                            style={{
                                display: 'block',
                                marginTop: 16,
                            }}
                        >
                            加载配置信息...
                        </Text>
                    </div>
                </Card>
            </div>
        );
    }

    // ==================== 主渲染 ====================

    return (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
            {/* 面包屑导航 */}
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

            {/* 页面标题 */}
            <div style={{ marginBottom: 24 }}>
                <Title level={2} style={{ marginBottom: 4 }}>
                    <SafetyOutlined
                        style={{ marginRight: 12, color: '#8B4513' }}
                    />
                    豆瓣 Cookie 配置
                </Title>
                <Text type="secondary" style={{ fontSize: 15 }}>
                    配置豆瓣 Cookie 以启用自动获取图书信息功能
                </Text>
            </div>

            {/* 错误提示 */}
            {loadError && (
                <Alert
                    message="加载失败"
                    description={loadError}
                    type="error"
                    showIcon
                    closable
                    style={{ marginBottom: 24, borderRadius: 8 }}
                    action={
                        <Button size="small" onClick={loadCookieInfo}>
                            重试
                        </Button>
                    }
                />
            )}

            {/* ===== 获取教程 ===== */}
            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 12,
                    boxShadow: '0 2px 8px rgba(139,69,19,.06)',
                    border: '1px solid #e8d5c8',
                }}
            >
                <Collapse
                    ghost
                    items={[
                        {
                            key: 'tutorial',
                            label: (
                                <Space>
                                    <QuestionCircleOutlined
                                        style={{ color: '#3b82f6' }}
                                    />
                                    <span
                                        style={{
                                            fontWeight: 600,
                                            fontSize: 15,
                                        }}
                                    >
                                        如何获取豆瓣 Cookie？
                                    </span>
                                </Space>
                            ),
                            children: (
                                <div>
                                    <Alert
                                        message="获取步骤"
                                        type="info"
                                        showIcon
                                        style={{
                                            marginBottom: 16,
                                            borderRadius: 8,
                                        }}
                                        description={
                                            <Steps
                                                direction="vertical"
                                                size="small"
                                                current={-1}
                                                items={TUTORIAL_STEPS}
                                                style={{ marginTop: 12 }}
                                            />
                                        }
                                    />

                                    <Alert
                                        message="注意事项"
                                        type="warning"
                                        showIcon
                                        style={{ borderRadius: 8 }}
                                        description={
                                            <ul
                                                style={{
                                                    margin: 0,
                                                    paddingLeft: 20,
                                                    lineHeight: 1.8,
                                                }}
                                            >
                                                <li>
                                                    Cookie
                                                    包含您的登录凭据，请勿分享给他人
                                                </li>
                                                <li>
                                                    Cookie 通常 1-7
                                                    天后过期，同步失败时请重新获取
                                                </li>
                                                <li>
                                                    建议使用备用账号，避免主账号因异常请求被限制
                                                </li>
                                                <li>
                                                    合理控制同步频率，短时间内大量请求可能导致暂时封禁
                                                </li>
                                            </ul>
                                        }
                                    />

                                    <div
                                        style={{
                                            marginTop: 16,
                                            padding: 16,
                                            background: '#fafaf9',
                                            borderRadius: 8,
                                            border: '1px solid #f0e4d8',
                                        }}
                                    >
                                        <Text
                                            strong
                                            style={{
                                                display: 'block',
                                                marginBottom: 8,
                                            }}
                                        >
                                            快速测试链接：
                                        </Text>
                                        <a
                                            href={DOUBAN_TEST_URL}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                color: '#3b82f6',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                            }}
                                        >
                                            <LinkOutlined />
                                            解忧杂货店 -
                                            豆瓣页面（用于验证 Cookie
                                            是否生效）
                                        </a>
                                    </div>
                                </div>
                            ),
                        },
                    ]}
                />
            </Card>

            {/* ===== Cookie 状态 ===== */}
            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 12,
                    boxShadow: '0 2px 8px rgba(139,69,19,.06)',
                    border: '1px solid #e8d5c8',
                }}
                title={
                    <Space>
                        <KeyOutlined style={{ color: '#8B4513' }} />
                        <span style={{ fontWeight: 600 }}>
                            Cookie 状态
                        </span>
                    </Space>
                }
            >
                {statusConfig && (
                    <Row gutter={[24, 24]}>
                        <Col xs={24} sm={12}>
                            <Card
                                size="small"
                                style={{
                                    borderRadius: 8,
                                    background: '#fafaf9',
                                }}
                            >
                                <Statistic
                                    title="配置状态"
                                    value={statusConfig.statusText}
                                    valueStyle={{
                                        color: statusConfig.statusColor,
                                        fontSize: 24,
                                    }}
                                    prefix={
                                        statusConfig.hasCookie ? (
                                            <CheckCircleOutlined />
                                        ) : (
                                            <ExclamationCircleOutlined />
                                        )
                                    }
                                />
                            </Card>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Card
                                size="small"
                                style={{
                                    borderRadius: 8,
                                    background: '#fafaf9',
                                }}
                            >
                                <Statistic
                                    title="有效性"
                                    value={statusConfig.validText}
                                    valueStyle={{
                                        color: statusConfig.validColor,
                                        fontSize: 24,
                                    }}
                                    prefix={
                                        testResult?.cookie_valid ? (
                                            <CheckCircleOutlined />
                                        ) : testResult ? (
                                            <ExclamationCircleOutlined />
                                        ) : (
                                            <QuestionCircleOutlined />
                                        )
                                    }
                                />
                            </Card>
                        </Col>
                    </Row>
                )}

                {/* Cookie 预览 */}
                {cookieInfo?.has_cookie && (
                    <div
                        style={{
                            marginTop: 16,
                            padding: 16,
                            background: '#fafaf9',
                            borderRadius: 8,
                            border: '1px solid #f0e4d8',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 8,
                            }}
                        >
                            <Text
                                type="secondary"
                                style={{ fontSize: 13 }}
                            >
                                Cookie 预览（脱敏显示）：
                            </Text>
                            <Space>
                                <Tooltip title="复制 Cookie">
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
                                            ? '隐藏'
                                            : '显示完整'
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
                                            setShowFullCookie(
                                                !showFullCookie
                                            )
                                        }
                                    />
                                </Tooltip>
                                <Popconfirm
                                    title="确定要删除 Cookie 配置吗？"
                                    description="删除后豆瓣数据同步功能将不可用，系统将使用备用数据源。"
                                    onConfirm={handleDeleteCookie}
                                    okText="确定删除"
                                    cancelText="取消"
                                    okButtonProps={{ danger: true }}
                                >
                                    <Button
                                        size="small"
                                        danger
                                        type="text"
                                        icon={<DeleteOutlined />}
                                        loading={deleting}
                                    />
                                </Popconfirm>
                            </Space>
                        </div>
                        <Text
                            code
                            style={{
                                fontSize: 12,
                                wordBreak: 'break-all',
                                display: 'block',
                                maxHeight: showFullCookie
                                    ? 'none'
                                    : 60,
                                overflow: 'hidden',
                            }}
                        >
                            {cookieInfo.cookie_preview}
                        </Text>
                        {cookieInfo.updated_at && (
                            <div style={{ marginTop: 8 }}>
                                <Text
                                    type="secondary"
                                    style={{ fontSize: 11 }}
                                >
                                    <ClockCircleOutlined
                                        style={{ marginRight: 4 }}
                                    />
                                    更新于：
                                    {new Date(
                                        cookieInfo.updated_at
                                    ).toLocaleString('zh-CN')}
                                </Text>
                            </div>
                        )}
                    </div>
                )}
            </Card>

            {/* ===== Cookie 输入 ===== */}
            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 12,
                    boxShadow: '0 2px 8px rgba(139,69,19,.06)',
                    border: '1px solid #e8d5c8',
                }}
                title={
                    <Space>
                        <KeyOutlined style={{ color: '#8B4513' }} />
                        <span style={{ fontWeight: 600 }}>
                            设置 Cookie
                        </span>
                    </Space>
                }
            >
                <Space
                    direction="vertical"
                    size="large"
                    style={{ width: '100%' }}
                >
                    <div>
                        <label
                            style={{
                                display: 'block',
                                marginBottom: 8,
                                fontWeight: 500,
                            }}
                        >
                            Cookie 字符串
                            <Tooltip title="从浏览器开发者工具中复制完整的 Cookie 字符串（包含 dbcl2、ck、bid 等字段）">
                                <QuestionCircleOutlined
                                    style={{
                                        marginLeft: 6,
                                        color: '#8c7b72',
                                    }}
                                />
                            </Tooltip>
                        </label>
                        <TextArea
                            rows={6}
                            placeholder='粘贴豆瓣 Cookie，例如：&#10;dbcl2="..."; ck="..."; bid="..."; __utma=...'
                            value={cookieInput}
                            onChange={(e) =>
                                setCookieInput(e.target.value)
                            }
                            style={{
                                borderRadius: 8,
                                fontFamily: 'monospace',
                                fontSize: 13,
                            }}
                        />
                    </div>

                    <div>
                        <label
                            style={{
                                display: 'block',
                                marginBottom: 8,
                                fontWeight: 500,
                            }}
                        >
                            User-Agent（可选）
                            <Tooltip title="自定义浏览器标识，留空则使用系统默认值">
                                <QuestionCircleOutlined
                                    style={{
                                        marginLeft: 6,
                                        color: '#8c7b72',
                                    }}
                                />
                            </Tooltip>
                        </label>
                        <Input
                            placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36..."
                            value={userAgentInput}
                            onChange={(e) =>
                                setUserAgentInput(e.target.value)
                            }
                            style={{
                                borderRadius: 8,
                                fontFamily: 'monospace',
                                fontSize: 13,
                            }}
                            allowClear
                        />
                    </div>

                    <Space size="middle" wrap>
                        <Button
                            type="primary"
                            size="large"
                            icon={<SaveOutlined />}
                            loading={saving}
                            onClick={handleSaveCookie}
                            style={{
                                borderRadius: 8,
                                minWidth: 140,
                            }}
                        >
                            保存 Cookie
                        </Button>
                        <Button
                            size="large"
                            icon={<ExperimentOutlined />}
                            loading={testing}
                            onClick={handleTestCookie}
                            disabled={!cookieInfo?.has_cookie}
                            style={{ borderRadius: 8 }}
                        >
                            测试 Cookie
                        </Button>
                        <Button
                            size="large"
                            icon={<ClearOutlined />}
                            onClick={() => {
                                setCookieInput('');
                                setUserAgentInput('');
                            }}
                            style={{ borderRadius: 8 }}
                        >
                            清空输入
                        </Button>
                    </Space>
                </Space>
            </Card>

            {/* ===== 测试中 ===== */}
            {testing && (
                <Card
                    style={{
                        marginBottom: 24,
                        borderRadius: 12,
                        boxShadow: '0 2px 8px rgba(139,69,19,.06)',
                        border: '1px solid #e8d5c8',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '40px 0',
                            gap: 16,
                        }}
                    >
                        <Spin size="large">
                            <div style={{ padding: 20 }} />
                        </Spin>
                        <Text
                            type="secondary"
                            style={{ fontSize: 16 }}
                        >
                            正在测试 Cookie，尝试获取图书信息...
                        </Text>
                        <Text
                            type="secondary"
                            style={{ fontSize: 13 }}
                        >
                            这可能需要几秒钟时间
                        </Text>
                    </div>
                </Card>
            )}

            {/* ===== 测试结果 ===== */}
            {testResult && !testing && (
                <Card
                    style={{
                        marginBottom: 24,
                        borderRadius: 12,
                        boxShadow: '0 2px 8px rgba(139,69,19,.06)',
                        border: `1px solid ${
                            testResult.cookie_valid
                                ? '#d1fae5'
                                : '#fecaca'
                        }`,
                        borderLeft: `4px solid ${
                            testResult.cookie_valid
                                ? '#22c55e'
                                : '#ef4444'
                        }`,
                    }}
                    title={
                        <Space>
                            {testResult.cookie_valid ? (
                                <CheckCircleOutlined
                                    style={{ color: '#22c55e' }}
                                />
                            ) : (
                                <ExclamationCircleOutlined
                                    style={{ color: '#ef4444' }}
                                />
                            )}
                            <span style={{ fontWeight: 600 }}>
                                测试结果
                            </span>
                            <Tag
                                color={
                                    testResult.cookie_valid
                                        ? 'success'
                                        : 'error'
                                }
                            >
                                {testResult.cookie_valid
                                    ? '通过'
                                    : '失败'}
                            </Tag>
                        </Space>
                    }
                >
                    <Alert
                        message={testResult.message}
                        type={
                            testResult.cookie_valid
                                ? 'success'
                                : 'error'
                        }
                        showIcon
                        style={{
                            marginBottom: 16,
                            borderRadius: 8,
                        }}
                    />

                    {/* 测试成功的图书信息 */}
                    {testResult.cookie_valid &&
                        testResult.test_book && (
                            <div
                                style={{
                                    padding: 24,
                                    background: '#fafaf9',
                                    borderRadius: 8,
                                    border: '1px solid #f0e4d8',
                                }}
                            >
                                <Text
                                    strong
                                    style={{
                                        fontSize: 16,
                                        display: 'block',
                                        marginBottom: 16,
                                    }}
                                >
                                    <ThunderboltOutlined
                                        style={{
                                            marginRight: 8,
                                            color: '#f59e0b',
                                        }}
                                    />
                                    成功获取的图书信息示例
                                </Text>
                                <Row gutter={[24, 16]}>
                                    <Col xs={24} sm={8}>
                                        {testResult.test_book
                                            .cover_url ? (
                                            <Image
                                                src={getCoverUrl(
                                                    testResult
                                                        .test_book
                                                        .cover_url
                                                )}
                                                alt={
                                                    testResult
                                                        .test_book
                                                        .title
                                                }
                                                style={{
                                                    width: '100%',
                                                    maxWidth: 180,
                                                    borderRadius: 8,
                                                    boxShadow:
                                                        '0 4px 12px rgba(139,69,19,.15)',
                                                }}
                                                fallback={`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="252"><rect fill="#fafaf9" width="180" height="252"/><text x="90" y="130" text-anchor="middle" fill="#8c7b72" font-size="14">暂无封面</text></svg>')}`}
                                            />
                                        ) : (
                                            <div
                                                style={{
                                                    width: '100%',
                                                    maxWidth: 180,
                                                    aspectRatio:
                                                        '3/4',
                                                    background:
                                                        '#f5f5f4',
                                                    borderRadius: 8,
                                                    display: 'flex',
                                                    alignItems:
                                                        'center',
                                                    justifyContent:
                                                        'center',
                                                }}
                                            >
                                                <BookOutlined
                                                    style={{
                                                        fontSize: 36,
                                                        color: '#d4a574',
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </Col>
                                    <Col xs={24} sm={16}>
                                        <Title
                                            level={3}
                                            style={{
                                                marginTop: 0,
                                                marginBottom: 8,
                                            }}
                                        >
                                            {
                                                testResult.test_book
                                                    .title
                                            }
                                        </Title>

                                        {testResult.test_book
                                            .rating && (
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems:
                                                        'center',
                                                    gap: 8,
                                                    marginBottom: 12,
                                                }}
                                            >
                                                <Rate
                                                    disabled
                                                    allowHalf
                                                    value={
                                                        parseFloat(
                                                            testResult
                                                                .test_book
                                                                .rating
                                                        ) / 2
                                                    }
                                                />
                                                <Text strong>
                                                    {
                                                        testResult
                                                            .test_book
                                                            .rating
                                                    }{' '}
                                                    分
                                                </Text>
                                            </div>
                                        )}

                                        <Space
                                            direction="vertical"
                                            size="small"
                                        >
                                            {testResult.test_book
                                                .author && (
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        alignItems:
                                                            'center',
                                                        gap: 8,
                                                    }}
                                                >
                                                    <UserOutlined
                                                        style={{
                                                            color: '#8c7b72',
                                                        }}
                                                    />
                                                    <Text>
                                                        {
                                                            testResult
                                                                .test_book
                                                                .author
                                                        }
                                                    </Text>
                                                </div>
                                            )}
                                            {testResult.test_book
                                                .publisher && (
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        alignItems:
                                                            'center',
                                                        gap: 8,
                                                    }}
                                                >
                                                    <BookOutlined
                                                        style={{
                                                            color: '#8c7b72',
                                                        }}
                                                    />
                                                    <Text type="secondary">
                                                        {
                                                            testResult
                                                                .test_book
                                                                .publisher
                                                        }
                                                    </Text>
                                                </div>
                                            )}
                                        </Space>
                                    </Col>
                                </Row>
                            </div>
                        )}

                    {/* 失败建议 */}
                    {!testResult.cookie_valid && (
                        <div
                            style={{
                                padding: 16,
                                background: '#fef2f2',
                                borderRadius: 8,
                                border: '1px solid #fecaca',
                            }}
                        >
                            <Text
                                strong
                                style={{
                                    color: '#991b1b',
                                    display: 'block',
                                    marginBottom: 8,
                                }}
                            >
                                建议操作：
                            </Text>
                            <ul
                                style={{
                                    margin: 0,
                                    paddingLeft: 20,
                                    color: '#7f1d1d',
                                    lineHeight: 1.8,
                                }}
                            >
                                <li>
                                    检查 Cookie
                                    是否完整复制（是否包含 dbcl2、ck、bid
                                    等字段）
                                </li>
                                <li>
                                    Cookie
                                    可能已过期，请重新登录豆瓣后获取新的
                                    Cookie
                                </li>
                                <li>
                                    尝试在浏览器无痕模式下登录后获取
                                    Cookie
                                </li>
                                <li>检查网络连接是否正常，豆瓣是否可访问</li>
                                <li>
                                    如果持续失败，可使用
                                    <strong>手动录入</strong>
                                    功能添加图书
                                </li>
                            </ul>
                        </div>
                    )}
                </Card>
            )}

            {/* ===== 使用建议 ===== */}
            <Card
                style={{
                    borderRadius: 12,
                    boxShadow: '0 2px 8px rgba(139,69,19,.06)',
                    border: '1px solid #e8d5c8',
                }}
            >
                <Title level={5} style={{ marginTop: 0 }}>
                    <InfoCircleOutlined
                        style={{ marginRight: 8, color: '#3b82f6' }}
                    />
                    使用建议
                </Title>
                <ul
                    style={{
                        color: '#6b5e56',
                        lineHeight: 1.8,
                        paddingLeft: 20,
                        margin: 0,
                    }}
                >
                    <li>
                        Cookie
                        配置保存在服务器本地，不会上传到第三方
                    </li>
                    <li>
                        建议每 1-2 周更新一次 Cookie，避免过期失效
                    </li>
                    <li>
                        同步数据时请合理控制频率，大量请求可能触发豆瓣反爬机制
                    </li>
                    <li>
                        同步失败时可使用
                        <strong>手动录入</strong>功能作为备用方案
                    </li>
                    <li>
                        清除 Cookie 后，系统将自动切换为 OpenLibrary
                        等备用数据源
                    </li>
                </ul>
            </Card>
        </div>
    );
};

export default CookieConfig;
export type { CookieInfo, TestResult };