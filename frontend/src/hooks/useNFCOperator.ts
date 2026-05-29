// hooks/useNFCOperator.ts
// NFC 操作页核心 Hook：操作历史 + NFC状态 + 网络地址 + 书架操作

import { useState, useEffect, useCallback } from "react";
import { writeNFCTag, getNFCTasks, deleteNFCTask, getNFCMobileUrl, listShelves } from "../services/api";
import type { NFCWriteTask, ShelfInfo } from "../types";

const HISTORY_MAX = 20;
const PIN_KEY = "nfc_operator_pin";
const TOUR_KEY = "nfc_tour_completed";

export interface NFCHistoryEntry {
    id: string;
    type: "write" | "read" | "bind" | "unbind";
    message: string;
    timestamp: string;
    success: boolean;
}

export interface UseNFCOperatorReturn {
    history: NFCHistoryEntry[];
    filterType: string;
    shelfInfo: ShelfInfo | null;
    loading: boolean;
    error: string | null;
    localIP: string;
    pin: string;
    pinError: string;
    selectedShelfId: number | null;
    selectedShelfName: string;
    tourOpen: boolean;
    tourStep: number;
    tasks: NFCWriteTask[];
    tasksLoading: boolean;
    setFilterType: (v: string) => void;
    setPin: (v: string) => void;
    setSelectedShelfId: (v: number | null) => void;
    setSelectedShelfName: (v: string) => void;
    setTourOpen: (v: boolean) => void;
    setTourStep: (v: number) => void;
    addHistoryEntry: (entry: Omit<NFCHistoryEntry, "id" | "timestamp">) => void;
    clearHistory: () => void;
    handleWriteTag: () => Promise<void>;
    handleDeleteTask: (taskId: string) => Promise<void>;
    handleVerifyPin: () => boolean;
    handleScanCallback: () => void;
    loadTasks: () => Promise<void>;
    refreshShelf: () => Promise<void>;
}

export function useNFCOperator(): UseNFCOperatorReturn {
    const [history, setHistory] = useState<NFCHistoryEntry[]>([]);
    const [filterType, setFilterType] = useState("all");
    const [shelfInfo, setShelfInfo] = useState<ShelfInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [localIP, setLocalIP] = useState("");
    const [pin, setPin] = useState(() => localStorage.getItem(PIN_KEY) || "0000");
    const [pinError, setPinError] = useState("");
    const [selectedShelfId, setSelectedShelfId] = useState<number | null>(null);
    const [selectedShelfName, setSelectedShelfName] = useState("");
    const [tourOpen, setTourOpen] = useState(() => !localStorage.getItem(TOUR_KEY));
    const [tourStep, setTourStep] = useState(0);
    const [tasks, setTasks] = useState<NFCWriteTask[]>([]);
    const [tasksLoading, setTasksLoading] = useState(false);

    useEffect(() => {
        try {
            const hostname = window.location.hostname;
            setLocalIP(hostname === "localhost" ? "127.0.0.1" : hostname);
        } catch { setLocalIP("127.0.0.1"); }
    }, []);

    const addHistoryEntry = useCallback((entry: Omit<NFCHistoryEntry, "id" | "timestamp">) => {
        const newEntry: NFCHistoryEntry = {
            ...entry,
            id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
            timestamp: new Date().toLocaleTimeString(),
        };
        setHistory((prev) => [newEntry, ...prev].slice(0, HISTORY_MAX));
    }, []);

    const clearHistory = useCallback(() => setHistory([]), []);

    const handleWriteTag = useCallback(async () => {
        if (!selectedShelfId) return;
        setLoading(true); setError(null);
        try {
            const task = await writeNFCTag(selectedShelfId);
            addHistoryEntry({ type: "write", message: `写入任务已创建: ${selectedShelfName}`, success: true });
            await loadTasks();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "写入失败";
            setError(msg);
            addHistoryEntry({ type: "write", message: `写入失败: ${msg}`, success: false });
        } finally { setLoading(false); }
    }, [selectedShelfId, selectedShelfName, addHistoryEntry]);

    const loadTasks = useCallback(async () => {
        setTasksLoading(true);
        try { setTasks(await getNFCTasks()); } catch { /* silent */ }
        finally { setTasksLoading(false); }
    }, []);

    const handleDeleteTask = useCallback(async (taskId: string) => {
        try {
            await deleteNFCTask(taskId);
            setTasks((prev) => prev.filter((t) => t.task_id !== taskId));
            addHistoryEntry({ type: "write", message: "写入任务已取消", success: true });
        } catch { /* silent */ }
    }, [addHistoryEntry]);

    const handleVerifyPin = useCallback((): boolean => {
        if (!pin || pin.length < 4) {
            setPinError("PIN 码至少 4 位");
            return false;
        }
        localStorage.setItem(PIN_KEY, pin);
        setPinError("");
        return true;
    }, [pin]);

    const handleScanCallback = useCallback(() => {
        addHistoryEntry({ type: "read", message: "NFC 扫描已触发，等待手机端响应", success: true });
    }, [addHistoryEntry]);

    const refreshShelf = useCallback(async () => {
        try {
            const shelves = await listShelves();
            if (selectedShelfId) {
                const s = shelves.find((sh) => sh.logical_shelf_id === selectedShelfId);
                if (s) setShelfInfo(s);
            }
        } catch { /* silent */ }
    }, [selectedShelfId]);

    useEffect(() => { loadTasks(); }, [loadTasks]);

    return {
        history, filterType, shelfInfo, loading, error, localIP, pin, pinError,
        selectedShelfId, selectedShelfName, tourOpen, tourStep, tasks, tasksLoading,
        setFilterType, setPin, setSelectedShelfId, setSelectedShelfName,
        setTourOpen, setTourStep,
        addHistoryEntry, clearHistory, handleWriteTag, handleDeleteTask,
        handleVerifyPin, handleScanCallback, loadTasks, refreshShelf,
    };
}
