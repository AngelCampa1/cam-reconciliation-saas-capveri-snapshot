"""Coverage tests for reconciliation background job execution paths."""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.api.v1.reconciliation import _fetch_all_pages, run_reconciliation_job
from app.exceptions import NotFoundError
from app.services.calculation.models import CalculationTrace
from app.services.calculation.trace_persistence import compute_trace_checksum

TEST_ENGINE_VERSION = "test-engine-sha"


def _make_trace() -> CalculationTrace:
    """Build a real CalculationTrace with engine_version + one step.

    The reconciliation job persists provenance (engine_version +
    SHA-256 trace_checksum) from the trace, so tests must pass a real
    trace object rather than a bare stub.
    """
    trace = CalculationTrace(
        calculation_type="reconciliation",
        property_id=uuid4(),
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
        engine_version=TEST_ENGINE_VERSION,
    )
    trace.add_step(
        name="Step",
        inputs={"x": Decimal("1")},
        operation="noop",
        output=Decimal("1"),
    )
    return trace


def _configure_paged_query(query: MagicMock, pages: list[list[dict]]) -> None:
    query.range.side_effect = [
        MagicMock(execute=MagicMock(return_value=MagicMock(data=page)))
        for page in pages
    ]


def test_fetch_all_pages_reads_until_short_page():
    """GL fetches must not silently stop at Supabase's default page size."""
    query = MagicMock()
    first_page = [{"id": str(i)} for i in range(1000)]
    second_page = [{"id": str(i)} for i in range(1000, 1005)]
    _configure_paged_query(query, [first_page, second_page])

    rows = _fetch_all_pages(query)

    assert rows == first_page + second_page
    assert query.range.call_args_list[0].args == (0, 999)
    assert query.range.call_args_list[1].args == (1000, 1999)


