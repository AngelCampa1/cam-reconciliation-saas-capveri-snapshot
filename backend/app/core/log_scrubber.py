"""
Log scrubbing filter for CapVeri.

Redacts PII (emails, names), credentials (JWT tokens), and sensitive
financial data (dollar amounts, Stripe IDs) from every log record before
it reaches the formatter. Safe for production log aggregation systems.
"""

import logging
import re
import traceback

# Ordered list of (compiled pattern, replacement) pairs.
# Order matters: more specific patterns appear first.
_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # JWT tokens — three base64url-encoded segments starting with "eyJ"
    (
        re.compile(r"eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+"),
        "[token]",
    ),
    # Stripe object IDs (cus_, sub_, in_, pi_, pm_, ch_, re_)
    (
        re.compile(r"\b(?:cus|sub|in|pi|pm|ch|re)_[A-Za-z0-9]{14,}\b"),
        "[stripe_id]",
    ),
    # Email addresses
    (
        re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"),
        "[email]",
    ),
    # Dollar amounts  (e.g. $1,234.56 or $99000)
    (
        re.compile(r"\$\s*[\d,]+(?:\.\d{1,4})?\b"),
        "[amount]",
    ),
    # Decimal object repr as logged by Python (e.g. Decimal('45000.00'),
    # Decimal('-45000.00'), Decimal('1E+7'))
    (
        re.compile(r"Decimal\('-?[0-9]+(?:\.[0-9]+)?(?:E[+-]?[0-9]+)?'\)"),
        "[amount]",
    ),
]

# Extra field names that must always be redacted regardless of value.
_SENSITIVE_FIELDS = frozenset(
    {
        "email",
        "full_name",
        "contact_email",
        "contact_name",
        "token",
        "password",
        "secret",
        "api_key",
    }
)


def scrub(text: str) -> str:
    """Apply all redaction patterns to *text* and return the sanitised string."""
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


class SensitiveDataFilter(logging.Filter):
    """Redacts PII and sensitive financial data from log records.

    Must be registered on a handler *before* the formatter runs so that
    neither JSONFormatter nor TextFormatter ever sees raw sensitive values.

    Usage::

        handler.addFilter(SensitiveDataFilter())
    """

    def filter(self, record: logging.LogRecord) -> bool:
        # Interpolate %-style args into the message string, then scrub.
        record.msg = scrub(record.getMessage())
        record.args = None  # prevent double-interpolation by the formatter

        # Scrub exception text so PII embedded in exception messages never
        # reaches the formatter via JSONFormatter.formatException().
        if record.exc_info:
            raw_tb = "".join(traceback.format_exception(*record.exc_info))
            record.exc_text = scrub(raw_tb)
            record.exc_info = None  # prevent re-formatting from the original

        # Redact known-sensitive extra fields set via logger.info(..., extra={...})
        for field in _SENSITIVE_FIELDS:
            if hasattr(record, field):
                setattr(record, field, "[redacted]")

        return True
