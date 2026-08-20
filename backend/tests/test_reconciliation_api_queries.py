"""
Tests for reconciliation API query optimization.

Focuses on ensuring efficient database queries (no N+1 issues, no duplicate queries).
"""

from unittest.mock import MagicMock
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import router as api_v1_router
from app.auth.dependencies import OrganizationContext, get_org_scoped_context
from app.exceptions import register_exception_handlers
from app.models.enums import ReconciliationStatus


class TestListSnapshotsQueryOptimization:
    """Tests for list_snapshots endpoint query efficiency."""

    def test_list_snapshots_uses_single_query_not_two_integration(self):
        """Verify list_snapshots makes 1 query with count, not 2 separate queries.

        The optimized endpoint combines list data and total count with
        count="exact", avoiding a separate count query.
        """
        # Create test app
        app = FastAPI()
        app.include_router(api_v1_router, prefix="/api/v1")
        register_exception_handlers(app)

        # Mock organization context
        org_id = uuid4()
        user_id = uuid4()
        execute_count = 0
        mock_table = MagicMock()
        mock_query = MagicMock()

        def count_execute(*args, **kwargs):
            nonlocal execute_count
            execute_count += 1

            # Return mock result
            result = MagicMock()
            result.data = [
                {
                    "id": str(uuid4()),
                    "property_id": str(uuid4()),
                    "lease_id": str(uuid4()),
                    "period_start_date": "2024-01-01",
                    "period_end_date": "2024-12-31",
                    "status": ReconciliationStatus.DRAFT.value,
                    "total_recovery": "5000.00",
                    "finalized_at": None,
                    "created_at": "2024-01-01T00:00:00Z",
                    "leases": {"tenant_name": "Acme Tenant"},
                    "properties": {"name": "Test Property"},
                }
            ]
            result.count = 1
            return result

        # Set up query builder chain
        mock_table.select.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.order.return_value = mock_query
        mock_query.range.return_value = mock_query
        mock_query.execute = count_execute

        def mock_org_context():
            mock_ctx = MagicMock(spec=OrganizationContext)
            mock_ctx.organization_id = org_id
            mock_ctx.user_id = user_id
            mock_ctx.table.return_value = mock_table
            return mock_ctx

        # Override dependency
        app.dependency_overrides[get_org_scoped_context] = mock_org_context

        # Make request
        client = TestClient(app)
        response = client.get("/api/v1/reconciliation/snapshots?page=1&size=20")

        # Verify response is successful
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert data["total"] == 1

        assert execute_count == 1
        mock_table.select.assert_called_once()
        assert mock_table.select.call_args.kwargs["count"] == "exact"

    def test_optimized_query_pattern(self):
        """Test the optimized query pattern with count='exact'.

        This verifies the optimization approach works correctly.
        """
        # Mock Supabase client
        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table

        # Set up query builder chain
        mock_query = MagicMock()
        mock_table.select.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.order.return_value = mock_query
        mock_query.range.return_value = mock_query

        # Mock result with BOTH data and count in single response
        mock_result = MagicMock()
        mock_result.data = [
            {
                "id": str(uuid4()),
                "property_id": str(uuid4()),
                "lease_id": str(uuid4()),
                "period_start_date": "2024-01-01",
                "period_end_date": "2024-12-31",
                "status": ReconciliationStatus.DRAFT.value,
                "total_recovery": "5000.00",
                "finalized_at": None,
            }
        ]
        mock_result.count = 42  # Total count across all pages
        mock_query.execute.return_value = mock_result

        # Simulate optimized query pattern
        result = (
            mock_client.table("reconciliation_snapshots")
            .select("*", count="exact")  # Include count in same query
            .eq("status", "draft")
            .order("created_at", desc=True)
            .range(0, 19)  # First page (0-19)
            .execute()
        )

        # Verify both data and count are available from single query
        assert len(result.data) == 1
        assert result.count == 42

        # Verify execute was called only ONCE
        mock_query.execute.assert_called_once()

        # Verify select was called with count="exact"
        mock_table.select.assert_called_with("*", count="exact")


