// frontend/src/utils/format.ts
/**
 * 数据格式化工具函数 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 完整的 JSDoc 类型注释
 * - 新增更多实用格式化函数
 * - 国际化支持
 * - 边界情况处理
 * - 性能优化（记忆化友好的设计）
 */

// ==================== 文件大小格式化 ====================

/**
 * 格式化文件大小为人类可读字符串
 * 
 * @param bytes - 文件大小（字节数）
 * @param decimals - 小数位数，默认 1
 * @returns 格式化的文件大小
 * 
 * @example
 * formatFileSize(0)            // "0 B"
 * formatFileSize(1024)         // "1.0 KB"
 * formatFileSize(1048576, 2)   // "1.00 MB"
 * formatFileSize(1073741824)   // "1.0 GB"
 */
export const formatFileSize = (bytes: number, decimals: number = 1): string => {
    if (bytes === 0) return '0 B';
    if (bytes < 0) return '未知';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    // 防止超出范围
    if (i >= units.length) return `${(bytes / Math.pow(k, units.length - 1)).toFixed(decimals)} ${units[units.length - 1]}`;

    return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${units[i]}`;
};

// ==================== 时间格式化 ====================

/**
 * 时间格式化选项
 */
interface TimeFormatOptions {
    /** 是否显示"刚刚" */
    showJustNow?: boolean;
    /** 是否显示秒 */
    showSeconds?: boolean;
    /** 超过多少天后显示完整日期，默认 7 */
    fullDateThreshold?: number;
}

/**
 * 格式化日期为相对时间描述（增强版）
 * 
 * @param dateString - ISO 格式日期字符串或时间戳
 * @param options - 格式化选项
 * @returns 相对时间描述
 * 
 * @example
 * formatRelativeTime(new Date().toISOString())  // "刚刚"
 * formatRelativeTime('2024-01-01')              // 根据当前时间计算
 */
export const formatRelativeTime = (
    dateString?: string | number,
    options: TimeFormatOptions = {}
): string => {
    if (dateString === undefined || dateString === null || dateString === '') return '';

    const {
        showJustNow = true,
        showSeconds = false,
        fullDateThreshold = 7,
    } = options;

    const now = Date.now();
    const target = typeof dateString === 'number'
        ? dateString
        : new Date(dateString).getTime();

    // 无效日期
    if (isNaN(target)) return String(dateString);

    const diffMs = now - target;

    // 未来时间
    if (diffMs < 0) {
        const futureSeconds = Math.abs(Math.floor(diffMs / 1000));
        if (futureSeconds < 60) return '即将';
        return formatDate(new Date(target));
    }

    const diffSeconds = Math.floor(diffMs / 1000);

    // 刚刚
    if (diffSeconds < 60) {
        if (diffSeconds <= 10 && showJustNow) return '刚刚';
        if (showSeconds) return `${diffSeconds}秒前`;
        return '刚刚';
    }

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}小时前`;

    // 昨天
    if (diffHours < 48) {
        const yesterday = new Date(now - 86400000);
        if (new Date(target).getDate() === yesterday.getDate()) {
            return `昨天 ${formatTime(new Date(target))}`;
        }
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < fullDateThreshold) return `${diffDays}天前`;

    return formatDate(new Date(target));
};

/**
 * 格式化日期
 * 
 * @param date - Date 对象或日期字符串
 * @param format - 格式，默认 'YYYY-MM-DD'
 * @returns 格式化的日期字符串
 */
export const formatDate = (
    date: Date | string,
    format: 'full' | 'date' | 'datetime' | 'YYYY-MM-DD' | 'YYYY-MM-DD HH:mm' = 'YYYY-MM-DD'
): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return String(date);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');

    switch (format) {
        case 'full':
            return `${year}年${month}月${day}日 ${hour}:${minute}`;
        case 'date':
            return `${year}年${month}月${day}日`;
        case 'datetime':
        case 'YYYY-MM-DD HH:mm':
            return `${year}-${month}-${day} ${hour}:${minute}`;
        case 'YYYY-MM-DD':
        default:
            return `${year}-${month}-${day}`;
    }
};

/**
 * 格式化时间（仅时:分）
 */
export const formatTime = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ==================== 数字格式化 ====================

