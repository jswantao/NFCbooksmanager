// frontend/src/utils/format.ts
/**
 * 数据格式化工具函数
 * 
 * 提供通用的数据格式化功能，用于 UI 展示。
 * 所有函数均为纯函数，无副作用。
 */

/**
 * 格式化文件大小为人类可读的字符串
 * 
 * 转换规则：
 * - 0 字节 → "0 B"
 * - < 1 KB  → "XXX B"（原始字节数）
 * - < 1 MB  → "XXX.X KB"（1 位小数）
 * - ≥ 1 MB  → "XXX.X MB"（1 位小数）
 * 
 * 用途：
 * - 文件上传预览显示
 * - 导入文件大小提示
 * - 数据库文件大小统计
 * 
 * @param bytes - 文件大小（字节数）
 * @returns 格式化后的文件大小字符串
 * 
 * @example
 * formatFileSize(0)        // "0 B"
 * formatFileSize(512)      // "512 B"
 * formatFileSize(1536)     // "1.5 KB"
 * formatFileSize(1048576)  // "1.0 MB"
 */
export const formatFileSize = (bytes: number): string => {
    // 零字节特殊处理
    if (bytes === 0) return '0 B';
    
    // 小于 1 KB：直接显示字节数
    if (bytes < 1024) return `${bytes} B`;
    
    // 小于 1 MB：转换为 KB
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    
    // 大于等于 1 MB：转换为 MB
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * 格式化日期为相对时间描述
 * 
 * 用于活动日志、同步日志等场景的时间展示。
 * 
 * @param dateString - ISO 格式日期字符串
 * @returns 相对时间描述（如 "刚刚"、"5分钟前"）
 */
export const formatRelativeTime = (dateString?: string): string => {
    if (!dateString) return '';
    
    const now = Date.now();
    const target = new Date(dateString).getTime();
    
    // 无效日期处理
    if (isNaN(target)) return dateString;
    
    const diffMs = now - target;
    const diffSeconds = Math.floor(diffMs / 1000);
    
    // 未来时间
    if (diffSeconds < 0) return '刚刚';
    
    // 1 分钟内
    if (diffSeconds < 60) return '刚刚';
    
    // 1 小时内
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;
    
    // 24 小时内
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}小时前`;
    
    // 48 小时内 → "昨天"
    if (diffHours < 48) return '昨天';
    
    // 7 天内
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}天前`;
    
    // 超过 7 天：显示完整日期
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
};

/**
 * 格式化评分显示
 * 
 * 将豆瓣评分字符串转为标准显示格式。
 * 
 * @param rating - 评分字符串（如 "9.3"）
 * @returns 格式化后的评分，无效时返回空字符串
 */
export const formatRating = (rating?: string): string => {
    if (!rating) return '';
    
    const num = parseFloat(rating);
    if (isNaN(num)) return '';
    
    // 保留一位小数
    return num.toFixed(1);
};

/**
 * 截断文本并添加省略号
 * 
 * @param text - 原始文本
 * @param maxLength - 最大长度
 * @returns 截断后的文本
 */
export const truncateText = (text: string, maxLength: number = 100): string => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
};