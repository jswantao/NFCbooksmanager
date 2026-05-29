// frontend/src/hooks/useChat.ts
/**
 * 聊天消息管理 Hook
 */

import { useState, useCallback, useRef } from 'react';
import { message } from 'antd';
import { chatSearch } from '../services/api';
import type { ChatMessage, ChatSearchResultItem } from '../types';

const WELCOME_MESSAGE: ChatMessage = {
    id: 'welcome',
    role: 'assistant',
    content: '您好！我是书香助手 📚\n\n我可以帮您通过自然语言描述搜索馆藏图书，比如"日本文学的书"、"去年买的白色封面小说"。\n\n也可以帮您推荐相似图书，试试问"推荐几本类似《百年孤独》的书"吧！',
    timestamp: Date.now(),
};

const EXAMPLE_QUERIES = [
    '日本文学的书有哪些',
    '推荐几本适合睡前读的书',
    '白色封面的小说',
    '关于历史和文化的书',
    '评分最高的几本书',
];

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function useChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
    const [loading, setLoading] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const sendMessage = useCallback(async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;

        // 取消之前的请求
        abortRef.current?.abort();
        abortRef.current = new AbortController();

        const userMsg: ChatMessage = {
            id: generateId(),
            role: 'user',
            content: trimmed,
            timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setLoading(true);

        try {
            const data = await chatSearch(trimmed, 5);

            let replyContent: string;
            if (data.results.length === 0) {
                replyContent = `很抱歉，没有在馆藏中找到与「${trimmed}」匹配的图书 📭\n\n建议您：\n• 尝试用不同的关键词描述（如作者名、出版社、系列名）\n• 通过 ISBN 从豆瓣同步新书到馆藏\n• 浏览现有馆藏列表查找`;
            } else {
                replyContent = data.query_understanding + '\n\n' +
                    data.results.map((b, i) =>
                        `${i + 1}. **《${b.title}》** ${b.author ? '— ' + b.author : ''}\n   ${b.publisher || ''} | 评分: ${b.rating || '暂无'} | 匹配度: ${b.relevance_score}分\n   📍 ${b.shelf_names.length > 0 ? b.shelf_names.join('、') : '未上架'}${b.summary ? '\n   📝 ' + b.summary : ''}`
                    ).join('\n\n');
            }

            const assistantMsg: ChatMessage = {
                id: generateId(),
                role: 'assistant',
                content: replyContent,
                timestamp: Date.now(),
                books: data.results,
            };

            setMessages((prev) => [...prev, assistantMsg]);
        } catch (err: any) {
            if (err?.name === 'CanceledError' || err?.name === 'AbortError') return;
            const assistantMsg: ChatMessage = {
                id: generateId(),
                role: 'assistant',
                content: '抱歉，搜索时遇到了问题 😥\n请稍后重试，或检查后端服务是否正常运行。',
                timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
            message.error({ content: '搜索失败，请重试', key: 'chat-error' });
        } finally {
            setLoading(false);
        }
    }, []);

    const clearMessages = useCallback(() => {
        setMessages([WELCOME_MESSAGE]);
    }, []);

    return {
        messages,
        loading,
        sendMessage,
        clearMessages,
        exampleQueries: EXAMPLE_QUERIES,
    };
}
