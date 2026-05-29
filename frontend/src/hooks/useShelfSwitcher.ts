// hooks/useShelfSwitcher.ts
// 书架切换器 Hook

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { listShelves } from "../services/api";
import type { ShelfInfo } from "../types";

export type ShelfViewMode = "dropdown" | "grid" | "sidebar";

interface UseShelfSwitcherProps {
    currentShelfId?: number;
}

interface UseShelfSwitcherReturn {
    shelves: ShelfInfo[];
    loading: boolean;
    error: string | null;
    searchText: string;
    showPanel: boolean;
    viewMode: ShelfViewMode;
    filteredShelves: ShelfInfo[];
    setSearchText: (v: string) => void;
    setShowPanel: (v: boolean) => void;
    setViewMode: (v: ShelfViewMode) => void;
    handleSelect: (shelfId: number) => void;
    refresh: () => void;
}

export function useShelfSwitcher(props: UseShelfSwitcherProps = {}): UseShelfSwitcherReturn {
    const [shelves, setShelves] = useState<ShelfInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchText, setSearchText] = useState("");
    const [showPanel, setShowPanel] = useState(false);
    const [viewMode, setViewMode] = useState<ShelfViewMode>("dropdown");

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const data = await listShelves();
            setShelves(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "加载书架失败");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const filteredShelves = useMemo(() => {
        if (!searchText.trim()) return shelves;
        const kw = searchText.toLowerCase();
        return shelves.filter((s) => s.shelf_name.toLowerCase().includes(kw));
    }, [shelves, searchText]);

    const handleSelect = useCallback((shelfId: number) => {
        setShowPanel(false);
        window.location.href = `/shelf/${shelfId}`;
    }, []);

    return {
        shelves, loading, error, searchText, showPanel, viewMode,
        filteredShelves, setSearchText, setShowPanel, setViewMode,
        handleSelect, refresh,
    };
}
