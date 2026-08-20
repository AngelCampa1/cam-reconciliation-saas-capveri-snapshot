"""Validation layer for GL entry ingestion.

Validates GL entries against business rules before database persistence.
Invalid rows are filtered out (not inserted) and warnings are returned
for user visibility. This ensures data quality while allowing partial
imports to succeed.

Validation Strategy: Filter & Warn
- Invalid rows are removed from the dataset
- Valid rows proceed to database insert
- Warnings are returned in API response
- Upload does NOT fail due to invalid rows (unless ALL rows invalid)
"""

import logging
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any, ClassVar

import pandas as pd
from pydantic import BaseModel, ConfigDict, field_validator

logger = logging.getLogger(__name__)


@dataclass
class GLValidationWarning:
    """Warning for suspicious but not invalid GL entries.

    Warnings allow the entry to proceed but flag it for review.
    Used for edge cases that might indicate data quality issues.
    """

    field: str
    message: str
    value: Any
    row_index: int | None = None
    severity: str = "warning"  # "warning" or "info"


@dataclass
class GLValidationError:
    """Critical validation error that prevents row insertion.

    Errors indicate invalid data that cannot be inserted:
    - Account code format violations
    - Unreasonable amounts (likely data errors)
    - Future transaction dates
    """

    field: str
    message: str
    value: Any = None
    row_index: int | None = None


@dataclass
class GLValidationResult:
    """Result of GL entry validation.

    Attributes:
        warnings: List of suspicious values (rows still inserted)
        errors: List of invalid rows (rows filtered out)
        valid_count: Number of valid rows that will be inserted
        invalid_count: Number of invalid rows filtered out
        is_valid: True if at least one valid row exists
    """

    warnings: list[GLValidationWarning] = field(default_factory=list)
    errors: list[GLValidationError] = field(default_factory=list)
    valid_count: int = 0
    invalid_count: int = 0

    @property
    def is_valid(self) -> bool:
        """Returns True if there are valid rows to insert."""
        return self.valid_count > 0


class ValidatedGLEntry(BaseModel):
    """Pydantic model for validating individual GL entry rows.

    Validates:
    - account_code: Must start with a digit (GL accounts are numeric)
    - amount: Must not exceed $100M (likely data error if larger)
    - transaction_date: Must not be in the future

    Example:
        ```python
        try:
            entry = ValidatedGLEntry(
                account_code="5100",
                amount=Decimal("1234.56"),
                transaction_date=date(2024, 1, 15),
                # ... other fields
            )
        except ValidationError as e:
            # Row is invalid, will be filtered out
            print(f"Validation failed: {e}")
        ```
    """

    model_config = ConfigDict(strict=True)

    # Business rule limits (ClassVar so Pydantic doesn't treat as fields)
    MAX_AMOUNT: ClassVar[Decimal] = Decimal("100000000")  # $100M sanity check
    MIN_YEAR: ClassVar[int] = 1990
    MAX_YEAR: ClassVar[int] = 2100

    account_code: str
    account_description: str | None = None
    amount: Decimal
    transaction_date: date
    period_year: int | None = None
    period_month: int | None = None
    vendor_name: str | None = None
    description: str | None = None

    @field_validator("account_code")
    @classmethod
    def must_start_with_digit(cls, v: str) -> str:
        """Account codes must start with a digit (GL convention)."""
        if not v:
            raise ValueError("Account code cannot be empty")
        if not v[0].isdigit():
            raise ValueError(
                f"Account code must start with a digit, got: '{v[:20]}...'"
                if len(v) > 20
                else f"Account code must start with a digit, got: '{v}'"
            )
        return v

    @field_validator("amount")
    @classmethod
    def reasonable_amount(cls, v: Decimal) -> Decimal:
        """Amount must not exceed $100M (likely data error)."""
        if abs(v) > cls.MAX_AMOUNT:
            raise ValueError(
                f"Amount ${v:,.2f} exceeds $100M sanity check - likely data error"
            )
        return v

    @field_validator("transaction_date")
    @classmethod
    def not_future_date(cls, v: date) -> date:
        """Transaction date cannot be in the future."""
        if v > date.today():
            raise ValueError(f"Transaction date {v} is in the future")
        return v

    @field_validator("period_year")
    @classmethod
    def valid_period_year(cls, v: int | None) -> int | None:
        """Period year must be reasonable (1990-2100)."""
        if v is not None:
            if v < cls.MIN_YEAR or v > cls.MAX_YEAR:
                raise ValueError(
                    f"Period year {v} outside valid range "
                    f"({cls.MIN_YEAR}-{cls.MAX_YEAR})"
                )
        return v

    @field_validator("period_month")
    @classmethod
    def valid_period_month(cls, v: int | None) -> int | None:
        """Period month must be 1-12."""
        if v is not None:
            if v < 1 or v > 12:
                raise ValueError(f"Period month {v} must be between 1-12")
        return v


