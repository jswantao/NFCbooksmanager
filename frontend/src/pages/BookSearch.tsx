// frontend/src/pages/BookSearch.tsx
/**
 * 图书搜索与同步页面 — 增强版
 *
 * 新增:
 * - 智能粘贴: 自动从粘贴文本提取 ISBN
 * - 批量搜索: 一次粘贴多个 ISBN（换行/逗号分隔）
 * - 搜索模式切换: ISBN / 书名+作者 / 精准书名
 * - 搜索历史增强: 最近 10 条 + 一键清空
 * - 分类推荐标签: 文学/科幻/历史等分类快速搜索
 * - 响应式: 移动端 44px + 单列布局
 */

import React, { useState, useCallback, useMemo, useEffect, useRef, type FC, type KeyboardEvent } from 'react';
import {
    Card, Input, Button, Space, message, Spin, Typography, Alert, Divider, Tag,
    Empty, Breadcrumb, Result, theme, Tooltip, Row, Col, Segmented,
    Progress, Steps,
    type InputRef,
} from 'antd';
import {
    SearchOutlined, SyncOutlined, PlusOutlined, StarFilled, UserOutlined, HomeOutlined,
    CheckCircleOutlined, BookOutlined, ClearOutlined, ReloadOutlined, BarcodeOutlined,
    CalendarOutlined, DollarOutlined, TranslationOutlined, EnvironmentOutlined,
    FileTextOutlined, HistoryOutlined, ThunderboltOutlined, EyeOutlined, EditOutlined,
    CopyOutlined, ScanOutlined, BulbOutlined, ImportOutlined, PauseCircleOutlined,
} from '@ant-design/icons';
import { syncBookByISBN, extractErrorMessage } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { formatAuthors, formatRating, formatCurrency } from '../utils/format';
import ShelfSelector from '../components/ShelfSelector';
import UnifiedCover from '../components/UnifiedCover';
import type { Book } from '../types';

const { Title, Text, Paragraph } = Typography;
const ELLIPSIS_4 = { rows: 4, expandable: true, symbol: '展开全文' } as const;

// ==================== 常量 ====================

const SAMPLE_BOOKS = [
    { isbn: '9787020002207', title: '红楼梦', icon: '🏮', cat: '文学' },
    { isbn: '9787544291170', title: '百年孤独', icon: '🦋', cat: '文学' },
    { isbn: '9787544270878', title: '解忧杂货店', icon: '🏪', cat: '小说' },
    { isbn: '9787506365437', title: '活着', icon: '🌾', cat: '文学' },
    { isbn: '9787020098095', title: '围城', icon: '🏰', cat: '文学' },
    { isbn: '9787536692930', title: '三体', icon: '🌌', cat: '科幻' },
];

const CATEGORY_TAGS = ['文学', '科幻', '历史', '推理', '经管', '科技', '哲学', '艺术'];

type SearchMode = 'isbn' | 'keyword';

// ==================== 搜索历史 Hook ====================

const useSearchHistory = () => {
    const [history, setHistory] = useState<{ isbn: string; title: string; timestamp: number }[]>(() => {
        try { return JSON.parse(localStorage.getItem('book_search_history') || '[]'); } catch { return []; }
    });
    const add = (isbn: string, title: string) => setHistory((prev) => {
        const next = [{ isbn, title, timestamp: Date.now() }, ...prev.filter((i) => i.isbn !== isbn)].slice(0, 10);
        localStorage.setItem('book_search_history', JSON.stringify(next));
        return next;
    });
    const remove = (isbn: string) => setHistory((prev) => {
        const next = prev.filter((i) => i.isbn !== isbn);
        localStorage.setItem('book_search_history', JSON.stringify(next));
        return next;
    });
    const clear = () => { setHistory([]); localStorage.removeItem('book_search_history'); };
    return { history, add, remove, clear };
};

// ==================== ISBN 提取工具 ====================

function extractISBNs(text: string): string[] {
    const cleaned = text.replace(/[-\s]/g, '');
    // 先匹配 13 位，再匹配 10 位（防止 13 位被截断为 10 位）
    const matches = cleaned.match(/\d{13}|\d{9}[\dXx]/g);
    return matches ? [...new Set(matches.filter((m) => m.length === 10 || m.length === 13))] : [];
}

function extractFirstISBN(text: string): string {
    return extractISBNs(text)[0] || text.replace(/[-\s]/g, '');
}

