# Story 4.7: Create Exception Handlers

### User Story
**As an** API developer
**I want** global exception handlers that convert exceptions to JSON responses
**So that** all errors are handled consistently without HTML responses

### Acceptance Criteria

- [x] **AC1**: Global exception handler catches all unhandled exceptions
- [x] **AC2**: HTTPException handler returns standard error format
- [x] **AC3**: RequestValidationError handler returns field-level errors
- [x] **AC4**: Database errors mapped to appropriate HTTP status (DatabaseError custom exception)
- [x] **AC5**: Stack traces only in debug mode (not production)

### Technical Specifications

**Files to Create**:
```
backend/app/
└── exceptions/
    ├── __init__.py
    └── handlers.py
```

**exceptions/handlers.py**:
```python
"""
Global exception handlers for the FastAPI application.

These handlers ensure all exceptions return consistent JSON responses.
"""
import logging
from typing import Union

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.config import settings
from app.schemas.errors import ErrorResponse, ErrorDetail, ValidationErrorResponse

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    """Register all global exception handlers."""

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        """
        Handle Pydantic validation errors from request parsing.

        Returns 422 with field-level error details.
        """
        errors = [
            ErrorDetail(
                loc=list(error["loc"]),
                msg=error["msg"],
                type=error["type"],
            )
            for error in exc.errors()
        ]

        response = ValidationErrorResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            message="Validation failed",
            errors=errors,
        )

        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=response.model_dump(mode="json"),
        )

    @app.exception_handler(ValueError)
    async def value_error_handler(
        request: Request,
        exc: ValueError,
    ) -> JSONResponse:
        """Handle ValueError as 400 Bad Request."""
        response = ErrorResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            message="Bad request",
            detail=str(exc),
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
        """Handle PermissionError as 403 Forbidden."""
        response = ErrorResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            message="Access denied",
            detail=str(exc) if settings.debug else None,
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

        Logs the full error but returns sanitized response to client.
        """
        # Log the full exception for debugging
        logger.exception(f"Unhandled exception: {exc}")

        # Return sanitized response
        response = ErrorResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            message="Internal server error",
            detail=str(exc) if settings.debug else "An unexpected error occurred",
        )

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=response.model_dump(mode="json"),
        )


class NotFoundError(Exception):
    """Resource not found exception."""
    def __init__(self, resource: str, identifier: str):
        self.resource = resource
        self.identifier = identifier
        super().__init__(f"{resource} with id '{identifier}' not found")


class ConflictError(Exception):
    """Resource conflict exception (e.g., duplicate)."""
    def __init__(self, message: str):
        super().__init__(message)


def register_custom_exception_handlers(app: FastAPI) -> None:
    """Register handlers for custom application exceptions."""

    @app.exception_handler(NotFoundError)
    async def not_found_handler(
        request: Request,
        exc: NotFoundError,
    ) -> JSONResponse:
        response = ErrorResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            message=f"{exc.resource} not found",
            detail=str(exc),
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
        response = ErrorResponse(
            status_code=status.HTTP_409_CONFLICT,
            message="Conflict",
            detail=str(exc),
        )

        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=response.model_dump(mode="json"),
        )
```

**Update main.py** to register handlers:
```python
from app.exceptions.handlers import (
    register_exception_handlers,
    register_custom_exception_handlers,
)

def create_app() -> FastAPI:
    app = FastAPI(...)

    # Register exception handlers
    register_exception_handlers(app)
    register_custom_exception_handlers(app)

    # ... rest of setup
```

### Definition of Done
- [x] All exceptions return JSON
- [x] Validation errors have field details
- [x] Production hides stack traces
- [x] Custom exceptions handled

### Estimated Time: 2 hours

### Completion Notes
- **Completed**: 2025-12-29
- **Files Created**:
  - `backend/app/exceptions/__init__.py` - Module exports
  - `backend/app/exceptions/handlers.py` - 7 exception handlers, 3 custom exceptions
  - `backend/tests/test_exception_handlers.py` - 101 tests
- **Modifications**:
  - `backend/app/main.py` - Registers exception handlers
  - `backend/app/schemas/errors.py` - Increased detail max_length to 10000 for debug tracebacks
- **Implementation Details**:
  - Standard handlers: RequestValidationError (422), HTTPException, ValueError (400), PermissionError (403), Exception (500)
  - Custom exceptions: NotFoundError (404), ConflictError (409), DatabaseError (500)
  - Debug mode includes full stack traces; production returns sanitized messages
- **Tests**: 1178 total tests passing with 99.61% coverage

---
