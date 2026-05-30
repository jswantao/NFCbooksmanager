// components/virtual/types.ts
// 虚拟表格类型定义

import type { ReactNode, CSSProperties } from "react";

export interface VirtualColumn<T> {
    key: string;
    title: string;
    width?: number;
    minWidth?: number;
    maxWidth?: number;
    sortable?: boolean;
    render: (record: T, index: number) => ReactNode;
    headerRender?: (title: string) => ReactNode;
    align?: "left" | "center" | "right";
}

export interface SortConfig {
    key: string;
    direction: "asc" | "desc";
}

export interface VirtualTableProps<T> {
    data: T[];
    columns: VirtualColumn<T>[];
    rowHeight?: number;
    headerHeight?: number;
    height?: number;
    emptyText?: string;
    loading?: boolean;
    onRowClick?: (record: T, index: number) => void;
    rowKey?: (record: T, index: number) => string | number;
    sortConfig?: SortConfig;
    onSortChange?: (config: SortConfig | null) => void;
    selectable?: boolean;
    selectedRowKeys?: (string | number)[];
    onSelectionChange?: (keys: (string | number)[]) => void;
    style?: CSSProperties;
    className?: string;
    overscan?: number;
}
