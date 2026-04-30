// frontend/src/pages/BatchImport.tsx
/**
 * 批量导入页面
 * 
 * 支持从 Excel/CSV/TXT 文件批量导入图书 ISBN。
 * 
 * 导入流程（4 步骤）：
 * 1. 上传文件：拖拽或选择文件（.xlsx/.xls/.csv/.txt）
 * 2. 预览确认：查看新增/已存在/无效/重复的 ISBN 统计
 * 3. 正在导入：后台异步处理，实时显示进度
 * 4. 导入完成：展示结果摘要和错误详情
 * 
 * 配置选项：
 * - 自动同步豆瓣：导入时自动从豆瓣获取元数据
 * - 同步延迟：控制请求间隔（避免豆瓣反爬）
 * - 添加到书架：导入后自动将图书加入指定书架
 * 
 * 技术实现：
 * - 文件上传使用 Ant Design Upload 组件
 * - 导入任务后台异步执行，前端定时轮询进度
 * - 支持任务取消
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    Card, Upload, Button, Space, Typography, message, Steps, Table, Tag,
    Progress, Alert, Result, Statistic, Row, Col, Select, Switch, InputNumber,
    Modal, Breadcrumb, FloatButton,
} from 'antd';
import type { UploadProps, UploadFile } from 'antd';
import {
    UploadOutlined, FileExcelOutlined, InboxOutlined, CheckCircleOutlined,
    SyncOutlined, DownloadOutlined, EyeOutlined, DeleteOutlined,
    PlayCircleOutlined, FileTextOutlined, DatabaseOutlined, LoadingOutlined,
    ThunderboltOutlined, BookOutlined, StopOutlined, HomeOutlined,
    ReloadOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    previewImport, startImport, getImportStatus, cancelImportTask,
    downloadImportTemplate, listShelves,
} from '../services/api';
import { formatFileSize } from '../utils/format';

// ---- 类型定义 ----

const { Title, Text } = Typography;
const { Dragger } = Upload;

/** 导入步骤类型 */
type StepType = 'upload' | 'preview' | 'importing' | 'complete';

/** 步骤配置 */
interface StepConfig {
    key: StepType;
    title: string;
    icon: React.ReactNode;
}

// ---- 常量 ----

/** 步骤配置列表 */
const IMPORT_STEPS: StepConfig[] = [
    { key: 'upload', title: '上传文件', icon: <UploadOutlined /> },
    { key: 'preview', title: '预览确认', icon: <EyeOutlined /> },
    { key: 'importing', title: '正在导入', icon: <SyncOutlined spin /> },
    { key: 'complete', title: '导入完成', icon: <CheckCircleOutlined /> },
];

/** 步骤索引映射 */
const STEP_INDEX_MAP: Record<StepType, number> = {
    upload: 0,
    preview: 1,
    importing: 2,
    complete: 3,
};

/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 1500;

/** 最大文件大小（20MB） */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** 支持的文件扩展名 */
const VALID_EXTENSIONS = ['csv', 'xlsx', 'xls', 'txt'];

// ---- 子组件 ----

/** 状态标签组件（成功/失败/跳过） */
const StatusTag: React.FC<{ status: string; synced?: boolean }> = React.memo(
    ({ status, synced }) => {
        const statusMap: Record<string, { color: string; text: string }> = {
            success: {
                color: 'success',
                text: synced ? '成功(已同步)' : '成功',
            },
            failed: { color: 'error', text: '失败' },
            skipped: { color: 'warning', text: '跳过' },
        };
        const config = statusMap[status] || { color: 'default', text: status };
        return (
            <Tag color={config.color} style={{ borderRadius: 10 }}>
                {config.text}
            </Tag>
        );
    }
);
StatusTag.displayName = 'StatusTag';

// ---- 主组件 ----

