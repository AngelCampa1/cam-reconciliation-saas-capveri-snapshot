"""Tests for data_fetcher.py - lease data retrieval functions."""

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.services.calculation.data_fetcher import fetch_active_leases
from app.services.calculation.tenant_share import LeaseTerms


@pytest.fixture(autouse=True)
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


class TestFetchActiveLeases:
    """Test fetch_active_leases function."""

    def test_fetch_active_leases_basic(self):
        """Fetch active leases for a property during period."""
        property_id = uuid4()
        lease_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        # Mock Supabase client
        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table

        # Mock query chain
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.lte.return_value = mock_table
        mock_table.or_.return_value = mock_table
        mock_table.execute.return_value = MagicMock(
            data=[
                {
                    "id": str(lease_id),
                    "tenant_name": "Test Tenant",
                    "recovery_profile": {
                        "pro_rata_share": "0.15",
                        "admin_fee_percentage": "0.10",
                        "base_year": 2023,
                        "base_year_amount": "50000.00",
                        "cap_type": "cumulative",
                        "cap_rate": "0.05",
                        "excluded_pools": ["pool1"],
                        "expense_stops": {"utilities": "5000.00"},
                    },
                    "units": {"property_id": str(property_id), "rentable_sqft": "2500"},
                }
            ]
        )

        result = fetch_active_leases(property_id, period_start, period_end, mock_client)

        assert len(result) == 1
        lease = result[0]
        assert isinstance(lease, LeaseTerms)
        assert lease.lease_id == lease_id
        assert lease.tenant_name == "Test Tenant"
        assert lease.pro_rata_share == Decimal("0.15")
        assert lease.admin_fee_percentage == Decimal("0.10")
        assert lease.tenant_sqft == Decimal("2500")
        assert lease.base_year == 2023
        assert lease.base_year_amount == Decimal("50000.00")
        assert lease.cap_type == "cumulative"
        assert lease.cap_rate == Decimal("0.05")
        assert lease.excluded_pools == ["pool1"]
        assert lease.expense_stops == {"utilities": Decimal("5000.00")}

        # Verify query construction
        mock_client.table.assert_called_once_with("leases")
        mock_table.select.assert_called_once_with(
            "*, units(property_id, rentable_sqft, space_type)"
        )
        mock_table.eq.assert_called_once_with("property_id", str(property_id))
        mock_table.lte.assert_called_once_with("start_date", "2024-12-31")
        mock_table.or_.assert_called_once_with(
            "end_date.is.null,end_date.gte.2024-01-01"
        )

    def test_fetch_with_defaults_when_optional_fields_missing(self):
        """Handle missing optional fields with defaults."""
        property_id = uuid4()
        lease_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table

        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.lte.return_value = mock_table
        mock_table.or_.return_value = mock_table
        mock_table.execute.return_value = MagicMock(
            data=[
                {
                    "id": str(lease_id),
                    "tenant_name": "Minimal Tenant",
                    "recovery_profile": {
                        "pro_rata_share": "0.20",
                        # admin_fee_percentage missing — defaults to 0
                        # base_year missing
                        # cap_type missing - should default to "none"
                    },
                    "units": {"property_id": str(property_id), "rentable_sqft": "3000"},
                }
            ]
        )

        result = fetch_active_leases(property_id, period_start, period_end, mock_client)

        assert len(result) == 1
        lease = result[0]
        assert lease.pro_rata_share == Decimal("0.20")
        # FIX NEW-FC-6: Default admin fee is 0 (not 0.15) to avoid charging
        # tenants an admin fee they didn't agree to
        assert lease.admin_fee_percentage == Decimal("0")  # Default
        assert lease.base_year is None
        assert lease.base_year_amount is None
        assert lease.cap_type == "none"  # Default
        assert lease.cap_rate is None
        assert lease.excluded_pools == []  # Default
        assert lease.expense_stops is None

    def test_fetch_multiple_leases(self):
        """Fetch multiple active leases."""
        property_id = uuid4()
        lease_id_1 = uuid4()
        lease_id_2 = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table

        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.lte.return_value = mock_table
        mock_table.or_.return_value = mock_table
        mock_table.execute.return_value = MagicMock(
            data=[
                {
                    "id": str(lease_id_1),
                    "tenant_name": "Tenant A",
                    "recovery_profile": {"pro_rata_share": "0.30"},
                    "units": {"property_id": str(property_id), "rentable_sqft": "5000"},
                },
                {
                    "id": str(lease_id_2),
                    "tenant_name": "Tenant B",
                    "recovery_profile": {"pro_rata_share": "0.40"},
                    "units": {"property_id": str(property_id), "rentable_sqft": "6000"},
                },
            ]
        )

        result = fetch_active_leases(property_id, period_start, period_end, mock_client)

        assert len(result) == 2
        assert result[0].lease_id == lease_id_1
        assert result[0].tenant_name == "Tenant A"
        assert result[0].pro_rata_share == Decimal("0.30")
        assert result[1].lease_id == lease_id_2
        assert result[1].tenant_name == "Tenant B"
        assert result[1].pro_rata_share == Decimal("0.40")

    def test_fetch_empty_results(self):
        """Handle empty results when no active leases."""
        property_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table

        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.lte.return_value = mock_table
        mock_table.or_.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[])

        result = fetch_active_leases(property_id, period_start, period_end, mock_client)

        assert result == []

    def test_fetch_with_null_base_year_amount(self):
        """Handle null base_year_amount correctly."""
        property_id = uuid4()
        lease_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table

        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.lte.return_value = mock_table
        mock_table.or_.return_value = mock_table
        mock_table.execute.return_value = MagicMock(
            data=[
                {
                    "id": str(lease_id),
                    "tenant_name": "Test Tenant",
                    "recovery_profile": {
                        "pro_rata_share": "0.25",
                        "base_year": 2023,
                        "base_year_amount": None,  # Explicitly null
                    },
                    "units": {"property_id": str(property_id), "rentable_sqft": "2000"},
                }
            ]
        )

        result = fetch_active_leases(property_id, period_start, period_end, mock_client)

        assert len(result) == 1
        assert result[0].base_year == 2023
        assert result[0].base_year_amount is None

    def test_fetch_with_null_cap_rate(self):
        """Handle null cap_rate correctly."""
        property_id = uuid4()
        lease_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table

        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.lte.return_value = mock_table
        mock_table.or_.return_value = mock_table
        mock_table.execute.return_value = MagicMock(
            data=[
                {
                    "id": str(lease_id),
                    "tenant_name": "Test Tenant",
                    "recovery_profile": {
                        "pro_rata_share": "0.18",
                        "cap_type": "none",
                        "cap_rate": None,  # Explicitly null
                    },
                    "units": {"property_id": str(property_id), "rentable_sqft": "1800"},
                }
            ]
        )

        result = fetch_active_leases(property_id, period_start, period_end, mock_client)

        assert len(result) == 1
        assert result[0].cap_type == "none"
        assert result[0].cap_rate is None

    def test_fetch_with_null_expense_stops(self):
        """Handle null expense_stops correctly."""
        property_id = uuid4()
        lease_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table

        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.lte.return_value = mock_table
        mock_table.or_.return_value = mock_table
        mock_table.execute.return_value = MagicMock(
            data=[
                {
                    "id": str(lease_id),
                    "tenant_name": "Test Tenant",
                    "recovery_profile": {
                        "pro_rata_share": "0.22",
                        "expense_stops": None,  # Explicitly null
                    },
                    "units": {"property_id": str(property_id), "rentable_sqft": "2200"},
                }
            ]
        )

        result = fetch_active_leases(property_id, period_start, period_end, mock_client)

        assert len(result) == 1
        assert result[0].expense_stops is None

    def test_fetch_with_multiple_expense_stops(self):
        """Handle multiple expense stops correctly."""
        property_id = uuid4()
        lease_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table

        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.lte.return_value = mock_table
        mock_table.or_.return_value = mock_table
        mock_table.execute.return_value = MagicMock(
            data=[
                {
                    "id": str(lease_id),
                    "tenant_name": "Test Tenant",
                    "recovery_profile": {
                        "pro_rata_share": "0.28",
                        "expense_stops": {
                            "utilities": "3000.00",
                            "janitorial": "2000.00",
                            "insurance": "1500.00",
                        },
                    },
                    "units": {"property_id": str(property_id), "rentable_sqft": "2800"},
                }
            ]
        )

        result = fetch_active_leases(property_id, period_start, period_end, mock_client)

        assert len(result) == 1
        assert result[0].expense_stops == {
            "utilities": Decimal("3000.00"),
            "janitorial": Decimal("2000.00"),
            "insurance": Decimal("1500.00"),
        }

    def test_fetch_uses_default_client_when_none_provided(self):
        """Use default Supabase client when client parameter is None."""
        from unittest.mock import patch

        property_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        # Mock get_supabase to return a mock client
        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table

        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.lte.return_value = mock_table
        mock_table.or_.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[])

        with patch(
            "app.services.calculation.data_fetcher.get_supabase",
            return_value=mock_client,
        ) as mock_get_supabase:
            # Call without client parameter
            result = fetch_active_leases(property_id, period_start, period_end)

            assert result == []
            mock_get_supabase.assert_called_once()

    def test_fetch_with_zero_pro_rata_share(self):
        """Handle zero pro_rata_share (edge case)."""
        property_id = uuid4()
        lease_id = uuid4()
        period_start = date(2024, 1, 1)
        period_end = date(2024, 12, 31)

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table

        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.lte.return_value = mock_table
        mock_table.or_.return_value = mock_table
        mock_table.execute.return_value = MagicMock(
            data=[
                {
                    "id": str(lease_id),
                    "tenant_name": "Zero Share Tenant",
                    "recovery_profile": {"pro_rata_share": "0"},
                    "units": {"property_id": str(property_id), "rentable_sqft": "1000"},
                }
            ]
        )

        result = fetch_active_leases(property_id, period_start, period_end, mock_client)

        assert len(result) == 1
        assert result[0].pro_rata_share == Decimal("0")
