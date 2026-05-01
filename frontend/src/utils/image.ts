// frontend/src/utils/image.ts
/**
 * 图片处理工具函数 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 更丰富的占位图生成
 * - 图片预加载
 * - 封面尺寸适配策略
 * - 颜色提取（用于骨架屏/模糊背景）
 * - WebP 支持检测
 */

// ==================== 常量 ====================

/** 占位图尺寸 */
const PLACEHOLDER_WIDTH = 300;
const PLACEHOLDER_HEIGHT = 400;

/** 占位图色板 - 温暖的文学色调 */
const PLACEHOLDER_COLORS = [
    '#1a365d', '#2d3748', '#276749', '#9b2c2c',
    '#6b46c1', '#c05621', '#2b6cb0', '#2c7a7b',
    '#744210', '#553c9a', '#22543d', '#991b1b',
    '#4a5568', '#285e61', '#7b341e', '#434190',
] as const;

/** 封面尺寸映射 */
const DOUBAN_COVER_SIZES = {
    s: { path: '/s/', width: 100, height: 140 },
    m: { path: '/m/', width: 200, height: 280 },
    l: { path: '/l/', width: 400, height: 560 },
} as const;

// ==================== 封面 URL 处理 ====================

/**
 * 判断是否为豆瓣图片 URL
 */
const isDoubanUrl = (url: string): boolean => {
    return url.includes('douban.com') || url.includes('doubanio.com');
};

/**
 * 获取可用的图书封面 URL
 * 
 * 豆瓣图片通过后端代理访问，避免防盗链和混合内容问题
 * 
 * @param url - 原始封面 URL
 * @param size - 封面尺寸，默认 'm'
 * @returns 可用的封面 URL
 */
export const getCoverUrl = (url?: string, size: 's' | 'm' | 'l' = 'm'): string => {
    if (!url) return '';

    // 已经是 data URI 或本地 URL，直接返回
    if (url.startsWith('data:') || url.startsWith('/')) return url;

    // 豆瓣图片通过代理
    if (isDoubanUrl(url)) {
        const sizedUrl = getDoubanCoverSize(url, size);
        return `/api/images/proxy?url=${encodeURIComponent(sizedUrl)}`;
    }

    return url;
};

/**
 * 获取豆瓣封面特定尺寸的 URL
 * 
 * @param url - 豆瓣封面 URL
 * @param size - 目标尺寸
 * @returns 调整后的 URL
 */
export const getDoubanCoverSize = (
    url: string,
    size: 's' | 'm' | 'l' = 'm'
): string => {
    if (!isDoubanUrl(url)) return url;

    const sizeConfig = DOUBAN_COVER_SIZES[size];
    // 替换 URL 中的尺寸路径
    let result = url;
    for (const [, config] of Object.entries(DOUBAN_COVER_SIZES)) {
        result = result.replace(config.path, sizeConfig.path);
    }
    return result;
};

/**
 * 获取最佳封面尺寸配置
 * 根据容器宽度选择合适的封面尺寸
 * 
 * @param containerWidth - 容器宽度
 * @returns 推荐的尺寸配置
 */
export const getOptimalCoverSize = (
    containerWidth: number
): 's' | 'm' | 'l' => {
    if (containerWidth <= 100) return 's';
    if (containerWidth <= 200) return 'm';
    return 'l';
};

// ==================== 占位图生成 ====================

/** 占位图选项 */
interface PlaceholderOptions {
    width?: number;
    height?: number;
    showIcon?: boolean;
    iconSize?: number;
}

/**
 * 生成 SVG 格式的图书封面占位图
 * 
 * @param title - 图书标题
 * @param author - 图书作者
 * @param options - 占位图选项
 * @returns SVG data URI 字符串
 */
