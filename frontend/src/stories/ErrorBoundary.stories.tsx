import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ErrorBoundary from "../components/ErrorBoundary";

const CrashComponent: React.FC = () => {
    throw new Error("模拟组件崩溃");
};

const meta: Meta<typeof ErrorBoundary> = {
    title: "Components/ErrorBoundary",
    component: ErrorBoundary,
    tags: ["autodocs"],
};
export default meta;
type Story = StoryObj<typeof ErrorBoundary>;

export const NormalRender: Story = {
    args: { children: <div style={{ padding: 20 }}>正常渲染的子组件内容</div> },
};

export const ErrorState: Story = {
    args: { children: <CrashComponent /> },
};
