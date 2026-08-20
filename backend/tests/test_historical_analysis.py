"""Tests for HistoricalAnalysisService — specifically the status filter.

Verifies that _get_snapshots_by_years applies .eq("status", "finalized")
instead of the legacy (wrong) is_finalized column name.
"""

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.services.analysis.historical_analysis import HistoricalAnalysisService


@pytest.fixture
def mock_supabase_admin() -> MagicMock:
    """Mock supabase admin client with a chainable query builder."""
    mock = MagicMock()
    mock_query = MagicMock()
    mock_query.select.return_value = mock_query
    mock_query.eq.return_value = mock_query
    mock_query.execute.return_value = MagicMock(data=[])
    mock.table.return_value = mock_query
    return mock


class TestFetchSnapshotsByYear:
    @pytest.mark.asyncio
    async def test_filters_only_finalized_snapshots(
        self, mock_supabase_admin: MagicMock
    ) -> None:
        """_get_snapshots_by_years should apply .eq('status', 'finalized') filter."""
        property_id = uuid4()

        # Provide a matching snapshot so ValueError isn't raised for missing years
        mock_query = mock_supabase_admin.table.return_value
        mock_query.execute.return_value = MagicMock(
            data=[
                {
                    "property_id": str(property_id),
                    "period_start_date": "2022-01-01",
                    "status": "finalized",
                }
            ]
        )

        with patch(
            "app.services.analysis.historical_analysis.get_supabase_admin",
            return_value=mock_supabase_admin,
        ):
            service = HistoricalAnalysisService()
            await service._get_snapshots_by_years(property_id, [2022], None)

        # The query chain should have called .eq("status", "finalized")
        mock_query.eq.assert_any_call("status", "finalized")
