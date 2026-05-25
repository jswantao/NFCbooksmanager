// frontend/src/pages/BackupRestore.tsx
/**
 * 恢复向导页面 - 展示组件
 *
 * 业务逻辑已提取至 useRestoreWizard Hook:
 * - 备份预览加载
 * - 冲突检测与解决策略选择
 * - 恢复执行 (dry-run / 正式)
 */

import {
    Typography, Steps, Button, Card, Descriptions, Alert, Space, Spin,
    Radio, Statistic, Row, Col, Collapse, Tag, Divider, Table, Empty,
} from 'antd';
import {
    FileSearchOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
    WarningOutlined, SafetyOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useRestoreWizard } from '../hooks/useRestoreWizard';

const { Title, Text } = Typography;

export default function BackupRestore() {
    const { filename } = useParams<{ filename: string }>();
    const navigate = useNavigate();

    const {
        step, setStep,
        preview, previewLoading,
        conflicts, conflictsLoading, hasConflicts,
        resolutions, handleResolutionChange, buildConflictKey,
        restoreResult, restoring, dryRunning,
        handleCheckConflicts, handleDryRun, handleExecuteRestore,
    } = useRestoreWizard(filename);

    return (
        <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto' }}>
            <Title level={3}><SafetyOutlined /> 数据恢复向导</Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
                从备份文件恢复数据，包含冲突检测与人工决策流程。备份文件: <Text strong>{filename}</Text>
            </Text>

            <Steps current={step} items={[
                { title: '预览备份', icon: <FileSearchOutlined /> },
                { title: '冲突检测', icon: <WarningOutlined /> },
                { title: '恢复结果', icon: <CheckCircleOutlined /> },
            ]} style={{ marginBottom: 32 }} />

            {/* Step 0: 预览 */}
            {step === 0 && (
                <Card loading={previewLoading}>
                    {preview ? <>
                        <Descriptions bordered column={2} size="middle">
                            <Descriptions.Item label="备份文件">{preview.filename}</Descriptions.Item>
                            <Descriptions.Item label="创建时间">{preview.created_at ? new Date(preview.created_at).toLocaleString() : '-'}</Descriptions.Item>
                            <Descriptions.Item label="备份版本">{preview.version}</Descriptions.Item>
                            <Descriptions.Item label="应用版本">{preview.app_version || '-'}</Descriptions.Item>
                            <Descriptions.Item label="总表数">{Object.keys(preview.table_counts).length}</Descriptions.Item>
                            <Descriptions.Item label="总行数">{preview.total_rows}</Descriptions.Item>
                        </Descriptions>
                        <Divider />
                        <Title level={5}>各表记录数</Title>
                        <Table dataSource={Object.entries(preview.table_counts).map(([k, v]) => ({ table: k, count: v }))}
                            columns={[{ title: '表名', dataIndex: 'table' }, { title: '记录数', dataIndex: 'count' }]}
                            rowKey="table" size="small" pagination={false} style={{ marginBottom: 16 }} />
                        <Alert type="warning" showIcon message="恢复操作将修改当前数据库数据"
                            description="建议在恢复前手动创建一份备份。恢复时将显示冲突检测结果，您可以逐条选择处理策略。" style={{ marginBottom: 16 }} />
                        <Space>
                            <Button type="primary" size="large" icon={<WarningOutlined />}
                                loading={conflictsLoading} onClick={handleCheckConflicts}>下一步：检测冲突</Button>
                            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/backup')}>返回备份管理</Button>
                        </Space>
                    </> : <Spin tip="加载备份预览..." />}
                </Card>
            )}

            {/* Step 1: 冲突检测 */}
            {step === 1 && (
                conflictsLoading ? <Spin tip="检测冲突中..." /> : <>
                    <Card style={{ marginBottom: 16 }}>
                        <Row gutter={24}>
                            <Col xs={12} sm={6}><Statistic title="总冲突数" value={conflicts?.total_conflicts ?? 0}
                                valueStyle={{ color: hasConflicts ? '#faad14' : '#52c41a' }} /></Col>
                            <Col xs={12} sm={6}><Statistic title="涉及表数" value={Object.keys(conflicts?.by_table ?? {}).length} /></Col>
                            <Col xs={12} sm={6}><Statistic title="预计新增行" value={conflicts?.expected_new_rows ?? 0} /></Col>
                        </Row>
                    </Card>

                    {!hasConflicts ? (
                        <Alert type="success" showIcon message="未检测到冲突" description="当前数据库与备份完全一致，可以安全恢复。" style={{ marginBottom: 16 }} />
                    ) : (
                        <Collapse items={[{
                            key: 'conflicts', label: <span><ExclamationCircleOutlined style={{ color: '#faad14' }} /> {conflicts?.total_conflicts} 个冲突需处理</span>,
                            extra: <Tag color="orange">{conflicts?.total_conflicts}</Tag>,
                            children: (conflicts?.conflicts ?? []).map((c, i) => {
                                const key = buildConflictKey(c);
                                return (
                                    <Card key={i} size="small" style={{ marginBottom: 8 }}
                                        title={<><Tag color="orange">{c.table}</Tag> {c.pk_column}: {String(c.pk_value)}</>}>
                                        <Row gutter={16}>
                                            <Col xs={24} md={12}>
                                                <Text strong>当前数据:</Text>
                                                <pre style={{ fontSize: 11, background: '#f5f5f5', padding: 8, borderRadius: 4, maxHeight: 200, overflow: 'auto' }}>
                                                    {JSON.stringify(c.current_data, null, 2)}</pre>
                                            </Col>
                                            <Col xs={24} md={12}>
                                                <Text strong>备份数据:</Text>
                                                <pre style={{ fontSize: 11, background: '#fff7e6', padding: 8, borderRadius: 4, maxHeight: 200, overflow: 'auto' }}>
                                                    {JSON.stringify(c.backup_data, null, 2)}</pre>
                                            </Col>
                                        </Row>
                                        {c.diff_fields && c.diff_fields.length > 0 && (
                                            <Alert type="warning" showIcon style={{ marginTop: 8 }}
                                                message={`差异字段: ${c.diff_fields.join(', ')}`} />)}
                                        <Divider style={{ margin: '12px 0' }} />
                                        <Radio.Group value={resolutions[key] || 'skip'}
                                            onChange={e => handleResolutionChange(key, e.target.value)}>
                                            <Radio.Button value="overwrite">覆盖</Radio.Button>
                                            <Radio.Button value="skip">跳过</Radio.Button>
                                            <Radio.Button value="keep_both">保留两者</Radio.Button>
                                        </Radio.Group>
                                    </Card>);
                            }),
                        }]} style={{ marginBottom: 16 }} />
                    )}

                    <Space>
                        <Button type="primary" size="large" icon={<SafetyOutlined />}
                            onClick={handleExecuteRestore} loading={restoring} danger>确认并执行恢复</Button>
                        <Button icon={<FileSearchOutlined />} onClick={handleDryRun} loading={dryRunning}>预览恢复 (Dry Run)</Button>
                        <Button onClick={() => setStep(0)}>上一步</Button>
                    </Space>
                </>
            )}

            {/* Step 2: 恢复结果 */}
            {step === 2 && restoreResult && (
                <Card>
                    <Alert type={restoreResult.summary.errors > 0 ? 'warning' : 'success'} showIcon
                        message={restoreResult.dry_run ? '恢复预览完成' : '恢复执行完成'}
                        description={restoreResult.dry_run ? '以下为预览结果，未实际修改数据库。' : '数据已恢复至数据库。'}
                        style={{ marginBottom: 16 }} />
                    <Row gutter={24} style={{ marginBottom: 24 }}>
                        <Col xs={12} sm={6}><Statistic title="覆盖" value={restoreResult.summary.overwritten} valueStyle={{ color: '#1677ff' }} /></Col>
                        <Col xs={12} sm={6}><Statistic title="跳过" value={restoreResult.summary.skipped} valueStyle={{ color: '#999' }} /></Col>
                        <Col xs={12} sm={6}><Statistic title="插入" value={restoreResult.summary.inserted} valueStyle={{ color: '#52c41a' }} /></Col>
                        <Col xs={12} sm={6}><Statistic title="错误" value={restoreResult.summary.errors}
                            valueStyle={{ color: restoreResult.summary.errors > 0 ? '#ff4d4f' : '#52c41a' }} /></Col>
                    </Row>
                    {restoreResult.details?.length > 0 && <>
                        <Title level={5}>详细记录</Title>
                        <Table dataSource={restoreResult.details}
                            columns={[
                                { title: '表', dataIndex: 'table', width: 160 },
                                { title: '操作', dataIndex: 'action', width: 100, render: (a: string) =>
                                    <Tag color={a === 'error' ? 'red' : a === 'overwrite' ? 'blue' : a === 'insert' ? 'green' : 'default'}>{a}</Tag> },
                                { title: '主键', dataIndex: 'pk_value' },
                                { title: '结果', dataIndex: 'success', width: 80,
                                    render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '成功' : '失败'}</Tag> },
                                { title: '信息', dataIndex: 'message' },
                            ]}
                            rowKey={(_, i) => String(i)} size="small" pagination={{ pageSize: 20 }} />
                    </>}
                    <Divider />
                    <Button type="primary" size="large" onClick={() => navigate('/admin/backup')}>返回备份管理</Button>
                </Card>
            )}
        </div>
    );
}
