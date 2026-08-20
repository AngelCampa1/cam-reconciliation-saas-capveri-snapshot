"""Tests for GL entry date filtering by accounting basis."""

from datetime import date

import pytest

from app.services.calculation.gl_date_filter import filter_gl_entries_by_basis


class TestFilterGLEntriesByBasis:
    """Tests for filter_gl_entries_by_basis."""

    def _make_entry(
        self,
        txn_date: str,
        accrual_date: str | None = None,
    ) -> dict:
        return {
            "id": "00000000-0000-0000-0000-000000000001",
            "account_code": "5100",
            "amount": "1000.00",
            "transaction_date": txn_date,
            "accrual_date": accrual_date,
        }

    def test_cash_basis_filters_by_transaction_date(self) -> None:
        """Cash basis uses transaction_date only."""
        entries = [
            self._make_entry("2024-03-15"),  # in period
            self._make_entry("2024-06-15"),  # out of period
        ]
        result = filter_gl_entries_by_basis(
            entries, "cash", date(2024, 1, 1), date(2024, 3, 31)
        )
        assert len(result) == 1
        assert result[0]["transaction_date"] == "2024-03-15"

    def test_cash_basis_ignores_accrual_date(self) -> None:
        """Cash basis ignores accrual_date even if it falls in period."""
        entries = [
            # txn_date outside period, accrual_date inside period
            self._make_entry("2024-06-15", accrual_date="2024-02-15"),
        ]
        result = filter_gl_entries_by_basis(
            entries, "cash", date(2024, 1, 1), date(2024, 3, 31)
        )
        assert len(result) == 0

    def test_accrual_basis_uses_accrual_date_when_present(self) -> None:
        """Accrual basis prefers accrual_date over transaction_date."""
        entries = [
            # txn_date outside period, accrual_date inside period
            self._make_entry("2024-06-15", accrual_date="2024-02-15"),
        ]
        result = filter_gl_entries_by_basis(
            entries, "accrual", date(2024, 1, 1), date(2024, 3, 31)
        )
        assert len(result) == 1

    def test_accrual_basis_falls_back_to_transaction_date(self) -> None:
        """Accrual basis uses transaction_date when accrual_date is None."""
        entries = [
            self._make_entry("2024-02-15"),  # no accrual_date, txn in period
        ]
        result = filter_gl_entries_by_basis(
            entries, "accrual", date(2024, 1, 1), date(2024, 3, 31)
        )
        assert len(result) == 1

    def test_accrual_basis_excludes_when_accrual_date_outside_period(self) -> None:
        """Accrual basis excludes entry when accrual_date is outside period."""
        entries = [
            # txn_date inside period, but accrual_date outside
            self._make_entry("2024-02-15", accrual_date="2024-06-15"),
        ]
        result = filter_gl_entries_by_basis(
            entries, "accrual", date(2024, 1, 1), date(2024, 3, 31)
        )
        assert len(result) == 0

    def test_handles_date_objects(self) -> None:
        """Works with date objects (not just strings)."""
        entries = [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "account_code": "5100",
                "amount": "500.00",
                "transaction_date": date(2024, 2, 15),
                "accrual_date": None,
            }
        ]
        result = filter_gl_entries_by_basis(
            entries, "cash", date(2024, 1, 1), date(2024, 3, 31)
        )
        assert len(result) == 1

    def test_invalid_basis_raises_value_error(self) -> None:
        """Invalid basis string raises ValueError."""
        entries = [self._make_entry("2024-02-15")]
        with pytest.raises(ValueError, match="Invalid accounting basis"):
            filter_gl_entries_by_basis(
                entries, "accural", date(2024, 1, 1), date(2024, 3, 31)
            )

    def test_skips_entries_with_null_transaction_date(self) -> None:
        """Entries with None transaction_date are silently skipped."""
        entries = [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "account_code": "5100",
                "amount": "500.00",
                "transaction_date": None,
                "accrual_date": None,
            }
        ]
        result = filter_gl_entries_by_basis(
            entries, "cash", date(2024, 1, 1), date(2024, 3, 31)
        )
        assert len(result) == 0

    def test_boundary_dates_inclusive(self) -> None:
        """Period start and end dates are inclusive."""
        entries = [
            self._make_entry("2024-01-01"),  # period start
            self._make_entry("2024-12-31"),  # period end
        ]
        result = filter_gl_entries_by_basis(
            entries, "cash", date(2024, 1, 1), date(2024, 12, 31)
        )
        assert len(result) == 2
