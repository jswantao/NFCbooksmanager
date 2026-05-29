// frontend/src/pages/BookCoverWall.tsx
/**
 * 封面墙页面 - React 19 + Ant Design 6
 *
 * 架构：useInfiniteBookWall (数据) + useResponsiveColumns (布局) + BookCard (展示)
 */

import React, { useState, useCallback, useEffect, type FC } from "react";
import {
    Card, Input, Select, Button, Space, Typography, Spin, Empty, Alert,
    Breadcrumb, FloatButton, Tooltip, Segmented, theme, Skeleton,
} from "antd";
import {
    AppstoreOutlined, UnorderedListOutlined, FullscreenOutlined,
    FullscreenExitOutlined, HomeOutlined, ReloadOutlined, SearchOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useInfiniteBookWall } from "../hooks/useInfiniteBookWall";
import { useResponsiveColumns } from "../hooks/useResponsiveColumns";
import BookCard from "../components/BookCard";
import type { Book } from "../types";

const { Title, Text } = Typography;

const SORT_OPTIONS = [
    { label: "默认排序", value: "default" },
    { label: "书名 A-Z", value: "title_asc" },
    { label: "作者 A-Z", value: "author_asc" },
    { label: "最近添加", value: "added_desc" },
    { label: "评分最高", value: "rating_desc" },
];

const DENSITY_ICONS: Record<string, React.ReactNode> = {
    compact: <AppstoreOutlined />,
    normal: <UnorderedListOutlined />,
    loose: <AppstoreOutlined />,
};

const BookCoverWall: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();

    const [selectedShelfId] = useState<number | undefined>();
    const [sortBy, setSortBy] = useState<string>("default");
    const [density, setDensity] = useState<string>("normal");
    const [searchText, setSearchText] = useState("");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [selectedBook, setSelectedBook] = useState<Book | null>(null);

    const { books, total, loading, loadingMore, hasMore, error, loadMore, refresh } =
        useInfiniteBookWall(selectedShelfId, sortBy, searchText);

    const columns = useResponsiveColumns();

    const toggleFullscreen = useCallback(() => setIsFullscreen((v) => !v), []);

    const handleScroll = useCallback(() => {
        if (loadingMore || !hasMore) return;
        const scrollY = window.scrollY + window.innerHeight;
        const docHeight = document.documentElement.scrollHeight;
        if (scrollY >= docHeight - 400) loadMore();
    }, [loadingMore, hasMore, loadMore]);

    useEffect(() => {
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, [handleScroll]);

    const densityConfig: Record<string, number> = { compact: 8, normal: 16, loose: 24 };
    const gap = isFullscreen ? 12 : densityConfig[density] ?? 16;
    const colCount = isFullscreen ? Math.max(columns + 2, 6) : columns;

    if (loading) {
        return (
            <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
                <Skeleton active paragraph={{ rows: 2 }} />
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 16, marginTop: 24 }}>
                    {Array.from({ length: 12 }).map((_, i) => (
                        <Card key={i} style={{ borderRadius: 12 }}>
                            <Skeleton.Image style={{ width: "100%", height: 200 }} active />
                            <Skeleton active paragraph={{ rows: 1 }} style={{ marginTop: 8 }} />
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
                <Alert type="error" message="加载失败" description={error}
                    action={<Button onClick={refresh} icon={<ReloadOutlined />}>重试</Button>} />
            </div>
        );
    }

    return (
        <div style={{ maxWidth: isFullscreen ? "100%" : 1400, margin: "0 auto", padding: isFullscreen ? 16 : 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
                <Title level={2} style={{ margin: 0 }}>📚 封面墙</Title>
                <Space wrap>
                    <Input placeholder="搜索书名..." prefix={<SearchOutlined />}
                        value={searchText} onChange={(e) => setSearchText(e.target.value)}
                        style={{ width: 200 }} allowClear />
                    <Select value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} style={{ width: 130 }} />
                    <Segmented value={density} onChange={(v) => setDensity(v as string)}
                        options={["compact", "normal", "loose"].map((v) => ({
                            label: <Tooltip title={v}>{DENSITY_ICONS[v]}</Tooltip>,
                            value: v,
                        }))} />
                    <Tooltip title={isFullscreen ? "退出全屏" : "全屏"}>
                        <Button icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                            onClick={toggleFullscreen} />
                    </Tooltip>
                </Space>
            </div>

            <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>共 {total} 本图书</Text>

            {books.length === 0 && !loading ? (
                <Empty description="暂无图书" style={{ padding: 60 }} />
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${colCount}, 1fr)`, gap }}>
                    {books.map((book) => (
                        <BookCard key={book.book_id ?? book.isbn} book={book} />
                    ))}
                </div>
            )}

            {loadingMore && (
                <div style={{ textAlign: "center", padding: 24 }}><Spin tip="加载更多..." /></div>
            )}
            {!hasMore && books.length > 0 && (
                <div style={{ textAlign: "center", padding: 24, color: "#8c8c8c" }}>— 已展示全部 {total} 本 —</div>
            )}

            <FloatButton.BackTop visibilityHeight={400} style={{ right: 40, bottom: 40 }} />
        </div>
    );
};

export default BookCoverWall;
