"""Tests for GL data quality monitoring.

Tests the quality checks that detect anomalies after parsing.
"""

from datetime import date

import pandas as pd

from app.services.ingestion.quality_checks import (
    QualityCheckResult,
    QualityIssue,
    QualitySeverity,
    check_amount_distribution,
    check_duplicate_transactions,
    check_error_rate,
    check_row_count,
    check_zero_amounts,
    run_all_quality_checks,
)
from app.services.ingestion.schemas import ParseResult


def make_parse_result(
    row_count: int = 100,
    error_count: int = 0,
    data: pd.DataFrame | None = None,
) -> ParseResult:
    """Helper to create ParseResult for testing."""
    if data is None:
        data = pd.DataFrame()
    return ParseResult(
        success=error_count == 0,
        source_system="test",
        data=data,
        row_count=row_count,
        error_count=error_count,
        errors=[],
        warnings=[],
    )


class TestCheckRowCount:
    """Tests for check_row_count function."""

    def test_zero_rows_is_critical(self):
        """Zero rows is a critical issue."""
        result = make_parse_result(row_count=0)
        issue = check_row_count(result)

        assert issue is not None
        assert issue.severity == QualitySeverity.CRITICAL
        assert "No valid rows" in issue.message

    def test_low_row_count_is_warning(self):
        """Low row count is a warning."""
        result = make_parse_result(row_count=5, error_count=0)
        issue = check_row_count(result, min_expected=10)

        assert issue is not None
        assert issue.severity == QualitySeverity.WARNING
        assert "Only 5 rows" in issue.message

    def test_sufficient_rows_passes(self):
        """Sufficient row count passes."""
        result = make_parse_result(row_count=100)
        issue = check_row_count(result, min_expected=10)

        assert issue is None

    def test_custom_min_expected(self):
        """Custom min_expected is respected."""
        result = make_parse_result(row_count=50)
        assert check_row_count(result, min_expected=100) is not None
        assert check_row_count(result, min_expected=50) is None


class TestCheckErrorRate:
    """Tests for check_error_rate function."""

    def test_majority_errors_is_critical(self):
        """Over 50% error rate is critical."""
        result = make_parse_result(row_count=40, error_count=60)
        issue = check_error_rate(result)

        assert issue is not None
        assert issue.severity == QualitySeverity.CRITICAL
        assert "60%" in issue.message

    def test_high_error_rate_is_warning(self):
        """Error rate above threshold is warning."""
        result = make_parse_result(row_count=70, error_count=30)
        issue = check_error_rate(result, max_rate=0.2)

        assert issue is not None
        assert issue.severity == QualitySeverity.WARNING
        assert "30%" in issue.message

    def test_acceptable_error_rate_passes(self):
        """Acceptable error rate passes."""
        result = make_parse_result(row_count=90, error_count=10)
        issue = check_error_rate(result, max_rate=0.2)

        assert issue is None

    def test_zero_errors_passes(self):
        """Zero errors passes."""
        result = make_parse_result(row_count=100, error_count=0)
        issue = check_error_rate(result)

        assert issue is None

    def test_empty_result_passes(self):
        """Empty result (no rows) passes without error."""
        result = make_parse_result(row_count=0, error_count=0)
        issue = check_error_rate(result)

        assert issue is None


class TestCheckZeroAmounts:
    """Tests for check_zero_amounts function."""

    def test_many_zeros_is_warning(self):
        """Over 50% zero amounts is warning."""
        df = pd.DataFrame({"amount": [0, 0, 0, 0, 0, 100]})  # 83% zeros
        issue = check_zero_amounts(df, max_rate=0.5)

        assert issue is not None
        assert issue.severity == QualitySeverity.CRITICAL  # Over 80%
        assert "83%" in issue.message

    def test_some_zeros_is_warning(self):
        """50-80% zeros is warning."""
        df = pd.DataFrame({"amount": [0, 0, 0, 100, 100]})  # 60% zeros
        issue = check_zero_amounts(df, max_rate=0.5)

        assert issue is not None
        assert issue.severity == QualitySeverity.WARNING

    def test_few_zeros_passes(self):
        """Few zero amounts passes."""
        df = pd.DataFrame({"amount": [0, 100, 200, 300, 400]})  # 20% zeros
        issue = check_zero_amounts(df, max_rate=0.5)

        assert issue is None

    def test_empty_dataframe_passes(self):
        """Empty DataFrame passes."""
        df = pd.DataFrame(columns=["amount"])
        issue = check_zero_amounts(df)

        assert issue is None

    def test_missing_amount_column_passes(self):
        """Missing amount column passes."""
        df = pd.DataFrame({"other": [1, 2, 3]})
        issue = check_zero_amounts(df)

        assert issue is None


class TestCheckAmountDistribution:
    """Tests for check_amount_distribution function."""

    def test_all_identical_is_warning(self):
        """All identical amounts is warning."""
        df = pd.DataFrame({"amount": [100.0] * 10})
        issue = check_amount_distribution(df)

        assert issue is not None
        assert issue.severity == QualitySeverity.WARNING
        assert "identical" in issue.message

    def test_varied_amounts_passes(self):
        """Varied amounts passes."""
        df = pd.DataFrame({"amount": [100, 200, 300, 400, 500]})
        issue = check_amount_distribution(df)

        assert issue is None

    def test_zero_sum_is_info(self):
        """Zero sum is info (might be intentional)."""
        df = pd.DataFrame({"amount": [100, 200, 300, -300, -200, -100] * 3})
        issue = check_amount_distribution(df)

        assert issue is not None
        assert issue.severity == QualitySeverity.INFO
        assert "zero" in issue.message.lower()

    def test_small_dataset_skipped(self):
        """Small datasets are skipped."""
        df = pd.DataFrame({"amount": [100, 100]})
        issue = check_amount_distribution(df)

        assert issue is None


