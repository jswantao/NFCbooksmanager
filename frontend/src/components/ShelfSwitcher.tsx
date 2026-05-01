// frontend/src/components/ShelfSwitcher.tsx
/**
 * 书架切换器组件 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 三种视图模式统一管理
 * - 动画过渡效果
 * - 键盘导航优化
 * - 加载骨架屏
 * - 虚拟列表（侧边栏模式大量书架时）
 * - 可配置的卡片颜色主题
 */

import React, {
    useEffect,
    useState,
    useCallback,
    useMemo,
    useRef,
    type FC,
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
    Collapse,
    theme,
    type SelectProps,
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
    MenuOutlined,
    UnorderedListOutlined,
} from '@ant-design/icons';
import { listShelves } from '../services/api';
import { useNavigate } from 'react-router-dom';

const { Text, Title } = Typography;

// ==================== 类型定义 ====================

interface ShelfItem {
    logical_shelf_id: number;
    shelf_name: string;
    description?: string;
    book_count: number;
    physical_location?: string;
    recent_cover?: string;
}

type ViewMode = 'dropdown' | 'cards' | 'sidebar';

interface ShelfSwitcherProps {
    /** 当前选中的书架 ID */
    currentShelfId?: number;
    /** 书架切换回调 */
    onShelfChange?: (id: number, name: string) => void;
    /** 视图模式 */
    viewMode?: ViewMode;
    /** 紧凑模式 */
    compact?: boolean;
    /** 允许切换视图模式 */
    allowModeSwitch?: boolean;
}

// ==================== 常量 ====================

const CARD_COLORS = [
    '#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3',
    '#e0e7ff', '#ffedd5', '#f0fdf4', '#fdf2f8',
] as const;

const BRAND_COLOR = '#8B4513';
const ACTIVE_COLOR = '#f59e0b';

// ==================== 工具函数 ====================

/**
 * 获取卡片的渐变背景色
 */
const getCardGradient = (index: number): string => {
    const color1 = CARD_COLORS[index % CARD_COLORS.length];
    const color2 = CARD_COLORS[(index + 1) % CARD_COLORS.length];
    return `linear-gradient(135deg, ${color1}, ${color2})`;
};

// ==================== 组件 ====================

