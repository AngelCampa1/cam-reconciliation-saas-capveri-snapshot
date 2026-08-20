"""
Reconciliation calculation endpoints.

Provides endpoints for triggering reconciliation calculations, checking job status,
and managing reconciliation snapshots.
"""

import logging
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status

from app.auth.dependencies import (
    CurrentUser,
    OrgContext,
    require_org_admin,
    require_org_editor,
)
from app.core.sentry import capture_unexpected_exception
from app.database.client import get_supabase_admin
from app.database.pagination import chunked
from app.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models import (
    BatchFinalizeRequest,
    BatchFinalizeResponse,
    BatchFinalizeResult,
    CalculationJobCreate,
    CalculationJobResponse,
    CalculationJobStatus,
    CalculationJobStatusResponse,
    FinalizeSnapshotResponse,
    PaginatedResponse,
    ReconciliationSnapshot,
    ReconciliationSnapshotCreate,
    ReconciliationSnapshotSummary,
    ReconciliationStatus,
)
from app.models.enums import CampaignStatus
from app.models.historical_analysis import (
    YearOverYearComparison,
    YearOverYearRequest,
)
from app.models.reconciliation_snapshot import (
    ReconciliationCell,
    ReconciliationCellUpdate,
    decode_cell_id,
)
from app.services.billing.entitlements import has_full_access
from app.services.billing.feature_usage import record_feature_use
from app.services.billing.free_audit import (
    has_active_subscription,
)
from app.services.calculation import (
    ReconciliationInput,
    fetch_active_leases,
    run_property_reconciliation,
)
from app.services.calculation.cap_bank_ledger import get_cap_bank_ledger
from app.services.calculation.models import CapBankLedger
from app.services.calculation.trace_persistence import compute_trace_checksum

logger = logging.getLogger(__name__)

router = APIRouter()


def _fetch_all_pages(query: Any, *, page_size: int = 1000) -> list[dict[str, Any]]:
    """Fetch every row from a Supabase query builder using explicit ranges."""
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        end = start + page_size - 1
        response = query.range(start, end).execute()
        page = response.data or []
        rows.extend(page)
        if len(page) < page_size:
            return rows
        start += page_size


def _upsert_campaign(
    supabase: Any,
    org_id: UUID,
    property_id: UUID,
    period_year: int,
    target_status: str,
    *,
    ignore_if_exists: bool = False,
    only_from_status: str | None = None,
) -> None:
    """Upsert a reconciliation campaign row for the given property+year.

    Args:
        supabase: Supabase client (RLS-scoped).
        org_id: Organization UUID.
        property_id: Property UUID.
        period_year: Reconciliation period year.
        target_status: Desired campaign status value.
        ignore_if_exists: If True, do NOT overwrite an existing row
            (used by calc-job start so we don't reset an advanced campaign).
        only_from_status: If set, only update if current status matches
            (prevents regressing an advanced campaign).
    """
    row = {
        "organization_id": str(org_id),
        "property_id": str(property_id),
        "period_year": period_year,
        "status": target_status,
    }

    if ignore_if_exists:
        # INSERT … ON CONFLICT DO NOTHING
        supabase.table("reconciliation_campaigns").upsert(
            row,
            on_conflict="property_id,period_year",
            ignore_duplicates=True,
        ).execute()
    elif only_from_status:
        # Conditional update: only advance if current status matches
        supabase.table("reconciliation_campaigns").update({"status": target_status}).eq(
            "property_id", str(property_id)
        ).eq("period_year", period_year).eq("status", only_from_status).execute()
        # Also try insert in case no row exists yet
        supabase.table("reconciliation_campaigns").upsert(
            row,
            on_conflict="property_id,period_year",
            ignore_duplicates=True,
        ).execute()
    else:
        # INSERT … ON CONFLICT UPDATE status
        supabase.table("reconciliation_campaigns").upsert(
            row,
            on_conflict="property_id,period_year",
            ignore_duplicates=False,
        ).execute()


def _get_active_subscription(ctx: Any) -> dict | None:
    """Return active/trialing subscription for the org, or None."""
    if has_active_subscription(ctx):
        return {"status": "active"}
    return None


