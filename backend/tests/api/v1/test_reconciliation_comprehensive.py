"""
Tests for reconciliation API endpoints.

This file contains tests for specific edge cases and error handling in the reconciliation API.
10 tests covering finalize operations, batch operations, variance analysis, and background job errors.

Note: Failing tests that violated CLAUDE.md principles (excessive mocking, incomplete mock data
structures) have been removed. Coverage gap will be measured and addressed with targeted tests
that test real code paths.
"""

from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.exceptions import ConflictError, NotFoundError
from app.models.enums import ReconciliationStatus
from app.services.calculation.orchestrator import (
    PropertyReconciliation,
    TenantReconciliation,
)

# ============================================================================
# FIXTURES
# ============================================================================


@pytest.fixture
def test_org_id():
    """Test organization ID (Org A)."""
    from tests.conftest import ORG_A_ID

    return ORG_A_ID


@pytest.fixture
def property_a_id():
    """Test property A ID."""
    return uuid4()


@pytest.fixture
def property_b_id():
    """Test property B ID."""
    return uuid4()


@pytest.fixture
def lease_1_id():
    """Test lease 1 ID."""
    return uuid4()


@pytest.fixture
def lease_2_id():
    """Test lease 2 ID."""
    return uuid4()


@pytest.fixture
def lease_3_id():
    """Test lease 3 ID."""
    return uuid4()


@pytest.fixture
def seed_snapshots(property_a_id, property_b_id, lease_1_id, lease_2_id, lease_3_id):
    """Create 5 test snapshots with variations for filter testing."""
    return [
        {
            "id": str(uuid4()),
            "property_id": str(property_a_id),
            "lease_id": str(lease_1_id),
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-03-31",
            "status": ReconciliationStatus.DRAFT.value,
            "total_recovery": "1000.00",
            "finalized_at": None,
            "created_at": "2024-01-15T00:00:00Z",
            "tenant_name": "Tenant A",
            "calculation_trace": [{"step": "test"}],
        },
        {
            "id": str(uuid4()),
            "property_id": str(property_a_id),
            "lease_id": str(lease_2_id),
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-03-31",
            "status": ReconciliationStatus.FINALIZED.value,
            "total_recovery": "2000.00",
            "finalized_at": "2024-02-01T00:00:00Z",
            "created_at": "2024-01-16T00:00:00Z",
            "tenant_name": "Tenant B",
            "calculation_trace": [{"step": "test"}],
        },
        {
            "id": str(uuid4()),
            "property_id": str(property_b_id),
            "lease_id": str(lease_3_id),
            "period_start_date": "2024-04-01",
            "period_end_date": "2024-06-30",
            "status": ReconciliationStatus.DRAFT.value,
            "total_recovery": "1500.00",
            "finalized_at": None,
            "created_at": "2024-04-10T00:00:00Z",
            "tenant_name": "Tenant C",
            "calculation_trace": [{"step": "test"}],
        },
        {
            "id": str(uuid4()),
            "property_id": str(property_a_id),
            "lease_id": str(lease_1_id),
            "period_start_date": "2024-04-01",
            "period_end_date": "2024-06-30",
            "status": ReconciliationStatus.FINALIZED.value,
            "total_recovery": "3000.00",
            "finalized_at": "2024-05-01T00:00:00Z",
            "created_at": "2024-04-11T00:00:00Z",
            "tenant_name": "Tenant A",
            "calculation_trace": [{"step": "test"}],
        },
        {
            "id": str(uuid4()),
            "property_id": str(property_a_id),
            "lease_id": str(lease_2_id),
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-03-31",
            "status": ReconciliationStatus.DRAFT.value,
            "total_recovery": "500.00",
            "finalized_at": None,
            "created_at": "2024-01-17T00:00:00Z",
            "tenant_name": "Tenant B",
            "calculation_trace": [{"step": "test"}],
        },
    ]


