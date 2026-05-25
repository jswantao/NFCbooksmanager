// frontend/src/hooks/useAllBooksOperations.ts
/**
 * useAllBooksOperations - 全部图书管理操作 Hook（纯逻辑，无 JSX）
 *
 * 返回操作处理函数和配置数据。
 * Modal.confirm 等 UI 渲染由调用方 AllBooksManager 组件负责。
 */

import { useState, useCallback } from 'react';
import { message } from 'antd';
import { deleteBook } from '../services/api';
import type { BookItem } from '../types';

export interface BatchDeleteConfig {
    count: number;
    onExecute: () => void;
}

export function useAllBooksOperations(
    books: BookItem[],
    setBooks: React.Dispatch<React.SetStateAction<BookItem[]>>,
    loadBooks: () => Promise<void>,
) {
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const handleDelete = useCallback(async (record: BookItem) => {
        setDeletingId(record.book_id);
        try {
            await deleteBook(record.book_id);
            message.success(`《${record.title}》已删除`);
            setBooks(prev => prev.filter(b => b.book_id !== record.book_id));
        } catch (err: any) {
            message.error(err?.response?.data?.detail || '删除失败');
        } finally {
            setDeletingId(null);
            loadBooks();
        }
    }, [loadBooks, setBooks]);

    /** 执行批量删除（调用方负责先弹出确认框） */
    const executeBatchDelete = useCallback(async () => {
        let successCount = 0;
        let failCount = 0;

        const hide = message.loading(`正在删除 ${selectedRowKeys.length} 本图书...`, 0);

        const promises = selectedRowKeys.map(async (id) => {
            try {
                await deleteBook(Number(id));
                successCount++;
            } catch {
                failCount++;
            }
        });

        await Promise.all(promises);
        hide();

        if (failCount === 0) {
            message.success(`成功删除 ${successCount} 本图书`);
        } else if (successCount === 0) {
            message.error('所有图书删除失败');
        } else {
            message.warning(`删除完成：成功 ${successCount} 本，失败 ${failCount} 本`);
        }

        setSelectedRowKeys([]);
        loadBooks();
    }, [selectedRowKeys, loadBooks]);

    /** 返回批量删除配置（供组件在 Modal 中使用） */
    const getBatchDeleteConfig = useCallback((): BatchDeleteConfig | null => {
        if (selectedRowKeys.length === 0) return null;
        return {
            count: selectedRowKeys.length,
            onExecute: executeBatchDelete,
        };
    }, [selectedRowKeys.length, executeBatchDelete]);

    const handleExport = useCallback(() => {
        const exportData = selectedRowKeys.length > 0
            ? books.filter(b => selectedRowKeys.includes(b.book_id))
            : books;

        const csv = [
            ['书名', 'ISBN', '作者', '出版社', '来源', '评分', '所在书架'].join(','),
            ...exportData.map(b =>
                [b.title, b.isbn, b.author || '', b.publisher || '', b.source, b.rating || '', b.shelf_name || '']
                    .map(v => `"${String(v).replace(/"/g, '""')}"`)
                    .join(',')
            ),
        ].join('\n');

        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `books_export_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        message.success('导出成功');
    }, [books, selectedRowKeys]);

    return {
        selectedRowKeys,
        setSelectedRowKeys,
        deletingId,
        handleDelete,
        getBatchDeleteConfig,
        handleExport,
    };
}
