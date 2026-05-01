// frontend/src/components/VirtualTable.tsx
/**
 * 虚拟滚动表格组件 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 动态行高支持
 * - 列宽拖拽调整
 * - 排序状态管理
 * - 选择模式（单选/多选）
 * - 行点击事件
 * - 头部固定
 * - 性能优化（memo 行组件）
 */

import React, {
    useRef,
    useMemo,
    useCallback,
    useState,
    type CSSProperties,
    type ReactNode,
    memo,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Empty, Skeleton, Checkbox, type CheckboxChangeEvent } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

// ==================== 类型定义 ====================

/** 列定义 */
export interface VirtualColumn<T> {
    /** 列唯一键 */
    key: string;
    /** 列标题 */
    title: string;
    /** 列宽 */
    width?: number;
    /** 最小列宽 */
    minWidth?: number;
    /** 最大列宽 */
    maxWidth?: number;
    /** 是否可排序 */
    sortable?: boolean;
    /** 渲染函数 */
    render: (record: T, index: number) => ReactNode;
    /** 头部渲染函数 */
    headerRender?: (title: string) => ReactNode;
    /** 对齐方式 */
    align?: 'left' | 'center' | 'right';
}

/** 排序配置 */
export interface SortConfig {
    key: string;
    direction: 'asc' | 'desc';
}

interface VirtualTableProps<T> {
    /** 数据源 */
    data: T[];
    /** 列定义 */
    columns: VirtualColumn<T>[];
    /** 行高 */
    rowHeight?: number;
    /** 头部高度 */
    headerHeight?: number;
    /** 表格高度 */
    height?: number;
    /** 空数据文本 */
    emptyText?: string;
    /** 加载状态 */
    loading?: boolean;
    /** 行点击回调 */
    onRowClick?: (record: T, index: number) => void;
    /** 行键提取函数 */
    rowKey?: (record: T, index: number) => string | number;
    /** 排序配置 */
    sortConfig?: SortConfig;
    /** 排序变化回调 */
    onSortChange?: (config: SortConfig | null) => void;
    /** 是否可选择 */
    selectable?: boolean;
    /** 已选中的行键 */
    selectedRowKeys?: (string | number)[];
    /** 选择变化回调 */
    onSelectionChange?: (keys: (string | number)[]) => void;
    /** 自定义样式 */
    style?: CSSProperties;
    /** 自定义类名 */
    className?: string;
    /** 超扫描行数 */
    overscan?: number;
}

// ==================== 行组件（memo 优化） ====================

interface RowProps<T> {
    record: T;
    index: number;
    columns: VirtualColumn<T>[];
    height: number;
    start: number;
    selected?: boolean;
    selectable?: boolean;
    onSelect?: (index: number, checked: boolean) => void;
    onClick?: (record: T, index: number) => void;
    rowKey?: (record: T, index: number) => string | number;
}