async def run_reconciliation_job(
    job_id: UUID,
    org_id: UUID,
    property_id: UUID,
    period_start: date,
    period_end: date,
    force_recalculate: bool,
    user_id: UUID,
    supabase: Any = None,
) -> None:
    """
    Background task to run reconciliation calculation.

    Updates the job status as it progresses and creates snapshot records.
    """
    # Get Supabase client if not provided (for production use)
    if supabase is None:
        from app.database.client import get_supabase_admin

        supabase = get_supabase_admin()

    try:
        # Update job status to running
        supabase.table("calculation_jobs").update(
            {"status": "running", "started_at": datetime.now().isoformat()}
        ).eq("id", str(job_id)).execute()

        # Fetch property details
        property_result = (
            supabase.table("properties")
            .select("*")
            .eq("id", str(property_id))
            .eq("organization_id", str(org_id))
            .maybe_single()
            .execute()
        )

        if not property_result or not property_result.data:
            raise NotFoundError("Property", str(property_id))

        property_data = property_result.data

        # Check for existing draft snapshots
        if not force_recalculate:
            existing_drafts = (
                supabase.table("reconciliation_snapshots")
                .select("id", count="exact")
                .eq("property_id", str(property_id))
                .eq("organization_id", str(org_id))
                .eq("period_start_date", period_start.isoformat())
                .eq("period_end_date", period_end.isoformat())
                .eq("status", ReconciliationStatus.DRAFT.value)
                .execute()
            )

            if existing_drafts.data and len(existing_drafts.data) > 0:
                raise ConflictError(
                    "Draft reconciliation snapshots already exist for this "
                    "property and period. Use force_recalculate=true to "
                    "delete existing drafts and recalculate."
                )

        # If force_recalculate, delete existing drafts
        if force_recalculate:
            supabase.table("reconciliation_snapshots").delete().eq(
                "property_id", str(property_id)
            ).eq("organization_id", str(org_id)).eq(
                "period_start_date", period_start.isoformat()
            ).eq(
                "period_end_date", period_end.isoformat()
            ).eq(
                "status", ReconciliationStatus.DRAFT.value
            ).execute()

        # Fetch active leases
        leases = fetch_active_leases(
            property_id,
            period_start,
            period_end,
            supabase,  # Pass the Supabase client for background task context
        )

        # Update total leases count
        supabase.table("calculation_jobs").update({"total_leases": len(leases)}).eq(
            "id", str(job_id)
        ).execute()

        # Fetch GL entries for the period
        # Broaden query to include entries matching EITHER transaction_date OR
        # accrual_date within the period, so accrual-basis leases can filter
        # by accrual_date while cash-basis leases filter by transaction_date.
        any_lease_uses_accrual = any(
            getattr(lease, "accounting_basis", None) == "accrual" for lease in leases
        )
        if any_lease_uses_accrual:
            gl_query = (
                supabase.table("gl_entries")
                .select("*")
                .eq("property_id", str(property_id))
                .or_(
                    f"and(transaction_date.gte.{period_start.isoformat()},transaction_date.lte.{period_end.isoformat()}),"
                    f"and(accrual_date.gte.{period_start.isoformat()},accrual_date.lte.{period_end.isoformat()})"
                )
            )
        else:
            # Fast path: all leases are cash basis (or unset → default cash)
            gl_query = (
                supabase.table("gl_entries")
                .select("*")
                .eq("property_id", str(property_id))
                .gte("transaction_date", period_start.isoformat())
                .lte("transaction_date", period_end.isoformat())
            )
        gl_entries = _fetch_all_pages(gl_query)

        # Check for unreviewed CapEx flags (non-blocking advisory warning)
        try:
            from app.services.analysis.capex_classifier import CapExClassifierService

            capex_service = CapExClassifierService()
            unreviewed = await capex_service.get_unreviewed_count(
                property_id=str(property_id),
                period_year=period_start.year,
                org_id=str(org_id),
                supabase=supabase,
            )
            if unreviewed > 0:
                supabase.table("calculation_jobs").update(
                    {
                        "warnings": [
                            f"{unreviewed} potential CapEx entries not yet reviewed"
                        ]
                    }
                ).eq("id", str(job_id)).execute()
        except Exception:
            logger.warning("CapEx warning check failed (non-blocking)", exc_info=True)

        # Fetch expense pools for this property to get metadata
        expense_pools_result = (
            supabase.table("expense_pools")
            .select("*")
            .eq("property_id", str(property_id))
            .execute()
        )

        # Fetch pool mappings for this property's expense pools
        # Note: pool_mappings doesn't have organization_id - it's accessed through
        # pool_mappings -> expense_pools -> properties -> organization_id
        pool_mappings_result = (
            supabase.table("pool_mappings")
            .select("*, expense_pools!inner(property_id)")
            .eq("expense_pools.property_id", str(property_id))
            .order("priority", desc=True)
            .execute()
        )

        # Build pool summaries by aggregating GL entries and combining
        # with pool metadata
        from decimal import Decimal

        from app.services.calculation.expense_filter import ExpensePoolSummary
        from app.services.calculation.gl_date_filter import (
            filter_gl_entries_by_basis,
        )
        from app.services.calculation.pool_aggregator import (
            GLEntry,
            PoolMapping,
            aggregate_by_pools,
            aggregate_with_splits,
            build_split_allocations_from_pool_allocations,
        )

        # Convert pool mappings (shared across all bases)
        pool_mappings = [
            PoolMapping(
                pool_id=UUID(mapping["expense_pool_id"]),
                pool_name="",
                pattern=mapping["gl_account_pattern"],
                allocation_percentage=Decimal(
                    str(mapping.get("allocation_percentage", 1.0))
                ),
                priority=mapping.get("priority", 0),
            )
            for mapping in pool_mappings_result.data
        ]

        # Build expense pool metadata lookup
        expense_pools_by_id = {
            UUID(pool["id"]): pool for pool in expense_pools_result.data
        }
        pool_ids = [str(pool_id) for pool_id in expense_pools_by_id]
        try:
            pool_allocations_result = (
                supabase.table("pool_allocations")
                .select("*")
                .in_("source_pool_id", pool_ids)
                .execute()
                if pool_ids
                else None
            )
        except Exception:
            logger.warning(
                "Pool allocation fetch failed; continuing without splits",
                exc_info=True,
            )
            pool_allocations_result = None
        split_allocations = build_split_allocations_from_pool_allocations(
            pool_mappings,
            pool_allocations_result.data if pool_allocations_result else [],
            valid_pool_ids=set(expense_pools_by_id),
        )

        def _build_pool_summaries(
            totals: dict,
        ) -> dict[UUID, ExpensePoolSummary]:
            result_map: dict[UUID, ExpensePoolSummary] = {}
            for pid, pt in totals.items():
                pm = expense_pools_by_id.get(pid)
                if pm:
                    result_map[pid] = ExpensePoolSummary(
                        pool_id=pid,
                        pool_name=pm["name"],
                        pool_type=pm["pool_type"],
                        total_amount=pt.total_amount,
                        is_gross_up_applicable=pm.get("is_gross_up_applicable", False),
                        gross_up_target=(
                            Decimal(str(pm["gross_up_target"]))
                            if pm.get("gross_up_target")
                            else None
                        ),
                    )
            return result_map

        def _filter_and_aggregate(basis: str) -> dict:
            filtered = filter_gl_entries_by_basis(
                gl_entries, basis, period_start, period_end
            )
            entries = [
                GLEntry(
                    id=UUID(e["id"]),
                    account_code=e["account_code"],
                    amount=Decimal(str(e["amount"])),
                )
                for e in filtered
            ]
            if split_allocations:
                return aggregate_with_splits(entries, pool_mappings, split_allocations)
            return aggregate_by_pools(entries, pool_mappings)

        # Determine unique accounting bases across leases
        bases = {getattr(lease, "accounting_basis", None) or "cash" for lease in leases}

        pool_summaries_by_basis: dict[str, dict[UUID, ExpensePoolSummary]] | None = None

        if len(bases) == 1:
            # Fast path: single basis
            effective_basis = bases.pop()
            pool_totals = _filter_and_aggregate(effective_basis)
            pool_summaries = _build_pool_summaries(pool_totals)
        else:
            # Mixed basis: aggregate separately per basis
            pool_summaries_by_basis = {}
            for basis in bases:
                totals = _filter_and_aggregate(basis)
                pool_summaries_by_basis[basis] = _build_pool_summaries(totals)
            # Default pool_summaries uses cash for gross-up calc
            pool_summaries = pool_summaries_by_basis.get("cash", {})

        # Run reconciliation orchestrator
        from app.models.enums import BomaStandardVersion

        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=period_start,
            period_end=period_end,
            total_rentable_sqft=property_data["total_rentable_sqft"],
            target_occupancy=property_data.get("gross_up_target", "0.95"),
            boma_standard_version=BomaStandardVersion(
                property_data.get("boma_standard_version", "2024")
            ),
        )

        # Fetch accepted cross-doc reconciliation context (non-blocking)
        cross_doc_advisories = None
        cross_doc_overrides = None
        try:
            from app.services.extraction.cross_doc_persistence import (
                get_accepted_advisories,
                get_accepted_overrides,
            )

            cross_doc_advisories = await get_accepted_advisories(
                db=supabase,
                property_id=property_id,
                period_year=period_start.year,
                org_id=org_id,
            )
            cross_doc_overrides = await get_accepted_overrides(
                db=supabase,
                property_id=property_id,
                period_year=period_start.year,
                org_id=org_id,
            )
        except Exception:
            logger.warning(
                "Failed to fetch cross-doc reconciliation context (non-blocking)",
                exc_info=True,
            )

        result = await run_property_reconciliation(
            input_data,
            leases,
            pool_summaries,
            supabase,
            pool_summaries_by_basis=pool_summaries_by_basis,
            cross_doc_advisories=cross_doc_advisories,
            cross_doc_overrides=cross_doc_overrides,
        )

        # Create snapshot records for each tenant
        snapshot_ids = []
        for tenant_result in result.tenant_reconciliations:
            snapshot_data = ReconciliationSnapshotCreate(
                property_id=property_id,
                lease_id=tenant_result.lease_id,
                period_start_date=period_start,
                period_end_date=period_end,
                status=ReconciliationStatus.DRAFT,
                total_operating_expenses=tenant_result.total_operating_expenses,
                grossed_up_expenses=tenant_result.grossed_up_expenses,
                base_year_amount=tenant_result.base_year_amount or Decimal("0"),
                tenant_share_before_cap=tenant_result.tenant_share_before_cap,
                tenant_share_after_cap=tenant_result.tenant_share_after_cap,
                admin_fee=tenant_result.admin_fee,
                total_recovery=tenant_result.total_recovery,
                calculation_trace=[
                    step.model_dump() for step in tenant_result.trace.steps
                ],
                # Persist provenance for audit trail. engine_version is stamped on
                # the trace by the orchestrator; checksum is deterministic.
                engine_version=tenant_result.trace.engine_version or None,
                trace_checksum=compute_trace_checksum(tenant_result.trace),
                # Map engine's [] (no per-pool split) to DB NULL (aggregate-only).
                pool_breakdowns=(
                    [
                        pool.model_dump()
                        for pool in getattr(tenant_result, "pool_breakdowns", [])
                    ]
                    or None
                ),
                lease_terms_snapshot=getattr(
                    tenant_result, "lease_terms_snapshot", None
                ),
                term_version_id=getattr(tenant_result, "term_version_id", None),
            )

            snapshot_result = (
                supabase.table("reconciliation_snapshots")
                .insert(
                    {
                        **snapshot_data.model_dump(mode="json"),
                        "organization_id": str(org_id),
                    }
                )
                .execute()
            )

            snapshot_ids.append(snapshot_result.data[0]["id"])

            # Update progress
            processed = len(snapshot_ids)
            supabase.table("calculation_jobs").update(
                {"processed_leases": processed}
            ).eq("id", str(job_id)).execute()

        # Mark job as completed
        supabase.table("calculation_jobs").update(
            {
                "status": "completed",
                "completed_at": datetime.now().isoformat(),
                "snapshot_ids": snapshot_ids,
            }
        ).eq("id", str(job_id)).execute()

    except Exception as e:
        import traceback

        logger.error(
            "Reconciliation job %s failed for property %s: %s",
            job_id,
            property_id,
            e,
            exc_info=True,
        )
        capture_unexpected_exception(
            e,
            operation="reconciliation.background_job",
            tags={
                "job_type": "reconciliation",
            },
            extra={
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "force_recalculate": force_recalculate,
            },
        )
        # Mark job as failed with traceback for debugging
        supabase.table("calculation_jobs").update(
            {
                "status": "failed",
                "completed_at": datetime.now().isoformat(),
                "error_message": str(e),
                "error_details": {
                    "type": type(e).__name__,
                    "message": str(e),
                    "traceback": traceback.format_exc(),
                },
            }
        ).eq("id", str(job_id)).execute()
        raise


