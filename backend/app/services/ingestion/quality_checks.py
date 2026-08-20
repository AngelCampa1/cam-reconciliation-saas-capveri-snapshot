"""Data quality monitoring for GL ingestion.

Provides runtime quality checks that detect anomalies after parsing.
These checks flag suspicious patterns that might indicate data issues:
- Unusually low row counts
- High error rates during parsing
- Suspicious amount distributions (all zeros, all same value)
- Potential duplicate transactions

Quality issues are returned as warnings/info for user visibility,
allowing them to review and decide whether to proceed with the import.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import pandas as pd

from app.services.ingestion.schemas import ParseResult


class QualitySeverity(str, Enum):
    """Severity level for quality issues."""

    INFO = "info"  # Informational, no action needed
    WARNING = "warning"  # Suspicious, user should review
    CRITICAL = "critical"  # Likely data problem, may want to reject


@dataclass
class QualityIssue:
    """A detected data quality issue.

    Attributes:
        check_name: Name of the check that detected the issue
        message: Human-readable description of the issue
        severity: How serious the issue is
        details: Additional context (counts, percentages, etc.)
    """

    check_name: str
    message: str
    severity: QualitySeverity
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class QualityCheckResult:
    """Result of running all quality checks.

    Attributes:
        issues: List of detected quality issues
        passed: True if no critical issues were found
        score: Quality score from 0-100 (100 = perfect)
    """

    issues: list[QualityIssue] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        """Returns True if no critical issues were found."""
        return not any(i.severity == QualitySeverity.CRITICAL for i in self.issues)

    @property
    def score(self) -> float:
        """Calculate quality score (0-100).

        Scoring:
        - Start at 100
        - Critical issues: -30 each
        - Warnings: -10 each
        - Info: -2 each
        - Minimum score is 0
        """
        score = 100.0
        for issue in self.issues:
            if issue.severity == QualitySeverity.CRITICAL:
                score -= 30
            elif issue.severity == QualitySeverity.WARNING:
                score -= 10
            else:
                score -= 2
        return max(0.0, score)

    @property
    def has_warnings(self) -> bool:
        """Returns True if any warnings or critical issues exist."""
        return any(
            i.severity in (QualitySeverity.WARNING, QualitySeverity.CRITICAL)
            for i in self.issues
        )


def check_row_count(
    result: ParseResult,
    min_expected: int = 10,
) -> QualityIssue | None:
    """Check if row count is suspiciously low.

    Args:
        result: ParseResult from parser
        min_expected: Minimum expected rows (default 10)

    Returns:
        QualityIssue if row count is concerning, None otherwise
    """
    if result.row_count == 0:
        return QualityIssue(
            check_name="row_count",
            message="No valid rows were parsed from the file",
            severity=QualitySeverity.CRITICAL,
            details={"row_count": 0, "error_count": result.error_count},
        )

    if result.row_count < min_expected:
        return QualityIssue(
            check_name="row_count",
            message=(
                f"Only {result.row_count} rows parsed - "
                f"expected at least {min_expected}"
            ),
            severity=QualitySeverity.WARNING,
            details={"row_count": result.row_count, "min_expected": min_expected},
        )

    return None


def check_error_rate(
    result: ParseResult,
    max_rate: float = 0.2,
) -> QualityIssue | None:
    """Check if parse error rate is too high.

    Args:
        result: ParseResult from parser
        max_rate: Maximum acceptable error rate (default 0.2 = 20%)

    Returns:
        QualityIssue if error rate is concerning, None otherwise
    """
    total_rows = result.row_count + result.error_count
    if total_rows == 0:
        return None

    error_rate = result.error_count / total_rows

    if error_rate > 0.5:
        return QualityIssue(
            check_name="error_rate",
            message=(
                f"{error_rate:.0%} of rows had parse errors - "
                f"majority of data is invalid"
            ),
            severity=QualitySeverity.CRITICAL,
            details={
                "error_rate": error_rate,
                "error_count": result.error_count,
                "total_rows": total_rows,
            },
        )

    if error_rate > max_rate:
        return QualityIssue(
            check_name="error_rate",
            message=(
                f"{error_rate:.0%} of rows had parse errors "
                f"(threshold: {max_rate:.0%})"
            ),
            severity=QualitySeverity.WARNING,
            details={
                "error_rate": error_rate,
                "error_count": result.error_count,
                "total_rows": total_rows,
                "max_rate": max_rate,
            },
        )

    return None


def check_zero_amounts(
    df: pd.DataFrame,
    max_rate: float = 0.5,
) -> QualityIssue | None:
    """Check if too many amounts are zero.

    High rates of zero amounts often indicate data entry errors
    or incorrect column mapping.

    Args:
        df: DataFrame with 'amount' column
        max_rate: Maximum acceptable zero rate (default 0.5 = 50%)

    Returns:
        QualityIssue if zero rate is concerning, None otherwise
    """
    if df.empty or "amount" not in df.columns:
        return None

    zero_count = (df["amount"] == 0).sum()
    total_count = len(df)
    zero_rate = zero_count / total_count

    if zero_rate > max_rate:
        severity = (
            QualitySeverity.CRITICAL if zero_rate > 0.8 else QualitySeverity.WARNING
        )
        return QualityIssue(
            check_name="zero_amounts",
            message=f"{zero_rate:.0%} of amounts are zero - possible data issue",
            severity=severity,
            details={
                "zero_rate": zero_rate,
                "zero_count": int(zero_count),
                "total_count": total_count,
            },
        )

    return None


def check_amount_distribution(
    df: pd.DataFrame,
) -> QualityIssue | None:
    """Check for suspicious amount distributions.

    Flags patterns like:
    - All amounts are identical (copy-paste error)
    - Total sum is zero (debits = credits, might be intentional)

    Args:
        df: DataFrame with 'amount' column

    Returns:
        QualityIssue if distribution is suspicious, None otherwise
    """
    if df.empty or "amount" not in df.columns or len(df) < 3:
        return None

    amounts = df["amount"].dropna()
    if len(amounts) < 3:
        return None

    # Check if all amounts are identical
    unique_amounts = amounts.nunique()
    if unique_amounts == 1 and len(amounts) > 5:
        return QualityIssue(
            check_name="amount_distribution",
            message=(
                f"All {len(amounts)} amounts are identical "
                f"({amounts.iloc[0]}) - possible copy-paste error"
            ),
            severity=QualitySeverity.WARNING,
            details={
                "unique_amounts": unique_amounts,
                "total_rows": len(amounts),
                "common_value": float(amounts.iloc[0]),
            },
        )

    # Check if total sum is zero (might be intentional for adjustments)
    total_sum = amounts.sum()
    if total_sum == 0 and len(amounts) > 10:
        return QualityIssue(
            check_name="amount_distribution",
            message="Total amount sums to zero - debits equal credits",
            severity=QualitySeverity.INFO,
            details={
                "total_sum": float(total_sum),
                "positive_sum": float(amounts[amounts > 0].sum()),
                "negative_sum": float(amounts[amounts < 0].sum()),
            },
        )

    return None


def check_duplicate_transactions(
    df: pd.DataFrame,
    max_rate: float = 0.1,
) -> QualityIssue | None:
    """Check for potential duplicate transactions.

    Identifies rows with identical (account_code, amount, transaction_date).

    Args:
        df: DataFrame with transaction data
        max_rate: Maximum acceptable duplicate rate (default 0.1 = 10%)

    Returns:
        QualityIssue if duplicate rate is concerning, None otherwise
    """
    required_cols = ["account_code", "amount", "transaction_date"]
    if df.empty or not all(col in df.columns for col in required_cols):
        return None

    if len(df) < 5:
        return None

    # Count duplicates based on key columns
    subset = df[required_cols].dropna()
    if len(subset) < 5:
        return None

    duplicate_mask = subset.duplicated(keep=False)
    duplicate_count = duplicate_mask.sum()
    duplicate_rate = duplicate_count / len(subset)

    if duplicate_rate > max_rate:
        # Get example duplicates
        duplicate_rows = subset[duplicate_mask].head(3)
        examples = duplicate_rows.to_dict("records")

        return QualityIssue(
            check_name="duplicate_transactions",
            message=f"{duplicate_rate:.0%} of transactions appear to be duplicates",
            severity=QualitySeverity.WARNING,
            details={
                "duplicate_rate": duplicate_rate,
                "duplicate_count": int(duplicate_count),
                "total_count": len(subset),
                "examples": examples[:3],
            },
        )

    return None


def run_all_quality_checks(
    result: ParseResult,
    min_rows: int = 10,
    max_error_rate: float = 0.2,
    max_zero_rate: float = 0.5,
    max_duplicate_rate: float = 0.1,
) -> QualityCheckResult:
    """Run all quality checks on a parse result.

    Args:
        result: ParseResult from parser
        min_rows: Minimum expected row count
        max_error_rate: Maximum acceptable parse error rate
        max_zero_rate: Maximum acceptable zero amount rate
        max_duplicate_rate: Maximum acceptable duplicate rate

    Returns:
        QualityCheckResult with all detected issues

    Example:
        ```python
        result = parser.parse(file, filename, property_id)
        quality = run_all_quality_checks(result)

        if not quality.passed:
            print(f"Critical issues found! Score: {quality.score}")
            for issue in quality.issues:
                print(f"  [{issue.severity}] {issue.message}")
        ```
    """
    issues: list[QualityIssue] = []

    # Run each check
    checks = [
        check_row_count(result, min_expected=min_rows),
        check_error_rate(result, max_rate=max_error_rate),
    ]

    # DataFrame-based checks (only if we have data)
    if result.data is not None and not result.data.empty:
        checks.extend(
            [
                check_zero_amounts(result.data, max_rate=max_zero_rate),
                check_amount_distribution(result.data),
                check_duplicate_transactions(result.data, max_rate=max_duplicate_rate),
            ]
        )

    # Collect non-None issues
    for check_result in checks:
        if check_result is not None:
            issues.append(check_result)

    return QualityCheckResult(issues=issues)
