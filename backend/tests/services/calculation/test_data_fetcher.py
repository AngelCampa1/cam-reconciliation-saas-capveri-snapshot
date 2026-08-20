"""Tests for data fetcher helper functions."""

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.services.calculation.data_fetcher import (
    fetch_active_leases,
    fetch_all_tenant_cap_histories,
    fetch_tenant_cap_history,
)
from tests.conftest import MockQueryBuilder


class OrQueryBuilder(MockQueryBuilder):
    def or_(self, *_args, **_kwargs):
        return self


@pytest.fixture(autouse=False)
def no_versioned_terms(monkeypatch):
    """Patch out versioned term helpers so tests use recovery_profile fallback."""
    monkeypatch.setattr(
        "app.services.calculation.data_fetcher._fetch_effective_versions",
        lambda *a, **kw: {},
    )
    monkeypatch.setattr(
        "app.services.calculation.data_fetcher._check_multi_version_warnings",
        lambda *a, **kw: [],
    )


@pytest.fixture
def mock_supabase():
    """Create mock Supabase client."""
    return MagicMock()


@pytest.fixture
def lease_id():
    """Test lease ID."""
    return uuid4()


class TestFetchTenantCapHistory:
    """Tests for fetch_tenant_cap_history function."""

    def test_no_historical_data_first_year(self, mock_supabase, lease_id):
        """Should return empty history when no snapshots exist (first year)."""
        # Mock empty result - no historical snapshots
        empty_result = type("Result", (), {"data": []})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.lt.return_value.order.return_value.execute.return_value = (
            empty_result
        )

        result = fetch_tenant_cap_history(
            lease_id=lease_id,
            current_period_start=date(2024, 1, 1),
            client=mock_supabase,
        )

        assert result.prior_year_amount is None
        assert result.all_prior_amounts == []
        assert result.cap_base_year_amount is None

    def test_single_snapshot_no_base_year_filter(self, mock_supabase, lease_id):
        """Should handle single prior year snapshot without base_year filter."""
        # Mock single snapshot from 2023
        snapshot_data = [
            {
                "lease_id": str(lease_id),  # Include lease_id for batch grouping
                "period_start_date": "2023-01-01",
                "period_end_date": "2023-12-31",
                "tenant_share_after_cap": "5000.00",
            }
        ]
        snapshots_result = type("Result", (), {"data": snapshot_data})()
        # Update mock chain to match batch query pattern with .in_()
        mock_supabase.table.return_value.select.return_value.in_.return_value.eq.return_value.lt.return_value.order.return_value.execute.return_value = (
            snapshots_result
        )

        result = fetch_tenant_cap_history(
            lease_id=lease_id,
            current_period_start=date(2024, 1, 1),
            base_year=None,
            client=mock_supabase,
        )

        # Prior year amount is from most recent snapshot
        assert result.prior_year_amount == Decimal("5000.00")
        # All amounts includes the single snapshot
        assert result.all_prior_amounts == [Decimal("5000.00")]
        # Base year amount is first year's amount
        assert result.cap_base_year_amount == Decimal("5000.00")

    def test_multiple_snapshots_no_base_year_filter(self, mock_supabase, lease_id):
        """Should include all snapshots when no base_year filter specified."""
        # Mock three snapshots from 2021-2023
        snapshot_data = [
            {
                "lease_id": str(lease_id),  # Include lease_id for batch grouping
                "period_start_date": "2023-01-01",
                "period_end_date": "2023-12-31",
                "tenant_share_after_cap": "7000.00",
            },
            {
                "lease_id": str(lease_id),  # Include lease_id for batch grouping
                "period_start_date": "2022-01-01",
                "period_end_date": "2022-12-31",
                "tenant_share_after_cap": "6500.00",
            },
            {
                "lease_id": str(lease_id),  # Include lease_id for batch grouping
                "period_start_date": "2021-01-01",
                "period_end_date": "2021-12-31",
                "tenant_share_after_cap": "6000.00",
            },
        ]
        snapshots_result = type("Result", (), {"data": snapshot_data})()
        # Update mock chain to match batch query pattern with .in_()
        mock_supabase.table.return_value.select.return_value.in_.return_value.eq.return_value.lt.return_value.order.return_value.execute.return_value = (
            snapshots_result
        )

        result = fetch_tenant_cap_history(
            lease_id=lease_id,
            current_period_start=date(2024, 1, 1),
            base_year=None,
            client=mock_supabase,
        )

        # Prior year is most recent (2023)
        assert result.prior_year_amount == Decimal("7000.00")
        # All amounts sorted chronologically (2021 → 2022 → 2023)
        assert result.all_prior_amounts == [
            Decimal("6000.00"),
            Decimal("6500.00"),
            Decimal("7000.00"),
        ]
        # Base year amount is first chronologically (2021)
        assert result.cap_base_year_amount == Decimal("6000.00")

    def test_multiple_snapshots_with_base_year_filter_all_included(
        self, mock_supabase, lease_id
    ):
        """Should filter snapshots to only include base_year onwards."""
        # Mock three snapshots from 2021-2023
        # Base year 2022 should exclude 2021
        snapshot_data = [
            {
                "lease_id": str(lease_id),  # Include lease_id for batch grouping
                "period_start_date": "2023-01-01",
                "period_end_date": "2023-12-31",
                "tenant_share_after_cap": "7500.00",
            },
            {
                "lease_id": str(lease_id),  # Include lease_id for batch grouping
                "period_start_date": "2022-01-01",
                "period_end_date": "2022-12-31",
                "tenant_share_after_cap": "7000.00",
            },
            {
                "lease_id": str(lease_id),  # Include lease_id for batch grouping
                "period_start_date": "2021-01-01",
                "period_end_date": "2021-12-31",
                "tenant_share_after_cap": "6000.00",
            },
        ]
        snapshots_result = type("Result", (), {"data": snapshot_data})()
        # Update mock chain to match batch query pattern with .in_()
        mock_supabase.table.return_value.select.return_value.in_.return_value.eq.return_value.lt.return_value.order.return_value.execute.return_value = (
            snapshots_result
        )

        result = fetch_tenant_cap_history(
            lease_id=lease_id,
            current_period_start=date(2024, 1, 1),
            base_year=2022,
            client=mock_supabase,
        )

        # Prior year is still most recent (2023)
        assert result.prior_year_amount == Decimal("7500.00")
        # All amounts only includes 2022 onwards (excludes 2021)
        assert result.all_prior_amounts == [
            Decimal("7000.00"),
            Decimal("7500.00"),
        ]
        # Base year amount is first in filtered range (2022)
        assert result.cap_base_year_amount == Decimal("7000.00")

    def test_base_year_filter_excludes_all_snapshots(self, mock_supabase, lease_id):
        """Should return empty history if base_year is after all snapshots."""
        # Mock two snapshots from 2021-2022
        # Base year 2025 should exclude all
        snapshot_data = [
            {
                "lease_id": str(lease_id),  # Include lease_id for batch grouping
                "period_start_date": "2022-01-01",
                "period_end_date": "2022-12-31",
                "tenant_share_after_cap": "6500.00",
            },
            {
                "lease_id": str(lease_id),  # Include lease_id for batch grouping
                "period_start_date": "2021-01-01",
                "period_end_date": "2021-12-31",
                "tenant_share_after_cap": "6000.00",
            },
        ]
        snapshots_result = type("Result", (), {"data": snapshot_data})()
        # Update mock chain to match batch query pattern with .in_()
        mock_supabase.table.return_value.select.return_value.in_.return_value.eq.return_value.lt.return_value.order.return_value.execute.return_value = (
            snapshots_result
        )

        result = fetch_tenant_cap_history(
            lease_id=lease_id,
            current_period_start=date(2024, 1, 1),
            base_year=2025,
            client=mock_supabase,
        )

        # Prior year is still set (most recent)
        assert result.prior_year_amount == Decimal("6500.00")
        # But all_prior_amounts is empty (all filtered out)
        assert result.all_prior_amounts == []
        # Base year amount is None (no snapshots in range)
        assert result.cap_base_year_amount is None

    @patch("app.services.calculation.data_fetcher.get_supabase")
    def test_client_parameter_none_uses_default(self, mock_get_supabase, lease_id):
        """Should use get_supabase() when client parameter is None."""
        # Create mock client from get_supabase
        mock_client = MagicMock()
        mock_get_supabase.return_value = mock_client

        # Mock empty result
        empty_result = type("Result", (), {"data": []})()
        # Update mock chain to match batch query pattern with .in_()
        mock_client.table.return_value.select.return_value.in_.return_value.eq.return_value.lt.return_value.order.return_value.execute.return_value = (
            empty_result
        )

        # Call without client parameter
        result = fetch_tenant_cap_history(
            lease_id=lease_id,
            current_period_start=date(2024, 1, 1),
        )

        # Verify get_supabase was called
        mock_get_supabase.assert_called_once()
        # Verify result is still valid (using default client)
        assert result.prior_year_amount is None
        assert result.all_prior_amounts == []
        assert result.cap_base_year_amount is None

    def test_decimal_precision_preservation(self, mock_supabase, lease_id):
        """Should preserve Decimal precision for financial calculations."""
        # Mock snapshot with precise decimal values
        snapshot_data = [
            {
                "lease_id": str(lease_id),  # Include lease_id for batch grouping
                "period_start_date": "2023-01-01",
                "period_end_date": "2023-12-31",
                "tenant_share_after_cap": "5432.123456789",
            }
        ]
        snapshots_result = type("Result", (), {"data": snapshot_data})()
        # Update mock chain to match batch query pattern with .in_()
        mock_supabase.table.return_value.select.return_value.in_.return_value.eq.return_value.lt.return_value.order.return_value.execute.return_value = (
            snapshots_result
        )

        result = fetch_tenant_cap_history(
            lease_id=lease_id,
            current_period_start=date(2024, 1, 1),
            client=mock_supabase,
        )

        # Verify precision is preserved (not rounded to 2 decimals)
        assert result.prior_year_amount == Decimal("5432.123456789")
        assert result.all_prior_amounts[0] == Decimal("5432.123456789")
        assert result.cap_base_year_amount == Decimal("5432.123456789")
        # Verify type is Decimal, not float
        assert isinstance(result.prior_year_amount, Decimal)
        assert isinstance(result.all_prior_amounts[0], Decimal)
        assert isinstance(result.cap_base_year_amount, Decimal)

    def test_batch_history_includes_second_page_snapshots(self, mock_supabase):
        """Tenant cap history includes finalized snapshots beyond the first page."""
        lease_id = uuid4()
        snapshot_data = [
            {
                "lease_id": str(lease_id),
                "period_start_date": f"{1900 + index}-01-01",
                "period_end_date": f"{1900 + index}-12-31",
                "tenant_share_after_cap": "1.00",
                "status": "finalized",
            }
            for index in range(1001)
        ]

        mock_supabase.table.side_effect = lambda table_name: MockQueryBuilder(
            data=snapshot_data if table_name == "reconciliation_snapshots" else []
        )

        result = fetch_all_tenant_cap_histories(
            lease_ids=[lease_id],
            current_period_start=date(3000, 1, 1),
            client=mock_supabase,
        )[lease_id]

        assert result.prior_year_amount == Decimal("1.00")
        assert len(result.all_prior_amounts) == 1001
        assert sum(result.all_prior_amounts) == Decimal("1001.00")