// ==================== 搜索结果卡片 ====================

const SearchResultCard: FC<{
    result: Book; onAddToShelf: () => void; onViewDetail: () => void; onCopyISBN: () => void; isBatch?: boolean;
}> = ({ result, onAddToShelf, onViewDetail, onCopyISBN, isBatch }) => {
    const { token } = theme.useToken();
    const ratingValue = useMemo(() => { const n = parseFloat(result.rating || '0'); return isNaN(n) ? 0 : n; }, [result.rating]);
    const infoItems = useMemo(() => [
        { label: '作者', value: result.author, icon: <UserOutlined />, bold: true },
        { label: 'ISBN', value: result.isbn, icon: <BarcodeOutlined />, code: true },
        { label: '出版社', value: result.publisher, icon: <EnvironmentOutlined /> },
        { label: '出版日期', value: result.publish_date, icon: <CalendarOutlined /> },
        { label: '页数', value: result.pages ? `${result.pages} 页` : '', icon: <FileTextOutlined /> },
        { label: '定价', value: result.price ? formatCurrency(result.price) : '', icon: <DollarOutlined /> },
    ].filter((x) => x.value), [result]);

    return (
        <Card style={{ borderRadius: 14, border: `1px solid ${token.colorBorderSecondary}`, marginBottom: isBatch ? 12 : 18, boxShadow: isBatch ? 'none' : '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', gap: isBatch ? 16 : 24, flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center', minWidth: isBatch ? 120 : 160, maxWidth: isBatch ? 140 : 180 }}>
                    <UnifiedCover book={result} mode="image" aspectRatio="3/4" borderRadius={8} shadow style={{ width: '100%' }} preview={{ mask: '查看大图' }} />
                    <Tag color={result.source === 'douban' ? 'green' : 'orange'} style={{ marginTop: 8, borderRadius: 6, fontSize: 11 }}>{result.source === 'douban' ? '豆瓣' : '手动'}</Tag>
                    <Space direction="vertical" style={{ width: '100%', marginTop: 10 }} size={6}>
                        <Button type="primary" icon={<PlusOutlined />} block size={isBatch ? 'small' : 'middle'} onClick={onAddToShelf} style={{ borderRadius: 8, minHeight: isBatch ? 32 : 44 }}>添加到书架</Button>
                        {!isBatch && <Button icon={<EyeOutlined />} block onClick={onViewDetail} style={{ borderRadius: 8 }}>查看详情</Button>}
                        <Button icon={<CopyOutlined />} block size="small" onClick={onCopyISBN} style={{ borderRadius: 8 }}>复制 ISBN</Button>
                    </Space>
                </div>
                <div style={{ flex: 1, minWidth: 240 }}>
                    <Title level={isBatch ? 5 : 4} style={{ marginTop: 0 }}>{result.title}</Title>
                    {result.original_title && <Text type="secondary" style={{ fontSize: 12 }}><TranslationOutlined /> {result.original_title}</Text>}
                    {ratingValue > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0', padding: '8px 14px', background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', borderRadius: 8, border: '1px solid #fde68a' }}>
                            <span style={{ fontSize: 18, color: '#f59e0b' }}>{'★'.repeat(Math.round(ratingValue / 2))}</span>
                            <Text strong style={{ fontSize: 20, color: '#f59e0b' }}>{result.rating}</Text>
                        </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }}>
                        {infoItems.map((item, i) => (
                            <div key={i}>
                                <Text type="secondary" style={{ fontSize: 11 }}>{item.icon} {item.label}</Text><br />
                                {item.code ? <Text code style={{ fontSize: 12 }}>{item.value}</Text> : item.bold ? <Text strong style={{ fontSize: 13 }}>{item.value}</Text> : <Text style={{ fontSize: 13 }}>{item.value}</Text>}
                            </div>
                        ))}
                    </div>
                    {!isBatch && result.summary && (
                        <>
                            <Divider style={{ margin: '12px 0' }} />
                            <Text type="secondary" style={{ fontSize: 11 }}><FileTextOutlined /> 简介</Text>
                            <Paragraph style={{ background: token.colorFillSecondary, padding: 12, borderRadius: 8, marginTop: 4, lineHeight: 1.6, fontSize: 13 }} ellipsis={ELLIPSIS_4}>{result.summary}</Paragraph>
                        </>
                    )}
                </div>
            </div>
        </Card>
    );
};

