// services/api/chatApi.ts
// AI 助手 / n8n 对话相关 API 函数

import apiClient, { unwrap } from "./client";
import type { ChatSearchResult, ChatBookDetailResult } from "../../types";

// ==================== 后端 Chat API ====================

export const chatSearch = (query: string): Promise<ChatSearchResult> =>
    apiClient.post("/chat/search", { query }).then(unwrap);

export const chatGetBookDetail = (bookId: number): Promise<ChatBookDetailResult> =>
    apiClient.get(`/chat/book/${bookId}`).then(unwrap);

// ==================== n8n Webhook 调用 ====================

const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_BOOK_ENTRY_URL || "http://localhost:5678/webhook/book-entry";
const N8N_BOOK_ASSISTANT_URL = import.meta.env.VITE_N8N_BOOK_ASSISTANT_URL || "http://localhost:5678/webhook/smart-book-assistant";

function extractN8NReply(raw: unknown): string {
    if (Array.isArray(raw) && raw.length > 0 && (raw[0] as Record<string, unknown>)?.output) {
        return String((raw[0] as Record<string, unknown>).output);
    }
    if (raw && typeof raw === "object" && "reply" in (raw as Record<string, unknown>)) {
        return String((raw as Record<string, unknown>).reply);
    }
    if (typeof raw === "string") {
        return raw;
    }
    throw new Error("Cannot parse n8n response format");
}

export const callN8NSmartEntry = async (userQuery: string, imageUrl: string = ""): Promise<string> => {
    const response = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userQuery, image_url: imageUrl }),
    });
    if (!response.ok) throw new Error(`n8n webhook error: ${response.status}`);
    return extractN8NReply(await response.json());
};

export const callN8NBookAssistant = async (query: string, sessionId?: string): Promise<string> => {
    const sid = sessionId || localStorage.getItem("chat_session_id") || "";
    const response = await fetch(N8N_BOOK_ASSISTANT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, sessionId: sid }),
    });
    if (!response.ok) throw new Error(`n8n webhook error: ${response.status}`);
    return extractN8NReply(await response.json());
};