@router.post(
    "/calculate",
    response_model=CalculationJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_org_editor)],
)
async def calculate_reconciliation(
    request: CalculationJobCreate,
    ctx: OrgContext,
    background_tasks: BackgroundTasks,
    user: CurrentUser,
) -> CalculationJobResponse:
    """
    Trigger a reconciliation calculation for a property and period.

    Creates a background job to calculate reconciliation snapshots for all active
    leases in the specified property and period. Returns immediately with a job_id
    that can be used to poll the calculation status.

    Args:
        request: Calculation request with property_id, period dates, and options
        ctx: Organization-scoped context
        background_tasks: FastAPI background task manager
        user: Current authenticated user

    Returns:
        CalculationJobResponse with job_id for status polling

    Raises:
        404: Property not found
        409: Draft snapshots already exist (if force_recalculate=false)
    """
    # Verify property exists and belongs to organization
    property_result = (
        ctx.table("properties")
        .select("id")
        .eq("id", str(request.property_id))
        .maybe_single()
        .execute()
    )

    if not property_result or not property_result.data:
        raise NotFoundError("Property", str(request.property_id))

    # Entitlement gating: full access required. An expired card-less trial
    # resolves to "paused" inside has_full_access (and is persisted), so a
    # lapsed trial is locked out here the moment it next runs a reconciliation.
    # Anonymous PLG onboarding sessions are exempt: their bootstrap org has no
    # subscription yet, and this route is on the anonymous-onboarding allowlist
    # so the leakage preview can render before the user picks a plan.
    if not ctx.user.is_anonymous and not has_full_access(ctx):
        raise HTTPException(
            status_code=402,
            detail=(
                "subscription_required: Your free trial has ended. Choose a plan"
                " and add billing to keep running reconciliations."
            ),
        )

    # Ensure at least one active lease exists for the selected period.
    active_leases = fetch_active_leases(
        request.property_id,
        request.period_start,
        request.period_end,
        ctx.client,
    )
    if not active_leases:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="no_active_leases_for_period",
        )

    # Create calculation job record
    job_data = {
        "organization_id": str(ctx.organization_id),
        "property_id": str(request.property_id),
        "period_start": request.period_start.isoformat(),
        "period_end": request.period_end.isoformat(),
        "status": CalculationJobStatus.PENDING.value,
        "force_recalculate": request.force_recalculate,
    }

    job_result = ctx.table("calculation_jobs").insert(job_data).execute()
    job_id = UUID(job_result.data[0]["id"])

    # Auto-create campaign in DRAFT (idempotent — won't overwrite advanced status)
    try:
        _upsert_campaign(
            ctx.supabase,
            ctx.organization_id,
            request.property_id,
            request.period_end.year,
            CampaignStatus.DRAFT.value,
            ignore_if_exists=True,
        )
    except Exception:
        logger.warning(
            "Failed to upsert campaign for property %s year %s",
            request.property_id,
            request.period_end.year,
            exc_info=True,
        )

    # Schedule background task
    background_tasks.add_task(
        run_reconciliation_job,
        job_id,
        ctx.organization_id,
        request.property_id,
        request.period_start,
        request.period_end,
        request.force_recalculate,
        user.id,
        ctx.supabase,  # Pass the Supabase client
    )

    return CalculationJobResponse(
        job_id=job_id,
        status=CalculationJobStatus.PENDING,
        message=(
            f"Reconciliation calculation started. "
            f"Use job_id {job_id} to check status."
        ),
    )


