/**
 * Service Worker - 书房管理系统离线缓存
 * 
 * 缓存策略：
 * - 静态资源（JS/CSS/字体）：Cache First（优先缓存）
 * - API 请求：Network First（优先网络，离线时使用缓存）
 * - 图片资源：Stale While Revalidate（先返回缓存，后台更新）
 * - 页面导航：Network First（优先网络）
 * 
 * 版本管理：通过 CACHE_VERSION 控制缓存更新
 */

// ==================== 配置 ====================

/** 缓存版本号（更新 Service Worker 时递增） */
const CACHE_VERSION = 'v2.5.0';

/** 静态资源缓存名 */
const STATIC_CACHE = `bookshelf-static-${CACHE_VERSION}`;

/** API 响应缓存名 */
const API_CACHE = `bookshelf-api-${CACHE_VERSION}`;

/** 图片缓存名 */
const IMAGE_CACHE = `bookshelf-images-${CACHE_VERSION}`;

/** 页面缓存名 */
const PAGE_CACHE = `bookshelf-pages-${CACHE_VERSION}`;

/** 静态资源列表（预缓存，安装时立即下载） */
const STATIC_ASSETS = [
    '/',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
];

/** API 路径前缀 */
const API_PREFIX = '/api/';

/** 图片代理路径 */
const IMAGE_PROXY_PREFIX = '/api/images/proxy';

/** 不需要缓存的 API 路径 */
const NO_CACHE_API = [
    '/api/nfc/tasks',
    '/api/nfc/callback',
    '/api/nfc/bind/',
    '/api/import/status/',
];

// ==================== 安装事件 ====================

self.addEventListener('install', (event) => {
    console.log(`[SW] 安装中... v${CACHE_VERSION}`);
    
    // 预缓存静态资源
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            console.log('[SW] 预缓存静态资源');
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('[SW] 部分预缓存失败:', err);
            });
        })
    );
    
    // 立即激活（不等待旧 SW 释放）
    self.skipWaiting();
});

// ==================== 激活事件 ====================

self.addEventListener('activate', (event) => {
    console.log('[SW] 激活中...');
    
    // 清理旧版本缓存
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => {
                        // 保留当前版本的缓存，删除旧版本
                        return (
                            name.startsWith('bookshelf-') &&
                            !name.endsWith(CACHE_VERSION)
                        );
                    })
                    .map((name) => {
                        console.log('[SW] 删除旧缓存:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => {
            console.log('[SW] 激活完成，缓存已清理');
            // 接管所有客户端
            return self.clients.claim();
        })
    );
});

// ==================== 请求拦截 ====================

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // 跳过非 GET 请求
    if (request.method !== 'GET') return;
    
    // 跳过 Chrome 扩展请求
    if (!url.protocol.startsWith('http')) return;
    
    // 跳过不需要缓存的 API
    if (NO_CACHE_API.some((path) => url.pathname.startsWith(path))) {
        return;
    }
    
    // ========== API 请求：Network First ==========
    if (url.pathname.startsWith(API_PREFIX)) {
        // 图片代理特殊处理
        if (url.pathname.startsWith(IMAGE_PROXY_PREFIX)) {
            event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
            return;
        }
        
        // 其他 API：Network First
        event.respondWith(networkFirst(request, API_CACHE));
        return;
    }
    
    // ========== 静态资源：Cache First ==========
    if (
        request.destination === 'script' ||
        request.destination === 'style' ||
        request.destination === 'font' ||
        request.destination === 'worker'
    ) {
        event.respondWith(cacheFirst(request, STATIC_CACHE));
        return;
    }
    
    // ========== 图片：Stale While Revalidate ==========
    if (request.destination === 'image') {
        event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
        return;
    }
    
    // ========== 页面导航：Network First ==========
    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request, PAGE_CACHE));
        return;
    }
    
    // ========== 其他请求：Network First ==========
    event.respondWith(networkFirst(request, STATIC_CACHE));
});

// ==================== 缓存策略 ====================

