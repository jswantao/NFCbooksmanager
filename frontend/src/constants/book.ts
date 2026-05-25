/**
 * 图书相关常量定义
 *
 * 提取自 BookDetail.tsx, AllBooksManager.tsx,
 * BookManualAdd.tsx, BookManualEdit.tsx 中重复定义的同名配置。
 */

/** 图书来源标签映射 */
export const SOURCE_TAG_CONFIG: Record<string, { color: string; label: string }> = {
    douban: { color: 'green', label: '豆瓣' },
    manual: { color: 'orange', label: '手动' },
    isbn: { color: 'blue', label: 'ISBN' },
    nfc: { color: 'purple', label: 'NFC' },
};

/** 图书来源详情展示配置（标签更长） */
export const SOURCE_DETAIL_CONFIG: Record<string, { color: string; label: string }> = {
    douban: { color: 'green', label: '豆瓣同步' },
    manual: { color: 'orange', label: '手动录入' },
    isbn: { color: 'blue', label: 'ISBN 导入' },
    nfc: { color: 'purple', label: 'NFC 录入' },
};

/** 装订方式选项 */
export const BINDING_OPTIONS = [
    { value: 'paperback', label: '平装' },
    { value: 'hardcover', label: '精装' },
    { value: 'leather', label: '皮面' },
    { value: 'thread', label: '线装' },
    { value: 'loose-leaf', label: '活页' },
    { value: 'spiral', label: '螺旋' },
    { value: 'unknown', label: '未知' },
] as const;

/** 默认排序选项 */
export const SORT_OPTIONS = {
    added_desc: { field: 'added_at', order: 'desc', label: '最近添加' },
    added_asc: { field: 'added_at', order: 'asc', label: '最早添加' },
    title_asc: { field: 'title', order: 'asc', label: '书名 A-Z' },
    title_desc: { field: 'title', order: 'desc', label: '书名 Z-A' },
    rating_desc: { field: 'rating', order: 'desc', label: '评分最高' },
    rating_asc: { field: 'rating', order: 'asc', label: '评分最低' },
} as const;