@router.get(
    "/jobs/{job_id}",
    response_model=CalculationJobStatusResponse,
)
async def get_job_status(
    job_id: UUID,
    ctx: OrgContext,
) -> CalculationJobStatusResponse:
    """
    Get the status of a calculation job.

    Returns the current status, progress, and results (if completed) for a
    reconciliation calculation job.

    Args:
        job_id: UUID of the calculation job
        ctx: Organization-scoped context

    Returns:
        CalculationJobStatusResponse with current status and results

    Raises:
        404: Job not found or belongs to another organization
    """
    job_result = (
        ctx.table("calculation_jobs")
        .select("*")
        .eq("id", str(job_id))
        .maybe_single()
        .execute()
    )

    if not job_result or not job_result.data:
        raise NotFoundError("Calculation job", str(job_id))

    job_data = job_result.data

    total_leases = job_data.get("total_leases")
    processed_leases = job_data.get("processed_leases", 0)
    progress_percentage = (
        int(processed_leases / total_leases * 100) if total_leases else None
    )
    snapshot_ids = [UUID(sid) for sid in job_data.get("snapshot_ids", [])]

    # Sum recovery totals from snapshots when job is completed
    potential_recovery_total: Decimal | None = None
    if job_data["status"] == "completed" and snapshot_ids:
        recovery_result = (
            ctx.table("reconciliation_snapshots")
            .select("total_recovery")
            .in_("id", [str(sid) for sid in snapshot_ids])
            .execute()
        )
        potential_recovery_total = sum(
            (Decimal(str(r["total_recovery"] or 0)) for r in recovery_result.data),
            Decimal("0"),
        )

    return CalculationJobStatusResponse(
        job_id=UUID(job_data["id"]),
        status=CalculationJobStatus(job_data["status"]),
        property_id=UUID(job_data["property_id"]),
        period_start=job_data["period_start"],
        period_end=job_data["period_end"],
        total_leases=total_leases,
        processed_leases=processed_leases,
        progress_percentage=progress_percentage,
        snapshot_ids=snapshot_ids,
        error_message=job_data.get("error_message"),
        potential_recovery_total=potential_recovery_total,
        created_at=job_data["created_at"],
        started_at=job_data.get("started_at"),
        completed_at=job_data.get("completed_at"),
    )