/**
 * Cache First 策略
 * 
 * 优先从缓存读取，缓存未命中时请求网络并缓存。
 * 适用于：JS/CSS/字体等不常变化的静态资源。
 */
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    if (cached) {
        return cached;
    }
    
    try {
        const response = await fetch(request);
        
        // 只缓存成功的响应
        if (response.status === 200) {
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        // 离线且无缓存时，返回离线页面
        if (request.mode === 'navigate') {
            return cache.match('/offline.html');
        }
        throw error;
    }
}

/**
 * Network First 策略
 * 
 * 优先从网络获取，网络失败时使用缓存。
 * 适用于：API 请求、页面导航等需要最新数据的内容。
 */
async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);
        
        // 缓存成功的 GET 请求
        if (request.method === 'GET' && response.status === 200) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        // 网络失败，尝试从缓存读取
        const cache = await caches.open(cacheName);
        const cached = await cache.match(request);
        
        if (cached) {
            return cached;
        }
        
        // 完全离线且无缓存
        throw error;
    }
}

/**
 * Stale While Revalidate 策略
 * 
 * 立即返回缓存（如果有），同时后台更新缓存。
 * 适用于：图片等可容忍旧数据的资源。
 */
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    // 后台更新（不阻塞响应）
    const fetchPromise = fetch(request)
        .then((response) => {
            if (response.status === 200) {
                cache.put(request, response.clone());
            }
            return response;
        })
        .catch(() => {
            // 后台更新失败，静默处理
        });
    
    // 立即返回缓存（如果有），否则等待网络
    return cached || fetchPromise;
}

// ==================== 消息处理 ====================

/**
 * 处理来自页面的消息
 * 
 * 支持：
 * - skipWaiting：立即激活新 SW
 * - clearCache：清除所有缓存
 * - getCacheStats：获取缓存统计
 */
self.addEventListener('message', (event) => {
    const { type } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'CLEAR_CACHE':
            event.waitUntil(
                caches.keys().then((names) => {
                    return Promise.all(
                        names
                            .filter((name) => name.startsWith('bookshelf-'))
                            .map((name) => caches.delete(name))
                    );
                }).then(() => {
                    console.log('[SW] 所有缓存已清除');
                    // 通知客户端
                    if (event.ports && event.ports[0]) {
                        event.ports[0].postMessage({ success: true });
                    }
                })
            );
            break;
            
        case 'GET_CACHE_STATS':
            event.waitUntil(
                getCacheStats().then((stats) => {
                    if (event.ports && event.ports[0]) {
                        event.ports[0].postMessage(stats);
                    }
                })
            );
            break;
    }
});

/**
 * 获取缓存统计信息
 */
async function getCacheStats() {
    const cacheNames = await caches.keys();
    const stats = {};
    
    for (const name of cacheNames) {
        if (name.startsWith('bookshelf-')) {
            const cache = await caches.open(name);
            const keys = await cache.keys();
            stats[name] = keys.length;
        }
    }
    
    return { caches: stats, total: Object.values(stats).reduce((a, b) => a + b, 0) };
}

// ==================== 推送通知 ====================

/**
 * 推送事件处理
 * 
 * 用于接收服务端推送的新书通知、同步完成通知等。
 */
self.addEventListener('push', (event) => {
    if (!event.data) return;
    
    try {
        const data = event.data.json();
        
        const options = {
            body: data.body || '有新的图书信息',
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            vibrate: [200, 100, 200],
            data: {
                url: data.url || '/',
                timestamp: Date.now(),
            },
            actions: data.actions || [],
            tag: data.tag || 'default',
            renotify: data.renotify || false,
        };
        
        event.waitUntil(
            self.registration.showNotification(
                data.title || '书房管理系统',
                options
            )
        );
    } catch (e) {
        console.warn('[SW] 推送通知解析失败:', e);
    }
});

/**
 * 通知点击事件
 */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    const url = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            // 如果已有打开的窗口，聚焦到它
            for (const client of clientList) {
                if (client.url.includes(url) && 'focus' in client) {
                    return client.focus();
                }
            }
            // 否则打开新窗口
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

/**
 * 推送订阅变更事件
 */
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil(
        self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
        }).then((subscription) => {
            // 通知服务端更新订阅
            console.log('[SW] 推送订阅已更新');
        })
    );
});