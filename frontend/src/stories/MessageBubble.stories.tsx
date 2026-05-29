import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import Markdown from "../components/Markdown";

const Bubble: React.FC<{ role: "user" | "assistant"; content: string }> = ({ role, content }) => {
    const isUser = role === "user";
    return (
        <div style={{ display: "flex", gap: 10, flexDirection: isUser ? "row-reverse" : "row" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: isUser ? "#f0e8d8" : "#e8f0e3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                {isUser ? "U" : "A"}
            </div>
            <div style={{ maxWidth: "82%", padding: "12px 16px", borderRadius: 18, borderBottomLeftRadius: isUser ? 18 : 6, borderBottomRightRadius: isUser ? 6 : 18, background: isUser ? "#4a6741" : "#f0f4ed", color: isUser ? "#fff" : "#2c3e1f", fontSize: 14, lineHeight: 1.7, wordBreak: "break-word" }}>
                {isUser ? content : <Markdown content={content} isAssistant />}
            </div>
        </div>
    );
};

const meta: Meta<typeof Bubble> = { title: "Components/MessageBubble", component: Bubble, tags: ["autodocs"] };
export default meta;
type Story = StoryObj<typeof Bubble>;

export const AssistantSimple: Story = { args: { role: "assistant", content: "您好！我是书房智能助手。" } };

export const AssistantMarkdown: Story = {
    args: {
        role: "assistant",
        content: "📚 找到 **3** 本相关图书\n\n**1. 《三体》**\n✍️ 刘慈欣 | ⭐ 9.3\n\n**2. 《流浪地球》**\n✍️ 刘慈欣 | ⭐ 8.5",
    },
};

export const UserMessage: Story = { args: { role: "user", content: "有没有关于科幻的小说？" } };

export const LongAssistantReply: Story = {
    args: {
        role: "assistant",
        content: `📊 找到 **15** 本信息不完整的图书：

| # | 书名 | 完整度 | 缺失字段 |
|---|------|--------|----------|
| 1 | 寻鲸记 | 45% | 作者, 简介 |
| 2 | 食草之徒 | 50% | 作者, 简介 |

💡 告诉我你想补全哪本书`,
    },
};
