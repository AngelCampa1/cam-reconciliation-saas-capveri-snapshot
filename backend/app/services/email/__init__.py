"""Email service module."""

from app.services.email.factory import (
    DEFAULT_FROM_ADDRESS,
    build_email_service,
    get_email_service,
    normalize_from_address,
)
from app.services.email.resend_service import EmailService

__all__ = [
    "DEFAULT_FROM_ADDRESS",
    "EmailService",
    "build_email_service",
    "get_email_service",
    "normalize_from_address",
]