@pytest.mark.asyncio
async def test_run_reconciliation_job_force_recalculate_success():
    """Background job should run end-to-end and complete when force_recalculate=True."""
    job_id = uuid4()
    org_id = uuid4()
    property_id = uuid4()
    lease_id = uuid4()
    term_version_id = uuid4()

    supabase = MagicMock()

    calc_jobs_qb = MagicMock()
    calc_jobs_qb.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": str(job_id)}]
    )

    properties_qb = MagicMock()
    (
        properties_qb.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(
        data={
            "id": str(property_id),
            "total_rentable_sqft": Decimal("100000"),
            "gross_up_target": "0.95",
        }
    )

    snapshots_qb = MagicMock()
    (
        snapshots_qb.delete.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value
    ) = MagicMock(data=[])
    snapshots_qb.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": str(uuid4())}]
    )

    gl_qb = MagicMock()
    _configure_paged_query(
        gl_qb.select.return_value.eq.return_value.gte.return_value.lte.return_value,
        [
            [
                {
                    "id": str(uuid4()),
                    "account_code": "6100",
                    "amount": "1000.00",
                }
            ]
        ],
    )

    expense_pools_qb = MagicMock()
    expense_pool_id = uuid4()
    expense_pools_qb.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(
            data=[
                {
                    "id": str(expense_pool_id),
                    "name": "Utilities",
                    "pool_type": "controllable",
                    "is_gross_up_applicable": True,
                    "gross_up_target": "0.95",
                }
            ]
        )
    )

    pool_mappings_qb = MagicMock()
    pool_mappings_qb.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(
            data=[
                {
                    "expense_pool_id": str(expense_pool_id),
                    "gl_account_pattern": "61*",
                    "allocation_percentage": "1.0",
                    "priority": 10,
                }
            ]
        )
    )

    cross_doc_qb = MagicMock()
    (
        cross_doc_qb.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value
    ) = MagicMock(data=[])

    def table_side_effect(name: str):
        return {
            "calculation_jobs": calc_jobs_qb,
            "properties": properties_qb,
            "reconciliation_snapshots": snapshots_qb,
            "gl_entries": gl_qb,
            "expense_pools": expense_pools_qb,
            "pool_mappings": pool_mappings_qb,
            "cross_doc_analyses": cross_doc_qb,
        }[name]

    supabase.table.side_effect = table_side_effect

    tenant_result = SimpleNamespace(
        lease_id=lease_id,
        total_operating_expenses=Decimal("1000.00"),
        grossed_up_expenses=Decimal("1050.00"),
        base_year_amount=Decimal("900.00"),
        tenant_share_before_cap=Decimal("100.00"),
        tenant_share_after_cap=Decimal("95.00"),
        admin_fee=Decimal("5.00"),
        total_recovery=Decimal("100.00"),
        trace=_make_trace(),
        lease_terms_snapshot={
            "lease_id": str(lease_id),
            "tenant_name": "Tenant",
            "pro_rata_share": "0.10",
        },
        term_version_id=term_version_id,
    )
    reconciliation_result = SimpleNamespace(tenant_reconciliations=[tenant_result])

    mock_run_recon = AsyncMock(return_value=reconciliation_result)
    with (
        patch(
            "app.api.v1.reconciliation.fetch_active_leases",
            return_value=[SimpleNamespace(id=lease_id)],
        ),
        patch(
            "app.services.calculation.pool_aggregator.aggregate_by_pools",
            return_value={
                expense_pool_id: SimpleNamespace(total_amount=Decimal("1000.00"))
            },
        ),
        patch(
            "app.api.v1.reconciliation.run_property_reconciliation",
            mock_run_recon,
        ),
    ):
        await run_reconciliation_job(
            job_id=job_id,
            org_id=org_id,
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            force_recalculate=True,
            user_id=uuid4(),
            supabase=supabase,
        )

    assert calc_jobs_qb.update.call_count >= 3
    assert snapshots_qb.insert.called
    snapshots_qb.delete.return_value.eq.assert_any_call("property_id", str(property_id))
    snapshots_qb.delete.return_value.eq.return_value.eq.assert_any_call(
        "organization_id", str(org_id)
    )
    # Verify cross_doc_advisories kwarg was passed to run_property_reconciliation
    mock_run_recon.assert_awaited_once()
    call_kwargs = mock_run_recon.call_args.kwargs
    assert "cross_doc_advisories" in call_kwargs
    assert "cross_doc_overrides" in call_kwargs
    inserted_snapshot = snapshots_qb.insert.call_args.args[0]
    assert inserted_snapshot["organization_id"] == str(org_id)
    # A tenant_result with no per-pool split persists pool_breakdowns as NULL
    # (aggregate-only snapshot), not an empty array.
    assert inserted_snapshot["pool_breakdowns"] is None
    assert inserted_snapshot["lease_terms_snapshot"]["pro_rata_share"] == "0.10"
    assert inserted_snapshot["term_version_id"] == str(term_version_id)
    # BUG-08 regression: the calculate path MUST persist provenance for audit
    # trail integrity. Both columns were always NULL before this fix.
    assert inserted_snapshot["engine_version"] == TEST_ENGINE_VERSION
    checksum = inserted_snapshot["trace_checksum"]
    assert isinstance(checksum, str) and len(checksum) == 64
    # Checksum is deterministic over the same trace.
    assert checksum == compute_trace_checksum(tenant_result.trace)