@pytest.mark.usefixtures("no_versioned_terms")
class TestFetchActiveLeases:
    """Tests for fetch_active_leases function."""

    def test_fetch_active_leases_basic(self, mock_supabase):
        """Should fetch leases active during the period."""
        property_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        # Mock lease data
        lease_data = [
            {
                "id": str(uuid4()),
                "tenant_name": "Test Tenant",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": {
                    "pro_rata_share": "0.15",
                    "admin_fee_percentage": "0",
                    "cap_type": "none",
                },
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "1000",
                },
            }
        ]
        leases_result = type("Result", (), {"data": lease_data})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            leases_result
        )

        result = fetch_active_leases(
            property_id=property_id,
            period_start=period_start,
            period_end=period_end,
            client=mock_supabase,
        )

        assert len(result) == 1
        assert result[0].tenant_name == "Test Tenant"
        assert result[0].pro_rata_share == Decimal("0.15")
        assert result[0].admin_fee_percentage == Decimal("0")

    @patch("app.services.calculation.data_fetcher.get_supabase")
    def test_fetch_active_leases_default_client(self, mock_get_supabase):
        """Should use get_supabase() when client is None."""
        property_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        # Create mock client from get_supabase
        mock_client = MagicMock()
        mock_get_supabase.return_value = mock_client

        # Mock empty result
        empty_result = type("Result", (), {"data": []})()
        mock_client.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            empty_result
        )

        # Call without client parameter
        result = fetch_active_leases(
            property_id=property_id,
            period_start=period_start,
            period_end=period_end,
        )

        # Verify get_supabase was called
        mock_get_supabase.assert_called_once()
        # Verify result is valid (empty list)
        assert result == []


