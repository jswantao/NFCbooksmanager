import type { Meta, StoryObj } from "@storybook/react-vite";
import ThemeSwitcher from "../components/ThemeSwitcher";

const meta: Meta<typeof ThemeSwitcher> = {
    title: "Components/ThemeSwitcher",
    component: ThemeSwitcher,
    tags: ["autodocs"],
};
export default meta;
type Story = StoryObj<typeof ThemeSwitcher>;

export const Default: Story = {};