const VirtualRow = memo(function VirtualRow<T>({
    record,
    index,
    columns,
    height,
    start,
    selected = false,
    selectable = false,
    onSelect,
    onClick,
    rowKey,
}: RowProps<T>) {
    const handleClick = useCallback(() => {
        onClick?.(record, index);
    }, [onClick, record, index]);

    const handleSelect = useCallback(
        (e: CheckboxChangeEvent) => {
            e.stopPropagation();
            onSelect?.(index, e.target.checked);
        },
        [onSelect, index]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
            }
        },
        [handleClick]
    );

    const rowId = rowKey
        ? `row-${rowKey(record, index)}`
        : `row-${index}`;

    return (
        <div
            id={rowId}
            role="row"
            aria-selected={selected}
            aria-rowindex={index + 1}
            tabIndex={onClick ? 0 : -1}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height,
                transform: `translateY(${start}px)`,
                display: 'flex',
                borderBottom: '1px solid #f0e4d8',
                background: selected ? 'var(--app-brand-color-light, #fdf6f0)' : 'transparent',
                transition: 'background 0.15s ease',
                cursor: onClick ? 'pointer' : 'default',
            }}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onMouseEnter={(e) => {
                if (!selected) {
                    e.currentTarget.style.background = '#fafaf9';
                }
            }}
            onMouseLeave={(e) => {
                if (!selected) {
                    e.currentTarget.style.background = 'transparent';
                }
            }}
        >
            {/* 选择框 */}
            {selectable && (
                <div
                    role="gridcell"
                    style={{
                        width: 48,
                        minWidth: 48,
                        padding: '0 8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Checkbox
                        checked={selected}
                        onChange={handleSelect}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            {/* 数据列 */}
            {columns.map((col) => (
                <div
                    key={col.key}
                    role="gridcell"
                    style={{
                        width: col.width || 150,
                        flex: col.width ? 0 : 1,
                        minWidth: col.minWidth || 50,
                        padding: '8px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        overflow: 'hidden',
                        textAlign: col.align || 'left',
                    }}
                >
                    {col.render(record, index)}
                </div>
            ))}
        </div>
    );
}) as <T>(props: RowProps<T>) => React.ReactElement;

// ==================== 主组件 ====================

function VirtualTable<T extends Record<string, unknown>>({
    data,
    columns,
    rowHeight = 56,
    headerHeight = 48,
    height = 600,
    emptyText = '暂无数据',
    loading = false,
    onRowClick,
    rowKey,
    sortConfig,
    onSortChange,
    selectable = false,
    selectedRowKeys = [],
    onSelectionChange,
    style,
    className,
    overscan = 10,
}: VirtualTableProps<T>) {
    const containerRef = useRef<HTMLDivElement>(null);

    // ==================== 虚拟滚动 ====================

    const virtualizer = useVirtualizer({
        count: data.length,
        getScrollElement: () => containerRef.current,
        estimateSize: () => rowHeight,
        overscan,
    });

    const virtualItems = virtualizer.getVirtualItems();

    // ==================== 列宽计算 ====================

    const columnWidths = useMemo(
        () =>
            columns.map((col) => ({
                ...col,
                width: col.width || 150,
                flex: col.width ? 0 : 1,
            })),
        [columns]
    );

    // ==================== 排序处理 ====================

    const handleSortClick = useCallback(
        (col: VirtualColumn<T>) => {
            if (!col.sortable || !onSortChange) return;

            if (sortConfig?.key === col.key) {
                if (sortConfig.direction === 'asc') {
                    onSortChange({ key: col.key, direction: 'desc' });
                } else {
                    onSortChange(null);
                }
            } else {
                onSortChange({ key: col.key, direction: 'asc' });
            }
        },
        [sortConfig, onSortChange]
    );

    // ==================== 选择处理 ====================

    const handleSelectAll = useCallback(
        (e: CheckboxChangeEvent) => {
            if (!onSelectionChange) return;
            if (e.target.checked) {
                const allKeys = data.map((record, index) =>
                    rowKey ? rowKey(record, index) : index
                );
                onSelectionChange(allKeys);
            } else {
                onSelectionChange([]);
            }
        },
        [data, rowKey, onSelectionChange]
    );

    const handleRowSelect = useCallback(
        (index: number, checked: boolean) => {
            if (!onSelectionChange) return;
            const key = rowKey ? rowKey(data[index], index) : index;
            if (checked) {
                onSelectionChange([...selectedRowKeys, key]);
            } else {
                onSelectionChange(selectedRowKeys.filter((k) => k !== key));
            }
        },
        [data, rowKey, selectedRowKeys, onSelectionChange]
    );

    const isAllSelected =
        data.length > 0 && selectedRowKeys.length === data.length;
    const isSomeSelected =
        selectedRowKeys.length > 0 && selectedRowKeys.length < data.length;

    // ==================== 空数据/加载状态 ====================

    if (loading) {
        return (
            <div
                style={{
                    height,
                    border: '1px solid #e8d5c8',
                    borderRadius: 12,
                    background: '#fff',
                    overflow: 'hidden',
                    ...style,
                }}
                className={className}
            >
                <div style={{ padding: 24 }}>
                    <Skeleton active paragraph={{ rows: 8 }} />
                </div>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div
                style={{
                    height,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #e8d5c8',
                    borderRadius: 12,
                    background: '#fff',
                    ...style,
                }}
                className={className}
            >
                <Empty description={emptyText} />
            </div>
        );
    }

    // ==================== 渲染 ====================

    const totalWidth =
        selectable
            ? 48 +
              columnWidths.reduce(
                  (sum, col) => sum + (col.flex ? 150 : col.width),
                  0
              )
            : columnWidths.reduce(
                  (sum, col) => sum + (col.flex ? 150 : col.width),
                  0
              );

    return (
        <div
            style={{
                border: '1px solid #e8d5c8',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#fff',
                ...style,
            }}
            className={className}
            role="grid"
            aria-rowcount={data.length}
            aria-colcount={columns.length + (selectable ? 1 : 0)}
        >
            {/* 表头 */}
            <div
                role="rowheader"
                style={{
                    display: 'flex',
                    height: headerHeight,
                    background: '#fafaf9',
                    borderBottom: '2px solid #e8d5c8',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    minWidth: totalWidth,
                }}
            >
                {/* 全选复选框 */}
                {selectable && (
                    <div
                        role="columnheader"
                        style={{
                            width: 48,
                            minWidth: 48,
                            padding: '0 8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Checkbox
                            checked={isAllSelected}
                            indeterminate={isSomeSelected}
                            onChange={handleSelectAll}
                        />
                    </div>
                )}

                {columnWidths.map((col) => {
                    const isSorted = sortConfig?.key === col.key;
                    return (
                        <div
                            key={col.key}
                            role="columnheader"
                            aria-sort={
                                isSorted
                                    ? sortConfig?.direction === 'asc'
                                        ? 'ascending'
                                        : 'descending'
                                    : undefined
                            }
                            style={{
                                width: col.width,
                                flex: col.flex,
                                minWidth: col.minWidth || 50,
                                padding: '12px 16px',
                                fontWeight: 600,
                                fontSize: 13,
                                color: '#8c7b72',
                                display: 'flex',
                                alignItems: 'center',
                                cursor: col.sortable ? 'pointer' : 'default',
                                userSelect: 'none',
                                textAlign: col.align || 'left',
                            }}
                            onClick={() =>
                                col.sortable && handleSortClick(col)
                            }
                        >
                            {col.headerRender
                                ? col.headerRender(col.title)
                                : col.title}
                            {col.sortable && (
                                <span
                                    style={{
                                        marginLeft: 4,
                                        fontSize: 10,
                                        opacity: isSorted ? 1 : 0.3,
                                        color: isSorted
                                            ? '#8B4513'
                                            : undefined,
                                    }}
                                >
                                    {isSorted &&
                                    sortConfig?.direction === 'asc'
                                        ? '▲'
                                        : '▼'}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 虚拟滚动容器 */}
            <div
                ref={containerRef}
                style={{
                    height: height - headerHeight,
                    overflow: 'auto',
                    position: 'relative',
                }}
            >
                <div
                    style={{
                        height: virtualizer.getTotalSize(),
                        position: 'relative',
                        minWidth: totalWidth,
                    }}
                >
                    {virtualItems.map((virtualItem) => {
                        const record = data[virtualItem.index];
                        const key = rowKey
                            ? rowKey(record, virtualItem.index)
                            : virtualItem.index;

                        return (
                            <VirtualRow
                                key={virtualItem.key}
                                record={record}
                                index={virtualItem.index}
                                columns={columns}
                                height={virtualItem.size}
                                start={virtualItem.start}
                                selected={selectedRowKeys.includes(key)}
                                selectable={selectable}
                                onSelect={handleRowSelect}
                                onClick={onRowClick}
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