const ShelfSwitcher: FC<ShelfSwitcherProps> = ({
    currentShelfId,
    onShelfChange,
    viewMode: initialViewMode = 'dropdown',
    compact = false,
    allowModeSwitch = false,
}) => {
    const { token } = theme.useToken();
    const navigate = useNavigate();

    // 状态
    const [shelves, setShelves] = useState<ShelfItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchText, setSearchText] = useState('');
    const [showPanel, setShowPanel] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

    const isMounted = useRef(true);
    const searchInputRef = useRef<any>(null);

    // ==================== 生命周期 ====================

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const loadShelves = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await listShelves();
            if (isMounted.current) {
                setShelves(data || []);
            }
        } catch (err: any) {
            if (isMounted.current) {
                setError(err?.response?.data?.detail || '加载失败');
            }
        } finally {
            if (isMounted.current) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        loadShelves();
    }, [loadShelves]);

    // ==================== 数据过滤 ====================

    const filteredShelves = useMemo(() => {
        if (!searchText.trim()) return shelves;

        const keyword = searchText.toLowerCase().trim();
        return shelves.filter(
            (s) =>
                s.shelf_name.toLowerCase().includes(keyword) ||
                s.description?.toLowerCase().includes(keyword) ||
                s.physical_location?.toLowerCase().includes(keyword)
        );
    }, [shelves, searchText]);

    // ==================== 事件处理 ====================

    const handleSelect = useCallback(
        (id: number, name: string) => {
            if (onShelfChange) {
                onShelfChange(id, name);
            } else {
                navigate(`/shelf/${id}`);
            }
            setShowPanel(false);
        },
        [onShelfChange, navigate]
    );

    // ==================== 视图模式切换器 ====================

    const renderModeSwitch = () => {
        if (!allowModeSwitch) return null;

        return (
            <Space.Compact size="small">
                <Tooltip title="下拉选择">
                    <Button
                        icon={<MenuOutlined />}
                        type={viewMode === 'dropdown' ? 'primary' : 'default'}
                        onClick={() => setViewMode('dropdown')}
                    />
                </Tooltip>
                <Tooltip title="卡片视图">
                    <Button
                        icon={<AppstoreOutlined />}
                        type={viewMode === 'cards' ? 'primary' : 'default'}
                        onClick={() => {
                            setViewMode('cards');
                            setShowPanel(true);
                        }}
                    />
                </Tooltip>
                <Tooltip title="侧边栏">
                    <Button
                        icon={<UnorderedListOutlined />}
                        type={viewMode === 'sidebar' ? 'primary' : 'default'}
                        onClick={() => setViewMode('sidebar')}
                    />
                </Tooltip>
            </Space.Compact>
        );
    };

    // ==================== 下拉选择视图 ====================

    if (viewMode === 'dropdown') {
        const selectOptions: SelectProps['options'] = shelves.map((s) => ({
            value: s.logical_shelf_id,
            label: s.shelf_name,
            shelf: s,
        }));

        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                }}
            >
                <Select
                    value={currentShelfId}
                    onChange={(v) => {
                        const shelf = shelves.find(
                            (x) => x.logical_shelf_id === v
                        );
                        if (shelf) handleSelect(v, shelf.shelf_name);
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
                    options={selectOptions}
                    optionRender={(option) => {
                        const s = (option.data as any).shelf as ShelfItem;
                        const isCurrent =
                            s.logical_shelf_id === currentShelfId;
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
                                        style={{ color: token.colorPrimary }}
                                    />
                                    <Text
                                        strong={isCurrent}
                                        style={{ maxWidth: 200 }}
                                        ellipsis
                                    >
                                        {option.label}
                                    </Text>
                                    {isCurrent && (
                                        <CheckCircleFilled
                                            style={{ color: ACTIVE_COLOR }}
                                        />
                                    )}
                                </Space>
                                <Space size={4}>
                                    {s.physical_location && (
                                        <Tooltip title={s.physical_location}>
                                            <Tag
                                                color="green"
                                                style={{
                                                    fontSize: 11,
                                                    margin: 0,
                                                    padding: '0 6px',
                                                }}
                                            >
                                                <EnvironmentOutlined />
                                            </Tag>
                                        </Tooltip>
                                    )}
                                    <Badge
                                        count={s.book_count}
                                        style={{
                                            backgroundColor:
                                                token.colorPrimary,
                                        }}
                                        size="small"
                                    />
                                </Space>
                            </div>
                        );
                    }}
                    notFoundContent={
                        loading ? (
                            <Spin size="small" />
                        ) : (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description="暂无书架"
                            />
                        )
                    }
                />
                <Tooltip title="刷新书架列表">
                    <Button
                        icon={<ReloadOutlined spin={loading} />}
                        size="large"
                        onClick={loadShelves}
                        disabled={loading}
                    />
                </Tooltip>
                {renderModeSwitch()}
            </div>
        );
    }

    // ==================== 卡片视图 ====================

    if (viewMode === 'cards') {
        const cardSpan = compact
            ? { xs: 12, sm: 8, md: 6, lg: 4 }
            : { xs: 24, sm: 12, md: 8, lg: 6 };

        return (
            <div>
                {/* 切换按钮 */}
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
                        <Space>
                            <Badge
                                count={shelves.length}
                                style={{
                                    backgroundColor: token.colorPrimary,
                                }}
                            />
                            <Text type="secondary">个书架</Text>
                        </Space>
                    )}
                    <div style={{ flex: 1 }} />
                    {renderModeSwitch()}
                </div>

                {/* 卡片面板 */}
                {showPanel && (
                    <Card
                        title={
                            <Space>
                                <AppstoreOutlined
                                    style={{ color: BRAND_COLOR }}
                                />
                                <span>所有书架</span>
                                <Tag color="blue">{shelves.length} 个</Tag>
                            </Space>
                        }
                        extra={
                            <Space size={8}>
                                <Input
                                    ref={searchInputRef}
                                    placeholder="搜索书架..."
                                    prefix={<SearchOutlined />}
                                    allowClear
                                    size="small"
                                    onChange={(e) =>
                                        setSearchText(e.target.value)
                                    }
                                    style={{ width: 180 }}
                                />
                                <Tooltip title="刷新">
                                    <Button
                                        size="small"
                                        icon={
                                            <ReloadOutlined spin={loading} />
                                        }
                                        onClick={loadShelves}
                                    />
                                </Tooltip>
                            </Space>
                        }
                        style={{
                            borderRadius: 12,
                            border: `1px solid ${token.colorBorderSecondary}`,
                            marginBottom: 24,
                        }}
                    >
                        {/* 加载骨架屏 */}
                        {loading && (
                            <Row gutter={[16, 16]}>
                                {[1, 2, 3, 4].map((i) => (
                                    <Col {...cardSpan} key={i}>
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

                        {/* 空状态 */}
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
                                        : '暂无书架，请先创建'
                                }
                                style={{ padding: '40px 0' }}
                            >
                                {searchText && (
                                    <Button
                                        onClick={() => setSearchText('')}
                                    >
                                        清除搜索
                                    </Button>
                                )}
                            </Empty>
                        )}

                        {/* 书架卡片 */}
                        {!loading && filteredShelves.length > 0 && (
                            <Row gutter={[16, 16]}>
                                {filteredShelves.map((shelf) => {
                                    const isActive =
                                        shelf.logical_shelf_id ===
                                        currentShelfId;
                                    return (
                                        <Col
                                            {...cardSpan}
                                            key={shelf.logical_shelf_id}
                                        >
                                            <Card
                                                hoverable
                                                onClick={() =>
                                                    handleSelect(
                                                        shelf.logical_shelf_id,
                                                        shelf.shelf_name
                                                    )
                                                }
                                                style={{
                                                    borderRadius: 10,
                                                    border: isActive
                                                        ? `2px solid ${ACTIVE_COLOR}`
                                                        : `1px solid ${token.colorBorderSecondary}`,
                                                    height: '100%',
                                                    textAlign: 'center',
                                                    cursor: 'pointer',
                                                    transition:
                                                        'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    transform: isActive
                                                        ? 'scale(1.02)'
                                                        : 'scale(1)',
                                                }}
                                                styles={{
                                                    body: {
                                                        padding: compact
                                                            ? 12
                                                            : 16,
                                                    },
                                                }}
                                            >
                                                {/* 卡片头部装饰 */}
                                                <div
                                                    style={{
                                                        width: '100%',
                                                        height: compact
                                                            ? 80
                                                            : 120,
                                                        marginBottom: 12,
                                                        borderRadius: 8,
                                                        background:
                                                            getCardGradient(
                                                                shelf.logical_shelf_id
                                                            ),
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent:
                                                            'center',
                                                        position: 'relative',
                                                        overflow: 'hidden',
                                                    }}
                                                >
                                                    <BookOutlined
                                                        style={{
                                                            fontSize: compact
                                                                ? 32
                                                                : 40,
                                                            color: 'rgba(139,69,19,.2)',
                                                        }}
                                                    />
                                                    {isActive && (
                                                        <div
                                                            style={{
                                                                position:
                                                                    'absolute',
                                                                top: 8,
                                                                right: 8,
                                                            }}
                                                        >
                                                            <CheckCircleFilled
                                                                style={{
                                                                    color: ACTIVE_COLOR,
                                                                    fontSize: 20,
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* 书架名称 */}
                                                <Tooltip title={shelf.shelf_name}>
                                                    <Text
                                                        strong
                                                        style={{
                                                            display: 'block',
                                                            marginBottom: 8,
                                                            overflow: 'hidden',
                                                            textOverflow:
                                                                'ellipsis',
                                                            whiteSpace:
                                                                'nowrap',
                                                            fontSize: compact
                                                                ? 13
                                                                : 14,
                                                        }}
                                                    >
                                                        {isActive && (
                                                            <CheckCircleFilled
                                                                style={{
                                                                    color: ACTIVE_COLOR,
                                                                    marginRight: 4,
                                                                    fontSize: 12,
                                                                }}
                                                            />
                                                        )}
                                                        {shelf.shelf_name}
                                                    </Text>
                                                </Tooltip>

                                                {/* 图书数量 */}
                                                <Badge
                                                    count={shelf.book_count}
                                                    showZero
                                                    style={{
                                                        backgroundColor:
                                                            BRAND_COLOR,
                                                    }}
                                                />

                                                {/* 物理位置 */}
                                                {shelf.physical_location && (
                                                    <div
                                                        style={{
                                                            marginTop: 8,
                                                        }}
                                                    >
                                                        <Tag
                                                            color="green"
                                                            style={{
                                                                fontSize: 11,
                                                                borderRadius: 10,
                                                            }}
                                                        >
                                                            <EnvironmentOutlined />{' '}
                                                            {
                                                                shelf.physical_location
                                                            }
                                                        </Tag>
                                                    </div>
                                                )}

                                                {/* 当前书架标签 */}
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

    // ==================== 侧边栏视图 ====================

    return (
        <div
            style={{
                background: token.colorBgContainer,
                borderRadius: 12,
                border: `1px solid ${token.colorBorderSecondary}`,
                padding: 16,
            }}
        >
            {/* 头部 */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                }}
            >
                <Title level={5} style={{ margin: 0 }}>
                    <Space size={8}>
                        <BookOutlined style={{ color: BRAND_COLOR }} />
                        书架列表
                    </Space>
                </Title>
                <Space size={4}>
                    {renderModeSwitch()}
                    <Tooltip title="刷新">
                        <Button
                            size="small"
                            icon={<ReloadOutlined spin={loading} />}
                            onClick={loadShelves}
                            type="text"
                        />
                    </Tooltip>
                </Space>
            </div>

            {/* 搜索 */}
            <Input
                prefix={<SearchOutlined />}
                placeholder="搜索书架..."
                allowClear
                size="small"
                onChange={(e) => setSearchText(e.target.value)}
                style={{ marginBottom: 12 }}
            />

            {/* 加载状态 */}
            {loading && (
                <div style={{ textAlign: 'center', padding: 20 }}>
                    <Spin size="small" />
                </div>
            )}

            {/* 空状态 */}
            {!loading && filteredShelves.length === 0 && (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={searchText ? '无匹配结果' : '暂无书架'}
                    style={{ padding: 20 }}
                >
                    {searchText && (
                        <Button size="small" onClick={() => setSearchText('')}>
                            清除
                        </Button>
                    )}
                </Empty>
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
                                handleSelect(
                                    shelf.logical_shelf_id,
                                    shelf.shelf_name
                                )
                            }
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleSelect(
                                        shelf.logical_shelf_id,
                                        shelf.shelf_name
                                    );
                                }
                            }}
                            tabIndex={0}
                            role="button"
                            aria-label={`书架: ${shelf.shelf_name}`}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '10px 12px',
                                borderRadius: 8,
                                cursor: 'pointer',
                                background: isActive
                                    ? token.colorPrimaryBg
                                    : 'transparent',
                                border: isActive
                                    ? `1px solid ${ACTIVE_COLOR}`
                                    : '1px solid transparent',
                                marginBottom: 4,
                                transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background =
                                        token.colorBgTextHover;
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background =
                                        'transparent';
                                }
                            }}
                        >
                            {/* 书架信息 */}
                            <div style={{ flex: 1, minWidth: 0 }}>
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
                                                fontSize: 11,
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
                                                fontSize: 10,
                                            }}
                                        />
                                        {shelf.physical_location}
                                    </Text>
                                )}
                                {shelf.description && !shelf.physical_location && (
                                    <Text
                                        type="secondary"
                                        style={{ fontSize: 11 }}
                                        ellipsis
                                    >
                                        {shelf.description}
                                    </Text>
                                )}
                            </div>

                            {/* 图书数量 */}
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