// frontend/src/pages/ChatAssistant.tsx
/**
 * AI 书香助手 — n8n Webhook 驱动的智能图书搜索与推荐
 *
 * 替代原 Dify iframe 嵌入，通过 n8n 工作流编排后端搜索 API，
 * 实现自然语言搜索、相似推荐、馆藏详情查询。
 */

import React, { useState, useCallback, useRef, useEffect, type FC } from 'react';
import { Typography, Breadcrumb, Card, Tag, Row, Col, Input, Button, theme, Alert, Spin } from 'antd';
import {
    RobotOutlined,
    HomeOutlined,
    SearchOutlined,
    CompassOutlined,
    ReadOutlined,
    SendOutlined,
    UserOutlined,
    LoadingOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import Markdown from '../components/Markdown';
import { extractErrorMessage } from '../services/api';

const { Title, Text, Paragraph } = Typography;

// ==================== n8n Webhook 配置 ====================

const N8N_BOOK_ASSISTANT_URL =
    (import.meta as any).env?.VITE_N8N_BOOK_ASSISTANT_URL ||
    'http://localhost:5678/webhook/smart-book-assistant';

// ==================== 常量 ====================

const CAPABILITIES = [
    { key: 'search', icon: <SearchOutlined />, label: '智能搜索', desc: '用自然语言描述你想找的书，支持主题、时间、外观等模糊描述' },
    { key: 'recommend', icon: <CompassOutlined />, label: '相似推荐', desc: '基于作者、出版社、系列推荐馆藏中的相似好书' },
    { key: 'locate', icon: <ReadOutlined />, label: '馆藏查询', desc: '快速了解图书的详细信息、评分和在哪个书架上' },
];

const EXAMPLE_QUERIES = [
    '有没有关于科幻的小说？',
    '推荐类似《三体》的书',
    '最近买了哪些书？',
    '评分最高的书有哪些？',
];

const WELCOME_MESSAGE = `您好！我是书房智能助手 📚

我可以帮您：
🔍 **智能搜索** — 用自然语言描述找书
🔗 **相似推荐** — 基于作者、出版社推荐好书
📖 **馆藏查询** — 查看图书信息和所在书架

有什么可以帮您的？`;

// ==================== 类型 ====================

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

/** 获取或生成 session ID */
function getSessionId(): string {
    let id = localStorage.getItem('chat_session_id');
    if (!id) {
        id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem('chat_session_id', id);
    }
    return id;
}

// ==================== 子组件: 输入区域 ====================

const ChatInput: FC<{
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    loading: boolean;
}> = ({ value, onChange, onSend, loading }) => {
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
            }
        },
        [onSend],
    );

    return (
        <div style={{ display: 'flex', gap: 10, padding: '14px 18px', borderTop: '1px solid #f0f0f0', background: '#fff' }}>
            <Input.TextArea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入你的问题，如：有没有关于科幻的小说？"
                autoSize={{ minRows: 1, maxRows: 4 }}
                disabled={loading}
                style={{ borderRadius: 20, resize: 'none' }}
            />
            <Button
                type="primary"
                shape="circle"
                icon={loading ? <LoadingOutlined /> : <SendOutlined />}
                onClick={onSend}
                loading={loading}
                disabled={!value.trim()}
                style={{
                    flexShrink: 0,
                    background: 'linear-gradient(135deg, #4a6741, #6b8f5e)',
                    border: 'none',
                }}
            />
        </div>
    );
};

// ==================== 子组件: 消息气泡 ====================

