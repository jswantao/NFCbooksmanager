// frontend/src/pages/BookDetail.tsx
/**
 * 图书详情页面
 * 
 * 展示图书的完整元数据信息，支持：
 * - 封面展示（含大图预览和加载失败回退）
 * - 基本信息描述（作者/ISBN/出版社等）
 * - 豆瓣评分展示
 * - 内容简介（可展开/收起）
 * - 操作时间线（创建/上架/同步）
 * - 添加到书架/从书架移除/同步豆瓣数据
 * - 复制 ISBN / 在豆瓣查看 / 分享
 * 
 * 数据来源：
 * - GET /api/books/{id} 获取图书完整详情
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Card,
    Spin,
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
    
} from 'antd';
import type { MenuProps } from 'antd';
import {
    ArrowLeftOutlined,
    BookOutlined,
    SyncOutlined,
    StarFilled,
    EnvironmentOutlined,
    UserOutlined,
    CalendarOutlined,
    NumberOutlined,
    FileTextOutlined,
    HomeOutlined,
    SearchOutlined,
    LinkOutlined,
    PlusOutlined,
    DeleteOutlined,
    EllipsisOutlined,
    DollarOutlined,
    TranslationOutlined,
    TagsOutlined,
    FormOutlined,
    InfoCircleOutlined,
    CopyOutlined,
    ShareAltOutlined,
} from '@ant-design/icons';
import {
    getBookDetail,
    removeBookFromShelf,
    syncBookByISBN,
} from '../services/api';
import { getCoverUrl, getPlaceholderCover } from '../utils/image';
import ShelfSelector from '../components/ShelfSelector';

// ---- 类型定义 ----

const { Title, Paragraph, Text } = Typography;

/** 图书详情数据结构 */
interface BookDetailData {
    book_id: number;
    isbn: string;
    title: string;
    author?: string;
    translator?: string;
    publisher?: string;
    publish_date?: string;
    cover_url?: string;
    summary?: string;
    source: string;
    pages?: string;
    price?: string;
    binding?: string;
    original_title?: string;
    series?: string;
    rating?: string;
    douban_url?: string;
    last_sync_at?: string;
    created_at?: string;
    updated_at?: string;
    shelf_name?: string;
    shelf_id?: number;
    sort_order?: number;
    added_at?: string;
}

// ---- 常量 ----

/** 装帧类型标签颜色 */
const BINDING_COLORS: Record<string, string> = {
    平装: 'blue',
    精装: 'gold',
    线装: 'purple',
    骑马钉: 'cyan',
    软精装: 'geekblue',
};

// ---- 主组件 ----

