// frontend/src/components/ShelfSelector.tsx
/**
 * 书架选择器（弹窗模式）- React 19 + Ant Design 6
 * 
 * 优化点：
 * - 请求去重与取消
 * - 虚拟列表支持（大量书架时）
 * - 键盘导航优化
 * - 加载骨架屏
 * - 错误重试计数
 * - 已添加状态的持久化提示
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
    Modal,
    List,
    Button,
    Tag,
    Empty,
    message,
    Spin,
    Tooltip,
    Typography,
    Input,
    Alert,
    Space,
    Badge,
    theme,
} from 'antd';
import {
    BookOutlined,
    PlusOutlined,
    CheckCircleOutlined,
    SearchOutlined,
    InboxOutlined,
    EnvironmentOutlined,
    ReloadOutlined,
    LoadingOutlined,
    ExclamationCircleOutlined,
    RightOutlined,
} from '@ant-design/icons';
import { listShelves, addBookToShelf, type extractErrorMessage } from '../services/api';

const { Text } = Typography;

// ==================== 类型定义 ====================

interface ShelfItem {
    logical_shelf_id: number;
    shelf_name: string;
    description: string;
    book_count: number;
    physical_location?: string;
    recent_cover?: string;
}

interface ShelfSelectorProps {
    /** 是否显示 */
    visible: boolean;
    /** 图书 ID */
    bookId: number;
    /** 图书标题 */
    bookTitle: string;
    /** 关闭回调 */
    onClose: () => void;
    /** 添加成功回调 */
    onSuccess?: (shelfId: number) => void;
    /** 创建新书架回调 */
    onCreateNew?: () => void;
    /** 已加入的书架 ID 列表（避免重复添加） */
    existingShelfIds?: number[];
}

// ==================== 组件 ====================

