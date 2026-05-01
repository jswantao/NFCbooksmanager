// frontend/src/pages/BatchImport.tsx
/**
 * 批量导入页面 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 完整的类型定义
 * - 自定义 Hook 封装轮询逻辑
 * - 文件拖拽区域增强
 * - 错误恢复机制
 * - 模板下载增强
 * - 进度可视化优化
 * - 无障碍属性
 */

import React, {
    useState,
    useRef,
    useEffect,
    useCallback,
    useMemo,
    type FC,
} from 'react';
import {
    Card,
    Upload,
    Button,
    Space,
    Typography,
    message,
    Steps,
    Table,
    Tag,
    Progress,
    Alert,
    Result,
    Statistic,
    Row,
    Col,
    Select,
    Switch,
    InputNumber,
    Modal,
    Breadcrumb,
    FloatButton,
    theme,
    Divider,
    Tooltip,
    Descriptions,
    type UploadProps,
    type UploadFile,
    type TableColumnsType,
} from 'antd';
import {
    UploadOutlined,
    FileExcelOutlined,
    InboxOutlined,
    CheckCircleOutlined,
    SyncOutlined,
    DownloadOutlined,
    EyeOutlined,
    DeleteOutlined,
    PlayCircleOutlined,
    FileTextOutlined,
    DatabaseOutlined,
    LoadingOutlined,
    ThunderboltOutlined,
    BookOutlined,
    StopOutlined,
    HomeOutlined,
    ReloadOutlined,
    ExclamationCircleOutlined,
    InfoCircleOutlined,
    QuestionCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    previewImport,
    startImport,
    getImportStatus,
    cancelImportTask,
    downloadImportTemplate,
    listShelves,
    extractErrorMessage,
} from '../services/api';
import { formatFileSize } from '../utils/format';
import type {
    ImportPreview,
    ImportTask,
    ImportTaskResult,
    ImportTaskError,
} from '../types';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

// ==================== 类型定义 ====================

/** 导入流程步骤 */
type StepType = 'upload' | 'preview' | 'importing' | 'complete';

/** 书架选项 */
interface ShelfOption {
    value: number;
    label: string;
}

// ==================== 常量 ====================

const POLL_INTERVAL_MS = 1500;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const VALID_EXTENSIONS = ['csv', 'xlsx', 'xls', 'txt'];
const MAX_POLL_RETRIES = 60; // 最多轮询 60 次（约 90 秒）

const IMPORT_STEPS = [
    { key: 'upload' as const, title: '上传文件', icon: <UploadOutlined /> },
    { key: 'preview' as const, title: '预览确认', icon: <EyeOutlined /> },
    { key: 'importing' as const, title: '正在导入', icon: <SyncOutlined spin /> },
    { key: 'complete' as const, title: '导入完成', icon: <CheckCircleOutlined /> },
];

const STEP_INDEX: Record<StepType, number> = {
    upload: 0,
    preview: 1,
    importing: 2,
    complete: 3,
};

// ==================== 子组件 ====================

/** 导入状态标签 */
const StatusTag: FC<{ status: string; synced?: boolean }> = React.memo(
    ({ status, synced }) => {
        const statusMap: Record<string, { color: string; text: string }> = {
            success: {
                color: 'success',
                text: synced ? '成功(已同步)' : '成功',
            },
            failed: { color: 'error', text: '失败' },
            skipped: { color: 'warning', text: '跳过' },
            pending: { color: 'processing', text: '待处理' },
        };

        const config = statusMap[status] || { color: 'default', text: status };

        return (
            <Tag color={config.color} style={{ borderRadius: 10, margin: 0 }}>
                {config.text}
            </Tag>
        );
    }
);
StatusTag.displayName = 'StatusTag';

/** 统计卡片 */
const StatCard: FC<{
    title: string;
    value: number;
    color?: string;
    icon?: React.ReactNode;
    suffix?: string;
}> = ({ title, value, color, icon, suffix }) => (
    <Col xs={12} sm={6}>
        <Card
            size="small"
            style={{
                textAlign: 'center',
                borderRadius: 10,
                border: color ? `1px solid ${color}30` : undefined,
                background: color ? `${color}08` : undefined,
            }}
        >
            <Statistic
                title={title}
                value={value}
                prefix={icon}
                suffix={suffix ? <Text style={{ fontSize: 12 }}>{suffix}</Text> : undefined}
                styles={{ content: { color: color || undefined, fontSize: 24 } }}
            />
        </Card>
    </Col>
);

