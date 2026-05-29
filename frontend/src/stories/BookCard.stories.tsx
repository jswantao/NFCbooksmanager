import type { Meta, StoryObj } from "@storybook/react";
import BookCard from "../components/BookCard";

const meta: Meta<typeof BookCard> = {
    title: "Components/BookCard",
    component: BookCard,
    tags: ["autodocs"],
};
export default meta;
type Story = StoryObj<typeof BookCard>;

const sampleBook = {
    book_id: 1,
    isbn: "9787544291163",
    title: "三体",
    author: "刘慈欣",
    publisher: "重庆出版社",
    cover_url: "https://img1.doubanio.com/view/subject/l/public/s2768378.jpg",
    rating: "9.3",
    source: "douban" as const,
    sort_order: 0,
    shelf_name: "中国文学经典",
};

export const Default: Story = { args: { book: sampleBook, showActions: true } };

export const NoCover: Story = {
    args: {
        book: { ...sampleBook, cover_url: "", title: "无封面图书" },
        showActions: true,
    },
};

export const NoActions: Story = {
    args: { book: sampleBook, showActions: false },
};

export const LongTitle: Story = {
    args: {
        book: {
            ...sampleBook,
            title: "这是一本名字非常长的图书标题用来测试卡片组件对超长文本的截断处理效果",
        },
        showActions: true,
    },
};
