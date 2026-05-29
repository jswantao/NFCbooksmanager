import type { Preview } from "@storybook/react";
import "../src/index.css";

const preview: Preview = {
    parameters: {
        controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
        a11y: { config: {} },
        viewport: {
            viewports: {
                desktop: { name: "Desktop", styles: { width: "1400px", height: "900px" } },
                tablet: { name: "Tablet", styles: { width: "768px", height: "1024px" } },
                mobile: { name: "Mobile", styles: { width: "375px", height: "812px" } },
            },
        },
    },
};

export default preview;