@pytest.mark.asyncio
async def test_run_reconciliation_job_persists_populated_pool_breakdowns():
    """A tenant_result carrying a per-pool split is serialized into the snapshot
    insert payload as a JSONB-safe list (Decimal money -> JSON strings)."""
    from app.services.calculation.pool_allocation import PoolRecovery

    job_id = uuid4()
    org_id = uuid4()
    property_id = uuid4()
    lease_id = uuid4()

    supabase = MagicMock()

    calc_jobs_qb = MagicMock()
    calc_jobs_qb.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": str(job_id)}]
    )

    properties_qb = MagicMock()
    (
        properties_qb.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(
        data={
            "id": str(property_id),
            "total_rentable_sqft": Decimal("100000"),
            "gross_up_target": "0.95",
        }
    )

    snapshots_qb = MagicMock()
    (
        snapshots_qb.delete.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value
    ) = MagicMock(data=[])
    snapshots_qb.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": str(uuid4())}]
    )

    gl_qb = MagicMock()
    _configure_paged_query(
        gl_qb.select.return_value.eq.return_value.gte.return_value.lte.return_value,
        [[{"id": str(uuid4()), "account_code": "6100", "amount": "1000.00"}]],
    )

    expense_pools_qb = MagicMock()
    expense_pool_id = uuid4()
    expense_pools_qb.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(
            data=[
                {
                    "id": str(expense_pool_id),
                    "name": "Utilities",
                    "pool_type": "controllable",
                    "is_gross_up_applicable": True,
                    "gross_up_target": "0.95",
                }
            ]
        )
    )

    pool_mappings_qb = MagicMock()
    pool_mappings_qb.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(
            data=[
                {
                    "expense_pool_id": str(expense_pool_id),
                    "gl_account_pattern": "61*",
                    "allocation_percentage": "1.0",
                    "priority": 10,
                }
            ]
        )
    )

    cross_doc_qb = MagicMock()
    (
        cross_doc_qb.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value
    ) = MagicMock(data=[])

    def table_side_effect(name: str):
        return {
            "calculation_jobs": calc_jobs_qb,
            "properties": properties_qb,
            "reconciliation_snapshots": snapshots_qb,
            "gl_entries": gl_qb,
            "expense_pools": expense_pools_qb,
            "pool_mappings": pool_mappings_qb,
            "cross_doc_analyses": cross_doc_qb,
        }[name]

    supabase.table.side_effect = table_side_effect

    pool = PoolRecovery(
        pool_name="Utilities",
        recoverable_amount=Decimal("1000.00"),
        is_cap_eligible=True,
        is_admin_fee_eligible=True,
        share_before_cap=Decimal("100.00"),
        cap_adjustment=Decimal("-5.00"),
        share_after_cap=Decimal("95.00"),
        admin_fee=Decimal("5.00"),
        total_recovery=Decimal("100.00"),
    )
    tenant_result = SimpleNamespace(
        lease_id=lease_id,
        total_operating_expenses=Decimal("1000.00"),
        grossed_up_expenses=Decimal("1050.00"),
        base_year_amount=Decimal("900.00"),
        tenant_share_before_cap=Decimal("100.00"),
        tenant_share_after_cap=Decimal("95.00"),
        admin_fee=Decimal("5.00"),
        total_recovery=Decimal("100.00"),
        trace=_make_trace(),
        lease_terms_snapshot=None,
        term_version_id=None,
        pool_breakdowns=[pool],
    )
    reconciliation_result = SimpleNamespace(tenant_reconciliations=[tenant_result])

    mock_run_recon = AsyncMock(return_value=reconciliation_result)
    with (
        patch(
            "app.api.v1.reconciliation.fetch_active_leases",
            return_value=[SimpleNamespace(id=lease_id)],
        ),
        patch(
            "app.services.calculation.pool_aggregator.aggregate_by_pools",
            return_value={
                expense_pool_id: SimpleNamespace(total_amount=Decimal("1000.00"))
            },
        ),
        patch(
            "app.api.v1.reconciliation.run_property_reconciliation",
            mock_run_recon,
        ),
    ):
        await run_reconciliation_job(
            job_id=job_id,
            org_id=org_id,
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            force_recalculate=True,
            user_id=uuid4(),
            supabase=supabase,
        )

    inserted_snapshot = snapshots_qb.insert.call_args.args[0]
    breakdowns = inserted_snapshot["pool_breakdowns"]
    assert isinstance(breakdowns, list) and len(breakdowns) == 1
    assert breakdowns[0]["pool_name"] == "Utilities"
    # JSONB-safe: nested Decimals serialized to strings, no precision loss.
    assert breakdowns[0]["total_recovery"] == "100.00"
    assert breakdowns[0]["cap_adjustment"] == "-5.00"


