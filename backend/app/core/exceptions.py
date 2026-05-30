"""统一异常体系 — 业务域异常分层定义

层次结构:
    BaseAppError          → 所有应用异常的基类
    ├── ValidationError  → 输入校验失败 (→ 422)
    ├── NotFoundError    → 资源不存在 (→ 404)
    ├── ConflictError    → 资源冲突 (→ 409)
    ├── ThirdPartyError  → 外部服务调用失败 (→ 502)
    └── InternalError    → 内部错误 (→ 500)

使用示例:
    raise NotFoundError("图书", book_id=42)
    raise ConflictError("ISBN", detail="9787544270878 已存在")
    raise ValidationError("ISBN 格式错误", field="isbn")
"""

from typing import Optional, Any, Dict
import uuid
import traceback


class BaseAppError(Exception):
    """应用异常基类 — 所有业务异常由此派生"""
    status_code: int = 500
    error_code: str = "INTERNAL_ERROR"

    def __init__(
        self, message: str = "服务器内部错误",
        detail: Optional[str] = None,
        trace_id: Optional[str] = None,
        **kwargs,
    ):
        super().__init__(message)
        self.message = message
        self.detail = detail or message
        self.trace_id = trace_id or str(uuid.uuid4())[:8]
        self.extra = kwargs

    def to_dict(self, debug: bool = False) -> Dict[str, Any]:
        result = {
            "code": self.status_code,
            "message": self.message,
            "detail": self.detail,
            "trace_id": self.trace_id,
        }
        if debug:
            result["_debug"] = {
                "exception": self.__class__.__name__,
                "extra": self.extra,
                "traceback": traceback.format_exc() if self.__traceback__ else None,
            }
        return result


# ═══════════════════════════════════════════
# 客户端错误 (4xx)
# ═══════════════════════════════════════════

class ValidationError(BaseAppError):
    """输入校验失败 — 映射 HTTP 422"""
    status_code = 422
    error_code = "VALIDATION_ERROR"

    def __init__(self, message: str = "输入校验失败", field: Optional[str] = None,
                 detail: Optional[str] = None, **kwargs):
        self.field = field
        super().__init__(
            message=message,
            detail=detail or (f"字段 '{field}' 校验失败" if field else message),
            field=field, **kwargs,
        )


class NotFoundError(BaseAppError):
    """资源不存在 — 映射 HTTP 404"""
    status_code = 404
    error_code = "NOT_FOUND"

    def __init__(self, entity: str = "资源", entity_id: Any = None,
                 detail: Optional[str] = None, **kwargs):
        msg = f"{entity}不存在" + (f" (id={entity_id})" if entity_id is not None else "")
        super().__init__(message=msg, detail=detail or msg, entity_id=entity_id, **kwargs)


class ConflictError(BaseAppError):
    """资源冲突 — 映射 HTTP 409"""
    status_code = 409
    error_code = "CONFLICT"

    def __init__(self, resource: str = "资源", detail: Optional[str] = None, **kwargs):
        msg = f"{resource}已存在或冲突"
        super().__init__(message=msg, detail=detail or msg, **kwargs)


class UnauthorizedError(BaseAppError):
    """未授权 — 映射 HTTP 401"""
    status_code = 401
    error_code = "UNAUTHORIZED"


class ForbiddenError(BaseAppError):
    """禁止访问 — 映射 HTTP 403"""
    status_code = 403
    error_code = "FORBIDDEN"


# ═══════════════════════════════════════════
# 服务端错误 (5xx)
# ═══════════════════════════════════════════

class ThirdPartyError(BaseAppError):
    """外部服务调用失败 — 映射 HTTP 502"""
    status_code = 502
    error_code = "THIRD_PARTY_ERROR"

    def __init__(self, service: str = "外部服务", detail: Optional[str] = None, **kwargs):
        msg = f"{service}调用失败"
        super().__init__(message=msg, detail=detail or msg, service=service, **kwargs)


class InternalError(BaseAppError):
    """内部错误 — 映射 HTTP 500"""
    status_code = 500
    error_code = "INTERNAL_ERROR"


# ═══════════════════════════════════════════
# 异常映射表
# ═══════════════════════════════════════════

EXCEPTION_STATUS_MAP = {
    ValidationError: 422,
    NotFoundError: 404,
    ConflictError: 409,
    UnauthorizedError: 401,
    ForbiddenError: 403,
    ThirdPartyError: 502,
    InternalError: 500,
    BaseAppError: 500,
}