@router.get(
    "/snapshots/{snapshot_id}",
    response_model=ReconciliationSnapshot,
)
async def get_snapshot(
    snapshot_id: UUID,
    ctx: OrgContext,
    include_trace: Annotated[
        bool,
        Query(
            description="Include calculation trace in response. Defaults to true.",
        ),
    ] = True,
) -> ReconciliationSnapshot:
    """
    Get a reconciliation snapshot by ID.

    Retrieves a full reconciliation snapshot with all calculated values.
    By default, includes the calculation trace for audit purposes. Set
    include_trace=false for a lighter response without trace details.

    Args:
        snapshot_id: UUID of the snapshot to retrieve
        ctx: Organization-scoped context
        include_trace: Whether to include calculation trace (default: true)

    Returns:
        ReconciliationSnapshot with all calculated fields and optional trace

    Raises:
        404: Snapshot not found or belongs to another organization
    """
    # Fetch snapshot from database
    snapshot_result = (
        ctx.table("reconciliation_snapshots")
        .select("*")
        .eq("id", str(snapshot_id))
        .maybe_single()
        .execute()
    )

    if not snapshot_result or not snapshot_result.data:
        raise NotFoundError("Reconciliation snapshot", str(snapshot_id))

    snapshot_data = snapshot_result.data

    # If trace not requested, remove it to save bandwidth
    if not include_trace:
        snapshot_data["calculation_trace"] = []

    return ReconciliationSnapshot(**snapshot_data)


@router.get(
    "/snapshots",
    response_model=PaginatedResponse[ReconciliationSnapshotSummary],
)
async def list_snapshots(
    ctx: OrgContext,
    property_id: Annotated[
        UUID | None,
        Query(description="Filter by property ID"),
    ] = None,
    lease_id: Annotated[
        UUID | None,
        Query(description="Filter by lease ID"),
    ] = None,
    period_start: Annotated[
        date | None,
        Query(description="Filter by period start date (exact match)"),
    ] = None,
    period_end: Annotated[
        date | None,
        Query(description="Filter by period end date (exact match)"),
    ] = None,
    is_finalized: Annotated[
        bool | None,
        Query(description="Filter by finalized status"),
    ] = None,
    sort_by: Annotated[
        str,
        Query(
            description="Field to sort by: created_at, tenant_name, total_recovery",
            pattern="^(created_at|tenant_name|total_recovery)$",
        ),
    ] = "created_at",
    sort_order: Annotated[
        str,
        Query(
            description="Sort order: asc or desc",
            pattern="^(asc|desc)$",
        ),
    ] = "desc",
    page: Annotated[
        int,
        Query(ge=1, description="Page number (1-indexed)"),
    ] = 1,
    size: Annotated[
        int,
        Query(ge=1, le=100, description="Page size (max 100)"),
    ] = 20,
) -> PaginatedResponse[ReconciliationSnapshotSummary]:
    """
    List reconciliation snapshots with filtering and pagination.

    Returns a paginated list of reconciliation snapshots for the authenticated
    organization. Supports filtering by property, lease, period, and status.
    Results are returned in summary form without calculation traces.

    Args:
        ctx: Organization-scoped context
        property_id: Optional property filter
        lease_id: Optional lease filter
        period_start: Optional period start date filter
        period_end: Optional period end date filter
        is_finalized: Optional finalized status filter
        sort_by: Field to sort by (default: created_at)
        sort_order: Sort order asc/desc (default: desc)
        page: Page number (1-indexed)
        size: Page size (max 100)

    Returns:
        PaginatedResponse with ReconciliationSnapshotSummary items

    Note:
        - Calculation traces are excluded from list view
        - Results are automatically scoped to organization via RLS
        - Maximum page size is 100 items
    """
    # Build base query with count to avoid separate count query
    # Supabase returns both data and count in single HTTP request
    # Include JOINs to get tenant_name and property_name for display
    query = ctx.table("reconciliation_snapshots").select(
        "id, property_id, lease_id, period_start_date, period_end_date, "
        "status, total_recovery, tenant_share_after_cap, admin_fee, "
        "finalized_at, created_at, "
        "leases!inner(tenant_name), properties!inner(name)",
        count="exact",  # Include total count in same query
    )

    # Apply filters
    if property_id is not None:
        query = query.eq("property_id", str(property_id))

    if lease_id is not None:
        query = query.eq("lease_id", str(lease_id))

    if period_start is not None:
        query = query.eq("period_start_date", period_start.isoformat())

    if period_end is not None:
        query = query.eq("period_end_date", period_end.isoformat())

    if is_finalized is not None:
        if is_finalized:
            query = query.eq("status", ReconciliationStatus.FINALIZED.value)
        else:
            query = query.eq("status", ReconciliationStatus.DRAFT.value)

    # Apply sorting
    if sort_order == "asc":
        query = query.order(sort_by, desc=False)
    else:
        query = query.order(sort_by, desc=True)

    # Calculate offset
    offset = (page - 1) * size

    # Apply pagination
    query = query.range(offset, offset + size - 1)

    # Execute query - returns both data and count in single request
    result = query.execute()

    # Extract total count from result (no separate count query needed)
    total = result.count or 0

    # Convert to summary models
    items = []
    for snapshot_data in result.data:
        # Extract tenant_name and property_name from joined data
        lease_data = snapshot_data.get("leases", {})
        property_data = snapshot_data.get("properties", {})
        tenant_name = lease_data.get("tenant_name") if lease_data else None
        property_name = property_data.get("name") if property_data else None

        # Create summary without calculation_trace
        summary = ReconciliationSnapshotSummary(
            id=snapshot_data["id"],
            property_id=snapshot_data["property_id"],
            lease_id=snapshot_data["lease_id"],
            period_start_date=snapshot_data["period_start_date"],
            period_end_date=snapshot_data["period_end_date"],
            status=snapshot_data["status"],
            total_recovery=snapshot_data["total_recovery"],
            tenant_share_after_cap=snapshot_data.get("tenant_share_after_cap"),
            admin_fee=snapshot_data.get("admin_fee"),
            is_finalized=(
                snapshot_data["status"] == ReconciliationStatus.FINALIZED.value
            ),
            finalized_at=snapshot_data.get("finalized_at"),
            created_at=snapshot_data.get("created_at"),
            tenant_name=tenant_name,
            property_name=property_name,
        )
        items.append(summary)

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=size,
    )


