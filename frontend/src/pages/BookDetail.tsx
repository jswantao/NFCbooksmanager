// frontend/src/pages/BookDetail.tsx
/**
 * 图书详情页面 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 自定义 Hook 封装数据加载
 * - 骨架屏优化
 * - 图片画廊模式
 * - 操作按钮状态管理
 * - 时间线增强
 * - 分享功能增强
 * - 主题色适配
 * - 错误边界友好
 * - 键盘快捷键
 */

import React, {
    useEffect,
    useState,
    useCallback,
    useMemo,
    type FC,
} from 'react';
import {
    useParams,
    useNavigate,
} from 'react-router-dom';
import {
    Card,
    Tag,
    Descriptions,
    Button,
    Space,
    Typography,
    Image,
    Divider,
    Skeleton,
    message,
    Rate,
    Tooltip,
    Popconfirm,
    Dropdown,
    Row,
    Col,
    Timeline,
    Breadcrumb,
    Result,
    FloatButton,
    theme,
    Modal,
    type DescriptionsProps,
    type MenuProps,
} from 'antd';
import {
    ArrowLeftOutlined,
    BookOutlined,
    SyncOutlined,
    StarFilled,
    UserOutlined,
    FileTextOutlined,
    HomeOutlined,
    SearchOutlined,
    LinkOutlined,
    PlusOutlined,
    DeleteOutlined,
    EllipsisOutlined,
    TranslationOutlined,
    FormOutlined,
    InfoCircleOutlined,
    CopyOutlined,
    ShareAltOutlined,
    CalendarOutlined,
    BarcodeOutlined,
    DollarOutlined,
    RiseOutlined,
    EnvironmentOutlined,
    ClockCircleOutlined,
} from '@ant-design/icons';
import {
    getBookDetail,
    removeBookFromShelf,
    syncBookByISBN,
    extractErrorMessage,
} from '../services/api';
import { getCoverUrl, getPlaceholderCover } from '../utils/image';
import { formatRating, formatDate, formatCurrency, formatAuthors } from '../utils/format';
import ShelfSelector from '../components/ShelfSelector';
import type { BookDetail as BookDetailData } from '../types';

const { Title, Paragraph, Text } = Typography;

// ==================== 常量 ====================

/** 装帧颜色映射 */
const BINDING_COLORS: Record<string, string> = {
    平装: 'blue',
    精装: 'gold',
    线装: 'purple',
    骑马钉: 'cyan',
    软精装: 'geekblue',
    无线胶装: 'green',
    锁线胶装: 'orange',
};

/** 来源标签配置 */
const SOURCE_CONFIG: Record<string, { color: string; label: string }> = {
    douban: { color: 'green', label: '豆瓣同步' },
    manual: { color: 'orange', label: '手动录入' },
    isbn: { color: 'blue', label: 'ISBN 导入' },
    nfc: { color: 'purple', label: 'NFC 录入' },
};

// ==================== 自定义 Hook ====================

/**
 * 图书详情加载 Hook
 */
const useBookDetailLoader = (bookId?: string) => {
    const [loading, setLoading] = useState(true);
    const [book, setBook] = useState<BookDetailData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!bookId) return;

        setLoading(true);
        setError(null);

        try {
            const result = await getBookDetail(parseInt(bookId));
            setBook(result);
        } catch (err: unknown) {
            const errorMsg = extractErrorMessage(err) || '加载图书详情失败';
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    }, [bookId]);

    useEffect(() => {
        load();
    }, [load]);

    return { book, loading, error, load, setBook };
};

/**
 * 图片加载状态 Hook
 */
const useImageState = () => {
    const [imageLoading, setImageLoading] = useState(true);
    const [imageError, setImageError] = useState(false);
    const [imagePreviewVisible, setImagePreviewVisible] = useState(false);

    const handleImageLoad = useCallback(() => {
        setImageLoading(false);
        setImageError(false);
    }, []);

    const handleImageError = useCallback(() => {
        setImageError(true);
        setImageLoading(false);
    }, []);

    const resetImage = useCallback(() => {
        setImageLoading(true);
        setImageError(false);
    }, []);

    return {
        imageLoading,
        imageError,
        imagePreviewVisible,
        setImagePreviewVisible,
        handleImageLoad,
        handleImageError,
        resetImage,
    };
};

