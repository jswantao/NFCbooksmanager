# backend/app/core/config.py
"""
应用配置管理模块

基于 pydantic-settings 的配置系统，支持：
- 从 .env 文件和环境变量加载配置
- 配置项类型验证和转换
- 豆瓣 Cookie 的持久化存储和读取
- 敏感信息的安全脱敏展示

配置优先级（由高到低）：
1. 环境变量
2. .env 文件
3. 代码中的默认值

注意：
- SECRET_KEY、NFC_ENCRYPTION_KEY 在生产环境必须修改
- DOUBAN_COOKIE 通过 /api/config/cookie 接口管理，存储在 app_settings.json
"""

import json
from pathlib import Path
from typing import Optional, Dict, Any
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    应用全局配置类
    
    使用 pydantic-settings 自动从 .env 文件和环境变量加载配置，
    支持类型验证、默认值和计算属性。
    
    配置分组：
    - 应用基础：APP_NAME, APP_VERSION, DEBUG, SECRET_KEY, HOST, PORT
    - 跨域安全：CORS_ORIGINS
    - 数据库：DATABASE_URL, DATABASE_POOL_SIZE, DATABASE_ECHO
    - 豆瓣数据源：DOUBAN_COOKIE, DOUBAN_USER_AGENT, DOUBAN_REQUEST_DELAY, ...
    - NFC 安全：NFC_ENCRYPTION_KEY
    - 图片缓存：IMAGE_CACHE_ENABLED, IMAGE_CACHE_DIR, IMAGE_CACHE_MAX_AGE
    - 导入限制：IMPORT_MAX_FILE_SIZE, IMPORT_MAX_ROWS
    - 日志：LOG_LEVEL, LOG_FILE, LOG_FORMAT, LOG_ROTATION, LOG_RETENTION
    """

    # ---- pydantic-settings 配置 ----
    model_config = SettingsConfigDict(
        env_file=".env",                # 从 .env 文件加载
        env_file_encoding="utf-8",      # .env 文件编码
        case_sensitive=True,            # 环境变量名区分大小写
        extra="ignore",                 # 忽略 .env 中的未定义字段
    )

    # ==================== 应用基础配置 ====================
    APP_NAME: str = Field(
        "书房管理系统",
        description="应用名称，用于文档标题和前端展示"
    )
    APP_VERSION: str = Field(
        "2.0.0",
        description="应用版本号，遵循语义化版本规范"
    )
    DEBUG: bool = Field(
        False,
        description="调试模式开关，开启后返回详细错误信息和堆栈跟踪"
    )
    SECRET_KEY: str = Field(
        "change-me",
        description="应用密钥，用于 JWT 签名等安全操作（生产环境务必修改）"
    )
    HOST: str = Field(
        "0.0.0.0",
        description="服务监听地址，0.0.0.0 表示监听所有网络接口"
    )
    PORT: int = Field(
        8000,
        description="服务监听端口"
    )

    # ==================== 跨域安全配置 ====================
    CORS_ORIGINS: str = Field(
        "http://localhost:5173",
        description="允许跨域请求的来源，多个用逗号分隔。支持列表格式（.env 中使用逗号分隔字符串）"
    )

    # ==================== 数据库配置 ====================
    DATABASE_URL: str = Field(
        "sqlite+aiosqlite:///./bookshelf.db",
        description="数据库连接 URL。SQLite 使用 sqlite+aiosqlite:/// 前缀，PostgreSQL 使用 postgresql+asyncpg:// 前缀"
    )
    DATABASE_POOL_SIZE: int = Field(
        5,
        description="数据库连接池大小（仅非 SQLite 数据库生效）"
    )
    DATABASE_ECHO: bool = Field(
        False,
        description="SQL 语句回显开关，开启后打印所有 SQL 语句（调试用）"
    )

    # ==================== 豆瓣数据源配置 ====================
    DOUBAN_COOKIE: str = Field(
        "",
        description="豆瓣登录后的 Cookie 字符串，用于爬虫模拟已登录状态。通过 /api/config/cookie 管理"
    )
    DOUBAN_USER_AGENT: str = Field(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        description="豆瓣爬虫使用的 User-Agent，模拟 Chrome 浏览器访问"
    )
    DOUBAN_REQUEST_DELAY: float = Field(
        1.0,
        ge=0.5,
        le=10.0,
        description="豆瓣请求间隔（秒），避免请求过于频繁被封禁。范围 0.5~10.0"
    )
    DOUBAN_MAX_RETRIES: int = Field(
        3,
        ge=1,
        le=10,
        description="豆瓣请求失败最大重试次数。范围 1~10"
    )
    DOUBAN_TIMEOUT: int = Field(
        30,
        ge=5,
        le=120,
        description="豆瓣请求超时时间（秒）。范围 5~120"
    )

    # ==================== NFC 安全配置 ====================
    NFC_ENCRYPTION_KEY: str = Field(
        "change-me",
        description="NFC 标签数据加密密钥（生产环境务必修改）"
    )

    # ==================== 图片缓存配置 ====================
    IMAGE_CACHE_ENABLED: bool = Field(
        True,
        description="是否启用图书封面图片本地缓存，减少对豆瓣 CDN 的请求"
    )
    IMAGE_CACHE_DIR: str = Field(
        "./cache/images",
        description="图片缓存目录路径"
    )
    IMAGE_CACHE_MAX_AGE: int = Field(
        604800,
        description="图片缓存有效期（秒），默认 7 天（604800 秒）"
    )

    # ==================== 批量导入限制 ====================
    IMPORT_MAX_FILE_SIZE: int = Field(
        20 * 1024 * 1024,
        description="导入文件最大大小（字节），默认 20MB"
    )
    IMPORT_MAX_ROWS: int = Field(
        5000,
        description="单次导入最大行数限制"
    )

    # ==================== 日志配置（增强版） ====================
    LOG_LEVEL: str = Field(
        "INFO",
        description="日志级别：DEBUG / INFO / WARNING / ERROR / CRITICAL"
    )
    LOG_FILE: str = Field(
        "./logs/app.log",
        description="日志文件路径"
    )
    LOG_FORMAT: str = Field(
        "{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} | {message}",
        description="日志格式，使用 loguru 格式语法"
    )
    LOG_ROTATION: str = Field(
        "10 MB",
        description="日志文件轮转大小，支持 '10 MB'、'1 day'、'00:00' 等格式"
    )
    LOG_RETENTION: str = Field(
        "7 days",
        description="日志文件保留时间，支持 '7 days'、'1 week'、'30 days' 等格式"
    )
    LOG_DIAGNOSE: bool = Field(
        True,
        description="是否在异常日志中包含变量诊断信息（开发环境建议开启）"
    )
    LOG_BACKTRACE: bool = Field(
        True,
        description="是否在错误日志中包含完整堆栈回溯"
    )
    LOG_ENQUEUE: bool = Field(
        True,
        description="是否使用消息队列进行多进程安全写入（生产环境建议开启）"
    )

    # ==================== 配置持久化 ====================
    CONFIG_FILE: str = Field(
        "app_settings.json",
        description="应用设置持久化文件路径，用于存储 Cookie 等运行时动态配置"
    )

    # ==================== 字段验证器 ====================

    @field_validator('CORS_ORIGINS', mode='before')
    @classmethod
    def parse_cors_origins(cls, v):
        """
        CORS 来源解析验证器
        
        支持两种格式：
        - 列表：["http://localhost:5173", "http://localhost:3000"]
        - 字符串："http://localhost:5173,http://localhost:3000"
        
        列表格式会被自动转换为逗号分隔的字符串。
        """
        if isinstance(v, list):
            return ",".join(v)
        return v

    @field_validator('DEBUG', mode='before')
    @classmethod
    def parse_debug(cls, v):
        """
        DEBUG 模式解析验证器
        
        支持多种真值表示：
        - 布尔值：True / False
        - 字符串（不区分大小写）：'true', '1', 'yes', 'on'
        """
        if isinstance(v, str):
            return v.lower() in ('true', '1', 'yes', 'on')
        return bool(v)

    @field_validator('IMAGE_CACHE_MAX_AGE', mode='before')
    @classmethod
    def parse_cache_max_age(cls, v):
        """
        缓存有效期解析验证器
        
        支持：
        - 数字（秒）：604800
        - 字符串（天）：'7d', '7days', '1w'
        """
        if isinstance(v, str):
            v = v.strip().lower()
            if v.endswith('d') or v.endswith('days'):
                try:
                    days = int(v.rstrip('days').rstrip('d'))
                    return days * 86400
                except ValueError:
                    pass
            elif v.endswith('w') or v.endswith('weeks'):
                try:
                    weeks = int(v.rstrip('weeks').rstrip('w'))
                    return weeks * 604800
                except ValueError:
                    pass
        return int(v) if v else 604800

    # ==================== 计算属性 ====================

    @property
    def cors_origins_list(self) -> list[str]:
        """
        解析后的 CORS 来源列表
        
        将配置中的逗号分隔字符串转换为列表，
        去除空白字符，过滤空字符串。
        
        用于 FastAPI CORSMiddleware 的 allow_origins 参数。
        """
        return [
            origin.strip()
            for origin in self.CORS_ORIGINS.split(",")
            if origin.strip()
        ]

    @property
    def is_production(self) -> bool:
        """
        是否为生产环境
        
        DEBUG=False 时视为生产环境，启用安全相关的严格配置。
        """
        return not self.DEBUG

    @property
    def douban_configured(self) -> bool:
        """
        豆瓣 Cookie 是否已配置
        
        判断标准：Cookie 长度大于 20 个字符（有效 Cookie 通常很长）。
        """
        return bool(self.DOUBAN_COOKIE and len(self.DOUBAN_COOKIE) > 20)

    @property
    def database_path(self) -> str:
        """
        数据库文件路径（仅 SQLite 有效）
        
        从 DATABASE_URL 中提取文件路径部分。
        示例：'sqlite+aiosqlite:///./bookshelf.db' → './bookshelf.db'
        """
        return (
            self.DATABASE_URL
            .replace("sqlite+aiosqlite:///", "")
            .replace("sqlite:///", "")
        )

    @property
    def log_level_int(self) -> int:
        """
        日志级别转换为整数
        
        用于 loguru 等日志库的级别设置。
        """
        level_map = {
            "TRACE": 5,
            "DEBUG": 10,
            "INFO": 20,
            "SUCCESS": 25,
            "WARNING": 30,
            "ERROR": 40,
            "CRITICAL": 50,
        }
        return level_map.get(self.LOG_LEVEL.upper(), 20)

    @property
    def image_cache_dir_path(self) -> Path:
        """图片缓存目录的 Path 对象"""
        return Path(self.IMAGE_CACHE_DIR)

    @property
    def logs_dir_path(self) -> Path:
        """日志目录的 Path 对象"""
        return Path(self.LOG_FILE).parent

    # ==================== 配置持久化方法 ====================

    def save_to_file(self, data: Optional[Dict[str, Any]] = None) -> bool:
        """
        将配置保存到 JSON 文件
        
        主要用于持久化运行时动态修改的配置项：
        - douban_cookie: 豆瓣登录 Cookie
        - douban_user_agent: 豆瓣请求 User-Agent
        
        Args:
            data: 要保存的配置字典，默认保存 Cookie 相关配置
        
        Returns:
            保存成功返回 True，失败返回 False
        
        注意：此方法不保存所有配置项，仅保存需要持久化的动态配置。
        """
        try:
            # 确保配置目录存在
            config_path = Path(self.CONFIG_FILE)
            config_path.parent.mkdir(parents=True, exist_ok=True)

            # 准备保存的数据
            save_data = data or {
                "douban_cookie": self.DOUBAN_COOKIE,
                "douban_user_agent": self.DOUBAN_USER_AGENT,
            }

            # 原子写入：先写临时文件，再替换
            temp_path = config_path.with_suffix('.tmp')
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(save_data, f, ensure_ascii=False, indent=2)

            # 原子替换
            temp_path.replace(config_path)
            return True
        except Exception as e:
            print(f"[Config] ❌ 配置保存失败: {e}")
            return False

    def load_from_file(self) -> bool:
        """
        从 JSON 文件加载配置
        
        启动时自动调用，恢复上次保存的运行时配置。
        
        Returns:
            加载成功返回 True，文件不存在或读取失败返回 False
        """
        config_path = Path(self.CONFIG_FILE)
        if not config_path.exists():
            print(f"[Config] 配置文件 {self.CONFIG_FILE} 不存在，使用默认值")
            return False

        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 加载运行时可修改的配置项
            self.DOUBAN_COOKIE = data.get("douban_cookie", self.DOUBAN_COOKIE)
            self.DOUBAN_USER_AGENT = data.get(
                "douban_user_agent",
                self.DOUBAN_USER_AGENT
            )

            print(
                f"[Config] ✅ 配置文件加载成功 | "
                f"Cookie: {'已配置' if self.douban_configured else '未配置'}"
            )
            return True
        except json.JSONDecodeError as e:
            print(f"[Config] ⚠️  配置文件 JSON 格式错误: {e}")
            return False
        except Exception as e:
            print(f"[Config] ❌ 配置文件加载失败: {e}")
            return False

    def update_cookie(self, cookie: str, user_agent: str = "") -> bool:
        """
        更新豆瓣 Cookie 并持久化
        
        通过 API 接口调用，支持：
        - 更新 Cookie 字符串
        - 可选更新 User-Agent
        
        Args:
            cookie: 新的豆瓣 Cookie 字符串
            user_agent: 新的 User-Agent 字符串（留空则不更新）
        
        Returns:
            保存成功返回 True
        """
        self.DOUBAN_COOKIE = cookie.strip()
        if user_agent.strip():
            self.DOUBAN_USER_AGENT = user_agent.strip()
        return self.save_to_file()

    def clear_cookie(self) -> bool:
        """
        清除豆瓣 Cookie 并持久化
        
        Returns:
            清除成功返回 True
        """
        self.DOUBAN_COOKIE = ""
        return self.save_to_file()

    # ==================== 数据导出方法 ====================

    def to_dict(self, safe: bool = True) -> Dict[str, Any]:
        """
        导出配置为字典
        
        Args:
            safe: 是否安全模式（默认 True，脱敏敏感字段）
                  True  → 隐藏 SECRET_KEY、NFC_ENCRYPTION_KEY，截断 Cookie
                  False → 返回完整配置（仅调试用，注意安全）
        
        Returns:
            配置字典
        """
        d = self.model_dump()

        if safe:
            # 脱敏处理
            for sensitive_key in ("SECRET_KEY", "NFC_ENCRYPTION_KEY"):
                d[sensitive_key] = "***"

            # Cookie 预览脱敏
            if d.get("DOUBAN_COOKIE"):
                cookie = d["DOUBAN_COOKIE"]
                d["DOUBAN_COOKIE"] = (
                    f"{cookie[:50]}..." if len(cookie) > 50 else "***"
                )

        return d

    def get_cookie_preview(self) -> str:
        """
        获取 Cookie 预览字符串
        
        用于前端展示 Cookie 配置状态，不暴露完整内容。
        
        短 Cookie（≤100 字符）：显示前 30 字符 + "..."
        长 Cookie（>100 字符）：显示 "前30字符...后30字符"
        空 Cookie：返回空字符串
        
        Returns:
            Cookie 预览字符串
        """
        cookie = self.DOUBAN_COOKIE
        if not cookie:
            return ""

        if len(cookie) <= 100:
            return f"{cookie[:30]}..."
        else:
            return f"{cookie[:30]}...{cookie[-30:]}"

    def get_log_config(self) -> Dict[str, Any]:
        """
        获取日志配置字典
        
        用于 loguru 的配置，整合所有日志相关参数。
        
        Returns:
            日志配置字典
        """
        return {
            "level": self.LOG_LEVEL,
            "format": self.LOG_FORMAT,
            "rotation": self.LOG_ROTATION,
            "retention": self.LOG_RETENTION,
            "diagnose": self.LOG_DIAGNOSE,
            "backtrace": self.LOG_BACKTRACE,
            "enqueue": self.LOG_ENQUEUE,
        }


# ==================== 全局单例 ====================

@lru_cache()
def get_settings() -> Settings:
    """
    获取 Settings 单例实例
    
    使用 lru_cache 确保整个应用生命周期中只有一个 Settings 实例，
    避免重复读取 .env 文件和配置文件。
    
    启动时会自动调用 load_from_file() 加载持久化的运行时配置。
    
    Returns:
        Settings 单例实例
    """
    s = Settings()
    s.load_from_file()
    return s


# 全局配置实例（模块导入时即创建单例）
settings = get_settings()


# ==================== 启动验证 ====================

def validate_config_on_startup() -> None:
    """
    应用启动时配置验证
    
    按顺序执行：
    1. 创建必要的目录（日志、图片缓存）
    2. 配置 loguru 日志系统
    3. 检查安全配置（SECRET_KEY、NFC_ENCRYPTION_KEY 是否使用默认值）
    4. 输出配置摘要信息
    
    警告级别：
    - SECRET_KEY 使用默认值 → ⚠️ 安全警告
    - NFC_ENCRYPTION_KEY 使用默认值 → ⚠️ 安全警告
    - Cookie 未配置 → 💡 功能提示
    - Cookie 已配置 → ✅ 正常
    """
    # ---- 1. 创建必要目录 ----
    directories_to_create = [
        settings.logs_dir_path,
    ]
    if settings.IMAGE_CACHE_ENABLED:
        directories_to_create.append(settings.image_cache_dir_path)

    for directory in directories_to_create:
        directory.mkdir(parents=True, exist_ok=True)
        print(f"[Config] 📁 目录已就绪: {directory}")

    # ---- 2. 安全检查 ----
    warnings = []
    if settings.SECRET_KEY == "change-me":
        warnings.append("SECRET_KEY 使用默认值，请在生产环境中修改")
    if settings.NFC_ENCRYPTION_KEY == "change-me":
        warnings.append("NFC_ENCRYPTION_KEY 使用默认值，请在生产环境中修改")

    for warning in warnings:
        print(f"[Config] ⚠️  {warning}")

    # ---- 3. 输出配置摘要 ----
    print(f"[Config] {'='*50}")
    print(f"[Config] 📋 {settings.APP_NAME} v{settings.APP_VERSION}")
    print(
        f"[Config]    • 运行模式: "
        f"{'🔧 开发' if settings.DEBUG else '🚀 生产'}"
    )
    print(f"[Config]    • 数据库: {settings.database_path}")
    print(
        f"[Config]    • 豆瓣 Cookie: "
        f"{'✅ 已配置' if settings.douban_configured else '💡 未配置（豆瓣同步功能不可用）'}"
    )
    print(
        f"[Config]    • 图片缓存: "
        f"{'✅ 启用' if settings.IMAGE_CACHE_ENABLED else '❌ 禁用'}"
        f"{' | 目录: ' + settings.IMAGE_CACHE_DIR if settings.IMAGE_CACHE_ENABLED else ''}"
        f"{' | 有效期: ' + str(settings.IMAGE_CACHE_MAX_AGE // 86400) + '天' if settings.IMAGE_CACHE_ENABLED else ''}"
    )
    print(
        f"[Config]    • 日志: 级别={settings.LOG_LEVEL} | "
        f"文件={settings.LOG_FILE} | "
        f"轮转={settings.LOG_ROTATION} | "
        f"保留={settings.LOG_RETENTION}"
    )
    print(f"[Config] {'='*50}")