/**
 * 格式化评分
 * 
 * @param rating - 评分值（字符串或数字）
 * @param decimals - 小数位数，默认 1
 * @returns 格式化的评分字符串
 */
export const formatRating = (rating?: string | number, decimals: number = 1): string => {
    if (rating === undefined || rating === null || rating === '') return '';

    const num = typeof rating === 'string' ? parseFloat(rating) : rating;
    if (isNaN(num)) return String(rating);
    if (num < 0) return '0.0';
    if (num > 10) return '10.0';

    return num.toFixed(decimals);
};

/**
 * 格式化数字为千分位字符串
 * 
 * @param num - 数字
 * @param locale - 地区，默认 'zh-CN'
 * @returns 千分位字符串
 */
export const formatNumber = (num: number, locale: string = 'zh-CN'): string => {
    if (isNaN(num)) return '0';
    return num.toLocaleString(locale);
};

/**
 * 格式化百分比
 * 
 * @param value - 当前值
 * @param total - 总数
 * @param decimals - 小数位数，默认 0
 * @returns 百分比字符串
 */
export const formatPercent = (value: number, total: number, decimals: number = 0): string => {
    if (total === 0 || isNaN(value) || isNaN(total)) return '0%';
    return `${((value / total) * 100).toFixed(decimals)}%`;
};

/**
 * 格式化货币（人民币）
 * 
 * @param amount - 金额
 * @returns 格式化的货币字符串
 */
export const formatCurrency = (amount?: string | number): string => {
    if (amount === undefined || amount === null || amount === '') return '';

    const num = typeof amount === 'string'
        ? parseFloat(amount.replace(/[^\d.]/g, ''))
        : amount;

    if (isNaN(num)) return String(amount);
    return `¥${num.toFixed(2)}`;
};

// ==================== 文本格式化 ====================

/**
 * 截断文本并添加省略号
 * 
 * @param text - 原始文本
 * @param maxLength - 最大长度
 * @param ellipsis - 省略号字符，默认 '...'
 * @returns 截断后的文本
 */
export const truncateText = (
    text: string | undefined | null,
    maxLength: number = 100,
    ellipsis: string = '...'
): string => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + ellipsis;
};

/**
 * 首字母大写
 */
export const capitalize = (str: string): string => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * 连接作者名称
 * 
 * @param authors - 作者名称数组或逗号分隔字符串
 * @param maxCount - 最多显示作者数，超出显示"等"
 * @returns 格式化的作者字符串
 */
export const formatAuthors = (
    authors?: string | string[],
    maxCount: number = 3
): string => {
    if (!authors) return '未知作者';

    const list = Array.isArray(authors)
        ? authors
        : authors.split(/[,，、;；]/).map(a => a.trim()).filter(Boolean);

    if (list.length === 0) return '未知作者';
    if (list.length <= maxCount) return list.join(' / ');

    return `${list.slice(0, maxCount).join(' / ')} 等`;
};

// ==================== 图书相关格式化 ====================

/**
 * 获取图书状态标签信息
 */
export const getBookStatusInfo = (status?: string): { label: string; color: string } => {
    switch (status) {
        case 'in_shelf':
            return { label: '在架', color: 'green' };
        case 'removed':
            return { label: '已移除', color: 'red' };
        case 'moved':
            return { label: '已迁移', color: 'orange' };
        default:
            return { label: status || '未知', color: 'default' };
    }
};

/**
 * 获取图书来源标签信息
 */
export const getBookSourceInfo = (source?: string): { label: string; color: string } => {
    switch (source) {
        case 'douban':
            return { label: '豆瓣', color: 'green' };
        case 'manual':
            return { label: '手动', color: 'blue' };
        case 'isbn':
            return { label: 'ISBN', color: 'purple' };
        case 'nfc':
            return { label: 'NFC', color: 'orange' };
        default:
            return { label: source || '未知', color: 'default' };
    }
};

// ==================== URL 格式化 ====================

/**
 * 安全的 URL 编码
 */
export const safeEncodeURI = (str: string): string => {
    try {
        return encodeURIComponent(str);
    } catch {
        return str;
    }
};

/**
 * 提取 URL 域名
 */
export const extractDomain = (url?: string): string => {
    if (!url) return '';
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
};