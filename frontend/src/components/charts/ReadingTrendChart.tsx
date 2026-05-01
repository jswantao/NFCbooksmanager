// frontend/src/components/charts/ReadingTrendChart.tsx
/**
 * 阅读趋势折线图组件 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 动画配置优化
 * - 数据点交互增强
 * - 响应式断点适配
 * - 加载和空状态
 * - 主题色适配
 * - 无障碍属性
 */

import React, { useMemo, useCallback, type FC } from 'react';
import {
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    ComposedChart,
    ReferenceLine,
    type TooltipProps,
} from 'recharts';
import { Typography, Empty, Card, Skeleton, Tag, Space, theme } from 'antd';
import { RiseOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

// ==================== 类型定义 ====================

interface TrendDataItem {
    month: string;
    count: number;
    year: number;
}

interface ReadingTrendChartProps {
    /** 趋势数据 */
    data: TrendDataItem[];
    /** 图表高度 */
    height?: number;
    /** 标题 */
    title?: string;
    /** 加载状态 */
    loading?: boolean;
    /** 是否显示面积 */
    showArea?: boolean;
    /** 是否显示数据点 */
    showDots?: boolean;
    /** 线条颜色 */
    lineColor?: string;
    /** 面积填充颜色 */
    areaColor?: [string, string];
    /** 点击数据点回调 */
    onDotClick?: (item: TrendDataItem) => void;
}

// ==================== 子组件 ====================

/** 自定义提示框 */
const CustomTooltip: FC<TooltipProps<number, string>> = ({
    active,
    payload,
    label,
}) => {
    if (!active || !payload?.length) return null;

    const data = payload[0];
    const value = data.value as number;

    return (
        <div
            style={{
                background: '#fff',
                border: '1px solid #e8d5c8',
                borderRadius: 12,
                padding: '14px 18px',
                boxShadow: '0 6px 20px rgba(139, 69, 19, 0.12)',
                minWidth: 140,
            }}
        >
            <Text
                strong
                style={{
                    fontSize: 13,
                    color: '#8B4513',
                    display: 'block',
                    marginBottom: 6,
                }}
            >
                {label}
            </Text>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <div
                    style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#8B4513',
                    }}
                />
                <Text style={{ fontSize: 13, color: '#6b5e56' }}>
                    新增图书：
                </Text>
                <Text
                    strong
                    style={{
                        fontSize: 18,
                        color: '#8B4513',
                    }}
                >
                    {value}
                </Text>
                <Text style={{ fontSize: 12, color: '#8c7b72' }}>本</Text>
            </div>
        </div>
    );
};

/** 自定义数据点 */
const CustomDot: FC<{
    cx?: number;
    cy?: number;
    value?: number;
    index?: number;
}> = ({ cx = 0, cy = 0, value, index }) => (
    <g>
        <circle
            cx={cx}
            cy={cy}
            r={16}
            fill="transparent"
            style={{ cursor: 'pointer' }}
        />
        <circle cx={cx} cy={cy} r={5} fill="#fff" stroke="#8B4513" strokeWidth={2} />
    </g>
);

/** 活跃数据点 */
const CustomActiveDot: FC<{
    cx?: number;
    cy?: number;
}> = ({ cx = 0, cy = 0 }) => (
    <g>
        <circle cx={cx} cy={cy} r={20} fill="rgba(139,69,19,0.08)" />
        <circle cx={cx} cy={cy} r={7} fill="#8B4513" stroke="#fff" strokeWidth={2.5} />
    </g>
);

// ==================== 主组件 ====================

