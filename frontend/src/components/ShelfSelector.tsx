// frontend/src/components/ShelfSelector.tsx
/**
 * 书架选择器（弹窗模式）
 * 
 * 以 Modal 形式展示所有书架，供用户选择将图书添加到哪个书架。
 * 
 * 功能：
 * - 自动加载书架列表
 * - 搜索过滤书架（名称/描述/物理位置）
 * - 显示书架统计（图书数量、物理位置）
 * - 一键添加图书到选中的书架
 * - 添加成功后的视觉反馈
 * - 错误重试机制
 * 
 * 使用场景：
 * - 图书详情页 → 添加到书架按钮
 * - 搜索结果 → 批量添加到书架入口
 */

import React, {
    useEffect,
    useState,
    useCallback,
    useMemo,
    useRef,
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
} from '@ant-design/icons';
import { listShelves, addBookToShelf } from '../services/api';

// ---- 类型定义 ----

const { Text } = Typography;

/** 书架列表项 */
interface ShelfItem {
    logical_shelf_id: number;
    shelf_name: string;
    description: string;
    book_count: number;
    physical_location?: string;
}

interface ShelfSelectorProps {
    /** 弹窗是否可见 */
    visible: boolean;
    /** 要添加的图书 ID */
    bookId: number;
    /** 图书标题（展示用） */
    bookTitle: string;
    /** 关闭回调 */
    onClose: () => void;
    /** 添加成功回调 */
    onSuccess?: (shelfId: number) => void;
    /** 创建新书架回调 */
    onCreateNew?: () => void;
}

// ---- 常量 ----

/** 添加成功后自动关闭延时（毫秒） */
const AUTO_CLOSE_DELAY = 1500;

/** 书架搜索结果为空时的图标颜色 */
const EMPTY_ICON_COLOR = '#d4a574';

// ---- 组件 ----