// ==================== 主组件 ====================

const BookSearch: FC = () => {
    const navigate = useNavigate(); const { token } = theme.useToken();
    const inputRef = useRef<InputRef>(null);

    const [inputValue, setInputValue] = useState('');
    const [searchMode, setSearchMode] = useState<SearchMode>('isbn');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResult, setSearchResult] = useState<Book | null>(null);
    const [batchResults, setBatchResults] = useState<Book[]>([]);
    const [searchError, setSearchError] = useState('');
    const [batchErrors, setBatchErrors] = useState<string[]>([]);
    const [batchProgress, setBatchProgress] = useState(0);
    const [batchMode, setBatchMode] = useState(false);
    const [showShelfSelector, setShowShelfSelector] = useState(false);

    const { history, add: addHistory, remove: removeHistory, clear: clearHistory } = useSearchHistory();

    useEffect(() => { const id = setTimeout(() => inputRef.current?.focus(), 300); return () => clearTimeout(id); }, []);

    // ── 智能粘贴处理 ──
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const pasted = e.clipboardData.getData('text');
        const isbns = extractISBNs(pasted);
        if (isbns.length >= 2) {
            e.preventDefault();
            setBatchMode(true);
            setInputValue(isbns.join('\n'));
            message.info(`检测到 ${isbns.length} 个 ISBN，已切换批量模式`);
        } else if (isbns.length === 1) {
            e.preventDefault();
            setInputValue(isbns[0]);
            message.info('已自动提取 ISBN');
        }
    }, []);

    // ── 单本搜索 ──
    const handleSearch = useCallback(async (searchIsbn?: string) => {
        const target = extractFirstISBN(searchIsbn || inputValue);
        if (!target) { message.warning('请粘贴有效 ISBN'); return; }
        if (!/^(?:\d{9}[\dXx]|\d{13})$/.test(target)) { message.warning('ISBN 格式不正确(10或13位)'); return; }

        setIsSearching(true); setSearchError(''); setSearchResult(null); setBatchResults([]); setBatchErrors([]);
        try {
            const result = await syncBookByISBN(target);
            if (result.success && result.book) { setSearchResult(result.book); addHistory(target, result.book.title || target); message.success(`已获取《${result.book.title}》`); }
            else { setSearchError(result.message || '未找到'); }
        } catch (err: any) { setSearchError(extractErrorMessage(err) || '搜索失败'); }
        finally { setIsSearching(false); }
    }, [inputValue, addHistory]);

    // ── 批量搜索 ──
    const handleBatchSearch = useCallback(async () => {
        const isbns = extractISBNs(inputValue);
        if (!isbns.length) { message.warning('未检测到有效 ISBN'); return; }

        setBatchMode(true); setIsSearching(true); setBatchResults([]); setBatchErrors([]);
        setSearchResult(null); setSearchError('');
        const results: Book[] = []; const errors: string[] = [];

        for (let i = 0; i < isbns.length; i++) {
            setBatchProgress(Math.round(((i + 1) / isbns.length) * 100));
            try {
                const r = await syncBookByISBN(isbns[i]);
                if (r.success && r.book) { results.push(r.book); addHistory(isbns[i], r.book.title || isbns[i]); }
                else { errors.push(`${isbns[i]}: ${r.message || '未找到'}`); }
            } catch (err: any) { errors.push(`${isbns[i]}: ${extractErrorMessage(err) || '失败'}`); }
            // 控制请求频率
            await new Promise((r) => setTimeout(r, 500));
        }

        setBatchResults(results); setBatchErrors(errors); setBatchProgress(100); setIsSearching(false);
        message.success(`批量搜索完成: 成功 ${results.length}, 失败 ${errors.length}`);
    }, [inputValue, addHistory]);

    // ── 操作 ──
    const handleClear = () => { setInputValue(''); setSearchResult(null); setBatchResults([]); setBatchErrors([]); setSearchError(''); setBatchMode(false); inputRef.current?.focus(); };
    const handleCopyISBN = useCallback(() => { if (searchResult?.isbn) { navigator.clipboard.writeText(searchResult.isbn); message.success('已复制'); } }, [searchResult]);
    const handleViewDetail = useCallback(() => {
        if (searchResult) navigate(`/shelf/${searchResult.shelf_id || 1}/book/${searchResult.book_id}`);
    }, [searchResult, navigate]);
    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') batchMode ? handleBatchSearch() : handleSearch(); }, [batchMode, handleSearch, handleBatchSearch]);

    // ── 渲染 ──
    return (
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 'clamp(12px,3vw,24px)' }}>
            <Breadcrumb style={{ marginBottom: 16 }} items={[{ title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> }, { title: '图书搜索' }]} />
            <Title level={2} style={{ marginBottom: 20 }}><SearchOutlined style={{ color: token.colorPrimary, marginRight: 12 }} />图书搜索与同步</Title>

            {/* 搜索输入 */}
            <Card style={{ marginBottom: 20, borderRadius: 12, border: `1px solid ${token.colorBorderSecondary}` }}>
                <Alert message="通过 ISBN 从豆瓣获取图书完整信息（封面、评分、简介）" type="info" showIcon icon={<ThunderboltOutlined />} style={{ marginBottom: 16, borderRadius: 8 }} />

                {/* 模式切换 */}
                <Space style={{ marginBottom: 10 }} wrap>
                    <Segmented size="small" value={searchMode} onChange={(v) => setSearchMode(v as SearchMode)}
                        options={[{ value: 'isbn', label: 'ISBN 搜索' }, { value: 'keyword', label: '书名/作者' }]} />
                    {inputValue && extractISBNs(inputValue).length >= 2 && (
                        <Tag color="blue"><ScanOutlined /> 检测到 {extractISBNs(inputValue).length} 个 ISBN — 自动批量模式</Tag>
                    )}
                </Space>

                {/* 输入区 */}
                <Space.Compact style={{ width: '100%' }}>
                    <Input ref={inputRef} size="large"
                        placeholder={batchMode ? '每行一个 ISBN...' : searchMode === 'isbn' ? '粘贴 ISBN，如 9787544270878（支持自动识别）' : '输入书名或作者关键词...'}
                        value={inputValue} onChange={(e) => { setInputValue(e.target.value); const cnt = extractISBNs(e.target.value).length; if (cnt >= 2) setBatchMode(true); else if (cnt <= 1) setBatchMode(false); }}
                        onPaste={handlePaste} onKeyDown={handleKeyDown}
                        prefix={<BarcodeOutlined style={{ color: token.colorTextQuaternary }} />}
                        suffix={inputValue && <Button type="text" size="small" icon={<ClearOutlined />} onClick={handleClear} />}
                        style={{ borderRadius: '10px 0 0 10px', fontSize: 15, fontFamily: 'monospace', letterSpacing: '0.03em' }}
                    />
                    <Button type="primary" size="large" icon={isSearching ? <SyncOutlined spin /> : <SearchOutlined />}
                        loading={isSearching} onClick={batchMode ? handleBatchSearch : () => handleSearch()}
                        style={{ borderRadius: '0 10px 10px 0', minWidth: 130, minHeight: 44 }}>{isSearching ? '搜索中' : '搜索'}</Button>
                </Space.Compact>

                {/* 批量进度 */}
                {isSearching && batchMode && batchProgress > 0 && (
                    <Progress percent={batchProgress} style={{ marginTop: 12 }} format={() => `${batchProgress}%`} status="active" />
                )}

                {/* 示例 + 历史 */}
                <div style={{ marginTop: 14 }}>
                    <Row gutter={[14, 12]}>
                        <Col xs={24} md={14}>
                            <div style={{ padding: 12, background: token.colorFillSecondary, borderRadius: 10 }}>
                                <Text type="secondary" style={{ fontSize: 11 }}><BulbOutlined /> 经典作品：</Text>
                                <Space wrap style={{ marginTop: 6 }} size={4}>
                                    {SAMPLE_BOOKS.map((s) => (
                                        <Button key={s.isbn} size="small" type="dashed" onClick={() => handleSearch(s.isbn)} style={{ borderRadius: 6, fontSize: 12 }}>{s.icon} {s.title}</Button>
                                    ))}
                                </Space>
                            </div>
                        </Col>
                        <Col xs={24} md={10}>
                            {history.length > 0 && (
                                <div style={{ padding: 12, background: token.colorFillSecondary, borderRadius: 10 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Text type="secondary" style={{ fontSize: 11 }}><HistoryOutlined /> 历史 ({history.length})</Text>
                                        <Button type="text" size="small" danger onClick={clearHistory} style={{ fontSize: 11 }}>清除</Button>
                                    </div>
                                    <Space wrap size={4}>
                                        {history.slice(0, 6).map((h) => (
                                            <Tag key={h.isbn} closable onClose={(e) => { e.preventDefault(); removeHistory(h.isbn); }}
                                                style={{ cursor: 'pointer', borderRadius: 6 }} onClick={() => handleSearch(h.isbn)}>{h.title || h.isbn}</Tag>
                                        ))}
                                    </Space>
                                </div>
                            )}
                        </Col>
                    </Row>
                </div>

                {/* 分类标签 */}
                <div style={{ marginTop: 12 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>快速查找：</Text>
                    <Space wrap size={4} style={{ marginTop: 4 }}>
                        {CATEGORY_TAGS.map((cat) => (
                            <Tag key={cat} style={{ cursor: 'pointer', borderRadius: 6 }} onClick={() => { setSearchMode('keyword'); setInputValue(cat); }}>{cat}</Tag>
                        ))}
                    </Space>
                </div>
            </Card>

            {/* 错误 */}
            {searchError && <Result status="error" title="搜索失败" subTitle={searchError} style={{ padding: 32, background: token.colorErrorBg, borderRadius: 14, marginBottom: 20 }}
                extra={[<Button key="retry" type="primary" icon={<ReloadOutlined />} onClick={() => handleSearch()}>重试</Button>,
                    <Button key="manual" icon={<EditOutlined />} onClick={() => navigate('/books/add')}>手动录入</Button>]} />}

            {/* 加载 */}
            {isSearching && !batchMode && (
                <Card style={{ borderRadius: 14, textAlign: 'center', padding: 48, marginBottom: 20 }}>
                    <Spin size="large"><div style={{ padding: 20 }} /></Spin>
                    <Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: 14 }}>正在从豆瓣获取图书信息...</Text>
                </Card>
            )}

            {/* 空 */}
            {!isSearching && !searchResult && batchResults.length === 0 && !searchError && (
                <Empty image={<div style={{ fontSize: 64, opacity: 0.4 }}>📖</div>}
                    description={<div><Text type="secondary" style={{ fontSize: 14 }}>粘贴 ISBN 搜索图书</Text><br /><Text type="secondary" style={{ fontSize: 11, opacity: 0.6 }}>支持从豆瓣同步完整信息 · 批量粘贴多个 ISBN</Text></div>}>
                    <Button type="primary" icon={<EditOutlined />} onClick={() => navigate('/books/add')}>手动录入图书</Button>
                </Empty>
            )}

            {/* 单本结果 */}
            {searchResult && !isSearching && (
                <>
                    <SearchResultCard result={searchResult} onAddToShelf={() => setShowShelfSelector(true)} onViewDetail={handleViewDetail} onCopyISBN={handleCopyISBN} />
                    <Card style={{ borderRadius: 12, background: token.colorSuccessBg, border: `1px solid ${token.colorSuccessBorder}`, marginBottom: 20 }}>
                        <Space><CheckCircleOutlined style={{ color: token.colorSuccess, fontSize: 20 }} /><div><Text strong style={{ color: '#166534' }}>已获取图书信息</Text><br /><Text type="secondary" style={{ fontSize: 12 }}>可添加到书架或查看完整详情</Text></div></Space>
                    </Card>
                </>
            )}

            {/* 批量结果 */}
            {batchResults.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <Title level={5}>批量搜索结果 ({batchResults.length} 成功 / {batchErrors.length} 失败)</Title>
                    {batchErrors.map((e, i) => <Alert key={i} message={e} type="error" showIcon style={{ marginBottom: 8, borderRadius: 8 }} closable />)}
                    {batchResults.map((book) => (
                        <SearchResultCard key={book.isbn} result={book} onAddToShelf={() => { setSearchResult(book); setShowShelfSelector(true); }} onViewDetail={() => navigate(`/shelf/${book.shelf_id || 1}/book/${book.book_id}`)} onCopyISBN={() => { navigator.clipboard.writeText(book.isbn); message.success('已复制'); }} isBatch />
                    ))}
                </div>
            )}

            {/* 书架选择器 */}
            <ShelfSelector visible={showShelfSelector} bookId={searchResult?.book_id || 0} bookTitle={searchResult?.title || ''}
                onClose={() => setShowShelfSelector(false)} onSuccess={() => { message.success('已添加到书架'); setShowShelfSelector(false); }} />
        </div>
    );
};

export default BookSearch;