class TestFetchTenantCapHistoryEdgeCases:
    """Edge case tests for fetch_tenant_cap_history to improve coverage."""

    def test_corrupted_snapshot_with_invalid_date(self, mock_supabase, lease_id):
        """Should handle snapshot with malformed date gracefully."""
        # Mock snapshot with invalid date format
        snapshot_data = [
            {
                "lease_id": str(lease_id),  # Include lease_id for batch grouping
                "period_start_date": "invalid-date",
                "period_end_date": "2023-12-31",
                "tenant_share_after_cap": "5000.00",
            }
        ]
        snapshots_result = type("Result", (), {"data": snapshot_data})()
        # Update mock chain to match batch query pattern with .in_()
        mock_supabase.table.return_value.select.return_value.in_.return_value.eq.return_value.lt.return_value.order.return_value.execute.return_value = (
            snapshots_result
        )

        # Should raise exception when trying to parse invalid date
        with pytest.raises(ValueError):
            fetch_tenant_cap_history(
                lease_id=lease_id,
                current_period_start=date(2024, 1, 1),
                client=mock_supabase,
            )

    def test_snapshot_with_null_amount(self, mock_supabase, lease_id):
        """Should handle snapshot with null tenant_share_after_cap."""
        # Mock snapshot with null amount
        snapshot_data = [
            {
                "lease_id": str(lease_id),  # Include lease_id for batch grouping
                "period_start_date": "2023-01-01",
                "period_end_date": "2023-12-31",
                "tenant_share_after_cap": None,  # Null value
            }
        ]
        snapshots_result = type("Result", (), {"data": snapshot_data})()
        # Update mock chain to match batch query pattern with .in_()
        mock_supabase.table.return_value.select.return_value.in_.return_value.eq.return_value.lt.return_value.order.return_value.execute.return_value = (
            snapshots_result
        )

        # Should raise exception when trying to convert None to Decimal
        with pytest.raises(Exception):  # decimal.InvalidOperation or TypeError
            fetch_tenant_cap_history(
                lease_id=lease_id,
                current_period_start=date(2024, 1, 1),
                client=mock_supabase,
            )

    def test_snapshot_with_invalid_decimal_value(self, mock_supabase, lease_id):
        """Should handle snapshot with non-numeric amount value."""
        # Mock snapshot with invalid decimal
        snapshot_data = [
            {
                "lease_id": str(lease_id),  # Include lease_id for batch grouping
                "period_start_date": "2023-01-01",
                "period_end_date": "2023-12-31",
                "tenant_share_after_cap": "not-a-number",
            }
        ]
        snapshots_result = type("Result", (), {"data": snapshot_data})()
        # Update mock chain to match batch query pattern with .in_()
        mock_supabase.table.return_value.select.return_value.in_.return_value.eq.return_value.lt.return_value.order.return_value.execute.return_value = (
            snapshots_result
        )

        # Should raise exception when trying to convert to Decimal
        with pytest.raises(Exception):  # decimal.InvalidOperation
            fetch_tenant_cap_history(
                lease_id=lease_id,
                current_period_start=date(2024, 1, 1),
                client=mock_supabase,
            )

    def test_snapshot_with_negative_amount(self, mock_supabase, lease_id):
        """Should handle snapshot with negative tenant share (refund scenario)."""
        # Mock snapshot with negative amount (valid in case of refunds)
        snapshot_data = [
            {
                "lease_id": str(lease_id),  # Include lease_id for batch grouping
                "period_start_date": "2023-01-01",
                "period_end_date": "2023-12-31",
                "tenant_share_after_cap": "-500.00",  # Negative (refund)
            }
        ]
        snapshots_result = type("Result", (), {"data": snapshot_data})()
        # Update mock chain to match batch query pattern with .in_()
        mock_supabase.table.return_value.select.return_value.in_.return_value.eq.return_value.lt.return_value.order.return_value.execute.return_value = (
            snapshots_result
        )

        result = fetch_tenant_cap_history(
            lease_id=lease_id,
            current_period_start=date(2024, 1, 1),
            client=mock_supabase,
        )

        # Should accept negative values (refunds are valid)
        assert result.prior_year_amount == Decimal("-500.00")
        assert result.all_prior_amounts == [Decimal("-500.00")]
        assert result.cap_base_year_amount == Decimal("-500.00")

    def test_snapshot_with_zero_amount(self, mock_supabase, lease_id):
        """Should handle snapshot with zero tenant share."""
        # Mock snapshot with zero amount
        snapshot_data = [
            {
                "lease_id": str(lease_id),  # Include lease_id for batch grouping
                "period_start_date": "2023-01-01",
                "period_end_date": "2023-12-31",
                "tenant_share_after_cap": "0.00",
            }
        ]
        snapshots_result = type("Result", (), {"data": snapshot_data})()
        # Update mock chain to match batch query pattern with .in_()
        mock_supabase.table.return_value.select.return_value.in_.return_value.eq.return_value.lt.return_value.order.return_value.execute.return_value = (
            snapshots_result
        )

        result = fetch_tenant_cap_history(
            lease_id=lease_id,
            current_period_start=date(2024, 1, 1),
            client=mock_supabase,
        )

        # Should accept zero values
        assert result.prior_year_amount == Decimal("0.00")
        assert result.all_prior_amounts == [Decimal("0.00")]
        assert result.cap_base_year_amount == Decimal("0.00")