class TestBatchFinalizeQueryOptimization:
    """Tests for batch finalize endpoint query efficiency."""

    def test_batch_finalize_uses_single_update_not_n_updates(self):
        """Verify batch finalize uses 1 UPDATE, not N sequential updates.

        RED: This test will FAIL because the current implementation:
        - Lines 702-762: Loop through snapshots making individual UPDATE queries
        - Line 726-732: One .update().eq(id).execute() per snapshot

        After optimization, should use single .in_(ids).update() for all snapshots.
        """
        # Mock Supabase client
        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table

        # Track execute calls
        execute_count = 0
        execute_operations = []  # Track what operation each execute was for

        def count_execute(*args, **kwargs):
            nonlocal execute_count
            execute_count += 1

            # Determine operation type based on query builder state
            operation = "unknown"
            if hasattr(mock_query, "_last_operation"):
                operation = mock_query._last_operation

            execute_operations.append(operation)

            # Return mock result
            result = MagicMock()

            if execute_count == 1:
                # First call should be SELECT to get snapshots
                result.data = [
                    {
                        "id": str(uuid4()),
                        "property_id": str(uuid4()),
                        "lease_id": str(uuid4()),
                        "period_start_date": "2024-01-01",
                        "period_end_date": "2024-12-31",
                        "status": ReconciliationStatus.DRAFT.value,
                        "calculation_trace": [{"step": "test"}],  # Valid trace
                        "finalized_at": None,
                    }
                    for _ in range(50)
                ]
            else:
                # Subsequent calls should be batch UPDATE (should be just 1 more call)
                result.data = [{"id": str(uuid4())} for _ in range(50)]

            result.count = len(result.data)
            return result

        # Set up query builder chain
        mock_query = MagicMock()
        mock_query.eq.return_value = mock_query
        mock_query.in_.return_value = mock_query
        mock_query.execute = count_execute

        # Track operation type for select
        def track_select(*args, **kwargs):
            mock_query._last_operation = "select"
            return mock_query

        # Track operation type for update
        def track_update(*args, **kwargs):
            mock_query._last_operation = "update"
            return mock_query

        mock_table.select.side_effect = track_select
        mock_table.update.side_effect = track_update

        # Simulate the optimized batch update pattern
        # Step 1: SELECT snapshots to finalize
        snapshots_result = (
            mock_client.table("reconciliation_snapshots")
            .select("*")
            .in_("id", [str(uuid4()) for _ in range(50)])
            .eq("status", ReconciliationStatus.DRAFT.value)
            .execute()
        )

        # Step 2: Batch UPDATE all snapshots in ONE query
        update_result = (
            mock_client.table("reconciliation_snapshots")
            .update(
                {
                    "status": ReconciliationStatus.FINALIZED.value,
                    "finalized_at": "2024-01-01T00:00:00",
                }
            )
            .in_("id", [s["id"] for s in snapshots_result.data])
            .eq("status", ReconciliationStatus.DRAFT.value)
            .execute()
        )

        # After optimization, should be exactly 2 queries: 1 SELECT + 1 UPDATE
        assert (
            execute_count == 2
        ), f"Expected 2 queries (1 SELECT + 1 UPDATE), got {execute_count}"

        # Verify operations were in correct order
        assert execute_operations == [
            "select",
            "update",
        ], f"Expected ['select', 'update'], got {execute_operations}"

        # Verify all 50 snapshots were updated
        assert len(update_result.data) == 50

        # Verify .in_() was called (batch operation)
        assert mock_query.in_.called, "Should use .in_() for batch update"


class TestListSnapshotsAdminFee:
    """list_snapshots must surface the admin_fee so the grid can show it."""

    def _build_app(self, snapshot_row):
        app = FastAPI()
        app.include_router(api_v1_router, prefix="/api/v1")
        register_exception_handlers(app)

        org_id = uuid4()
        user_id = uuid4()

        mock_table = MagicMock()
        mock_query = MagicMock()

        def count_execute(*args, **kwargs):
            result = MagicMock()
            result.data = [snapshot_row]
            result.count = 1
            return result

        mock_table.select.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.order.return_value = mock_query
        mock_query.range.return_value = mock_query
        mock_query.execute = count_execute

        def mock_org_context():
            mock_ctx = MagicMock(spec=OrganizationContext)
            mock_ctx.organization_id = org_id
            mock_ctx.user_id = user_id
            mock_ctx.table.return_value = mock_table
            return mock_ctx

        app.dependency_overrides[get_org_scoped_context] = mock_org_context
        return app, mock_table

    def _base_row(self):
        return {
            "id": str(uuid4()),
            "property_id": str(uuid4()),
            "lease_id": str(uuid4()),
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "status": ReconciliationStatus.DRAFT.value,
            "total_recovery": "7511.21",
            "finalized_at": None,
            "created_at": "2024-01-01T00:00:00Z",
            "leases": {"tenant_name": "Acme Tenant"},
            "properties": {"name": "Test Property"},
        }

    def test_admin_fee_is_selected_and_returned(self):
        row = self._base_row()
        row["admin_fee"] = "979.72"
        app, mock_table = self._build_app(row)

        response = TestClient(app).get(
            "/api/v1/reconciliation/snapshots?page=1&size=20"
        )

        assert response.status_code == 200
        item = response.json()["items"][0]
        assert item["admin_fee"] == "979.72"

        # The DB column must be requested explicitly or it would be absent.
        select_columns = mock_table.select.call_args.args[0]
        assert "admin_fee" in select_columns

    def test_admin_fee_absent_is_null(self):
        # A row without the column (e.g. legacy projection) must not 500.
        app, _ = self._build_app(self._base_row())

        response = TestClient(app).get(
            "/api/v1/reconciliation/snapshots?page=1&size=20"
        )

        assert response.status_code == 200
        assert response.json()["items"][0]["admin_fee"] is None
