// frontend/src/pages/AllBooksManager.tsx
/**
 * 全量图书管理页面
 *
 * 架构：useBookTable Hook + FilterBar + 批量操作
 */

import React, { type FC } from "react";
import {
    Card, Table, Button, Input, Space, Typography, Select, Tag, Popconfirm,
    Breadcrumb, App, theme, Modal, Row, Col, Tooltip,
} from "antd";
import {
    HomeOutlined, BookOutlined, DeleteOutlined, EditOutlined, ReloadOutlined,
    SearchOutlined, FilterOutlined, SwapOutlined, TagsOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useBookTable } from "../hooks/useBookTable";
import type { Book } from "../types";
import type { TableColumnsType } from "antd";

const { Title, Text } = Typography;

const AllBooksManager: FC = () => {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const { token } = theme.useToken();
    const tbl = useBookTable();

    const columns: TableColumnsType<Book> = [
        { title: "ID", dataIndex: "book_id", width: 60 },
        { title: "封面", dataIndex: "cover_url", width: 60, render: (url: string) => url ? <img src={url} style={{ width: 40, height: 56, borderRadius: 4, objectFit: "cover" }} /> : <BookOutlined style={{ fontSize: 24, color: "#ccc" }} /> },
        { title: "书名", dataIndex: "title", ellipsis: true, sorter: true,
            render: (t: string, r: Book) => <a onClick={() => navigate(`/books/${r.book_id}`)}>{t}</a> },
        { title: "ISBN", dataIndex: "isbn", width: 120, render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
        { title: "作者", dataIndex: "author", width: 100, ellipsis: true },
        { title: "来源", dataIndex: "source", width: 80, render: (v: string) => {
            const m: Record<string, { color: string; text: string }> = { douban: { color: "green", text: "豆瓣" }, manual: { color: "blue", text: "手动" }, smart_entry: { color: "purple", text: "智能" } };
            const c = m[v] || { color: "default", text: v };
            return <Tag color={c.color}>{c.text}</Tag>;
        }},
        { title: "操作", key: "actions", width: 100, render: (_: unknown, r: Book) => (
            <Space>
                <Tooltip title="编辑"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => navigate(`/books/${r.book_id}/edit`)} /></Tooltip>
                <Popconfirm title="确认删除？" onConfirm={() => tbl.handleDelete(r.book_id)}>
                    <Tooltip title="删除"><Button type="link" danger size="small" icon={<DeleteOutlined />} /></Tooltip>
                </Popconfirm>
            </Space>
        )},
    ];

    return (
        <div style={{ maxWidth: 1600, margin: "0 auto", padding: 24 }}>
            <Breadcrumb style={{ marginBottom: 16 }}
                items={[{ title: <a onClick={() => navigate("/")}><HomeOutlined /> 首页</a> }, { title: "图书管理" }]} />

            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                <Title level={2} style={{ margin: 0 }}><BookOutlined style={{ marginRight: 12, color: token.colorPrimary }} />图书管理</Title>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={tbl.refresh}>刷新</Button>
                    <Button type="primary" onClick={() => navigate("/books/add")}>添加图书</Button>
                </Space>
            </div>

            {/* Filter Bar */}
            <Card size="small" style={{ borderRadius: 12, marginBottom: 16 }}>
                <Row gutter={[12, 12]} align="middle">
                    <Col xs={24} sm={8} md={6}>
                        <Input prefix={<SearchOutlined />} placeholder="搜索书名/ISBN"
                            value={tbl.searchKeyword} onChange={(e) => tbl.setSearchKeyword(e.target.value)} allowClear />
                    </Col>
                    <Col xs={12} sm={6} md={4}>
                        <Select placeholder="来源" allowClear value={tbl.filterSource || undefined} onChange={(v) => tbl.setFilterSource(v || "")}
                            style={{ width: "100%" }} options={[
                                { value: "douban", label: "豆瓣" }, { value: "manual", label: "手动" }, { value: "smart_entry", label: "智能录入" },
                            ]} />
                    </Col>
                    <Col xs={12} sm={6} md={4}>
                        <Select placeholder="书架" allowClear value={tbl.filterShelfId} onChange={tbl.setFilterShelfId}
                            style={{ width: "100%" }} options={tbl.shelfList} />
                    </Col>
                    <Col>
                        {tbl.selectedRowKeys.length > 0 && (
                            <Space>
                                <Text>{tbl.selectedRowKeys.length} 项已选</Text>
                                <Popconfirm title={`删除 ${tbl.selectedRowKeys.length} 本图书？`} onConfirm={tbl.handleBatchDelete}>
                                    <Button danger size="small" icon={<DeleteOutlined />}>批量删除</Button>
                                </Popconfirm>
                            </Space>
                        )}
                    </Col>
                </Row>
            </Card>

            {/* Table */}
            <Card style={{ borderRadius: 12 }}>
                <Table<Book>
                    rowKey="book_id"
                    columns={columns}
                    dataSource={tbl.books}
                    loading={tbl.loading}
                    rowSelection={{
                        selectedRowKeys: tbl.selectedRowKeys,
                        onChange: (keys) => tbl.setSelectedRowKeys(keys as number[]),
                    }}
                    pagination={{
                        current: tbl.currentPage,
                        pageSize: tbl.pageSize,
                        total: tbl.total,
                        showSizeChanger: true,
                        showTotal: (t) => `共 ${t} 本`,
                        onChange: (p, ps) => { tbl.setCurrentPage(p); tbl.setPageSize(ps); },
                    }}
                    scroll={{ x: 800 }}
                    size="middle"
                />
            </Card>
        </div>
    );
};

export default AllBooksManager;
