"""
Global exception handlers for the FastAPI application.

These handlers ensure all exceptions return consistent JSON responses
using the schemas defined in app.schemas.errors.
"""

import json
import logging
import traceback
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.core.sentry import capture_unexpected_exception
from app.schemas.errors import (
    ErrorDetail,
    ErrorResponse,
    ErrorSource,
    ValidationErrorResponse,
)

logger = logging.getLogger(__name__)


def _json_safe_ctx(ctx: dict[str, Any] | None) -> dict[str, Any] | None:
    """Make a Pydantic validation-error ``ctx`` safe to JSON-serialize.

    Pydantic v2 puts the raising exception object itself in the error's ctx
    (e.g. a custom field validator that ``raise ValueError(...)`` yields
    ``ctx == {"error": ValueError(...)}``). Copying that verbatim into the
    response makes ``model_dump(mode="json")`` fail, which degrades a clean
    422 into an opaque 400 ("Unable to serialize unknown type: ...") and leaks
    the internal exception class. Coerce any non-serializable value to its
    string form so the field-level error survives as a proper 422.
    """
    if not ctx:
        return None
    safe: dict[str, Any] = {}
    for key, value in ctx.items():
        try:
            json.dumps(value)
            safe[key] = value
        except (TypeError, ValueError):
            safe[key] = str(value)
    return safe


# Custom application exceptions


class NotFoundError(Exception):
    """
    Resource not found exception.

    Use this when a requested resource doesn't exist or is not accessible
    to the current user.

    Attributes:
        resource: Type of resource (e.g., "Property", "Lease")
        identifier: The ID or identifier that was not found
    """

    def __init__(self, resource: str, identifier: str):
        self.resource = resource
        self.identifier = identifier
        super().__init__(f"{resource} with id '{identifier}' not found")


class ConflictError(Exception):
    """
    Resource conflict exception.

    Use this when an operation would create a conflict, such as:
    - Duplicate unique values
    - Concurrent modification
    - State transition violations

    Attributes:
        message: Description of the conflict
        resource_type: Optional type of resource involved
        resource_id: Optional ID of the conflicting resource
    """

    def __init__(
        self,
        message: str,
        resource_type: str | None = None,
        resource_id: str | None = None,
    ):
        self.resource_type = resource_type
        self.resource_id = resource_id
        super().__init__(message)


class DatabaseError(Exception):
    """
    Database operation error.

    Use this to wrap database-specific errors with appropriate context.
    Helps map database errors to appropriate HTTP status codes.

    Attributes:
        message: User-friendly error message
        original_error: The original database exception (for logging)
    """

    def __init__(self, message: str, original_error: Exception | None = None):
        self.original_error = original_error
        super().__init__(message)


class BadRequestError(Exception):
    """
    Bad request exception.

    Use this when the client sends invalid or malformed request data
    that doesn't pass business logic validation.

    Attributes:
        message: Description of what makes the request invalid
    """

    def __init__(self, message: str):
        super().__init__(message)


class InvalidInvitationTokenError(Exception):
    """
    Invalid invitation token exception.

    Use this when a tenant invitation token is invalid, expired, used, or revoked.

    Attributes:
        reason: The reason the token is invalid (not_found, expired, used, revoked)
    """

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(f"Invalid invitation token: {reason}")


class ServiceUnavailableError(Exception):
    """External service temporarily unavailable (circuit breaker open)."""

    def __init__(
        self,
        service_name: str,
        original_error: Exception | None = None,
        retry_after: int = 60,
    ):
        self.service_name = service_name
        self.original_error = original_error
        self.retry_after = retry_after
        super().__init__(f"{service_name} service is temporarily unavailable")


def register_exception_handlers(app: FastAPI) -> None:
    """
    Register global exception handlers for standard exceptions.

    These handlers catch common exceptions and convert them to
    consistent JSON error responses.

    Args:
        app: The FastAPI application instance
    """

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        """
        Handle Pydantic validation errors from request parsing.

        Returns 422 with field-level error details matching the
        ValidationErrorResponse schema.
        """
        errors = [
            ErrorDetail(
                loc=list(error["loc"]),
                msg=error["msg"],
                type=error["type"],
                ctx=_json_safe_ctx(error.get("ctx")),
            )
            for error in exc.errors()
        ]

        response = ValidationErrorResponse(
            errors=errors,
            path=str(request.url.path),
            error_source=ErrorSource.USER_DATA,
        )

        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=response.model_dump(mode="json"),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        """
        Handle HTTPException and convert to standard error format.

        This ensures HTTPExceptions (including from FastAPI's HTTPBearer,
        Depends, etc.) return consistent JSON responses.
        """
        response = ErrorResponse(
            status_code=exc.status_code,
            message=_get_status_message(exc.status_code),
            detail=str(exc.detail) if exc.detail else None,
            path=str(request.url.path),
        )

        return JSONResponse(
            status_code=exc.status_code,
            content=response.model_dump(mode="json"),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(ValueError)
    async def value_error_handler(
        request: Request,
        exc: ValueError,
    ) -> JSONResponse:
        """
        Handle ValueError as 400 Bad Request.

        ValueErrors typically indicate invalid input that passed
        basic validation but failed business logic checks.
        """
        response = ErrorResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            message="Bad request",
            detail=str(exc),
            path=str(request.url.path),
            error_source=ErrorSource.SOFTWARE_LOGIC,
        )

        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=response.model_dump(mode="json"),
        )

    @app.exception_handler(PermissionError)
    async def permission_error_handler(
        request: Request,
        exc: PermissionError,
    ) -> JSONResponse:
        """
        Handle PermissionError as 403 Forbidden.

        PermissionErrors indicate the user is authenticated but
        lacks permission for the requested operation.
        """
        response = ErrorResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            message="Access denied",
            detail=str(exc) if settings.debug else None,
            path=str(request.url.path),
        )

        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content=response.model_dump(mode="json"),
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(
        request: Request,
        exc: Exception,
    ) -> JSONResponse:
        """
        Catch-all handler for unhandled exceptions.

        Logs the full exception for debugging but returns a sanitized
        response to the client. Stack traces are only included in
        debug mode.
        """
        # Log the full exception with stack trace for debugging
        logger.exception(
            "Unhandled exception on %s %s: %s", request.method, request.url.path, exc
        )
        capture_unexpected_exception(
            exc,
            operation="api.unhandled_exception",
            tags={
                "method": request.method,
                "path": str(request.url.path),
                "status_code": str(status.HTTP_500_INTERNAL_SERVER_ERROR),
            },
        )

        # Prepare detail message based on debug mode
        if settings.debug:
            detail = f"{type(exc).__name__}: {exc}\n\n{traceback.format_exc()}"
            detail = detail[:9900]
        else:
            detail = "An unexpected error occurred. Please try again later."

        response = ErrorResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            message="Internal server error",
            detail=detail,
            path=str(request.url.path),
            error_source=ErrorSource.SYSTEM_INFRASTRUCTURE,
        )

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=response.model_dump(mode="json"),
        )