@pytest.mark.usefixtures("no_versioned_terms")
class TestAdminFeeKeyFix:
    """Tests for the admin_fee_percentage key fix."""

    def test_admin_fee_percentage_key_reads_correctly(self, mock_supabase):
        """admin_fee_percentage key is used (not admin_fee_percent)."""
        property_id = uuid4()
        lease_data = [
            {
                "id": str(uuid4()),
                "tenant_name": "Test Tenant",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": {
                    "pro_rata_share": "0.10",
                    "admin_fee_percentage": "0.15",
                    "cap_type": "none",
                },
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "1000",
                },
            }
        ]
        leases_result = type("Result", (), {"data": lease_data})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            leases_result
        )

        result = fetch_active_leases(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            client=mock_supabase,
        )

        assert result[0].admin_fee_percentage == Decimal("0.15")


@pytest.mark.usefixtures("no_versioned_terms")
class TestFetchActiveLeasesEdgeCases:
    """Edge case tests for fetch_active_leases to improve coverage."""

    def test_fetch_no_active_leases(self, mock_supabase):
        """Should return empty list when no leases are active."""
        property_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        # Mock empty result
        empty_result = type("Result", (), {"data": []})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            empty_result
        )

        result = fetch_active_leases(
            property_id=property_id,
            period_start=period_start,
            period_end=period_end,
            client=mock_supabase,
        )

        assert result == []

    def test_fetch_lease_with_missing_recovery_profile(self, mock_supabase):
        """Should handle lease with null recovery_profile."""
        property_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        # Mock lease data with null recovery_profile
        lease_data = [
            {
                "id": str(uuid4()),
                "tenant_name": "Test Tenant",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": None,  # Null profile
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "1000",
                },
            }
        ]
        leases_result = type("Result", (), {"data": lease_data})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            leases_result
        )

        # Should raise exception or skip lease with missing profile
        with pytest.raises((KeyError, TypeError, AttributeError)):
            fetch_active_leases(
                property_id=property_id,
                period_start=period_start,
                period_end=period_end,
                client=mock_supabase,
            )

    def test_fetch_lease_with_missing_unit_data(self, mock_supabase):
        """BUG-07: a unit-less lease (units IS NULL) is still reconciled.

        ``leases.unit_id`` is nullable (``ON DELETE SET NULL``) and ``property_id``
        is the authoritative anchor, so a property-linked lease with no unit row is
        a supported state. It must NOT be dropped or raise; tenant_sqft and
        unit_space_type simply fall back to None.
        """
        property_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        # Mock lease data with null units
        lease_data = [
            {
                "id": str(uuid4()),
                "tenant_name": "Test Tenant",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": {
                    "pro_rata_share": "0.15",
                    "admin_fee_percentage": "0",
                    "cap_type": "none",
                },
                "units": None,  # Null units (unit-less lease)
            }
        ]
        leases_result = type("Result", (), {"data": lease_data})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            leases_result
        )

        result = fetch_active_leases(
            property_id=property_id,
            period_start=period_start,
            period_end=period_end,
            client=mock_supabase,
        )

        assert len(result) == 1
        assert result[0].tenant_name == "Test Tenant"
        assert result[0].pro_rata_share == Decimal("0.15")
        assert result[0].tenant_sqft is None
        assert result[0].unit_space_type is None

    def test_fetch_lease_filters_by_authoritative_property_id(self, mock_supabase):
        """BUG-07: the query anchors on leases.property_id, not units.property_id.

        Regression guard for the previous ``units!inner`` + ``units.property_id``
        filter that silently excluded unit-less leases.
        """
        property_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        leases_result = type("Result", (), {"data": []})()
        select_mock = mock_supabase.table.return_value.select
        select_mock.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            leases_result
        )

        fetch_active_leases(
            property_id=property_id,
            period_start=period_start,
            period_end=period_end,
            client=mock_supabase,
        )

        # LEFT join (no !inner) so unit-less leases survive the embed.
        select_arg = select_mock.call_args.args[0]
        assert "units!inner" not in select_arg
        assert "units(" in select_arg
        # Filter on the authoritative lease column, not the embedded unit's.
        select_mock.return_value.eq.assert_called_once_with(
            "property_id", str(property_id)
        )

    def test_fetch_lease_with_invalid_pro_rata_share(self, mock_supabase):
        """Should validate pro_rata_share is in valid range."""
        property_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        # Mock lease data with out-of-range pro_rata_share
        lease_data = [
            {
                "id": str(uuid4()),
                "tenant_name": "Test Tenant",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": {
                    "pro_rata_share": "1.50",  # > 1.0 (invalid)
                    "admin_fee_percentage": "0",
                    "cap_type": "none",
                },
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "1000",
                },
            }
        ]
        leases_result = type("Result", (), {"data": lease_data})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            leases_result
        )

        # Should raise Pydantic validation error
        with pytest.raises(Exception):  # Could be ValidationError or ValueError
            fetch_active_leases(
                property_id=property_id,
                period_start=period_start,
                period_end=period_end,
                client=mock_supabase,
            )

    def test_fetch_multiple_active_leases(self, mock_supabase):
        """Should fetch and parse multiple active leases."""
        property_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        # Mock multiple lease data
        lease_data = [
            {
                "id": str(uuid4()),
                "tenant_name": "Tenant A",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": {
                    "pro_rata_share": "0.15",
                    "admin_fee_percentage": "0.10",
                    "cap_type": "none",
                },
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "1000",
                },
            },
            {
                "id": str(uuid4()),
                "tenant_name": "Tenant B",
                "start_date": "2024-06-01",
                "end_date": "2026-05-31",
                "recovery_profile": {
                    "pro_rata_share": "0.25",
                    "admin_fee_percentage": "0.15",
                    "cap_type": "cumulative",
                    "cap_rate": "0.05",
                },
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "2000",
                },
            },
        ]
        leases_result = type("Result", (), {"data": lease_data})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            leases_result
        )

        result = fetch_active_leases(
            property_id=property_id,
            period_start=period_start,
            period_end=period_end,
            client=mock_supabase,
        )

        assert len(result) == 2
        assert result[0].tenant_name == "Tenant A"
        assert result[0].pro_rata_share == Decimal("0.15")
        assert result[0].admin_fee_percentage == Decimal("0.10")
        assert result[0].tenant_sqft == Decimal("1000")

        assert result[1].tenant_name == "Tenant B"
        assert result[1].pro_rata_share == Decimal("0.25")
        assert result[1].admin_fee_percentage == Decimal("0.15")
        assert result[1].tenant_sqft == Decimal("2000")

    def test_fetch_active_leases_includes_second_page(self, mock_supabase):
        """Active lease fetch includes lease rows beyond Supabase's first page."""
        property_id = uuid4()
        lease_data = [
            {
                "id": str(uuid4()),
                "tenant_name": f"Tenant {index}",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": {
                    "pro_rata_share": "0.001",
                    "admin_fee_percentage": "0",
                    "cap_type": "none",
                },
                "property_id": str(property_id),
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "1000",
                },
            }
            for index in range(1001)
        ]

        mock_supabase.table.side_effect = lambda table_name: OrQueryBuilder(
            data=lease_data if table_name == "leases" else []
        )

        result = fetch_active_leases(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            client=mock_supabase,
        )

        assert len(result) == 1001
        assert result[-1].tenant_name == "Tenant 1000"


