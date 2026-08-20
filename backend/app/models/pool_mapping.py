"""
PoolMapping domain types for GL account to expense pool mapping.

These Pydantic models support wildcard-based pattern matching for
automatic expense categorization. Patterns support:
- `*` matches any sequence of characters (e.g., '51*' matches '5100', '51234')
- `%` matches any sequence of characters (e.g., '51%' matches '5100', '51234')
- `?` matches exactly one character (e.g., '51??' matches '5100', '5199')
"""

import re
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

INVALID_PATTERN_MESSAGE = (
    "Pattern must contain only digits, wildcards (*, %, or ?), hyphens, or dots"
)


def is_valid_gl_pattern(pattern: str) -> bool:
    """
    Validate that a GL account pattern contains only valid characters.

    Valid characters:
    - Digits 0-9
    - Wildcard * (matches any sequence)
    - Wildcard % (matches any sequence)
    - Wildcard ? (matches single character)
    - Hyphen - (for account ranges like '5100-5199')
    - Dot . (for account codes like '5800.10')

    Args:
        pattern: The GL account pattern to validate

    Returns:
        True if pattern is valid, False otherwise
    """
    if not pattern:
        return False
    # Allow digits, wildcards (*, %, and ?), hyphens, and dots
    valid_pattern = re.compile(r"^[0-9*%?\-.]+$")
    return bool(valid_pattern.match(pattern))


def pattern_to_regex(pattern: str) -> str:
    """
    Convert a GL account pattern to a regex pattern.

    Args:
        pattern: GL pattern with *, %, and ? wildcards

    Returns:
        Regex pattern string
    """
    # Escape special regex chars except our wildcards
    escaped = re.escape(pattern)
    # Convert our wildcards to regex
    # \* becomes .* (any sequence)
    # % becomes .* (any sequence)
    # \? becomes . (single char)
    regex = escaped.replace(r"\*", ".*").replace("%", ".*").replace(r"\?", ".")
    return f"^{regex}$"


def matches_gl_pattern(gl_account: str, pattern: str) -> bool:
    """
    Check if a GL account matches a wildcard pattern.

    Args:
        gl_account: The GL account code to check
        pattern: The pattern with * and ? wildcards

    Returns:
        True if the account matches the pattern
    """
    regex = pattern_to_regex(pattern)
    return bool(re.match(regex, gl_account))


class PoolMapping(BaseModel):
    """
    Full PoolMapping model from database.

    Maps GL account patterns to expense pools for automatic
    expense categorization during reconciliation.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    expense_pool_id: UUID = Field(
        description="Expense pool to allocate matching entries to"
    )
    gl_account_pattern: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Pattern to match GL accounts (e.g., '51*', '5???')",
    )
    allocation_percentage: Decimal = Field(
        default=Decimal("1.0"),
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Portion of matching entries to allocate (1.0 = 100%)",
    )
    priority: int = Field(
        default=0,
        ge=0,
        description="Higher priority patterns evaluated first",
    )
    created_at: datetime
    updated_at: datetime

    @field_validator("gl_account_pattern")
    @classmethod
    def validate_pattern(cls, v: str) -> str:
        """Validate that the pattern contains only valid characters."""
        if not is_valid_gl_pattern(v):
            raise ValueError(INVALID_PATTERN_MESSAGE)
        return v


class PoolMappingCreate(BaseModel):
    """
    DTO for creating a pool mapping.

    Requires expense_pool_id and pattern. Defaults to 100% allocation
    and priority 0.
    """

    expense_pool_id: UUID
    gl_account_pattern: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Pattern to match GL accounts (e.g., '51*', '5???')",
    )
    allocation_percentage: Decimal = Field(
        default=Decimal("1.0"),
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Portion of matching entries to allocate (1.0 = 100%)",
    )
    priority: int = Field(
        default=0,
        ge=0,
        description="Higher priority patterns evaluated first",
    )

    @field_validator("gl_account_pattern")
    @classmethod
    def validate_pattern(cls, v: str) -> str:
        """Validate that the pattern contains only valid characters."""
        if not is_valid_gl_pattern(v):
            raise ValueError(INVALID_PATTERN_MESSAGE)
        return v


class PoolMappingUpdate(BaseModel):
    """
    DTO for updating a pool mapping.

    All fields are optional for partial updates.
    """

    gl_account_pattern: str | None = Field(
        None,
        min_length=1,
        max_length=50,
        description="Pattern to match GL accounts",
    )
    allocation_percentage: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Portion of matching entries to allocate",
    )
    priority: int | None = Field(
        None,
        ge=0,
        description="Higher priority patterns evaluated first",
    )

    @field_validator("gl_account_pattern")
    @classmethod
    def validate_pattern(cls, v: str | None) -> str | None:
        """Validate that the pattern contains only valid characters."""
        if v is not None and not is_valid_gl_pattern(v):
            raise ValueError(INVALID_PATTERN_MESSAGE)
        return v


class PoolMappingSummary(BaseModel):
    """
    Summary view of a pool mapping for list displays.

    Includes pattern info and optionally the pool name for display.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    expense_pool_id: UUID
    gl_account_pattern: str
    allocation_percentage: Decimal
    priority: int
    pool_name: str | None = Field(
        None,
        description="Name of the associated expense pool (for display)",
    )