const ReadingTrendChart: FC<ReadingTrendChartProps> = ({
    data,
    height = 320,
    title,
    loading = false,
    showArea = true,
    showDots = true,
    lineColor = '#8B4513',
    areaColor = ['#8B4513', 'rgba(139,69,19,0.02)'],
    onDotClick,
}) => {
    const { token } = theme.useToken();

    // ==================== 数据计算 ====================

    const yAxisMax = useMemo(() => {
        if (!data?.length) return 10;
        const max = Math.max(...data.map((d) => d.count));
        // 向上取整到最近的 10 的倍数，并留出空间
        const rounded = Math.ceil(max / 10) * 10;
        return rounded > 0 ? rounded + Math.max(rounded * 0.1, 5) : 10;
    }, [data]);

    const totalCount = useMemo(
        () => data.reduce((sum, d) => sum + d.count, 0),
        [data]
    );

    const averageCount = useMemo(
        () => (data.length > 0 ? Math.round(totalCount / data.length) : 0),
        [data, totalCount]
    );

    const trend = useMemo(() => {
        if (data.length < 2) return 'stable';
        const firstHalf = data
            .slice(0, Math.floor(data.length / 2))
            .reduce((s, d) => s + d.count, 0);
        const secondHalf = data
            .slice(Math.floor(data.length / 2))
            .reduce((s, d) => s + d.count, 0);
        if (secondHalf > firstHalf * 1.1) return 'up';
        if (secondHalf < firstHalf * 0.9) return 'down';
        return 'stable';
    }, [data]);

    // ==================== 事件处理 ====================

    const handleDotClick = useCallback(
        (item: TrendDataItem) => {
            onDotClick?.(item);
        },
        [onDotClick]
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
                        <RiseOutlined
                            style={{
                                fontSize: 56,
                                color: token.colorTextQuaternary,
                                opacity: 0.5,
                            }}
                        />
                    }
                    description="暂无趋势数据"
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

    const gradientId = 'trend-area-gradient';
    const lineGradientId = 'trend-line-gradient';

    return (
        <div style={{ width: '100%', height }} role="img" aria-label={title || '阅读趋势图'}>
            {/* 标题与统计 */}
            {title && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 16,
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
                        <RiseOutlined />
                        {title}
                    </Title>
                    <Space size={8}>
                        <Tag
                            color={
                                trend === 'up'
                                    ? 'green'
                                    : trend === 'down'
                                    ? 'red'
                                    : 'default'
                            }
                            icon={
                                trend === 'up' ? (
                                    <ArrowUpOutlined />
                                ) : trend === 'down' ? (
                                    <ArrowDownOutlined />
                                ) : undefined
                            }
                        >
                            {trend === 'up'
                                ? '上升趋势'
                                : trend === 'down'
                                ? '下降趋势'
                                : '趋于稳定'}
                        </Tag>
                        <Text
                            type="secondary"
                            style={{ fontSize: 12 }}
                        >
                            总 {totalCount} 本 · 均 {averageCount} 本/月
                        </Text>
                    </Space>
                </div>
            )}

            {/* 图表 */}
            <ResponsiveContainer width="100%" height={title ? 'calc(100% - 44px)' : '100%'}>
                <ComposedChart
                    data={data}
                    margin={{ top: 10, right: 30, left: 0, bottom: 5 }}
                    onClick={(e: any) => {
                        if (e?.activePayload?.[0]?.payload) {
                            handleDotClick(e.activePayload[0].payload);
                        }
                    }}
                >
                    {/* 渐变定义 */}
                    <defs>
                        <linearGradient
                            id={gradientId}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor={areaColor[0]}
                                stopOpacity={0.25}
                            />
                            <stop
                                offset="100%"
                                stopColor={areaColor[1]}
                                stopOpacity={0.02}
                            />
                        </linearGradient>
                        <linearGradient
                            id={lineGradientId}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="0"
                        >
                            <stop offset="0%" stopColor={lineColor} />
                            <stop
                                offset="100%"
                                stopColor={lineColor}
                                stopOpacity={0.7}
                            />
                        </linearGradient>
                    </defs>

                    {/* 网格 */}
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={token.colorBorderSecondary}
                        vertical={false}
                    />

                    {/* X 轴 */}
                    <XAxis
                        dataKey="month"
                        axisLine={{ stroke: token.colorBorder }}
                        tickLine={false}
                        tick={{
                            fill: token.colorTextSecondary,
                            fontSize: 12,
                        }}
                        padding={{ left: 10, right: 10 }}
                    />

                    {/* Y 轴 */}
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{
                            fill: token.colorTextSecondary,
                            fontSize: 12,
                        }}
                        domain={[0, yAxisMax]}
                        allowDecimals={false}
                        width={40}
                    />

                    {/* 提示框 */}
                    <Tooltip
                        content={<CustomTooltip />}
                        cursor={{
                            stroke: token.colorBorder,
                            strokeDasharray: '4 4',
                        }}
                    />

                    {/* 平均值参考线 */}
                    {data.length > 1 && (
                        <ReferenceLine
                            y={averageCount}
                            stroke={token.colorTextQuaternary}
                            strokeDasharray="6 4"
                            strokeWidth={1}
                            label={{
                                value: `均值 ${averageCount}`,
                                fill: token.colorTextQuaternary,
                                fontSize: 11,
                                position: 'insideTopRight',
                            }}
                        />
                    )}

                    {/* 面积填充 */}
                    {showArea && (
                        <Area
                            type="monotone"
                            dataKey="count"
                            fill={`url(#${gradientId})`}
                            stroke="none"
                        />
                    )}

                    {/* 折线 */}
                    <Line
                        type="monotone"
                        dataKey="count"
                        stroke={`url(#${lineGradientId})`}
                        strokeWidth={3}
                        dot={showDots ? <CustomDot /> : false}
                        activeDot={<CustomActiveDot />}
                        animationDuration={1000}
                        animationEasing="ease-out"
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

export default ReadingTrendChart;