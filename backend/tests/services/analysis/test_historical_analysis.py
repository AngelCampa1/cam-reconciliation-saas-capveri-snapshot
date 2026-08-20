"""Tests for historical analysis service."""

from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.models.historical_analysis import VarianceLevel
from app.services.analysis.historical_analysis import (
    HistoricalAnalysisService,
    calculate_variance_level,
)


class PagedQuery:
    def __init__(self, rows):
        self.rows = rows
        self._start = None
        self._end = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def range(self, start, end):
        self._start = start
        self._end = end
        return self

    def execute(self):
        response = MagicMock()
        if self._start is None or self._end is None:
            response.data = self.rows
        else:
            response.data = self.rows[self._start : self._end + 1]
        return response


class TestCalculateVarianceLevel:
    """Tests for calculate_variance_level function."""

    def test_normal_variance_positive(self):
        """Should return NORMAL for variance <5%."""
        level = calculate_variance_level(Decimal("3.5"))
        assert level == VarianceLevel.NORMAL

    def test_normal_variance_negative(self):
        """Should return NORMAL for variance <5% (negative)."""
        level = calculate_variance_level(Decimal("-4.2"))
        assert level == VarianceLevel.NORMAL

    def test_warning_variance_positive(self):
        """Should return WARNING for variance 5-15%."""
        level = calculate_variance_level(Decimal("10.0"))
        assert level == VarianceLevel.WARNING

    def test_warning_variance_negative(self):
        """Should return WARNING for variance 5-15% (negative)."""
        level = calculate_variance_level(Decimal("-12.5"))
        assert level == VarianceLevel.WARNING

    def test_critical_variance_positive(self):
        """Should return CRITICAL for variance >15%."""
        level = calculate_variance_level(Decimal("20.0"))
        assert level == VarianceLevel.CRITICAL

    def test_critical_variance_negative(self):
        """Should return CRITICAL for variance >15% (negative)."""
        level = calculate_variance_level(Decimal("-18.7"))
        assert level == VarianceLevel.CRITICAL

    def test_edge_case_exactly_5(self):
        """Should return WARNING for exactly 5%."""
        level = calculate_variance_level(Decimal("5.0"))
        assert level == VarianceLevel.WARNING

    def test_edge_case_exactly_15(self):
        """Should return CRITICAL for exactly 15%."""
        level = calculate_variance_level(Decimal("15.0"))
        assert level == VarianceLevel.CRITICAL

    def test_none_variance(self):
        """Should return NORMAL for None variance."""
        level = calculate_variance_level(None)
        assert level == VarianceLevel.NORMAL