const BatchImport: React.FC = () => {
    const navigate = useNavigate();
    
    /** 轮询定时器引用 */
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    
    /** 组件挂载状态 */
    const isMounted = useRef(true);

    // ---- 状态 ----
    
    const [currentStep, setCurrentStep] = useState<StepType>('upload');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [previewData, setPreviewData] = useState<any>(null);
    const [importTask, setImportTask] = useState<any>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [shelfList, setShelfList] = useState<any[]>([]);
    const [targetShelfId, setTargetShelfId] = useState<number | undefined>();
    const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
    const [syncDelaySeconds, setSyncDelaySeconds] = useState(1.0);
    const [showResultsModal, setShowResultsModal] = useState(false);
    const [showErrorsModal, setShowErrorsModal] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // ---- 生命周期 ----

    useEffect(() => {
        isMounted.current = true;
        loadShelfList();
        return () => {
            isMounted.current = false;
            stopPolling();
        };
    }, []);

    // ---- 数据加载 ----

    /** 加载书架列表（用于导入后自动添加） */
    const loadShelfList = useCallback(async () => {
        try {
            const data = await listShelves();
            if (isMounted.current) {
                const options = [
                    { value: 0, label: '不添加到书架' },
                    ...data.map((shelf: any) => ({
                        value: shelf.logical_shelf_id,
                        label: shelf.shelf_name,
                    })),
                ];
                setShelfList(options);
            }
        } catch {
            // 静默失败
        }
    }, []);

    // ---- 轮询控制 ----

    /** 停止轮询 */
    const stopPolling = useCallback(() => {
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    }, []);

    /** 开始轮询导入任务进度 */
    const startPolling = useCallback(
        (taskId: string) => {
            stopPolling();
            pollTimerRef.current = setInterval(async () => {
                try {
                    const task = await getImportStatus(taskId);
                    if (!isMounted.current) return;
                    
                    setImportTask(task);
                    
                    // 检查任务是否结束
                    const finishedStatuses = ['completed', 'failed', 'cancelled'];
                    if (finishedStatuses.includes(task.status)) {
                        stopPolling();
                        setIsImporting(false);
                        setCurrentStep('complete');
                        
                        // 根据状态显示不同提示
                        if (task.status === 'completed') {
                            message.success(`导入完成！成功 ${task.success} 本`);
                        } else if (task.status === 'cancelled') {
                            message.info('导入已取消');
                        } else {
                            message.error(task.error || '导入失败');
                        }
                    }
                } catch {
                    // 轮询失败不中断
                }
            }, POLL_INTERVAL_MS);
        },
        [stopPolling]
    );

    // ---- 文件列表（派生状态） ----

    const uploadFileList: UploadFile[] = useMemo(
        () =>
            selectedFile
                ? [
                      {
                          uid: '-1',
                          name: selectedFile.name,
                          status: 'done' as const,
                          size: selectedFile.size,
                      },
                  ]
                : [],
        [selectedFile]
    );

    // ---- 上传配置 ----

    const uploadProps: UploadProps = useMemo(
        () => ({
            accept: '.xlsx,.xls,.csv,.txt',
            maxCount: 1,
            showUploadList: { showRemoveIcon: true },
            fileList: uploadFileList,
            
            /**
             * 文件选择前校验
             * - 检查扩展名是否支持
             * - 检查文件大小是否超限
             */
            beforeUpload: (file) => {
                const extension = file.name.split('.').pop()?.toLowerCase() || '';
                
                if (!VALID_EXTENSIONS.includes(extension)) {
                    message.error('不支持的文件格式');
                    return Upload.LIST_IGNORE;
                }
                
                if (file.size > MAX_FILE_SIZE) {
                    message.error(`文件不能超过 ${formatFileSize(MAX_FILE_SIZE)}`);
                    return Upload.LIST_IGNORE;
                }
                
                setSelectedFile(file);
                setPreviewData(null);
                setCurrentStep('upload');
                return false; // 阻止自动上传
            },
            
            /** 移除文件时重置状态 */
            onRemove: () => {
                setSelectedFile(null);
                setPreviewData(null);
                setCurrentStep('upload');
            },
        }),
        [uploadFileList]
    );

    // ---- 预览操作 ----

    /** 预览导入文件 */
    const handlePreview = useCallback(async () => {
        if (!selectedFile) return;
        
        setIsUploading(true);
        try {
            const data = await previewImport(selectedFile);
            if (isMounted.current) {
                setPreviewData(data);
                setCurrentStep('preview');
                message.success(`发现 ${data.new_count} 本新书`);
            }
        } catch (error: any) {
            const errorMessage = error?.response?.data?.detail || '文件解析失败';
            setLoadError(errorMessage);
        } finally {
            if (isMounted.current) setIsUploading(false);
        }
    }, [selectedFile]);

    // ---- 导入操作 ----

    /** 启动导入任务 */
    const handleStartImport = useCallback(async () => {
        if (!selectedFile || !previewData || previewData.new_count === 0) return;
        
        setIsImporting(true);
        setCurrentStep('importing');
        
        try {
            const result = await startImport(selectedFile, {
                auto_sync: autoSyncEnabled,
                sync_delay: syncDelaySeconds,
                shelf_id: targetShelfId && targetShelfId > 0 ? targetShelfId : undefined,
            } as any);
            
            if (result.task_id) {
                startPolling(result.task_id);
                message.info(`导入任务已启动，共 ${result.total} 本图书`);
            }
        } catch (error: any) {
            message.error(error?.response?.data?.detail || '导入启动失败');
            setIsImporting(false);
            setCurrentStep('preview');
        }
    }, [selectedFile, previewData, autoSyncEnabled, syncDelaySeconds, targetShelfId, startPolling]);

    /** 取消导入任务 */
    const handleCancelImport = useCallback(async () => {
        if (!importTask?.task_id) return;
        
        try {
            await cancelImportTask(importTask.task_id);
            message.info('正在取消导入...');
        } catch (error: any) {
            message.error(error?.response?.data?.detail || '取消失败');
        }
    }, [importTask]);

    // ---- 下载模板 ----

    /** 下载导入模板 */
    const handleDownloadTemplate = useCallback(async () => {
        try {
            const blob = await downloadImportTemplate();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'import_template.xlsx';
            link.click();
            URL.revokeObjectURL(url);
        } catch {
            message.error('模板下载失败');
        }
    }, []);

    // ---- 重置 ----

    /** 重置所有状态 */
    const resetAll = useCallback(() => {
        setSelectedFile(null);
        setPreviewData(null);
        setImportTask(null);
        setCurrentStep('upload');
        setIsImporting(false);
        stopPolling();
    }, [stopPolling]);

    // ---- 表格列配置 ----

    /** 导入结果表格列 */
    const resultColumns = useMemo(
        () => [
            { title: '#', dataIndex: 'index', width: 50 },
            {
                title: 'ISBN',
                dataIndex: 'isbn',
                width: 150,
                render: (value: string) => (
                    <Text code style={{ fontSize: 12 }}>
                        {value}
                    </Text>
                ),
            },
            { title: '书名', dataIndex: 'title', ellipsis: true },
            { title: '作者', dataIndex: 'author', width: 120, ellipsis: true },
            {
                title: '状态',
                dataIndex: 'status',
                width: 130,
                render: (status: string, record: any) => (
                    <StatusTag status={status} synced={record.synced} />
                ),
            },
            { title: '备注', dataIndex: 'message', width: 200, ellipsis: true },
        ],
        []
    );

    /** 错误详情表格列 */
    const errorColumns = useMemo(
        () => [
            { title: '#', dataIndex: 'index', width: 50 },
            {
                title: 'ISBN',
                dataIndex: 'isbn',
                width: 150,
                render: (value: string) => (
                    <Text code style={{ fontSize: 12 }}>
                        {value}
                    </Text>
                ),
            },
            { title: '错误信息', dataIndex: 'error', ellipsis: true },
        ],
        []
    );

    // ---- 渲染 ----

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

            {/* 页面标题 */}
            <Title level={2}>
                <DatabaseOutlined style={{ marginRight: 12, color: '#8B4513' }} />
                批量导入图书
            </Title>

            {/* 步骤指示器 */}
            <Card style={{ marginBottom: 24, borderRadius: 12 }}>
                <Steps current={STEP_INDEX_MAP[currentStep]} items={IMPORT_STEPS} />
            </Card>

            {/* ===== 步骤 1：上传文件 ===== */}
            {currentStep === 'upload' && (
                <Card
                    style={{
                        marginBottom: 24,
                        borderRadius: 12,
                        border: '1px solid #e8d5c8',
                    }}
                >
                    {/* 文件要求提示 */}
                    <Alert
                        message="文件要求"
                        description={
                            <ul style={{ paddingLeft: 20, margin: 0 }}>
                                <li>支持 .xlsx .xls .csv .txt 格式</li>
                                <li>文件中需包含 ISBN 列</li>
                                <li>单文件最大 {formatFileSize(MAX_FILE_SIZE)}</li>
                                <li>建议先在 Excel 中检查数据格式</li>
                            </ul>
                        }
                        type="info"
                        showIcon
                        style={{ marginBottom: 16, borderRadius: 8 }}
                    />

                    {/* 拖拽上传区域 */}
                    <Dragger {...uploadProps}>
                        <p style={{ fontSize: 48, color: '#d4a574' }}>
                            <InboxOutlined />
                        </p>
                        <p style={{ fontSize: 16, fontWeight: 500 }}>
                            点击或拖拽文件到此区域
                        </p>
                        <p style={{ color: '#8c7b72' }}>
                            支持 Excel、CSV、TXT 格式
                        </p>
                    </Dragger>

                    {/* 已选文件信息 */}
                    {selectedFile && (
                        <div
                            style={{
                                padding: 16,
                                background: '#eff6ff',
                                borderRadius: 8,
                                marginTop: 16,
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <Space>
                                <FileExcelOutlined style={{ color: '#3b82f6' }} />
                                <Text strong>{selectedFile.name}</Text>
                                <Text type="secondary">
                                    {formatFileSize(selectedFile.size)}
                                </Text>
                            </Space>
                            <Button
                                danger
                                size="small"
                                icon={<DeleteOutlined />}
                                onClick={() => {
                                    setSelectedFile(null);
                                    setPreviewData(null);
                                }}
                            >
                                移除
                            </Button>
                        </div>
                    )}

                    {/* 操作按钮 */}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginTop: 16,
                        }}
                    >
                        <Button
                            icon={<DownloadOutlined />}
                            onClick={handleDownloadTemplate}
                        >
                            下载导入模板
                        </Button>
                        <Button
                            type="primary"
                            size="large"
                            icon={<EyeOutlined />}
                            loading={isUploading}
                            onClick={handlePreview}
                            disabled={!selectedFile}
                        >
                            {selectedFile ? '预览文件内容' : '请先选择文件'}
                        </Button>
                    </div>
                </Card>
            )}

            {/* ===== 步骤 2：预览确认 ===== */}
            {currentStep === 'preview' && previewData && (
                <>
                    {/* 预览统计 */}
                    <Card
                        style={{
                            marginBottom: 24,
                            borderRadius: 12,
                            border: '1px solid #e8d5c8',
                        }}
                    >
                        <Title level={4}>
                            <FileTextOutlined
                                style={{ color: '#8B4513', marginRight: 8 }}
                            />
                            {previewData.file_name}
                        </Title>
                        
                        {/* 统计卡片 */}
                        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                            {[
                                { label: '总行数', value: previewData.total_rows },
                                {
                                    label: '新图书',
                                    value: previewData.new_count,
                                    color: '#3b82f6',
                                },
                                {
                                    label: '已存在',
                                    value: previewData.existing_count,
                                    color: '#f59e0b',
                                },
                                {
                                    label: '无效',
                                    value: previewData.invalid_count,
                                    color: '#ef4444',
                                },
                            ].map((item, index) => (
                                <Col xs={12} sm={6} key={index}>
                                    <Card
                                        size="small"
                                        style={{
                                            textAlign: 'center',
                                            borderRadius: 8,
                                        }}
                                    >
                                        <Statistic
                                            title={item.label}
                                            value={item.value}
                                            valueStyle={{
                                                color: (item as any).color,
                                            }}
                                        />
                                    </Card>
                                </Col>
                            ))}
                        </Row>

                        {/* 已存在提示 */}
                        {previewData.existing_count > 0 && (
                            <Alert
                                message={`${previewData.existing_count} 本图书数据库中已存在，将自动跳过`}
                                type="warning"
                                showIcon
                                style={{ marginBottom: 8, borderRadius: 8 }}
                            />
                        )}
                    </Card>

                    {/* 导入选项 */}
                    <Card
                        style={{
                            marginBottom: 24,
                            borderRadius: 12,
                            border: '1px solid #e8d5c8',
                        }}
                    >
                        <Title level={5}>导入选项</Title>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 12,
                            }}
                        >
                            {/* 自动同步豆瓣 */}
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '12px 16px',
                                    background: '#fafaf9',
                                    borderRadius: 8,
                                }}
                            >
                                <span>
                                    <ThunderboltOutlined
                                        style={{
                                            color: '#3b82f6',
                                            marginRight: 8,
                                        }}
                                    />
                                    自动同步豆瓣数据
                                </span>
                                <Switch
                                    checked={autoSyncEnabled}
                                    onChange={setAutoSyncEnabled}
                                />
                            </div>

                            {/* 同步延迟 */}
                            {autoSyncEnabled && (
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '12px 16px',
                                        background: '#fafaf9',
                                        borderRadius: 8,
                                    }}
                                >
                                    <span>同步请求间隔（秒）</span>
                                    <InputNumber
                                        min={0.5}
                                        max={10}
                                        step={0.5}
                                        value={syncDelaySeconds}
                                        onChange={(value) =>
                                            setSyncDelaySeconds(value || 1)
                                        }
                                        style={{ width: 120 }}
                                    />
                                </div>
                            )}

                            {/* 添加到书架 */}
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '12px 16px',
                                    background: '#fafaf9',
                                    borderRadius: 8,
                                }}
                            >
                                <span>
                                    <BookOutlined
                                        style={{
                                            color: '#22c55e',
                                            marginRight: 8,
                                        }}
                                    />
                                    导入后添加到书架
                                </span>
                                <Select
                                    value={targetShelfId || 0}
                                    onChange={(value) =>
                                        setTargetShelfId(
                                            value === 0 ? undefined : value
                                        )
                                    }
                                    style={{ width: 200 }}
                                    options={shelfList}
                                />
                            </div>
                        </div>
                    </Card>

                    {/* 操作按钮 */}
                    <Card
                        style={{
                            borderRadius: 12,
                            border: '1px solid #e8d5c8',
                        }}
                    >
                        <Space>
                            <Button
                                type="primary"
                                size="large"
                                icon={<PlayCircleOutlined />}
                                onClick={handleStartImport}
                                disabled={previewData.new_count === 0}
                            >
                                {previewData.new_count > 0
                                    ? `开始导入（${previewData.new_count} 本）`
                                    : '无新书可导入'}
                            </Button>
                            <Button
                                size="large"
                                onClick={() => setCurrentStep('upload')}
                            >
                                返回重新选择
                            </Button>
                            <Button size="large" onClick={resetAll}>
                                取消
                            </Button>
                        </Space>
                    </Card>
                </>
            )}

            {/* ===== 步骤 3：正在导入 ===== */}
            {currentStep === 'importing' && importTask && (
                <Card
                    style={{
                        borderRadius: 12,
                        border: '1px solid #e8d5c8',
                        textAlign: 'center',
                        padding: 40,
                    }}
                >
                    {/* 状态图标 */}
                    {importTask.status === 'cancelled' ? (
                        <StopOutlined
                            style={{ fontSize: 64, color: '#f59e0b' }}
                        />
                    ) : (
                        <LoadingOutlined
                            style={{ fontSize: 64, color: '#3b82f6' }}
                            spin
                        />
                    )}

                    <Title level={3}>
                        {importTask.status === 'cancelled'
                            ? '已取消'
                            : '正在导入中...'}
                    </Title>

                    {/* 进度条 */}
                    <Progress
                        percent={importTask.progress}
                        status={
                            importTask.status === 'cancelled'
                                ? 'exception'
                                : 'active'
                        }
                    />

                    {/* 统计数字 */}
                    <Row gutter={16} justify="center" style={{ marginTop: 16 }}>
                        <Col span={6}>
                            <Statistic title="总计" value={importTask.total} />
                        </Col>
                        <Col span={6}>
                            <Statistic
                                title="成功"
                                value={importTask.success}
                                valueStyle={{ color: '#22c55e' }}
                            />
                        </Col>
                        <Col span={6}>
                            <Statistic
                                title="跳过"
                                value={importTask.skipped || 0}
                            />
                        </Col>
                        <Col span={6}>
                            <Statistic
                                title="失败"
                                value={importTask.failed}
                                valueStyle={{ color: '#ef4444' }}
                            />
                        </Col>
                    </Row>

                    {/* 取消按钮 */}
                    {importTask.status === 'running' && (
                        <Button
                            danger
                            style={{ marginTop: 24 }}
                            icon={<StopOutlined />}
                            onClick={handleCancelImport}
                        >
                            取消导入
                        </Button>
                    )}
                </Card>
            )}

            {/* ===== 步骤 4：导入完成 ===== */}
            {currentStep === 'complete' && importTask && (
                <>
                    <Card
                        style={{
                            borderRadius: 12,
                            border: '1px solid #e8d5c8',
                            marginBottom: 24,
                        }}
                    >
                        <Result
                            status={
                                importTask.status === 'completed'
                                    ? 'success'
                                    : importTask.status === 'cancelled'
                                    ? 'warning'
                                    : 'error'
                            }
                            title={
                                importTask.status === 'completed'
                                    ? '导入完成！'
                                    : importTask.status === 'cancelled'
                                    ? '已取消'
                                    : '导入失败'
                            }
                            subTitle={
                                importTask.status === 'completed'
                                    ? `成功导入 ${importTask.success} 本，失败 ${importTask.failed} 本`
                                    : importTask.error
                            }
                            extra={[
                                <Button
                                    key="shelf"
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
                                    {targetShelfId
                                        ? '查看书架'
                                        : '查看封面墙'}
                                </Button>,
                                <Button
                                    key="reset"
                                    icon={<ReloadOutlined />}
                                    onClick={resetAll}
                                >
                                    继续导入
                                </Button>,
                                importTask.results?.length > 0 && (
                                    <Button
                                        key="results"
                                        icon={<EyeOutlined />}
                                        onClick={() =>
                                            setShowResultsModal(true)
                                        }
                                    >
                                        查看详情（{importTask.results.length}）
                                    </Button>
                                ),
                                importTask.errors?.length > 0 && (
                                    <Button
                                        key="errors"
                                        danger
                                        icon={<ExclamationCircleOutlined />}
                                        onClick={() =>
                                            setShowErrorsModal(true)
                                        }
                                    >
                                        查看错误（{importTask.errors.length}）
                                    </Button>
                                ),
                            ].filter(Boolean)}
                        />
                    </Card>

                    {/* 详情弹窗 */}
                    <Modal
                        title="导入详情"
                        open={showResultsModal}
                        onCancel={() => setShowResultsModal(false)}
                        footer={null}
                        width={800}
                    >
                        <Table
                            dataSource={importTask.results}
                            columns={resultColumns}
                            rowKey="index"
                            size="small"
                            pagination={{ pageSize: 20 }}
                        />
                    </Modal>

                    {/* 错误详情弹窗 */}
                    <Modal
                        title="错误详情"
                        open={showErrorsModal}
                        onCancel={() => setShowErrorsModal(false)}
                        footer={null}
                        width={600}
                    >
                        <Table
                            dataSource={importTask.errors}
                            columns={errorColumns}
                            rowKey="index"
                            size="small"
                            pagination={{ pageSize: 20 }}
                        />
                    </Modal>
                </>
            )}

            {/* 返回顶部 */}
            <FloatButton.BackTop
                visibilityHeight={400}
                style={{ right: 40, bottom: 40 }}
            />
        </div>
    );
};

export default BatchImport;