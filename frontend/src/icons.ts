// frontend/src/icons.ts
/**
 * 图标统一导入与管理 - React 19 + Ant Design 6
 * 
 * 优化点：
 * - 按类别分组，便于维护
 * - 支持 tree-shaking（每个图标独立导入）
 * - 提供图标名称类型，便于类型检查
 * - 减少重复导入，统一管理
 * 
 * 注意：@ant-design/icons v6 使用 default export，
 * 每个图标独立导入，打包时只会包含实际使用的图标。
 */

// ==================== 导航与菜单图标 ====================
export { default as HomeOutlined } from '@ant-design/icons/HomeOutlined';
export { default as AppstoreOutlined } from '@ant-design/icons/AppstoreOutlined';
export { default as MenuOutlined } from '@ant-design/icons/MenuOutlined';
export { default as RightOutlined } from '@ant-design/icons/RightOutlined';
export { default as LeftOutlined } from '@ant-design/icons/LeftOutlined';
export { default as ArrowLeftOutlined } from '@ant-design/icons/ArrowLeftOutlined';
export { default as ArrowRightOutlined } from '@ant-design/icons/ArrowRightOutlined';
export { default as EllipsisOutlined } from '@ant-design/icons/EllipsisOutlined';

// ==================== 图书操作图标 ====================
export { default as BookOutlined } from '@ant-design/icons/BookOutlined';
export { default as FileTextOutlined } from '@ant-design/icons/FileTextOutlined';
export { default as EyeOutlined } from '@ant-design/icons/EyeOutlined';
export { default as EyeInvisibleOutlined } from '@ant-design/icons/EyeInvisibleOutlined';
export { default as StarFilled } from '@ant-design/icons/StarFilled';
export { default as StarOutlined } from '@ant-design/icons/StarOutlined';
export { default as TagsOutlined } from '@ant-design/icons/TagsOutlined';
export { default as TagOutlined } from '@ant-design/icons/TagOutlined';
export { default as BarcodeOutlined } from '@ant-design/icons/BarcodeOutlined';
export { default as NumberOutlined } from '@ant-design/icons/NumberOutlined';
export { default as DollarOutlined } from '@ant-design/icons/DollarOutlined';
export { default as TranslationOutlined } from '@ant-design/icons/TranslationOutlined';

// ==================== 操作图标 ====================
export { default as PlusOutlined } from '@ant-design/icons/PlusOutlined';
export { default as EditOutlined } from '@ant-design/icons/EditOutlined';
export { default as DeleteOutlined } from '@ant-design/icons/DeleteOutlined';
export { default as SearchOutlined } from '@ant-design/icons/SearchOutlined';
export { default as SaveOutlined } from '@ant-design/icons/SaveOutlined';
export { default as CopyOutlined } from '@ant-design/icons/CopyOutlined';
export { default as ClearOutlined } from '@ant-design/icons/ClearOutlined';
export { default as FormOutlined } from '@ant-design/icons/FormOutlined';
export { default as FilterOutlined } from '@ant-design/icons/FilterOutlined';
export { default as SortAscendingOutlined } from '@ant-design/icons/SortAscendingOutlined';
export { default as UploadOutlined } from '@ant-design/icons/UploadOutlined';
export { default as DownloadOutlined } from '@ant-design/icons/DownloadOutlined';
export { default as ImportOutlined } from '@ant-design/icons/ImportOutlined';
export { default as SwapOutlined } from '@ant-design/icons/SwapOutlined';
export { default as ShareAltOutlined } from '@ant-design/icons/ShareAltOutlined';

// ==================== 状态图标 ====================
export { default as CheckCircleOutlined } from '@ant-design/icons/CheckCircleOutlined';
export { default as CheckCircleFilled } from '@ant-design/icons/CheckCircleFilled';
export { default as CheckOutlined } from '@ant-design/icons/CheckOutlined';
export { default as CloseCircleOutlined } from '@ant-design/icons/CloseCircleOutlined';
export { default as ExclamationCircleOutlined } from '@ant-design/icons/ExclamationCircleOutlined';
export { default as InfoCircleOutlined } from '@ant-design/icons/InfoCircleOutlined';
export { default as QuestionCircleOutlined } from '@ant-design/icons/QuestionCircleOutlined';
export { default as SyncOutlined } from '@ant-design/icons/SyncOutlined';
export { default as ReloadOutlined } from '@ant-design/icons/ReloadOutlined';
export { default as LoadingOutlined } from '@ant-design/icons/LoadingOutlined';
export { default as StopOutlined } from '@ant-design/icons/StopOutlined';
export { default as PlayCircleOutlined } from '@ant-design/icons/PlayCircleOutlined';

