// frontend/src/utils/image.ts
/**
 * 图片处理工具函数
 * 
 * 处理图书封面图片的 URL 生成、代理检测和占位图生成。
 * 
 * 设计说明：
 * - 豆瓣图片通过后端代理访问（/api/images/proxy），避免跨域和防盗链问题
 * - 非豆瓣图片直接使用原始 URL
 * - 无封面时自动生成 SVG 占位图，支持唯一颜色和书名/作者显示
 */

/**
 * 获取可用的图书封面 URL
 * 
 * 处理逻辑：
 * 1. URL 为空 → 返回空字符串（由调用方使用占位图）
 * 2. 豆瓣 CDN 图片 → 通过后端代理访问
 * 3. 其他来源图片 → 直接返回原始 URL
 * 
 * 为什么代理豆瓣图片：
 * - 豆瓣 CDN 有 Referer 校验（防盗链）
 * - 部分网络环境无法直接访问豆瓣
 * - 代理层可添加缓存控制头
 * 
 * @param url - 原始封面 URL（可能为空）
 * @returns 可直接用于 <img src> 的 URL
 * 
 * @example
 * getCoverUrl('https://img2.doubanio.com/view/subject/l/public/s2768378.jpg')
 * // → '/api/images/proxy?url=https%3A%2F%2Fimg2.doubanio.com%2F...'
 * 
 * getCoverUrl('https://example.com/cover.jpg')
 * // → 'https://example.com/cover.jpg'
 * 
 * getCoverUrl(undefined)
 * // → ''
 */
export const getCoverUrl = (url?: string): string => {
    // 空 URL 处理
    if (!url) return '';
    
    // 豆瓣 CDN 图片通过代理访问
    if (url.includes('douban.com') || url.includes('doubanio.com')) {
        return `/api/images/proxy?url=${encodeURIComponent(url)}`;
    }
    
    // 其他来源直接使用
    return url;
};

/**
 * 可用的占位图生成色板
 * 
 * 基于书名长度取模选择颜色，确保：
 * - 同书名始终得到同颜色（稳定性）
 * - 不同书架得到不同颜色（可辨识性）
 * - 颜色搭配深沉且有质感（符合书房氛围）
 */
const PLACEHOLDER_COLORS = [
    '#1a365d',  // 深蓝
    '#2d3748',  // 灰蓝
    '#276749',  // 深绿
    '#9b2c2c',  // 深红
    '#6b46c1',  // 紫色
    '#c05621',  // 橙色
    '#2b6cb0',  // 蓝色
    '#2c7a7b',  // 青色
] as const;

/**
 * 封面占位图尺寸常量
 */
const PLACEHOLDER_WIDTH = 300;
const PLACEHOLDER_HEIGHT = 400;
const PLACEHOLDER_BORDER_RADIUS = 8;

/**
 * 生成 SVG 格式的图书封面占位图
 * 
 * 占位图设计：
 * - 渐变背景色（基于书名取模选择颜色）
 * - 内边框装饰线
 * - 书名（粗体，20px）
 * - 作者（半透明，14px）
 * - 分隔线
 * - 📚 emoji（大尺寸，半透明）
 * 
 * 尺寸：300×400 像素（约 3:4 比例，模拟真实图书封面）
 * 格式：data:image/svg+xml 内联 URI（无需额外网络请求）
 * 
 * @param title - 图书标题（用于确定颜色和显示文字）
 * @param author - 图书作者（可选，用于显示文字）
 * @returns SVG data URI 字符串
 * 
 * @example
 * getPlaceholderCover('三体', '刘慈欣')
 * // → 'data:image/svg+xml,%3Csvg%20xmlns%3D%22...'
 */
export const getPlaceholderCover = (
    title?: string,
    author?: string
): string => {
    // 确定颜色（基于书名长度取模，确保稳定性）
    const colorIndex = (title?.length || 0) % PLACEHOLDER_COLORS.length;
    const primaryColor = PLACEHOLDER_COLORS[colorIndex];
    
    // 截取显示文字（防止过长）
    const displayTitle = title?.substring(0, 10) || '未知书名';
    const displayAuthor = author || '未知作者';
    
    // SVG 渐变 ID（使用名称长度确保唯一性）
    const gradientId = `pg-${displayTitle.length}`;
    
    // 构建 SVG 字符串
    // 注意：使用模板字符串构建 SVG，避免 JSX 依赖
    const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" 
     width="${PLACEHOLDER_WIDTH}" 
     height="${PLACEHOLDER_HEIGHT}" 
     viewBox="0 0 ${PLACEHOLDER_WIDTH} ${PLACEHOLDER_HEIGHT}">
    
    <!-- 渐变定义 -->
    <defs>
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="${primaryColor}dd" stop-opacity="0.85"/>
        </linearGradient>
    </defs>
    
    <!-- 背景矩形 -->
    <rect width="${PLACEHOLDER_WIDTH}" 
          height="${PLACEHOLDER_HEIGHT}" 
          fill="url(#${gradientId})" 
          rx="${PLACEHOLDER_BORDER_RADIUS}"/>
    
    <!-- 内边框装饰 -->
    <rect x="12" y="12" 
          width="${PLACEHOLDER_WIDTH - 24}" 
          height="${PLACEHOLDER_HEIGHT - 24}" 
          fill="none" 
          stroke="rgba(255,255,255,0.15)" 
          stroke-width="1.5" 
          rx="4"/>
    
    <!-- 书名 -->
    <text x="${PLACEHOLDER_WIDTH / 2}" 
          y="160" 
          text-anchor="middle" 
          fill="#fff" 
          font-size="20" 
          font-family="Arial, 'PingFang SC', sans-serif" 
          font-weight="bold">
        ${displayTitle}
    </text>
    
    <!-- 作者 -->
    <text x="${PLACEHOLDER_WIDTH / 2}" 
          y="195" 
          text-anchor="middle" 
          fill="rgba(255,255,255,0.85)" 
          font-size="14" 
          font-family="Arial, 'PingFang SC', sans-serif">
        ${displayAuthor}
    </text>
    
    <!-- 分隔线 -->
    <rect x="${PLACEHOLDER_WIDTH / 2 - 90}" 
          y="215" 
          width="180" 
          height="1" 
          fill="rgba(255,255,255,0.2)"/>
    
    <!-- 中央图标 -->
    <text x="${PLACEHOLDER_WIDTH / 2}" 
          y="290" 
          text-anchor="middle" 
          fill="rgba(255,255,255,0.5)" 
          font-size="48">
        📚
    </text>
</svg>`;

    // 编码为 data URI
    return `data:image/svg+xml,${encodeURIComponent(svgContent.trim())}`;
};

/**
 * 处理图片加载失败的回退
 * 
 * 当封面图片加载失败时，替换为占位图。
 * 用于 <img onError> 事件处理。
 * 
 * @param event - 图片错误事件
 * @param title - 图书标题
 * @param author - 图书作者
 * 
 * @example
 * <img src={getCoverUrl(book.cover_url)} 
 *      onError={(e) => handleImageError(e, book.title, book.author)} />
 */
export const handleImageError = (
    event: React.SyntheticEvent<HTMLImageElement, Event>,
    title?: string,
    author?: string
): void => {
    const img = event.currentTarget;
    
    // 防止无限回退循环
    if (img.src.startsWith('data:image/svg+xml')) return;
    
    // 设置为占位图
    img.src = getPlaceholderCover(title, author);
    
    // 添加错误后样式（可选）
    img.style.opacity = '0.8';
};