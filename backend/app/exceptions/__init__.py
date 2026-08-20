"""
Exception handling module.

Provides global exception handlers and custom application exceptions
to ensure all errors return consistent JSON responses.
"""

from app.exceptions.handlers import (
    BadRequestError,
    ConflictError,
    DatabaseError,
    NotFoundError,
    ServiceUnavailableError,
    register_custom_exception_handlers,
    register_exception_handlers,
)

__all__ = [
    # Registration functions
    "register_exception_handlers",
    "register_custom_exception_handlers",
    # Custom exceptions
    "BadRequestError",
    "ConflictError",
    "DatabaseError",
    "NotFoundError",
    "ServiceUnavailableError",
]