// ==================== 管理后台图标 ====================
export { default as DashboardOutlined } from '@ant-design/icons/DashboardOutlined';
export { default as SettingOutlined } from '@ant-design/icons/SettingOutlined';
export { default as KeyOutlined } from '@ant-design/icons/KeyOutlined';
export { default as SafetyOutlined } from '@ant-design/icons/SafetyOutlined';
export { default as UserOutlined } from '@ant-design/icons/UserOutlined';
export { default as ApiOutlined } from '@ant-design/icons/ApiOutlined';
export { default as InboxOutlined } from '@ant-design/icons/InboxOutlined';
export { default as FundOutlined } from '@ant-design/icons/FundOutlined';

// ==================== NFC 相关图标 ====================
export { default as ScanOutlined } from '@ant-design/icons/ScanOutlined';
export { default as ThunderboltOutlined } from '@ant-design/icons/ThunderboltOutlined';
export { default as MobileOutlined } from '@ant-design/icons/MobileOutlined';
export { default as WifiOutlined } from '@ant-design/icons/WifiOutlined';
export { default as LinkOutlined } from '@ant-design/icons/LinkOutlined';
export { default as DisconnectOutlined } from '@ant-design/icons/DisconnectOutlined';
export { default as EnvironmentOutlined } from '@ant-design/icons/EnvironmentOutlined';

// ==================== 数据可视化图标 ====================
export { default as RiseOutlined } from '@ant-design/icons/RiseOutlined';
export { default as PieChartOutlined } from '@ant-design/icons/PieChartOutlined';
export { default as BarChartOutlined } from '@ant-design/icons/BarChartOutlined';
export { default as LineChartOutlined } from '@ant-design/icons/LineChartOutlined';
export { default as HeatMapOutlined } from '@ant-design/icons/HeatMapOutlined';
export { default as TrophyOutlined } from '@ant-design/icons/TrophyOutlined';
export { default as RocketOutlined } from '@ant-design/icons/RocketOutlined';

// ==================== 显示控制图标 ====================
export { default as FullscreenOutlined } from '@ant-design/icons/FullscreenOutlined';
export { default as FullscreenExitOutlined } from '@ant-design/icons/FullscreenExitOutlined';
export { default as BgColorsOutlined } from '@ant-design/icons/BgColorsOutlined';
export { default as ClockCircleOutlined } from '@ant-design/icons/ClockCircleOutlined';
export { default as CalendarOutlined } from '@ant-design/icons/CalendarOutlined';
export { default as ExperimentOutlined } from '@ant-design/icons/ExperimentOutlined';

// ==================== 类型定义 ====================

/**
 * 所有图标名称的联合类型
 * 用于需要类型安全的图标配置场景
 */
export type IconName =
    // 导航
    | 'home' | 'appstore' | 'menu' | 'right' | 'left' | 'arrowLeft' | 'arrowRight' | 'ellipsis'
    // 图书
    | 'book' | 'fileText' | 'eye' | 'eyeInvisible' | 'starFilled' | 'star' | 'tags' | 'tag' | 'barcode' | 'number' | 'dollar' | 'translation'
    // 操作
    | 'plus' | 'edit' | 'delete' | 'search' | 'save' | 'copy' | 'clear' | 'form' | 'filter' | 'sort' | 'upload' | 'download' | 'import' | 'swap' | 'share'
    // 状态
    | 'checkCircle' | 'checkCircleFilled' | 'check' | 'closeCircle' | 'exclamation' | 'info' | 'question' | 'sync' | 'reload' | 'loading' | 'stop' | 'play'
    // 管理
    | 'dashboard' | 'setting' | 'key' | 'safety' | 'user' | 'api' | 'inbox' | 'fund'
    // NFC
    | 'scan' | 'thunderbolt' | 'mobile' | 'wifi' | 'link' | 'disconnect' | 'environment'
    // 图表
    | 'rise' | 'pieChart' | 'barChart' | 'lineChart' | 'heatMap' | 'trophy' | 'rocket'
    // 显示
    | 'fullscreen' | 'fullscreenExit' | 'bgColors' | 'clock' | 'calendar';

/**
 * 图标名称到组件的映射（运行时使用）
 * 可在需要动态渲染图标的场景中使用
 */