// ==================== 自定义 Hook ====================

/**
 * 导入轮询 Hook
 */
const useImportPoll = () => {
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollCountRef = useRef(0);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            stopPoll();
        };
    }, []);

    /** 停止轮询 */
    const stopPoll = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        pollCountRef.current = 0;
    }, []);

    /** 开始轮询 */
    const startPoll = useCallback(
        (
            taskId: string,
            onUpdate: (task: ImportTask) => void,
            onComplete: (task: ImportTask) => void,
            onTimeout: () => void
        ) => {
            stopPoll();

            pollRef.current = setInterval(async () => {
                if (!isMounted.current) return;

                pollCountRef.current++;

                // 超时检查
                if (pollCountRef.current > MAX_POLL_RETRIES) {
                    stopPoll();
                    onTimeout();
                    return;
                }

                try {
                    const task = await getImportStatus(taskId);

                    if (!isMounted.current) return;

                    onUpdate(task);

                    if (
                        ['completed', 'failed', 'cancelled'].includes(task.status)
                    ) {
                        stopPoll();
                        onComplete(task);
                    }
                } catch {
                    // 单次轮询失败不中断，继续重试
                }
            }, POLL_INTERVAL_MS);
        },
        [stopPoll]
    );

    return { startPoll, stopPoll };
};

// ==================== 主组件 ====================

