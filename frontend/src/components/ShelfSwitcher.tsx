// frontend/src/components/ShelfSwitcher.tsx
/**
 * 书架切换器组件
 * 
 * 提供三种视图模式的书架列表展示和切换功能：
 * 1. dropdown - 下拉选择器（适合顶部工具栏）
 * 2. cards - 卡片网格（适合独立页面或展示面板）
 * 3. sidebar - 侧边栏列表（适合侧边导航）
 * 
 * 功能：
 * - 自动加载书架列表
 * - 搜索过滤（名称/描述/物理位置）
 * - 点击选中书架并触发回调或导航
 * - 显示书架统计（图书数量、物理位置）
 * - 当前选中书架高亮标识
 */

import React, {
    useEffect,
    useState,
    useCallback,
    useMemo,
} from 'react';
import {
    Select,
    Spin,
    Space,
    Tag,
    Typography,
    Card,
    Row,
    Col,
    Button,
    Empty,
    Badge,
    Tooltip,
    Input,
    Skeleton,
} from 'antd';
import {
    BookOutlined,
    AppstoreOutlined,
    SearchOutlined,
    EnvironmentOutlined,
    ReloadOutlined,
    CheckCircleFilled,
    InboxOutlined,
    RightOutlined,
} from '@ant-design/icons';
import { listShelves } from '../services/api';
import { useNavigate } from 'react-router-dom';

// ---- 类型定义 ----

const { Text, Title } = Typography;

/** 书架列表项 */
interface ShelfItem {
    logical_shelf_id: number;
    shelf_name: string;
    description?: string;
    book_count: number;
    physical_location?: string;
    recent_cover?: string;
}

interface ShelfSwitcherProps {
    /** 当前选中的书架 ID */
    currentShelfId?: number;
    /** 书架切换回调 */
    onShelfChange?: (id: number, name: string) => void;
    /** 视图模式 */
    viewMode?: 'dropdown' | 'cards' | 'sidebar';
    /** 紧凑模式（减少内边距） */
    compact?: boolean;
}

// ---- 常量 ----

/** 卡片模式下的书架渐变背景色板 */
const CARD_COLORS = [
    '#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3',
    '#e0e7ff', '#ffedd5',
];

/** 品牌色 */
const BRAND_COLOR = '#8B4513';

/** 选中高亮色 */
const ACTIVE_COLOR = '#f59e0b';

/** 搜索框宽度 */
const SEARCH_INPUT_WIDTH = 160;

/** 书架图标大小 */
const SHELF_ICON_SIZE = 40;

// ---- 组件 ----

