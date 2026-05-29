// frontend/src/pages/NFCOperator.tsx
/**
 * NFC 操作页面
 *
 * 架构：useNFCOperator Hook + 子组件
 */

import React, { type FC } from "react";
import {
    Card, Button, Input, Space, Typography, Steps, Tag, Timeline, Alert,
    Select, Badge, List, Popconfirm, Tooltip, Tour, App, theme, Divider, QRCode,
} from "antd";
import {
    WifiOutlined, TagOutlined, HistoryOutlined, ClearOutlined,
    ScanOutlined, WriteOutlined, DeleteOutlined, CopyOutlined,
    QuestionCircleOutlined, SecurityScanOutlined, HomeOutlined,
    ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined,
} from "@ant-design/icons";
import { useNFCOperator } from "../hooks/useNFCOperator";

const { Title, Text, Paragraph } = Typography;

const NFCOperator: FC = () => {
    const { message } = App.useApp();
    const { token } = theme.useToken();
    const op = useNFCOperator();

    const mobileUrl = `${window.location.protocol}//${op.localIP}:${window.location.port || 8000}/nfc-scan`;

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            message.success("已复制");
        } catch { message.error("复制失败"); }
    };

    const filteredHistory = op.filterType === "all"
        ? op.history
        : op.history.filter((h) => h.type === op.filterType);

    return (
        <div style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
            <Title level={2}>
                <TagOutlined style={{ marginRight: 12, color: token.colorPrimary }} />
                NFC 操作中心
            </Title>

            {/* PIN 设置 */}
            <Card size="small" style={{ borderRadius: 12, marginBottom: 16 }}>
                <Space>
                    <SecurityScanOutlined />
                    <Text strong>安全 PIN:</Text>
                    <Input.Password
                        value={op.pin}
                        onChange={(e) => op.setPin(e.target.value)}
                        onBlur={() => op.handleVerifyPin()}
                        maxLength={8}
                        style={{ width: 120 }}
                        status={op.pinError ? "error" : undefined}
                    />
                    {op.pinError && <Text type="danger">{op.pinError}</Text>}
                </Space>
            </Card>

            {/* 移动端地址 */}
            <Card size="small" style={{ borderRadius: 12, marginBottom: 16 }}>
                <Space direction="vertical" style={{ width: "100%" }}>
                    <Space>
                        <WifiOutlined />
                        <Text strong>移动端扫描地址:</Text>
                    </Space>
                    <Input.Search
                        value={mobileUrl}
                        readOnly
                        enterButton={<CopyOutlined />}
                        onSearch={() => copyToClipboard(mobileUrl)}
                    />
                    <div style={{ textAlign: "center" }}>
                        <QRCode value={mobileUrl} size={120} bordered={false} />
                        <Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
                            用手机扫描二维码打开 NFC 扫描页面
                        </Paragraph>
                    </div>
                </Space>
            </Card>

            {/* NFC 操作 */}
            <Card title="写入 NFC 标签" style={{ borderRadius: 12, marginBottom: 16 }}>
                <Space direction="vertical" style={{ width: "100%" }}>
                    <Space>
                        <Text>目标书架:</Text>
                        <Select
                            placeholder="选择书架"
                            style={{ width: 200 }}
                            value={op.selectedShelfId}
                            onChange={(v) => {
                                op.setSelectedShelfId(v);
                                op.setSelectedShelfName("");
                            }}
                            options={[]}
                        />
                    </Space>
                    <Space>
                        <Button type="primary" icon={<WriteOutlined />} onClick={op.handleWriteTag} loading={op.loading}>
                            写入标签
                        </Button>
                        <Button icon={<ScanOutlined />} onClick={op.handleScanCallback}>
                            模拟扫描
                        </Button>
                    </Space>
                    {op.error && <Alert type="error" message={op.error} showIcon closable onClose={() => {}} />}
                </Space>
            </Card>

            {/* 待处理任务 */}
            {op.tasks.length > 0 && (
                <Card title="写入任务队列" style={{ borderRadius: 12, marginBottom: 16 }} size="small">
                    <List
                        dataSource={op.tasks}
                        renderItem={(task) => (
                            <List.Item
                                actions={[
                                    <Button key="del" type="link" danger icon={<DeleteOutlined />}
                                        onClick={() => op.handleDeleteTask(task.task_id)} />,
                                ]}
                            >
                                <List.Item.Meta
                                    title={task.shelf_name || `书架 #${task.shelf_id}`}
                                    description={`任务ID: ${task.task_id} | 剩余 ${task.expires_in ?? "?"} 秒`}
                                />
                            </List.Item>
                        )}
                    />
                </Card>
            )}

            {/* 操作历史 */}
            <Card
                title={
                    <Space style={{ width: "100%", justifyContent: "space-between" }}>
                        <span><HistoryOutlined /> 操作历史 ({op.history.length})</span>
                        <Space>
                            <Select value={op.filterType} onChange={op.setFilterType} size="small" style={{ width: 100 }}
                                options={[
                                    { value: "all", label: "全部" },
                                    { value: "write", label: "写入" },
                                    { value: "read", label: "扫描" },
                                    { value: "bind", label: "绑定" },
                                ]} />
                            <Button size="small" icon={<ClearOutlined />} onClick={op.clearHistory}
                                disabled={op.history.length === 0}>清空</Button>
                        </Space>
                    </Space>
                }
                style={{ borderRadius: 12 }}
            >
                {filteredHistory.length === 0 ? (
                    <Text type="secondary" style={{ display: "block", textAlign: "center", padding: 24 }}>
                        暂无操作记录
                    </Text>
                ) : (
                    <Timeline
                        items={filteredHistory.slice(0, 30).map((h) => ({
                            color: h.success ? "green" : "red",
                            dot: h.success ? <CheckCircleOutlined /> : <CloseCircleOutlined />,
                            children: (
                                <div>
                                    <Text>{h.message}</Text>
                                    <br />
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        <Tag style={{ fontSize: 10 }}>{h.type}</Tag>
                                        {h.timestamp}
                                    </Text>
                                </div>
                            ),
                        }))}
                    />
                )}
            </Card>

            {/* 新手引导 */}
            <Tour
                open={op.tourOpen}
                onClose={() => { op.setTourOpen(false); localStorage.setItem("nfc_tour_completed", "1"); }}
                steps={[
                    { title: "安全 PIN", description: "设置 4-8 位 PIN 码保护操作", target: () => document.querySelector(".ant-input-password")! },
                    { title: "移动端扫描", description: "手机扫码打开 NFC 扫描页面", target: () => document.querySelector("canvas")! },
                    { title: "写入标签", description: "选择书架后点击写入，将信息写入 NFC 标签", target: () => document.querySelector(".ant-btn-primary")! },
                ]}
            />
        </div>
    );
};

export default NFCOperator;
