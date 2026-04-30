// frontend/src/pages/NFCReader.tsx
/**
 * NFC 标签读取页面（外模式入口）
 * 
 * 实现需求说明书中的 NFC 标签读取功能。
 * 
 * 功能：
 * 1. 手动输入模式：输入标签 UID 和 JSON 内容进行解析
 * 2. 手机桥接模式：轮询等待手机端 NFC 扫描结果
 * 3. 示例数据：快速填充测试数据
 * 4. 映射解析：读取成功后自动查找对应的逻辑书架
 * 
 * 数据流：
 * NFC 标签 → 读取 UID + JSON → POST /api/nfc/read-tag
 * → 解析 location_code → 查询映射 → 展示逻辑书架信息
 * 
 * 手机桥接原理：
 * - 手机通过 NFC TOOLS PRO 扫描标签
 * - 回调 URL 将数据发送到后端 /api/nfc/callback
 * - 前端定时轮询 /api/nfc/bridge/latest-results 获取结果
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
    Card,
    Input,
    Button,
    Space,
    message,
    Alert,
    Descriptions,
    Tag,
    Typography,
    Breadcrumb,
    Spin,
    Collapse,
    Tooltip,
    Row,
    Col,
    notification,
    Badge,
} from 'antd';
import {
    ScanOutlined,
    LinkOutlined,
    HomeOutlined,
    CheckCircleOutlined,
    ExclamationCircleOutlined,
    LoadingOutlined,
    ClearOutlined,
    ExperimentOutlined,
    InfoCircleOutlined,
    BookOutlined,
    EnvironmentOutlined,
    NumberOutlined,
    TagOutlined,
    WifiOutlined,
    MobileOutlined,
    SyncOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { readNFCTag } from '../services/api';
import type { NFCReadResult } from '../types';

// ---- 常量 ----

const { TextArea } = Input;
const { Title, Text } = Typography;

/** 测试用 NFC 数据 */
const TEST_DATA = {
    tagUid: '04:A1:B2:C3:D4:01',
    rawPayload: '{"version":"1.0","location_code":"study-left-1","location_name":"书房-左侧-第1层"}',
};

/** 示例标签数据（快速填充） */
const SAMPLE_TAGS = [
    {
        label: '书房-左侧-第1层',
        tagUid: '04:A1:B2:C3:D4:01',
        rawPayload: '{"version":"1.0","location_code":"study-left-1","location_name":"书房-左侧-第1层"}',
    },
    {
        label: '书房-右侧-第2层',
        tagUid: '04:A1:B2:C3:D4:02',
        rawPayload: '{"version":"1.0","location_code":"study-right-2","location_name":"书房-右侧-第2层"}',
    },
];

/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 3000;

// ---- 主组件 ----