const BatchImport: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();
    const { startPoll, stopPoll } = useImportPoll();

    // ==================== 状态 ====================

    const [step, setStep] = useState<StepType>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [task, setTask] = useState<ImportTask | null>(null);
    const [importing, setImporting] = useState(false);
    const [shelfList, setShelfList] = useState<ShelfOption[]>([]);
    const [targetShelfId, setTargetShelfId] = useState<number | undefined>();
    const [autoSync, setAutoSync] = useState(true);
    const [syncDelay, setSyncDelay] = useState(1.0);
    const [showResults, setShowResults] = useState(false);
    const [showErrors, setShowErrors] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [shelfLoading, setShelfLoading] = useState(false);

    const isMounted = useRef(true);

    // ==================== 生命周期 ====================

    useEffect(() => {
        isMounted.current = true;
        loadShelfList();
        return () => {
            isMounted.current = false;
            stopPoll();
        };
    }, [stopPoll]);

    // ==================== 书架列表 ====================

    const loadShelfList = useCallback(async () => {
        setShelfLoading(true);
        try {
            const data = await listShelves();
            if (isMounted.current) {
                setShelfList([
                    { value: 0, label: '不添加到书架' },
                    ...(data || []).map((s: any) => ({
                        value: s.logical_shelf_id,
                        label: s.shelf_name,
                    })),
                ]);
            }
        } catch {
            // 静默处理
        } finally {
            if (isMounted.current) {
                setShelfLoading(false);
            }
        }
    }, []);

    // ==================== 轮询回调 ====================

    const handlePollUpdate = useCallback((updatedTask: ImportTask) => {
        setTask(updatedTask);
    }, []);

    const handlePollComplete = useCallback(
        (completedTask: ImportTask) => {
            setImporting(false);
            setStep('complete');

            if (completedTask.status === 'completed') {
                message.success({
                    content: `导入完成！成功 ${completedTask.success} 本`,
                    key: 'import-complete',
                });
            } else if (completedTask.status === 'cancelled') {
                message.info('导入已取消');
            } else {
                message.error({
                    content: completedTask.error || '导入失败',
                    key: 'import-error',
                });
            }
        },
        []
    );

    const handlePollTimeout = useCallback(() => {
        stopPoll();
        setImporting(false);
        setStep('preview');
        message.warning('导入超时，请检查任务状态');
    }, [stopPoll]);

    // ==================== 文件上传 ====================

    const uploadFileList: UploadFile[] = useMemo(
        () =>
            file
                ? [
                      {
                          uid: '-1',
                          name: file.name,
                          status: 'done' as const,
                          size: file.size,
                      },
                  ]
                : [],
        [file]
    );

    const uploadProps: UploadProps = useMemo(
        () => ({
            accept: '.xlsx,.xls,.csv,.txt',
            maxCount: 1,
            showUploadList: {
                showRemoveIcon: true,
                showPreviewIcon: false,
            },
            fileList: uploadFileList,
            beforeUpload: (f: File) => {
                const ext = f.name.split('.').pop()?.toLowerCase() || '';

                if (!VALID_EXTENSIONS.includes(ext)) {
                    message.error({
                        content: `不支持的文件格式（.${ext}），请上传 ${VALID_EXTENSIONS.join(', ')} 文件`,
                        key: 'file-error',
                    });
                    return Upload.LIST_IGNORE;
                }

                if (f.size > MAX_FILE_SIZE) {
                    message.error({
                        content: `文件过大（${formatFileSize(f.size)}），最大支持 ${formatFileSize(MAX_FILE_SIZE)}`,
                        key: 'file-error',
                    });
                    return Upload.LIST_IGNORE;
                }

                setFile(f);
                setPreview(null);
                setLoadError(null);
                setStep('upload');
                return false; // 阻止自动上传
            },
            onRemove: () => {
                setFile(null);
                setPreview(null);
                setLoadError(null);
                setStep('upload');
            },
        }),
        [uploadFileList]
    );

    // ==================== 操作处理 ====================

    /** 预览文件 */
    const handlePreview = useCallback(async () => {
        if (!file) return;

        setUploading(true);
        setLoadError(null);

        try {
            const data = await previewImport(file);
            if (isMounted.current) {
                setPreview(data);
                setStep('preview');
                message.success({
                    content: `预览完成，发现 ${data.new_count} 本新书`,
                    key: 'preview-success',
                });
            }
        } catch (err: any) {
            const errorMsg = extractErrorMessage(err) || '文件解析失败';
            if (isMounted.current) {
                setLoadError(errorMsg);
                message.error({
                    content: errorMsg,
                    key: 'preview-error',
                });
            }
        } finally {
            if (isMounted.current) {
                setUploading(false);
            }
        }
    }, [file]);

    /** 开始导入 */
    const handleStart = useCallback(async () => {
        if (!file || !preview || preview.new_count === 0) return;

        setImporting(true);
        setStep('importing');

        try {
            const result = await startImport(file, {
                file,
                auto_sync: autoSync,
                sync_delay: syncDelay,
                shelf_id: targetShelfId && targetShelfId > 0 ? targetShelfId : undefined,
            });

            if (result.task_id) {
                startPoll(
                    result.task_id,
                    handlePollUpdate,
                    handlePollComplete,
                    handlePollTimeout
                );
                message.info({
                    content: `导入任务已启动，共 ${result.total} 本图书`,
                    key: 'import-start',
                });
            }
        } catch (err: any) {
            const errorMsg = extractErrorMessage(err) || '启动导入失败';
            message.error({
                content: errorMsg,
                key: 'import-start-error',
            });
            setImporting(false);
            setStep('preview');
        }
    }, [
        file,
        preview,
        autoSync,
        syncDelay,
        targetShelfId,
        startPoll,
        handlePollUpdate,
        handlePollComplete,
        handlePollTimeout,
    ]);

    /** 取消导入 */
    const handleCancel = useCallback(async () => {
        if (!task?.task_id) return;

        try {
            await cancelImportTask(task.task_id);
            message.info({
                content: '正在取消导入...',
                key: 'import-cancel',
            });
        } catch (err: any) {
            message.error({
                content: extractErrorMessage(err) || '取消失败',
                key: 'import-cancel-error',
            });
        }
    }, [task]);

    /** 下载模板 */
    const handleDownload = useCallback(async () => {
        const hide = message.loading('正在下载模板...', 0);
        try {
            const blob = await downloadImportTemplate();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '图书导入模板.xlsx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            message.success({
                content: '模板下载成功',
                key: 'template-download',
            });
        } catch {
            message.error({
                content: '模板下载失败，请稍后重试',
                key: 'template-download-error',
            });
        } finally {
            hide();
        }
    }, []);

    /** 重置所有状态 */
    const handleReset = useCallback(() => {
        setFile(null);
        setPreview(null);
        setTask(null);
        setStep('upload');
        setImporting(false);
        setLoadError(null);
        stopPoll();
    }, [stopPoll]);

    // ==================== 详情弹窗列定义 ====================

    const resultsColumns: TableColumnsType<ImportTaskResult> = useMemo(
        () => [
            {
                title: '#',
                dataIndex: 'index',
                key: 'index',
                width: 60,
                align: 'center',
            },
            {
                title: 'ISBN',
                dataIndex: 'isbn',
                key: 'isbn',
                width: 160,
                render: (value: string) => (
                    <Text code style={{ fontSize: 12 }}>
                        {value}
                    </Text>
                ),
            },
            {
                title: '书名',
                dataIndex: 'title',
                key: 'title',
                ellipsis: true,
            },
            {
                title: '状态',
                dataIndex: 'status',
                key: 'status',
                width: 140,
                render: (status: string, record: ImportTaskResult) => (
                    <StatusTag status={status} synced={record.synced} />
                ),
            },
            {
                title: '备注',
                dataIndex: 'message',
                key: 'message',
                width: 200,
                ellipsis: true,
            },
        ],
        []
    );

    const errorsColumns: TableColumnsType<ImportTaskError> = useMemo(
        () => [
            {
                title: '#',
                dataIndex: 'index',
                key: 'index',
                width: 60,
                align: 'center',
            },
            {
                title: 'ISBN',
                dataIndex: 'isbn',
                key: 'isbn',
                width: 160,
                render: (value: string) => (
                    <Text code style={{ fontSize: 12 }}>
                        {value}
                    </Text>
                ),
            },
            {
                title: '错误信息',
                dataIndex: 'error',
                key: 'error',
                ellipsis: true,
                render: (error: string) => (
                    <Text type="danger">{error}</Text>
                ),
            },
        ],
        []
    );

    // ==================== 渲染步骤内容 ====================

    /** 渲染上传步骤 */
    const renderUploadStep = () => (
        <Card
            style={{
                marginBottom: 24,
                borderRadius: 12,
                border: `1px solid ${token.colorBorderSecondary}`,
            }}
        >
            {/* 文件要求提示 */}
            <Alert
                title="文件要求"
                description={
                    <ul style={{ paddingLeft: 20, margin: '4px 0' }}>
                        <li>支持格式：.xlsx / .xls / .csv / .txt</li>
                        <li>必须包含 ISBN 列</li>
                        <li>文件大小不超过 {formatFileSize(MAX_FILE_SIZE)}</li>
                        <li>建议使用模板文件以确保格式正确</li>
                    </ul>
                }
                type="info"
                showIcon
                icon={<InfoCircleOutlined />}
                style={{ marginBottom: 16, borderRadius: 8 }}
            />

            {/* 拖拽上传区域 */}
            <Dragger {...uploadProps} style={{ borderRadius: 12 }}>
                <p style={{ fontSize: 56, color: token.colorPrimary, opacity: 0.5 }}>
                    <InboxOutlined />
                </p>
                <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>
                    点击或拖拽文件到此区域
                </p>
                <p style={{ color: token.colorTextSecondary, fontSize: 13 }}>
                    支持 {VALID_EXTENSIONS.map((ext) => `.${ext}`).join(' / ')} 格式
                </p>
            </Dragger>

            {/* 文件信息 */}
            {file && (
                <div
                    style={{
                        padding: 16,
                        background: token.colorInfoBg,
                        borderRadius: 8,
                        marginTop: 16,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 8,
                    }}
                >
                    <Space size={12}>
                        <div
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 8,
                                background: '#eff6ff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <FileExcelOutlined
                                style={{ color: '#3b82f6', fontSize: 20 }}
                            />
                        </div>
                        <div>
                            <Text strong style={{ display: 'block', fontSize: 14 }}>
                                {file.name}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                {formatFileSize(file.size)}
                            </Text>
                        </div>
                    </Space>
                    <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => {
                            setFile(null);
                            setPreview(null);
                            setLoadError(null);
                        }}
                    >
                        移除文件
                    </Button>
                </div>
            )}

            {/* 错误提示 */}
            {loadError && (
                <Alert
                    title="预览失败"
                    description={loadError}
                    type="error"
                    showIcon
                    closable
                    style={{ marginTop: 16, borderRadius: 8 }}
                    onClose={() => setLoadError(null)}
                />
            )}

            {/* 操作按钮 */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 16,
                    flexWrap: 'wrap',
                    gap: 12,
                }}
            >
                <Button
                    icon={<DownloadOutlined />}
                    onClick={handleDownload}
                    size="large"
                >
                    下载导入模板
                </Button>
                <Button
                    type="primary"
                    size="large"
                    icon={<EyeOutlined />}
                    loading={uploading}
                    onClick={handlePreview}
                    disabled={!file}
                >
                    {file ? '预览文件内容' : '请先选择文件'}
                </Button>
            </div>
        </Card>
    );

    /** 渲染预览步骤 */
    const renderPreviewStep = () => {
        if (!preview) return null;

        const statItems = [
            {
                title: '总行数',
                value: preview.total_rows,
                color: token.colorText,
                icon: <FileTextOutlined />,
            },
            {
                title: '新图书',
                value: preview.new_count,
                color: '#3b82f6',
                icon: <BookOutlined style={{ color: '#3b82f6' }} />,
            },
            {
                title: '已存在',
                value: preview.existing_count,
                color: '#f59e0b',
                icon: <ExclamationCircleOutlined style={{ color: '#f59e0b' }} />,
            },
            {
                title: '无效行',
                value: preview.invalid_count,
                color: '#ef4444',
                icon: <StopOutlined style={{ color: '#ef4444' }} />,
            },
        ];

        return (
            <>
                {/* 预览概览 */}
                <Card
                    style={{
                        marginBottom: 24,
                        borderRadius: 12,
                        border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                >
                    <Title level={4} style={{ marginTop: 0 }}>
                        <FileTextOutlined style={{ color: token.colorPrimary, marginRight: 8 }} />
                        {preview.file_name || '文件预览'}
                    </Title>
                    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                        {statItems.map((item, i) => (
                            <StatCard
                                key={i}
                                title={item.title}
                                value={item.value}
                                color={item.color}
                                icon={item.icon}
                            />
                        ))}
                    </Row>
                    {preview.existing_count > 0 && (
                        <Alert
                            title={`${preview.existing_count} 本图书已存在，导入时将自动跳过`}
                            type="warning"
                            showIcon
                            style={{ borderRadius: 8 }}
                        />
                    )}
                    {preview.invalid_count > 0 && (
                        <Alert
                            title={`${preview.invalid_count} 行数据无效，请检查文件内容`}
                            type="error"
                            showIcon
                            style={{ marginTop: 8, borderRadius: 8 }}
                        />
                    )}
                </Card>

                {/* 导入选项 */}
                <Card
                    style={{
                        marginBottom: 24,
                        borderRadius: 12,
                        border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                >
                    <Title level={5} style={{ marginTop: 0 }}>
                        导入选项
                    </Title>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* 自动同步 */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '14px 16px',
                                background: token.colorBgLayout,
                                borderRadius: 10,
                            }}
                        >
                            <Space size={8}>
                                <ThunderboltOutlined style={{ color: '#3b82f6', fontSize: 16 }} />
                                <div>
                                    <Text strong>自动同步豆瓣数据</Text>
                                    <br />
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        导入后自动获取封面、评分等信息
                                    </Text>
                                </div>
                            </Space>
                            <Switch checked={autoSync} onChange={setAutoSync} />
                        </div>

                        {/* 同步延迟 */}
                        {autoSync && (
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '14px 16px',
                                    background: token.colorBgLayout,
                                    borderRadius: 10,
                                }}
                            >
                                <div>
                                    <Text strong>同步请求间隔</Text>
                                    <br />
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        避免请求过快被限制，建议 1-3 秒
                                    </Text>
                                </div>
                                <InputNumber
                                    min={0.5}
                                    max={10}
                                    step={0.5}
                                    value={syncDelay}
                                    onChange={(v) => setSyncDelay(v || 1)}
                                    style={{ width: 120 }}
                                    addonAfter="秒"
                                />
                            </div>
                        )}

                        {/* 目标书架 */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '14px 16px',
                                background: token.colorBgLayout,
                                borderRadius: 10,
                            }}
                        >
                            <Space size={8}>
                                <BookOutlined style={{ color: '#22c55e', fontSize: 16 }} />
                                <div>
                                    <Text strong>添加到书架</Text>
                                    <br />
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        导入后将图书添加到指定书架
                                    </Text>
                                </div>
                            </Space>
                            <Select
                                value={targetShelfId || 0}
                                onChange={(v) =>
                                    setTargetShelfId(v === 0 ? undefined : v)
                                }
                                style={{ width: 200 }}
                                options={shelfList}
                                loading={shelfLoading}
                            />
                        </div>
                    </div>
                </Card>

                {/* 操作按钮 */}
                <Card
                    style={{
                        borderRadius: 12,
                        border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                >
                    <Space size={12} wrap>
                        <Button
                            type="primary"
                            size="large"
                            icon={<PlayCircleOutlined />}
                            onClick={handleStart}
                            disabled={preview.new_count === 0}
                            loading={importing}
                        >
                            {preview.new_count > 0
                                ? `开始导入 (${preview.new_count} 本)`
                                : '无新书可导入'}
                        </Button>
                        <Button
                            size="large"
                            icon={<EyeOutlined />}
                            onClick={() => setStep('upload')}
                        >
                            返回重选
                        </Button>
                        <Button size="large" onClick={handleReset}>
                            取消
                        </Button>
                    </Space>
                </Card>
            </>
        );
    };

    /** 渲染导入步骤 */
    const renderImportingStep = () => {
        if (!task) return null;

        const isCancelled = task.status === 'cancelled';
        const isActive = task.status === 'running';

        return (
            <Card
                style={{
                    borderRadius: 12,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    textAlign: 'center',
                    padding: 40,
                }}
            >
                {/* 状态图标 */}
                <div style={{ marginBottom: 16 }}>
                    {isCancelled ? (
                        <StopOutlined
                            style={{ fontSize: 72, color: '#f59e0b' }}
                        />
                    ) : (
                        <LoadingOutlined
                            style={{ fontSize: 72, color: '#3b82f6' }}
                            spin
                        />
                    )}
                </div>

                {/* 标题 */}
                <Title level={3} style={{ marginBottom: 16 }}>
                    {isCancelled ? '导入已取消' : '正在导入...'}
                </Title>

                {/* 进度条 */}
                <div style={{ maxWidth: 500, margin: '0 auto 24px' }}>
                    <Progress
                        percent={task.progress}
                        status={isCancelled ? 'exception' : isActive ? 'active' : 'normal'}
                        strokeColor={
                            isCancelled
                                ? '#f59e0b'
                                : {
                                      '0%': token.colorPrimary,
                                      '100%': '#22c55e',
                                  }
                        }
                    />
                </div>

                {/* 统计 */}
                <Row gutter={16} justify="center" style={{ marginBottom: 24 }}>
                    <Col span={6}>
                        <Statistic title="总计" value={task.total} />
                    </Col>
                    <Col span={6}>
                        <Statistic
                            title="成功"
                            value={task.success}
                            styles={{ content: { color: '#22c55e' } }}
                        />
                    </Col>
                    <Col span={6}>
                        <Statistic
                            title="跳过"
                            value={task.skipped || 0}
                            styles={{ content: { color: '#f59e0b' } }}
                        />
                    </Col>
                    <Col span={6}>
                        <Statistic
                            title="失败"
                            value={task.failed}
                            styles={{ content: { color: '#ef4444' } }}
                        />
                    </Col>
                </Row>

                {/* 实时信息 */}
                {task.results && task.results.length > 0 && (
                    <div style={{ textAlign: 'left', maxHeight: 200, overflow: 'auto', marginBottom: 16 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                            最新进度：
                        </Text>
                        {task.results.slice(-5).reverse().map((result, i) => (
                            <div
                                key={i}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '4px 0',
                                    fontSize: 12,
                                }}
                            >
                                <StatusTag status={result.status} />
                                <Text code style={{ fontSize: 11 }}>
                                    {result.isbn}
                                </Text>
                                <Text ellipsis style={{ flex: 1 }}>
                                    {result.title || '获取中...'}
                                </Text>
                            </div>
                        ))}
                    </div>
                )}

                {/* 取消按钮 */}
                {isActive && (
                    <Button
                        danger
                        size="large"
                        icon={<StopOutlined />}
                        onClick={handleCancel}
                    >
                        取消导入
                    </Button>
                )}
            </Card>
        );
    };

    /** 渲染完成步骤 */
    const renderCompleteStep = () => {
        if (!task) return null;

        const statusConfig = {
            completed: {
                status: 'success' as const,
                title: '导入完成！',
                color: '#22c55e',
            },
            cancelled: {
                status: 'warning' as const,
                title: '已取消',
                color: '#f59e0b',
            },
            failed: {
                status: 'error' as const,
                title: '导入失败',
                color: '#ef4444',
            },
        };

        const config = statusConfig[task.status] || statusConfig.failed;

        const subTitle =
            task.status === 'completed'
                ? `成功导入 ${task.success} 本，跳过 ${task.skipped || 0} 本，失败 ${task.failed} 本`
                : task.error || '发生未知错误';

        const extraButtons = [
            <Button
                key="view"
                type="primary"
                icon={<BookOutlined />}
                onClick={() =>
                    navigate(
                        targetShelfId
                            ? `/shelf/${targetShelfId}`
                            : '/wall'
                    )
                }
            >
                {targetShelfId ? '查看书架' : '进入封面墙'}
            </Button>,
            <Button
                key="continue"
                icon={<ReloadOutlined />}
                onClick={handleReset}
            >
                继续导入
            </Button>,
        ];

        if (task.results && task.results.length > 0) {
            extraButtons.push(
                <Button
                    key="results"
                    icon={<EyeOutlined />}
                    onClick={() => setShowResults(true)}
                >
                    查看详情 ({task.results.length})
                </Button>
            );
        }

        if (task.errors && task.errors.length > 0) {
            extraButtons.push(
                <Button
                    key="errors"
                    danger
                    icon={<ExclamationCircleOutlined />}
                    onClick={() => setShowErrors(true)}
                >
                    查看错误 ({task.errors.length})
                </Button>
            );
        }

        return (
            <>
                <Card
                    style={{
                        borderRadius: 12,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        marginBottom: 24,
                    }}
                >
                    <Result
                        status={config.status}
                        title={config.title}
                        subTitle={subTitle}
                        extra={extraButtons}
                    />
                </Card>

                {/* 详情弹窗 */}
                <Modal
                    title="导入详细结果"
                    open={showResults}
                    onCancel={() => setShowResults(false)}
                    footer={null}
                    width={900}
                    destroyOnHidden
                >
                    <Table<ImportTaskResult>
                        dataSource={task.results || []}
                        columns={resultsColumns}
                        rowKey="index"
                        size="small"
                        pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
                        scroll={{ y: 400 }}
                    />
                </Modal>

                {/* 错误弹窗 */}
                <Modal
                    title="导入错误详情"
                    open={showErrors}
                    onCancel={() => setShowErrors(false)}
                    footer={null}
                    width={700}
                    destroyOnHidden
                >
                    <Alert
                        title={`共 ${task.errors?.length || 0} 条错误`}
                        type="warning"
                        showIcon
                        style={{ marginBottom: 16, borderRadius: 8 }}
                    />
                    <Table<ImportTaskError>
                        dataSource={task.errors || []}
                        columns={errorsColumns}
                        rowKey="index"
                        size="small"
                        pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
                        scroll={{ y: 400 }}
                    />
                </Modal>
            </>
        );
    };

    // ==================== 渲染页面 ====================

    const stepContentMap: Record<StepType, () => React.ReactNode> = {
        upload: renderUploadStep,
        preview: () =>
            preview ? renderPreviewStep() : renderUploadStep(),
        importing: () =>
            task ? renderImportingStep() : renderUploadStep(),
        complete: () =>
            task ? renderCompleteStep() : renderUploadStep(),
    };

    return (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
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
                                <DatabaseOutlined /> 批量导入
                            </span>
                        ),
                    },
                ]}
            />

            {/* 标题 */}
            <Title level={2} style={{ marginBottom: 24 }}>
                <DatabaseOutlined
                    style={{ marginRight: 12, color: token.colorPrimary }}
                />
                批量导入图书
            </Title>

            {/* 步骤条 */}
            <Card style={{ marginBottom: 24, borderRadius: 12 }}>
                <Steps
                    current={STEP_INDEX[step]}
                    items={IMPORT_STEPS.map((s) => ({
                        title: s.title,
                        icon: s.key === 'importing' && step === 'importing' ? (
                            <SyncOutlined spin />
                        ) : (
                            s.icon
                        ),
                    }))}
                    size="small"
                />
            </Card>

            {/* 步骤内容 */}
            {stepContentMap[step]()}

            {/* 回到顶部 */}
            <FloatButton.BackTop
                visibilityHeight={400}
                style={{ right: 40, bottom: 40 }}
            />
        </div>
    );
};

export default BatchImport;