const ShelfSwitcher: React.FC<ShelfSwitcherProps> = ({
    currentShelfId,
    onShelfChange,
    viewMode = 'dropdown',
    compact = false,
}) => {
    // ==================== 状态 ====================
    
    const [shelves, setShelves] = useState<ShelfItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [showPanel, setShowPanel] = useState(false);
    
    const navigate = useNavigate();

    // ==================== 数据加载 ====================

    /**
     * 加载书架列表
     * 
     * 错误处理：静默失败，保持旧数据展示
     */
    const loadShelves = useCallback(async () => {
        setLoading(true);
        try {
            const data = await listShelves();
            setShelves(data || []);
        } catch (err) {
            // 静默失败：保留旧数据
            console.warn('[ShelfSwitcher] 加载书架列表失败:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // 首次加载
    useEffect(() => {
        loadShelves();
    }, [loadShelves]);

    // ==================== 搜索过滤 ====================

    /**
     * 根据搜索文本过滤书架
     * 
     * 匹配范围：名称、描述、物理位置（不区分大小写）
     */
    const filteredShelves = useMemo(() => {
        if (!searchText.trim()) return shelves;

        const keyword = searchText.toLowerCase();
        return shelves.filter(
            (shelf) =>
                shelf.shelf_name.toLowerCase().includes(keyword) ||
                shelf.description?.toLowerCase().includes(keyword) ||
                shelf.physical_location?.toLowerCase().includes(keyword)
        );
    }, [shelves, searchText]);

    // ==================== 书架选择 ====================

    /**
     * 选中书架的处理
     * 
     * 优先调用外部回调，否则自动导航到书架页面
     */
    const handleShelfSelect = useCallback(
        (shelfId: number, shelfName: string) => {
            if (onShelfChange) {
                onShelfChange(shelfId, shelfName);
            } else {
                navigate(`/shelf/${shelfId}`);
            }
            setShowPanel(false);
        },
        [onShelfChange, navigate]
    );

    // ==================== 下拉选择模式 ====================

    if (viewMode === 'dropdown') {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Select
                    value={currentShelfId}
                    onChange={(value) => {
                        const selected = shelves.find(
                            (s) => s.logical_shelf_id === value
                        );
                        if (selected) {
                            handleShelfSelect(
                                selected.logical_shelf_id,
                                selected.shelf_name
                            );
                        }
                    }}
                    style={{ minWidth: 220 }}
                    size="large"
                    placeholder="选择书架"
                    loading={loading}
                    showSearch
                    filterOption={(input, option) =>
                        (option?.label as string)
                            ?.toLowerCase()
                            .includes(input.toLowerCase())
                    }
                    options={shelves.map((shelf) => ({
                        value: shelf.logical_shelf_id,
                        label: shelf.shelf_name,
                        shelf: shelf,
                    }))}
                    optionRender={(option) => {
                        const shelf = option.data.shelf as ShelfItem;
                        const isCurrent =
                            shelf.logical_shelf_id === currentShelfId;
                        
                        return (
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '4px 0',
                                }}
                            >
                                <Space>
                                    <BookOutlined
                                        style={{ color: '#d4a574' }}
                                    />
                                    {option.label}
                                    {isCurrent && (
                                        <CheckCircleFilled
                                            style={{
                                                color: ACTIVE_COLOR,
                                                marginLeft: 4,
                                            }}
                                        />
                                    )}
                                </Space>
                                <Space size={4}>
                                    {shelf.physical_location && (
                                        <Tooltip
                                            title={shelf.physical_location}
                                        >
                                            <EnvironmentOutlined
                                                style={{ color: '#52c41a' }}
                                            />
                                        </Tooltip>
                                    )}
                                    <Tag
                                        color="blue"
                                        style={{ fontSize: 11 }}
                                    >
                                        {shelf.book_count}本
                                    </Tag>
                                </Space>
                            </div>
                        );
                    }}
                />
                <Tooltip title="刷新书架列表">
                    <Button
                        icon={<ReloadOutlined spin={loading} />}
                        size="large"
                        onClick={loadShelves}
                        disabled={loading}
                    />
                </Tooltip>
            </div>
        );
    }

    // ==================== 卡片网格模式 ====================

    if (viewMode === 'cards') {
        return (
            <div>
                {/* 展开/收起按钮 */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        marginBottom: 16,
                    }}
                >
                    <Button
                        size={compact ? 'middle' : 'large'}
                        icon={<AppstoreOutlined />}
                        type={showPanel ? 'primary' : 'default'}
                        onClick={() => setShowPanel(!showPanel)}
                    >
                        书架列表
                    </Button>
                    {!compact && (
                        <Text type="secondary">
                            共 {shelves.length} 个书架
                        </Text>
                    )}
                </div>

                {/* 书架卡片面板 */}
                {showPanel && (
                    <Card
                        title={
                            <Space>
                                <AppstoreOutlined
                                    style={{ color: BRAND_COLOR }}
                                />
                                所有书架
                                <Tag>{shelves.length}个</Tag>
                            </Space>
                        }
                        extra={
                            <Space>
                                <Input
                                    placeholder="搜索书架..."
                                    prefix={<SearchOutlined />}
                                    allowClear
                                    size="small"
                                    onChange={(e) =>
                                        setSearchText(e.target.value)
                                    }
                                    style={{ width: SEARCH_INPUT_WIDTH }}
                                />
                                <Tooltip title="刷新">
                                    <Button
                                        size="small"
                                        icon={
                                            <ReloadOutlined
                                                spin={loading}
                                            />
                                        }
                                        onClick={loadShelves}
                                    />
                                </Tooltip>
                            </Space>
                        }
                        style={{
                            borderRadius: 12,
                            border: '1px solid #e8d5c8',
                            marginBottom: 24,
                        }}
                    >
                        {/* 加载中骨架屏 */}
                        {loading && (
                            <Row gutter={[16, 16]}>
                                {[1, 2, 3, 4].map((i) => (
                                    <Col
                                        xs={24}
                                        sm={12}
                                        md={6}
                                        key={i}
                                    >
                                        <Card>
                                            <Skeleton
                                                active
                                                paragraph={{ rows: 3 }}
                                            />
                                        </Card>
                                    </Col>
                                ))}
                            </Row>
                        )}

                        {/* 无结果 */}
                        {!loading && filteredShelves.length === 0 && (
                            <Empty
                                image={
                                    <InboxOutlined
                                        style={{
                                            fontSize: 48,
                                            color: '#d4a574',
                                        }}
                                    />
                                }
                                description={
                                    searchText
                                        ? `未找到「${searchText}」`
                                        : '暂无书架'
                                }
                                style={{ padding: '40px 0' }}
                            />
                        )}

                        {/* 书架卡片网格 */}
                        {!loading && filteredShelves.length > 0 && (
                            <Row gutter={[16, 16]}>
                                {filteredShelves.map((shelf) => {
                                    const isActive =
                                        shelf.logical_shelf_id ===
                                        currentShelfId;

                                    return (
                                        <Col
                                            xs={24}
                                            sm={12}
                                            md={compact ? 8 : 6}
                                            key={shelf.logical_shelf_id}
                                        >
                                            <Card
                                                hoverable
                                                onClick={() =>
                                                    handleShelfSelect(
                                                        shelf.logical_shelf_id,
                                                        shelf.shelf_name
                                                    )
                                                }
                                                style={{
                                                    borderRadius: 10,
                                                    border: isActive
                                                        ? `2px solid ${ACTIVE_COLOR}`
                                                        : '1px solid #e8d5c8',
                                                    height: '100%',
                                                    textAlign: 'center',
                                                    cursor: 'pointer',
                                                    transition:
                                                        'all 0.2s ease',
                                                }}
                                                bodyStyle={{
                                                    padding: compact
                                                        ? 12
                                                        : 16,
                                                }}
                                            >
                                                {/* 书架装饰图标 */}
                                                <div
                                                    style={{
                                                        width: '100%',
                                                        height: 120,
                                                        marginBottom: 12,
                                                        borderRadius: 8,
                                                        background: `linear-gradient(135deg,
                                                            ${CARD_COLORS[shelf.logical_shelf_id % CARD_COLORS.length]},
                                                            ${CARD_COLORS[(shelf.logical_shelf_id + 1) % CARD_COLORS.length]}
                                                        )`,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                    }}
                                                >
                                                    <BookOutlined
                                                        style={{
                                                            fontSize: SHELF_ICON_SIZE,
                                                            color: 'rgba(139,69,19,.2)',
                                                        }}
                                                    />
                                                </div>

                                                {/* 书架名称 */}
                                                <Text
                                                    strong
                                                    style={{
                                                        display: 'block',
                                                        marginBottom: 8,
                                                        overflow: 'hidden',
                                                        textOverflow:
                                                            'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {isActive && (
                                                        <CheckCircleFilled
                                                            style={{
                                                                color: ACTIVE_COLOR,
                                                                marginRight: 4,
                                                            }}
                                                        />
                                                    )}
                                                    {shelf.shelf_name}
                                                </Text>

                                                {/* 图书数量 */}
                                                <Badge
                                                    count={shelf.book_count}
                                                    showZero
                                                    style={{
                                                        backgroundColor:
                                                            BRAND_COLOR,
                                                    }}
                                                />

                                                {/* 当前选中标识 */}
                                                {isActive && (
                                                    <Tag
                                                        color="gold"
                                                        style={{
                                                            marginTop: 8,
                                                            borderRadius: 10,
                                                            fontSize: 11,
                                                        }}
                                                    >
                                                        当前书架
                                                    </Tag>
                                                )}
                                            </Card>
                                        </Col>
                                    );
                                })}
                            </Row>
                        )}
                    </Card>
                )}
            </div>
        );
    }

    // ==================== 侧边栏列表模式 ====================

    return (
        <div
            style={{
                background: '#fff',
                borderRadius: 12,
                border: '1px solid #e8d5c8',
                padding: 16,
            }}
        >
            {/* 标题栏 */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                }}
            >
                <Title level={5} style={{ margin: 0 }}>
                    <BookOutlined
                        style={{
                            color: BRAND_COLOR,
                            marginRight: 8,
                        }}
                    />
                    书架列表
                </Title>
                <Button
                    size="small"
                    icon={<ReloadOutlined spin={loading} />}
                    onClick={loadShelves}
                    type="text"
                />
            </div>

            {/* 搜索框 */}
            <Input
                prefix={<SearchOutlined />}
                placeholder="搜索书架..."
                allowClear
                size="small"
                onChange={(e) => setSearchText(e.target.value)}
                style={{ marginBottom: 12 }}
            />

            {/* 加载中 */}
            {loading && (
                <div style={{ textAlign: 'center', padding: 20 }}>
                    <Spin size="small" />
                </div>
            )}

            {/* 无结果 */}
            {!loading && filteredShelves.length === 0 && (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={searchText ? '无匹配结果' : '暂无书架'}
                    style={{ padding: 20 }}
                />
            )}

            {/* 书架列表 */}
            {!loading &&
                filteredShelves.map((shelf) => {
                    const isActive =
                        shelf.logical_shelf_id === currentShelfId;

                    return (
                        <div
                            key={shelf.logical_shelf_id}
                            onClick={() =>
                                handleShelfSelect(
                                    shelf.logical_shelf_id,
                                    shelf.shelf_name
                                )
                            }
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '10px 12px',
                                borderRadius: 8,
                                cursor: 'pointer',
                                background: isActive
                                    ? '#fdf6f0'
                                    : 'transparent',
                                border: isActive
                                    ? `1px solid ${ACTIVE_COLOR}`
                                    : '1px solid transparent',
                                marginBottom: 4,
                                transition: 'all 0.15s ease',
                            }}
                        >
                            {/* 书架信息 */}
                            <div
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                }}
                            >
                                <Text
                                    strong={isActive}
                                    style={{
                                        fontSize: 13,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        display: 'block',
                                    }}
                                >
                                    {isActive && (
                                        <RightOutlined
                                            style={{
                                                color: ACTIVE_COLOR,
                                                marginRight: 4,
                                            }}
                                        />
                                    )}
                                    {shelf.shelf_name}
                                </Text>
                                {shelf.physical_location && (
                                    <Text
                                        type="secondary"
                                        style={{ fontSize: 11 }}
                                    >
                                        <EnvironmentOutlined
                                            style={{
                                                color: '#52c41a',
                                                marginRight: 4,
                                            }}
                                        />
                                        {shelf.physical_location}
                                    </Text>
                                )}
                            </div>

                            {/* 数量角标 */}
                            <Badge
                                count={shelf.book_count}
                                size="small"
                                style={{
                                    backgroundColor: BRAND_COLOR,
                                }}
                            />
                        </div>
                    );
                })}
        </div>
    );
};

export default ShelfSwitcher;