// frontend/src/components/charts/RatingBarChart.tsx
/**
 * 评分分布柱状图组件 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 动画配置优化
 * - 响应式布局
 * - 无障碍属性
 * - 自定义空状态
 * - 主题色适配
 */

import React, { useMemo, useCallback, type FC } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    LabelList,
    type TooltipProps,
} from 'recharts';
import { Typography, Empty, Card, Skeleton, theme } from 'antd';
import { StarFilled } from '@ant-design/icons';

const { Text, Title } = Typography;

// ==================== 类型定义 ====================

interface RatingDataItem {
    range: string;
    count: number;
    color: string;
}

interface RatingBarChartProps {
    /** 评分分布数据 */
    data: RatingDataItem[];
    /** 图表高度 */
    height?: number;
    /** 标题 */
    title?: string;
    /** 布局方向 */
    layout?: 'horizontal' | 'vertical';
    /** 加载状态 */
    loading?: boolean;
    /** 是否显示数值标签 */
    showLabel?: boolean;
    /** 柱状图圆角 */
    barRadius?: number | [number, number, number, number];
    /** 最大柱宽 */
    maxBarSize?: number;
    /** 点击回调 */
    onBarClick?: (item: RatingDataItem, index: number) => void;
}

// ==================== 子组件 ====================