export const iconMap: Record<IconName, React.ComponentType> = {
    // 导航
    home: () => import('@ant-design/icons/HomeOutlined'),
    appstore: () => import('@ant-design/icons/AppstoreOutlined'),
    menu: () => import('@ant-design/icons/MenuOutlined'),
    right: () => import('@ant-design/icons/RightOutlined'),
    left: () => import('@ant-design/icons/LeftOutlined'),
    arrowLeft: () => import('@ant-design/icons/ArrowLeftOutlined'),
    arrowRight: () => import('@ant-design/icons/ArrowRightOutlined'),
    ellipsis: () => import('@ant-design/icons/EllipsisOutlined'),
    // 图书
    book: () => import('@ant-design/icons/BookOutlined'),
    fileText: () => import('@ant-design/icons/FileTextOutlined'),
    eye: () => import('@ant-design/icons/EyeOutlined'),
    eyeInvisible: () => import('@ant-design/icons/EyeInvisibleOutlined'),
    starFilled: () => import('@ant-design/icons/StarFilled'),
    star: () => import('@ant-design/icons/StarOutlined'),
    tags: () => import('@ant-design/icons/TagsOutlined'),
    tag: () => import('@ant-design/icons/TagOutlined'),
    barcode: () => import('@ant-design/icons/BarcodeOutlined'),
    number: () => import('@ant-design/icons/NumberOutlined'),
    dollar: () => import('@ant-design/icons/DollarOutlined'),
    translation: () => import('@ant-design/icons/TranslationOutlined'),
    // 操作
    plus: () => import('@ant-design/icons/PlusOutlined'),
    edit: () => import('@ant-design/icons/EditOutlined'),
    delete: () => import('@ant-design/icons/DeleteOutlined'),
    search: () => import('@ant-design/icons/SearchOutlined'),
    save: () => import('@ant-design/icons/SaveOutlined'),
    copy: () => import('@ant-design/icons/CopyOutlined'),
    clear: () => import('@ant-design/icons/ClearOutlined'),
    form: () => import('@ant-design/icons/FormOutlined'),
    filter: () => import('@ant-design/icons/FilterOutlined'),
    sort: () => import('@ant-design/icons/SortAscendingOutlined'),
    upload: () => import('@ant-design/icons/UploadOutlined'),
    download: () => import('@ant-design/icons/DownloadOutlined'),
    import: () => import('@ant-design/icons/ImportOutlined'),
    swap: () => import('@ant-design/icons/SwapOutlined'),
    share: () => import('@ant-design/icons/ShareAltOutlined'),
    // 状态
    checkCircle: () => import('@ant-design/icons/CheckCircleOutlined'),
    checkCircleFilled: () => import('@ant-design/icons/CheckCircleFilled'),
    check: () => import('@ant-design/icons/CheckOutlined'),
    closeCircle: () => import('@ant-design/icons/CloseCircleOutlined'),
    exclamation: () => import('@ant-design/icons/ExclamationCircleOutlined'),
    info: () => import('@ant-design/icons/InfoCircleOutlined'),
    question: () => import('@ant-design/icons/QuestionCircleOutlined'),
    sync: () => import('@ant-design/icons/SyncOutlined'),
    reload: () => import('@ant-design/icons/ReloadOutlined'),
    loading: () => import('@ant-design/icons/LoadingOutlined'),
    stop: () => import('@ant-design/icons/StopOutlined'),
    play: () => import('@ant-design/icons/PlayCircleOutlined'),
    // 管理
    dashboard: () => import('@ant-design/icons/DashboardOutlined'),
    setting: () => import('@ant-design/icons/SettingOutlined'),
    key: () => import('@ant-design/icons/KeyOutlined'),
    safety: () => import('@ant-design/icons/SafetyOutlined'),
    user: () => import('@ant-design/icons/UserOutlined'),
    api: () => import('@ant-design/icons/ApiOutlined'),
    inbox: () => import('@ant-design/icons/InboxOutlined'),
    fund: () => import('@ant-design/icons/FundOutlined'),
    // NFC
    scan: () => import('@ant-design/icons/ScanOutlined'),
    thunderbolt: () => import('@ant-design/icons/ThunderboltOutlined'),
    mobile: () => import('@ant-design/icons/MobileOutlined'),
    wifi: () => import('@ant-design/icons/WifiOutlined'),
    link: () => import('@ant-design/icons/LinkOutlined'),
    disconnect: () => import('@ant-design/icons/DisconnectOutlined'),
    environment: () => import('@ant-design/icons/EnvironmentOutlined'),
    // 图表
    rise: () => import('@ant-design/icons/RiseOutlined'),
    pieChart: () => import('@ant-design/icons/PieChartOutlined'),
    barChart: () => import('@ant-design/icons/BarChartOutlined'),
    lineChart: () => import('@ant-design/icons/LineChartOutlined'),
    heatMap: () => import('@ant-design/icons/HeatMapOutlined'),
    trophy: () => import('@ant-design/icons/TrophyOutlined'),
    rocket: () => import('@ant-design/icons/RocketOutlined'),
    // 显示
    fullscreen: () => import('@ant-design/icons/FullscreenOutlined'),
    fullscreenExit: () => import('@ant-design/icons/FullscreenExitOutlined'),
    bgColors: () => import('@ant-design/icons/BgColorsOutlined'),
    clock: () => import('@ant-design/icons/ClockCircleOutlined'),
    calendar: () => import('@ant-design/icons/CalendarOutlined'),
} as const;