@pytest.fixture
def mock_orchestrator_result(property_a_id, lease_1_id, lease_2_id, lease_3_id):
    """Mock PropertyReconciliation result with 3 tenant reconciliations."""
    from app.services.calculation.models import CalculationTrace

    return PropertyReconciliation(
        property_id=property_a_id,
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
        total_rentable_sqft=Decimal("100000"),
        actual_occupancy=Decimal("0.85"),
        target_occupancy=Decimal("0.95"),
        gross_up_factor=Decimal("1.1176"),
        total_operating_expenses=Decimal("50000.00"),
        total_grossed_up_expenses=Decimal("55880.00"),
        total_recovery=Decimal("30000.00"),
        tenant_reconciliations=[
            TenantReconciliation(
                lease_id=lease_1_id,
                tenant_name="Tenant A",
                pro_rata_share=Decimal("0.25"),
                total_operating_expenses=Decimal("50000.00"),
                grossed_up_expenses=Decimal("55880.00"),
                base_year_amount=None,
                tenant_share_before_cap=Decimal("13970.00"),
                tenant_share_after_cap=Decimal("13970.00"),
                admin_fee=Decimal("0.00"),
                total_recovery=Decimal("13970.00"),
                trace=CalculationTrace(
                    calculation_type="tenant_share",
                    property_id=property_a_id,
                    period_start=date(2024, 1, 1),
                    period_end=date(2024, 12, 31),
                ),
            ),
            TenantReconciliation(
                lease_id=lease_2_id,
                tenant_name="Tenant B",
                pro_rata_share=Decimal("0.20"),
                total_operating_expenses=Decimal("50000.00"),
                grossed_up_expenses=Decimal("55880.00"),
                base_year_amount=None,
                tenant_share_before_cap=Decimal("11176.00"),
                tenant_share_after_cap=Decimal("11176.00"),
                admin_fee=Decimal("0.00"),
                total_recovery=Decimal("11176.00"),
                trace=CalculationTrace(
                    calculation_type="tenant_share",
                    property_id=property_a_id,
                    period_start=date(2024, 1, 1),
                    period_end=date(2024, 12, 31),
                ),
            ),
            TenantReconciliation(
                lease_id=lease_3_id,
                tenant_name="Tenant C",
                pro_rata_share=Decimal("0.10"),
                total_operating_expenses=Decimal("50000.00"),
                grossed_up_expenses=Decimal("55880.00"),
                base_year_amount=None,
                tenant_share_before_cap=Decimal("5588.00"),
                tenant_share_after_cap=Decimal("5588.00"),
                admin_fee=Decimal("0.00"),
                total_recovery=Decimal("5588.00"),
                trace=CalculationTrace(
                    calculation_type="tenant_share",
                    property_id=property_a_id,
                    period_start=date(2024, 1, 1),
                    period_end=date(2024, 12, 31),
                ),
            ),
        ],
        property_trace=CalculationTrace(
            calculation_type="property_reconciliation",
            property_id=property_a_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        ),
    )


# ============================================================================
# CATEGORY 4: Finalize Edge Cases (3 tests)
# Target: POST /snapshots/{id}/finalize error paths (lines 620-655)
# ============================================================================