class TestVersionedTermLookup:
    """Tests for versioned term lookup in fetch_active_leases."""

    def test_prefers_versioned_terms_over_profile(self, mock_supabase):
        """When a term version exists, uses it instead of recovery_profile."""
        property_id = uuid4()
        lease_id = uuid4()
        version_id = uuid4()

        lease_data = [
            {
                "id": str(lease_id),
                "tenant_name": "Versioned Tenant",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": {
                    "pro_rata_share": "0.10",
                    "admin_fee_percentage": "0",
                    "cap_type": "none",
                },
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "1000",
                },
            }
        ]
        leases_result = type("Result", (), {"data": lease_data})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            leases_result
        )

        # Mock versioned term with DIFFERENT pro_rata_share
        version_data = {
            str(lease_id): {
                "id": str(version_id),
                "lease_id": str(lease_id),
                "pro_rata_share": "0.15000000",
                "admin_fee_percentage": "0.10000000",
                "cap_type": "non_cumulative",
                "cap_rate": "0.05000000",
                "base_year": 2024,
                "base_year_amount": "50000.00",
                "excluded_pools": [],
                "rsf_measurement_standard": None,
            }
        }

        with (
            patch(
                "app.services.calculation.data_fetcher._fetch_effective_versions",
                return_value=version_data,
            ),
            patch(
                "app.services.calculation.data_fetcher._check_multi_version_warnings",
                return_value=[],
            ),
        ):
            result = fetch_active_leases(
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
                client=mock_supabase,
            )

        assert len(result) == 1
        assert result[0].pro_rata_share == Decimal("0.15000000")
        assert result[0].admin_fee_percentage == Decimal("0.10000000")
        assert result[0].cap_type == "non_cumulative"
        assert result[0].term_version_id == version_id

    @pytest.mark.usefixtures("no_versioned_terms")
    def test_fallback_to_recovery_profile(self, mock_supabase):
        """Lease with no versions falls back to recovery_profile."""
        property_id = uuid4()
        lease_data = [
            {
                "id": str(uuid4()),
                "tenant_name": "Legacy Tenant",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": {
                    "pro_rata_share": "0.08",
                    "admin_fee_percentage": "0.15",
                    "cap_type": "none",
                },
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "500",
                },
            }
        ]
        leases_result = type("Result", (), {"data": lease_data})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            leases_result
        )

        result = fetch_active_leases(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            client=mock_supabase,
        )

        assert len(result) == 1
        assert result[0].pro_rata_share == Decimal("0.08")
        assert result[0].term_version_id is None

    def test_multi_version_notice(self, mock_supabase):
        """Logs when term versions are prorated inside a single period."""
        property_id = uuid4()
        lease_id = uuid4()

        lease_data = [
            {
                "id": str(lease_id),
                "tenant_name": "Multi-Version Tenant",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": {
                    "pro_rata_share": "0.10",
                    "admin_fee_percentage": "0",
                    "cap_type": "none",
                },
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "1000",
                },
            }
        ]
        leases_result = type("Result", (), {"data": lease_data})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            leases_result
        )

        expected_warnings = [
            f"Lease {lease_id} has 1 term version(s) with effective dates "
            "during the period (2024-07-01). Applying day-based proration."
        ]

        with (
            patch(
                "app.services.calculation.data_fetcher._fetch_effective_versions",
                return_value={},
            ),
            patch(
                "app.services.calculation.data_fetcher._check_multi_version_warnings",
                return_value=expected_warnings,
            ),
            patch("app.services.calculation.data_fetcher.logger") as mock_logger,
        ):
            fetch_active_leases(
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
                client=mock_supabase,
            )

        mock_logger.info.assert_called_once_with(expected_warnings[0])

    def test_mid_period_versions_are_split_into_day_prorated_terms(self, mock_supabase):
        """A mid-period amendment becomes dated term slices with day proration."""
        property_id = uuid4()
        lease_id = uuid4()
        first_version_id = uuid4()
        second_version_id = uuid4()

        lease_data = [
            {
                "id": str(lease_id),
                "tenant_name": "Expansion Tenant",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": {
                    "pro_rata_share": "0.10",
                    "admin_fee_percentage": "0",
                    "cap_type": "none",
                },
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "1000",
                },
            }
        ]
        version_rows = [
            {
                "id": str(first_version_id),
                "lease_id": str(lease_id),
                "effective_date": "2023-01-01",
                "pro_rata_share": "0.10000000",
                "admin_fee_percentage": "0.00000000",
                "cap_type": "none",
                "cap_rate": None,
                "base_year": None,
                "base_year_amount": None,
                "excluded_pools": [],
                "rsf_measurement_standard": None,
            },
            {
                "id": str(second_version_id),
                "lease_id": str(lease_id),
                "effective_date": "2024-07-01",
                "pro_rata_share": "0.20000000",
                "admin_fee_percentage": "0.00000000",
                "cap_type": "none",
                "cap_rate": None,
                "base_year": None,
                "base_year_amount": None,
                "excluded_pools": [],
                "rsf_measurement_standard": None,
            },
        ]

        leases_table = MagicMock()
        leases_table.select.return_value = leases_table
        leases_table.eq.return_value = leases_table
        leases_table.lte.return_value = leases_table
        leases_table.or_.return_value = leases_table
        leases_table.execute.return_value = type("Result", (), {"data": lease_data})()

        versions_table = MagicMock()
        versions_table.select.return_value = versions_table
        versions_table.in_.return_value = versions_table
        versions_table.lte.return_value = versions_table
        versions_table.order.return_value = versions_table
        versions_table.execute.return_value = type(
            "Result", (), {"data": version_rows}
        )()

        def table_for(name):
            return versions_table if name == "lease_term_versions" else leases_table

        mock_supabase.table.side_effect = table_for

        with (
            patch(
                "app.services.calculation.data_fetcher._fetch_effective_versions",
                return_value={str(lease_id): version_rows[0]},
            ),
            patch(
                "app.services.calculation.data_fetcher._check_multi_version_warnings",
                return_value=[
                    f"Lease {lease_id} has 1 term version(s) with effective dates "
                    "during the period (2024-07-01). Applying day-based proration."
                ],
            ),
            patch("app.services.calculation.data_fetcher.logger") as mock_logger,
        ):
            result = fetch_active_leases(
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
                client=mock_supabase,
            )

        assert len(result) == 2
        assert [term.term_version_id for term in result] == [
            first_version_id,
            second_version_id,
        ]
        assert [term.start_date for term in result] == [
            date(2024, 1, 1),
            date(2024, 7, 1),
        ]
        assert [term.end_date for term in result] == [
            date(2024, 6, 30),
            date(2024, 12, 31),
        ]
        assert result[0].proration_factor == Decimal("0.49726776")
        assert result[1].proration_factor == Decimal("0.50273224")
        assert result[0].pro_rata_share == Decimal("0.10000000")
        assert result[1].pro_rata_share == Decimal("0.20000000")
        mock_logger.warning.assert_not_called()


