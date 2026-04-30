// frontend/src/types/index.ts
/**
 * TypeScript 类型定义
 * 
 * 定义了前端使用的所有核心数据类型，与后端 API 响应结构对齐。
 * 
 * 分类：
 * 1. 图书相关：Book, BookDetail, BookSource
 * 2. 书架相关：ShelfInfo, ShelfBooks
 * 3. NFC 相关：NFCReadResult, NFCWriteResult
 * 4. API 通用：ApiResponse, PaginatedResponse
 * 5. 导入相关：ImportTask, ImportPreview
 * 6. 仪表盘：DashboardStats
 * 
 * 注意：
 * - 使用 interface 而非 type 以便 IDE 提供更好的提示
 * - 可选字段使用 ?: 标记
 * - 复用后端 schema 中的字段命名规则
 */

// ==================== 图书相关 ====================

/** 图书数据来源标识 */
export type BookSource = 'douban' | 'manual' | 'isbn' | 'nfc';

/** 图书在书架中的状态 */
export type BookStatus = 'in_shelf' | 'removed' | 'moved';

/**
 * 书架中的图书基本信息
 * 
 * 用于书架图书列表、图书墙展示。
 * 包含核心元数据和书架关联信息。
 */
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

/**
 * 图书完整详情
 * 
 * 用于图书详情页，相比 Book 增加了同步状态和时间戳信息。
 */
export interface BookDetail extends Omit<Book, 'sort_order'> {
    /** 最后同步豆瓣数据的时间 */
    last_sync_at?: string;
    /** 记录创建时间 */
    created_at?: string;
    /** 记录最后更新时间 */
    updated_at?: string;
    /** 同步状态 */
    sync_status?: string;
}

/** 豆瓣同步结果 */
export interface BookSyncResult {
    success: boolean;
    message: string;
    book?: Book;
}

// ==================== 书架相关 ====================

/**
 * 逻辑书架基本信息
 * 
 * 用于书架列表展示，包含统计信息。
 */
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

/**
 * 物理位置映射信息
 * 
 * 通过 NFC 扫描解析得到的物理书架与逻辑书架的映射关系。
 */
export interface PhysicalMappingInfo {
    logical_shelf_id: number;
    logical_shelf_name: string;
    physical_location: string;
    physical_code?: string;
    mapping_type: string;
    version: number;
    is_active?: boolean;
}

/**
 * 书架完整信息（含图书列表和物理映射）
 * 
 * 用于书架详情页，是前端展示的核心数据结构。
 */
export interface ShelfBooks {
    logical_shelf_id: number;
    shelf_name: string;
    description?: string;
    /** 物理位置映射信息（NFC 扫描后自动关联） */
    physical_info?: PhysicalMappingInfo;
    /** 书架中的图书列表 */
    books: Book[];
    /** 图书总数 */
    total_count: number;
}

// ==================== NFC 相关 ====================

/**
 * NFC 标签读取结果
 * 
 * 外模式数据对象，从 NFC 标签读取并解析后的标准化数据。
 */
export interface NFCReadResult {
    tag_uid: string;
    location_code: string;
    location_name: string;
    raw_payload: string;
    valid: boolean;
    error?: string;
}

/**
 * NFC 标签写入结果
 * 
 * 写入操作的结果反馈。
 */
export interface NFCWriteResult {
    success: boolean;
    tag_uid?: string;
    written_payload?: string;
    written_data?: string;
    checksum?: string;
    message: string;
}

/**
 * NFC 写入任务
 * 
 * PC 端生成的待写入任务，手机端获取后写入 NFC 标签。
 */
export interface NFCWriteTask {
    task_id: string;
    shelf_id: number;
    shelf_name: string;
    payload: string;
    created_at: string;
    expires_in: number;
}

// ==================== API 通用 ====================

/**
 * 统一 API 响应格式
 * 
 * 所有后端 API 返回的 JSON 结构。
 * 
 * @template T - data 字段的类型，默认为 any
 */
export interface ApiResponse<T = any> {
    success: boolean;
    message?: string;
    data?: T;
}

