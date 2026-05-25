// frontend/src/pages/BackupManager.tsx
/**
 * 备份管理页面 - 展示组件
 *
 * 业务逻辑已提取至:
 * - useBackupData       → 数据加载与刷新
 * - useBackupOperations → 所有操作处理 (创建/删除/同步/配置/自动备份)
 */

import { useState } from 'react';
import {
    Typography, Button, Table, Tabs, Space, message, Statistic,
    Card, Row, Col, Popconfirm, Descriptions, Switch, InputNumber,
    Alert, Tag, Form, Input, Spin, Empty, Tooltip,
} from 'antd';
import {
    CloudUploadOutlined, CloudDownloadOutlined, DeleteOutlined,
    HistoryOutlined, CloudServerOutlined,
    ExportOutlined, ReloadOutlined, PlayCircleOutlined,
    CloudSyncOutlined, SyncOutlined, LinkOutlined,
} from '@ant-design/icons';
import { useBackupData } from '../hooks/useBackupData';
import { useBackupOperations } from '../hooks/useBackupOperations';
import type { BackupMetadata, WebDAVConfig } from '../types';

const { Title, Text } = Typography;

export default function BackupManager() {
    const [activeTab, setActiveTab] = useState('instant');
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

    const {
        backups, backupsLoading, reloadBackups,
        webdavBackups, webdavLoading,
        webdavConfig,
        autoStatus,
        reloadAll,
    } = useBackupData();

    const {
        exporting, syncingFiles, pullingFiles,
        webdavTesting, webdavSaving, autoRunning,
        handleExport, handleDelete, handleSync, handlePull,
        handleRestore, handleWebdavTest, handleWebdavSave, handleAutoRun,
    } = useBackupOperations(reloadAll);

    // ==================== 表格列定义 ====================

    const backupColumns = [
        {
            title: '文件名', dataIndex: 'filename', key: 'filename',
            render: (name: string) => <Text strong>{name}</Text>,
        },
        {
            title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 180,
            render: (t: string) => t ? new Date(t).toLocaleString() : '-',
        },
        { title: '大小', dataIndex: 'file_size_display', key: 'file_size_display', width: 100 },
        {
            title: '包含', dataIndex: 'table_counts', key: 'table_counts', width: 140,
            render: (counts: Record<string, number>) => {
                const total = Object.values(counts || {}).reduce((s, c) => s + c, 0);
                return <Text>{Object.keys(counts || {}).length} 表 / {total} 行</Text>;
            },
        },
        { title: '版本', dataIndex: 'app_version', key: 'app_version', width: 80 },
        {
            title: '操作', key: 'actions', width: 280,
            render: (_: any, record: BackupMetadata) => (
                <Space size="small" wrap>
                    <Tooltip title="从此备份恢复">
                        <Button size="small" icon={<HistoryOutlined />}
                            onClick={() => handleRestore(record.filename)}>恢复</Button>
                    </Tooltip>
                    {webdavConfig?.configured && (
                        <Tooltip title="同步到 WebDAV">
                            <Button size="small" icon={<CloudSyncOutlined />}
                                loading={syncingFiles.has(record.filename)}
                                onClick={() => handleSync(record.filename)} />
                        </Tooltip>
                    )}
                    <Popconfirm title={`删除 ${record.filename}？`}
                        onConfirm={() => handleDelete([record.filename])}
                        okText="删除" cancelText="取消">
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const cloudColumns = [
        {
            title: '文件名', dataIndex: 'filename', key: 'filename',
            render: (name: string) => <Text strong>{name}</Text>,
        },
        { title: '大小', dataIndex: 'file_size_display', key: 'file_size_display', width: 120 },
        {
            title: '操作', key: 'actions', width: 200,
            render: (_: any, record: BackupMetadata) => (
                <Space size="small">
                    <Button size="small" icon={<CloudDownloadOutlined />}
                        loading={pullingFiles.has(record.filename)}
                        onClick={() => handlePull(record.filename)}>下载</Button>
                    <Button size="small" icon={<HistoryOutlined />}
                        onClick={() => handleRestore(record.filename)}>恢复</Button>
                </Space>
            ),
        },
    ];

    // ==================== 标签页 ====================

    const tabItems = [
        {
            key: 'instant',
            label: <span><ExportOutlined /> 即时备份</span>,
            children: (
                <div style={{ padding: '24px 0' }}>
                    <Row gutter={[24, 24]}>
                        <Col xs={24} md={8}>
                            <Card><Statistic title="本地备份数" value={backups?.length ?? 0} suffix="个" /></Card>
                        </Col>
                        <Col xs={24} md={8}>
                            <Card><Statistic title="最近备份" value={
                                autoStatus?.last_backup_at
                                    ? new Date(autoStatus.last_backup_at).toLocaleString()
                                    : '暂无'
                            } /></Card>
                        </Col>
                        <Col xs={24} md={8}>
                            <Card><Statistic title="云端备份数" value={webdavBackups?.length ?? 0} suffix="个" /></Card>
                        </Col>
                    </Row>
                    <div style={{ marginTop: 24, textAlign: 'center' }}>
                        <Button type="primary" size="large" icon={<ExportOutlined />}
                            loading={exporting} onClick={handleExport}>一键导出全量备份</Button>
                        <div style={{ marginTop: 12 }}>
                            <Text type="secondary">导出全部 9 张表数据，Fernet 加密，文件名: backup_YYYYMMDD_HHMMSS.backup</Text>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            key: 'list',
            label: <span><CloudServerOutlined /> 备份列表 ({backups?.length ?? 0})</span>,
            children: (
                <div style={{ padding: '8px 0' }}>
                    <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                        <Col><Button icon={<ReloadOutlined />} onClick={reloadBackups} loading={backupsLoading}>刷新</Button></Col>
                        <Col>
                            {selectedRowKeys.length > 0 && (
                                <Popconfirm title={`删除选中的 ${selectedRowKeys.length} 个备份？`}
                                    onConfirm={() => handleDelete(selectedRowKeys as string[])}
                                    okText="删除" cancelText="取消">
                                    <Button danger icon={<DeleteOutlined />}>删除选中 ({selectedRowKeys.length})</Button>
                                </Popconfirm>
                            )}
                        </Col>
                    </Row>
                    {backups && backups.length > 0 ? (
                        <Table dataSource={backups} columns={backupColumns} rowKey="filename"
                            loading={backupsLoading}
                            rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
                            pagination={{ pageSize: 10 }} size="middle" />
                    ) : <Empty description="暂无备份文件" />}
                </div>
            ),
        },
        {
            key: 'auto',
            label: <span><SyncOutlined spin={autoStatus?.enabled} /> 自动备份</span>,
            children: (
                <div style={{ padding: '24px 0' }}>
                    <Row gutter={[24, 24]}>
                        <Col xs={24} md={8}>
                            <Card><Statistic title="自动备份" value={autoStatus?.enabled ? '已启用' : '未启用'}
                                valueStyle={{ color: autoStatus?.enabled ? '#52c41a' : '#999' }} /></Card>
                        </Col>
                        <Col xs={24} md={8}>
                            <Card><Statistic title="备份间隔" value={autoStatus?.interval_hours ?? 24} suffix="小时" /></Card>
                        </Col>
                        <Col xs={24} md={8}>
                            <Card><Statistic title="本地保留" value={autoStatus?.max_local_copies ?? 30} suffix="份" /></Card>
                        </Col>
                    </Row>
                    <Row style={{ marginTop: 24 }} gutter={[24, 24]}>
                        <Col xs={24} md={8}>
                            <Card><Statistic title="最近备份" value={
                                autoStatus?.last_backup_at ? new Date(autoStatus.last_backup_at).toLocaleString() : '暂无'
                            } />
                                {autoStatus?.last_backup_success !== undefined && (
                                    <Tag color={autoStatus.last_backup_success ? 'green' : 'red'} style={{ marginTop: 8 }}>
                                        {autoStatus.last_backup_success ? '成功' : '失败'}</Tag>
                                )}</Card>
                        </Col>
                        <Col xs={24} md={8}>
                            <Card><Statistic title="下次备份" value={
                                autoStatus?.next_backup_at ? new Date(autoStatus.next_backup_at).toLocaleString() : '暂无计划'
                            } /></Card>
                        </Col>
                        <Col xs={24} md={8} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Button type="primary" icon={<PlayCircleOutlined />}
                                loading={autoRunning} onClick={handleAutoRun} size="large">立即执行备份</Button>
                        </Col>
                    </Row>
                    <Alert type="info" showIcon style={{ marginTop: 24 }}
                        message="自动备份说明"
                        description="系统将在后台自动创建备份，若配置了 WebDAV 将同时同步到云端。" />
                </div>
            ),
        },
        {
            key: 'webdav',
            label: <span><LinkOutlined /> 云同步 ({webdavConfig?.configured ? '已配置' : '未配置'})</span>,
            children: (
                <div style={{ padding: '24px 0' }}>
                    {webdavConfig ? (
                        <WebDAVConfigPanel config={webdavConfig} onSave={handleWebdavSave}
                            onTest={handleWebdavTest} testing={webdavTesting} saving={webdavSaving} />
                    ) : <Spin />}
                    <div style={{ marginTop: 24 }}>
                        <Title level={5}>云端备份文件</Title>
                        {webdavBackups && webdavBackups.length > 0 ? (
                            <Table dataSource={webdavBackups} columns={cloudColumns} rowKey="filename"
                                loading={webdavLoading} pagination={{ pageSize: 10 }} size="middle" />
                        ) : <Empty description="云端暂无备份文件" />}
                    </div>
                </div>
            ),
        },
    ];

    return (
        <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
            <Title level={3}>数据备份与恢复</Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
                管理全量数据备份，支持一键导出、自动备份、WebDAV 云同步和数据恢复向导
            </Text>
            <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} size="large" />
        </div>
    );
}

// ==================== WebDAV 配置面板（展示组件） ====================

function WebDAVConfigPanel({
    config, onSave, onTest, testing, saving,
}: {
    config: WebDAVConfig; onSave: (values: any) => Promise<void>;
    onTest: () => Promise<void>; testing: boolean; saving: boolean;
}) {
    const [form] = Form.useForm();

    return (
        <Form form={form} layout="vertical" onFinish={onSave}
            initialValues={{
                enabled: config?.enabled ?? false, url: config?.url ?? '',
                username: config?.username ?? '', password: '',
                remote_path: config?.remote_path ?? '/backups/', timeout: config?.timeout ?? 30,
            }}>
            <Form.Item name="enabled" valuePropName="checked" label="启用 WebDAV 云同步"><Switch /></Form.Item>
            <Row gutter={16}>
                <Col xs={24} md={16}>
                    <Form.Item name="url" label="WebDAV 地址"
                        rules={[{ type: 'url', message: '请输入有效的 URL' }]}>
                        <Input placeholder="http://127.0.0.1:5244/dav" /></Form.Item>
                </Col>
                <Col xs={24} md={8}>
                    <Form.Item name="timeout" label="超时（秒）">
                        <InputNumber min={5} max={120} style={{ width: '100%' }} /></Form.Item>
                </Col>
            </Row>
            <Row gutter={16}>
                <Col xs={24} md={12}>
                    <Form.Item name="username" label="用户名"><Input placeholder="WebDAV 用户名" /></Form.Item>
                </Col>
                <Col xs={24} md={12}>
                    <Form.Item name="password" label="密码"><Input.Password placeholder="留空则不修改" /></Form.Item>
                </Col>
            </Row>
            <Form.Item name="remote_path" label="远程路径"><Input placeholder="/baidudisk/backups/" /></Form.Item>
            <Space>
                <Button type="primary" htmlType="submit" loading={saving} icon={<CloudServerOutlined />}>保存配置</Button>
                <Button onClick={onTest} loading={testing} icon={<LinkOutlined />}>测试连接</Button>
            </Space>
        </Form>
    );
}
