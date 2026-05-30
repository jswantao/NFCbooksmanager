// components/virtual/VirtualRow.tsx
// 虚拟滚动行组件 (memo 优化，CSS Module 样式)

import React, { useCallback, memo } from "react";
import { Checkbox, type CheckboxChangeEvent } from "antd";
import type { VirtualColumn } from "./types";
import styles from "./VirtualTable.module.css";

export interface VirtualRowProps<T> {
    record: T;
    index: number;
    columns: VirtualColumn<T>[];
    height: number;
    start: number;
    selected?: boolean;
    selectable?: boolean;
    onClick?: (record: T, index: number) => void;
    onSelect?: (index: number, checked: boolean) => void;
    rowKey?: (record: T, index: number) => string | number;
}

function VirtualRowInner<T>({
    record, index, columns, height, start,
    selected = false, selectable = false,
    onClick, onSelect, rowKey,
}: VirtualRowProps<T>) {
    const handleClick = useCallback(() => onClick?.(record, index), [onClick, record, index]);

    const handleSelect = useCallback(
        (e: CheckboxChangeEvent) => { e.stopPropagation(); onSelect?.(index, e.target.checked); },
        [onSelect, index]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); }
        },
        [handleClick]
    );

    const rowClass = [
        styles.row,
        onClick ? styles.rowClickable : "",
        selected ? styles.rowSelected : "",
    ].filter(Boolean).join(" ");

    const rowId = rowKey ? `row-${rowKey(record, index)}` : `row-${index}`;

    return (
        <div
            id={rowId}
            role="row"
            aria-selected={selected}
            aria-rowindex={index + 1}
            tabIndex={onClick ? 0 : -1}
            className={rowClass}
            style={{ height, transform: `translateY(${start}px)` }}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
        >
            {selectable && (
                <div className={styles.cellCheckbox}>
                    <Checkbox checked={selected} onChange={handleSelect} />
                </div>
            )}
            {columns.map((col) => (
                <div
                    key={col.key}
                    className={styles.cell}
                    style={{
                        width: col.width,
                        flex: (col as Record<string, unknown>).flex as number | undefined,
                        minWidth: col.minWidth || 50,
                        justifyContent: col.align === "center" ? "center" : col.align === "right" ? "flex-end" : "flex-start",
                    }}
                >
                    {col.render(record, index)}
                </div>
            ))}
        </div>
    );
}

export const VirtualRow = memo(VirtualRowInner) as typeof VirtualRowInner;
export default VirtualRow;