/**
 * 分页响应 - 通用模式（使用 items 字段）
 * 
 * 用于列表类接口的标准化分页数据返回。
 * 
 * @template T - 列表项类型
 */
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
}

/**
 * 图书列表响应（使用 books 字段）
 * 
 * 用于 /api/books/wall 和 /api/books/all 端点的响应格式。
 */
export interface BooksResponse {
    books: Book[];
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
}

// ==================== 导入相关 ====================

/**
 * 导入文件预览结果
 * 
 * 在实际执行导入前展示的统计信息。
 */
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
    sample_data: Record<string, any>[];
    columns: string[];
    new_entries: ImportEntry[];
    existing_books: ImportEntry[];
    invalid_entries: ImportEntry[];
    duplicates: { isbn: string; count: number }[];
}

/** 导入条目 */
export interface ImportEntry {
    row: number;
    isbn?: string;
    original?: string;
    reason?: string;
}

/**
 * 导入任务状态
 * 
 * 用于轮询导入进度并显示实时状态。
 */
export interface ImportTask {
    task_id: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
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

/** 导入任务结果 */
export interface ImportTaskResult {
    index: number;
    isbn: string;
    status: 'success' | 'failed' | 'skipped';
    title?: string;
    synced?: boolean;
    message?: string;
}

/** 导入任务错误 */
export interface ImportTaskError {
    index: number;
    isbn: string;
    error: string;
}

// ==================== 管理仪表盘 ====================

/**
 * 仪表盘统计数据
 * 
 * 管理后台首页展示的所有统计维度。
 */
export interface DashboardStats {
    // 实体统计
    physical_shelves: number;
    logical_shelves: number;
    active_mappings: number;
    total_books: number;
    books_in_shelves: number;
    books_not_in_shelf: number;
    
    // 数据来源分布
    books_by_source: Record<BookSource, number>;
    
    // 同步与活跃度
    sync_count: number;
    today_books: number;
    
    // 最近添加
    recent_books: RecentBook[];
    
    // 趋势图表数据
    monthly_growth: MonthlyGrowth[];
    top_publishers: TopItem[];
    top_authors: TopItem[];
    rating_distribution: RatingDistribution[];
    shelf_utilization: ShelfUtilization[];
    
    // 活动记录
    recent_activities: ActivityItem[];
}

/** 最近添加的图书 */
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

/** 月度增长数据 */
export interface MonthlyGrowth {
    year: number;
    month: string;
    count: number;
}

/** 排行榜通用项 */
export interface TopItem {
    name: string;
    count: number;
    percentage: number;
}

/** 评分分布 */
export interface RatingDistribution {
    range: string;
    count: number;
    color: string;
}

/** 书架利用率 */
export interface ShelfUtilization {
    shelf_name: string;
    book_count: number;
    capacity: number;
    percentage: number;
}

/** 活动日志条目 */
export interface ActivityItem {
    id: number;
    action: string;
    detail: string;
    type: string;
    timestamp: string;
}

// ==================== 配置相关 ====================

/**
 * Cookie 配置状态
 */
export interface CookieConfigInfo {
    has_cookie: boolean;
    cookie_preview: string;
    user_agent: string;
    updated_at?: string;
}

/**
 * Cookie 测试结果
 */
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

// ==================== 请求参数类型 ====================

/** 书架创建请求 */
export interface ShelfCreateParams {
    shelf_name: string;
    description?: string;
}

/** 书架更新请求 */
export interface ShelfUpdateParams {
    shelf_name?: string;
    description?: string;
}

/** 图书墙查询参数 */
export interface BookWallParams {
    shelf_id?: number;
    sort_by?: 'added_at' | 'created_at' | 'title' | 'author' | 'rating';
    order?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
    source?: string;
}

/** 图书添加请求 */
export interface BookAddToShelfParams {
    book_id: number;
    sort_order?: number;
    note?: string;
}

/** 导入启动参数 */
export interface ImportStartParams {
    file: File;
    shelf_id?: number;
    auto_sync?: boolean;
    sync_delay?: number;
}