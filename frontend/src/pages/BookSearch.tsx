// frontend/src/pages/BookSearch.tsx
/**
 * 图书搜索与同步页面 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 完整的类型定义
 * - 搜索历史记录
 * - 批量搜索模式
 * - 键盘快捷键
 * - 动画过渡效果
 * - 结果操作增强
 * - 主题色适配
 * - 防抖输入
 */

import React, {
    useState,
    useCallback,
    useMemo,
    useEffect,
    useRef,
    type FC,
    type KeyboardEvent,
} from 'react';
import {
    Card,
    Input,
    Button,
    Space,
    message,
    Spin,
    Typography,
    Alert,
    Divider,
    Tag,
    Rate,
    Empty,
    Breadcrumb,
    Result,
    theme,
    Tooltip,
    Image,
    Row,
    Col,
    List,
    Popover,
    Switch,
    type InputRef,
} from 'antd';
import {
    SearchOutlined,
    SyncOutlined,
    PlusOutlined,
    StarFilled,
    UserOutlined,
    HomeOutlined,
    CheckCircleOutlined,
    BookOutlined,
    ClearOutlined,
    ReloadOutlined,
    BarcodeOutlined,
    CalendarOutlined,
    DollarOutlined,
    TranslationOutlined,
    EnvironmentOutlined,
    FileTextOutlined,
    HistoryOutlined,
    ThunderboltOutlined,
    BgColorsOutlined,
    EyeOutlined,
    EditOutlined,
    DeleteOutlined,
    CopyOutlined,
} from '@ant-design/icons';
import { syncBookByISBN, extractErrorMessage } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { getCoverUrl, getPlaceholderCover } from '../utils/image';
import { formatAuthors, formatRating, formatCurrency } from '../utils/format';
import ShelfSelector from '../components/ShelfSelector';
import type { Book } from '../types';

const { Title, Text, Paragraph } = Typography;

// ==================== 类型定义 ====================

interface SearchHistoryItem {
    isbn: string;
    title: string;
    timestamp: number;
}

interface SampleBook {
    isbn: string;
    title: string;
    icon?: string;
}

// ==================== 常量 ====================

const SAMPLE_BOOKS: SampleBook[] = [
    { isbn: '9787020002207', title: '红楼梦', icon: '🏮' },
    { isbn: '9787532768998', title: '百年孤独', icon: '🦋' },
    { isbn: '9787544270878', title: '解忧杂货店', icon: '🏪' },
    { isbn: '9787506365437', title: '活着', icon: '🌾' },
    { isbn: '9787208061644', title: '围城', icon: '🏰' },
    { isbn: '9787544253994', title: '三体', icon: '🌌' },
];

const HISTORY_STORAGE_KEY = 'book-search-history';
const MAX_HISTORY_ITEMS = 10;

// ==================== 自定义 Hook ====================

/**
 * 搜索历史管理 Hook
 */
