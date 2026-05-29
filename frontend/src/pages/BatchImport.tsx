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
    App,
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
    Input,
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
    UploadOutlined, FileExcelOutlined, InboxOutlined, CheckCircleOutlined,
    SyncOutlined, DownloadOutlined, EyeOutlined, DeleteOutlined, PlayCircleOutlined,
    FileTextOutlined, DatabaseOutlined, LoadingOutlined, ThunderboltOutlined,
    BookOutlined, StopOutlined, HomeOutlined, ReloadOutlined,
    ExclamationCircleOutlined, InfoCircleOutlined, QuestionCircleOutlined,
    BulbOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    previewImport,
    startImport,
    getImportStatus,
    cancelImportTask,
    previewNedbImport,
    startNedbImport,
    downloadImportTemplate,
    listShelves,
    extractErrorMessage,
} from '../services/api';
import { usePolling } from '../hooks/usePolling';
import { useImportPoll } from '../hooks/useImportPoll';
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
const VALID_EXTENSIONS = ['csv', 'xlsx', 'xls', 'txt', 'db'];
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
            updated: { color: 'processing', text: synced ? '已更新(已同步)' : '已更新' },
            merged: { color: 'processing', text: '已合并' },
            kept: { color: 'default', text: '保留' },
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

// ==================== 主组件 ====================