class TestAccountingBasisThreading:
    """Tests that accounting_basis is threaded from recovery_profile."""

    def test_accounting_basis_from_recovery_profile(
        self, mock_supabase, no_versioned_terms
    ):
        """accounting_basis flows from recovery_profile JSONB."""
        property_id = uuid4()
        lease_data = [
            {
                "id": str(uuid4()),
                "tenant_name": "Accrual Tenant",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": {
                    "pro_rata_share": "0.10",
                    "admin_fee_percentage": "0",
                    "cap_type": "none",
                    "accounting_basis": "accrual",
                },
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "1000",
                },
            }
        ]
        leases_result = type("Result", (), {"data": lease_data})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            leases_result
        )

        result = fetch_active_leases(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            client=mock_supabase,
        )

        assert len(result) == 1
        assert result[0].accounting_basis == "accrual"

    def test_accounting_basis_none_when_missing(
        self, mock_supabase, no_versioned_terms
    ):
        """accounting_basis is None when not in recovery_profile."""
        property_id = uuid4()
        lease_data = [
            {
                "id": str(uuid4()),
                "tenant_name": "Legacy Tenant",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": {
                    "pro_rata_share": "0.10",
                    "admin_fee_percentage": "0",
                    "cap_type": "none",
                },
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "1000",
                },
            }
        ]
        leases_result = type("Result", (), {"data": lease_data})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            leases_result
        )

        result = fetch_active_leases(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            client=mock_supabase,
        )

        assert len(result) == 1
        assert result[0].accounting_basis is None


