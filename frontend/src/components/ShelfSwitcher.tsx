// frontend/src/components/ShelfSwitcher.tsx
/**
 * 书架切换器组件
 *
 * 架构：useShelfSwitcher Hook + 3 种视图模式 (dropdown/grid/sidebar)
 */

import React, { type FC } from "react";
import {
    Dropdown, Button, Input, Card, Space, Typography, Spin, Empty, Segmented, Drawer,
    Badge, Tooltip, theme,
} from "antd";
import {
    AppstoreOutlined, UnorderedListOutlined, MenuOutlined,
    BookOutlined, SearchOutlined, ReloadOutlined,
} from "@ant-design/icons";
import { useShelfSwitcher } from "../hooks/useShelfSwitcher";
import type { ShelfInfo } from "../types";

const { Text } = Typography;

const CARD_COLORS = [
    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
    "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
    "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
];

const getCardGradient = (idx: number) => CARD_COLORS[idx % CARD_COLORS.length];

interface ShelfSwitcherProps {
    currentShelfId?: number;
}

const ShelfSwitcher: FC<ShelfSwitcherProps> = ({ currentShelfId }) => {
    const { token } = theme.useToken();
    const sw = useShelfSwitcher({ currentShelfId });

    const currentShelf = sw.shelves.find((s) => s.logical_shelf_id === currentShelfId);

    const dropdownItems = sw.filteredShelves.slice(0, 20).map((s) => ({
        key: String(s.logical_shelf_id),
        label: (
            <Space>
                <BookOutlined />
                <span>{s.shelf_name}</span>
                <Badge count={s.book_count} size="small" style={{ backgroundColor: token.colorPrimary }} />
            </Space>
        ),
        onClick: () => sw.handleSelect(s.logical_shelf_id),
    }));

    return (
        <>
            {/* Dropdown 模式 */}
            <Dropdown menu={{ items: dropdownItems }} trigger={["click"]} placement="bottomLeft">
                <Button icon={<BookOutlined />} type="text" style={{ fontWeight: 500 }}>
                    {currentShelf?.shelf_name ?? "选择书架"}
                </Button>
            </Dropdown>

            {/* Grid 模式 (小弹窗) */}
            <Button
                icon={<AppstoreOutlined />}
                type="text"
                onClick={() => { sw.setShowPanel(true); sw.setViewMode("grid"); }}
                style={{ marginLeft: 4 }}
            />

            {/* Sidebar 侧边栏 */}
            <Drawer
                title={
                    <Space style={{ width: "100%", justifyContent: "space-between" }}>
                        <span>📚 书架列表</span>
                        <Button icon={<ReloadOutlined />} size="small" onClick={sw.refresh} loading={sw.loading} />
                    </Space>
                }
                open={sw.showPanel}
                onClose={() => sw.setShowPanel(false)}
                width={320}
            >
                <Input.Search
                    placeholder="搜索书架..."
                    prefix={<SearchOutlined />}
                    value={sw.searchText}
                    onChange={(e) => sw.setSearchText(e.target.value)}
                    style={{ marginBottom: 16 }}
                    allowClear
                />

                <Segmented
                    block
                    value={sw.viewMode}
                    onChange={(v) => sw.setViewMode(v as typeof sw.viewMode)}
                    options={[
                        { value: "grid", icon: <AppstoreOutlined /> },
                        { value: "sidebar", icon: <MenuOutlined /> },
                    ]}
                    style={{ marginBottom: 16 }}
                />

                {sw.loading ? (
                    <Spin style={{ display: "block", textAlign: "center", padding: 40 }} />
                ) : sw.filteredShelves.length === 0 ? (
                    <Empty description="暂无书架" />
                ) : sw.viewMode === "grid" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {sw.filteredShelves.map((s, i) => (
                            <Card
                                key={s.logical_shelf_id}
                                size="small"
                                hoverable
                                onClick={() => sw.handleSelect(s.logical_shelf_id)}
                                style={{
                                    borderRadius: 10,
                                    background: getCardGradient(i),
                                    color: "#fff",
                                    border: "none",
                                    cursor: "pointer",
                                }}
                            >
                                <Text strong style={{ color: "#fff", display: "block" }}>{s.shelf_name}</Text>
                                <Badge count={s.book_count} style={{ marginTop: 4 }} />
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div>
                        {sw.filteredShelves.map((s) => (
                            <div
                                key={s.logical_shelf_id}
                                onClick={() => sw.handleSelect(s.logical_shelf_id)}
                                style={{
                                    padding: "10px 12px",
                                    borderRadius: 8,
                                    cursor: "pointer",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    background: s.logical_shelf_id === currentShelfId ? `${token.colorPrimary}15` : "transparent",
                                    marginBottom: 4,
                                    transition: "background 0.2s",
                                }}
                            >
                                <Space>
                                    <BookOutlined style={{ color: token.colorPrimary }} />
                                    <Text>{s.shelf_name}</Text>
                                </Space>
                                <Badge count={s.book_count} size="small" />
                            </div>
                        ))}
                    </div>
                )}
            </Drawer>
        </>
    );
};

export default ShelfSwitcher;
