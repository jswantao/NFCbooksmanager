// frontend/src/components/charts/ReadingHeatmap.tsx
/**
 * 阅读热力图组件 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 响应式布局
 * - 键盘导航
 * - 工具提示增强
 * - 颜色渐变优化
 * - 无障碍属性
 * - 性能优化（Canvas 备用方案建议）
 */

import React, { useMemo, useCallback, useState, type FC } from 'react';
import { Typography, Empty, Card, Skeleton, Tooltip as AntTooltip, theme } from 'antd';
import {
    CalendarOutlined,
    HeatMapOutlined,
    InfoCircleOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;

// ==================== 类型定义 ====================

interface HeatmapProps {
    /** 月份标签 */
    months: string[];
    /** 分类标签 */
    categories: string[];
    /** 热力图数据矩阵 [category][month] */
    data: number[][];
    /** 图表高度 */
    height?: number;
    /** 标题 */
    title?: string;
    /** 最大值（用于统一色阶） */
    maxValue?: number;
    /** 加载状态 */
    loading?: boolean;
    /** 单元格点击回调 */
    onCellClick?: (category: string, month: string, value: number) => void;
}

// ==================== 常量 ====================

/** 热力图色阶（从浅到深） */
const HEAT_COLORS = [
    { r: 255, g: 251, b: 235 }, // 0
    { r: 254, g: 243, b: 199 }, // 1
    { r: 253, g: 230, b: 138 }, // 2
    { r: 252, g: 211, b: 77 },  // 3
    { r: 245, g: 158, b: 11 },  // 4
    { r: 217, g: 119, b: 6 },   // 5
    { r: 180, g: 83, b: 9 },    // 6
    { r: 139, g: 69, b: 19 },   // 7
] as const;

/** 默认空单元格颜色 */
const EMPTY_CELL_COLOR = '#fafaf9';

/** 单元格默认尺寸 */
const CELL = {
    WIDTH: 42,
    HEIGHT: 34,
    GAP: 3,
} as const;

/** 侧标签宽度 */
const LABEL_WIDTH = 110;

/** 头部高度 */
const HEADER_HEIGHT = 40;

// ==================== 工具函数 ====================

/**
 * 根据值和最大值计算热力颜色
 */
const getHeatColor = (value: number, maxValue: number): string => {
    if (value <= 0) return EMPTY_CELL_COLOR;

    const ratio = Math.min(value / Math.max(maxValue, 1), 1);
    const floatIndex = ratio * (HEAT_COLORS.length - 1);
    const index = Math.min(Math.floor(floatIndex), HEAT_COLORS.length - 2);
    const nextIndex = Math.min(index + 1, HEAT_COLORS.length - 1);
    const localRatio = floatIndex - index;

    const r = Math.round(
        HEAT_COLORS[index].r +
            (HEAT_COLORS[nextIndex].r - HEAT_COLORS[index].r) * localRatio
    );
    const g = Math.round(
        HEAT_COLORS[index].g +
            (HEAT_COLORS[nextIndex].g - HEAT_COLORS[index].g) * localRatio
    );
    const b = Math.round(
        HEAT_COLORS[index].b +
            (HEAT_COLORS[nextIndex].b - HEAT_COLORS[index].b) * localRatio
    );

    return `rgb(${r}, ${g}, ${b})`;
};

/**
 * 获取文本颜色（浅色背景深色文字，深色背景浅色文字）
 */
const getTextColor = (value: number, maxValue: number): string => {
    if (value <= 0) return '#2c1810';
    const ratio = value / Math.max(maxValue, 1);
    return ratio > 0.45 ? '#ffffff' : '#2c1810';
};

/**
 * 计算亮度（用于无障碍对比度）
 */
const getLuminance = (r: number, g: number, b: number): number => {
    const [rs, gs, bs] = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

// ==================== 子组件 ====================

/** 图例组件 */
const Legend: FC<{ maxValue: number; colorSteps: number }> = ({
    maxValue,
    colorSteps = 8,
}) => {
    const items = useMemo(() => {
        const result: { value: number; color: string; label: string }[] = [];
        for (let i = 0; i < colorSteps; i++) {
            const value = Math.round((maxValue / colorSteps) * (i + 1));
            result.push({
                value,
                color: getHeatColor(value, maxValue),
                label: i === colorSteps - 1 ? `${value}+` : `${value}`,
            });
        }
        return result;
    }, [maxValue, colorSteps]);

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                flexWrap: 'wrap',
            }}
            role="img"
            aria-label="热力图图例"
        >
            <Text type="secondary" style={{ fontSize: 11, marginRight: 4 }}>
                少
            </Text>
            {items.map((item, i) => (
                <AntTooltip key={i} title={`${item.label} 本`}>
                    <div
                        style={{
                            width: 18,
                            height: 14,
                            borderRadius: 3,
                            background: item.color,
                            border: '1px solid rgba(0,0,0,0.06)',
                            cursor: 'default',
                            transition: 'transform 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.3)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    />
                </AntTooltip>
            ))}
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                多
            </Text>
            <Text
                type="secondary"
                style={{ fontSize: 10, marginLeft: 8, opacity: 0.5 }}
            >
                (本)
            </Text>
        </div>
    );
};

// ==================== 主组件 ====================

const ReadingHeatmap: FC<HeatmapProps> = ({
    months,
    categories,
    data,
    height,
    title,
    maxValue: propMaxValue,
    loading = false,
    onCellClick,
}) => {
    const { token } = theme.useToken();
    const [hoveredCell, setHoveredCell] = useState<{
        ri: number;
        ci: number;
    } | null>(null);

    // ==================== 数据计算 ====================

    const actualMaxValue = useMemo(() => {
        if (propMaxValue !== undefined) return Math.max(propMaxValue, 1);
        if (!data?.length) return 10;

        let max = 0;
        for (const row of data) {
            for (const v of row) {
                if (v > max) max = v;
            }
        }
        return max || 10;
    }, [data, propMaxValue]);

    // ==================== 事件处理 ====================

    const handleCellClick = useCallback(
        (ri: number, ci: number) => {
            if (!onCellClick) return;
            const category = categories[ri];
            const month = months[ci];
            const value = data[ri]?.[ci] || 0;
            onCellClick(category, month, value);
        },
        [onCellClick, categories, months, data]
    );

    const handleCellKeyDown = useCallback(
        (e: React.KeyboardEvent, ri: number, ci: number) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCellClick(ri, ci);
            }
        },
        [handleCellClick]
    );

    // ==================== 空状态 ====================

    if (!loading && (!months?.length || !categories?.length || !data?.length)) {
        return (
            <Card
                style={{
                    height,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 12,
                    border: `1px solid ${token.colorBorderSecondary}`,
                }}
                styles={{ body: { width: '100%', textAlign: 'center' } }}
            >
                <Empty
                    image={
                        <CalendarOutlined
                            style={{
                                fontSize: 56,
                                color: token.colorTextQuaternary,
                                opacity: 0.5,
                            }}
                        />
                    }
                    description="暂无热力图数据"
                />
            </Card>
        );
    }

    // ==================== 加载状态 ====================

    if (loading) {
        return (
            <Card
                style={{
                    height,
                    borderRadius: 12,
                    border: `1px solid ${token.colorBorderSecondary}`,
                }}
                styles={{ body: { padding: 24 } }}
            >
                <Skeleton active paragraph={{ rows: 6 }} />
            </Card>
        );
    }

    // ==================== 尺寸计算 ====================

    const totalWidth =
        LABEL_WIDTH + months.length * (CELL.WIDTH + CELL.GAP) + 20;

    // ==================== 渲染 ====================

    return (
        <div
            style={{ width: '100%', overflowX: 'auto' }}
            role="img"
            aria-label={
                title
                    ? `${title}: ${categories.length} 个分类 × ${months.length} 个月`
                    : '阅读热力图'
            }
        >
            {/* 标题 */}
            {title && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 12,
                        flexWrap: 'wrap',
                        gap: 8,
                    }}
                >
                    <Title
                        level={5}
                        style={{
                            margin: 0,
                            color: token.colorPrimary,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}
                    >
                        <HeatMapOutlined />
                        {title}
                    </Title>
                </div>
            )}

            {/* 图例 */}
            <div
                style={{
                    marginBottom: 16,
                    marginLeft: LABEL_WIDTH + 8,
                }}
            >
                <Legend maxValue={actualMaxValue} />
            </div>

            {/* 热力图容器 */}
            <div style={{ display: 'inline-block', minWidth: totalWidth }}>
                {/* 列标题（月份） */}
                <div style={{ display: 'flex', height: HEADER_HEIGHT }}>
                    <div style={{ width: LABEL_WIDTH, flexShrink: 0 }} />
                    {months.map((month, i) => (
                        <div
                            key={`header-${i}`}
                            style={{
                                width: CELL.WIDTH,
                                marginRight:
                                    i < months.length - 1 ? CELL.GAP : 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            title={month}
                        >
                            <Text
                                strong
                                style={{
                                    fontSize: 11,
                                    color: token.colorTextSecondary,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {month}
                            </Text>
                        </div>
                    ))}
                </div>

                {/* 数据行 */}
                {categories.map((category, ri) => (
                    <div
                        key={`row-${ri}`}
                        style={{
                            display: 'flex',
                            height: CELL.HEIGHT,
                            marginBottom: CELL.GAP,
                        }}
                    >
                        {/* 行标签（分类） */}
                        <div
                            style={{
                                width: LABEL_WIDTH,
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                paddingRight: 8,
                            }}
                            title={category}
                        >
                            <Text
                                style={{
                                    fontSize: 12,
                                    color: token.colorTextSecondary,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    width: '100%',
                                    textAlign: 'right',
                                }}
                            >
                                {category}
                            </Text>
                        </div>

                        {/* 单元格 */}
                        {months.map((month, ci) => {
                            const value = data[ri]?.[ci] || 0;
                            const bgColor = getHeatColor(value, actualMaxValue);
                            const textColor = getTextColor(
                                value,
                                actualMaxValue
                            );
                            const isHovered =
                                hoveredCell?.ri === ri &&
                                hoveredCell?.ci === ci;
                            const isClickable = !!onCellClick;

                            return (
                                <AntTooltip
                                    key={`cell-${ri}-${ci}`}
                                    title={
                                        <div>
                                            <Text
                                                strong
                                                style={{ fontSize: 13 }}
                                            >
                                                {category} · {month}
                                            </Text>
                                            <br />
                                            <Text
                                                style={{
                                                    fontSize: 12,
                                                    opacity: 0.8,
                                                }}
                                            >
                                                {value > 0
                                                    ? `${value} 本图书`
                                                    : '暂无数据'}
                                            </Text>
                                        </div>
                                    }
                                >
                                    <div
                                        role={
                                            isClickable ? 'button' : 'cell'
                                        }
                                        tabIndex={isClickable ? 0 : -1}
                                        aria-label={`${category} ${month}: ${value} 本`}
                                        style={{
                                            width: CELL.WIDTH,
                                            height: CELL.HEIGHT,
                                            marginRight:
                                                ci < months.length - 1
                                                    ? CELL.GAP
                                                    : 0,
                                            borderRadius: 5,
                                            background: bgColor,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: isClickable
                                                ? 'pointer'
                                                : 'default',
                                            transition:
                                                'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease',
                                            transform: isHovered
                                                ? 'scale(1.12)'
                                                : 'scale(1)',
                                            boxShadow: isHovered
                                                ? '0 4px 12px rgba(0,0,0,0.2)'
                                                : 'none',
                                            zIndex: isHovered ? 10 : 1,
                                            position: 'relative',
                                        }}
                                        onClick={() =>
                                            handleCellClick(ri, ci)
                                        }
                                        onKeyDown={(e) =>
                                            handleCellKeyDown(e, ri, ci)
                                        }
                                        onMouseEnter={() =>
                                            setHoveredCell({ ri, ci })
                                        }
                                        onMouseLeave={() =>
                                            setHoveredCell(null)
                                        }
                                    >
                                        <Text
                                            style={{
                                                fontSize: 11,
                                                fontWeight:
                                                    value > 0 ? 600 : 400,
                                                color: textColor,
                                                userSelect: 'none',
                                            }}
                                        >
                                            {value > 0 ? value : ''}
                                        </Text>
                                    </div>
                                </AntTooltip>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ReadingHeatmap;