@pytest.mark.usefixtures("no_versioned_terms")
class TestManagementFeeThreading:
    """Tests that management_fee_percentage is threaded from recovery terms."""

    def test_management_fee_from_recovery_profile(self, mock_supabase):
        """management_fee_percentage flows from recovery_profile JSONB."""
        property_id = uuid4()
        lease_data = [
            {
                "id": str(uuid4()),
                "tenant_name": "Mgmt Fee Tenant",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": {
                    "pro_rata_share": "0.10",
                    "admin_fee_percentage": "0",
                    "management_fee_percentage": "0.04",
                    "cap_type": "none",
                },
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "1000",
                },
            }
        ]
        leases_result = type("Result", (), {"data": lease_data})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            leases_result
        )

        result = fetch_active_leases(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            client=mock_supabase,
        )

        assert len(result) == 1
        assert result[0].management_fee_percentage == Decimal("0.04")
        # Distinct from admin fee — admin stays 0
        assert result[0].admin_fee_percentage == Decimal("0")

    def test_management_fee_none_when_missing(self, mock_supabase):
        """management_fee_percentage is None when absent (NULL = no cap found)."""
        property_id = uuid4()
        lease_data = [
            {
                "id": str(uuid4()),
                "tenant_name": "Legacy Tenant",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": {
                    "pro_rata_share": "0.10",
                    "admin_fee_percentage": "0",
                    "cap_type": "none",
                },
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "1000",
                },
            }
        ]
        leases_result = type("Result", (), {"data": lease_data})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            leases_result
        )

        result = fetch_active_leases(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            client=mock_supabase,
        )

        assert len(result) == 1
        assert result[0].management_fee_percentage is None