@router.post(
    "/snapshots/{snapshot_id}/finalize",
    response_model=FinalizeSnapshotResponse,
    dependencies=[Depends(require_org_admin)],
)
async def finalize_snapshot(
    snapshot_id: UUID,
    ctx: OrgContext,
    user: CurrentUser,
) -> FinalizeSnapshotResponse:
    """
    Finalize a reconciliation snapshot making it immutable.

    Once finalized, the snapshot cannot be modified or deleted. This operation
    sets the finalized status, timestamp, and user, making the snapshot ready
    for billing and tenant communication.

    Args:
        snapshot_id: UUID of the snapshot to finalize
        ctx: Organization-scoped context
        user: Current authenticated user

    Returns:
        FinalizeSnapshotResponse with finalization details

    Raises:
        404: Snapshot not found or belongs to another organization
        409: Snapshot is already finalized
        422: Snapshot has incomplete calculation_trace
    """
    # Fetch snapshot from database
    snapshot_result = (
        ctx.table("reconciliation_snapshots")
        .select("*")
        .eq("id", str(snapshot_id))
        .maybe_single()
        .execute()
    )

    if not snapshot_result or not snapshot_result.data:
        raise NotFoundError("Reconciliation snapshot", str(snapshot_id))

    snapshot_data = snapshot_result.data

    # Check if already finalized (idempotent operation)
    if snapshot_data["status"] == ReconciliationStatus.FINALIZED.value:
        raise ConflictError(
            f"Snapshot {snapshot_id} is already finalized and cannot be modified"
        )

    # Validate calculation trace exists and is not empty
    calculation_trace = snapshot_data.get("calculation_trace")
    if not calculation_trace or len(calculation_trace) == 0:
        raise ConflictError(
            f"Snapshot {snapshot_id} cannot be finalized: "
            "calculation_trace is missing or empty"
        )

    # Perform atomic finalization
    finalize_data = {
        "status": ReconciliationStatus.FINALIZED.value,
        "finalized_at": datetime.now().isoformat(),
        "finalized_by_user_id": str(user.id),
    }

    update_result = (
        ctx.table("reconciliation_snapshots")
        .update(finalize_data)
        .eq("id", str(snapshot_id))
        .eq("status", ReconciliationStatus.DRAFT.value)  # Ensure still draft
        .execute()
    )

    # Check if update was successful (optimistic concurrency control)
    if not update_result.data or len(update_result.data) == 0:
        # Snapshot may have been finalized by another request
        raise ConflictError(
            f"Snapshot {snapshot_id} could not be finalized. "
            "It may have been finalized by another request."
        )

    finalized_snapshot = update_result.data[0]

    return FinalizeSnapshotResponse(
        id=UUID(finalized_snapshot["id"]),
        status=ReconciliationStatus.FINALIZED,
        is_finalized=True,
        finalized_at=finalized_snapshot["finalized_at"],
        finalized_by_user_id=UUID(finalized_snapshot["finalized_by_user_id"]),
        message="Snapshot finalized successfully",
    )


