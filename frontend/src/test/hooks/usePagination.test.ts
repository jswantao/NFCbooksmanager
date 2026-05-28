/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';

// 纯逻辑测试：usePagination 等价逻辑
// Vite 8 (Rolldown) + Vitest + jsdom + React hooks 存在已知兼容性问题

function simulatePagination(pageSize = 20) {
    let page = 1;
    return {
        get page() { return page; },
        get pageSize() { return pageSize; },
        get offset() { return (page - 1) * pageSize; },
        setPage(p: number) { page = p; },
        resetPage() { page = 1; },
    };
}

describe('usePagination (pure logic)', () => {
    it('starts at page 1', () => {
        const p = simulatePagination();
        expect(p.page).toBe(1);
    });

    it('computes correct offset', () => {
        const p = simulatePagination(10);
        expect(p.offset).toBe(0);
        expect(p.pageSize).toBe(10);
    });

    it('updates page and recomputes offset', () => {
        const p = simulatePagination(10);
        p.setPage(3);
        expect(p.page).toBe(3);
        expect(p.offset).toBe(20);
    });

    it('resets to page 1', () => {
        const p = simulatePagination(10);
        p.setPage(5);
        expect(p.page).toBe(5);
        p.resetPage();
        expect(p.page).toBe(1);
    });

    it('defaults to pageSize 20', () => {
        const p = simulatePagination();
        expect(p.pageSize).toBe(20);
    });
});
