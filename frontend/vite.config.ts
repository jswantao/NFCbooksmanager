// frontend/vite.config.ts
/**
 * Vite 构建配置 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 更精细的代码分割策略
 * - 图片资源优化
 * - CSS 模块化支持
 * - 构建性能提升
 */
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
    const isProd = mode === 'production';
    const isAnalyze = process.env.ANALYZE === 'true';
    
    return {
        plugins: [
            react({
                jsxRuntime: 'automatic',
                // React 19 编译器优化
                babel: {
                    plugins: [
                        // 生产环境移除 PropTypes
                        isProd && ['babel-plugin-transform-react-remove-prop-types', { mode: 'remove' }],
                    ].filter(Boolean),
                },
            }),
            
            // 构建分析（可选，通过 ANALYZE=true 启用）
            isAnalyze && visualizer({
                open: true,
                gzipSize: true,
                brotliSize: true,
                filename: 'dist/stats.html',
            }),
        ].filter(Boolean) as PluginOption[],

        resolve: {
            // 强制单例，防止多副本冲突
            dedupe: [
                'react',
                'react-dom',
                'react-router',
                'react-router-dom',
                '@ant-design/icons',
                'dayjs',
            ],
            alias: {
                '@': path.resolve(__dirname, './src'),
                '@components': path.resolve(__dirname, './src/components'),
                '@pages': path.resolve(__dirname, './src/pages'),
                '@services': path.resolve(__dirname, './src/services'),
                '@utils': path.resolve(__dirname, './src/utils'),
                '@hooks': path.resolve(__dirname, './src/hooks'),
                '@types': path.resolve(__dirname, './src/types'),
                '@theme': path.resolve(__dirname, './src/theme'),
                '@assets': path.resolve(__dirname, './src/assets'),
                
                // React 单例强制
                'react': path.resolve(__dirname, './node_modules/react'),
                'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
                'react/jsx-runtime': path.resolve(__dirname, './node_modules/react/jsx-runtime'),
                'react/jsx-dev-runtime': path.resolve(__dirname, './node_modules/react/jsx-dev-runtime'),
            },
        },

        // CSS 配置
        css: {
            modules: {
                localsConvention: 'camelCaseOnly',
                generateScopedName: isProd ? '[hash:base64:8]' : '[name]__[local]___[hash:base64:5]',
            },
            preprocessorOptions: {
                less: {
                    javascriptEnabled: true,
                    modifyVars: {
                        'primary-color': '#8B4513',
                        'border-radius-base': '8px',
                    },
                },
            },
            devSourcemap: !isProd,
        },

        // 依赖预构建优化
        optimizeDeps: {
            include: [
                'react',
                'react-dom',
                'react/jsx-runtime',
                'react/jsx-dev-runtime',
                'react-router-dom',
                'antd',
                '@ant-design/icons',
                '@ant-design/pro-components',
                'dayjs',
                'axios',
                'recharts',
            ],
            exclude: [],
        },

        server: {
            host: '0.0.0.0',
            port: 5173,
            strictPort: false,
            open: false,
            cors: true,
            proxy: {
                '/api': {
                    target: 'http://localhost:8000',
                    changeOrigin: true,
                    secure: false,
                    timeout: 30000,
                    configure: (proxy) => {
                        proxy.on('error', (err) => {
                            console.warn('[Proxy] API 代理错误:', err.message);
                        });
                    },
                },
            },
            // 开发服务器预热
            warmup: {
                clientFiles: [
                    './src/main.tsx',
                    './src/App.tsx',
                    './src/pages/HomePage.tsx',
                ],
            },
        },

        build: {
            target: 'es2020',
            outDir: 'dist',
            assetsDir: 'assets',
            
            // CSS 代码分割
            cssCodeSplit: true,
            cssMinify: 'lightningcss',
            
            // 资源内联阈值
            assetsInlineLimit: 4096,
            
            // chunk 大小警告
            chunkSizeWarningLimit: 500,
            
            // Source Map（仅生产环境）
            sourcemap: !isProd,
            
            // Terser 压缩配置
            minify: 'terser',
            terserOptions: {
                compress: {
                    drop_console: isProd,
                    drop_debugger: isProd,
                    pure_funcs: isProd ? ['console.log', 'console.info', 'console.debug'] : [],
                    passes: 2,
                },
                format: {
                    comments: false,
                },
            },
            
            // Rollup 配置
            rollupOptions: {
                output: {
                    // 精细分包策略
                    manualChunks: (id) => {
                        // React 核心
                        if (id.includes('node_modules/react-dom') || 
                            id.includes('node_modules/react-router') ||
                            id.includes('node_modules/react-router-dom')) {
                            return 'react-vendor';
                        }
                        if (id.includes('node_modules/react')) {
                            return 'react-core';
                        }
                        
                        // Ant Design 主库
                        if (id.includes('node_modules/antd') && 
                            !id.includes('@ant-design/icons') &&
                            !id.includes('@rc-component')) {
                            return 'antd-core';
                        }
                        
                        // Ant Design 图标
                        if (id.includes('node_modules/@ant-design/icons')) {
                            return 'antd-icons';
                        }
                        
                        // Ant Design 其他组件
                        if (id.includes('node_modules/@rc-component') ||
                            id.includes('node_modules/@ant-design')) {
                            return 'antd-components';
                        }
                        
                        // 图表库（较大的依赖）
                        if (id.includes('node_modules/recharts') ||
                            id.includes('node_modules/d3-') ||
                            id.includes('node_modules/d3-array') ||
                            id.includes('node_modules/d3-scale') ||
                            id.includes('node_modules/d3-shape')) {
                            return 'charts';
                        }
                        
                        // 其他较大的第三方库
                        if (id.includes('node_modules/axios')) {
                            return 'utils-axios';
                        }
                        if (id.includes('node_modules/dayjs')) {
                            return 'utils-dayjs';
                        }
                        
                        // 剩余 node_modules
                        if (id.includes('node_modules')) {
                            return 'vendor-common';
                        }
                        
                        // 业务代码按页面分包
                        if (id.includes('/pages/')) {
                            const pageName = id.split('/pages/')[1]?.split('/')[0];
                            if (pageName) {
                                return `page-${pageName.toLowerCase()}`;
                            }
                        }
                    },
                    
                    // 入口 chunk 命名
                    entryFileNames: 'js/[name]-[hash:10].js',
                    chunkFileNames: 'js/[name]-[hash:10].js',
                    assetFileNames: (assetInfo) => {
                        const extType = assetInfo.name?.split('.').pop();
                        if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType || '')) {
                            return 'images/[name]-[hash:10].[ext]';
                        }
                        if (/woff2?|ttf|eot/i.test(extType || '')) {
                            return 'fonts/[name]-[hash:10].[ext]';
                        }
                        return 'assets/[name]-[hash:10].[ext]';
                    },
                },
            },
        },
        
        // 环境变量前缀
        envPrefix: 'VITE_',
    };
});