@router.post(
    "/snapshots/finalize-batch",
    response_model=BatchFinalizeResponse,
    dependencies=[Depends(require_org_admin)],
)
async def finalize_snapshots_batch(
    request: BatchFinalizeRequest,
    ctx: OrgContext,
    user: CurrentUser,
) -> BatchFinalizeResponse:
    """
    Finalize all draft snapshots for a property and period.

    Attempts to finalize all draft reconciliation snapshots for the specified
    property and period. Returns a summary of successes and failures, allowing
    partial success. This is useful for bulk finalizing all tenant reconciliations
    after verification.

    Args:
        request: Batch finalize request with property_id and period
        ctx: Organization-scoped context
        user: Current authenticated user

    Returns:
        BatchFinalizeResponse with summary of results

    Raises:
        404: No draft snapshots found for the specified property and period
    """
    # Find all draft snapshots for the property and period
    snapshots_result = (
        ctx.table("reconciliation_snapshots")
        .select("id, calculation_trace, status")
        .eq("property_id", str(request.property_id))
        .eq("period_start_date", request.period_start.isoformat())
        .eq("period_end_date", request.period_end.isoformat())
        .eq("status", ReconciliationStatus.DRAFT.value)
        .execute()
    )

    if not snapshots_result.data or len(snapshots_result.data) == 0:
        raise NotFoundError(
            "Draft snapshots",
            f"No draft snapshots found for property {request.property_id} "
            f"and period {request.period_start} to {request.period_end}",
        )

    # Attempt to finalize each snapshot
    results: list[BatchFinalizeResult] = []
    succeeded = 0
    failed = 0

    finalize_timestamp = datetime.now().isoformat()

    # Separate snapshots into valid (with calculation_trace) and invalid
    valid_snapshots: list[dict[str, Any]] = []
    invalid_snapshots: list[dict[str, Any]] = []

    for snapshot in snapshots_result.data:
        calculation_trace = snapshot.get("calculation_trace")
        if not calculation_trace or len(calculation_trace) == 0:
            invalid_snapshots.append(snapshot)
        else:
            valid_snapshots.append(snapshot)

    # Add failure results for invalid snapshots (missing calculation_trace)
    for snapshot in invalid_snapshots:
        snapshot_id = UUID(snapshot["id"])
        results.append(
            BatchFinalizeResult(
                snapshot_id=snapshot_id,
                success=False,
                error_message="Calculation trace is missing or empty",
            )
        )
        failed += 1

    # Batch finalize all valid snapshots in ONE query
    if valid_snapshots:
        valid_snapshot_ids = [snapshot["id"] for snapshot in valid_snapshots]

        try:
            finalize_data = {
                "status": ReconciliationStatus.FINALIZED.value,
                "finalized_at": finalize_timestamp,
                "finalized_by_user_id": str(user.id),
            }

            # Batch UPDATE the valid snapshots, chunking the id filter so large
            # properties (hundreds of snapshots) don't overflow the request URL
            # and trigger HTTP 414 (same class as BUG-09).
            updated_ids: set[str] = set()
            for id_chunk in chunked(valid_snapshot_ids):
                batch_update_result = (
                    ctx.table("reconciliation_snapshots")
                    .update(finalize_data)
                    .in_("id", id_chunk)
                    .eq("status", ReconciliationStatus.DRAFT.value)
                    .execute()
                )
                updated_ids.update(row["id"] for row in batch_update_result.data)

            # Create results for each valid snapshot
            for snapshot in valid_snapshots:
                snapshot_id = UUID(snapshot["id"])

                if snapshot["id"] in updated_ids:
                    results.append(
                        BatchFinalizeResult(
                            snapshot_id=snapshot_id,
                            success=True,
                            error_message=None,
                        )
                    )
                    succeeded += 1
                else:
                    results.append(
                        BatchFinalizeResult(
                            snapshot_id=snapshot_id,
                            success=False,
                            error_message="Snapshot was already finalized or not found",
                        )
                    )
                    failed += 1

        except Exception as e:
            # If batch update fails entirely, mark all valid snapshots as failed
            for snapshot in valid_snapshots:
                snapshot_id = UUID(snapshot["id"])
                results.append(
                    BatchFinalizeResult(
                        snapshot_id=snapshot_id,
                        success=False,
                        error_message=f"Batch update failed: {str(e)}",
                    )
                )
                failed += 1

    # Generate summary message
    total = succeeded + failed
    if failed == 0:
        message = f"All {total} snapshots finalized successfully"
    elif succeeded == 0:
        message = f"All {total} snapshots failed to finalize"
    else:
        message = (
            f"{succeeded} of {total} snapshots finalized successfully, {failed} failed"
        )

    # Auto-advance campaign to FINALIZED when snapshots are finalized
    if succeeded > 0:
        try:
            _upsert_campaign(
                ctx.supabase,
                ctx.organization_id,
                request.property_id,
                request.period_end.year,
                CampaignStatus.FINALIZED.value,
                only_from_status=CampaignStatus.DRAFT.value,
            )
        except Exception:
            logger.warning(
                "Failed to upsert campaign for property %s year %s",
                request.property_id,
                request.period_end.year,
                exc_info=True,
            )

    return BatchFinalizeResponse(
        total_attempted=total,
        total_succeeded=succeeded,
        total_failed=failed,
        results=results,
        message=message,
    )


# ============================================================================
# Variance Analysis Endpoint (Alias to /analysis/year-over-year)
# ============================================================================


