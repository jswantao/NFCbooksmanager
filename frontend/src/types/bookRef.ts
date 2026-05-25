// frontend/src/types/bookRef.ts
/**
 * 图书引用系统 - 统一图书定位
 *
 * 支持两种定位方式：
 * 1. 全局 ID: 直接通过 globalBookId 定位（优先）
 * 2. 书架定位: 通过 shelfId + shelfBookIndex 定位
 */

// ==================== ID 类型 ====================

/** 全局图书 ID，格式 B-{8位hex} */
export type GlobalBookId = string;

/** 书架 ID，格式 S-{8位hex} */
export type ShelfId = string;

/** 书架内图书序号（从1开始） */
export type ShelfBookIndex = number;

// ==================== BookReference ====================

export interface BookReference {
    /** 全局图书 ID（优先使用） */
    globalBookId?: GlobalBookId;
    /** 书架 ID */
    shelfId?: ShelfId;
    /** 书架内序号 */
    shelfBookIndex?: ShelfBookIndex;
}

export type BookRefInput = GlobalBookId | BookReference;

// ==================== BookReference 工具函数 ====================

/** 检查是否为全局 ID 格式 */
export function isGlobalBookId(value: string): boolean {
    return /^B-[0-9a-f]{8}$/.test(value);
}

/** 检查是否为书架 ID 格式 */
export function isShelfId(value: string): boolean {
    return /^S-[0-9a-f]{8}$/.test(value);
}

/** 将 GlobalBookId 转为 BookReference */
export function globalRef(globalBookId: GlobalBookId): BookReference {
    return { globalBookId };
}

/** 将 shelfId + index 转为 BookReference */
export function shelfRef(shelfId: ShelfId, index: ShelfBookIndex): BookReference {
    return { shelfId, shelfBookIndex: index };
}

/** 解析 BookRefInput 为统一的 BookReference */
export function resolveBookRef(input: BookRefInput): BookReference {
    if (typeof input === 'string') {
        if (isGlobalBookId(input)) return { globalBookId: input };
        // 遗留数字 ID 也当作 globalBookId 处理
        if (/^\d+$/.test(input)) return { globalBookId: `B-${input.padStart(8, '0')}` };
        return { globalBookId: input };
    }
    return input;
}

/** BookReference 转为唯一 key（用于缓存、去重） */
export function bookRefKey(ref: BookReference): string {
    if (ref.globalBookId) return `g:${ref.globalBookId}`;
    if (ref.shelfId && ref.shelfBookIndex != null) return `s:${ref.shelfId}:${ref.shelfBookIndex}`;
    return 'unknown';
}

// ==================== 图书数据视图 ====================

export interface BookView {
    globalBookId: string;
    title: string;
    author?: string;
    isbn?: string;
    coverUrl?: string;
    publisher?: string;
    publishDate?: string;
    pages?: number;
    rating?: string;
    summary?: string;
    source: string;
    /** 书架关联信息（可为 null，表示独立图书） */
    shelfInfo: ShelfBookInfo | null;
}

export interface ShelfBookInfo {
    shelfId: string;
    shelfName: string;
    shelfBookIndex: number;
    status: 'active' | 'removed';
    addedAt: string;
}