const ShelfSelector: React.FC<ShelfSelectorProps> = ({
    visible,
    bookId,
    bookTitle,
    onClose,
    onSuccess,
    onCreateNew,
}) => {
    // ==================== 状态 ====================
    
    const [shelves, setShelves] = useState<ShelfItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [addingBook, setAddingBook] = useState<number | null>(null);
    const [addedShelfId, setAddedShelfId] = useState<number | null>(null);
    const [searchText, setSearchText] = useState('');

    /** 组件是否已挂载（防止内存泄漏） */
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // ==================== 数据加载 ====================

    /**
     * 加载书架列表
     * 
     * 错误处理：
     * - 网络错误 → 显示错误信息和重试按钮
     * - 业务错误 → 显示服务端返回的错误详情
     */
    const loadShelves = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await listShelves();
            if (isMounted.current) {
                setShelves(data || []);
            }
        } catch (err: any) {
            const errorMessage =
                err?.response?.data?.detail ||
                err?.userMessage ||
                '加载书架列表失败，请检查网络连接';
            if (isMounted.current) {
                setError(errorMessage);
            }
        } finally {
            if (isMounted.current) {
                setLoading(false);
            }
        }
    }, []);

    /**
     * 弹窗打开时重新加载书架列表
     * 并重置搜索和已添加状态
     */
    useEffect(() => {
        if (visible) {
            setAddedShelfId(null);
            setSearchText('');
            setError(null);
            loadShelves();
        }
    }, [visible, loadShelves]);

    // ==================== 搜索过滤 ====================

    /**
     * 根据搜索文本过滤书架
     * 
     * 匹配范围：书架名称、描述、物理位置（不区分大小写）
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

    // ==================== 添加图书 ====================

    /**
     * 将图书添加到指定书架
     * 
     * 处理逻辑：
     * 1. 防止重复提交（addingBook 不为 null 时忽略）
     * 2. 调用 API 添加
     * 3. 成功 → 视觉反馈 + 延时自动关闭
     * 4. 失败 → 显示错误提示
     * 
     * @param shelfId - 目标书架 ID
     */
    const handleAddToShelf = useCallback(
        async (shelfId: number) => {
            // 防止重复提交
            if (addingBook !== null) return;

            setAddingBook(shelfId);

            try {
                await addBookToShelf(shelfId, bookId);

                if (isMounted.current) {
                    setAddedShelfId(shelfId);
                    message.success(`《${bookTitle}》已添加到书架`);

                    // 回调通知父组件
                    onSuccess?.(shelfId);

                    // 延时自动关闭弹窗
                    setTimeout(() => {
                        if (isMounted.current) {
                            onClose();
                        }
                    }, AUTO_CLOSE_DELAY);
                }
            } catch (err: any) {
                const errorMessage =
                    err?.response?.data?.detail ||
                    err?.userMessage ||
                    '添加失败，请重试';
                if (isMounted.current) {
                    message.error(errorMessage);
                }
            } finally {
                if (isMounted.current) {
                    setAddingBook(null);
                }
            }
        },
        [bookId, bookTitle, addingBook, onSuccess, onClose]
    );

    // ==================== 渲染辅助 ====================

    /**
     * 渲染单个书架列表项
     */
    const renderShelfItem = useCallback(
        (shelf: ShelfItem) => {
            const isAdded = addedShelfId === shelf.logical_shelf_id;
            const isAdding = addingBook === shelf.logical_shelf_id;

            return (
                <List.Item
                    style={{
                        padding: '12px 16px',
                        borderRadius: 10,
                        marginBottom: 8,
                        border: `1px solid ${
                            isAdded ? '#bbf7d0' : '#f0e4d8'
                        }`,
                        background: isAdded ? '#f0fdf4' : '#fff',
                        cursor: isAdded ? 'default' : 'pointer',
                        transition: 'all 0.2s ease',
                    }}
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
                                background:
                                    'linear-gradient(135deg, #fef3c7, #fde68a)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}
                        >
                            <BookOutlined
                                style={{
                                    color: '#92400e',
                                    fontSize: 20,
                                }}
                            />
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
                                <Tag
                                    color="blue"
                                    style={{
                                        fontSize: 12,
                                        borderRadius: 10,
                                    }}
                                >
                                    <BookOutlined /> {shelf.book_count}本
                                </Tag>
                                {shelf.physical_location && (
                                    <Tag
                                        color="green"
                                        style={{
                                            fontSize: 12,
                                            borderRadius: 10,
                                        }}
                                    >
                                        <EnvironmentOutlined />{' '}
                                        {shelf.physical_location}
                                    </Tag>
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
                                    style={{ borderRadius: 6 }}
                                >
                                    已添加
                                </Tag>
                            ) : (
                                <Tooltip title={`添加《${bookTitle}》到此书架`}>
                                    <Button
                                        type="primary"
                                        size="small"
                                        icon={
                                            isAdding ? (
                                                <LoadingOutlined />
                                            ) : (
                                                <PlusOutlined />
                                            )
                                        }
                                        loading={isAdding}
                                        disabled={addingBook !== null}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleAddToShelf(
                                                shelf.logical_shelf_id
                                            );
                                        }}
                                        style={{ borderRadius: 6 }}
                                    >
                                        添加到书架
                                    </Button>
                                </Tooltip>
                            )}
                        </div>
                    </div>
                </List.Item>
            );
        },
        [addedShelfId, addingBook, bookTitle, handleAddToShelf]
    );

    // ==================== 渲染 ====================

    /** 弹窗标题 */
    const modalTitle = (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
            }}
        >
            <BookOutlined
                style={{ color: '#8B4513', fontSize: 18 }}
            />
            <span style={{ fontWeight: 600 }}>添加到书架</span>
            <Text
                type="secondary"
                style={{ fontSize: 14 }}
            >
                —《{bookTitle}》
            </Text>
        </div>
    );

    return (
        <Modal
            title={modalTitle}
            open={visible}
            onCancel={onClose}
            footer={null}
            width={560}
            destroyOnClose
            maskClosable={!addingBook} // 添加中不允许点击遮罩关闭
        >
            {/* 搜索框（仅在有数据且非加载中时显示） */}
            {!loading && shelves.length > 0 && (
                <Input
                    placeholder="搜索书架名称、描述或位置..."
                    prefix={<SearchOutlined />}
                    allowClear
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{ marginBottom: 16, borderRadius: 8 }}
                />
            )}

            {/* 加载中 */}
            {loading && (
                <div style={{ textAlign: 'center', padding: 60 }}>
                    <Spin size="large" />
                    <Text
                        type="secondary"
                        style={{ display: 'block', marginTop: 16 }}
                    >
                        正在加载书架列表...
                    </Text>
                </div>
            )}

            {/* 加载错误 */}
            {error && (
                <Alert
                    type="error"
                    message="加载失败"
                    description={error}
                    showIcon
                    action={
                        <Button
                            size="small"
                            danger
                            onClick={loadShelves}
                            icon={<ReloadOutlined />}
                        >
                            重试
                        </Button>
                    }
                    style={{ margin: '40px 0' }}
                />
            )}

            {/* 空书架列表 */}
            {!loading && !error && shelves.length === 0 && (
                <Empty
                    image={
                        <InboxOutlined
                            style={{
                                fontSize: 48,
                                color: EMPTY_ICON_COLOR,
                            }}
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
                            创建新书架
                        </Button>
                    )}
                </Empty>
            )}

            {/* 搜索无结果 */}
            {!loading && !error && shelves.length > 0 && filteredShelves.length === 0 && (
                <Empty
                    image={
                        <SearchOutlined
                            style={{
                                fontSize: 48,
                                color: EMPTY_ICON_COLOR,
                            }}
                        />
                    }
                    description={`未找到「${searchText}」相关的书架`}
                    style={{ padding: '40px 0' }}
                >
                    <Button onClick={() => setSearchText('')}>
                        清除搜索
                    </Button>
                </Empty>
            )}

            {/* 书架列表 */}
            {!loading && !error && filteredShelves.length > 0 && (
                <List
                    dataSource={filteredShelves}
                    style={{
                        maxHeight: 400,
                        overflow: 'auto',
                    }}
                    renderItem={renderShelfItem}
                />
            )}
        </Modal>
    );
};

export default ShelfSelector;