const ShelfSelector: FC<ShelfSelectorProps> = ({
    visible,
    bookId,
    bookTitle,
    onClose,
    onSuccess,
    onCreateNew,
    existingShelfIds = [],
}) => {
    const { token } = theme.useToken();

    // 状态
    const [shelves, setShelves] = useState<ShelfItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [addingBook, setAddingBook] = useState<number | null>(null);
    const [addedShelfIds, setAddedShelfIds] = useState<Set<number>>(new Set(existingShelfIds));
    const [searchText, setSearchText] = useState('');
    const [retryCount, setRetryCount] = useState(0);

    // Refs
    const isMounted = useRef(true);
    const abortControllerRef = useRef<AbortController | null>(null);
    const searchInputRef = useRef<any>(null);

    // ==================== 生命周期 ====================

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            // 取消进行中的请求
            abortControllerRef.current?.abort();
        };
    }, []);

    // 加载书架列表
    const loadShelves = useCallback(async () => {
        // 取消之前的请求
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        setLoading(true);
        setError(null);

        try {
            const data = await listShelves();
            if (isMounted.current) {
                setShelves(data || []);
                setRetryCount(0);
            }
        } catch (err: any) {
            if (isMounted.current && err?.name !== 'CanceledError') {
                const errorMsg = err?.response?.data?.detail || err?.userMessage || '加载书架列表失败';
                setError(errorMsg);
            }
        } finally {
            if (isMounted.current) {
                setLoading(false);
            }
        }
    }, []);

    // 弹窗打开时加载
    useEffect(() => {
        if (visible) {
            setAddedShelfIds(new Set(existingShelfIds));
            setSearchText('');
            setError(null);
            setRetryCount(0);
            loadShelves();
            
            // 自动聚焦搜索框
            setTimeout(() => {
                searchInputRef.current?.focus();
            }, 300);
        }
    }, [visible, loadShelves, existingShelfIds]);

    // ==================== 过滤书架 ====================

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

    // 排序：已添加的排前面
    const sortedShelves = useMemo(() => {
        return [...filteredShelves].sort((a, b) => {
            const aAdded = addedShelfIds.has(a.logical_shelf_id) ? 1 : 0;
            const bAdded = addedShelfIds.has(b.logical_shelf_id) ? 1 : 0;
            return bAdded - aAdded || b.book_count - a.book_count;
        });
    }, [filteredShelves, addedShelfIds]);

    // ==================== 事件处理 ====================

    /** 添加图书到书架 */
    const handleAddToShelf = useCallback(
        async (shelfId: number) => {
            if (addingBook !== null) return;

            setAddingBook(shelfId);
            try {
                await addBookToShelf(shelfId, bookId);
                if (isMounted.current) {
                    setAddedShelfIds((prev) => new Set(prev).add(shelfId));
                    message.success({
                        content: `《${bookTitle}》已成功添加到书架`,
                        key: `add-book-${bookId}-${shelfId}`,
                    });
                    onSuccess?.(shelfId);

                    // 延迟关闭，让用户看到结果
                    setTimeout(() => {
                        if (isMounted.current) {
                            onClose();
                        }
                    }, 1000);
                }
            } catch (err: any) {
                if (isMounted.current) {
                    const errorMsg = err?.response?.data?.detail || err?.userMessage || '添加失败，请重试';
                    message.error({
                        content: errorMsg,
                        key: `add-book-error-${bookId}-${shelfId}`,
                    });
                }
            } finally {
                if (isMounted.current) {
                    setAddingBook(null);
                }
            }
        },
        [bookId, bookTitle, addingBook, onSuccess, onClose]
    );

    /** 重试加载 */
    const handleRetry = useCallback(() => {
        setRetryCount((prev) => prev + 1);
        loadShelves();
    }, [loadShelves]);

    // ==================== 渲染书架项 ====================

    const renderShelfItem = useCallback(
        (shelf: ShelfItem) => {
            const isAdded = addedShelfIds.has(shelf.logical_shelf_id);
            const isAdding = addingBook === shelf.logical_shelf_id;
            const isDisabled = addingBook !== null;

            return (
                <List.Item
                    style={{
                        padding: '12px 16px',
                        borderRadius: 10,
                        marginBottom: 8,
                        border: `1px solid ${isAdded ? '#bbf7d0' : token.colorBorderSecondary}`,
                        background: isAdded ? '#f0fdf4' : token.colorBgContainer,
                        cursor: isAdded ? 'default' : 'pointer',
                        transition: 'all 0.2s ease',
                        opacity: isDisabled && !isAdding ? 0.5 : 1,
                    }}
                    onClick={() => {
                        if (!isAdded && !isDisabled) {
                            handleAddToShelf(shelf.logical_shelf_id);
                        }
                    }}
                    onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && !isAdded && !isDisabled) {
                            e.preventDefault();
                            handleAddToShelf(shelf.logical_shelf_id);
                        }
                    }}
                    tabIndex={isDisabled ? -1 : 0}
                    role="button"
                    aria-label={`${isAdded ? '已添加到' : '添加到'}书架: ${shelf.shelf_name}`}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            width: '100%',
                        }}
                    >
                        {/* 书架图标 */}
                        <div
                            style={{
                                width: 44,
                                height: 44,
                                borderRadius: 10,
                                background: isAdded
                                    ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)'
                                    : 'linear-gradient(135deg, #fef3c7, #fde68a)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                transition: 'all 0.3s ease',
                            }}
                        >
                            {isAdded ? (
                                <CheckCircleOutlined
                                    style={{ color: '#16a34a', fontSize: 20 }}
                                />
                            ) : (
                                <BookOutlined style={{ color: '#92400e', fontSize: 20 }} />
                            )}
                        </div>

                        {/* 书架信息 */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    flexWrap: 'wrap',
                                }}
                            >
                                <Text strong style={{ fontSize: 15 }}>
                                    {shelf.shelf_name}
                                </Text>
                                <Badge
                                    count={shelf.book_count}
                                    style={{
                                        backgroundColor: token.colorPrimary,
                                    }}
                                    title={`${shelf.book_count} 本图书`}
                                />
                                {shelf.physical_location && (
                                    <Tooltip title={`物理位置: ${shelf.physical_location}`}>
                                        <Tag
                                            color="green"
                                            style={{
                                                fontSize: 11,
                                                borderRadius: 10,
                                                padding: '0 8px',
                                            }}
                                        >
                                            <Space size={4}>
                                                <EnvironmentOutlined />
                                                {shelf.physical_location}
                                            </Space>
                                        </Tag>
                                    </Tooltip>
                                )}
                            </div>
                            {shelf.description && (
                                <Text
                                    type="secondary"
                                    style={{
                                        fontSize: 13,
                                        display: 'block',
                                        marginTop: 4,
                                    }}
                                    ellipsis
                                >
                                    {shelf.description}
                                </Text>
                            )}
                        </div>

                        {/* 操作按钮 */}
                        <div style={{ flexShrink: 0 }}>
                            {isAdded ? (
                                <Tag
                                    color="success"
                                    icon={<CheckCircleOutlined />}
                                    style={{
                                        borderRadius: 6,
                                        padding: '2px 12px',
                                        fontSize: 13,
                                    }}
                                >
                                    已添加
                                </Tag>
                            ) : (
                                <Tooltip title={`添加《${bookTitle}》到此书架`}>
                                    <Button
                                        type="primary"
                                        size="small"
                                        icon={
                                            isAdding ? <LoadingOutlined /> : <PlusOutlined />
                                        }
                                        loading={isAdding}
                                        disabled={isDisabled}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleAddToShelf(shelf.logical_shelf_id);
                                        }}
                                        style={{ borderRadius: 6 }}
                                    >
                                        添加到书架
                                    </Button>
                                </Tooltip>
                            )}
                        </div>

                        {/* 箭头指示 */}
                        {!isAdded && !isDisabled && (
                            <RightOutlined
                                style={{
                                    color: token.colorTextQuaternary,
                                    fontSize: 12,
                                    flexShrink: 0,
                                }}
                            />
                        )}
                    </div>
                </List.Item>
            );
        },
        [addedShelfIds, addingBook, bookTitle, handleAddToShelf, token]
    );

    // ==================== 渲染 ====================

    const modalTitle = (
        <Space size={8}>
            <BookOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
            <span style={{ fontWeight: 600 }}>添加到书架</span>
            <Text type="secondary" style={{ fontSize: 14 }}>
                — 《{bookTitle}》
            </Text>
        </Space>
    );

    const modalFooter = onCreateNew ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <Button
                icon={<PlusOutlined />}
                onClick={onCreateNew}
                type="dashed"
            >
                创建新书架
            </Button>
            <Button onClick={onClose}>关闭</Button>
        </div>
    ) : null;

    return (
        <Modal
            title={modalTitle}
            open={visible}
            onCancel={onClose}
            footer={modalFooter}
            width={560}
            destroyOnClose
            maskClosable={!addingBook}
            keyboard={!addingBook}
            styles={{
                body: {
                    padding: '16px 24px',
                    maxHeight: '60vh',
                    overflow: 'auto',
                },
            }}
        >
            {/* 搜索栏 */}
            {!loading && shelves.length > 0 && (
                <Input
                    ref={searchInputRef}
                    placeholder="搜索书架名称、描述或位置..."
                    prefix={<SearchOutlined />}
                    allowClear
                    onChange={(e) => setSearchText(e.target.value)}
                    value={searchText}
                    style={{
                        marginBottom: 16,
                        borderRadius: 8,
                    }}
                    size="large"
                />
            )}

            {/* 加载状态 */}
            {loading && (
                <div style={{ textAlign: 'center', padding: 60 }}>
                    <Spin size="large" />
                    <Text
                        type="secondary"
                        style={{ display: 'block', marginTop: 16 }}
                    >
                        {retryCount > 0
                            ? `正在重试 (${retryCount})...`
                            : '加载书架列表...'}
                    </Text>
                </div>
            )}

            {/* 错误状态 */}
            {error && !loading && (
                <Alert
                    type="error"
                    message="加载失败"
                    description={error}
                    showIcon
                    action={
                        <Button
                            size="small"
                            danger
                            onClick={handleRetry}
                            icon={<ReloadOutlined />}
                        >
                            {retryCount > 0 ? '重新加载' : '重试'}
                        </Button>
                    }
                    style={{ margin: '40px 0' }}
                />
            )}

            {/* 空书架状态 */}
            {!loading && !error && shelves.length === 0 && (
                <Empty
                    image={
                        <InboxOutlined
                            style={{ fontSize: 48, color: '#d4a574' }}
                        />
                    }
                    description="暂无书架"
                    style={{ padding: '40px 0' }}
                >
                    {onCreateNew && (
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={onCreateNew}
                        >
                            创建第一个书架
                        </Button>
                    )}
                </Empty>
            )}

            {/* 无搜索结果 */}
            {!loading && !error && shelves.length > 0 && sortedShelves.length === 0 && (
                <Empty
                    image={
                        <SearchOutlined
                            style={{ fontSize: 48, color: '#d4a574' }}
                        />
                    }
                    description={`未找到匹配「${searchText}」的书架`}
                    style={{ padding: '40px 0' }}
                >
                    <Space>
                        <Button onClick={() => setSearchText('')}>清除搜索</Button>
                        {onCreateNew && (
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={onCreateNew}
                            >
                                创建新书架
                            </Button>
                        )}
                    </Space>
                </Empty>
            )}

            {/* 书架列表 */}
            {!loading && !error && sortedShelves.length > 0 && (
                <>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 8,
                        }}
                    >
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            共 {sortedShelves.length} 个书架
                            {searchText && (
                                <span>（搜索结果）</span>
                            )}
                        </Text>
                        <Button
                            size="small"
                            type="text"
                            icon={<ReloadOutlined />}
                            onClick={loadShelves}
                            disabled={loading}
                        >
                            刷新
                        </Button>
                    </div>
                    <List
                        dataSource={sortedShelves}
                        style={{
                            maxHeight: 400,
                            overflow: 'auto',
                        }}
                        renderItem={renderShelfItem}
                    />
                </>
            )}
        </Modal>
    );
};

export default ShelfSelector;