class TestManagementFeeVersionedThreading:
    """management_fee_percentage flows through the versioned-term path."""

    def test_management_fee_from_versioned_term(self, mock_supabase):
        """A term version's management_fee_percentage is applied (non-null branch)."""
        property_id = uuid4()
        lease_id = uuid4()
        version_id = uuid4()

        lease_data = [
            {
                "id": str(lease_id),
                "tenant_name": "Versioned Mgmt Tenant",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": {
                    "pro_rata_share": "0.10",
                    "admin_fee_percentage": "0",
                    "cap_type": "none",
                },
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "1000",
                },
            }
        ]
        leases_result = type("Result", (), {"data": lease_data})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            leases_result
        )

        version_data = {
            str(lease_id): {
                "id": str(version_id),
                "lease_id": str(lease_id),
                "pro_rata_share": "0.10000000",
                "admin_fee_percentage": "0.00000000",
                "management_fee_percentage": "0.04000000",
                "cap_type": "none",
                "cap_rate": None,
                "base_year": None,
                "base_year_amount": None,
                "excluded_pools": [],
                "rsf_measurement_standard": None,
            }
        }

        with (
            patch(
                "app.services.calculation.data_fetcher._fetch_effective_versions",
                return_value=version_data,
            ),
            patch(
                "app.services.calculation.data_fetcher._check_multi_version_warnings",
                return_value=[],
            ),
        ):
            result = fetch_active_leases(
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
                client=mock_supabase,
            )

        assert len(result) == 1
        assert result[0].management_fee_percentage == Decimal("0.04000000")
        assert result[0].term_version_id == version_id

    def test_management_fee_none_in_versioned_term(self, mock_supabase):
        """A term version without management_fee_percentage yields None branch."""
        property_id = uuid4()
        lease_id = uuid4()
        version_id = uuid4()

        lease_data = [
            {
                "id": str(lease_id),
                "tenant_name": "Versioned No-Mgmt Tenant",
                "start_date": "2023-01-01",
                "end_date": "2025-12-31",
                "recovery_profile": {
                    "pro_rata_share": "0.10",
                    "admin_fee_percentage": "0",
                    "cap_type": "none",
                },
                "units": {
                    "property_id": str(property_id),
                    "rentable_sqft": "1000",
                },
            }
        ]
        leases_result = type("Result", (), {"data": lease_data})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.lte.return_value.or_.return_value.execute.return_value = (
            leases_result
        )

        version_data = {
            str(lease_id): {
                "id": str(version_id),
                "lease_id": str(lease_id),
                "pro_rata_share": "0.10000000",
                "admin_fee_percentage": "0.00000000",
                "management_fee_percentage": None,
                "cap_type": "none",
                "cap_rate": None,
                "base_year": None,
                "base_year_amount": None,
                "excluded_pools": [],
                "rsf_measurement_standard": None,
            }
        }

        with (
            patch(
                "app.services.calculation.data_fetcher._fetch_effective_versions",
                return_value=version_data,
            ),
            patch(
                "app.services.calculation.data_fetcher._check_multi_version_warnings",
                return_value=[],
            ),
        ):
            result = fetch_active_leases(
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
                client=mock_supabase,
            )

        assert len(result) == 1
        assert result[0].management_fee_percentage is None


class _RecordingQuery:
    """Records every ``in_`` filter's value-count and supports the full chain.

    Used to prove BUG-09 stays fixed: the reconciliation fetch helpers must
    never pass more than DEFAULT_IN_CHUNK_SIZE ids into a single PostgREST
    ``in.(...)`` filter (which would overflow the URL and 414).
    """

    def __init__(self, in_call_sizes):
        self._in_call_sizes = in_call_sizes

    def select(self, *a, **k):
        return self

    def in_(self, _column, values):
        self._in_call_sizes.append(len(list(values)))
        return self

    def eq(self, *a, **k):
        return self

    def lt(self, *a, **k):
        return self

    def gt(self, *a, **k):
        return self

    def lte(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def range(self, _start, _end):
        return self

    def execute(self):
        return type("Result", (), {"data": []})()


class TestLargePropertyInFilterChunking:
    """Regression tests for BUG-09 (HTTP 414 on large properties)."""

    def test_cap_history_chunks_large_lease_id_list(self):
        from app.database.pagination import DEFAULT_IN_CHUNK_SIZE

        in_call_sizes: list[int] = []
        client = MagicMock()
        client.table.return_value = _RecordingQuery(in_call_sizes)

        lease_ids = [uuid4() for _ in range(345)]
        fetch_all_tenant_cap_histories(
            lease_ids=lease_ids,
            current_period_start=date(2024, 1, 1),
            base_year=None,
            client=client,
        )

        assert in_call_sizes, "expected at least one chunked in_() query"
        assert max(in_call_sizes) <= DEFAULT_IN_CHUNK_SIZE
        assert sum(in_call_sizes) == 345

    def test_fetch_active_leases_chunks_version_lookups(self):
        from app.database.pagination import DEFAULT_IN_CHUNK_SIZE

        n = 345
        lease_rows = [
            {
                "id": str(uuid4()),
                "tenant_name": f"T{i}",
                "start_date": "2020-01-01",
                "end_date": "2030-12-31",
                "units": None,
                "recovery_profile": {
                    "pro_rata_share": "0.001",
                    "admin_fee_percentage": "0",
                    "cap_type": "none",
                    "cap_rate": None,
                    "base_year": None,
                    "base_year_amount": None,
                    "excluded_pools": [],
                },
            }
            for i in range(n)
        ]
        in_call_sizes: list[int] = []

        def table(name):
            if name == "leases":
                q = MagicMock()
                q.select.return_value.eq.return_value.lte.return_value.or_.return_value.range.return_value.execute.return_value = type(  # noqa: E501
                    "Result", (), {"data": lease_rows}
                )()
                return q
            # lease_term_versions lookups go through the chunked helper
            return _RecordingQuery(in_call_sizes)

        client = MagicMock()
        client.table.side_effect = table
        # Force the multi-version branch so _fetch_period_versions also runs.
        client.rpc.return_value.execute.return_value = type(
            "Result", (), {"data": []}
        )()

        result = fetch_active_leases(
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            client=client,
        )

        assert len(result) == n
        # _check_multi_version_warnings ran against lease_term_versions, chunked.
        assert in_call_sizes, "expected chunked version lookups"
        assert max(in_call_sizes) <= DEFAULT_IN_CHUNK_SIZE