@pytest.mark.asyncio
async def test_run_reconciliation_job_marks_failed_on_exception():
    """Background job should mark job as failed and re-raise on internal errors."""
    job_id = uuid4()
    org_id = uuid4()
    property_id = uuid4()
    supabase = MagicMock()

    calc_jobs_qb = MagicMock()
    calc_jobs_qb.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": str(job_id)}]
    )

    properties_qb = MagicMock()
    (
        properties_qb.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(data=None)

    def table_side_effect(name: str):
        return {
            "calculation_jobs": calc_jobs_qb,
            "properties": properties_qb,
        }[name]

    supabase.table.side_effect = table_side_effect

    with pytest.raises(NotFoundError):
        await run_reconciliation_job(
            job_id=job_id,
            org_id=org_id,
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            force_recalculate=False,
            user_id=uuid4(),
            supabase=supabase,
        )

    assert calc_jobs_qb.update.call_count >= 2


@pytest.mark.asyncio
async def test_run_reconciliation_job_advisory_fetch_failure_is_non_blocking():
    """Cross-doc advisory fetch errors must not abort the reconciliation job."""
    job_id = uuid4()
    org_id = uuid4()
    property_id = uuid4()
    lease_id = uuid4()

    supabase = MagicMock()

    calc_jobs_qb = MagicMock()
    calc_jobs_qb.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": str(job_id)}]
    )

    properties_qb = MagicMock()
    (
        properties_qb.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(
        data={
            "id": str(property_id),
            "total_rentable_sqft": Decimal("100000"),
            "gross_up_target": "0.95",
        }
    )

    snapshots_qb = MagicMock()
    (
        snapshots_qb.delete.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value
    ) = MagicMock(data=[])
    snapshots_qb.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": str(uuid4())}]
    )

    gl_qb = MagicMock()
    _configure_paged_query(
        gl_qb.select.return_value.eq.return_value.gte.return_value.lte.return_value,
        [[]],
    )

    expense_pools_qb = MagicMock()
    expense_pool_id = uuid4()
    expense_pools_qb.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(
            data=[
                {
                    "id": str(expense_pool_id),
                    "name": "Utilities",
                    "pool_type": "controllable",
                    "is_gross_up_applicable": False,
                    "gross_up_target": "0.95",
                }
            ]
        )
    )

    pool_mappings_qb = MagicMock()
    pool_mappings_qb.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[])
    )

    def table_side_effect(name: str):
        return {
            "calculation_jobs": calc_jobs_qb,
            "properties": properties_qb,
            "reconciliation_snapshots": snapshots_qb,
            "gl_entries": gl_qb,
            "expense_pools": expense_pools_qb,
            "pool_mappings": pool_mappings_qb,
        }[name]

    supabase.table.side_effect = table_side_effect

    tenant_result = SimpleNamespace(
        lease_id=lease_id,
        total_operating_expenses=Decimal("0.00"),
        grossed_up_expenses=Decimal("0.00"),
        base_year_amount=Decimal("0.00"),
        tenant_share_before_cap=Decimal("0.00"),
        tenant_share_after_cap=Decimal("0.00"),
        admin_fee=Decimal("0.00"),
        total_recovery=Decimal("0.00"),
        trace=_make_trace(),
    )
    reconciliation_result = SimpleNamespace(tenant_reconciliations=[tenant_result])

    with (
        patch(
            "app.api.v1.reconciliation.fetch_active_leases",
            return_value=[SimpleNamespace(id=lease_id)],
        ),
        patch(
            "app.services.calculation.pool_aggregator.aggregate_by_pools",
            return_value={},
        ),
        patch(
            "app.api.v1.reconciliation.run_property_reconciliation",
            AsyncMock(return_value=reconciliation_result),
        ),
        # Advisory fetch raises a ValueError — must be swallowed (local import in fn)
        patch(
            "app.services.extraction.cross_doc_persistence.get_accepted_advisories",
            AsyncMock(side_effect=ValueError("DB schema mismatch")),
        ),
    ):
        # Should complete without raising
        await run_reconciliation_job(
            job_id=job_id,
            org_id=org_id,
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            force_recalculate=True,
            user_id=uuid4(),
            supabase=supabase,
        )

    # Job completed successfully despite advisory fetch failure
    assert calc_jobs_qb.update.call_count >= 3