const BatchImport: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();
    const { message } = App.useApp();
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
    // 重复处理方案（非 NeDB 导入）
    const [duplicateResolution, setDuplicateResolution] = useState<'skip' | 'update' | 'keep'>('skip');

    // NeDB 特有状态
    const [coverPath, setCoverPath] = useState('');
    const [duplicateResolutions, setDuplicateResolutions] = useState<Record<string, 'merge' | 'keep' | 'skip'>>({});
    const [nedbPreview, setNedbPreview] = useState<any>(null);

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
                const parts: string[] = [];
                if (completedTask.success > 0) parts.push(`成功 ${completedTask.success} 本`);
                if (completedTask.skipped && completedTask.skipped > 0) parts.push(`跳过 ${completedTask.skipped} 本`);
                if (completedTask.failed > 0) parts.push(`失败 ${completedTask.failed} 本`);
                message.success({
                    content: `导入完成！${parts.join('，')}`,
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
            accept: '.xlsx,.xls,.csv,.txt,.db',
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

        const isNedb = file.name.toLowerCase().endsWith('.db');

        try {
            if (isNedb) {
                const data = await previewNedbImport(file);
                if (isMounted.current) {
                    // 补齐字段以兼容 ImportPreview 渲染（NeDB 数据缺少 total_rows/file_name 等）
                    setPreview({
                        ...data,
                        total_rows: data.total,
                        file_name: file.name,
                        file_size: file.size,
                        isbn_column: 'N/A',
                        duplicate_count: data.duplicate_count || 0,
                    } as any);
                    setNedbPreview(data);
                    // 默认所有重复项选择
                    const resolutions: Record<string, 'merge' | 'keep' | 'skip'> = {};
                    (data.duplicate_items || []).forEach((item: any) => {
                        resolutions[item.isbn] = 'merge';
                    });
                    setDuplicateResolutions(resolutions);
                    setStep('preview');
                    message.success({
                        content: `预览完成，${data.new_count} 新书 + ${data.existing_count} 重复`,
                        key: 'preview-success',
                    });
                }
            } else {
                const data = await previewImport(file);
                if (isMounted.current) {
                    setPreview(data);
                    setNedbPreview(null);
                    setStep('preview');
                    message.success({
                        content: `预览完成，发现 ${data.new_count} 本新书`,
                        key: 'preview-success',
                    });
                }
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
        // 检查是否有有效 ISBN（新增+重复 > 0）
        if (!file || !preview) return;
        const totalValid = (preview.new_count || 0) + (preview.existing_count || 0);
        if (totalValid === 0) {
            message.warning('文件中没有有效的 ISBN 数据');
            return;
        }

        setImporting(true);
        setStep('importing');

        const isNedb = file.name.toLowerCase().endsWith('.db');

        try {
            const result = isNedb
                ? await startNedbImport(file, {
                    cover_path: coverPath || undefined,
                    shelf_id: targetShelfId && targetShelfId > 0 ? targetShelfId : undefined,
                    duplicate_resolution: duplicateResolutions,
                })
                : await startImport(file, {
                    file,
                    auto_sync: autoSync,
                    sync_delay: syncDelay,
                    shelf_id: targetShelfId && targetShelfId > 0 ? targetShelfId : undefined,
                    duplicate_resolution: duplicateResolution,
                });

            if (result.task_id) {
                startPoll(
                    result.task_id,
                    handlePollUpdate,
                    handlePollComplete,
                    handlePollTimeout
                );
                const resText = duplicateResolution === 'skip' ? '（将跳过重复）'
                    : duplicateResolution === 'update' ? '（将更新重复）'
                    : '（将为重复创建副本）';
                message.info({
                    content: `导入任务已启动，共 ${result.total} 本图书${resText}`,
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
        coverPath,
        duplicateResolutions,
        duplicateResolution,
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
                        <li>支持格式：.xlsx / .xls / .csv / .txt / .db (NeDB)</li>
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
                    支持 {VALID_EXTENSIONS.map((ext) => `.${ext}`).join(' / ')} 格式 · 也支持 Ctrl+V 粘贴
                </p>
                <div style={{ marginTop: 10 }}>
                    <Space wrap size={4}>
                        <Tag color="green">Excel (.xlsx/.xls)</Tag>
                        <Tag color="blue">CSV (.csv)</Tag>
                        <Tag color="purple">TXT (.txt)</Tag>
                        <Tag color="cyan">NeDB (.db)</Tag>
                    </Space>
                </div>
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
                                background: 'var(--color-accent-blue-bg)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <FileExcelOutlined
                                style={{ color: 'var(--color-accent-blue)', fontSize: 20 }}
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

    // 快速提示卡片
    const renderQuickTips = () => (
        <Card size="small" title={<Space><BulbOutlined style={{ color: 'var(--color-accent-amber)' }} />导入提示</Space>}
            style={{ marginBottom: 24, borderRadius: 12, border: `1px solid ${token.colorBorderSecondary}` }}>
            <Row gutter={[24, 8]}>
                <Col xs={24} md={8}>
                    <Text strong style={{ fontSize: 13 }}>📋 准备文件</Text>
                    <br /><Text type="secondary" style={{ fontSize: 12 }}>下载模板 → 填入ISBN和书名 → 保存为 .xlsx/.csv</Text>
                </Col>
                <Col xs={24} md={8}>
                    <Text strong style={{ fontSize: 13 }}>✅ 数据校验</Text>
                    <br /><Text type="secondary" style={{ fontSize: 12 }}>系统自动校验ISBN格式，无效行标红提示，可在预览中修正</Text>
                </Col>
                <Col xs={24} md={8}>
                    <Text strong style={{ fontSize: 13 }}>🔄 自动同步</Text>
                    <br /><Text type="secondary" style={{ fontSize: 12 }}>导入后可选自动从豆瓣获取封面、评分等完整信息</Text>
                </Col>
            </Row>
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
                color: 'var(--color-accent-blue)',
                icon: <BookOutlined style={{ color: 'var(--color-accent-blue)' }} />,
            },
            {
                title: '已存在',
                value: preview.existing_count,
                color: 'var(--color-accent-amber)',
                icon: <ExclamationCircleOutlined style={{ color: 'var(--color-accent-amber)' }} />,
            },
            {
                title: '无效行',
                value: preview.invalid_count,
                color: 'var(--color-danger)',
                icon: <StopOutlined style={{ color: 'var(--color-danger)' }} />,
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
                    {preview.existing_count > 0 && preview.new_count === 0 && (
                        <Alert
                            title={`所有 ${preview.existing_count} 本图书均已存在，请选择处理方案后继续导入`}
                            type="warning"
                            showIcon
                            style={{ borderRadius: 8 }}
                        />
                    )}
                    {preview.existing_count > 0 && preview.new_count > 0 && (
                        <Alert
                            title={
                                `检测到 ${preview.existing_count} 本重复图书（共 ${preview.total_rows} 本），` +
                                `将按选定方案处理：` +
                                (duplicateResolution === 'skip' ? '跳过重复，仅导入新书' :
                                 duplicateResolution === 'update' ? '更新已存在的图书信息' :
                                 '为重复图书创建副本')
                            }
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
                        {/* 自动同步 (非 NeDB 导入时显示) */}
                        {!file?.name?.toLowerCase().endsWith('.db') && (
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
                                    <ThunderboltOutlined style={{ color: 'var(--color-accent-blue)', fontSize: 16 }} />
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
                        )}
                        {/* 同步延迟 (非 NeDB + 启用同步时显示) */}
                        {!file?.name?.toLowerCase().endsWith('.db') && autoSync && (
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

                        {/* 重复 ISBN 处理方案 (非 NeDB + 有重复时显示) */}
                        {!file?.name?.toLowerCase().endsWith('.db') && preview.existing_count > 0 && (
                            <div
                                style={{
                                    flexDirection: 'column',
                                    padding: '14px 16px',
                                    background: token.colorBgLayout,
                                    borderRadius: 10,
                                    gap: 8,
                                    display: 'flex',
                                }}
                            >
                                <Space size={8}>
                                    <ExclamationCircleOutlined style={{ color: 'var(--color-accent-amber)', fontSize: 16 }} />
                                    <div>
                                        <Text strong>重复 ISBN 处理方案</Text>
                                        <br />
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            检测到 {preview.existing_count} 本已存在的图书，请选择处理方式
                                        </Text>
                                    </div>
                                </Space>
                                <Select
                                    value={duplicateResolution}
                                    onChange={(v) => setDuplicateResolution(v)}
                                    style={{ width: '100%' }}
                                    options={[
                                        {
                                            value: 'skip',
                                            label: '跳过重复 — 仅导入新书，已存在的跳过',
                                        },
                                        {
                                            value: 'update',
                                            label: '覆盖更新 — 用豆瓣数据更新已存在图书的信息',
                                        },
                                        {
                                            value: 'keep',
                                            label: '保留两者 — 为重复图书创建副本（标题加"（副本）"后缀）',
                                        },
                                    ]}
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
                                <BookOutlined style={{ color: 'var(--color-accent-green)', fontSize: 16 }} />
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

                {/* NeDB: 封面目录 */}
                {file?.name?.toLowerCase().endsWith('.db') && (
                    <Card
                        style={{
                            marginBottom: 24,
                            borderRadius: 12,
                            border: `1px solid ${token.colorBorderSecondary}`,
                        }}
                    >
                        <Title level={5} style={{ marginTop: 0 }}>
                            <FileTextOutlined style={{ marginRight: 8 }} />
                            封面图片目录（可选）
                        </Title>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                            指定 ManageBooksMac 封面文件夹路径，系统将从中复制封面图片
                        </Text>
                        <Input
                            placeholder="如 D:/ManageBooks/covers"
                            value={coverPath}
                            onChange={(e) => setCoverPath(e.target.value)}
                            style={{ maxWidth: 400 }}
                            allowClear
                        />
                    </Card>
                )}

                {/* NeDB: 重复 ISBN 决策 */}
                {nedbPreview?.duplicate_items?.length > 0 && (
                    <Card
                        style={{
                            marginBottom: 24,
                            borderRadius: 12,
                            border: `1px solid ${token.colorWarningBorder}`,
                            background: token.colorWarningBg,
                        }}
                    >
                        <Title level={5} style={{ marginTop: 0 }}>
                            <ExclamationCircleOutlined style={{ marginRight: 8, color: token.colorWarning }} />
                            重复 ISBN 处理 ({nedbPreview.duplicate_items.length} 条)
                        </Title>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                            以下 ISBN 已存在于馆藏中，请逐条选择：<strong>合并</strong>（填充空缺字段）、<strong>保留</strong>（保持馆藏不动）或<strong>跳过</strong>（不导入）
                        </Text>
                        <div style={{ maxHeight: 300, overflow: 'auto' }}>
                            <Table
                                dataSource={nedbPreview.duplicate_items}
                                rowKey="isbn"
                                size="small"
                                pagination={false}
                                columns={[
                                    {
                                        title: 'ISBN',
                                        dataIndex: 'isbn',
                                        width: 130,
                                        ellipsis: true,
                                    },
                                    {
                                        title: 'NeDB 书名',
                                        dataIndex: 'nedb_title',
                                        width: 160,
                                        ellipsis: true,
                                    },
                                    {
                                        title: '馆藏书名',
                                        dataIndex: 'existing_title',
                                        width: 160,
                                        ellipsis: true,
                                    },
                                    {
                                        title: '操作',
                                        width: 120,
                                        render: (_: any, record: any) => (
                                            <Select
                                                value={duplicateResolutions[record.isbn] || 'keep'}
                                                onChange={(v) =>
                                                    setDuplicateResolutions((prev) => ({
                                                        ...prev,
                                                        [record.isbn]: v as 'merge' | 'keep' | 'skip',
                                                    }))
                                                }
                                                style={{ width: 100 }}
                                                options={[
                                                    { value: 'merge', label: '合并' },
                                                    { value: 'keep', label: '保留' },
                                                    { value: 'skip', label: '跳过' },
                                                ]}
                                            />
                                        ),
                                    },
                                ]}
                            />
                        </div>
                    </Card>
                )}

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
                            disabled={
                                importing ||
                                ((preview.new_count || 0) + (preview.existing_count || 0) === 0)
                            }
                            loading={importing}
                        >
                            {(() => {
                                const n = preview.new_count || 0;
                                const e = preview.existing_count || 0;
                                const total = n + e;
                                if (total === 0) return '无有效数据可导入';
                                if (n === 0 && e > 0) return `处理 ${e} 本重复图书`;
                                if (e > 0) return `开始导入 (${n} 本新 + ${e} 本重复)`;
                                return `开始导入 (${n} 本)`;
                            })()}
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
                            style={{ fontSize: 72, color: 'var(--color-accent-amber)' }}
                        />
                    ) : (
                        <LoadingOutlined
                            style={{ fontSize: 72, color: 'var(--color-accent-blue)' }}
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
                                ? 'var(--color-accent-amber)'
                                : {
                                      '0%': token.colorPrimary,
                                      '100%': 'var(--color-accent-green)',
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
                            styles={{ content: { color: 'var(--color-accent-green)' } }}
                        />
                    </Col>
                    <Col span={6}>
                        <Statistic
                            title="跳过"
                            value={task.skipped || 0}
                            styles={{ content: { color: 'var(--color-accent-amber)' } }}
                        />
                    </Col>
                    <Col span={6}>
                        <Statistic
                            title="失败"
                            value={task.failed}
                            styles={{ content: { color: 'var(--color-danger)' } }}
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

        const statusConfig: Record<string, { status: 'success' | 'warning' | 'error'; title: string; color: string }> = {
            completed: {
                status: 'success' as const,
                title: '导入完成！',
                color: 'var(--color-accent-green)',
            },
            cancelled: {
                status: 'warning' as const,
                title: '已取消',
                color: 'var(--color-accent-amber)',
            },
            failed: {
                status: 'error' as const,
                title: '导入失败',
                color: 'var(--color-danger)',
            },
            pending: {
                status: 'warning' as const,
                title: '等待中',
                color: 'var(--color-accent-amber)',
            },
            running: {
                status: 'warning' as const,
                title: '运行中',
                color: 'var(--color-accent-blue)',
            },
        };

        const config = statusConfig[task.status] || statusConfig.failed;

        // 从 options.summary 读取 NeDB 汇总，回退到 success/skipped/failed 统计
        let optionsSummary: Record<string, number> | undefined;
        try {
            const opts = typeof (task as any).options === 'string'
                ? JSON.parse((task as any).options)
                : (task as any).options;
            optionsSummary = opts?.summary;
        } catch { /* ignore */ }

        const subTitle =
            task.status === 'completed'
                ? optionsSummary
                    ? [
                        optionsSummary.inserted > 0 && `新增 ${optionsSummary.inserted}`,
                        optionsSummary.merged > 0 && `合并 ${optionsSummary.merged}`,
                        optionsSummary.kept > 0 && `保留 ${optionsSummary.kept}`,
                        optionsSummary.skipped > 0 && `跳过 ${optionsSummary.skipped}`,
                    ].filter(Boolean).join(' / ')
                    : `成功 ${task.success} 本，跳过 ${task.skipped || 0} 本，失败 ${task.failed} 本`
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
                    style={{ maxWidth: '96vw' }}
                    destroyOnHidden
                >
                    <Table<ImportTaskResult>
                        dataSource={task.results || []}
                        columns={resultsColumns}
                        rowKey={(r) => `${r.index}-${r.isbn}`}
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
                    style={{ maxWidth: '94vw' }}
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
                        rowKey={(r) => `${r.index}-${r.isbn}`}
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
        upload: () => <>{renderUploadStep()}{renderQuickTips()}</>,
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