const MessageBubble: FC<{ msg: ChatMessage }> = React.memo(({ msg }) => {
    const isUser = msg.role === 'user';
    return (
        <div
            style={{
                display: 'flex',
                gap: 10,
                flexDirection: isUser ? 'row-reverse' : 'row',
                animation: 'msgFadeIn 0.3s ease',
            }}
        >
            <div
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: isUser ? '#f0e8d8' : '#e8f0e3',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    flexShrink: 0,
                }}
            >
                {isUser ? <UserOutlined /> : <RobotOutlined />}
            </div>
            <div
                style={{
                    maxWidth: '82%',
                    padding: '12px 16px',
                    borderRadius: 18,
                    borderBottomLeftRadius: isUser ? 18 : 6,
                    borderBottomRightRadius: isUser ? 6 : 18,
                    background: isUser ? '#4a6741' : '#f0f4ed',
                    color: isUser ? '#fff' : '#2c3e1f',
                    fontSize: 14,
                    lineHeight: 1.7,
                    wordBreak: 'break-word',
                }}
            >
                {!isUser ? <Markdown content={msg.content} isAssistant /> : msg.content}
            </div>
        </div>
    );
});
MessageBubble.displayName = 'MessageBubble';

// ==================== 主组件 ====================

const ChatAssistant: FC = () => {
    const navigate = useNavigate();
    const { token } = theme.useToken();

    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: WELCOME_MESSAGE,
            timestamp: Date.now(),
        },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeCaps, setActiveCaps] = useState<Set<string>>(new Set());

    const msgListRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<any>(null);

    // 自动滚动
    useEffect(() => {
        if (msgListRef.current) {
            msgListRef.current.scrollTop = msgListRef.current.scrollHeight;
        }
    }, [messages]);

    const toggleCap = useCallback((key: string) => {
        setActiveCaps((prev) => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    }, []);

    const handleSend = useCallback(async () => {
        const query = input.trim();
        if (!query || loading) return;

        const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: query, timestamp: Date.now() };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(N8N_BOOK_ASSISTANT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, sessionId: getSessionId() }),
            });
            if (!response.ok) {
                throw new Error(`n8n 响应异常 (${response.status})`);
            }
            const text = await response.text();
            if (!text) {
                throw new Error('n8n 返回空响应');
            }
            const data = JSON.parse(text);
            const reply = (Array.isArray(data) ? data[0]?.output : data?.reply) || data?.output || '抱歉，无法解析回复内容。';
            setMessages((prev) => [
                ...prev,
                { id: `a-${Date.now()}`, role: 'assistant', content: reply, timestamp: Date.now() },
            ]);
        } catch (err) {
            const msg = extractErrorMessage(err) || '连接助手服务失败，请检查网络后重试。';
            setError(msg);
            setMessages((prev) => [
                ...prev,
                { id: `e-${Date.now()}`, role: 'assistant', content: `抱歉，${msg}`, timestamp: Date.now() },
            ]);
        } finally {
            setLoading(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [input, loading]);

    const handleSuggestionClick = useCallback((q: string) => {
        setInput(q);
        setTimeout(() => {
            setInput('');
            const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: q, timestamp: Date.now() };
            setMessages((prev) => [...prev, userMsg]);
            setLoading(true);
            setError(null);
            fetch(N8N_BOOK_ASSISTANT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q, sessionId: getSessionId() }),
            })
                .then(async (r) => {
                    if (!r.ok) throw new Error(`n8n ${r.status}`);
                    const t = await r.text();
                    if (!t) throw new Error('n8n empty');
                    return JSON.parse(t);
                })
                .then((data) => {
                    setMessages((prev) => [
                        ...prev,
                        { id: `a-${Date.now()}`, role: 'assistant', content: (Array.isArray(data) ? data[0]?.output : data?.reply) || data?.output || '抱歉，请稍后重试。', timestamp: Date.now() },
                    ]);
                })
                .catch((err) => {
                    setMessages((prev) => [
                        ...prev,
                        { id: `e-${Date.now()}`, role: 'assistant', content: `抱歉，${extractErrorMessage(err) || '连接失败'}`, timestamp: Date.now() },
                    ]);
                })
                .finally(() => setLoading(false));
        }, 50);
    }, []);

    return (
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
            <Breadcrumb
                style={{ marginBottom: 16 }}
                items={[
                    { title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> },
                    { title: 'AI 助手' },
                ]}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <div
                    style={{
                        width: 48,
                        height: 48,
                        borderRadius: 14,
                        background: 'linear-gradient(135deg, #4a6741, #6b8f5e)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(74, 103, 65, 0.35)',
                    }}
                >
                    <RobotOutlined style={{ fontSize: 26, color: '#fff' }} />
                </div>
                <div>
                    <Title level={3} style={{ margin: 0 }}>
                        书房智能助手
                    </Title>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                        n8n 智能编排 · 帮您搜索和推荐藏书
                    </Text>
                </div>
            </div>

            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                {CAPABILITIES.map((cap) => (
                    <Col xs={24} sm={8} key={cap.key}>
                        <div
                            onClick={() => toggleCap(cap.key)}
                            style={{
                                padding: '14px 16px',
                                borderRadius: 14,
                                cursor: 'pointer',
                                border: `1px solid ${activeCaps.has(cap.key) ? '#4a6741' : token.colorBorderSecondary}`,
                                background: activeCaps.has(cap.key) ? '#f0f4ed' : token.colorBgContainer,
                                transition: 'all 0.25s ease',
                            }}
                        >
                            <div style={{ fontSize: 20, color: '#4a6741', marginBottom: 4 }}>{cap.icon}</div>
                            <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 2 }}>{cap.label}</Text>
                            <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.4 }}>{cap.desc}</Text>
                        </div>
                    </Col>
                ))}
            </Row>

            {/* 聊天区域 */}
            <Card
                style={{
                    borderRadius: 20,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    boxShadow: `0 2px 16px ${token.colorPrimary}08`,
                    overflow: 'hidden',
                }}
                styles={{ body: { padding: 0 } }}
            >
                <div
                    ref={msgListRef}
                    style={{
                        height: 380,
                        overflow: 'auto',
                        padding: '16px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                    }}
                >
                    {messages.map((msg) => (
                        <MessageBubble key={msg.id} msg={msg} />
                    ))}

                    {loading && (
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <div
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: '50%',
                                    background: '#e8f0e3',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 18,
                                }}
                            >
                                <RobotOutlined />
                            </div>
                            <div style={{ display: 'flex', gap: 6, padding: '8px 0' }}>
                                {[0, 1, 2].map((i) => (
                                    <span
                                        key={i}
                                        style={{
                                            width: 8,
                                            height: 8,
                                            background: '#b8c9a8',
                                            borderRadius: '50%',
                                            animation: `n8nTyping 1.4s ${i * 0.2}s infinite ease-in-out`,
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* 建议标签 */}
                {messages.length <= 1 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 18px 8px' }}>
                        {EXAMPLE_QUERIES.map((q) => (
                            <Tag
                                key={q}
                                style={{
                                    cursor: 'pointer',
                                    borderRadius: 16,
                                    padding: '4px 14px',
                                    fontSize: 12,
                                    border: '1px solid #d4c9b8',
                                    background: '#fff',
                                    color: '#5a4a3a',
                                    transition: 'all 0.2s',
                                }}
                                onClick={() => handleSuggestionClick(q)}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = '#4a6741';
                                    e.currentTarget.style.color = '#fff';
                                    e.currentTarget.style.borderColor = '#4a6741';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = '#fff';
                                    e.currentTarget.style.color = '#5a4a3a';
                                    e.currentTarget.style.borderColor = '#d4c9b8';
                                }}
                            >
                                {q}
                            </Tag>
                        ))}
                    </div>
                )}

                <ChatInput value={input} onChange={setInput} onSend={handleSend} loading={loading} />

                {error && (
                    <Alert
                        message={error}
                        type="warning"
                        showIcon
                        closable
                        onClose={() => setError(null)}
                        style={{ margin: '0 18px 12px', borderRadius: 8 }}
                    />
                )}
            </Card>

            {/* CSS 动画 */}
            <style>{`
                @keyframes msgFadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes n8nTyping {
                    0%, 60%, 100% { transform: translateY(0); }
                    30% { transform: translateY(-8px); }
                }
            `}</style>
        </div>
    );
};

export default ChatAssistant;