@pytest.mark.asyncio
class TestHistoricalAnalysisService:
    """Tests for HistoricalAnalysisService."""

    async def test_get_year_over_year_requires_two_years(self):
        """Should raise error if less than 2 years provided."""
        service = HistoricalAnalysisService()
        property_id = uuid4()
        org_id = uuid4()

        with pytest.raises(ValueError, match="At least 2 years required"):
            await service.get_year_over_year(property_id, [2024], org_id)

    async def test_get_year_over_year_max_four_years(self):
        """Should raise error if more than 4 years provided."""
        service = HistoricalAnalysisService()
        property_id = uuid4()
        org_id = uuid4()

        with pytest.raises(ValueError, match="Maximum 4 years"):
            await service.get_year_over_year(
                property_id, [2020, 2021, 2022, 2023, 2024], org_id
            )

    @patch("app.services.analysis.historical_analysis.get_supabase_admin")
    async def test_get_year_over_year_requires_organization_id(self, mock_get_supabase):
        """Historical analysis must not run with unscoped admin access."""
        service = HistoricalAnalysisService()
        property_id = uuid4()

        with pytest.raises(ValueError, match="organization_id is required"):
            await service.get_year_over_year(property_id, [2023, 2024])

        mock_get_supabase.assert_not_called()

    @patch("app.services.analysis.historical_analysis.get_supabase_admin")
    async def test_get_year_over_year_success(self, mock_get_supabase):
        """Should calculate year-over-year comparison successfully."""
        property_id = uuid4()
        pool_id_utilities = uuid4()
        pool_id_janitorial = uuid4()
        org_id = uuid4()
        years = [2023, 2024]

        # Mock snapshots response (just needs period_start_date for year extraction)
        mock_snapshots_response = MagicMock()
        mock_snapshots_response.data = [
            {"period_start_date": "2023-01-01"},
            {"period_start_date": "2024-01-01"},
        ]

        # Mock property response
        mock_property_response = MagicMock()
        mock_property_response.data = {"name": "Test Property"}

        # Mock expense pools response
        mock_pools_response = MagicMock()
        mock_pools_response.data = [
            {"id": str(pool_id_utilities), "name": "Utilities"},
            {"id": str(pool_id_janitorial), "name": "Janitorial"},
        ]

        # Mock pool mappings response
        mock_mappings_response = MagicMock()
        mock_mappings_response.data = [
            {
                "expense_pool_id": str(pool_id_utilities),
                "gl_account_pattern": "6100*",
                "allocation_percentage": "1.0",
            },
            {
                "expense_pool_id": str(pool_id_janitorial),
                "gl_account_pattern": "6200*",
                "allocation_percentage": "1.0",
            },
        ]

        # Mock GL entries responses for 2023 and 2024
        mock_gl_2023_response = MagicMock()
        mock_gl_2023_response.data = [
            {"account_code": "6100-001", "amount": "1000.00"},  # Utilities
            {"account_code": "6200-001", "amount": "500.00"},  # Janitorial
        ]

        mock_gl_2024_response = MagicMock()
        mock_gl_2024_response.data = [
            {"account_code": "6100-001", "amount": "1200.00"},  # Utilities
            {"account_code": "6200-001", "amount": "550.00"},  # Janitorial
        ]

        gl_call_count = [0]  # Track which year we're querying

        # Configure mock supabase with side_effect
        mock_supabase = MagicMock()

        def table_side_effect(table_name):
            if table_name == "reconciliation_snapshots":
                chain = MagicMock()
                chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = (
                    mock_snapshots_response
                )
                return chain
            elif table_name == "properties":
                chain = MagicMock()
                chain.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = (
                    mock_property_response
                )
                return chain
            elif table_name == "expense_pools":
                chain = MagicMock()
                chain.select.return_value.eq.return_value.execute.return_value = (
                    mock_pools_response
                )
                return chain
            elif table_name == "pool_mappings":
                chain = MagicMock()
                chain.select.return_value.in_.return_value.execute.return_value = (
                    mock_mappings_response
                )
                return chain
            elif table_name == "gl_entries":
                chain = MagicMock()
                # Return different data based on call order
                # First call is for 2023, second call is for 2024
                gl_call_count[0] += 1
                if gl_call_count[0] == 1:
                    chain.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
                        mock_gl_2023_response
                    )
                else:
                    chain.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
                        mock_gl_2024_response
                    )
                return chain
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect
        mock_get_supabase.return_value = mock_supabase

        service = HistoricalAnalysisService()
        result = await service.get_year_over_year(
            property_id, years, org_id, use_fuzzy_matching=False
        )

        assert result.property_id == property_id
        assert result.property_name == "Test Property"
        assert result.years == years
        assert result.base_year == 2023
        assert len(result.pool_comparisons) == 2
        assert result.total_amounts[2023] == Decimal("1500.00")
        assert result.total_amounts[2024] == Decimal("1750.00")

    @patch("app.services.analysis.historical_analysis.get_supabase_admin")
    async def test_get_year_over_year_total_with_no_base_year_spend(
        self, mock_get_supabase
    ):
        """Base year has a snapshot but no GL spend.

        When the base year has zero total spend (e.g. a finalized snapshot
        exists but no GL entries were imported for it), the total variance
        amount must still be the full current-year total — not None/$0 — while
        the percent stays None because the change is undefined (div by zero).
        The UI renders this as "New" rather than a misleading +0.00%.
        """
        property_id = uuid4()
        pool_id_utilities = uuid4()
        org_id = uuid4()
        years = [2023, 2024]

        mock_snapshots_response = MagicMock()
        mock_snapshots_response.data = [
            {"period_start_date": "2023-01-01"},
            {"period_start_date": "2024-01-01"},
        ]

        mock_property_response = MagicMock()
        mock_property_response.data = {"name": "Test Property"}

        mock_pools_response = MagicMock()
        mock_pools_response.data = [
            {"id": str(pool_id_utilities), "name": "Utilities"},
        ]

        mock_mappings_response = MagicMock()
        mock_mappings_response.data = [
            {
                "expense_pool_id": str(pool_id_utilities),
                "gl_account_pattern": "6100*",
                "allocation_percentage": "1.0",
            },
        ]

        # 2023 has NO GL entries; 2024 does.
        mock_gl_2023_response = MagicMock()
        mock_gl_2023_response.data = []

        mock_gl_2024_response = MagicMock()
        mock_gl_2024_response.data = [
            {"account_code": "6100-001", "amount": "1200.00"},  # Utilities
        ]

        gl_call_count = [0]
        mock_supabase = MagicMock()

        def table_side_effect(table_name):
            if table_name == "reconciliation_snapshots":
                chain = MagicMock()
                chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = (
                    mock_snapshots_response
                )
                return chain
            elif table_name == "properties":
                chain = MagicMock()
                chain.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = (
                    mock_property_response
                )
                return chain
            elif table_name == "expense_pools":
                chain = MagicMock()
                chain.select.return_value.eq.return_value.execute.return_value = (
                    mock_pools_response
                )
                return chain
            elif table_name == "pool_mappings":
                chain = MagicMock()
                chain.select.return_value.in_.return_value.execute.return_value = (
                    mock_mappings_response
                )
                return chain
            elif table_name == "gl_entries":
                chain = MagicMock()
                gl_call_count[0] += 1
                if gl_call_count[0] == 1:
                    chain.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
                        mock_gl_2023_response
                    )
                else:
                    chain.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
                        mock_gl_2024_response
                    )
                return chain
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect
        mock_get_supabase.return_value = mock_supabase

        service = HistoricalAnalysisService()
        result = await service.get_year_over_year(
            property_id, years, org_id, use_fuzzy_matching=False
        )

        assert result.total_amounts[2023] == Decimal("0")
        assert result.total_amounts[2024] == Decimal("1200.00")
        # Dollar variance is the full current total, not None/$0.
        assert result.total_variance_amount == Decimal("1200.00")
        # Percent is undefined against a $0 base.
        assert result.total_variance_percent is None

    @patch("app.services.analysis.historical_analysis.get_supabase_admin")
    async def test_get_year_over_year_missing_snapshot(self, mock_get_supabase):
        """Should raise error if snapshot missing for any year."""
        property_id = uuid4()
        org_id = uuid4()
        years = [2023, 2024]

        # Mock response with only 2023 snapshot (missing 2024)
        mock_response = MagicMock()
        mock_response.data = [
            {
                "period_start": "2023-01-01",
                "tenant_shares": [{"pools": []}],
            }
        ]

        # Create mock chain for snapshots query
        mock_snapshots_chain = MagicMock()
        mock_snapshots_chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = (
            mock_response
        )

        # Configure mock supabase
        mock_supabase = MagicMock()
        mock_supabase.table.return_value = mock_snapshots_chain
        mock_get_supabase.return_value = mock_supabase

        service = HistoricalAnalysisService()

        with pytest.raises(ValueError, match="No finalized snapshots found"):
            await service.get_year_over_year(property_id, years, org_id)

    @patch("app.services.analysis.historical_analysis.get_supabase_admin")
    async def test_extract_pool_data(self, mock_get_supabase):
        """Should extract and aggregate pool data correctly from GL entries."""
        service = HistoricalAnalysisService()
        property_id = uuid4()
        org_id = uuid4()
        pool_id_utilities = uuid4()
        pool_id_janitorial = uuid4()

        mock_property_response = MagicMock()
        mock_property_response.data = {"id": str(property_id)}

        # Mock expense pools response
        mock_pools_response = MagicMock()
        mock_pools_response.data = [
            {"id": str(pool_id_utilities), "name": "Utilities"},
            {"id": str(pool_id_janitorial), "name": "Janitorial"},
        ]

        # Mock pool mappings response
        mock_mappings_response = MagicMock()
        mock_mappings_response.data = [
            {
                "expense_pool_id": str(pool_id_utilities),
                "gl_account_pattern": "6100*",
                "allocation_percentage": "1.0",
            },
            {
                "expense_pool_id": str(pool_id_janitorial),
                "gl_account_pattern": "6200*",
                "allocation_percentage": "1.0",
            },
        ]

        # Mock GL entries responses
        mock_gl_2023_response = MagicMock()
        mock_gl_2023_response.data = [
            {"account_code": "6100-001", "amount": "500.00"},
            {"account_code": "6100-002", "amount": "500.00"},  # Two utilities entries
            {"account_code": "6200-001", "amount": "300.00"},  # Janitorial
        ]

        mock_gl_2024_response = MagicMock()
        mock_gl_2024_response.data = [
            {"account_code": "6100-001", "amount": "600.00"},  # Utilities only
        ]

        gl_call_count = [0]

        mock_supabase = MagicMock()

        def table_side_effect(table_name):
            if table_name == "properties":
                chain = MagicMock()
                chain.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
                    mock_property_response
                )
                return chain
            elif table_name == "expense_pools":
                chain = MagicMock()
                chain.select.return_value.eq.return_value.execute.return_value = (
                    mock_pools_response
                )
                return chain
            elif table_name == "pool_mappings":
                chain = MagicMock()
                chain.select.return_value.in_.return_value.execute.return_value = (
                    mock_mappings_response
                )
                return chain
            elif table_name == "gl_entries":
                chain = MagicMock()
                gl_call_count[0] += 1
                if gl_call_count[0] == 1:
                    chain.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
                        mock_gl_2023_response
                    )
                else:
                    chain.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
                        mock_gl_2024_response
                    )
                return chain
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect
        mock_get_supabase.return_value = mock_supabase

        pool_data = await service._extract_pool_data(property_id, [2023, 2024], org_id)

        assert pool_data[2023]["Utilities"] == Decimal("1000.00")  # 500 + 500
        assert pool_data[2023]["Janitorial"] == Decimal("300.00")
        assert pool_data[2024]["Utilities"] == Decimal("600.00")

    @patch("app.services.analysis.historical_analysis.get_supabase_admin")
    async def test_extract_pool_data_includes_second_page_gl_entries(
        self, mock_get_supabase
    ):
        """Pool totals include GL entries beyond the first Supabase page."""
        service = HistoricalAnalysisService()
        property_id = uuid4()
        org_id = uuid4()
        pool_id = str(uuid4())
        gl_rows = [{"account_code": "6100-001", "amount": "1.00"} for _ in range(1001)]

        rows_by_table = {
            "expense_pools": [{"id": pool_id, "name": "Utilities"}],
            "pool_mappings": [
                {
                    "expense_pool_id": pool_id,
                    "gl_account_pattern": "6100*",
                    "allocation_percentage": "1.0",
                }
            ],
            "gl_entries": gl_rows,
        }

        mock_supabase = MagicMock()
        mock_supabase.table.side_effect = lambda table_name: PagedQuery(
            rows_by_table.get(table_name, [])
        )
        mock_get_supabase.return_value = mock_supabase

        pool_data = await service._get_pool_data_for_year(property_id, 2024, org_id)

        assert pool_data["Utilities"] == Decimal("1001.000")

    @patch("app.services.analysis.historical_analysis.get_supabase_admin")
    async def test_extract_pool_data_rejects_property_outside_org(
        self, mock_get_supabase
    ):
        """Direct pool extraction verifies property organization before GL reads."""
        service = HistoricalAnalysisService()
        property_id = uuid4()
        org_id = uuid4()

        mock_property_response = MagicMock()
        mock_property_response.data = None

        property_chain = MagicMock()
        property_chain.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            mock_property_response
        )

        mock_supabase = MagicMock()
        mock_supabase.table.return_value = property_chain
        mock_get_supabase.return_value = mock_supabase

        with pytest.raises(ValueError, match="Property not found"):
            await service._extract_pool_data(property_id, [2023], org_id)

        mock_supabase.table.assert_called_once_with("properties")

    async def test_build_pool_mappings(self):
        """Should build fuzzy pool mappings."""
        service = HistoricalAnalysisService()

        pool_data_by_year = {
            2023: {"Electric": Decimal("1000"), "Insurance": Decimal("500")},
            2024: {
                "Electrical": Decimal("1200"),
                "Insurances": Decimal("550"),
            },
        }

        mappings = service._build_pool_mappings(pool_data_by_year, [2023, 2024])

        # Should have mappings for 2024
        assert 2024 in mappings
        # With 0.80 threshold:
        # "Electric" vs "Electrical" = 0.89 > 0.80 ✓
        # "Insurance" vs "Insurances" = 0.95 > 0.80 ✓
        assert mappings[2024].get("Electric") == "Electrical"
        assert mappings[2024].get("Insurance") == "Insurances"

    @patch("app.services.analysis.historical_analysis.get_supabase_admin")
    async def test_property_not_found_raises_error(self, mock_get_supabase):
        """Should raise error when property not found."""
        property_id = uuid4()
        org_id = uuid4()
        years = [2023, 2024]

        # Mock finalized snapshots exist (so service proceeds to property check)
        mock_snapshots_response = MagicMock()
        mock_snapshots_response.data = [
            {"period_start_date": "2023-01-01"},
            {"period_start_date": "2024-01-01"},
        ]

        # Mock property not found (will be checked after snapshots)
        mock_property_response = MagicMock()
        mock_property_response.data = None

        mock_supabase = MagicMock()

        def table_side_effect(table_name):
            if table_name == "reconciliation_snapshots":
                chain = MagicMock()
                chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = (
                    mock_snapshots_response
                )
                return chain
            elif table_name == "properties":
                chain = MagicMock()
                chain.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = (
                    mock_property_response
                )
                return chain
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect
        mock_get_supabase.return_value = mock_supabase

        service = HistoricalAnalysisService()

        with pytest.raises(ValueError, match="Property not found"):
            await service.get_year_over_year(property_id, years, org_id)
