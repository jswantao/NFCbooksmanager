// hooks/useSmartEntry.ts
// 智能录入 Hook：管理 4 个 Tab 的全部状态和操作

import { useState, useCallback } from "react";

export type SmartEntryTab = "single" | "enrich" | "batch" | "chat";

interface UseSmartEntryReturn {
    activeTab: SmartEntryTab;
    // Tab 1: 单本录入
    imageFile: File | null;
    imagePreview: string | null;
    scanning: boolean;
    lookingUp: boolean;
    manualISBN: string;
    extractedISBN: string;
    formData: Record<string, string>;
    step: number;
    saving: boolean;
    scanError: string | null;
    lookupError: string | null;
    setImageFile: (f: File | null) => void;
    setImagePreview: (url: string | null) => void;
    setManualISBN: (v: string) => void;
    setExtractedISBN: (v: string) => void;
    setFormData: (d: Record<string, string>) => void;
    setScanError: (e: string | null) => void;
    setLookupError: (e: string | null) => void;
    handleScanBarcode: (file: File) => Promise<void>;
    handleLookup: (isbn: string) => Promise<void>;
    handleConfirmSave: () => Promise<void>;
    // Tab 2: 信息补全
    missingBooks: unknown[];
    enriching: boolean;
    batchEnriching: boolean;
    missingLoading: boolean;
    setMissingBooks: (b: unknown[]) => void;
    handleEnrichSingle: (bookId: number) => Promise<void>;
    handleBatchEnrich: () => Promise<void>;
    loadMissingBooks: () => Promise<void>;
    // Tab 3: 批量导入
    // Tab 4: AI 对话
    chatMessages: Array<{ role: string; content: string }>;
    chatInput: string;
    chatLoading: boolean;
    setChatInput: (v: string) => void;
    handleChatSend: () => Promise<void>;
    // Common
    setActiveTab: (t: SmartEntryTab) => void;
}

export function useSmartEntry(): UseSmartEntryReturn {
    const [activeTab, setActiveTab] = useState<SmartEntryTab>("single");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);
    const [lookingUp, setLookingUp] = useState(false);
    const [manualISBN, setManualISBN] = useState("");
    const [extractedISBN, setExtractedISBN] = useState("");
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [lookupError, setLookupError] = useState<string | null>(null);
    const [missingBooks, setMissingBooks] = useState<unknown[]>([]);
    const [enriching, setEnriching] = useState(false);
    const [batchEnriching, setBatchEnriching] = useState(false);
    const [missingLoading, setMissingLoading] = useState(false);
    const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([]);
    const [chatInput, setChatInput] = useState("");
    const [chatLoading, setChatLoading] = useState(false);

    const handleScanBarcode = useCallback(async (_file: File) => {
        setScanning(true); setScanError(null);
        try {
            // Barcode scanning logic - placeholder for actual barcode library
            const result = await new Promise<string>((resolve) => setTimeout(() => resolve(""), 500));
            setExtractedISBN(result);
        } catch {
            setScanError("条形码识别失败");
        } finally { setScanning(false); }
    }, []);

    const handleLookup = useCallback(async (isbn: string) => {
        setLookingUp(true); setLookupError(null);
        try {
            const { isbnLookup, autoFillForm } = await import("../services/api");
            const lookupResult = await isbnLookup(isbn);
            if (lookupResult) {
                const fillResult = await autoFillForm(isbn);
                setFormData(fillResult as unknown as Record<string, string>);
            }
        } catch {
            setLookupError("查询失败，请检查 ISBN 或网络");
        } finally { setLookingUp(false); }
    }, []);

    const handleConfirmSave = useCallback(async () => {
        setSaving(true);
        try {
            const { createBookManual } = await import("../services/api");
            await createBookManual({ ...formData, isbn: extractedISBN || manualISBN, source: "smart_entry" });
            setStep(2);
        } finally { setSaving(false); }
    }, [formData, extractedISBN, manualISBN]);

    const loadMissingBooks = useCallback(async () => {
        setMissingLoading(true);
        try {
            const { listMissingBooks } = await import("../services/api");
            const result = await listMissingBooks(50);
            setMissingBooks((result as unknown as { books: unknown[] })?.books ?? []);
        } finally { setMissingLoading(false); }
    }, []);

    const handleEnrichSingle = useCallback(async (bookId: number) => {
        setEnriching(true);
        try {
            const { enrichBook } = await import("../services/api");
            await enrichBook(bookId);
            await loadMissingBooks();
        } finally { setEnriching(false); }
    }, [loadMissingBooks]);

    const handleBatchEnrich = useCallback(async () => {
        setBatchEnriching(true);
        try {
            const { batchEnrichBooks } = await import("../services/api");
            const ids = (missingBooks as Array<{ book_id: number }>).map((b) => b.book_id);
            await batchEnrichBooks(ids);
            await loadMissingBooks();
        } finally { setBatchEnriching(false); }
    }, [missingBooks, loadMissingBooks]);

    const handleChatSend = useCallback(async () => {
        if (!chatInput.trim()) return;
        const userMsg = { role: "user", content: chatInput };
        setChatMessages((prev) => [...prev, userMsg]);
        setChatInput("");
        setChatLoading(true);
        try {
            const { callN8NBookAssistant } = await import("../services/api");
            const reply = await callN8NBookAssistant(chatInput);
            setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
        } catch {
            setChatMessages((prev) => [...prev, { role: "assistant", content: "抱歉，AI 助手暂时不可用" }]);
        } finally { setChatLoading(false); }
    }, [chatInput]);

    return {
        activeTab, imageFile, imagePreview, scanning, lookingUp, manualISBN, extractedISBN,
        formData, step, saving, scanError, lookupError,
        missingBooks, enriching, batchEnriching, missingLoading,
        chatMessages, chatInput, chatLoading,
        setImageFile, setImagePreview, setManualISBN, setExtractedISBN, setFormData,
        setScanError, setLookupError, setActiveTab,
        handleScanBarcode, handleLookup, handleConfirmSave,
        setMissingBooks, handleEnrichSingle, handleBatchEnrich, loadMissingBooks,
        setChatInput, handleChatSend,
    };
}
