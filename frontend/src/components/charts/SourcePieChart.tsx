// frontend/src/components/charts/SourcePieChart.tsx
/**
 * 图书来源分布饼图组件 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 动画过渡
 * - 交互增强
 * - 响应式布局
 * - 加载和空状态
 * - 主题色适配
 * - 无障碍属性
 */

import React, { useMemo, useCallback, useState, type FC } from 'react';
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer,
    Legend,
    Sector,
    type TooltipProps,
    type PieLabelRenderProps,
} from 'recharts';
import { Typography, Empty, Card, Skeleton, Space, theme } from 'antd';
import { PieChartOutlined, InfoCircleOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

// ==================== 类型定义 ====================

interface SourceDataItem {
    name: string;
    value: number;
    color: string;
    percentage?: number;
    icon?: string;
}

interface SourcePieChartProps {
    /** 来源数据 */
    data: SourceDataItem[];
    /** 图表高度 */
    height?: number;
    /** 标题 */
    title?: string;
    /** 是否显示图例 */
    showLegend?: boolean;
    /** 是否显示中心标签 */
    showCenterLabel?: boolean;
    /** 内半径 */
    innerRadius?: number;
    /** 外半径 */
    outerRadius?: number;
    /** 加载状态 */
    loading?: boolean;
    /** 数据项点击回调 */
    onItemClick?: (item: SourceDataItem) => void;
}

// ==================== 常量 ====================

const DEFAULT_INNER_RADIUS = 55;
const DEFAULT_OUTER_RADIUS = 100;

// ==================== 子组件 ====================

/** 活跃扇区 */
const ActiveShape: FC<{
    cx?: number;
    cy?: number;
    innerRadius?: number;
    outerRadius?: number;
    startAngle?: number;
    endAngle?: number;
    fill?: string;
    payload?: { name: string; value: number };
    percent?: number;
}> = ({
    cx = 0,
    cy = 0,
    innerRadius = 0,
    outerRadius = 0,
    startAngle = 0,
    endAngle = 0,
    fill = '#ccc',
    payload,
    percent = 0,
}) => (
    <g>
        {/* 扩展扇区 */}
        <Sector
            cx={cx}
            cy={cy}
            innerRadius={innerRadius}
            outerRadius={outerRadius + 10}
            startAngle={startAngle}
            endAngle={endAngle}
            fill={fill}
            style={{
                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))',
            }}
        />
        {/* 原始扇区 */}
        <Sector
            cx={cx}
            cy={cy}
            innerRadius={innerRadius - 2}
            outerRadius={outerRadius}
            startAngle={startAngle}
            endAngle={endAngle}
            fill={fill}
        />
        {/* 标签 */}
        {payload && (
            <>
                <text
                    x={cx}
                    y={cy - 12}
                    textAnchor="middle"
                    fill="#2c1810"
                    fontSize={16}
                    fontWeight={700}
                >
                    {payload.name}
                </text>
                <text
                    x={cx}
                    y={cy + 14}
                    textAnchor="middle"
                    fill="#8c7b72"
                    fontSize={13}
                >
                    {payload.value} 本 ({(percent * 100).toFixed(1)}%)
                </text>
            </>
        )}
    </g>
);

/** 自定义提示框 */
const CustomTooltip: FC<TooltipProps<number, string>> = ({
    active,
    payload,
}) => {
    if (!active || !payload?.length) return null;

    const data = payload[0] as unknown as {
        payload: SourceDataItem;
        value: number;
        percent: number;
    };
    const item = data.payload;

    return (
        <div
            style={{
                background: '#fff',
                border: '1px solid #e8d5c8',
                borderRadius: 10,
                padding: '12px 16px',
                boxShadow: '0 4px 16px rgba(139, 69, 19, 0.12)',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 6,
                }}
            >
                <div
                    style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: item.color,
                        boxShadow: `0 2px 6px ${item.color}40`,
                    }}
                />
                <Text strong style={{ fontSize: 14 }}>
                    {item.icon ? `${item.icon} ` : ''}
                    {item.name}
                </Text>
            </div>
            <div style={{ marginLeft: 22 }}>
                <Text style={{ fontSize: 13, color: '#6b5e56' }}>
                    {data.value} 本图书
                </Text>
                <br />
                <Text style={{ fontSize: 12, color: '#8c7b72' }}>
                    占比 {(data.percent * 100).toFixed(1)}%
                </Text>
            </div>
        </div>
    );
};