@pytest.mark.asyncio
async def test_run_reconciliation_job_advisory_fetch_runtime_error_is_non_blocking():
    """RuntimeError (e.g. DB connection) during advisory fetch must not abort the job."""
    job_id = uuid4()
    org_id = uuid4()
    property_id = uuid4()
    lease_id = uuid4()

    supabase = MagicMock()

    calc_jobs_qb = MagicMock()
    calc_jobs_qb.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": str(job_id)}]
    )

    properties_qb = MagicMock()
    (
        properties_qb.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value
    ) = MagicMock(
        data={
            "id": str(property_id),
            "total_rentable_sqft": Decimal("100000"),
            "gross_up_target": "0.95",
        }
    )

    snapshots_qb = MagicMock()
    (
        snapshots_qb.delete.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value
    ) = MagicMock(data=[])
    snapshots_qb.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": str(uuid4())}]
    )

    gl_qb = MagicMock()
    _configure_paged_query(
        gl_qb.select.return_value.eq.return_value.gte.return_value.lte.return_value,
        [[]],
    )

    expense_pools_qb = MagicMock()
    expense_pool_id = uuid4()
    expense_pools_qb.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(
            data=[
                {
                    "id": str(expense_pool_id),
                    "name": "Utilities",
                    "pool_type": "controllable",
                    "is_gross_up_applicable": False,
                    "gross_up_target": "0.95",
                }
            ]
        )
    )

    pool_mappings_qb = MagicMock()
    pool_mappings_qb.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[])
    )

    def table_side_effect(name: str):
        return {
            "calculation_jobs": calc_jobs_qb,
            "properties": properties_qb,
            "reconciliation_snapshots": snapshots_qb,
            "gl_entries": gl_qb,
            "expense_pools": expense_pools_qb,
            "pool_mappings": pool_mappings_qb,
        }[name]

    supabase.table.side_effect = table_side_effect

    tenant_result = SimpleNamespace(
        lease_id=lease_id,
        total_operating_expenses=Decimal("0.00"),
        grossed_up_expenses=Decimal("0.00"),
        base_year_amount=Decimal("0.00"),
        tenant_share_before_cap=Decimal("0.00"),
        tenant_share_after_cap=Decimal("0.00"),
        admin_fee=Decimal("0.00"),
        total_recovery=Decimal("0.00"),
        trace=_make_trace(),
    )
    reconciliation_result = SimpleNamespace(tenant_reconciliations=[tenant_result])

    with (
        patch(
            "app.api.v1.reconciliation.fetch_active_leases",
            return_value=[SimpleNamespace(id=lease_id)],
        ),
        patch(
            "app.services.calculation.pool_aggregator.aggregate_by_pools",
            return_value={},
        ),
        patch(
            "app.api.v1.reconciliation.run_property_reconciliation",
            AsyncMock(return_value=reconciliation_result),
        ),
        # Advisory fetch raises RuntimeError (e.g. DB connection failure)
        patch(
            "app.services.extraction.cross_doc_persistence.get_accepted_advisories",
            AsyncMock(side_effect=RuntimeError("connection refused")),
        ),
    ):
        # Must complete without raising despite RuntimeError
        await run_reconciliation_job(
            job_id=job_id,
            org_id=org_id,
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            force_recalculate=True,
            user_id=uuid4(),
            supabase=supabase,
        )

    assert calc_jobs_qb.update.call_count >= 3