const NFCReader: React.FC = () => {
    const navigate = useNavigate();

    // ==================== 状态 ====================

    const [tagUid, setTagUid] = useState('');
    const [payload, setPayload] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isResolving, setIsResolving] = useState(false);
    const [result, setResult] = useState<NFCReadResult | null>(null);
    const [mappingResult, setMappingResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPolling, setIsPolling] = useState(false);

    /** 轮询定时器引用 */
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ==================== 清理 ====================

    useEffect(() => {
        return () => {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        };
    }, []);

    // ==================== 手机桥接 ====================

    /** 开始轮询手机端 NFC 扫描结果 */
    const startPolling = useCallback(() => {
        if (pollTimerRef.current) return;

        setIsPolling(true);
        pollTimerRef.current = setInterval(async () => {
            try {
                const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
                const response = await fetch(`${apiBase}/api/nfc/bridge/latest-results?limit=1`);
                const data = await response.json();

                if (data.length > 0 && data[0].result.valid && data[0].result.shelf_url) {
                    stopPolling();
                    notification.success({
                        message: '📱 NFC 标签已读取',
                        description: `已定位到书架「${data[0].result.logical_shelf_name}」`,
                    });
                    setTimeout(() => navigate(data[0].result.shelf_url), 1500);
                }
            } catch {
                // 轮询失败不中断
            }
        }, POLL_INTERVAL_MS);
    }, [navigate]);

    /** 停止轮询 */
    const stopPolling = useCallback(() => {
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
        setIsPolling(false);
    }, []);

    // ==================== 标签读取 ====================

    /**
     * 读取并解析 NFC 标签数据
     * 
     * 处理流程：
     * 1. 校验输入（UID 和 payload 均不能为空）
     * 2. 验证 JSON 格式
     * 3. 调用 API 解析
     * 4. 成功 → 查找映射关系 → 导航到书架
     * 5. 失败 → 展示错误信息
     */
    const handleReadTag = useCallback(async () => {
        // 输入校验
        if (!tagUid.trim() || !payload.trim()) {
            message.warning('请输入标签 UID 和内容');
            return;
        }

        // JSON 格式校验
        try {
            JSON.parse(payload);
        } catch {
            message.warning('标签内容不是有效的 JSON 格式');
            return;
        }

        setIsLoading(true);
        setError(null);
        setResult(null);
        setMappingResult(null);

        try {
            const readResult = await readNFCTag(tagUid.trim(), payload.trim());
            setResult(readResult);

            if (readResult.valid && readResult.location_code) {
                // 有效标签：尝试解析映射
                setIsResolving(true);
                try {
                    // 映射解析由后端 /api/nfc/read-tag 自动完成
                    // 此处展示结果
                    message.success(`已定位到对应书架`);
                    
                    // 自动跳转到书架（2.5 秒后）
                    setTimeout(() => {
                        // 根据返回的映射信息导航
                        if (mappingResult?.logical_shelf_id) {
                            navigate(`/shelf/${mappingResult.logical_shelf_id}`);
                        }
                    }, 2500);
                } catch (mappingError: any) {
                    message.warning(mappingError?.response?.data?.detail || '映射关系不存在');
                } finally {
                    setIsResolving(false);
                }
            } else {
                message.error('标签数据无效或格式错误');
            }
        } catch (readError: any) {
            setError(readError?.response?.data?.detail || readError?.userMessage || '标签读取失败');
        } finally {
            setIsLoading(false);
        }
    }, [tagUid, payload, mappingResult, navigate]);

    // ==================== 衍生数据 ====================

    /** JSON 格式是否有效 */
    const isJsonValid = useMemo(() => {
        if (!payload.trim()) return true;
        try {
            JSON.parse(payload);
            return true;
        } catch {
            return false;
        }
    }, [payload]);

    // ==================== 渲染 ====================

    return (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
            {/* 面包屑 */}
            <Breadcrumb
                style={{ marginBottom: 16 }}
                items={[
                    { title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> },
                    { title: 'NFC 读取' },
                ]}
            />

            {/* 页面标题 */}
            <Title level={2} style={{ marginBottom: 24 }}>
                <ScanOutlined style={{ color: '#8B4513', marginRight: 12 }} />
                NFC 标签读取
            </Title>

            {/* 手机桥接 */}
            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 12,
                    border: '1px solid #e8d5c8',
                    background: '#fafaf9',
                }}
                title={
                    <Space>
                        <WifiOutlined style={{ color: isPolling ? '#22c55e' : '#8c7b72' }} />
                        手机桥接
                        <Badge
                            status={isPolling ? 'processing' : 'default'}
                            text={isPolling ? '监听中' : '已停止'}
                        />
                    </Space>
                }
                extra={
                    <Button
                        type={isPolling ? 'default' : 'primary'}
                        size="small"
                        danger={isPolling}
                        icon={isPolling ? <ClearOutlined /> : <SyncOutlined />}
                        onClick={() => (isPolling ? stopPolling() : startPolling())}
                    >
                        {isPolling ? '停止监听' : '开始监听'}
                    </Button>
                }
            >
                <Text type="secondary">
                    {isPolling
                        ? '等待手机端 NFC 扫描数据...（保持此页面打开）'
                        : '点击「开始监听」后，使用手机扫描 NFC 标签即可自动跳转'}
                </Text>
            </Card>

            {/* 手动输入区 */}
            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 12,
                    border: '1px solid #e8d5c8',
                }}
            >
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                    {/* 标签 UID */}
                    <div>
                        <label style={{ fontWeight: 500, display: 'block', marginBottom: 4 }}>
                            <NumberOutlined style={{ color: '#8c7b72', marginRight: 6 }} />
                            标签 UID
                        </label>
                        <Input
                            value={tagUid}
                            onChange={(e) => setTagUid(e.target.value)}
                            size="large"
                            placeholder="04:A1:B2:C3:D4:01"
                            style={{ borderRadius: 8, fontFamily: 'monospace' }}
                            allowClear
                        />
                    </div>

                    {/* 标签内容 */}
                    <div>
                        <label style={{ fontWeight: 500, display: 'block', marginBottom: 4 }}>
                            <TagOutlined style={{ color: '#8c7b72', marginRight: 6 }} />
                            标签内容（JSON）
                            {!isJsonValid && (
                                <Tag color="error" style={{ marginLeft: 8, fontSize: 11 }}>
                                    JSON 格式错误
                                </Tag>
                            )}
                        </label>
                        <TextArea
                            rows={5}
                            value={payload}
                            onChange={(e) => setPayload(e.target.value)}
                            placeholder='{"version":"1.0","location_code":"study-left-1","location_name":"书房-左侧-第1层"}'
                            style={{
                                borderRadius: 8,
                                fontFamily: 'monospace',
                                borderColor: !isJsonValid ? '#ef4444' : undefined,
                            }}
                        />
                    </div>

                    {/* 操作按钮 */}
                    <Space>
                        <Button
                            type="primary"
                            icon={isLoading ? <LoadingOutlined /> : <LinkOutlined />}
                            loading={isLoading}
                            onClick={handleReadTag}
                            size="large"
                            style={{ borderRadius: 8 }}
                        >
                            读取并解析标签
                        </Button>
                        <Button
                            icon={<ClearOutlined />}
                            onClick={() => {
                                setTagUid('');
                                setPayload('');
                                setResult(null);
                                setMappingResult(null);
                                setError(null);
                            }}
                            size="large"
                            disabled={isLoading}
                        >
                            清空
                        </Button>
                    </Space>
                </Space>
            </Card>

            {/* 示例数据 */}
            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 12,
                    border: '1px solid #e8d5c8',
                }}
                title="示例标签数据"
            >
                <Row gutter={[12, 12]}>
                    {SAMPLE_TAGS.map((sample, index) => (
                        <Col xs={24} sm={12} key={index}>
                            <Card
                                size="small"
                                hoverable
                                onClick={() => {
                                    setTagUid(sample.tagUid);
                                    setPayload(sample.rawPayload);
                                }}
                                style={{
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                }}
                            >
                                <EnvironmentOutlined style={{ color: '#8B4513', marginBottom: 4 }} />
                                <br />
                                <Text strong>{sample.label}</Text>
                            </Card>
                        </Col>
                    ))}
                </Row>
            </Card>

            {/* 加载中 */}
            {isLoading && (
                <Card style={{ borderRadius: 12, textAlign: 'center', padding: 40 }}>
                    <Spin size="large" />
                    <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                        正在读取和解析标签...
                    </Text>
                </Card>
            )}

            {/* 错误提示 */}
            {error && (
                <Alert
                    message="读取失败"
                    description={error}
                    type="error"
                    showIcon
                    closable
                    style={{ marginBottom: 24, borderRadius: 8 }}
                    action={
                        <Button size="small" onClick={handleReadTag}>
                            重试
                        </Button>
                    }
                />
            )}

            {/* 读取结果 */}
            {result && (
                <Card
                    style={{
                        borderRadius: 12,
                        border: `1px solid ${result.valid ? '#d1fae5' : '#fecaca'}`,
                        borderLeft: `4px solid ${result.valid ? '#22c55e' : '#ef4444'}`,
                        marginBottom: 24,
                    }}
                    title={
                        <Space>
                            {result.valid ? (
                                <CheckCircleOutlined style={{ color: '#22c55e' }} />
                            ) : (
                                <ExclamationCircleOutlined style={{ color: '#ef4444' }} />
                            )}
                            <Tag color={result.valid ? 'success' : 'error'}>
                                {result.valid ? '标签有效' : '标签无效'}
                            </Tag>
                        </Space>
                    }
                >
                    <Descriptions bordered size="middle" column={{ xs: 1, sm: 2 }}>
                        <Descriptions.Item label="UID">
                            <Text code>{result.tag_uid}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="原始数据">
                            <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>
                                {result.raw_payload}
                            </Text>
                        </Descriptions.Item>
                        {result.valid && (
                            <>
                                <Descriptions.Item label="位置编码">
                                    <Tag color="blue">{result.location_code}</Tag>
                                </Descriptions.Item>
                                <Descriptions.Item label="位置名称">
                                    {result.location_name}
                                </Descriptions.Item>
                            </>
                        )}
                    </Descriptions>

                    {/* 映射结果 */}
                    {isResolving && (
                        <div style={{ marginTop: 16, textAlign: 'center' }}>
                            <Spin size="small" />
                            <Text type="secondary" style={{ marginLeft: 8 }}>
                                正在查找映射关系...
                            </Text>
                        </div>
                    )}

                    {mappingResult && (
                        <div
                            style={{
                                marginTop: 16,
                                padding: 16,
                                background: '#f0fdf4',
                                borderRadius: 8,
                                border: '1px solid #bbf7d0',
                            }}
                        >
                            <Text strong style={{ color: '#166534' }}>
                                <LinkOutlined /> 映射成功：{mappingResult.logical_shelf_name}
                            </Text>
                            <br />
                            <Button
                                type="primary"
                                icon={<BookOutlined />}
                                onClick={() => navigate(`/shelf/${mappingResult.logical_shelf_id}`)}
                                style={{ marginTop: 8 }}
                            >
                                查看书架
                            </Button>
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
};

export default NFCReader;