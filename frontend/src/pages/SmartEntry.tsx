// frontend/src/pages/SmartEntry.tsx
/**
 * 智能录入页面 - React 19 + Ant Design 6
 *
 * 架构：useSmartEntry Hook 管理全部状态 + 4 个 Tab 面板
 */

import React, { useEffect, type FC } from "react";
import {
    Card, Tabs, Button, Input, Space, Typography, Upload, Table, Tag,
    Steps, Alert, Result, Breadcrumb, App, theme, Progress, Spin, Empty, List, Avatar,
} from "antd";
import {
    CameraOutlined, SearchOutlined, ThunderboltOutlined, RobotOutlined,
    UploadOutlined, BookOutlined, HomeOutlined, BarcodeOutlined,
    CheckCircleOutlined, LoadingOutlined, ReloadOutlined, SendOutlined,
    FileTextOutlined, QuestionCircleOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useSmartEntry } from "../hooks/useSmartEntry";

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

const SmartEntry: FC = () => {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const { token } = theme.useToken();
    const se = useSmartEntry();

    useEffect(() => { se.loadMissingBooks(); }, []);

    const tabItems = [
        {
            key: "single",
            label: <span><CameraOutlined /> 单本录入</span>,
            children: (
                <Card style={{ borderRadius: 12 }}>
                    <Title level={5}>上传封面图片或扫描ISBN</Title>
                    <Dragger
                        accept="image/*"
                        maxCount={1}
                        beforeUpload={(file) => { se.setImageFile(file); se.setImagePreview(URL.createObjectURL(file)); se.handleScanBarcode(file); return false; }}
                        showUploadList={false}
                        style={{ marginBottom: 16 }}
                    >
                        <p className="ant-upload-drag-icon"><CameraOutlined style={{ fontSize: 48, color: token.colorPrimary }} /></p>
                        <p className="ant-upload-text">点击或拖拽图片到此区域</p>
                        <p className="ant-upload-hint">系统将自动识别条形码和提取ISBN</p>
                    </Dragger>

                    {se.imagePreview && (
                        <div style={{ textAlign: "center", marginBottom: 16 }}>
                            <img src={se.imagePreview} alt="Preview" style={{ maxHeight: 200, borderRadius: 8 }} />
                        </div>
                    )}

                    <Space direction="vertical" style={{ width: "100%" }}>
                        <Input.Search
                            placeholder="或手动输入 ISBN"
                            prefix={<BarcodeOutlined />}
                            value={se.manualISBN}
                            onChange={(e) => se.setManualISBN(e.target.value)}
                            onSearch={se.handleLookup}
                            enterButton={<><SearchOutlined /> 查询</>}
                            loading={se.lookingUp}
                        />
                        {se.extractedISBN && (
                            <Alert message={`识别到 ISBN: ${se.extractedISBN}`} type="success" showIcon />
                        )}
                        {se.lookupError && (
                            <Alert message={se.lookupError} type="error" showIcon closable onClose={() => se.setLookupError(null)} />
                        )}
                    </Space>
                </Card>
            ),
        },
        {
            key: "enrich",
            label: <span><ThunderboltOutlined /> 信息补全</span>,
            children: (
                <Card style={{ borderRadius: 12 }}>
                    <Space style={{ marginBottom: 16 }}>
                        <Button type="primary" icon={<ReloadOutlined />} onClick={se.loadMissingBooks} loading={se.missingLoading}>
                            刷新列表
                        </Button>
                        <Button icon={<ThunderboltOutlined />} onClick={se.handleBatchEnrich} loading={se.batchEnriching}
                            disabled={se.missingBooks.length === 0}>
                            批量补全
                        </Button>
                    </Space>

                    {se.missingBooks.length === 0 && !se.missingLoading ? (
                        <Empty description="暂无缺失信息图书 🎉" />
                    ) : (
                        <List
                            loading={se.missingLoading}
                            dataSource={se.missingBooks as Array<{ book_id: number; title: string; missing_fields?: string[] }>}
                            renderItem={(item) => (
                                <List.Item
                                    actions={[
                                        <Button
                                            key="enrich"
                                            type="link"
                                            icon={<ThunderboltOutlined />}
                                            onClick={() => se.handleEnrichSingle(item.book_id)}
                                            loading={se.enriching}
                                        >
                                            补全
                                        </Button>,
                                    ]}
                                >
                                    <List.Item.Meta
                                        avatar={<BookOutlined style={{ fontSize: 24 }} />}
                                        title={item.title}
                                        description={item.missing_fields?.join("、") || "信息不完整"}
                                    />
                                </List.Item>
                            )}
                        />
                    )}
                </Card>
            ),
        },
        {
            key: "batch",
            label: <span><FileTextOutlined /> 批量导入</span>,
            children: (
                <Card style={{ borderRadius: 12 }}>
                    <Empty description="批量导入请使用">
                        <Button type="primary" icon={<UploadOutlined />} onClick={() => navigate("/import")}>
                            前往批量导入
                        </Button>
                    </Empty>
                </Card>
            ),
        },
        {
            key: "chat",
            label: <span><RobotOutlined /> AI 助手</span>,
            children: (
                <Card style={{ borderRadius: 12, height: 500, display: "flex", flexDirection: "column" }}>
                    <div style={{ flex: 1, overflow: "auto", marginBottom: 16 }}>
                        {se.chatMessages.length === 0 ? (
                            <Empty description="向 AI 助手提问，帮你录入图书信息" />
                        ) : (
                            se.chatMessages.map((msg, i) => (
                                <div key={i} style={{
                                    textAlign: msg.role === "user" ? "right" : "left",
                                    marginBottom: 12,
                                }}>
                                    <div style={{
                                        display: "inline-block",
                                        maxWidth: "80%",
                                        padding: "8px 16px",
                                        borderRadius: 12,
                                        background: msg.role === "user" ? token.colorPrimary : "#f0f0f0",
                                        color: msg.role === "user" ? "#fff" : "#333",
                                    }}>
                                        {msg.content}
                                    </div>
                                </div>
                            ))
                        )}
                        {se.chatLoading && (
                            <div style={{ textAlign: "center" }}>
                                <Spin indicator={<LoadingOutlined />} />
                            </div>
                        )}
                    </div>
                    <Space.Compact style={{ width: "100%" }}>
                        <Input
                            placeholder="输入书名或ISBN..."
                            value={se.chatInput}
                            onChange={(e) => se.setChatInput(e.target.value)}
                            onPressEnter={se.handleChatSend}
                        />
                        <Button type="primary" icon={<SendOutlined />} onClick={se.handleChatSend} loading={se.chatLoading}>
                            发送
                        </Button>
                    </Space.Compact>
                </Card>
            ),
        },
    ];

    return (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
            <Breadcrumb
                style={{ marginBottom: 16 }}
                items={[
                    { title: <a onClick={() => navigate("/")}><HomeOutlined /> 首页</a> },
                    { title: <span><RobotOutlined /> 智能录入</span> },
                ]}
            />

            <Title level={2} style={{ marginBottom: 24 }}>
                <RobotOutlined style={{ marginRight: 12, color: token.colorPrimary }} />
                智能录入
            </Title>

            <Tabs
                activeKey={se.activeTab}
                onChange={(k) => se.setActiveTab(k as typeof se.activeTab)}
                items={tabItems}
                size="large"
            />
        </div>
    );
};

export default SmartEntry;
