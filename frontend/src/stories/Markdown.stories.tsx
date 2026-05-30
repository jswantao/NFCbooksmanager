import type { Meta, StoryObj } from "@storybook/react-vite";
import Markdown from "../components/Markdown";

const meta: Meta<typeof Markdown> = { title: "Components/Markdown", component: Markdown, tags: ["autodocs"] };
export default meta;
type Story = StoryObj<typeof Markdown>;

export const AllFormats: Story = {
    args: {
        content: `# 一级标题

## 二级标题

这是**粗体**和*斜体*文本。

- 无序列表项 1
- 无序列表项 2
  1. 有序子项

> 这是一段引用文字

| 书名 | 作者 | 评分 |
|------|------|------|
| 三体 | 刘慈欣 | 9.3 |
| 活着 | 余华 | 9.1 |

行内代码: \`const x = 1\`

[链接示例](https://example.com)
`,
        isAssistant: true,
    },
};

export const SimpleReply: Story = {
    args: { content: "这是一条简单的纯文本回复。", isAssistant: true },
};

export const WithTableOnly: Story = {
    args: {
        content: `| 字段 | 值 |
|------|-----|
| 书名 | 三体 |
| 作者 | 刘慈欣 |`,
        isAssistant: true,
    },
};