class TestCheckDuplicateTransactions:
    """Tests for check_duplicate_transactions function."""

    def test_many_duplicates_is_warning(self):
        """High duplicate rate is warning."""
        df = pd.DataFrame(
            {
                "account_code": ["5100"] * 10,
                "amount": [100.0] * 10,
                "transaction_date": [date(2024, 1, 15)] * 10,
            }
        )
        issue = check_duplicate_transactions(df, max_rate=0.1)

        assert issue is not None
        assert issue.severity == QualitySeverity.WARNING
        assert "duplicate" in issue.message.lower()

    def test_unique_transactions_passes(self):
        """Unique transactions passes."""
        df = pd.DataFrame(
            {
                "account_code": ["5100", "5200", "5300", "5400", "5500"],
                "amount": [100.0, 200.0, 300.0, 400.0, 500.0],
                "transaction_date": [date(2024, 1, i) for i in range(1, 6)],
            }
        )
        issue = check_duplicate_transactions(df)

        assert issue is None

    def test_small_dataset_skipped(self):
        """Small datasets are skipped."""
        df = pd.DataFrame(
            {
                "account_code": ["5100", "5100"],
                "amount": [100.0, 100.0],
                "transaction_date": [date(2024, 1, 15), date(2024, 1, 15)],
            }
        )
        issue = check_duplicate_transactions(df)

        assert issue is None

    def test_missing_columns_skipped(self):
        """Missing required columns skipped."""
        df = pd.DataFrame({"amount": [100, 200, 300, 400, 500]})
        issue = check_duplicate_transactions(df)

        assert issue is None


class TestRunAllQualityChecks:
    """Tests for run_all_quality_checks function."""

    def test_healthy_data_passes(self):
        """Healthy data passes all checks."""
        df = pd.DataFrame(
            {
                "account_code": [f"51{i:02d}" for i in range(50)],
                "amount": [100.0 + i * 10 for i in range(50)],
                "transaction_date": [date(2024, 1, 15)] * 50,
            }
        )
        result = make_parse_result(row_count=50, error_count=0, data=df)

        quality = run_all_quality_checks(result)

        assert quality.passed is True
        assert quality.score >= 90

    def test_unhealthy_data_fails(self):
        """Unhealthy data fails checks."""
        df = pd.DataFrame(
            {
                "account_code": ["5100"] * 20,
                "amount": [0.0] * 20,
                "transaction_date": [date(2024, 1, 15)] * 20,
            }
        )
        result = make_parse_result(row_count=20, error_count=80, data=df)

        quality = run_all_quality_checks(result)

        assert quality.passed is False
        assert quality.score < 50
        assert len(quality.issues) > 0

    def test_returns_all_issues(self):
        """Returns issues from all checks."""
        df = pd.DataFrame(
            {
                "account_code": ["5100"] * 5,  # All same
                "amount": [0.0] * 5,  # All zeros
                "transaction_date": [date(2024, 1, 15)] * 5,
            }
        )
        result = make_parse_result(row_count=5, error_count=95, data=df)

        quality = run_all_quality_checks(result)

        # Should have issues from: row_count, error_rate, zero_amounts
        assert len(quality.issues) >= 2


class TestQualityCheckResult:
    """Tests for QualityCheckResult dataclass."""

    def test_passed_with_no_critical(self):
        """Passed is True with no critical issues."""
        result = QualityCheckResult(
            issues=[
                QualityIssue("test", "warning", QualitySeverity.WARNING),
                QualityIssue("test", "info", QualitySeverity.INFO),
            ]
        )
        assert result.passed is True

    def test_failed_with_critical(self):
        """Passed is False with critical issues."""
        result = QualityCheckResult(
            issues=[
                QualityIssue("test", "critical", QualitySeverity.CRITICAL),
            ]
        )
        assert result.passed is False

    def test_score_calculation(self):
        """Score is calculated correctly."""
        result = QualityCheckResult(
            issues=[
                QualityIssue("test", "critical", QualitySeverity.CRITICAL),  # -30
                QualityIssue("test", "warning", QualitySeverity.WARNING),  # -10
                QualityIssue("test", "info", QualitySeverity.INFO),  # -2
            ]
        )
        assert result.score == 58  # 100 - 30 - 10 - 2

    def test_score_minimum_is_zero(self):
        """Score minimum is 0."""
        result = QualityCheckResult(
            issues=[
                QualityIssue("test", "critical", QualitySeverity.CRITICAL),
                QualityIssue("test", "critical", QualitySeverity.CRITICAL),
                QualityIssue("test", "critical", QualitySeverity.CRITICAL),
                QualityIssue("test", "critical", QualitySeverity.CRITICAL),
            ]
        )
        assert result.score == 0

    def test_empty_issues_perfect_score(self):
        """Empty issues gives perfect score."""
        result = QualityCheckResult(issues=[])
        assert result.score == 100
        assert result.passed is True

    def test_has_warnings_property(self):
        """has_warnings property works correctly."""
        no_warnings = QualityCheckResult(
            issues=[
                QualityIssue("test", "info", QualitySeverity.INFO),
            ]
        )
        assert no_warnings.has_warnings is False

        with_warnings = QualityCheckResult(
            issues=[
                QualityIssue("test", "warning", QualitySeverity.WARNING),
            ]
        )
        assert with_warnings.has_warnings is True