@router.post("/variance", response_model=YearOverYearComparison)
async def get_variance_analysis(
    request: YearOverYearRequest,
    ctx: OrgContext,
) -> YearOverYearComparison:
    """
    Get year-over-year variance analysis for reconciliation snapshots.

    **Note**: This endpoint is an alias to `/api/v1/analysis/year-over-year`
    for backwards compatibility and consistency with reconciliation API routes.

    The endpoint compares expense pools across multiple years (2-4 years) with
    variance calculations and supports fuzzy matching for renamed pools.

    Args:
        request: Year-over-year comparison request with property_id and years
        org_context: Organization context for RLS

    Returns:
        YearOverYearComparison with pool-level and total variances

    Raises:
        HTTPException 400: Invalid years or missing data
        HTTPException 404: Property not found

    Example Request:
        ```json
        {
          "property_id": "property-uuid",
          "years": [2022, 2023, 2024],
          "use_fuzzy_matching": true
        }
        ```

    Example Response:
        ```json
        {
          "property_id": "property-uuid",
          "property_name": "Main Street Plaza",
          "years": [2022, 2023, 2024],
          "base_year": 2022,
          "pool_comparisons": [
            {
              "pool_name": "Utilities",
              "amounts": {
                "2022": "50000.00",
                "2023": "52000.00",
                "2024": "55000.00"
              },
              "base_year_amount": "50000.00",
              "variance_amount": "5000.00",
              "variance_percent": "10.00",
              "variance_level": "warning",
              "matched_from": null
            }
          ],
          "total_amounts": {
            "2022": "50000.00",
            "2023": "52000.00",
            "2024": "55000.00"
          },
          "total_variance_amount": "5000.00",
          "total_variance_percent": "10.00"
        }
        ```
    """
    # Import the service locally to avoid a circular import at module load.
    from app.services.analysis import HistoricalAnalysisService

    service = HistoricalAnalysisService()

    try:
        comparison = await service.get_year_over_year(
            property_id=request.property_id,
            years=request.years,
            organization_id=ctx.organization_id,
            use_fuzzy_matching=request.use_fuzzy_matching,
        )
        return comparison

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate variance analysis: {str(e)}"
        )


@router.patch(
    "/cells/{cell_id}",
    response_model=ReconciliationCell,
    dependencies=[Depends(require_org_editor)],
)
async def update_reconciliation_cell(
    cell_id: str,
    request: ReconciliationCellUpdate,
    ctx: OrgContext,
    user: CurrentUser,
) -> ReconciliationCell:
    """
    Update a single cell in the reconciliation grid.

    This endpoint allows manual overrides of calculated values in draft
    reconciliation snapshots. Changes are tracked in the manual_overrides
    JSONB column for audit purposes.

    Args:
        cell_id: Base64-encoded cell ID (snapshot_id:field_name)
        request: Cell update request with new value
        ctx: Organization context for RLS enforcement
        user: Current authenticated user

    Returns:
        ReconciliationCell: Updated cell data

    Raises:
        400: Invalid cell_id format or field not editable
        403: Snapshot is finalized (immutable)
        404: Snapshot not found
        409: Snapshot was concurrently modified

    Example:
        ```
        PATCH /api/v1/reconciliation/cells/ABC123...
        {
          "value": "12500.00"
        }
        ```
    """
    # Step 1: Decode and validate cell_id
    try:
        snapshot_id, field_name = decode_cell_id(cell_id)
    except ValueError as e:
        raise BadRequestError(f"Invalid cell_id: {str(e)}")

    # Step 2: Fetch snapshot with RLS enforcement
    # FIX API-3: Add explicit org_id filter for defense-in-depth
    snapshot_result = (
        ctx.table("reconciliation_snapshots")
        .select(f"id, status, manual_overrides, organization_id, {field_name}")
        .eq("id", str(snapshot_id))
        .eq("organization_id", str(ctx.organization_id))  # Explicit org check
        .maybe_single()
        .execute()
    )

    if not snapshot_result or not snapshot_result.data:
        raise NotFoundError(
            resource="Reconciliation snapshot", identifier=str(snapshot_id)
        )

    snapshot_data = snapshot_result.data

    # Step 3: Check immutability
    if snapshot_data["status"] == ReconciliationStatus.FINALIZED.value:
        raise HTTPException(
            status_code=403,
            detail=(
                "Cannot edit finalized reconciliation snapshot. "
                "Snapshot is immutable."
            ),
        )

    # Step 4: Build manual_overrides metadata
    manual_overrides = snapshot_data.get("manual_overrides", {})
    now = datetime.now(UTC)

    manual_overrides[field_name] = {
        "value": str(request.value),
        "user_id": str(user.id),
        "timestamp": now.isoformat(),
    }

    # Step 5: Prepare update payload
    update_data = {
        field_name: str(request.value),
        "manual_overrides": manual_overrides,
    }

    # Step 6: Atomic update with optimistic concurrency control
    update_result = (
        ctx.table("reconciliation_snapshots")
        .update(update_data)
        .eq("id", str(snapshot_id))
        .eq("status", ReconciliationStatus.DRAFT.value)  # Optimistic lock
        .execute()
    )

    if not update_result.data or len(update_result.data) == 0:
        raise ConflictError(
            "Snapshot was concurrently modified or finalized. Please refresh and retry."
        )

    # Step 7: Return updated cell
    return ReconciliationCell(
        id=cell_id,
        snapshot_id=snapshot_id,
        field_name=field_name,
        value=request.value,
        is_manual_override=True,
        updated_at=now,
        updated_by=user.id,
    )


@router.get(
    "/leases/{lease_id}/cap-bank-ledger",
    response_model=CapBankLedger,
)
async def get_lease_cap_bank_ledger(
    lease_id: UUID,
    ctx: OrgContext,
) -> CapBankLedger:
    """Get the cap bank ledger for a lease.

    Returns the year-by-year cap bank timeline showing banked capacity,
    drawdowns, and carry-forward across all finalized reconciliation periods.
    Only meaningful for leases with cumulative or cumulative-compounding caps.
    """
    try:
        ledger = get_cap_bank_ledger(lease_id, ctx.client)
        record_feature_use(
            get_supabase_admin(), str(ctx.organization_id), "cap_bank_tracking"
        )
        return ledger
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e),
            )
        raise
