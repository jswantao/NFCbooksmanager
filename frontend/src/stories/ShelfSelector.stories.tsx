import type { Meta, StoryObj } from "@storybook/react-vite";
import ShelfSelector from "../components/ShelfSelector";

const meta: Meta<typeof ShelfSelector> = {
    title: "Components/ShelfSelector",
    component: ShelfSelector,
    tags: ["autodocs"],
};
export default meta;
type Story = StoryObj<typeof ShelfSelector>;

export const Default: Story = {
    args: {
        value: undefined,
        onChange: () => {},
        placeholder: "选择书架（可选）",
    },
};

export const WithDefaultValue: Story = {
    args: {
        value: 1,
        onChange: () => {},
    },
};
