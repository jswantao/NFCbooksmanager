// frontend/src/types/index.ts
/**
 * TypeScript 类型定义 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 更完整的类型定义
 * - 泛型工具类型
 * - 请求/响应严格类型
 * - 组件 Props 类型
 * - 枚举替代字符串联合类型
 */

// ==================== 基础类型工具 ====================

/** 可为空类型 */
export type Nullable<T> = T | null | undefined;

/** 只读深度 */
export type DeepReadonly<T> = {
    readonly [P in keyof T]: DeepReadonly<T[P]>;
};

/** 部分必填 */
export type PartialRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/** 提取数组元素类型 */
export type ArrayElement<T extends readonly unknown[]> = T extends readonly (infer E)[] ? E : never;

/** 异步操作状态 */
export type AsyncState = 'idle' | 'loading' | 'success' | 'error';

/** 排序方向 */
export type SortOrder = 'asc' | 'desc';

/** 视图模式 */
export type ViewMode = 'grid' | 'list';

// ==================== 图书相关 ====================

/** 图书来源 */
export const BookSource = {
    DOUBAN: 'douban',
    MANUAL: 'manual',
    ISBN: 'isbn',
    NFC: 'nfc',
} as const;

export type BookSource = (typeof BookSource)[keyof typeof BookSource];

/** 图书状态 */
export const BookStatus = {
    IN_SHELF: 'in_shelf',
    REMOVED: 'removed',
    MOVED: 'moved',
} as const;

export type BookStatus = (typeof BookStatus)[keyof typeof BookStatus];

/** 基础图书信息 */
export interface Book {
    book_id: number;
    isbn: string;
    title: string;
    author?: string;
    translator?: string;
    publisher?: string;
    publish_date?: string;
    cover_url?: string;
    summary?: string;
    source: BookSource;
    sort_order: number;
    pages?: string;
    price?: string;
    binding?: string;
    original_title?: string;
    series?: string;
    rating?: string;
    douban_url?: string;
    added_at?: string;
    shelf_name?: string;
    shelf_id?: number;
}

/** 图书详情（包含更多字段） */
export interface BookDetail extends Omit<Book, 'sort_order'> {
    last_sync_at?: string;
    created_at?: string;
    updated_at?: string;
    sync_status?: string;
    /** 图书所在的所有书架 */
    shelves?: Array<{
        shelf_id: number;
        shelf_name: string;
        sort_order: number;
        added_at: string;
    }>;
}

/** 图书查询参数 */
export interface BookQueryParams {
    search?: string;
    shelf_id?: number;
    source?: BookSource;
    sort_by?: 'title' | 'author' | 'publisher' | 'added_at' | 'rating';
    sort_order?: SortOrder;
    limit?: number;
    offset?: number;
}

/** 图书创建/更新参数 */
export interface BookCreateParams {
    isbn: string;
    title: string;
    author?: string;
    translator?: string;
    publisher?: string;
    publish_date?: string;
    cover_url?: string;
    summary?: string;
    source?: BookSource;
    pages?: string;
    price?: string;
    binding?: string;
    original_title?: string;
    series?: string;
    rating?: string;
    douban_url?: string;
}

export interface BookUpdateParams extends Partial<BookCreateParams> {
    book_id: number;
}

/** 图书同步结果 */
export interface BookSyncResult {
    success: boolean;
    message: string;
    book?: Book;
    source?: string;
}

// ==================== 书架相关 ====================

/** 书架信息 */
export interface ShelfInfo {
    logical_shelf_id: number;
    shelf_name: string;
    description?: string;
    book_count: number;
    physical_location?: string;
    physical_code?: string;
    recent_cover?: string;
    created_at?: string;
    updated_at?: string;
}

/** 物理-逻辑映射 */
export interface PhysicalMappingInfo {
    logical_shelf_id: number;
    logical_shelf_name: string;
    physical_location: string;
    physical_code?: string;
    mapping_type: string;
    version: number;
    is_active?: boolean;
}

/** 书架完整信息（含图书） */
export interface ShelfBooks {
    logical_shelf_id: number;
    shelf_name: string;
    description?: string;
    physical_info?: PhysicalMappingInfo;
    books: Book[];
    total_count: number;
}

/** 书架创建/更新参数 */
export interface ShelfCreateParams {
    shelf_name: string;
    description?: string;
}

export interface ShelfUpdateParams {
    shelf_name?: string;
    description?: string;
}

// ==================== 物理书架相关 ====================

/** 物理书架 */
export interface PhysicalShelf {
    physical_shelf_id: number;
    location_code: string;
    location_name: string;
    description?: string;
    tag_uid?: string;
    created_at?: string;
    updated_at?: string;
}

/** 物理书架创建参数 */
export interface PhysicalShelfCreateParams {
    location_code: string;
    location_name: string;
    description?: string;
    tag_uid?: string;
}

// ==================== NFC 相关 ====================

/** NFC 读取结果 */
export interface NFCReadResult {
    tag_uid: string;
    location_code: string;
    location_name: string;
    raw_payload: string;
    valid: boolean;
    error?: string;
}

/** NFC 写入结果 */
export interface NFCWriteResult {
    success: boolean;
    tag_uid?: string;
    written_payload?: string;
    checksum?: string;
    message: string;
}

/** NFC 写入任务 */
export interface NFCWriteTask {
    task_id: string;
    shelf_id: number;
    shelf_name: string;
    payload: string;
    created_at: string;
    expires_in: number;
}

/** NFC 回调类型 */
export type NFCCallbackType = 'scan' | 'write' | 'read' | 'bind';