const BookDetail: React.FC = () => {
    const { shelfId, bookId } = useParams<{
        shelfId: string;
        bookId: string;
    }>();
    const navigate = useNavigate();

    // ==================== 状态 ====================

    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [book, setBook] = useState<BookDetailData | null>(null);
    const [imageLoading, setImageLoading] = useState(true);
    const [imageError, setImageError] = useState(false);
    const [showShelfSelector, setShowShelfSelector] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // ==================== 数据加载 ====================

    const loadBookDetail = useCallback(async () => {
        if (!bookId) return;

        setLoading(true);
        setLoadError(null);

        try {
            const data = await getBookDetail(parseInt(bookId));
            setBook(data);
            setImageLoading(true);
            setImageError(false);
        } catch (error: any) {
            setLoadError(
                error?.response?.data?.detail || '加载图书信息失败'
            );
        } finally {
            setLoading(false);
        }
    }, [bookId]);

    useEffect(() => {
        loadBookDetail();
    }, [loadBookDetail]);

    // ==================== 衍生数据 ====================

    /** 封面 URL（通过代理） */
    const coverUrl = useMemo(
        () => getCoverUrl(book?.cover_url) || '',
        [book]
    );

    /** SVG 占位图 */
    const placeholderUrl = useMemo(
        () => getPlaceholderCover(book?.title, book?.author),
        [book]
    );

    /** 评分浮点数值 */
    const ratingValue = useMemo(() => {
        if (!book?.rating) return 0;
        const parsed = parseFloat(book.rating);
        return isNaN(parsed) ? 0 : parsed;
    }, [book?.rating]);

    /** 更多操作下拉菜单 */
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
                          key: 'edit',  // ⬅ 新增
                          icon: <FormOutlined />,
                          label: '编辑信息',
                          onClick: () =>
                          navigate(`/books/edit/${book.book_id}`),
                      },
                      {
                          key: 'copy',
                          icon: <CopyOutlined />,
                          label: '复制 ISBN',
                          onClick: () => {
                              navigator.clipboard.writeText(book.isbn);
                              message.success('ISBN 已复制到剪贴板');
                          },
                      },
                      {
                          key: 'share',
                          icon: <ShareAltOutlined />,
                          label: '分享',
                          onClick: () => {
                              if (navigator.share) {
                                  navigator.share({
                                      title: book.title,
                                      text: `《${book.title}》`,
                                      url: window.location.href,
                                  });
                              }
                          },
                      },
                      { type: 'divider' as const },
                      {
                          key: 'sync',
                          icon: <SyncOutlined />,
                          label: '同步豆瓣数据',
                          onClick: async () => {
                              setSyncing(true);
                              try {
                                  await syncBookByISBN(book.isbn);
                                  await loadBookDetail();
                                  message.success('同步成功');
                              } catch (error: any) {
                                  message.error(
                                      error?.response?.data?.detail ||
                                          '同步失败'
                                  );
                              } finally {
                                  setSyncing(false);
                              }
                          },
                      },
                      {
                          key: 'douban',
                          icon: <LinkOutlined />,
                          label: '在豆瓣查看',
                          disabled: !book.douban_url,
                          onClick: () => {
                              if (book.douban_url)
                                  window.open(book.douban_url, '_blank');
                          },
                      },
                      { type: 'divider' as const },
                      {
                          key: 'remove',
                          icon: <DeleteOutlined />,
                          label: '从书架移除',
                          danger: true,
                          disabled: !book.shelf_id,
                          onClick: async () => {
                              setRemoving(true);
                              try {
                                  await removeBookFromShelf(
                                      book.shelf_id!,
                                      book.book_id
                                  );
                                  message.success('已从书架移除');
                                  setTimeout(
                                      () =>
                                          navigate(
                                              book.shelf_id
                                                  ? `/shelf/${book.shelf_id}`
                                                  : '/'
                                          ),
                                      1000
                                  );
                              } catch (error: any) {
                                  message.error(
                                      error?.response?.data?.detail ||
                                          '移除失败'
                                  );
                              } finally {
                                  setRemoving(false);
                              }
                          },
                      },
                  ]
                : [],
        [book, loadBookDetail, navigate]
    );

    // ==================== 渲染：加载状态 ====================

    if (loading) {
        return (
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
                <Skeleton active />
                <Card style={{ borderRadius: 12 }}>
                    <Row gutter={[32, 24]}>
                        <Col xs={24} md={8}>
                            <Skeleton.Image
                                active
                                style={{
                                    width: '100%',
                                    height: 400,
                                }}
                            />
                        </Col>
                        <Col xs={24} md={16}>
                            <Skeleton active paragraph={{ rows: 12 }} />
                        </Col>
                    </Row>
                </Card>
            </div>
        );
    }

    // ==================== 渲染：错误状态 ====================

    if (loadError || !book) {
        return (
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
                <Button
                    icon={<ArrowLeftOutlined />}
                    onClick={() => navigate(-1)}
                >
                    返回
                </Button>
                <Card style={{ borderRadius: 12, marginTop: 16 }}>
                    <Result
                        status="error"
                        title="加载失败"
                        subTitle={loadError || '图书不存在'}
                        extra={[
                            <Button
                                key="retry"
                                type="primary"
                                onClick={loadBookDetail}
                            >
                                重试
                            </Button>,
                            <Button
                                key="home"
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

    // ==================== 主渲染 ====================

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
            {/* 面包屑导航 */}
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
                    ...(book.shelf_id
                        ? [
                              {
                                  title: (
                                      <a
                                          onClick={() =>
                                              navigate(
                                                  `/shelf/${book.shelf_id}`
                                              )
                                          }
                                      >
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
                    marginBottom: 16,
                    borderRadius: 10,
                    border: '1px solid #e8d5c8',
                }}
            >
                <Row justify="space-between" align="middle">
                    <Space>
                        <Button
                            icon={<ArrowLeftOutlined />}
                            onClick={() => navigate(-1)}
                        >
                            返回
                        </Button>
                        {book.shelf_id && (
                            <Button
                                icon={<BookOutlined />}
                                onClick={() =>
                                    navigate(`/shelf/${book.shelf_id}`)
                                }
                            >
                                返回书架
                            </Button>
                        )}
                    </Space>
                    <Space>
                        <Button
                            icon={<CopyOutlined />}
                            onClick={() => {
                                navigator.clipboard.writeText(book.isbn);
                                message.success('ISBN 已复制');
                            }}
                        >
                            复制 ISBN
                        </Button>
                        <Button
                            type="primary"
                            icon={<SyncOutlined spin={syncing} />}
                            loading={syncing}
                            onClick={async () => {
                                setSyncing(true);
                                try {
                                    await syncBookByISBN(book.isbn);
                                    await loadBookDetail();
                                } catch {
                                    // 错误已在 loadBookDetail 中处理
                                } finally {
                                    setSyncing(false);
                                }
                            }}
                        >
                            同步豆瓣
                        </Button>
                        <Dropdown menu={{ items: moreMenuItems }}>
                            <Button icon={<EllipsisOutlined />}>更多</Button>
                        </Dropdown>
                    </Space>
                </Row>
            </Card>

            {/* 主要内容卡片 */}
            <Card
                style={{
                    borderRadius: 12,
                    border: '1px solid #e8d5c8',
                    marginBottom: 24,
                }}
                bodyStyle={{ padding: 24 }}
            >
                <Row gutter={[32, 24]}>
                    {/* 左侧：封面 + 标签 */}
                    <Col xs={24} md={8}>
                        <div
                            style={{
                                position: 'relative',
                                maxWidth: 300,
                                margin: '0 auto',
                            }}
                        >
                            {/* 加载骨架 */}
                            {imageLoading && !imageError && (
                                <Skeleton.Image
                                    active
                                    style={{
                                        width: '100%',
                                        aspectRatio: '3/4',
                                        borderRadius: 8,
                                    }}
                                />
                            )}

                            {/* 封面图片 */}
                            {coverUrl && !imageError ? (
                                <Image
                                    src={coverUrl}
                                    alt={book.title}
                                    style={{
                                        borderRadius: 8,
                                        width: '100%',
                                        aspectRatio: '3/4',
                                        objectFit: 'cover',
                                        display: imageLoading
                                            ? 'none'
                                            : 'block',
                                    }}
                                    fallback={placeholderUrl}
                                    onLoad={() => setImageLoading(false)}
                                    onError={() => {
                                        setImageError(true);
                                        setImageLoading(false);
                                    }}
                                    preview={{
                                        mask: (
                                            <div>
                                                <SearchOutlined
                                                    style={{ fontSize: 24 }}
                                                />
                                                查看大图
                                            </div>
                                        ),
                                    }}
                                />
                            ) : (
                                /* 占位图 */
                                <img
                                    src={placeholderUrl}
                                    alt={book.title}
                                    style={{
                                        width: '100%',
                                        aspectRatio: '3/4',
                                        objectFit: 'cover',
                                        borderRadius: 8,
                                    }}
                                />
                            )}

                            {/* 评分角标 */}
                            {book.rating && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 12,
                                        right: 12,
                                        background: 'rgba(0,0,0,.75)',
                                        color: '#fff',
                                        padding: '6px 12px',
                                        borderRadius: 8,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                    }}
                                >
                                    <StarFilled style={{ color: '#f59e0b' }} />
                                    {book.rating}
                                </div>
                            )}
                        </div>

                        {/* 标签 */}
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 8,
                                marginTop: 16,
                                justifyContent: 'center',
                            }}
                        >
                            <Tag
                                color={
                                    book.source === 'douban'
                                        ? 'green'
                                        : 'orange'
                                }
                            >
                                {book.source === 'douban' ? '豆瓣' : '手动录入'}
                            </Tag>
                            {book.binding && (
                                <Tag
                                    color={
                                        BINDING_COLORS[book.binding] ||
                                        'purple'
                                    }
                                >
                                    {book.binding}
                                </Tag>
                            )}
                            {book.shelf_name && (
                                <Tag
                                    color="blue"
                                    icon={<BookOutlined />}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() =>
                                        book.shelf_id &&
                                        navigate(
                                            `/shelf/${book.shelf_id}`
                                        )
                                    }
                                >
                                    {book.shelf_name}
                                </Tag>
                            )}
                        </div>

                        {/* 操作按钮 */}
                        <Space
                            direction="vertical"
                            style={{ width: '100%', marginTop: 16 }}
                        >
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                block
                                size="large"
                                onClick={() => setShowShelfSelector(true)}
                            >
                                添加到书架
                            </Button>
                            {book.shelf_id && (
                                <Popconfirm
                                    title="确定从书架移除此书？"
                                    onConfirm={async () => {
                                        setRemoving(true);
                                        try {
                                            await removeBookFromShelf(
                                                book.shelf_id!,
                                                book.book_id
                                            );
                                            message.success('已移除');
                                            navigate(
                                                `/shelf/${book.shelf_id}`
                                            );
                                        } catch {
                                            // 错误已在 catch 处理
                                        } finally {
                                            setRemoving(false);
                                        }
                                    }}
                                >
                                    <Button
                                        danger
                                        icon={<DeleteOutlined />}
                                        loading={removing}
                                        block
                                        size="large"
                                    >
                                        从书架移除
                                    </Button>
                                </Popconfirm>
                            )}
                        </Space>
                    </Col>

                    {/* 右侧：详细信息 */}
                    <Col xs={24} md={16}>
                        <Title level={2} style={{ marginTop: 0 }}>
                            {book.title}
                        </Title>

                        {book.original_title && (
                            <Text type="secondary">
                                <TranslationOutlined /> 原作名：
                                {book.original_title}
                            </Text>
                        )}

                        {/* 评分 */}
                        {ratingValue > 0 && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    marginTop: 8,
                                }}
                            >
                                <Rate
                                    disabled
                                    allowHalf
                                    value={ratingValue / 2}
                                    style={{ fontSize: 20 }}
                                />
                                <Text
                                    strong
                                    style={{
                                        fontSize: 24,
                                        color: '#f59e0b',
                                    }}
                                >
                                    {book.rating}
                                </Text>
                            </div>
                        )}

                        <Divider />

                        {/* 基本信息描述 */}
                        <Descriptions
                            bordered
                            size="middle"
                            column={{ xs: 1, sm: 2 }}
                            labelStyle={{
                                fontWeight: 500,
                                background: '#fafaf9',
                            }}
                        >
                            <Descriptions.Item label="作者">
                                <Text strong>{book.author || '未知'}</Text>
                            </Descriptions.Item>
                            {book.translator && (
                                <Descriptions.Item label="译者">
                                    {book.translator}
                                </Descriptions.Item>
                            )}
                            <Descriptions.Item label="ISBN">
                                <Text code>{book.isbn}</Text>
                            </Descriptions.Item>
                            {book.publisher && (
                                <Descriptions.Item label="出版社">
                                    {book.publisher}
                                </Descriptions.Item>
                            )}
                            {book.publish_date && (
                                <Descriptions.Item label="出版日期">
                                    {book.publish_date}
                                </Descriptions.Item>
                            )}
                            {book.pages && (
                                <Descriptions.Item label="页数">
                                    {book.pages} 页
                                </Descriptions.Item>
                            )}
                            {book.price && (
                                <Descriptions.Item label="定价">
                                    {book.price}
                                </Descriptions.Item>
                            )}
                            {book.binding && (
                                <Descriptions.Item label="装帧">
                                    <Tag
                                        color={
                                            BINDING_COLORS[book.binding] ||
                                            'purple'
                                        }
                                    >
                                        {book.binding}
                                    </Tag>
                                </Descriptions.Item>
                            )}
                            {book.series && (
                                <Descriptions.Item label="丛书" span={2}>
                                    {book.series}
                                </Descriptions.Item>
                            )}
                            {book.shelf_name && (
                                <Descriptions.Item label="所在书架" span={2}>
                                    <Tag
                                        color="blue"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() =>
                                            book.shelf_id &&
                                            navigate(
                                                `/shelf/${book.shelf_id}`
                                            )
                                        }
                                    >
                                        {book.shelf_name}
                                    </Tag>
                                </Descriptions.Item>
                            )}
                        </Descriptions>

                        {/* 操作时间线 */}
                        <Card
                            size="small"
                            style={{
                                marginTop: 16,
                                background: '#fafaf9',
                                borderRadius: 8,
                            }}
                        >
                            <Timeline
                                items={[
                                    {
                                        color: 'blue',
                                        children: (
                                            <div>
                                                <Text strong>创建</Text>
                                                <br />
                                                <Text type="secondary">
                                                    {book.created_at
                                                        ? new Date(
                                                              book.created_at
                                                          ).toLocaleString(
                                                              'zh-CN'
                                                          )
                                                        : '未知'}
                                                </Text>
                                            </div>
                                        ),
                                    },
                                    ...(book.added_at
                                        ? [
                                              {
                                                  color: 'green' as const,
                                                  children: (
                                                      <div>
                                                          <Text strong>
                                                              上架
                                                          </Text>
                                                          <br />
                                                          <Text type="secondary">
                                                              {new Date(
                                                                  book.added_at
                                                              ).toLocaleString(
                                                                  'zh-CN'
                                                              )}
                                                          </Text>
                                                      </div>
                                                  ),
                                              },
                                          ]
                                        : []),
                                    ...(book.last_sync_at
                                        ? [
                                              {
                                                  color: 'orange' as const,
                                                  children: (
                                                      <div>
                                                          <Text strong>
                                                              同步豆瓣
                                                          </Text>
                                                          <br />
                                                          <Text type="secondary">
                                                              {new Date(
                                                                  book.last_sync_at
                                                              ).toLocaleString(
                                                                  'zh-CN'
                                                              )}
                                                          </Text>
                                                      </div>
                                                  ),
                                              },
                                          ]
                                        : []),
                                ]}
                            />
                        </Card>

                        {/* 内容简介 */}
                        <Title level={4} style={{ marginTop: 24 }}>
                            <FileTextOutlined /> 内容简介
                        </Title>
                        {book.summary ? (
                            <Card
                                style={{
                                    background: '#fafaf9',
                                    borderRadius: 8,
                                }}
                            >
                                <Paragraph
                                    style={{
                                        fontSize: 15,
                                        lineHeight: 1.8,
                                        textAlign: 'justify',
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
                                    background: '#fafaf9',
                                    borderRadius: 8,
                                    textAlign: 'center',
                                    padding: 32,
                                }}
                            >
                                <InfoCircleOutlined
                                    style={{
                                        fontSize: 32,
                                        color: '#d4a574',
                                    }}
                                />
                                <br />
                                <Text type="secondary">
                                    暂无简介，可同步豆瓣获取
                                </Text>
                            </Card>
                        )}
                    </Col>
                </Row>
            </Card>

            {/* 底部操作栏 */}
            <Card
                style={{
                    borderRadius: 12,
                    border: '1px solid #e8d5c8',
                }}
            >
                <Row justify="space-between">
                    <Space>
                        <Button
                            size="large"
                            icon={<ArrowLeftOutlined />}
                            onClick={() => navigate(-1)}
                        >
                            返回
                        </Button>
                        {book.shelf_id && (
                            <Button
                                size="large"
                                icon={<BookOutlined />}
                                onClick={() =>
                                    navigate(`/shelf/${book.shelf_id}`)
                                }
                            >
                                返回书架
                            </Button>
                        )}
                    </Space>
                    <Space>
                        <Button
                            size="large"
                            icon={<PlusOutlined />}
                            type="primary"
                            onClick={() => setShowShelfSelector(true)}
                        >
                            添加到书架
                        </Button>
                        <Button
                            size="large"
                            icon={<SyncOutlined />}
                            loading={syncing}
                            onClick={async () => {
                                setSyncing(true);
                                try {
                                    await syncBookByISBN(book.isbn);
                                    await loadBookDetail();
                                } catch {
                                    // 错误已处理
                                } finally {
                                    setSyncing(false);
                                }
                            }}
                        >
                            同步豆瓣
                        </Button>
                    </Space>
                </Row>
            </Card>

            {/* 返回顶部 */}
            <FloatButton.BackTop
                visibilityHeight={400}
                style={{ right: 40, bottom: 40 }}
            />

            {/* 书架选择器弹窗 */}
            <ShelfSelector
                visible={showShelfSelector}
                bookId={book.book_id}
                bookTitle={book.title}
                onClose={() => setShowShelfSelector(false)}
                onSuccess={() => {
                    message.success('已添加到书架');
                    loadBookDetail();
                }}
            />
        </div>
    );
};

export default BookDetail;