// components/VirtualTable.tsx
/**
 * 虚拟滚动表格 - P2 优化版
 *
 * 优化项：
 * - 样式迁移至 CSS Module (VirtualTable.module.css)
 * - VirtualRow 拆分为独立 memo 组件
 * - :hover 替代 onMouseEnter/onMouseLeave DOM 操作
 * - 列宽响应式计算用 useMemo
 * - 全选逻辑提取为独立函数
 *
 * 性能目标：万级数据滚动 FPS ≥ 55
 */

import React, { useRef, useMemo, useCallback, type CSSProperties, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Empty, Skeleton, Checkbox } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import VirtualRow from "./virtual/VirtualRow";
import type { VirtualColumn, SortConfig, VirtualTableProps } from "./virtual/types";
import styles from "./virtual/VirtualTable.module.css";

export type { VirtualColumn, SortConfig, VirtualTableProps };

const DEFAULT_ROW_HEIGHT = 48;
const DEFAULT_HEADER_HEIGHT = 44;
const DEFAULT_HEIGHT = 600;
const DEFAULT_OVERSCAN = 8;

function VirtualTable<T>({
    data, columns, rowHeight = DEFAULT_ROW_HEIGHT,
    headerHeight = DEFAULT_HEADER_HEIGHT, height = DEFAULT_HEIGHT,
    emptyText = "暂无数据", loading = false, onRowClick,
    rowKey, sortConfig, onSortChange,
    selectable = false, selectedRowKeys = [], onSelectionChange,
    style, className, overscan = DEFAULT_OVERSCAN,
}: VirtualTableProps<T>) {
    const containerRef = useRef<HTMLDivElement>(null);

    // ---- Virtualizer ----
    const virtualizer = useVirtualizer({
        count: data.length,
        getScrollElement: () => containerRef.current,
        estimateSize: () => rowHeight,
        overscan,
    });
    const virtualItems = virtualizer.getVirtualItems();

    // ---- Column width calculation (memoized) ----
    const columnWidths = useMemo(() => {
        const totalFixed = columns.reduce((sum, c) => sum + (c.width || 0), 0);
        return columns.map((col) => ({
            key: col.key,
            width: col.width,
            flex: col.width ? undefined : 1,
            minWidth: col.minWidth || 50,
            sortable: col.sortable,
            title: col.title,
            headerRender: col.headerRender,
            render: col.render,
            align: col.align || "left",
        }));
    }, [columns]);

    const totalWidth = useMemo(
        () => columnWidths.reduce((s, c) => s + (c.width || 150), selectable ? 48 : 0),
        [columnWidths, selectable]
    );

    // ---- Sort handler ----
    const handleSortClick = useCallback(
        (col: VirtualColumn<T>) => {
            if (!onSortChange) return;
            if (sortConfig?.key === col.key) {
                onSortChange(
                    sortConfig.direction === "asc"
                        ? { key: col.key, direction: "desc" }
                        : null
                );
            } else {
                onSortChange({ key: col.key, direction: "asc" });
            }
        },
        [sortConfig, onSortChange]
    );

    // ---- Selection handlers ----
    const selectedSet = useMemo(() => new Set(selectedRowKeys), [selectedRowKeys]);

    const handleRowSelect = useCallback(
        (index: number, checked: boolean) => {
            if (!onSelectionChange) return;
            const record = data[index];
            const key = rowKey ? rowKey(record, index) : index;
            const next = checked
                ? [...selectedRowKeys, key]
                : selectedRowKeys.filter((k) => k !== key);
            onSelectionChange(next);
        },
        [data, rowKey, selectedRowKeys, onSelectionChange]
    );

    const handleSelectAll = useCallback(
        (checked: boolean) => {
            if (!onSelectionChange) return;
            if (checked) {
                onSelectionChange(data.map((r, i) => rowKey ? rowKey(r, i) : i));
            } else {
                onSelectionChange([]);
            }
        },
        [data, rowKey, onSelectionChange]
    );

    const isAllSelected = data.length > 0 && selectedRowKeys.length === data.length;
    const isSomeSelected = selectedRowKeys.length > 0 && selectedRowKeys.length < data.length;

    // ---- Loading skeleton ----
    if (loading && data.length === 0) {
        return (
            <div className={`${styles.container} ${styles.loading} ${className ?? ""}`} style={style}>
                <Skeleton active paragraph={{ rows: 8 }} style={{ padding: 16 }} />
            </div>
        );
    }

    // ---- Empty state ----
    if (!loading && data.length === 0) {
        return (
            <div className={`${styles.container} ${className ?? ""}`} style={style}>
                <Empty description={emptyText} className={styles.empty} />
            </div>
        );
    }

    return (
        <div className={`${styles.container} ${className ?? ""}`} style={style}>
            {/* Header */}
            <div className={styles.header} style={{ height: headerHeight }}>
                {selectable && (
                    <div className={styles.selectAll}>
                        <Checkbox
                            checked={isAllSelected}
                            indeterminate={isSomeSelected}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                        />
                    </div>
                )}
                {columnWidths.map((col) => {
                    const isSorted = sortConfig?.key === col.key;
                    return (
                        <div
                            key={col.key}
                            role="columnheader"
                            aria-sort={isSorted ? (sortConfig?.direction === "asc" ? "ascending" : "descending") : undefined}
                            className={`${styles.headerCell} ${col.sortable ? styles.headerCellSortable : ""}`}
                            style={{
                                width: col.width,
                                flex: col.flex,
                                minWidth: col.minWidth,
                                textAlign: col.align,
                            }}
                            onClick={() => col.sortable && handleSortClick(col)}
                        >
                            {col.headerRender ? col.headerRender(col.title) : col.title}
                            {col.sortable && (
                                <span className={`${styles.sortIcon} ${isSorted ? styles.sortIconActive : ""}`}>
                                    {isSorted && sortConfig?.direction === "asc" ? "▲" : "▼"}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Virtual scroll body */}
            <div
                ref={containerRef}
                className={styles.scrollContainer}
                style={{ height: height - headerHeight }}
            >
                <div
                    className={styles.scrollInner}
                    style={{ height: virtualizer.getTotalSize(), minWidth: totalWidth }}
                >
                    {virtualItems.map((virtualItem) => {
                        const record = data[virtualItem.index];
                        const key = rowKey ? rowKey(record, virtualItem.index) : virtualItem.index;
                        return (
                            <VirtualRow
                                key={virtualItem.key}
                                record={record}
                                index={virtualItem.index}
                                columns={columns}
                                height={virtualItem.size}
                                start={virtualItem.start}
                                selected={selectedSet.has(key)}
                                selectable={selectable}
                                onClick={onRowClick}
                                onSelect={handleRowSelect}
                                rowKey={rowKey}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default VirtualTable;