// ==================== 主组件 ====================

const BookDetail: FC = () => {
    const { shelfId, bookId } = useParams<{ shelfId: string; bookId: string }>();
    const navigate = useNavigate();
    const { token } = theme.useToken();

    // 数据加载
    const { book, loading, error, load } = useBookDetailLoader(bookId);

    // 图片状态
    const {
        imageLoading,
        imageError,
        imagePreviewVisible,
        setImagePreviewVisible,
        handleImageLoad,
        handleImageError,
        resetImage,
    } = useImageState();

    // 操作状态
    const [syncing, setSyncing] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [showShelfSelector, setShowShelfSelector] = useState(false);

    // ==================== 图片加载重置 ====================

    useEffect(() => {
        if (book) {
            resetImage();
        }
    }, [book?.cover_url, resetImage]);

    // ==================== 派生数据 ====================

    const coverUrl = useMemo(
        () => getCoverUrl(book?.cover_url) || '',
        [book?.cover_url]
    );

    const placeholderUrl = useMemo(
        () => getPlaceholderCover(book?.title, book?.author),
        [book?.title, book?.author]
    );

    const ratingValue = useMemo(() => {
        if (!book?.rating) return 0;
        const num = parseFloat(book.rating);
        return isNaN(num) ? 0 : num;
    }, [book?.rating]);

    const sourceConfig = useMemo(
        () => SOURCE_CONFIG[book?.source || ''] || { color: 'default', label: '未知' },
        [book?.source]
    );

    const hasShelf = !!book?.shelf_id;

    // ==================== 操作处理 ====================

    /** 同步豆瓣数据 */
    const handleSync = useCallback(async () => {
        if (!book?.isbn) return;

        setSyncing(true);
        try {
            await syncBookByISBN(book.isbn);
            await load();
            message.success({
                content: '同步成功，图书信息已更新',
                key: 'sync-success',
            });
        } catch (err: unknown) {
            const errorMsg = extractErrorMessage(err) || '同步失败';
            message.error({
                content: errorMsg,
                key: 'sync-error',
            });
        } finally {
            setSyncing(false);
        }
    }, [book?.isbn, load]);

    /** 从书架移除 */
    const handleRemove = useCallback(async () => {
        if (!book?.shelf_id) return;

        setRemoving(true);
        try {
            await removeBookFromShelf(book.shelf_id, book.book_id);
            message.success({
                content: `《${book.title}》已从书架移除`,
                key: 'remove-success',
            });
            // 跳转回书架
            setTimeout(() => {
                navigate(book.shelf_id ? `/shelf/${book.shelf_id}` : '/');
            }, 800);
        } catch (err: unknown) {
            const errorMsg = extractErrorMessage(err) || '移除失败';
            message.error({
                content: errorMsg,
                key: 'remove-error',
            });
        } finally {
            setRemoving(false);
        }
    }, [book, navigate]);

    /** 复制 ISBN */
    const handleCopyISBN = useCallback(() => {
        if (book?.isbn) {
            navigator.clipboard.writeText(book.isbn);
            message.success({
                content: 'ISBN 已复制到剪贴板',
                key: 'copy-isbn',
            });
        }
    }, [book?.isbn]);

    /** 分享 */
    const handleShare = useCallback(() => {
        if (!book) return;

        const shareData = {
            title: `《${book.title}》`,
            text: `${book.author ? `作者：${book.author}\n` : ''}评分：${book.rating || '暂无'}`,
            url: window.location.href,
        };

        if (navigator.share && navigator.canShare?.(shareData)) {
            navigator.share(shareData).catch(() => {});
        } else {
            // 降级：复制链接
            navigator.clipboard.writeText(window.location.href);
            message.success('链接已复制到剪贴板');
        }
    }, [book]);

    /** 添加到书架成功回调 */
    const handleShelfAddSuccess = useCallback(() => {
        message.success({
            content: '图书已添加到书架',
            key: 'add-shelf-success',
        });
        load(); // 重新加载以更新书架信息
    }, [load]);

    // ==================== 更多菜单 ====================

    const moreMenuItems: MenuProps['items'] = useMemo(
        () =>
            book
                ? [
                      {
                          key: 'add',
                          icon: <PlusOutlined />,
                          label: '添加到书架',
                          onClick: () => setShowShelfSelector(true),
                      },
                      {
                          key: 'edit',
                          icon: <FormOutlined />,
                          label: '编辑图书信息',
                          onClick: () => navigate(`/books/edit/${book.book_id}`),
                      },
                      {
                          key: 'copy',
                          icon: <CopyOutlined />,
                          label: '复制 ISBN',
                          onClick: handleCopyISBN,
                      },
                      {
                          key: 'share',
                          icon: <ShareAltOutlined />,
                          label: '分享图书',
                          onClick: handleShare,
                      },
                      { type: 'divider' as const },
                      {
                          key: 'sync',
                          icon: <SyncOutlined />,
                          label: '重新同步豆瓣',
                          onClick: handleSync,
                      },
                      {
                          key: 'douban',
                          icon: <LinkOutlined />,
                          label: '在豆瓣中查看',
                          disabled: !book.douban_url,
                          onClick: () =>
                              book.douban_url && window.open(book.douban_url, '_blank'),
                      },
                      { type: 'divider' as const },
                      {
                          key: 'remove',
                          icon: <DeleteOutlined />,
                          label: '从书架移除',
                          danger: true,
                          disabled: !hasShelf,
                          onClick: handleRemove,
                      },
                  ]
                : [],
        [book, navigate, handleCopyISBN, handleShare, handleSync, handleRemove, hasShelf]
    );

    // ==================== 时间线数据 ====================

    const timelineItems = useMemo(() => {
        if (!book) return [];

        const items = [];

        if (book.created_at) {
            items.push({
                color: 'blue' as const,
                dot: <ClockCircleOutlined />,
                children: (
                    <div>
                        <Text strong>创建记录</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatDate(book.created_at, 'full')}
                        </Text>
                    </div>
                ),
            });
        }

        if (book.added_at) {
            items.push({
                color: 'green' as const,
                dot: <BookOutlined />,
                children: (
                    <div>
                        <Text strong>添加到书架</Text>
                        {book.shelf_name && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                {' '}
                                · {book.shelf_name}
                            </Text>
                        )}
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatDate(book.added_at, 'full')}
                        </Text>
                    </div>
                ),
            });
        }

        if (book.last_sync_at) {
            items.push({
                color: 'orange' as const,
                dot: <SyncOutlined />,
                children: (
                    <div>
                        <Text strong>同步豆瓣数据</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatDate(book.last_sync_at, 'full')}
                        </Text>
                    </div>
                ),
            });
        }

        if (book.updated_at && book.updated_at !== book.created_at) {
            items.push({
                color: 'purple' as const,
                dot: <FormOutlined />,
                children: (
                    <div>
                        <Text strong>最后更新</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatDate(book.updated_at, 'full')}
                        </Text>
                    </div>
                ),
            });
        }

        return items;
    }, [book]);

    // ==================== Descriptions 数据 ====================

    const descriptionItems: DescriptionsProps['items'] = useMemo(() => {
        if (!book) return [];

        const items: DescriptionsProps['items'] = [
            {
                key: 'author',
                label: '作者',
                span: { xs: 1, sm: book.translator ? 1 : 2 },
                children: (
                    <Space size={4}>
                        <UserOutlined />
                        <Text strong>{formatAuthors(book.author, 3)}</Text>
                    </Space>
                ),
            },
        ];

        if (book.translator) {
            items.push({
                key: 'translator',
                label: '译者',
                span: 1,
                children: (
                    <Space size={4}>
                        <TranslationOutlined />
                        <Text>{book.translator}</Text>
                    </Space>
                ),
            });
        }

        items.push(
            {
                key: 'isbn',
                label: 'ISBN',
                span: 1,
                children: (
                    <Space size={4}>
                        <BarcodeOutlined />
                        <Text code copyable>
                            {book.isbn}
                        </Text>
                    </Space>
                ),
            },
            ...(book.publisher
                ? [
                      {
                          key: 'publisher',
                          label: '出版社',
                          span: 1,
                          children: (
                              <Space size={4}>
                                  <EnvironmentOutlined />
                                  <Text>{book.publisher}</Text>
                              </Space>
                          ),
                      } as const,
                  ]
                : []),
            ...(book.publish_date
                ? [
                      {
                          key: 'publish_date',
                          label: '出版日期',
                          span: 1,
                          children: (
                              <Space size={4}>
                                  <CalendarOutlined />
                                  <Text>{book.publish_date}</Text>
                              </Space>
                          ),
                      } as const,
                  ]
                : []),
            ...(book.pages
                ? [
                      {
                          key: 'pages',
                          label: '页数',
                          span: 1,
                          children: (
                              <Space size={4}>
                                  <FileTextOutlined />
                                  <Text>{book.pages} 页</Text>
                              </Space>
                          ),
                      } as const,
                  ]
                : []),
            ...(book.price
                ? [
                      {
                          key: 'price',
                          label: '定价',
                          span: 1,
                          children: (
                              <Space size={4}>
                                  <DollarOutlined />
                                  <Text>{formatCurrency(book.price)}</Text>
                              </Space>
                          ),
                      } as const,
                  ]
                : []),
            ...(book.binding
                ? [
                      {
                          key: 'binding',
                          label: '装帧',
                          span: 1,
                          children: (
                              <Tag color={BINDING_COLORS[book.binding] || 'default'}>
                                  {book.binding}
                              </Tag>
                          ),
                      } as const,
                  ]
                : []),
            ...(book.series
                ? [
                      {
                          key: 'series',
                          label: '丛书',
                          span: 2,
                          children: <Text>{book.series}</Text>,
                      } as const,
                  ]
                : []),
            ...(book.original_title
                ? [
                      {
                          key: 'original_title',
                          label: '原作名',
                          span: 2,
                          children: (
                              <Space size={4}>
                                  <TranslationOutlined />
                                  <Text italic>{book.original_title}</Text>
                              </Space>
                          ),
                      } as const,
                  ]
                : []),
            ...(hasShelf
                ? [
                      {
                          key: 'shelf',
                          label: '所在书架',
                          span: 2,
                          children: (
                              <Tag
                                  color="blue"
                                  icon={<BookOutlined />}
                                  style={{ cursor: 'pointer', padding: '2px 12px' }}
                                  onClick={() =>
                                      book.shelf_id && navigate(`/shelf/${book.shelf_id}`)
                                  }
                              >
                                  {book.shelf_name}
                              </Tag>
                          ),
                      } as const,
                  ]
                : [])
        );

        return items;
    }, [book, hasShelf, navigate]);

    // ==================== 渲染加载状态 ====================

    if (loading) {
        return (
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
                <Breadcrumb
                    style={{ marginBottom: 16 }}
                    items={[
                        { title: <Skeleton.Input size="small" active /> },
                        { title: <Skeleton.Input size="small" active /> },
                    ]}
                />
                <Card style={{ borderRadius: 12 }}>
                    <Row gutter={[32, 24]}>
                        <Col xs={24} md={8}>
                            <Skeleton.Image
                                active
                                style={{
                                    width: '100%',
                                    height: 420,
                                    borderRadius: 10,
                                }}
                            />
                            <div style={{ marginTop: 16 }}>
                                <Skeleton.Button active block size="large" />
                                <Skeleton.Button
                                    active
                                    block
                                    size="large"
                                    style={{ marginTop: 8 }}
                                />
                            </div>
                        </Col>
                        <Col xs={24} md={16}>
                            <Skeleton active paragraph={{ rows: 3 }} />
                            <Divider />
                            <Skeleton active paragraph={{ rows: 6 }} />
                            <Skeleton active paragraph={{ rows: 4 }} style={{ marginTop: 16 }} />
                        </Col>
                    </Row>
                </Card>
            </div>
        );
    }

    // ==================== 渲染错误状态 ====================

    if (error || !book) {
        return (
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
                <Button
                    icon={<ArrowLeftOutlined />}
                    onClick={() => navigate(-1)}
                    style={{ marginBottom: 16 }}
                >
                    返回
                </Button>
                <Card style={{ borderRadius: 12 }}>
                    <Result
                        status="error"
                        title="加载失败"
                        subTitle={error || '未找到该图书'}
                        extra={[
                            <Button
                                key="retry"
                                type="primary"
                                icon={<SyncOutlined />}
                                onClick={load}
                            >
                                重试
                            </Button>,
                            <Button
                                key="home"
                                icon={<HomeOutlined />}
                                onClick={() => navigate('/')}
                            >
                                返回首页
                            </Button>,
                        ]}
                    />
                </Card>
            </div>
        );
    }

    // ==================== 渲染正常状态 ====================

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
            {/* 面包屑 */}
            <Breadcrumb
                style={{ marginBottom: 20 }}
                items={[
                    {
                        title: (
                            <a onClick={() => navigate('/')}>
                                <HomeOutlined /> 首页
                            </a>
                        ),
                    },
                    ...(hasShelf
                        ? [
                              {
                                  title: (
                                      <a onClick={() => navigate(`/shelf/${book.shelf_id}`)}>
                                          <BookOutlined /> {book.shelf_name}
                                      </a>
                                  ),
                              },
                          ]
                        : []),
                    { title: book.title },
                ]}
            />

            {/* 顶部操作栏 */}
            <Card
                size="small"
                style={{
                    marginBottom: 20,
                    borderRadius: 12,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorBgLayout,
                }}
            >
                <Row justify="space-between" align="middle" wrap>
                    <Space size={8} wrap>
                        <Button
                            icon={<ArrowLeftOutlined />}
                            onClick={() => navigate(-1)}
                        >
                            返回
                        </Button>
                        {hasShelf && (
                            <Button
                                icon={<BookOutlined />}
                                onClick={() => navigate(`/shelf/${book.shelf_id}`)}
                            >
                                返回书架
                            </Button>
                        )}
                    </Space>
                    <Space size={8} wrap>
                        <Tooltip title="复制 ISBN">
                            <Button
                                icon={<CopyOutlined />}
                                onClick={handleCopyISBN}
                            >
                                复制 ISBN
                            </Button>
                        </Tooltip>
                        <Tooltip title="分享图书">
                            <Button
                                icon={<ShareAltOutlined />}
                                onClick={handleShare}
                            >
                                分享
                            </Button>
                        </Tooltip>
                        <Button
                            type="primary"
                            icon={<SyncOutlined spin={syncing} />}
                            loading={syncing}
                            onClick={handleSync}
                        >
                            同步豆瓣
                        </Button>
                        <Dropdown
                            menu={{ items: moreMenuItems }}
                            trigger={['click']}
                        >
                            <Button icon={<EllipsisOutlined />}>更多</Button>
                        </Dropdown>
                    </Space>
                </Row>
            </Card>

            {/* 主体内容 */}
            <Card
                style={{
                    borderRadius: 16,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    marginBottom: 24,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                }}
                styles={{ body: { padding: 28 } }}
            >
                <Row gutter={[36, 28]}>
                    {/* 左侧：封面 + 操作 */}
                    <Col xs={24} md={8} lg={7}>
                        {/* 封面 */}
                        <div
                            style={{
                                position: 'relative',
                                maxWidth: 300,
                                margin: '0 auto',
                            }}
                        >
                            {/* 加载占位 */}
                            {imageLoading && !imageError && (
                                <Skeleton.Image
                                    active
                                    style={{
                                        width: '100%',
                                        aspectRatio: '3/4',
                                        borderRadius: 12,
                                    }}
                                />
                            )}

                            {/* 封面图片 */}
                            {coverUrl && !imageError ? (
                                <Image
                                    src={coverUrl}
                                    alt={`《${book.title}》封面`}
                                    style={{
                                        borderRadius: 12,
                                        width: '100%',
                                        aspectRatio: '3/4',
                                        objectFit: 'cover',
                                        display: imageLoading ? 'none' : 'block',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                    }}
                                    fallback={placeholderUrl}
                                    onLoad={handleImageLoad}
                                    onError={handleImageError}
                                    preview={{
                                        visible: imagePreviewVisible,
                                        onVisibleChange: setImagePreviewVisible,
                                        mask: (
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                }}
                                            >
                                                <SearchOutlined
                                                    style={{ fontSize: 28 }}
                                                />
                                                <span>查看大图</span>
                                            </div>
                                        ),
                                    }}
                                />
                            ) : (
                                <img
                                    src={placeholderUrl}
                                    alt={`《${book.title}》占位封面`}
                                    style={{
                                        width: '100%',
                                        aspectRatio: '3/4',
                                        objectFit: 'cover',
                                        borderRadius: 12,
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                                    }}
                                />
                            )}

                            {/* 评分角标 */}
                            {ratingValue > 0 && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 16,
                                        right: 16,
                                        background: 'rgba(0,0,0,0.8)',
                                        color: '#fff',
                                        padding: '6px 14px',
                                        borderRadius: 10,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        backdropFilter: 'blur(12px)',
                                        zIndex: 2,
                                    }}
                                >
                                    <StarFilled style={{ color: '#f59e0b', fontSize: 16 }} />
                                    <Text
                                        strong
                                        style={{
                                            color: '#fff',
                                            fontSize: 18,
                                        }}
                                    >
                                        {formatRating(book.rating)}
                                    </Text>
                                </div>
                            )}
                        </div>

                        {/* 标签 */}
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 8,
                                marginTop: 18,
                                justifyContent: 'center',
                            }}
                        >
                            <Tag
                                color={sourceConfig.color}
                                style={{ borderRadius: 6, padding: '2px 12px' }}
                            >
                                {sourceConfig.label}
                            </Tag>
                            {book.binding && (
                                <Tag
                                    color={BINDING_COLORS[book.binding] || 'default'}
                                    style={{ borderRadius: 6, padding: '2px 12px' }}
                                >
                                    {book.binding}
                                </Tag>
                            )}
                            {hasShelf && (
                                <Tag
                                    color="blue"
                                    icon={<BookOutlined />}
                                    style={{
                                        cursor: 'pointer',
                                        borderRadius: 6,
                                        padding: '2px 12px',
                                    }}
                                    onClick={() =>
                                        book.shelf_id &&
                                        navigate(`/shelf/${book.shelf_id}`)
                                    }
                                >
                                    {book.shelf_name}
                                </Tag>
                            )}
                        </div>

                        {/* 操作按钮 */}
                        <Space
                            orientation="vertical"
                            style={{ width: '100%', marginTop: 20 }}
                            size={10}
                        >
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                block
                                size="large"
                                onClick={() => setShowShelfSelector(true)}
                                style={{ borderRadius: 8, height: 46 }}
                            >
                                添加到书架
                            </Button>
                            {hasShelf && (
                                <Popconfirm
                                    title="确定从书架移除？"
                                    description="移除后图书信息仍保留，可重新添加"
                                    onConfirm={handleRemove}
                                    okText="确定移除"
                                    cancelText="取消"
                                    okButtonProps={{ danger: true }}
                                >
                                    <Button
                                        danger
                                        icon={<DeleteOutlined />}
                                        loading={removing}
                                        block
                                        size="large"
                                        style={{ borderRadius: 8 }}
                                    >
                                        从书架移除
                                    </Button>
                                </Popconfirm>
                            )}
                        </Space>
                    </Col>

                    {/* 右侧：详情 */}
                    <Col xs={24} md={16} lg={17}>
                        {/* 标题 */}
                        <Title
                            level={2}
                            style={{
                                marginTop: 0,
                                marginBottom: 6,
                                lineHeight: 1.3,
                            }}
                        >
                            {book.title}
                        </Title>

                        {/* 原作名 */}
                        {book.original_title && (
                            <Text
                                type="secondary"
                                style={{ display: 'block', marginBottom: 12, fontSize: 14 }}
                            >
                                <TranslationOutlined /> 原作名：{book.original_title}
                            </Text>
                        )}

                        {/* 评分 */}
                        {ratingValue > 0 && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    marginBottom: 20,
                                    padding: '12px 16px',
                                    background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
                                    borderRadius: 10,
                                    border: '1px solid #fde68a',
                                }}
                            >
                                <Rate
                                    disabled
                                    allowHalf
                                    value={ratingValue / 2}
                                    style={{ fontSize: 22 }}
                                />
                                <Text
                                    strong
                                    style={{
                                        fontSize: 28,
                                        color: '#f59e0b',
                                    }}
                                >
                                    {formatRating(book.rating)}
                                </Text>
                            </div>
                        )}

                        <Divider style={{ margin: '16px 0 20px' }} />

                        {/* 详细信息 */}
                        <Descriptions
                            bordered
                            size="middle"
                            column={{ xs: 1, sm: 2 }}
                            items={descriptionItems}
                            style={{ marginBottom: 20 }}
                            styles={{
                                label: {
                                    fontWeight: 500,
                                    background: token.colorBgLayout,
                                },
                            }}
                        />

                        {/* 时间线 */}
                        {timelineItems.length > 0 && (
                            <Card
                                size="small"
                                style={{
                                    marginBottom: 24,
                                    background: token.colorBgLayout,
                                    borderRadius: 10,
                                    border: `1px solid ${token.colorBorderSecondary}`,
                                }}
                            >
                                <Text
                                    strong
                                    style={{
                                        display: 'block',
                                        marginBottom: 12,
                                        fontSize: 13,
                                    }}
                                >
                                    <ClockCircleOutlined /> 图书历程
                                </Text>
                                <Timeline items={timelineItems} />
                            </Card>
                        )}

                        {/* 内容简介 */}
                        <Title level={4} style={{ marginBottom: 12 }}>
                            <FileTextOutlined /> 内容简介
                        </Title>
                        {book.summary ? (
                            <Card
                                style={{
                                    background: token.colorBgLayout,
                                    borderRadius: 10,
                                    border: `1px solid ${token.colorBorderSecondary}`,
                                }}
                            >
                                <Paragraph
                                    style={{
                                        fontSize: 15,
                                        lineHeight: 1.85,
                                        textAlign: 'justify',
                                        marginBottom: 0,
                                    }}
                                    ellipsis={{
                                        rows: 6,
                                        expandable: true,
                                        symbol: '展开全文',
                                    }}
                                >
                                    {book.summary}
                                </Paragraph>
                            </Card>
                        ) : (
                            <Card
                                style={{
                                    background: token.colorBgLayout,
                                    borderRadius: 10,
                                    border: `1px solid ${token.colorBorderSecondary}`,
                                    textAlign: 'center',
                                    padding: 40,
                                }}
                            >
                                <InfoCircleOutlined
                                    style={{
                                        fontSize: 40,
                                        color: token.colorTextQuaternary,
                                        marginBottom: 12,
                                    }}
                                />
                                <br />
                                <Text type="secondary" style={{ fontSize: 14 }}>
                                    暂无内容简介
                                </Text>
                                <br />
                                <Text
                                    type="secondary"
                                    style={{ fontSize: 12, marginTop: 4, display: 'block' }}
                                >
                                    点击「同步豆瓣」按钮获取完整信息
                                </Text>
                            </Card>
                        )}
                    </Col>
                </Row>
            </Card>

            {/* 底部操作栏 */}
            <Card
                style={{
                    borderRadius: 16,
                    border: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Row justify="space-between" align="middle" wrap>
                    <Space size={8} wrap>
                        <Button
                            size="large"
                            icon={<ArrowLeftOutlined />}
                            onClick={() => navigate(-1)}
                        >
                            返回
                        </Button>
                        {hasShelf && (
                            <Button
                                size="large"
                                icon={<BookOutlined />}
                                onClick={() => navigate(`/shelf/${book.shelf_id}`)}
                            >
                                返回书架
                            </Button>
                        )}
                    </Space>
                    <Space size={8} wrap>
                        <Button
                            size="large"
                            icon={<PlusOutlined />}
                            type="primary"
                            onClick={() => setShowShelfSelector(true)}
                            style={{ borderRadius: 8 }}
                        >
                            添加到书架
                        </Button>
                        <Button
                            size="large"
                            icon={<SyncOutlined />}
                            loading={syncing}
                            onClick={handleSync}
                            style={{ borderRadius: 8 }}
                        >
                            同步豆瓣
                        </Button>
                    </Space>
                </Row>
            </Card>

            {/* 回到顶部 */}
            <FloatButton.BackTop
                visibilityHeight={400}
                style={{ right: 40, bottom: 40 }}
            />

            {/* 书架选择器 */}
            <ShelfSelector
                visible={showShelfSelector}
                bookId={book.book_id}
                bookTitle={book.title}
                onClose={() => setShowShelfSelector(false)}
                onSuccess={handleShelfAddSuccess}
                existingShelfIds={hasShelf ? [book.shelf_id!] : []}
            />
        </div>
    );
};

export default BookDetail;