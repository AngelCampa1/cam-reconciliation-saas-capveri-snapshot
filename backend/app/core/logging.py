"""
Centralized logging configuration for CapVeri.

Provides:
- JSON structured logging for production (machine-parseable)
- Human-readable text logging for development
- Request correlation ID support
- Uvicorn integration for consistent log formatting
"""

import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from app.core.log_scrubber import SensitiveDataFilter

# Context variable for request correlation ID
correlation_id_var: ContextVar[str | None] = ContextVar("correlation_id", default=None)


def get_correlation_id() -> str | None:
    """Get the current request's correlation ID."""
    return correlation_id_var.get()


def set_correlation_id(correlation_id: str) -> None:
    """Set the correlation ID for the current request context."""
    correlation_id_var.set(correlation_id)


class CorrelationIdFilter(logging.Filter):
    """Logging filter that adds correlation_id to all log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        """Add correlation_id attribute to the log record."""
        record.correlation_id = get_correlation_id() or "-"
        return True


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging in production.

    Output format:
    {
        "timestamp": "2024-01-15T10:30:00.000Z",
        "level": "INFO",
        "logger": "app.services.ingestion.dispatcher",
        "message": "Registered parser: yardi",
        "correlation_id": "abc123-def456",
        "extra": {...}
    }
    """

    # Standard LogRecord attributes to exclude from extra
    STANDARD_ATTRS = frozenset(
        {
            "name",
            "msg",
            "args",
            "created",
            "filename",
            "funcName",
            "levelname",
            "levelno",
            "lineno",
            "module",
            "msecs",
            "pathname",
            "process",
            "processName",
            "relativeCreated",
            "stack_info",
            "exc_info",
            "exc_text",
            "thread",
            "threadName",
            "correlation_id",
            "message",
            "asctime",
            "taskName",
        }
    )

    def format(self, record: logging.LogRecord) -> str:
        """Format the log record as JSON."""
        log_data: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "correlation_id": getattr(record, "correlation_id", "-"),
        }

        # Add location info for errors
        if record.levelno >= logging.ERROR:
            log_data["location"] = {
                "file": record.pathname,
                "line": record.lineno,
                "function": record.funcName,
            }

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Add any extra fields from the log call
        extra = {
            k: v
            for k, v in record.__dict__.items()
            if k not in self.STANDARD_ATTRS and not k.startswith("_")
        }
        if extra:
            log_data["extra"] = extra

        return json.dumps(log_data, default=str)


class TextFormatter(logging.Formatter):
    """Human-readable formatter for development.

    Output format:
    2024-01-15 10:30:00.123 | INFO     | [abc123] app.services | Message
    """

    LEVEL_COLORS = {
        "DEBUG": "\033[36m",  # Cyan
        "INFO": "\033[32m",  # Green
        "WARNING": "\033[33m",  # Yellow
        "ERROR": "\033[31m",  # Red
        "CRITICAL": "\033[35m",  # Magenta
    }
    RESET = "\033[0m"

    def __init__(self, use_colors: bool = True) -> None:
        """Initialize the text formatter.

        Args:
            use_colors: Whether to use ANSI color codes in output.
        """
        super().__init__()
        self.use_colors = use_colors and sys.stderr.isatty()

    def format(self, record: logging.LogRecord) -> str:
        """Format the log record as human-readable text."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        level = record.levelname.ljust(8)
        correlation_id = getattr(record, "correlation_id", "-")
        # Truncate correlation ID to first 8 chars for readability
        correlation_short = correlation_id[:8] if correlation_id != "-" else "-"
        logger_name = record.name
        message = record.getMessage()

        if self.use_colors:
            color = self.LEVEL_COLORS.get(record.levelname, "")
            level = f"{color}{level}{self.RESET}"

        formatted = (
            f"{timestamp} | {level} | [{correlation_short}] {logger_name} | {message}"
        )

        if record.exc_info:
            formatted += "\n" + self.formatException(record.exc_info)

        return formatted


def configure_logging(
    log_level: str = "INFO",
    log_format: str = "json",
) -> None:
    """Configure the root logger and all application loggers.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_format: Output format ("json" for production, "text" for development)
    """
    # Convert string level to logging constant
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)

    # Create the appropriate formatter
    if log_format.lower() == "json":
        formatter: logging.Formatter = JSONFormatter()
    else:
        formatter = TextFormatter()

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    # Remove existing handlers to avoid duplicates
    root_logger.handlers.clear()

    # Add console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(numeric_level)
    console_handler.setFormatter(formatter)
    console_handler.addFilter(SensitiveDataFilter())
    console_handler.addFilter(CorrelationIdFilter())
    root_logger.addHandler(console_handler)

    # Set levels for third-party loggers to reduce noise
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(numeric_level)
    logging.getLogger("uvicorn.error").setLevel(numeric_level)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("botocore").setLevel(logging.WARNING)
    logging.getLogger("boto3").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def get_uvicorn_log_config(
    log_level: str = "INFO",
    log_format: str = "json",
) -> dict[str, Any]:
    """Get uvicorn logging configuration that matches application logging.

    This ensures uvicorn access logs and error logs use the same format
    as the application logs for consistent log aggregation.

    Args:
        log_level: Logging level string
        log_format: "json" or "text"

    Returns:
        Dictionary suitable for uvicorn.run(log_config=...)
    """
    formatter_class = (
        "app.core.logging.JSONFormatter"
        if log_format.lower() == "json"
        else "app.core.logging.TextFormatter"
    )

    return {
        "version": 1,
        "disable_existing_loggers": False,
        "filters": {
            "correlation_id": {
                "()": "app.core.logging.CorrelationIdFilter",
            },
            "sensitive_data": {
                "()": "app.core.log_scrubber.SensitiveDataFilter",
            },
        },
        "formatters": {
            "default": {
                "()": formatter_class,
            },
            "access": {
                "()": formatter_class,
            },
        },
        "handlers": {
            "default": {
                "formatter": "default",
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "filters": ["sensitive_data", "correlation_id"],
            },
            "access": {
                "formatter": "access",
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "filters": ["sensitive_data", "correlation_id"],
            },
        },
        "loggers": {
            "uvicorn": {
                "handlers": ["default"],
                "level": log_level.upper(),
                "propagate": False,
            },
            "uvicorn.error": {
                "handlers": ["default"],
                "level": log_level.upper(),
                "propagate": False,
            },
            "uvicorn.access": {
                "handlers": ["access"],
                "level": log_level.upper(),
                "propagate": False,
            },
        },
    }