def register_custom_exception_handlers(app: FastAPI) -> None:
    """
    Register handlers for custom application exceptions.

    These handlers convert domain-specific exceptions to
    appropriate HTTP responses.

    Args:
        app: The FastAPI application instance
    """

    @app.exception_handler(NotFoundError)
    async def not_found_handler(
        request: Request,
        exc: NotFoundError,
    ) -> JSONResponse:
        """
        Handle NotFoundError as 404 Not Found.

        Includes the resource type and identifier in the response
        for debugging purposes.
        """
        response = ErrorResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            message=f"{exc.resource} not found",
            detail=str(exc),
            path=str(request.url.path),
        )

        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=response.model_dump(mode="json"),
        )

    @app.exception_handler(ConflictError)
    async def conflict_handler(
        request: Request,
        exc: ConflictError,
    ) -> JSONResponse:
        """
        Handle ConflictError as 409 Conflict.

        Used for duplicate entries, concurrent modifications,
        or state transition violations.
        """
        response = ErrorResponse(
            status_code=status.HTTP_409_CONFLICT,
            message="Conflict",
            detail=str(exc),
            path=str(request.url.path),
        )

        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=response.model_dump(mode="json"),
        )

    @app.exception_handler(DatabaseError)
    async def database_error_handler(
        request: Request,
        exc: DatabaseError,
    ) -> JSONResponse:
        """
        Handle DatabaseError as 500 or 503.

        Logs the original database error for debugging but returns
        a user-friendly message to the client.
        """
        # Log the original error for debugging
        if exc.original_error:
            logger.exception(
                "Database error on %s %s: %s",
                request.method,
                request.url.path,
                exc.original_error,
            )
        capture_unexpected_exception(
            exc.original_error or exc,
            operation="api.database_error",
            tags={
                "method": request.method,
                "path": str(request.url.path),
                "status_code": str(status.HTTP_500_INTERNAL_SERVER_ERROR),
            },
        )

        response = ErrorResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            message="Database error",
            detail=str(exc) if settings.debug else "A database error occurred",
            path=str(request.url.path),
        )

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=response.model_dump(mode="json"),
        )

    @app.exception_handler(BadRequestError)
    async def bad_request_handler(
        request: Request,
        exc: BadRequestError,
    ) -> JSONResponse:
        """
        Handle BadRequestError as 400 Bad Request.

        Used for invalid input that passes validation but violates
        business logic rules.
        """
        response = ErrorResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            message="Bad Request",
            detail=str(exc),
            path=str(request.url.path),
        )

        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=response.model_dump(mode="json"),
        )

    @app.exception_handler(ServiceUnavailableError)
    async def service_unavailable_handler(
        request: Request,
        exc: ServiceUnavailableError,
    ) -> JSONResponse:
        if exc.original_error:
            logger.warning(
                "Circuit breaker open for %s: %s",
                exc.service_name,
                exc.original_error,
            )
        capture_unexpected_exception(
            exc.original_error or exc,
            operation="api.service_unavailable",
            tags={
                "method": request.method,
                "path": str(request.url.path),
                "status_code": str(status.HTTP_503_SERVICE_UNAVAILABLE),
                "service": exc.service_name,
            },
        )
        response = ErrorResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            message="Service unavailable",
            detail=str(exc),
            path=str(request.url.path),
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=response.model_dump(mode="json"),
            headers={"Retry-After": str(exc.retry_after)},
        )


def _get_status_message(status_code: int) -> str:
    """
    Get a human-readable message for an HTTP status code.

    Args:
        status_code: The HTTP status code

    Returns:
        A descriptive message for the status code
    """
    messages = {
        400: "Bad request",
        401: "Authentication required",
        403: "Access denied",
        404: "Not found",
        405: "Method not allowed",
        409: "Conflict",
        410: "Gone",
        422: "Validation failed",
        429: "Too many requests",
        500: "Internal server error",
        502: "Bad gateway",
        503: "Service unavailable",
        504: "Gateway timeout",
    }
    return messages.get(status_code, "Error")
