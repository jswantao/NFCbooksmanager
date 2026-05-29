// hooks/useBookAddWizard.ts
// 手动录入向导 Hook：步骤管理 + 表单提交

import { useState, useCallback, useEffect, useRef } from "react";
import { createBookManual, listShelves } from "../services/api";
import type { FormInstance } from "antd";

export interface BookFormData {
    isbn: string;
    title: string;
    author: string;
    translator: string;
    publisher: string;
    publish_date: string;
    cover_url: string;
    summary: string;
    pages: number | null;
    price: string;
    binding: string;
    rating: string;
    original_title: string;
    series: string;
    douban_url: string;
    shelf_id?: number;
}

export interface ShelfOption {
    value: number;
    label: string;
    count: number;
}

export type AddStep = 0 | 1 | 2;

interface UseBookAddWizardReturn {
    currentStep: AddStep;
    formSnapshot: BookFormData | null;
    createdResult: { success: boolean; data?: { book_id?: number } } | null;
    isSubmitting: boolean;
    shelfOptions: ShelfOption[];
    shelfLoading: boolean;
    goToPreview: (data: BookFormData) => void;
    goToEdit: () => void;
    goToComplete: (result: { success: boolean; data?: { book_id?: number } }) => void;
    resetSteps: () => void;
    handleSubmit: (data: BookFormData) => Promise<void>;
    loadShelves: () => Promise<void>;
}

export function useBookAddWizard(): UseBookAddWizardReturn {
    const [currentStep, setCurrentStep] = useState<AddStep>(0);
    const [formSnapshot, setFormSnapshot] = useState<BookFormData | null>(null);
    const [createdResult, setCreatedResult] = useState<{ success: boolean; data?: { book_id?: number } } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [shelfOptions, setShelfOptions] = useState<ShelfOption[]>([]);
    const [shelfLoading, setShelfLoading] = useState(false);

    const goToPreview = useCallback((data: BookFormData) => {
        setFormSnapshot(data);
        setCurrentStep(1);
    }, []);

    const goToEdit = useCallback(() => setCurrentStep(0), []);

    const goToComplete = useCallback((result: { success: boolean; data?: { book_id?: number } }) => {
        setCreatedResult(result);
        setCurrentStep(2);
    }, []);

    const resetSteps = useCallback(() => {
        setCurrentStep(0);
        setFormSnapshot(null);
        setCreatedResult(null);
    }, []);

    const loadShelves = useCallback(async () => {
        setShelfLoading(true);
        try {
            const data = await listShelves();
            setShelfOptions(
                (data || []).map((s: Record<string, unknown>) => ({
                    value: s.logical_shelf_id as number,
                    label: s.shelf_name as string,
                    count: (s.book_count as number) ?? 0,
                }))
            );
        } catch {
            // silent
        } finally {
            setShelfLoading(false);
        }
    }, []);

    const handleSubmit = useCallback(async (data: BookFormData) => {
        const isbn = data.isbn.replace(/[-\s]/g, "");
        if (!isbn) throw new Error("ISBN 不能为空");
        if (!data.title) throw new Error("书名不能为空");

        setIsSubmitting(true);
        try {
            const body: Record<string, unknown> = {
                isbn,
                title: data.title,
                author: data.author || undefined,
                translator: data.translator || undefined,
                publisher: data.publisher || undefined,
                publish_date: data.publish_date || undefined,
                cover_url: data.cover_url || undefined,
                summary: data.summary || undefined,
                pages: data.pages || undefined,
                price: data.price || undefined,
                binding: data.binding || "平装",
                rating: data.rating || undefined,
                original_title: data.original_title || undefined,
                series: data.series || undefined,
                douban_url: data.douban_url || undefined,
                shelf_id: data.shelf_id || undefined,
                source: "manual",
            };
            const result = await createBookManual(body);
            goToComplete({ success: true, data: { book_id: (result as Record<string, unknown>).book_id as number } });
        } catch (err) {
            goToComplete({ success: false });
            throw err;
        } finally {
            setIsSubmitting(false);
        }
    }, [goToComplete]);

    return {
        currentStep, formSnapshot, createdResult, isSubmitting,
        shelfOptions, shelfLoading,
        goToPreview, goToEdit, goToComplete, resetSteps,
        handleSubmit, loadShelves,
    };
}