export const getPlaceholderCover = (
    title?: string,
    author?: string,
    options: PlaceholderOptions = {}
): string => {
    const {
        width = PLACEHOLDER_WIDTH,
        height = PLACEHOLDER_HEIGHT,
        showIcon = true,
        iconSize = 48,
    } = options;

    const colorIndex = (title?.length || 0) % PLACEHOLDER_COLORS.length;
    const color = PLACEHOLDER_COLORS[colorIndex];
    const gradientId = `pg-${title?.length || 0}-${width}`;
    const centerX = width / 2;

    // 安全转义 SVG 文本
    const escapeXml = (str: string): string => {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    };

    const bookTitle = escapeXml(title?.substring(0, 12) || '未知书名');
    const bookAuthor = escapeXml(author?.substring(0, 10) || '未知作者');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
    <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="${color}dd" stop-opacity="0.8"/>
    </linearGradient>
</defs>
<rect width="${width}" height="${height}" fill="url(#${gradientId})" rx="8"/>
<rect x="12" y="12" width="${width - 24}" height="${height - 24}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" rx="4"/>
${
    showIcon
        ? `<text x="${centerX}" y="${height * 0.55}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="${iconSize}">📚</text>`
        : ''
}
<text x="${centerX}" y="${height * 0.35}" text-anchor="middle" fill="#fff" font-size="${Math.max(width * 0.06, 14)}" font-family="'PingFang SC', 'Microsoft YaHei', Arial, sans-serif" font-weight="600">${bookTitle}</text>
<text x="${centerX}" y="${height * 0.42}" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="${Math.max(width * 0.04, 12)}" font-family="'PingFang SC', 'Microsoft YaHei', Arial, sans-serif">${bookAuthor}</text>
${
    !showIcon
        ? `<line x1="${width * 0.2}" y1="${height * 0.5}" x2="${width * 0.8}" y2="${height * 0.5}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>`
        : ''
}
</svg>`;

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

/**
 * 生成纯色占位图（用于骨架屏背景）
 */
export const getSolidPlaceholder = (
    width: number = 300,
    height: number = 400,
    color: string = '#f0e6db'
): string => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<rect width="${width}" height="${height}" fill="${color}" rx="8"/>
</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

// ==================== 图片加载处理 ====================

/**
 * 处理图片加载失败的回退
 * 
 * @param event - 图片错误事件
 * @param title - 图书标题
 * @param author - 图书作者
 */
export const handleImageError = (
    event: React.SyntheticEvent<HTMLImageElement>,
    title?: string,
    author?: string
): void => {
    const img = event.currentTarget;

    // 防止无限回退循环
    if (img.src.startsWith('data:image/svg+xml')) return;

    // 设置占位图
    img.src = getPlaceholderCover(title, author, {
        width: img.naturalWidth || 300,
        height: img.naturalHeight || 400,
    });

    // 添加类名标记
    img.classList.add('placeholder-cover');
};

/**
 * 预加载单张图片
 * 
 * @param src - 图片 URL
 * @returns 加载成功返回 true
 */
export const preloadImage = (src: string): Promise<boolean> => {
    return new Promise((resolve) => {
        if (!src) {
            resolve(false);
            return;
        }

        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = src;
    });
};

/**
 * 批量预加载图片
 * 
 * @param urls - 图片 URL 数组
 * @param concurrency - 并发数，默认 3
 * @returns 加载结果数组
 */
export const preloadImages = async (
    urls: string[],
    concurrency: number = 3
): Promise<boolean[]> => {
    const results: boolean[] = [];
    const validUrls = urls.filter(Boolean);

    for (let i = 0; i < validUrls.length; i += concurrency) {
        const batch = validUrls.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(preloadImage));
        results.push(...batchResults);
    }

    return results;
};

// ==================== 颜色处理 ====================

/**
 * 从占位图色板中提取颜色（用于生成一致的封面背景色）
 * 
 * @param key - 用于确定颜色的键（如书名）
 * @returns HEX 颜色值
 */
export const getCoverColor = (key?: string): string => {
    if (!key) return PLACEHOLDER_COLORS[0];
    const index = key.length % PLACEHOLDER_COLORS.length;
    return PLACEHOLDER_COLORS[index];
};

// ==================== 图片格式检测 ====================

/**
 * 检测浏览器是否支持 WebP
 * 使用惰性检测，只检测一次
 */
let webpSupported: boolean | null = null;

export const isWebPSupported = (): Promise<boolean> => {
    if (webpSupported !== null) return Promise.resolve(webpSupported);

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            webpSupported = img.width > 0 && img.height > 0;
            resolve(webpSupported!);
        };
        img.onerror = () => {
            webpSupported = false;
            resolve(false);
        };
        // 1x1 WebP 图片
        img.src = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAEAAQAcJaQAA3AA/v3AgAA=';
    });
};