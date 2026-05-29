// hooks/useResponsiveColumns.ts
// 响应式列数计算 Hook

import { useState, useEffect, useCallback } from "react";

export function useResponsiveColumns(defaultCols: number = 6): number {
    const [columns, setColumns] = useState(defaultCols);

    const getColumnCount = useCallback((width: number): number => {
        if (width >= 1600) return 8;
        if (width >= 1200) return 6;
        if (width >= 900) return 4;
        if (width >= 600) return 3;
        return 2;
    }, []);

    useEffect(() => {
        const handleResize = () => {
            setColumns(getColumnCount(window.innerWidth));
        };

        let timer: ReturnType<typeof setTimeout>;
        const debouncedResize = () => {
            clearTimeout(timer);
            timer = setTimeout(handleResize, 150);
        };

        handleResize();
        window.addEventListener("resize", debouncedResize);
        return () => {
            window.removeEventListener("resize", debouncedResize);
            clearTimeout(timer);
        };
    }, [getColumnCount]);

    return columns;
}