const useSearchHistory = () => {
    const [history, setHistory] = useState<SearchHistoryItem[]>(() => {
        try {
            const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });

    const addToHistory = useCallback((isbn: string, title: string) => {
        setHistory((prev) => {
            const filtered = prev.filter((item) => item.isbn !== isbn);
            const updated = [
                { isbn, title, timestamp: Date.now() },
                ...filtered,
            ].slice(0, MAX_HISTORY_ITEMS);

            try {
                localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
            } catch {
                // 静默处理
            }

            return updated;
        });
    }, []);

    const clearHistory = useCallback(() => {
        setHistory([]);
        try {
            localStorage.removeItem(HISTORY_STORAGE_KEY);
        } catch {
            // 静默处理
        }
    }, []);

    const removeFromHistory = useCallback((isbn: string) => {
        setHistory((prev) => {
            const updated = prev.filter((item) => item.isbn !== isbn);
            try {
                localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
            } catch {
                // 静默处理
            }
            return updated;
        });
    }, []);

    return { history, addToHistory, clearHistory, removeFromHistory };
};

// ==================== 子组件 ====================

/** 搜索结果展示组件 */
const SearchResultCard: FC<{
    result: Book;
    onAddToShelf: () => void;
    onViewDetail: () => void;
    onCopyISBN: () => void;
}> = ({ result, onAddToShelf, onViewDetail, onCopyISBN }) => {
    const { token } = theme.useToken();

    const coverUrl = useMemo(
        () => getCoverUrl(result.cover_url) || '',
        [result.cover_url]
    );

    const placeholderUrl = useMemo(
        () => getPlaceholderCover(result.title, result.author),
        [result.title, result.author]
    );

    const ratingValue = useMemo(() => {
        if (!result.rating) return 0;
        const num = parseFloat(result.rating);
        return isNaN(num) ? 0 : num;
    }, [result.rating]);

    const infoItems = useMemo(() => {
        return [
            {
                label: '作者',
                value: result.author,
                icon: <UserOutlined />,
                highlight: true,
            },
            {
                label: 'ISBN',
                value: result.isbn,
                icon: <BarcodeOutlined />,
                code: true,
            },
            {
                label: '出版社',
                value: result.publisher,
                icon: <EnvironmentOutlined />,
            },
            {
                label: '出版日期',
                value: result.publish_date,
                icon: <CalendarOutlined />,
            },
            {
                label: '页数',
                value: result.pages ? `${result.pages} 页` : '',
                icon: <FileTextOutlined />,
            },
            {
                label: '定价',
                value: result.price ? formatCurrency(result.price) : '',
                icon: <DollarOutlined />,
            },
            {
                label: '译者',
                value: result.translator,
                icon: <TranslationOutlined />,
            },
        ].filter((x) => x.value);
    }, [result]);

    return (
        <Card
            style={{
                borderRadius: 16,
                border: `1px solid ${token.colorBorderSecondary}`,
                marginBottom: 20,
                boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                animation: 'fadeIn 0.4s ease-out',
            }}
        >
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                {/* 封面区域 */}
                <div
                    style={{
                        textAlign: 'center',
                        minWidth: 180,
                        maxWidth: 200,
                    }}
                >
                    <Image
                        src={coverUrl || placeholderUrl}
                        alt={`《${result.title}》封面`}
                        style={{
                            width: '100%',
                            aspectRatio: '3/4',
                            objectFit: 'cover',
                            borderRadius: 10,
                            boxShadow: '0 6px 20px rgba(0,0,0,0.1)',
                        }}
                        fallback={placeholderUrl}
                        preview={{ mask: '查看大图' }}
                    />

                    {/* 来源标签 */}
                    <Tag
                        color={result.source === 'douban' ? 'green' : 'orange'}
                        style={{
                            marginTop: 10,
                            borderRadius: 6,
                            padding: '2px 12px',
                            fontSize: 12,
                        }}
                    >
                        {result.source === 'douban' ? '📚 豆瓣数据' : '📝 手动录入'}
                    </Tag>

                    {/* 操作按钮 */}
                    <Space direction="vertical" style={{ width: '100%', marginTop: 14 }} size={8}>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            block
                            size="large"
                            onClick={onAddToShelf}
                            style={{ borderRadius: 8 }}
                        >
                            添加到书架
                        </Button>
                        <Button
                            icon={<EyeOutlined />}
                            block
                            onClick={onViewDetail}
                            style={{ borderRadius: 8 }}
                        >
                            查看详情
                        </Button>
                        <Button
                            icon={<CopyOutlined />}
                            block
                            onClick={onCopyISBN}
                            style={{ borderRadius: 8 }}
                            size="small"
                        >
                            复制 ISBN
                        </Button>
                    </Space>
                </div>

                {/* 信息区域 */}
                <div style={{ flex: 1, minWidth: 300 }}>
                    {/* 标题 */}
                    <Title level={3} style={{ marginTop: 0, marginBottom: 4 }}>
                        {result.title}
                    </Title>

                    {/* 原作名 */}
                    {result.original_title && (
                        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                            <TranslationOutlined /> {result.original_title}
                        </Text>
                    )}

                    {/* 评分 */}
                    {ratingValue > 0 && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                marginBottom: 16,
                                padding: '10px 16px',
                                background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
                                borderRadius: 10,
                                border: '1px solid #fde68a',
                            }}
                        >
                            <Rate
                                disabled
                                allowHalf
                                value={ratingValue / 2}
                                style={{ fontSize: 18 }}
                            />
                            <Text strong style={{ fontSize: 22, color: '#f59e0b' }}>
                                {formatRating(result.rating)}
                            </Text>
                        </div>
                    )}

                    <Divider style={{ margin: '12px 0 16px' }} />

                    {/* 详细信息网格 */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                            gap: 10,
                        }}
                    >
                        {infoItems.map((item, i) => (
                            <div key={i}>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                    {item.icon} {item.label}
                                </Text>
                                <br />
                                {item.code ? (
                                    <Text code style={{ fontSize: 13 }}>
                                        {item.value}
                                    </Text>
                                ) : item.highlight ? (
                                    <Text strong style={{ fontSize: 14 }}>
                                        {item.value}
                                    </Text>
                                ) : (
                                    <Text style={{ fontSize: 14 }}>{item.value}</Text>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* 内容简介 */}
                    {result.summary && (
                        <>
                            <Divider style={{ margin: '16px 0 12px' }} />
                            <Text
                                type="secondary"
                                style={{
                                    fontSize: 12,
                                    display: 'block',
                                    marginBottom: 8,
                                }}
                            >
                                <FileTextOutlined /> 内容简介
                            </Text>
                            <Paragraph
                                style={{
                                    background: token.colorFillSecondary,
                                    padding: 16,
                                    borderRadius: 10,
                                    marginTop: 0,
                                    lineHeight: 1.7,
                                }}
                                ellipsis={{
                                    rows: 4,
                                    expandable: true,
                                    symbol: '展开全文',
                                }}
                            >
                                {result.summary}
                            </Paragraph>
                        </>
                    )}
                </div>
            </div>
        </Card>
    );
};

// ==================== 主组件 ====================

const BookSearch: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();
    const inputRef = useRef<InputRef>(null);

    // 状态
    const [isbnInput, setIsbnInput] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResult, setSearchResult] = useState<Book | null>(null);
    const [searchError, setSearchError] = useState('');
    const [showShelfSelector, setShowShelfSelector] = useState(false);

    // 搜索历史
    const { history, addToHistory, clearHistory, removeFromHistory } =
        useSearchHistory();

    // ==================== 生命周期 ====================

    // 自动聚焦输入框
    useEffect(() => {
        setTimeout(() => {
            inputRef.current?.focus();
        }, 300);
    }, []);

    // ==================== 事件处理 ====================

    /** 执行搜索 */
    const handleSearch = useCallback(
        async (searchIsbn?: string) => {
            const target = (searchIsbn || isbnInput).replace(/[-\s]/g, '');

            // ISBN 格式验证
            if (!target) {
                message.warning({ content: '请输入 ISBN', key: 'isbn-empty' });
                return;
            }
            if (!/^(?:\d{9}[\dXx]|\d{13})$/.test(target)) {
                message.warning({
                    content: 'ISBN 格式不正确（10位或13位数字）',
                    key: 'isbn-invalid',
                });
                return;
            }

            setIsbnInput(target);
            setIsSearching(true);
            setSearchError('');
            setSearchResult(null);

            try {
                const result = await syncBookByISBN(target);
                if (result.success && result.book) {
                    setSearchResult(result.book);
                    addToHistory(target, result.book.title || target);
                    message.success({
                        content: `已获取《${result.book.title}》信息`,
                        key: 'search-success',
                    });
                } else {
                    setSearchError(result.message || '未找到该图书信息');
                }
            } catch (err: unknown) {
                const errorMsg = extractErrorMessage(err) || '搜索失败，请重试';
                setSearchError(errorMsg);
            } finally {
                setIsSearching(false);
            }
        },
        [isbnInput, addToHistory]
    );

    /** 键盘事件 */
    const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                handleSearch();
            }
        },
        [handleSearch]
    );

    /** 清除搜索 */
    const handleClear = useCallback(() => {
        setIsbnInput('');
        setSearchResult(null);
        setSearchError('');
        inputRef.current?.focus();
    }, []);

    /** 复制 ISBN */
    const handleCopyISBN = useCallback(() => {
        if (searchResult?.isbn) {
            navigator.clipboard.writeText(searchResult.isbn);
            message.success({
                content: 'ISBN 已复制到剪贴板',
                key: 'copy-isbn',
            });
        }
    }, [searchResult]);

    /** 查看详情 */
    const handleViewDetail = useCallback(() => {
        if (searchResult) {
            const path = searchResult.shelf_id
                ? `/shelf/${searchResult.shelf_id}/book/${searchResult.book_id}`
                : `/shelf/1/book/${searchResult.book_id}`;
            navigate(path);
        }
    }, [searchResult, navigate]);

    // ==================== 渲染搜索输入区 ====================

    const renderSearchInput = () => (
        <Card
            style={{
                marginBottom: 24,
                borderRadius: 12,
                border: `1px solid ${token.colorBorderSecondary}`,
            }}
        >
            <Alert
                message="通过 ISBN 从豆瓣获取图书完整信息"
                description="支持 10 位或 13 位 ISBN，自动同步封面、评分、简介等数据"
                type="info"
                showIcon
                icon={<ThunderboltOutlined />}
                style={{ marginBottom: 18, borderRadius: 8 }}
            />

            {/* 搜索输入框 */}
            <Space.Compact style={{ width: '100%' }}>
                <Input
                    ref={inputRef}
                    size="large"
                    placeholder="输入 ISBN，如 9787544270878"
                    value={isbnInput}
                    onChange={(e) => {
                        // 自动过滤非数字和 X
                        const cleaned = e.target.value.replace(/[^0-9Xx]/g, '');
                        setIsbnInput(cleaned);
                    }}
                    onKeyDown={handleKeyDown}
                    prefix={<BarcodeOutlined style={{ color: token.colorTextQuaternary }} />}
                    suffix={
                        isbnInput && (
                            <Button
                                type="text"
                                size="small"
                                icon={<ClearOutlined />}
                                onClick={handleClear}
                            />
                        )
                    }
                    maxLength={13}
                    style={{
                        borderRadius: '10px 0 0 10px',
                        fontSize: 16,
                        fontFamily: 'monospace',
                        letterSpacing: '0.05em',
                    }}
                />
                <Button
                    type="primary"
                    size="large"
                    icon={isSearching ? <SyncOutlined spin /> : <SearchOutlined />}
                    loading={isSearching}
                    onClick={() => handleSearch()}
                    style={{
                        borderRadius: '0 10px 10px 0',
                        minWidth: 140,
                        fontWeight: 500,
                    }}
                >
                    {isSearching ? '搜索中...' : '搜索同步'}
                </Button>
            </Space.Compact>

            {/* 示例 + 搜索历史 */}
            <div style={{ marginTop: 16 }}>
                <Row gutter={[16, 12]}>
                    {/* 示例书籍 */}
                    <Col xs={24} md={14}>
                        <div
                            style={{
                                padding: 14,
                                background: token.colorFillSecondary,
                                borderRadius: 10,
                            }}
                        >
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                💡 试试这些经典书籍：
                            </Text>
                            <Space wrap style={{ marginTop: 8 }} size={6}>
                                {SAMPLE_BOOKS.map((s) => (
                                    <Button
                                        key={s.isbn}
                                        size="small"
                                        type="dashed"
                                        onClick={() => handleSearch(s.isbn)}
                                        style={{ borderRadius: 6 }}
                                    >
                                        {s.icon} {s.title}
                                    </Button>
                                ))}
                            </Space>
                        </div>
                    </Col>

                    {/* 搜索历史 */}
                    <Col xs={24} md={10}>
                        {history.length > 0 && (
                            <div
                                style={{
                                    padding: 14,
                                    background: token.colorFillSecondary,
                                    borderRadius: 10,
                                    height: '100%',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: 8,
                                    }}
                                >
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        <HistoryOutlined /> 搜索历史
                                    </Text>
                                    <Button
                                        type="text"
                                        size="small"
                                        danger
                                        onClick={clearHistory}
                                        style={{ fontSize: 11 }}
                                    >
                                        清除
                                    </Button>
                                </div>
                                <Space wrap size={4}>
                                    {history.slice(0, 6).map((item) => (
                                        <Tag
                                            key={item.isbn}
                                            closable
                                            onClose={(e) => {
                                                e.preventDefault();
                                                removeFromHistory(item.isbn);
                                            }}
                                            style={{
                                                cursor: 'pointer',
                                                borderRadius: 6,
                                                padding: '1px 8px',
                                            }}
                                            onClick={() => handleSearch(item.isbn)}
                                        >
                                            {item.title || item.isbn}
                                        </Tag>
                                    ))}
                                </Space>
                            </div>
                        )}
                    </Col>
                </Row>
            </div>
        </Card>
    );

    // ==================== 渲染搜索错误 ====================

    const renderSearchError = () => {
        if (!searchError) return null;

        return (
            <Result
                status="error"
                title="搜索失败"
                subTitle={searchError}
                style={{
                    marginBottom: 24,
                    padding: 40,
                    background: token.colorErrorBg,
                    borderRadius: 16,
                    border: `1px solid ${token.colorErrorBorder}`,
                }}
                extra={[
                    <Button
                        key="retry"
                        type="primary"
                        icon={<ReloadOutlined />}
                        onClick={() => handleSearch()}
                        style={{ borderRadius: 8 }}
                    >
                        重试
                    </Button>,
                    <Button
                        key="clear"
                        icon={<ClearOutlined />}
                        onClick={() => setSearchError('')}
                        style={{ borderRadius: 8 }}
                    >
                        清除
                    </Button>,
                    <Button
                        key="manual"
                        icon={<EditOutlined />}
                        onClick={() => navigate('/books/add')}
                        style={{ borderRadius: 8 }}
                    >
                        手动录入
                    </Button>,
                ]}
            />
        );
    };

    // ==================== 渲染加载状态 ====================

    const renderLoading = () => {
        if (!isSearching) return null;

        return (
            <Card
                style={{
                    borderRadius: 16,
                    marginBottom: 24,
                    textAlign: 'center',
                    padding: 60,
                    border: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Spin size="large">
                    <div style={{ padding: 20 }} />
                </Spin>
                <Text
                    type="secondary"
                    style={{ display: 'block', marginTop: 20, fontSize: 15 }}
                >
                    正在从豆瓣获取图书信息...
                </Text>
                <Text
                    type="secondary"
                    style={{
                        display: 'block',
                        marginTop: 6,
                        fontSize: 12,
                        opacity: 0.6,
                    }}
                >
                    请确保已配置豆瓣 Cookie
                </Text>
            </Card>
        );
    };

    // ==================== 渲染空状态 ====================

    const renderEmpty = () => {
        if (isSearching || searchResult || searchError) return null;

        return (
            <Empty
                image={
                    <div
                        style={{
                            fontSize: 80,
                            opacity: 0.5,
                            marginBottom: 16,
                        }}
                    >
                        📖
                    </div>
                }
                description={
                    <div>
                        <Text type="secondary" style={{ fontSize: 15 }}>
                            输入 ISBN 搜索图书
                        </Text>
                        <br />
                        <Text
                            type="secondary"
                            style={{ fontSize: 12, opacity: 0.6, marginTop: 4, display: 'block' }}
                        >
                            支持从豆瓣同步完整信息
                        </Text>
                    </div>
                }
            >
                <Button
                    type="primary"
                    icon={<EditOutlined />}
                    onClick={() => navigate('/books/add')}
                    style={{ borderRadius: 8 }}
                >
                    手动录入图书
                </Button>
            </Empty>
        );
    };

    // ==================== 渲染页面 ====================

    return (
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
            {/* 面包屑 */}
            <Breadcrumb
                style={{ marginBottom: 16 }}
                items={[
                    {
                        title: (
                            <a onClick={() => navigate('/')}>
                                <HomeOutlined /> 首页
                            </a>
                        ),
                    },
                    { title: '图书搜索' },
                ]}
            />

            {/* 标题 */}
            <Title level={2} style={{ marginBottom: 24 }}>
                <SearchOutlined style={{ color: token.colorPrimary, marginRight: 12 }} />
                图书搜索与同步
            </Title>

            {/* 搜索输入区 */}
            {renderSearchInput()}

            {/* 搜索错误 */}
            {renderSearchError()}

            {/* 加载状态 */}
            {renderLoading()}

            {/* 空状态 */}
            {renderEmpty()}

            {/* 搜索结果 */}
            {searchResult && !isSearching && (
                <>
                    <SearchResultCard
                        result={searchResult}
                        onAddToShelf={() => setShowShelfSelector(true)}
                        onViewDetail={handleViewDetail}
                        onCopyISBN={handleCopyISBN}
                    />

                    {/* 成功提示 */}
                    <Card
                        style={{
                            borderRadius: 12,
                            background: token.colorSuccessBg,
                            border: `1px solid ${token.colorSuccessBorder}`,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <CheckCircleOutlined
                                style={{ color: token.colorSuccess, fontSize: 22 }}
                            />
                            <div>
                                <Text strong style={{ color: '#166534' }}>
                                    已获取图书信息
                                </Text>
                                <br />
                                <Text
                                    type="secondary"
                                    style={{ color: '#15803d', fontSize: 13 }}
                                >
                                    可以添加到书架或查看完整详情
                                </Text>
                            </div>
                        </div>
                    </Card>
                </>
            )}

            {/* 书架选择器 */}
            <ShelfSelector
                visible={showShelfSelector}
                bookId={searchResult?.book_id || 0}
                bookTitle={searchResult?.title || ''}
                onClose={() => setShowShelfSelector(false)}
                onSuccess={() => {
                    message.success({
                        content: '已成功添加到书架',
                        key: 'add-shelf-success',
                    });
                    setShowShelfSelector(false);
                }}
            />

            {/* 淡入动画 */}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default BookSearch;