def validate_gl_row(row: dict[str, Any], row_index: int) -> tuple[bool, list[str]]:
    """Validate a single GL entry row.

    Args:
        row: Dictionary of row data
        row_index: Original row index for error reporting

    Returns:
        Tuple of (is_valid, error_messages)
    """
    errors: list[str] = []

    # Convert types for validation
    try:
        # Handle amount
        amount = row.get("amount")
        if amount is None or (isinstance(amount, float) and pd.isna(amount)):
            errors.append("amount is missing or null")
        else:
            amount = Decimal(str(amount))

        # Handle transaction_date
        trans_date = row.get("transaction_date")
        is_null_trans_date = isinstance(trans_date, float) and pd.isna(trans_date)
        if trans_date is None or is_null_trans_date:
            errors.append("transaction_date is missing or null")
        elif isinstance(trans_date, str):
            trans_date = date.fromisoformat(trans_date)
        elif hasattr(trans_date, "date"):
            trans_date = trans_date.date()

        # Handle account_code
        account_code = row.get("account_code")
        is_null_account = isinstance(account_code, float) and pd.isna(account_code)
        if account_code is None or is_null_account:
            errors.append("account_code is missing or null")
        else:
            account_code = str(account_code)

        # If we have all required fields, validate with Pydantic
        if not errors and account_code and amount is not None and trans_date:
            amount_decimal = Decimal(str(amount))
            ValidatedGLEntry(
                account_code=str(account_code),
                account_description=row.get("account_description"),
                amount=amount_decimal,
                transaction_date=trans_date,
                period_year=_safe_int(row.get("period_year")),
                period_month=_safe_int(row.get("period_month")),
                vendor_name=row.get("vendor_name"),
                description=row.get("description"),
            )

    except Exception as e:
        errors.append(str(e))

    return len(errors) == 0, errors


def _safe_int(value: Any) -> int | None:
    """Safely convert value to int, returning None if not possible."""
    if value is None:
        return None
    if isinstance(value, float):
        if pd.isna(value):
            return None
        return int(value)
    if isinstance(value, int):
        return value
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def validate_gl_dataframe(
    df: pd.DataFrame,
    max_errors_to_report: int = 100,
) -> tuple[pd.DataFrame, GLValidationResult]:
    """Validate all rows in a GL entries DataFrame.

    Validates each row and returns:
    - DataFrame containing only valid rows
    - GLValidationResult with errors for invalid rows

    Invalid rows are filtered OUT of the returned DataFrame.
    This implements the "Filter & Warn" strategy.

    Args:
        df: DataFrame with GL entries to validate
        max_errors_to_report: Maximum number of errors to include in result
            (prevents huge error lists for badly formatted files)

    Returns:
        Tuple of (valid_rows_df, validation_result)

    Example:
        ```python
        valid_df, result = validate_gl_dataframe(parsed_df)

        if not result.is_valid:
            # ALL rows were invalid
            raise ValueError(f"No valid GL entries: {result.errors}")

        if result.invalid_count > 0:
            print(f"Filtered {result.invalid_count} invalid rows")
            for error in result.errors[:10]:
                print(f"  Row {error.row_index}: {error.message}")

        # Proceed with valid_df (only valid rows)
        persist_gl_entries(valid_df, ...)
        ```
    """
    if df.empty:
        return df, GLValidationResult(valid_count=0, invalid_count=0)

    warnings: list[GLValidationWarning] = []
    errors: list[GLValidationError] = []
    valid_mask = []

    for idx, row in df.iterrows():
        row_dict: dict[str, Any] = {str(k): v for k, v in row.to_dict().items()}
        row_index = int(idx) if isinstance(idx, int | float) else 0
        is_valid, row_errors = validate_gl_row(row_dict, row_index)

        valid_mask.append(is_valid)

        if not is_valid and len(errors) < max_errors_to_report:
            for error_msg in row_errors:
                errors.append(
                    GLValidationError(
                        field="row",
                        message=error_msg,
                        value=None,
                        row_index=row_index,
                    )
                )

        # Add warnings for edge cases (valid but suspicious)
        if is_valid:
            amount = row_dict.get("amount")
            if amount is not None:
                amount_val = Decimal(str(amount))
                # Warn on zero amounts
                if amount_val == 0:
                    warnings.append(
                        GLValidationWarning(
                            field="amount",
                            message="Amount is exactly zero",
                            value=amount_val,
                            row_index=row_index,
                            severity="info",
                        )
                    )
                # Warn on very large amounts (but under the hard limit)
                elif abs(amount_val) > Decimal("10000000"):  # $10M
                    warnings.append(
                        GLValidationWarning(
                            field="amount",
                            message=f"Large amount: ${amount_val:,.2f}",
                            value=amount_val,
                            row_index=row_index,
                            severity="warning",
                        )
                    )

    valid_df = df[valid_mask].copy()
    invalid_count = len(df) - len(valid_df)

    return valid_df, GLValidationResult(
        warnings=warnings,
        errors=errors,
        valid_count=len(valid_df),
        invalid_count=invalid_count,
    )