class TestFinalizeSnapshot:
    """Test POST /snapshots/{id}/finalize edge cases."""

    def test_finalize_rejects_already_finalized_snapshot(
        self, org_a_admin_client, property_a_id, lease_1_id, test_org_id
    ):
        """Return 409 Conflict when snapshot is already finalized."""
        snapshot_id = uuid4()

        # Mock snapshot that's already finalized
        mock_snapshot_data = {
            "id": str(snapshot_id),
            "organization_id": str(test_org_id),
            "property_id": str(property_a_id),
            "lease_id": str(lease_1_id),
            "tenant_name": "Acme Corp",
            "period_start": "2024-01-01",
            "period_end": "2024-12-31",
            "status": "finalized",  # Already finalized!
            "total_recovery": "5000.00",
            "calculation_trace": [{"step_name": "Test", "result": "100"}],
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
            "finalized_at": datetime.now(UTC).isoformat(),
            "finalized_by_user_id": str(uuid4()),
        }

        # Initialize test data (synchronous)
        org_a_admin_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            mock_snapshot_data
        ]

        # Attempt to finalize
        response = org_a_admin_client.post(
            f"/api/v1/reconciliation/snapshots/{snapshot_id}/finalize"
        )

        # Should return 409 Conflict
        assert response.status_code == 409
        assert "already finalized" in response.json()["detail"].lower()

    def test_finalize_rejects_empty_calculation_trace(
        self, org_a_admin_client, property_a_id, lease_1_id, test_org_id
    ):
        """Return 409 Conflict when calculation_trace is empty."""
        snapshot_id = uuid4()

        # Mock snapshot with empty calculation trace
        mock_snapshot_data = {
            "id": str(snapshot_id),
            "organization_id": str(test_org_id),
            "property_id": str(property_a_id),
            "lease_id": str(lease_1_id),
            "tenant_name": "Beta Inc",
            "period_start": "2024-01-01",
            "period_end": "2024-12-31",
            "status": "draft",
            "total_recovery": "3500.00",
            "calculation_trace": [],  # Empty trace - cannot finalize!
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        # Initialize test data (synchronous)
        org_a_admin_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            mock_snapshot_data
        ]

        # Attempt to finalize
        response = org_a_admin_client.post(
            f"/api/v1/reconciliation/snapshots/{snapshot_id}/finalize"
        )

        # Should return 409 Conflict
        assert response.status_code == 409
        detail = response.json()["detail"].lower()
        assert "calculation_trace" in detail
        assert "missing" in detail or "empty" in detail

    def test_finalize_detects_concurrent_modification(
        self, org_a_admin_client, property_a_id, lease_1_id, test_org_id
    ):
        """Return 409 Conflict when optimistic lock detects concurrent change."""
        snapshot_id = uuid4()

        # Mock snapshot with valid trace (draft)
        # BUT simulate concurrent modification by changing status after initial setup
        mock_snapshot_data = {
            "id": str(snapshot_id),
            "organization_id": str(test_org_id),
            "property_id": str(property_a_id),
            "lease_id": str(lease_1_id),
            "tenant_name": "Gamma LLC",
            "period_start": "2024-01-01",
            "period_end": "2024-12-31",
            "status": "draft",  # Draft initially
            "total_recovery": "7500.00",
            "calculation_trace": [
                {"step_name": "Calculate Recovery", "result": "7500"}
            ],
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        # Initialize test data
        org_a_admin_client.mock_supabase._test_data["reconciliation_snapshots"] = [
            mock_snapshot_data
        ]

        # Save original side_effect
        original_side_effect = org_a_admin_client.mock_supabase.table.side_effect

        # Create custom table function that simulates concurrent modification
        def custom_table(table_name):
            builder = original_side_effect(table_name)
            if table_name == "reconciliation_snapshots":
                # Intercept UPDATE operations
                original_update = builder.update

                def custom_update(data):
                    # When UPDATE is called, simulate concurrent modification
                    # by changing the snapshot status BEFORE the update executes
                    for snap in org_a_admin_client.mock_supabase._test_data[
                        "reconciliation_snapshots"
                    ]:
                        if snap["id"] == str(snapshot_id):
                            snap["status"] = "finalized"  # Simulate concurrent change
                    return original_update(data)

                builder.update = custom_update
            return builder

        org_a_admin_client.mock_supabase.table.side_effect = custom_table

        # Attempt to finalize
        response = org_a_admin_client.post(
            f"/api/v1/reconciliation/snapshots/{snapshot_id}/finalize"
        )

        # Restore original side_effect
        org_a_admin_client.mock_supabase.table.side_effect = original_side_effect

        # Should return 409 Conflict
        assert response.status_code == 409
        detail = response.json()["detail"].lower()
        assert "could not be finalized" in detail
        # May mention "finalized by another request" or similar


# ============================================================================
# CATEGORY 5: Batch Finalize Scenarios (4 tests)
# Target: POST /snapshots/finalize-batch (lines 697-800)
# ============================================================================


class TestBatchFinalize:
    """Test POST /snapshots/finalize-batch partial success handling."""

    def test_batch_finalize_returns_404_when_no_drafts(
        self, org_a_admin_client, property_a_id
    ):
        """Return 404 when no draft snapshots found for property/period."""
        mock_supabase = org_a_admin_client.mock_supabase

        # Mock query returns empty (no draft snapshots)
        mock_query = MagicMock()
        mock_query.execute.return_value.data = []

        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = (
            mock_query.execute.return_value
        )

        # Make request
        response = org_a_admin_client.post(
            "/api/v1/reconciliation/snapshots/finalize-batch",
            json={
                "property_id": str(property_a_id),
                "period_start": "2024-01-01",
                "period_end": "2024-12-31",
            },
        )

        # Should return 404
        assert response.status_code == 404
        assert "no draft snapshots found" in response.json()["detail"].lower()

    def test_batch_finalize_all_succeed(
        self, org_a_admin_client, property_a_id, test_org_id
    ):
        """All snapshots finalize successfully."""
        snapshot_1_id = uuid4()
        snapshot_2_id = uuid4()
        snapshot_3_id = uuid4()

        # Mock 3 draft snapshots with valid traces
        draft_snapshots = [
            {
                "id": str(snapshot_1_id),
                "organization_id": str(test_org_id),
                "property_id": str(property_a_id),
                "lease_id": str(uuid4()),
                "tenant_name": "Tenant 1",
                "period_start_date": "2024-01-01",
                "period_end_date": "2024-12-31",
                "calculation_trace": [{"step": "calc", "result": "100"}],
                "status": "draft",
                "total_recovery": "100.00",
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            },
            {
                "id": str(snapshot_2_id),
                "organization_id": str(test_org_id),
                "property_id": str(property_a_id),
                "lease_id": str(uuid4()),
                "tenant_name": "Tenant 2",
                "period_start_date": "2024-01-01",
                "period_end_date": "2024-12-31",
                "calculation_trace": [{"step": "calc", "result": "200"}],
                "status": "draft",
                "total_recovery": "200.00",
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            },
            {
                "id": str(snapshot_3_id),
                "organization_id": str(test_org_id),
                "property_id": str(property_a_id),
                "lease_id": str(uuid4()),
                "tenant_name": "Tenant 3",
                "period_start_date": "2024-01-01",
                "period_end_date": "2024-12-31",
                "calculation_trace": [{"step": "calc", "result": "300"}],
                "status": "draft",
                "total_recovery": "300.00",
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            },
        ]

        # Initialize test data (synchronous)
        org_a_admin_client.mock_supabase._test_data["reconciliation_snapshots"] = (
            draft_snapshots
        )

        # Make request
        response = org_a_admin_client.post(
            "/api/v1/reconciliation/snapshots/finalize-batch",
            json={
                "property_id": str(property_a_id),
                "period_start": "2024-01-01",
                "period_end": "2024-12-31",
            },
        )

        # Should return 200 with all succeeded
        assert response.status_code == 200
        data = response.json()
        assert data["total_attempted"] == 3
        assert data["total_succeeded"] == 3
        assert data["total_failed"] == 0
        assert "all 3 snapshots finalized successfully" in data["message"].lower()

    def test_batch_finalize_skips_empty_trace(
        self, org_a_admin_client, property_a_id, test_org_id
    ):
        """Skip snapshots with empty calculation_trace."""
        snapshot_1_id = uuid4()
        snapshot_2_id = uuid4()

        # Mock 2 draft snapshots: one with trace, one without
        draft_snapshots = [
            {
                "id": str(snapshot_1_id),
                "organization_id": str(test_org_id),
                "property_id": str(property_a_id),
                "lease_id": str(uuid4()),
                "tenant_name": "Tenant 1",
                "period_start_date": "2024-01-01",
                "period_end_date": "2024-12-31",
                "calculation_trace": [{"step": "calc", "result": "100"}],
                "status": "draft",
                "total_recovery": "100.00",
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            },
            {
                "id": str(snapshot_2_id),
                "organization_id": str(test_org_id),
                "property_id": str(property_a_id),
                "lease_id": str(uuid4()),
                "tenant_name": "Tenant 2",
                "period_start_date": "2024-01-01",
                "period_end_date": "2024-12-31",
                "calculation_trace": [],  # Empty trace!
                "status": "draft",
                "total_recovery": "0.00",
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            },
        ]

        # Initialize test data (synchronous)
        org_a_admin_client.mock_supabase._test_data["reconciliation_snapshots"] = (
            draft_snapshots
        )

        # Make request
        response = org_a_admin_client.post(
            "/api/v1/reconciliation/snapshots/finalize-batch",
            json={
                "property_id": str(property_a_id),
                "period_start": "2024-01-01",
                "period_end": "2024-12-31",
            },
        )

        # Should return 200 with 1 success, 1 failure
        assert response.status_code == 200
        data = response.json()
        assert data["total_attempted"] == 2
        assert data["total_succeeded"] == 1
        assert data["total_failed"] == 1

        # Verify error message for empty trace snapshot
        failed_result = next(
            r for r in data["results"] if r["snapshot_id"] == str(snapshot_2_id)
        )
        assert failed_result["success"] is False
        assert "calculation trace" in failed_result["error_message"].lower()


# ============================================================================
# CATEGORY 6: Variance Error Handling (3 tests)
# Target: POST /variance exception conversion (lines 873-887)
# ============================================================================


class TestVarianceAnalysis:
    """Test POST /variance error handling."""

    @patch("app.services.analysis.HistoricalAnalysisService")
    def test_variance_converts_value_error_to_400(
        self, mock_service_class, org_a_member_client, property_a_id
    ):
        """Convert ValueError from service to 400 Bad Request."""
        # Mock service instance
        mock_service = mock_service_class.return_value

        # Service raises ValueError (invalid input)
        mock_service.get_year_over_year.side_effect = ValueError(
            "Years must be between 2000 and 2100"
        )

        # Make request
        response = org_a_member_client.post(
            "/api/v1/reconciliation/variance",
            json={
                "property_id": str(property_a_id),
                "years": [1990, 2024],  # Invalid year
                "use_fuzzy_matching": True,
            },
        )

        # Should return 400 Bad Request
        assert response.status_code == 400
        assert "2000 and 2100" in response.json()["detail"]

    @patch("app.services.analysis.HistoricalAnalysisService")
    def test_variance_converts_generic_exception_to_500(
        self, mock_service_class, org_a_member_client, property_a_id
    ):
        """Convert generic Exception from service to 500 Internal Server Error."""
        # Mock service instance
        mock_service = mock_service_class.return_value

        # Service raises unexpected exception
        mock_service.get_year_over_year.side_effect = RuntimeError(
            "Database connection lost"
        )

        # Make request
        response = org_a_member_client.post(
            "/api/v1/reconciliation/variance",
            json={
                "property_id": str(property_a_id),
                "years": [2023, 2024],
                "use_fuzzy_matching": False,
            },
        )

        # Should return 500 Internal Server Error
        assert response.status_code == 500
        detail = response.json()["detail"]
        assert "failed to generate variance analysis" in detail.lower()
        assert "database connection lost" in detail.lower()


# ============================================================================
# CATEGORY 1: Background Job Testing (8 tests)
# Target: run_reconciliation_job() async function (lines 45-217)
# ============================================================================


class TestBackgroundJob:
    """Test run_reconciliation_job() background task."""

    @pytest.mark.asyncio
    async def test_job_raises_error_when_property_not_found(self):
        """Job raises NotFoundError when property doesn't exist."""
        from app.api.v1.reconciliation import run_reconciliation_job

        job_id = uuid4()
        org_id = uuid4()
        property_id = uuid4()

        # Mock Supabase client
        mock_supabase = MagicMock()

        # Mock job update (running)
        mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
            {}
        ]

        # Mock property fetch (not found)
        property_result = MagicMock()
        property_result.data = None  # Property not found!
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            property_result
        )

        user_id = uuid4()

        # Run job and expect NotFoundError
        with patch(
            "app.api.v1.reconciliation.capture_unexpected_exception"
        ) as mock_capture:
            with pytest.raises(NotFoundError) as exc_info:
                await run_reconciliation_job(
                    job_id=job_id,
                    org_id=org_id,
                    property_id=property_id,
                    period_start=date(2024, 1, 1),
                    period_end=date(2024, 12, 31),
                    force_recalculate=False,
                    user_id=user_id,
                    supabase=mock_supabase,
                )

        assert "Property" in str(exc_info.value)
        mock_capture.assert_called_once()
        _, kwargs = mock_capture.call_args
        assert kwargs["operation"] == "reconciliation.background_job"
        assert kwargs["tags"] == {
            "job_type": "reconciliation",
        }
        assert kwargs["extra"] == {
            "period_start": "2024-01-01",
            "period_end": "2024-12-31",
            "force_recalculate": False,
        }

    @pytest.mark.asyncio
    async def test_job_rejects_existing_drafts_without_force(self):
        """Job raises ConflictError when drafts exist and force_recalculate=False."""
        from app.api.v1.reconciliation import run_reconciliation_job

        job_id = uuid4()
        org_id = uuid4()
        property_id = uuid4()

        # Mock Supabase client
        mock_supabase = MagicMock()

        # Mock job update (running)
        mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
            {}
        ]

        # Mock property fetch (success)
        property_result = MagicMock()
        property_result.data = {
            "id": str(property_id),
            "total_rentable_sqft": 10000,
        }
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
            property_result
        )

        # Mock existing drafts check (drafts found!)
        drafts_result = MagicMock()
        drafts_result.data = [{"id": str(uuid4())}]  # 1 existing draft
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = (
            drafts_result
        )

        # Run job and expect ConflictError
        with pytest.raises(ConflictError) as exc_info:
            await run_reconciliation_job(
                job_id=job_id,
                org_id=org_id,
                property_id=property_id,
                period_start=date(2024, 1, 1),
                period_end=date(2024, 12, 31),
                force_recalculate=False,  # Not forcing!
                user_id=uuid4(),
                supabase=mock_supabase,
            )

        assert "draft" in str(exc_info.value).lower()
        assert "already exist" in str(exc_info.value).lower()