/** NFC 操作状态 */
export interface NFCOperationState {
    type: NFCCallbackType;
    status: 'idle' | 'scanning' | 'reading' | 'writing' | 'success' | 'error';
    message?: string;
    result?: NFCReadResult | NFCWriteResult;
    error?: string;
}

// ==================== API 通用类型 ====================

/** 基础 API 响应 */
export interface ApiResponse<T = unknown> {
    success: boolean;
    message?: string;
    data?: T;
    /** 请求追踪 ID */
    trace_id?: string;
}

/** 分页响应 */
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
}

/** 分页请求参数 */
export interface PaginationParams {
    limit?: number;
    offset?: number;
}

/** 图书列表响应 */
export interface BooksResponse {
    books: Book[];
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
}

// ==================== 导入相关 ====================

/** 导入预览 */
export interface ImportPreview {
    file_name: string;
    file_size: number;
    total_rows: number;
    new_count: number;
    existing_count: number;
    duplicate_count: number;
    invalid_count: number;
    isbn_column: string;
    note_column?: string;
    isbns: string[];
    sample_data: Record<string, unknown>[];
    columns: string[];
    new_entries: ImportEntry[];
    existing_books: ImportEntry[];
    invalid_entries: ImportEntry[];
    duplicates: Array<{ isbn: string; count: number }>;
}

/** 导入条目 */
export interface ImportEntry {
    row: number;
    isbn?: string;
    original?: string;
    reason?: string;
}

/** 导入任务状态 */
export const ImportTaskStatus = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
} as const;

export type ImportTaskStatus = (typeof ImportTaskStatus)[keyof typeof ImportTaskStatus];

/** 导入任务 */
export interface ImportTask {
    task_id: string;
    status: ImportTaskStatus;
    file_name?: string;
    total: number;
    completed: number;
    success: number;
    synced?: number;
    failed: number;
    skipped?: number;
    progress: number;
    results: ImportTaskResult[];
    errors: ImportTaskError[];
    error?: string;
    started_at?: string;
    finished_at?: string;
}

export interface ImportTaskResult {
    index: number;
    isbn: string;
    status: 'success' | 'failed' | 'skipped';
    title?: string;
    synced?: boolean;
    message?: string;
}

export interface ImportTaskError {
    index: number;
    isbn: string;
    error: string;
}

/** 导入开始参数 */
export interface ImportStartParams {
    file: File;
    shelf_id?: number;
    auto_sync?: boolean;
    sync_delay?: number;
}

// ==================== 仪表盘/统计 ====================

export interface DashboardStats {
    physical_shelves: number;
    logical_shelves: number;
    active_mappings: number;
    total_books: number;
    books_in_shelves: number;
    books_not_in_shelf: number;
    books_by_source: Record<BookSource, number>;
    sync_count: number;
    today_books: number;
    recent_books: RecentBook[];
    monthly_growth: MonthlyGrowth[];
    top_publishers: TopItem[];
    top_authors: TopItem[];
    rating_distribution: RatingDistribution[];
    shelf_utilization: ShelfUtilization[];
    recent_activities: ActivityItem[];
}

export interface RecentBook {
    book_id: number;
    title: string;
    isbn: string;
    author?: string;
    source: string;
    cover_url?: string;
    rating?: string;
    shelf_name?: string;
    added_at?: string;
}

export interface MonthlyGrowth {
    year: number;
    month: string;
    count: number;
}

export interface TopItem {
    name: string;
    count: number;
    percentage: number;
}

export interface RatingDistribution {
    range: string;
    count: number;
    color: string;
}

export interface ShelfUtilization {
    shelf_id: number;
    shelf_name: string;
    book_count: number;
    capacity: number;
    percentage: number;
}

export interface ActivityItem {
    id: number;
    action: string;
    detail: string;
    type: 'create' | 'update' | 'delete' | 'sync' | 'import' | 'other';
    timestamp: string;
}

// ==================== 配置相关 ====================

export interface CookieConfigInfo {
    has_cookie: boolean;
    cookie_preview: string;
    user_agent: string;
    updated_at?: string;
}

export interface CookieTestResult {
    success: boolean;
    message: string;
    cookie_valid: boolean;
    test_book?: {
        title: string;
        author?: string;
        cover_url?: string;
        publisher?: string;
        rating?: string;
    };
}

// ==================== 封面墙相关 ====================

export interface BookWallParams extends PaginationParams {
    shelf_id?: number;
    sort_by?: 'added_at' | 'created_at' | 'title' | 'author' | 'rating';
    order?: SortOrder;
    source?: BookSource;
    search?: string;
}

export interface BookWallState {
    books: Book[];
    total: number;
    offset: number;
    hasMore: boolean;
    loading: boolean;
    error?: string;
}

// ==================== 组件 Props 类型 ====================

/** 图书卡片 Props */
export interface BookCardProps {
    book: Book;
    onClick?: (book: Book) => void;
    onEdit?: (book: Book) => void;
    onDelete?: (book: Book) => void;
    showActions?: boolean;
    className?: string;
}

/** 主题类型 */
export type ThemeType = 'classic' | 'dark' | 'bamboo' | 'ocean' | 'sakura';

/** 主题定义 */
export interface ThemeDefinition {
    name: string;
    type: ThemeType;
    cssVariables: Record<string, string>;
    antdTheme?: Record<string, unknown>;
}

/** 全局通知类型 */
export type NotificationType = 'success' | 'info' | 'warning' | 'error';

/** 全局通知 */
export interface AppNotification {
    id: string;
    type: NotificationType;
    message: string;
    description?: string;
    duration?: number;
    timestamp: number;
}