/** 自定义图例 */
const CustomLegend: FC<{
    payload?: { color: string; value: string; payload: SourceDataItem }[];
    onClick?: (item: SourceDataItem) => void;
}> = ({ payload, onClick }) => {
    if (!payload) return null;

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 16,
                flexWrap: 'wrap',
                marginTop: 16,
            }}
        >
            {payload.map((entry, i) => (
                <div
                    key={`legend-${i}`}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '4px 12px',
                        borderRadius: 20,
                        background: '#fafaf9',
                        cursor: onClick ? 'pointer' : 'default',
                        transition: 'all 0.2s ease',
                    }}
                    onClick={() => onClick?.(entry.payload)}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f0e4d8';
                        e.currentTarget.style.transform = 'scale(1.05)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#fafaf9';
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                >
                    <div
                        style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: entry.color,
                        }}
                    />
                    <Text style={{ fontSize: 13, color: '#6b5e56' }}>
                        {entry.payload.icon
                            ? `${entry.payload.icon} `
                            : ''}
                        {entry.value}
                    </Text>
                </div>
            ))}
        </div>
    );
};

/** 中心标签 */
const CenterLabel: FC<{ total: number }> = ({ total }) => (
    <>
        <text
            x="50%"
            y="45%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#2c1810"
            fontSize={30}
            fontWeight={700}
        >
            {total}
        </text>
        <text
            x="50%"
            y="55%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#8c7b72"
            fontSize={12}
        >
            本图书
        </text>
    </>
);

// ==================== 主组件 ====================

const SourcePieChart: FC<SourcePieChartProps> = ({
    data,
    height = 380,
    title,
    showLegend = true,
    showCenterLabel = true,
    innerRadius = DEFAULT_INNER_RADIUS,
    outerRadius = DEFAULT_OUTER_RADIUS,
    loading = false,
    onItemClick,
}) => {
    const { token } = theme.useToken();
    const [activeIndex, setActiveIndex] = useState<number>(-1);

    // ==================== 数据计算 ====================

    const total = useMemo(
        () => data.reduce((sum, item) => sum + item.value, 0),
        [data]
    );

    const enrichedData = useMemo(
        () =>
            data.map((item) => ({
                ...item,
                percentage: total > 0
                    ? parseFloat(((item.value / total) * 100).toFixed(1))
                    : 0,
            })),
        [data, total]
    );

    // ==================== 事件处理 ====================

    const handleMouseEnter = useCallback((_: unknown, index: number) => {
        setActiveIndex(index);
    }, []);

    const handleMouseLeave = useCallback(() => {
        setActiveIndex(-1);
    }, []);

    const handleClick = useCallback(
        (item: SourceDataItem) => {
            onItemClick?.(item);
        },
        [onItemClick]
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
                        <PieChartOutlined
                            style={{
                                fontSize: 56,
                                color: token.colorTextQuaternary,
                                opacity: 0.5,
                            }}
                        />
                    }
                    description="暂无来源数据"
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

    return (
        <div style={{ width: '100%', height }} role="img" aria-label={title || '图书来源分布'}>
            {/* 标题 */}
            {title && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 8,
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
                        <PieChartOutlined />
                        {title}
                    </Title>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        共 {total} 本
                    </Text>
                </div>
            )}

            {/* 图表 */}
            <ResponsiveContainer
                width="100%"
                height={title ? 'calc(100% - 48px)' : '100%'}
            >
                <PieChart>
                    {/* 饼图 */}
                    <Pie
                        data={enrichedData}
                        cx="50%"
                        cy={showLegend ? '48%' : '50%'}
                        innerRadius={innerRadius}
                        outerRadius={outerRadius}
                        dataKey="value"
                        activeIndex={
                            activeIndex >= 0 ? activeIndex : undefined
                        }
                        activeShape={ActiveShape}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                        onClick={(data) => handleClick(data as SourceDataItem)}
                        paddingAngle={2}
                        animationDuration={800}
                        animationEasing="ease-out"
                        style={{ cursor: onItemClick ? 'pointer' : 'default' }}
                    >
                        {enrichedData.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.color}
                                stroke="#fff"
                                strokeWidth={2.5}
                                style={{
                                    transition: 'opacity 0.2s ease',
                                    opacity:
                                        activeIndex === -1 ||
                                        activeIndex === index
                                            ? 1
                                            : 0.7,
                                }}
                            />
                        ))}

                        {/* 中心标签 */}
                        {showCenterLabel && innerRadius > 0 && (
                            <CenterLabel total={total} />
                        )}
                    </Pie>

                    {/* 提示框 */}
                    <Tooltip content={<CustomTooltip />} />

                    {/* 图例 */}
                    {showLegend && (
                        <Legend
                            content={
                                <CustomLegend
                                    onClick={onItemClick}
                                />
                            }
                        />
                    )}
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export default SourcePieChart;