/** 自定义提示框 */
const CustomTooltip: FC<TooltipProps<number, string>> = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;

    const data = payload[0];
    const value = data.value as number;
    const percentage = data.payload?.percentage
        ? ` (${data.payload.percentage}%)`
        : '';

    return (
        <div
            style={{
                background: '#fff',
                border: '1px solid #e8d5c8',
                borderRadius: 10,
                padding: '12px 16px',
                boxShadow: '0 4px 16px rgba(139, 69, 19, 0.12)',
                backdropFilter: 'blur(8px)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <StarFilled style={{ color: '#f59e0b', fontSize: 14 }} />
                <Text style={{ fontSize: 13, color: '#6b5e56' }}>
                    {label}
                </Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <Text strong style={{ fontSize: 20, color: '#8B4513' }}>
                    {value}
                </Text>
                <Text style={{ fontSize: 13, color: '#8c7b72' }}>本</Text>
                {percentage && (
                    <Text style={{ fontSize: 12, color: '#a0a0a0' }}>
                        {percentage}
                    </Text>
                )}
            </div>
        </div>
    );
};

/** 自定义 Y 轴标签 */
const CustomYAxisTick: FC<{
    x?: number;
    y?: number;
    payload?: { value: string; offset?: number };
}> = ({ x = 0, y = 0, payload }) => {
    const text = payload?.value || '';
    return (
        <g transform={`translate(${x},${y})`}>
            <text
                x={0}
                y={0}
                dy={4}
                textAnchor="end"
                fill="#8c7b72"
                fontSize={12}
                style={{ fontWeight: 500 }}
            >
                {text.length > 10 ? `${text.slice(0, 10)}...` : text}
            </text>
        </g>
    );
};

// ==================== 主组件 ====================

const RatingBarChart: FC<RatingBarChartProps> = ({
    data,
    height = 320,
    title,
    layout = 'vertical',
    loading = false,
    showLabel = true,
    barRadius = [0, 6, 6, 0],
    maxBarSize = 36,
    onBarClick,
}) => {
    const { token } = theme.useToken();

    // ==================== 数据计算 ====================

    const total = useMemo(
        () => data.reduce((sum, item) => sum + item.count, 0),
        [data]
    );

    const enrichedData = useMemo(
        () =>
            data.map((item) => ({
                ...item,
                percentage: total > 0
                    ? `${((item.count / total) * 100).toFixed(1)}%`
                    : '0%',
            })),
        [data, total]
    );

    // ==================== 事件处理 ====================

    const handleBarClick = useCallback(
        (item: RatingDataItem, index: number) => {
            onBarClick?.(item, index);
        },
        [onBarClick]
    );

    // ==================== 空状态 ====================

    if (!loading && (!data || data.length === 0)) {
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
                        <StarFilled
                            style={{
                                fontSize: 56,
                                color: token.colorTextQuaternary,
                                opacity: 0.5,
                            }}
                        />
                    }
                    description={
                        <Text type="secondary">
                            暂无评分数据
                            <br />
                            <Text style={{ fontSize: 12, opacity: 0.6 }}>
                                同步豆瓣数据后将自动生成
                            </Text>
                        </Text>
                    }
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

    // ==================== 渲染 ====================

    const isVertical = layout === 'vertical';
    const chartMargin = isVertical
        ? { top: 10, right: 50, left: 10, bottom: 10 }
        : { top: 10, right: 50, left: 80, bottom: 10 };

    return (
        <div
            style={{ width: '100%', height }}
            role="img"
            aria-label={
                title
                    ? `${title}: ${enrichedData
                          .map((d) => `${d.range} ${d.count}本`)
                          .join(', ')}`
                    : '评分分布图'
            }
        >
            {/* 标题 */}
            {title && (
                <div style={{ marginBottom: 16 }}>
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
                        <StarFilled style={{ color: '#f59e0b' }} />
                        {title}
                        {total > 0 && (
                            <Text
                                type="secondary"
                                style={{ fontSize: 13, fontWeight: 400 }}
                            >
                                共 {total} 本
                            </Text>
                        )}
                    </Title>
                </div>
            )}

            {/* 图表 */}
            <ResponsiveContainer width="100%" height={title ? 'calc(100% - 40px)' : '100%'}>
                <BarChart
                    data={enrichedData}
                    layout={layout}
                    margin={chartMargin}
                    barCategoryGap="20%"
                >
                    {/* 网格 */}
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={token.colorBorderSecondary}
                        horizontal={isVertical}
                        vertical={!isVertical}
                    />

                    {/* X 轴 */}
                    <XAxis
                        type={isVertical ? 'number' : 'category'}
                        dataKey={isVertical ? 'count' : 'range'}
                        axisLine={{ stroke: token.colorBorder }}
                        tickLine={false}
                        tick={isVertical ? undefined : ({ x, y, payload }) => (
                            <CustomYAxisTick
                                x={x}
                                y={y}
                                payload={payload}
                            />
                        )}
                        style={{ fontSize: 12 }}
                    />

                    {/* Y 轴 */}
                    <YAxis
                        type={isVertical ? 'category' : 'number'}
                        dataKey={isVertical ? 'range' : 'count'}
                        axisLine={false}
                        tickLine={false}
                        tick={isVertical ? ({ x, y, payload }) => (
                            <g transform={`translate(${x},${y})`}>
                                <text
                                    x={0}
                                    y={0}
                                    dy={4}
                                    textAnchor="end"
                                    fill="#8c7b72"
                                    fontSize={12}
                                    style={{ fontWeight: 500 }}
                                >
                                    {payload.value}
                                </text>
                            </g>
                        ) : undefined}
                        width={80}
                        style={{ fontSize: 12 }}
                        allowDecimals={false}
                    />

                    {/* 提示框 */}
                    <Tooltip
                        content={<CustomTooltip />}
                        cursor={{ fill: 'rgba(139, 69, 19, 0.05)' }}
                    />

                    {/* 柱状图 */}
                    <Bar
                        dataKey="count"
                        radius={barRadius}
                        barSize={28}
                        maxBarSize={maxBarSize}
                        animationDuration={800}
                        animationEasing="ease-out"
                        onClick={(data) => {
                            const index = enrichedData.findIndex(
                                (d) => d.count === data.count
                            );
                            if (index >= 0) {
                                handleBarClick(enrichedData[index], index);
                            }
                        }}
                        style={{ cursor: onBarClick ? 'pointer' : 'default' }}
                    >
                        {enrichedData.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.color}
                                style={{
                                    filter: 'brightness(1)',
                                    transition: 'filter 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                    (e as any).target?.setAttribute?.(
                                        'filter',
                                        'brightness(1.1)'
                                    );
                                }}
                                onMouseLeave={(e) => {
                                    (e as any).target?.setAttribute?.(
                                        'filter',
                                        'brightness(1)'
                                    );
                                }}
                            />
                        ))}

                        {/* 数值标签 */}
                        {showLabel && (
                            <LabelList
                                dataKey="count"
                                position={isVertical ? 'right' : 'top'}
                                style={{
                                    fill: token.colorTextSecondary,
                                    fontSize: 12,
                                    fontWeight: 600,
                                }}
                            />
                        )}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default RatingBarChart;