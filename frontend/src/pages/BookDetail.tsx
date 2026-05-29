// frontend/src/pages/BookDetail.tsx
/**
 * 图书详情页面 - React 19 + Ant Design 6
 *
 * 架构：useBookDetail Hook + 状态分支渲染
 */

import React, { type FC } from "react";
import {
    Card, Descriptions, Button, Space, Typography, Skeleton, Result,
    Tag, Breadcrumb, App, theme, Divider, Dropdown, Image, Timeline, Popconfirm,
} from "antd";
import {
    HomeOutlined, BookOutlined, SyncOutlined, DeleteOutlined, CopyOutlined,
    ShareAltOutlined, EditOutlined, MoreOutlined, StarFilled, EnvironmentOutlined,
    CalendarOutlined, InfoCircleOutlined, LinkOutlined, UserOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useBookDetail } from "../hooks/useBookDetail";
import { getImageProxyUrl } from "../services/api";
import UnifiedCover from "../components/UnifiedCover";
import ShelfSelector from "../components/ShelfSelector";

const { Title, Text, Paragraph } = Typography;

const BookDetail: FC = () => {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const { token } = theme.useToken();
    const detail = useBookDetail();

    // ---- Loading ----
    if (detail.loading) {
        return (
            <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
                <Skeleton active paragraph={{ rows: 8 }} />
                <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
                    <Skeleton.Image style={{ width: 200, height: 280 }} />
                    <Skeleton active paragraph={{ rows: 12 }} style={{ flex: 1 }} />
                </div>
            </div>
        );
    }

    // ---- Error ----
    if (detail.error || !detail.book) {
        return (
            <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
                <Result
                    status="error"
                    title="加载失败"
                    subTitle={detail.error ?? "未找到该图书"}
                    extra={<Button type="primary" onClick={() => navigate("/search")}>返回搜索</Button>}
                />
            </div>
        );
    }

    const { book } = detail;
    const coverSrc = book.cover_url ? getImageProxyUrl(book.cover_url) : undefined;

    const menuItems = [
        { key: "edit", icon: <EditOutlined />, label: "编辑", onClick: () => navigate(`/books/${book.book_id}/edit`) },
        { key: "sync", icon: <SyncOutlined />, label: "同步豆瓣", onClick: detail.handleSync, disabled: detail.syncing },
        { key: "copy", icon: <CopyOutlined />, label: "复制 ISBN", onClick: detail.handleCopyISBN },
        { key: "share", icon: <ShareAltOutlined />, label: "分享", onClick: detail.handleShare },
        { type: "divider" as const },
        {
            key: "delete",
            icon: <DeleteOutlined />,
            label: <span style={{ color: "#ff4d4f" }}>删除</span>,
            danger: true,
            onClick: () => {
                detail.handleRemove();
            },
        },
    ];

    return (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
            <Breadcrumb
                style={{ marginBottom: 16 }}
                items={[
                    { title: <a onClick={() => navigate("/")}><HomeOutlined /> 首页</a> },
                    { title: <span><BookOutlined /> {book.title}</span> },
                ]}
            />

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
                <div>
                    <Title level={2} style={{ margin: 0 }}>{book.title}</Title>
                    {book.author && (
                        <Text type="secondary" style={{ fontSize: 16 }}>
                            <UserOutlined style={{ marginRight: 4 }} />
                            {book.author}
                            {book.translator && ` / 译: ${book.translator}`}
                        </Text>
                    )}
                </div>
                <Space>
                    <Button icon={<SyncOutlined />} onClick={detail.handleSync} loading={detail.syncing}>
                        同步
                    </Button>
                    <Button icon={<EditOutlined />} onClick={() => navigate(`/books/${book.book_id}/edit`)}>
                        编辑
                    </Button>
                    <Dropdown menu={{ items: menuItems }} trigger={["click"]}>
                        <Button icon={<MoreOutlined />} />
                    </Dropdown>
                </Space>
            </div>

            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {/* Cover */}
                <div style={{ flexShrink: 0 }}>
                    <UnifiedCover
                        src={coverSrc}
                        alt={book.title}
                        style={{ width: 200, borderRadius: 8, boxShadow: "0 2px 12px rgba(0,0,0,0.15)", cursor: coverSrc ? "pointer" : undefined }}
                        onClick={() => coverSrc && detail.setImagePreviewVisible(true)}
                        fallback={<div style={{ width: 200, height: 280, background: "#f5f5f5", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb" }}>暂无封面</div>}
                    />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 300 }}>
                    <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                        <Descriptions.Item label="ISBN"><Text code>{book.isbn}</Text></Descriptions.Item>
                        {book.publisher && <Descriptions.Item label="出版社">{book.publisher}</Descriptions.Item>}
                        {book.publish_date && <Descriptions.Item label="出版日期"><CalendarOutlined style={{ marginRight: 4 }} />{book.publish_date}</Descriptions.Item>}
                        {book.pages && <Descriptions.Item label="页数">{book.pages}</Descriptions.Item>}
                        {book.binding && <Descriptions.Item label="装帧">{book.binding}</Descriptions.Item>}
                        {book.price && <Descriptions.Item label="定价">{book.price}</Descriptions.Item>}
                        {book.rating && (
                            <Descriptions.Item label="评分">
                                <StarFilled style={{ color: "#faad14", marginRight: 4 }} />{book.rating}
                            </Descriptions.Item>
                        )}
                        {book.series && <Descriptions.Item label="丛书">{book.series}</Descriptions.Item>}
                        {book.original_title && <Descriptions.Item label="原版书名">{book.original_title}</Descriptions.Item>}
                        {book.source && (
                            <Descriptions.Item label="来源">
                                <Tag>{book.source === "douban" ? "豆瓣" : book.source === "manual" ? "手动" : book.source === "smart_entry" ? "智能录入" : book.source}</Tag>
                            </Descriptions.Item>
                        )}
                        {book.douban_url && (
                            <Descriptions.Item label="豆瓣">
                                <a href={book.douban_url} target="_blank" rel="noreferrer"><LinkOutlined /> 查看</a>
                            </Descriptions.Item>
                        )}
                        {book.shelves && book.shelves.length > 0 && (
                            <Descriptions.Item label="所在书架">
                                {book.shelves.map((s) => (
                                    <Tag key={s.shelf_id} color="blue" style={{ cursor: "pointer" }}
                                        onClick={() => navigate(`/shelf/${s.shelf_id}`)}>
                                        {s.shelf_name}
                                    </Tag>
                                ))}
                            </Descriptions.Item>
                        )}
                    </Descriptions>

                    {book.summary && (
                        <>
                            <Divider />
                            <Text strong>内容简介</Text>
                            <Paragraph style={{ marginTop: 8, whiteSpace: "pre-wrap", color: "#666" }}>
                                {book.summary}
                            </Paragraph>
                        </>
                    )}
                </div>
            </div>

            {/* Image Preview */}
            {coverSrc && (
                <Image
                    style={{ display: "none" }}
                    src={coverSrc}
                    preview={{
                        visible: detail.imagePreviewVisible,
                        onVisibleChange: detail.setImagePreviewVisible,
                    }}
                />
            )}
        </div>
    );
};

export default BookDetail;
