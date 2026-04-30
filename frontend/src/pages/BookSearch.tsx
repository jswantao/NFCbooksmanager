// frontend/src/pages/BookSearch.tsx
/**
 * 图书搜索与同步页面
 * 
 * 提供通过 ISBN 从豆瓣获取图书信息的功能。
 * 
 * 功能：
 * - ISBN 输入搜索（支持回车键触发）
 * - 输入时自动清洗连字符和空格
 * - 搜索结果显示完整图书信息
 * - 快速示例填充（一键搜索示例图书）
 * - 搜索结果可添加到书架
 * - 同步失败时显示错误并支持重试
 * 
 * 数据流：
 * ISBN 输入 → POST /api/books/sync → 豆瓣搜索 → 返回图书数据 → 展示
 */

import React, { useState, useCallback, useMemo } from 'react';
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
} from 'antd';
import {
    SearchOutlined,
    SyncOutlined,
    PlusOutlined,
    StarFilled,
    UserOutlined,
    NumberOutlined,
    HomeOutlined,
    CheckCircleOutlined,
    BookOutlined,
    CopyOutlined,
    ClearOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { syncBookByISBN } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { getCoverUrl, getPlaceholderCover } from '../utils/image';
import ShelfSelector from '../components/ShelfSelector';

// ---- 类型定义 ----

const { Title, Text, Paragraph } = Typography;

/** 示例图书（快速填充搜索） */
const SAMPLE_BOOKS = [
    { isbn: '9787020002207', title: '红楼梦' },
    { isbn: '9787532768998', title: '百年孤独' },
    { isbn: '9787544270878', title: '解忧杂货店' },
];

// ---- 主组件 ----

const BookSearch: React.FC = () => {
    const navigate = useNavigate();

    // ==================== 状态 ====================

    const [isbnInput, setIsbnInput] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResult, setSearchResult] = useState<any>(null);
    const [searchError, setSearchError] = useState('');
    const [showShelfSelector, setShowShelfSelector] = useState(false);

    // ==================== 搜索操作 ====================

    /**
     * 根据 ISBN 搜索图书
     * 
     * 处理流程：
     * 1. 清洗 ISBN（移除连字符和空格）
     * 2. 校验 ISBN 格式
     * 3. 调用同步 API（会触发豆瓣搜索）
     * 4. 成功 → 展示图书信息
     * 5. 失败 → 显示错误信息
     * 
     * @param searchIsbn - 可选的 ISBN 参数（用于示例快速填充）
     */
    const handleSearch = useCallback(
        async (searchIsbn?: string) => {
            // 清洗 ISBN
            const targetIsbn = (
                searchIsbn || isbnInput
            ).replace(/[-\s]/g, '');

            // 格式校验
            if (
                !targetIsbn ||
                !/^\d{9}[\dXx]$|^\d{13}$/.test(targetIsbn)
            ) {
                message.warning('请输入正确的 ISBN（10 或 13 位）');
                return;
            }

            setIsbnInput(targetIsbn);
            setIsSearching(true);
            setSearchError('');
            setSearchResult(null);

            try {
                const result = await syncBookByISBN(targetIsbn);

                if (result.success) {
                    setSearchResult(result.book);
                    message.success('图书信息获取成功！');
                } else {
                    setSearchError(result.message || '未找到该图书');
                }
            } catch (error: any) {
                setSearchError(
                    error?.response?.data?.detail ||
                        error?.userMessage ||
                        '搜索失败，请检查网络或 ISBN 是否正确'
                );
            } finally {
                setIsSearching(false);
            }
        },
        [isbnInput]
    );

    // ==================== 衍生数据 ====================

    /** 封面 URL（通过代理） */
    const coverUrl = useMemo(
        () => getCoverUrl(searchResult?.cover_url) || '',
        [searchResult]
    );

    /** SVG 占位图 */
    const placeholderUrl = useMemo(
        () =>
            getPlaceholderCover(
                searchResult?.title,
                searchResult?.author
            ),
        [searchResult]
    );

    // ==================== 渲染 ====================

    return (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
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
                    { title: '图书搜索' },
                ]}
            />

            {/* 页面标题 */}
            <Title level={2} style={{ marginBottom: 24 }}>
                <SearchOutlined
                    style={{ color: '#8B4513', marginRight: 12 }}
                />
                图书搜索与同步
            </Title>

            {/* 搜索输入区 */}
            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 12,
                    border: '1px solid #e8d5c8',
                }}
            >
                <Alert
                    message="输入 ISBN 从豆瓣获取图书信息"
                    description="支持 10 位或 13 位 ISBN，自动清洗连字符和空格"
                    type="info"
                    showIcon
                    style={{ marginBottom: 16, borderRadius: 8 }}
                />

                {/* 搜索输入框 */}
                <Space.Compact style={{ width: '100%' }}>
                    <Input
                        size="large"
                        placeholder="输入 ISBN，如 9787544270878"
                        value={isbnInput}
                        onChange={(e) =>
                            setIsbnInput(e.target.value)
                        }
                        onPressEnter={() => handleSearch()}
                        prefix={<SearchOutlined />}
                        suffix={
                            isbnInput && (
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<ClearOutlined />}
                                    onClick={() => {
                                        setIsbnInput('');
                                        setSearchResult(null);
                                        setSearchError('');
                                    }}
                                />
                            )
                        }
                        style={{
                            borderRadius: '8px 0 0 8px',
                        }}
                    />
                    <Button
                        type="primary"
                        size="large"
                        icon={
                            isSearching ? (
                                <SyncOutlined spin />
                            ) : (
                                <SyncOutlined />
                            )
                        }
                        loading={isSearching}
                        onClick={() => handleSearch()}
                        style={{
                            borderRadius: '0 8px 8px 0',
                            minWidth: 160,
                        }}
                    >
                        {isSearching ? '搜索中...' : '同步图书信息'}
                    </Button>
                </Space.Compact>

                {/* 示例图书快速填充 */}
                <div
                    style={{
                        marginTop: 16,
                        padding: 16,
                        background: '#fafaf9',
                        borderRadius: 8,
                    }}
                >
                    <Text type="secondary" style={{ fontSize: 13 }}>
                        📝 快速尝试：
                    </Text>
                    <Space wrap style={{ marginTop: 8 }}>
                        {SAMPLE_BOOKS.map((sample) => (
                            <Button
                                key={sample.isbn}
                                size="small"
                                type="dashed"
                                onClick={() =>
                                    handleSearch(sample.isbn)
                                }
                            >
                                {sample.title}
                            </Button>
                        ))}
                    </Space>
                </div>
            </Card>

            {/* 搜索错误 */}
            {searchError && (
                <Result
                    status="error"
                    title="搜索失败"
                    subTitle={searchError}
                    style={{
                        marginBottom: 24,
                        padding: 32,
                        background: '#fef2f2',
                        borderRadius: 12,
                    }}
                    extra={[
                        <Button
                            key="retry"
                            type="primary"
                            icon={<ReloadOutlined />}
                            onClick={() => handleSearch()}
                        >
                            重试
                        </Button>,
                        <Button
                            key="clear"
                            onClick={() => setSearchError('')}
                        >
                            清除
                        </Button>,
                    ]}
                />
            )}

            {/* 搜索中加载 */}
            {isSearching && (
                <Card
                    style={{
                        borderRadius: 12,
                        marginBottom: 24,
                        textAlign: 'center',
                        padding: 60,
                    }}
                >
                    <Spin size="large" />
                    <Text
                        type="secondary"
                        style={{
                            display: 'block',
                            marginTop: 16,
                        }}
                    >
                        正在从豆瓣获取图书信息...
                    </Text>
                </Card>
            )}

            {/* 空状态 */}
            {!isSearching && !searchResult && !searchError && (
                <Card style={{ borderRadius: 12 }}>
                    <Empty
                        image={
                            <div
                                style={{
                                    fontSize: 64,
                                    opacity: 0.6,
                                }}
                            >
                                📖
                            </div>
                        }
                        description="输入 ISBN 开始搜索图书信息"
                    />
                </Card>
            )}

            {/* 搜索结果 */}
            {searchResult && !isSearching && (
                <>
                    <Card
                        style={{
                            borderRadius: 12,
                            border: '1px solid #e8d5c8',
                            marginBottom: 16,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                gap: 24,
                                flexWrap: 'wrap',
                            }}
                        >
                            {/* 封面区域 */}
                            <div
                                style={{
                                    textAlign: 'center',
                                    minWidth: 160,
                                }}
                            >
                                <img
                                    src={coverUrl || placeholderUrl}
                                    alt={searchResult.title}
                                    style={{
                                        width: 160,
                                        aspectRatio: '3/4',
                                        objectFit: 'cover',
                                        borderRadius: 8,
                                        boxShadow:
                                            '0 4px 12px rgba(139,69,19,.15)',
                                    }}
                                />
                                <Tag
                                    color={
                                        searchResult.source === 'douban'
                                            ? 'green'
                                            : 'orange'
                                    }
                                    style={{ marginTop: 8 }}
                                >
                                    {searchResult.source === 'douban'
                                        ? '豆瓣数据'
                                        : '手动录入'}
                                </Tag>

                                {/* 操作按钮 */}
                                <Space
                                    direction="vertical"
                                    style={{
                                        width: '100%',
                                        marginTop: 12,
                                    }}
                                >
                                    <Button
                                        type="primary"
                                        icon={<PlusOutlined />}
                                        block
                                        size="large"
                                        onClick={() =>
                                            setShowShelfSelector(true)
                                        }
                                    >
                                        添加到书架
                                    </Button>
                                    <Button
                                        icon={<BookOutlined />}
                                        block
                                        onClick={() =>
                                            navigate('/shelf/1')
                                        }
                                    >
                                        浏览书架
                                    </Button>
                                </Space>
                            </div>

                            {/* 信息区域 */}
                            <div
                                style={{
                                    flex: 1,
                                    minWidth: 280,
                                }}
                            >
                                <Title
                                    level={3}
                                    style={{ marginTop: 0 }}
                                >
                                    {searchResult.title}
                                </Title>

                                {/* 评分 */}
                                {searchResult.rating && (
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            marginBottom: 12,
                                        }}
                                    >
                                        <Rate
                                            disabled
                                            allowHalf
                                            value={
                                                parseFloat(
                                                    searchResult.rating
                                                ) / 2
                                            }
                                        />
                                        <Text
                                            strong
                                            style={{
                                                color: '#f59e0b',
                                            }}
                                        >
                                            {searchResult.rating}
                                        </Text>
                                    </div>
                                )}

                                <Divider />

                                {/* 详细信息网格 */}
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns:
                                            'repeat(auto-fill,minmax(180px,1fr))',
                                        gap: 8,
                                    }}
                                >
                                    {[
                                        {
                                            label: '作者',
                                            value:
                                                searchResult.author,
                                            isStrong: true,
                                        },
                                        {
                                            label: 'ISBN',
                                            value:
                                                searchResult.isbn,
                                            isCode: true,
                                        },
                                        {
                                            label: '出版社',
                                            value:
                                                searchResult.publisher,
                                        },
                                        {
                                            label: '出版日期',
                                            value:
                                                searchResult.publish_date,
                                        },
                                        {
                                            label: '页数',
                                            value: searchResult.pages
                                                ? `${searchResult.pages} 页`
                                                : '',
                                        },
                                        {
                                            label: '定价',
                                            value:
                                                searchResult.price,
                                        },
                                    ]
                                        .filter((item) => item.value)
                                        .map((item, index) => (
                                            <div key={index}>
                                                <Text
                                                    type="secondary"
                                                    style={{
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    {item.label}
                                                </Text>
                                                <br />
                                                {item.isCode ? (
                                                    <Text code>
                                                        {item.value}
                                                    </Text>
                                                ) : item.isStrong ? (
                                                    <Text strong>
                                                        {item.value}
                                                    </Text>
                                                ) : (
                                                    <Text>
                                                        {item.value}
                                                    </Text>
                                                )}
                                            </div>
                                        ))}
                                </div>

                                {/* 简介 */}
                                {searchResult.summary && (
                                    <>
                                        <Divider />
                                        <Text type="secondary">
                                            内容简介
                                        </Text>
                                        <Paragraph
                                            style={{
                                                background: '#fafaf9',
                                                padding: 16,
                                                borderRadius: 8,
                                                marginTop: 8,
                                            }}
                                            ellipsis={{
                                                rows: 4,
                                                expandable: true,
                                            }}
                                        >
                                            {searchResult.summary}
                                        </Paragraph>
                                    </>
                                )}
                            </div>
                        </div>
                    </Card>

                    {/* 成功提示 */}
                    <Card
                        style={{
                            borderRadius: 12,
                            background: '#f0fdf4',
                            border: '1px solid #d1fae5',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                gap: 12,
                                alignItems: 'center',
                            }}
                        >
                            <CheckCircleOutlined
                                style={{
                                    color: '#22c55e',
                                    fontSize: 20,
                                }}
                            />
                            <div>
                                <Text
                                    strong
                                    style={{ color: '#166534' }}
                                >
                                    图书信息已获取
                                </Text>
                                <br />
                                <Text
                                    type="secondary"
                                    style={{ color: '#15803d' }}
                                >
                                    可以添加到书架或继续搜索其他图书
                                </Text>
                            </div>
                        </div>
                    </Card>
                </>
            )}

            {/* 书架选择器弹窗 */}
            <ShelfSelector
                visible={showShelfSelector}
                bookId={searchResult?.book_id || 0}
                bookTitle={searchResult?.title || ''}
                onClose={() => setShowShelfSelector(false)}
                onSuccess={() => {
                    message.success('已添加到书架');
                    setShowShelfSelector(false);
                }}
            />
        </div>
    );
};

export default BookSearch;