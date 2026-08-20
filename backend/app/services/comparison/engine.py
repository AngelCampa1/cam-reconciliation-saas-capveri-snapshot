"""
Comparison engine (Module B).

Two layers:

1. ``build_comparison_result`` — a SYNC, dependency-free function that performs the
   pure math (pairing by lease, signed-variance classification, aggregation). It is
   unit-testable with no mocks.
2. ``compare_charges`` — an async wrapper that loads CapVeri's correct per-tenant
   recovery (from ``reconciliation_snapshots``) and the charged set (from
   ``actual_billed_amounts``), using the same data sources as
   ``app.services.calculation.leakage.calculate_leakage``, then delegates to
   ``build_comparison_result``.

All money is ``Decimal`` (never float).
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, cast
from uuid import UUID

from pydantic import BaseModel, Field

from app.database.client import get_supabase_admin
from app.database.pagination import fetch_all_pages, fetch_all_pages_chunked_in
from app.services.comparison.models import (
    ComparisonResult,
    PoolVariance,
    TenantVariance,
    VarianceDirection,
    classify_variance,
)


class ExplicitCharge(BaseModel):
    """
    A single charged amount supplied directly by the caller (B1.3).

    Represents one "other system" charge that did NOT come from CapVeri's own
    ``actual_billed_amounts`` table — e.g. a manual entry or a parsed legacy
    reconciliation. ``tenant_name`` is the matching key; ``lease_id`` is accepted
    for forward-compatibility but the current normalization keys on name (matching
    the ``actual_billed_amounts`` path, which carries no usable per-lease key).

    A blank/missing ``tenant_name`` is treated exactly like a blank-name billed row:
    it becomes its own stable, never-merged finding.
    """

    lease_id: str | None = Field(
        default=None,
        description="Optional lease identifier (reserved; current matching is by name)",
    )
    tenant_name: str | None = Field(
        default=None, description="Tenant display name used to match against a lease"
    )
    pool_id: str | None = Field(
        default=None,
        description=(
            "Optional expense pool id (an ``expense_pools.id``) this charge is "
            "attributed to. When supplied on cleanly-paired tenants, it enables "
            "per-pool comparison against CapVeri's correct per-pool split; when "
            "omitted the charge is compared at the tenant-total level only."
        ),
    )
    amount: Decimal = Field(
        description=(
            "The charged amount for this tenant. Negative values are accepted "
            "intentionally (e.g. a credit or reversal from the other system), "
            "matching the unconstrained ``billed_amount`` on the DB path; a "
            "negative charge simply yields a signed variance like any other."
        )
    )


def _to_row(item: Any) -> dict[str, Any] | None:
    """Normalize Supabase row payloads to dictionaries."""
    if isinstance(item, dict):
        return cast(dict[str, Any], item)
    return None


def _signed_variance_pct(variance: Decimal, correct: Decimal) -> Decimal | None:
    """
    Signed variance as a percentage of the correct baseline magnitude.

    ``correct`` can be negative in net-credit periods. Use ``abs(correct)`` as the
    denominator so the percentage sign continues to match the signed variance
    direction (overcharge positive, undercharge negative).
    """
    if correct == 0:
        return None
    return (variance / abs(correct) * Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def _build_pool_breakdowns(
    correct_pools: dict[str, Decimal],
    charged_pools: dict[str, Decimal],
    pool_names: dict[str, str],
    tolerance: Decimal,
) -> list[PoolVariance]:
    """
    Build the signed per-pool variances for ONE lease (B1.5a).

    Pairs the lease's correct and charged amounts pool-by-pool using the same signed
    convention, classification, and percentage rule as the tenant level. A pool
    present on only one side is still compared (the missing side is ``0``). The
    result is sorted by descending absolute variance. An empty union of pools yields
    an empty list — the explicit "pool mode on, no breakdown for this lease" signal.

    Args:
        correct_pools: pool_id -> CapVeri-correct amount for this lease.
        charged_pools: pool_id -> actual charged amount for this lease.
        pool_names: pool_id -> display name (optional, shared across leases).
        tolerance: Inclusive absolute MATCH threshold (same as the tenant level).

    Returns:
        Signed ``PoolVariance`` records, descending by absolute variance.
    """
    breakdowns: list[PoolVariance] = []
    for pool_id in set(correct_pools) | set(charged_pools):
        correct = correct_pools.get(pool_id, Decimal("0"))
        charged = charged_pools.get(pool_id, Decimal("0"))
        variance = charged - correct
        breakdowns.append(
            PoolVariance(
                pool_id=pool_id,
                pool_name=pool_names.get(pool_id),
                capveri_correct=correct,
                actual_charged=charged,
                variance=variance,
                direction=classify_variance(variance, tolerance),
                abs_variance=abs(variance),
                variance_pct=_signed_variance_pct(variance, correct),
            )
        )
    breakdowns.sort(key=lambda p: p.abs_variance, reverse=True)
    return breakdowns


def build_comparison_result(
    correct_by_lease: dict[str, Decimal],
    charged_by_lease: dict[str, Decimal],
    property_id: UUID,
    period_start: date,
    period_end: date,
    tolerance: Decimal = Decimal("0.01"),
    tenant_names: dict[str, str] | None = None,
    correct_by_lease_and_pool: dict[str, dict[str, Decimal]] | None = None,
    charged_by_lease_and_pool: dict[str, dict[str, Decimal]] | None = None,
    pool_names: dict[str, str] | None = None,
) -> ComparisonResult:
    """
    Build a bidirectional ``ComparisonResult`` from paired per-lease amounts.

    Pairs CapVeri-correct amounts against charged amounts by ``lease_id``. A lease
    present on only one side is still compared: a missing charged amount is treated
    as ``0`` (full undercharge) and a missing correct amount as ``0`` (full
    overcharge). This is deliberate — every deviation is a finding regardless of
    which side is missing.

    Args:
        correct_by_lease: lease_id -> CapVeri-correct amount.
        charged_by_lease: lease_id -> actual charged amount.
        property_id: Property the comparison is for.
        period_start: Start of the comparison period.
        period_end: End of the comparison period.
        tolerance: Inclusive absolute MATCH threshold.
        tenant_names: Optional lease_id -> tenant display name.
        correct_by_lease_and_pool: Optional lease_id -> {pool_id -> correct amount}.
        charged_by_lease_and_pool: Optional lease_id -> {pool_id -> charged amount}.
        pool_names: Optional pool_id -> display name (shared across leases).

    ``variance_pct`` is ``variance / abs(correct) * 100`` quantized to two decimal
    places (``ROUND_HALF_UP``); it is ``None`` when ``correct`` is zero. The
    absolute denominator keeps percentage direction aligned with signed variance
    even when the correct-side baseline is a net credit.

    Per-pool breakdowns (B1.5a) are OPTIONAL and non-breaking. "Pool mode" is active
    iff at least one of ``correct_by_lease_and_pool`` / ``charged_by_lease_and_pool``
    is provided. When BOTH are absent, every tenant's ``pool_breakdowns`` is ``None``
    and behavior is byte-for-byte identical to the per-tenant-total comparison. In
    pool mode, every tenant carries a (possibly empty) ``pool_breakdowns`` list:
    empty distinguishes "pool mode on, no pool data for this lease" from "pool mode
    off". Per-pool variances use the SAME signed convention, classification, and
    percentage rule as the tenant level. This plumbing is inert until B1.5b feeds
    real per-pool data end-to-end.

    Raises:
        ValueError: If ``tolerance`` is negative. A negative threshold would make
            ``classify_variance`` reject even an exact zero variance as a
            non-MATCH, silently inverting the MATCH semantics. The API layer
            already rejects negatives, but this guards the public service surface
            (``compare_charges`` / ``compare_explicit_charges`` are reusable).

    Returns:
        A fully aggregated ``ComparisonResult`` with signed per-tenant variances,
        sorted by descending absolute variance.
    """
    if tolerance < 0:
        raise ValueError(f"tolerance must be non-negative, got {tolerance}")

    names = tenant_names or {}
    pool_mode = (
        correct_by_lease_and_pool is not None or charged_by_lease_and_pool is not None
    )
    correct_pools_by_lease = correct_by_lease_and_pool or {}
    charged_pools_by_lease = charged_by_lease_and_pool or {}
    pool_name_map = pool_names or {}
    lease_ids = set(correct_by_lease) | set(charged_by_lease)

    tenants: list[TenantVariance] = []
    total_correct = Decimal("0")
    total_charged = Decimal("0")
    total_overcharge = Decimal("0")
    total_undercharge = Decimal("0")
    overcharge_count = 0
    undercharge_count = 0
    match_count = 0

    for lease_id in lease_ids:
        correct = correct_by_lease.get(lease_id, Decimal("0"))
        charged = charged_by_lease.get(lease_id, Decimal("0"))
        variance = charged - correct
        direction = classify_variance(variance, tolerance)
        abs_variance = abs(variance)

        variance_pct = _signed_variance_pct(variance, correct)

        pool_breakdowns: list[PoolVariance] | None = None
        if pool_mode:
            pool_breakdowns = _build_pool_breakdowns(
                correct_pools_by_lease.get(lease_id, {}),
                charged_pools_by_lease.get(lease_id, {}),
                pool_name_map,
                tolerance,
            )

        tenants.append(
            TenantVariance(
                lease_id=lease_id,
                tenant_name=names.get(lease_id),
                capveri_correct=correct,
                actual_charged=charged,
                variance=variance,
                direction=direction,
                abs_variance=abs_variance,
                variance_pct=variance_pct,
                pool_breakdowns=pool_breakdowns,
            )
        )

        total_correct += correct
        total_charged += charged

        if direction is VarianceDirection.OVERCHARGE:
            total_overcharge += variance
            overcharge_count += 1
        elif direction is VarianceDirection.UNDERCHARGE:
            total_undercharge += abs_variance
            undercharge_count += 1
        else:
            match_count += 1

    tenants.sort(key=lambda t: t.abs_variance, reverse=True)

    return ComparisonResult(
        property_id=property_id,
        period_start=period_start,
        period_end=period_end,
        tolerance=tolerance,
        tenants=tenants,
        total_capveri_correct=total_correct,
        total_actual_charged=total_charged,
        total_net_variance=total_charged - total_correct,
        total_overcharge=total_overcharge,
        total_undercharge=total_undercharge,
        overcharge_count=overcharge_count,
        undercharge_count=undercharge_count,
        match_count=match_count,
    )


def _extract_correct_pools(
    snapshot: dict[str, Any],
) -> dict[str, Decimal]:
    """
    Parse a snapshot's ``pool_breakdowns`` JSONB into ``{pool_name -> total_recovery}``.

    The per-pool split is keyed by pool NAME on the correct side (it mirrors the
    produce engine, which keys pools by name) and money values arrive as JSON
    strings. Returns an empty dict for an aggregate-only snapshot (``None``/missing
    ``pool_breakdowns``) — that lease then has no correct-side pool data and is
    excluded from per-pool comparison.
    """
    raw_breakdowns = snapshot.get("pool_breakdowns")
    if not isinstance(raw_breakdowns, list):
        return {}
    by_name: dict[str, Decimal] = {}
    for raw_pool in raw_breakdowns:
        pool = _to_row(raw_pool)
        if pool is None:
            continue
        pool_name = pool.get("pool_name")
        if not isinstance(pool_name, str) or not pool_name:
            continue
        amount = Decimal(str(pool.get("total_recovery", 0)))
        by_name[pool_name] = by_name.get(pool_name, Decimal("0")) + amount
    return by_name


def _load_correct_by_lease(
    supabase: Any,
    organization_id: UUID,
    property_id: UUID,
    period_start: date,
    period_end: date,
    include_drafts: bool,
) -> tuple[dict[str, Decimal], dict[str, str], dict[str, dict[str, Decimal]]]:
    """
    Load CapVeri-correct per-lease recovery, tenant names, and per-pool splits.

    Returns ``(correct_by_lease, tenant_names, correct_pools_by_lease)`` where
    ``correct_pools_by_lease`` maps ``lease_id -> {pool_name -> correct amount}``,
    built from each snapshot's ``pool_breakdowns`` (NAME-keyed; resolved to pool ids
    by the caller). A lease with an aggregate-only snapshot is simply absent from the
    pool map — it has no correct-side pool data.
    """
    recon_query = (
        supabase.table("reconciliation_snapshots")
        .select(
            "lease_id, total_recovery, pool_breakdowns, "
            "period_start_date, period_end_date"
        )
        .eq("organization_id", str(organization_id))
        .eq("property_id", str(property_id))
        .lte("period_start_date", period_end.isoformat())
        .gte("period_end_date", period_start.isoformat())
    )
    if include_drafts:
        recon_query = recon_query.in_("status", ["finalized", "draft"])
    else:
        recon_query = recon_query.eq("status", "finalized")
    recon_data = fetch_all_pages(lambda: recon_query)

    correct_by_lease: dict[str, Decimal] = {}
    correct_pools_by_lease: dict[str, dict[str, Decimal]] = {}
    lease_ids: list[str] = []
    for raw_snapshot in recon_data:
        snapshot = _to_row(raw_snapshot)
        if snapshot is None:
            continue
        lease_id = snapshot.get("lease_id")
        if not isinstance(lease_id, str):
            continue
        lease_ids.append(lease_id)
        amount = Decimal(str(snapshot.get("total_recovery", 0)))
        correct_by_lease[lease_id] = (
            correct_by_lease.get(lease_id, Decimal("0")) + amount
        )
        pools = _extract_correct_pools(snapshot)
        if pools:
            existing = correct_pools_by_lease.setdefault(lease_id, {})
            for pool_name, pool_amount in pools.items():
                existing[pool_name] = (
                    existing.get(pool_name, Decimal("0")) + pool_amount
                )

    tenant_names: dict[str, str] = {}
    if lease_ids:
        leases_data = fetch_all_pages_chunked_in(
            # NOTE: leases has no organization_id column; org scoping is via
            # property_id (these lease_ids come from org-scoped snapshots).
            # BUG-12: chunk the id list — PostgREST encodes .in_() into the GET
            # URL, so hundreds of lease_ids (e.g. a 400-unit property) overflow
            # the request-line buffer and return 414. Chunk to <=100 per query.
            lambda chunk: supabase.table("leases")
            .select("id, tenant_name")
            .eq("property_id", str(property_id))
            .in_("id", chunk),
            lease_ids,
        )
        for raw_lease in leases_data:
            lease = _to_row(raw_lease)
            if lease is None:
                continue
            lease_id = lease.get("id")
            if not isinstance(lease_id, str):
                continue
            tenant_name = lease.get("tenant_name")
            if isinstance(tenant_name, str):
                tenant_names[lease_id] = tenant_name

    return correct_by_lease, tenant_names, correct_pools_by_lease


def _load_pool_names(supabase: Any, property_id: UUID) -> dict[str, str]:
    """
    Load ``pool_id -> pool_name`` for a property from ``expense_pools``.

    ``expense_pools`` is scoped to the org implicitly via ``property_id`` (it has no
    ``organization_id`` column) and names are unique per property, so the inverse
    ``name -> id`` the caller derives from this map is unambiguous.
    """
    pools_data = fetch_all_pages(
        lambda: supabase.table("expense_pools")
        .select("id, name")
        .eq("property_id", str(property_id))
    )
    pool_id_to_name: dict[str, str] = {}
    for raw_pool in pools_data:
        pool = _to_row(raw_pool)
        if pool is None:
            continue
        pool_id = pool.get("id")
        pool_name = pool.get("name")
        if isinstance(pool_id, str) and isinstance(pool_name, str) and pool_name:
            pool_id_to_name[pool_id] = pool_name
    return pool_id_to_name


def _load_charged_rows(
    supabase: Any,
    organization_id: UUID,
    property_id: UUID,
    period_start: date,
    period_end: date,
) -> tuple[
    dict[str, Decimal], list[tuple[str, Decimal]], dict[str, dict[str, Decimal]]
]:
    """
    Load charged amounts from ``actual_billed_amounts``.

    ``actual_billed_amounts`` does not carry a usable per-lease key for matching
    (the import path stores ``tenant_name``), so charged rows are split into two
    deterministic groups:

    - **Named rows** are aggregated by ``tenant_name`` into a ``charged_by_name``
      map. Multiple billed rows for the same name legitimately roll up to that
      tenant's total, to be re-keyed to a lease in ``compare_charges``.
    - **Unidentified rows** (missing/blank ``tenant_name``) are kept SEPARATE,
      each tied to its own stable row ``id``. They are never summed together and
      never attach to a real lease, because two blank-name rows are not provably
      the same tenant. A row missing both ``id`` and ``tenant_name`` is dropped
      (it has no stable identity to surface as a distinct finding).

    Per-pool charged amounts are additionally accumulated into
    ``charged_pools_by_name`` (``tenant_name -> {pool_id -> amount}``) from named
    rows that carry a non-null ``pool_id``. Rows with a null ``pool_id`` are
    tenant-level totals with no pool attribution and contribute only to
    ``charged_by_name``. Blank-name rows never contribute pool data (they are
    isolated, non-mergeable findings).

    Returns:
        ``(charged_by_name, unidentified_rows, charged_pools_by_name)`` where
        ``unidentified_rows`` is a list of ``(row_id, amount)`` for blank-name rows.
    """
    billed_data = fetch_all_pages(
        lambda: supabase.table("actual_billed_amounts")
        .select("id, tenant_name, billed_amount, pool_id")
        .eq("organization_id", str(organization_id))
        .eq("property_id", str(property_id))
        .lte("period_start_date", period_end.isoformat())
        .gte("period_end_date", period_start.isoformat())
    )

    charged_by_name: dict[str, Decimal] = {}
    charged_pools_by_name: dict[str, dict[str, Decimal]] = {}
    unidentified_rows: list[tuple[str, Decimal]] = []
    for raw_record in billed_data:
        record = _to_row(raw_record)
        if record is None:
            continue
        amount = Decimal(str(record.get("billed_amount", 0)))
        name_raw = record.get("tenant_name")
        name = name_raw.strip() if isinstance(name_raw, str) else ""
        if name:
            charged_by_name[name] = charged_by_name.get(name, Decimal("0")) + amount
            pool_id = record.get("pool_id")
            if isinstance(pool_id, str) and pool_id:
                pools = charged_pools_by_name.setdefault(name, {})
                pools[pool_id] = pools.get(pool_id, Decimal("0")) + amount
            continue
        row_id = record.get("id")
        if not isinstance(row_id, str) or not row_id:
            # No name and no stable id: nothing to anchor a distinct finding to.
            continue
        unidentified_rows.append((row_id, amount))
    return charged_by_name, unidentified_rows, charged_pools_by_name


async def compare_charges(
    organization_id: UUID,
    property_id: UUID,
    period_start: date,
    period_end: date,
    tolerance: Decimal = Decimal("0.01"),
    include_drafts: bool = False,
) -> ComparisonResult:
    """
    Compare CapVeri-correct per-tenant recovery against actual charged amounts.

    Loads the correct set from ``reconciliation_snapshots`` and the charged set from
    ``actual_billed_amounts`` (the same sources ``calculate_leakage`` uses), pairs
    them by lease (via the snapshot tenant-name map), and returns a signed,
    bidirectional ``ComparisonResult``.

    Tenant-name re-keying is deterministic and never fabricates findings:

    - A name matching exactly one lease pairs cleanly with that lease.
    - A charged name with no matching lease becomes one synthetic
      ``name::<tenant_name>`` overcharge finding (correct = 0).
    - A name shared by MORE THAN ONE lease AND carrying a charge is ambiguous: the
      charge cannot be split across the shared-name leases, so it is COMBINED into a
      single ``name::<tenant_name>`` finding whose correct side is the SUM of those
      leases' CapVeri-correct amounts. The charge is compared against that combined
      correct total (so an equal charge classifies as MATCH, not a phantom
      overcharge), and no correct amount is dropped.
    - A charged row with a blank/missing tenant_name becomes its own
      ``id::<row_id>`` finding, keyed by stable row id so it never merges with
      another row or attaches to a real lease.

    A property that does not belong to ``organization_id`` yields an empty result.

    Args:
        organization_id: Organization context (tenant isolation).
        property_id: Property to compare.
        period_start: Start of the comparison period.
        period_end: End of the comparison period.
        tolerance: Inclusive absolute MATCH threshold.
        include_drafts: Whether to include draft snapshots as correct amounts.

    Returns:
        A fully aggregated ``ComparisonResult``.
    """
    supabase = get_supabase_admin()

    empty = build_comparison_result(
        correct_by_lease={},
        charged_by_lease={},
        property_id=property_id,
        period_start=period_start,
        period_end=period_end,
        tolerance=tolerance,
    )

    property_result = (
        supabase.table("properties")
        .select("id")
        .eq("id", str(property_id))
        .eq("organization_id", str(organization_id))
        .limit(1)
        .execute()
    )
    if not property_result.data:
        return empty

    correct_by_lease, tenant_names, correct_pools_by_lease = _load_correct_by_lease(
        supabase,
        organization_id,
        property_id,
        period_start,
        period_end,
        include_drafts,
    )
    charged_by_name, unidentified_rows, charged_pools_by_name = _load_charged_rows(
        supabase, organization_id, property_id, period_start, period_end
    )

    correct_for_compare, charged_by_lease, names = _rekey_charged_to_leases(
        correct_by_lease, tenant_names, charged_by_name, unidentified_rows
    )

    # Per-pool comparison can only activate when BOTH sides carry pool data. Skip the
    # expense_pools lookup and dimension build entirely when either side has none —
    # pool mode stays off and the result is byte-identical to the tenant-total
    # comparison, with no wasted round-trip.
    charged_pools_by_lease = _rekey_charged_pools_to_leases(
        tenant_names, charged_by_name, charged_pools_by_name
    )
    correct_by_pool: dict[str, dict[str, Decimal]] | None = None
    charged_by_pool: dict[str, dict[str, Decimal]] | None = None
    pool_names: dict[str, str] | None = None
    if correct_pools_by_lease and charged_pools_by_lease:
        pool_id_to_name = _load_pool_names(supabase, property_id)
        pool_dimension = _build_pool_dimension(
            correct_pools_by_lease, charged_pools_by_lease, pool_id_to_name
        )
        if pool_dimension is not None:
            correct_by_pool, charged_by_pool, pool_names = pool_dimension

    return build_comparison_result(
        correct_by_lease=correct_for_compare,
        charged_by_lease=charged_by_lease,
        property_id=property_id,
        period_start=period_start,
        period_end=period_end,
        tolerance=tolerance,
        tenant_names=names,
        correct_by_lease_and_pool=correct_by_pool,
        charged_by_lease_and_pool=charged_by_pool,
        pool_names=pool_names,
    )


def _rekey_charged_to_leases(
    correct_by_lease: dict[str, Decimal],
    tenant_names: dict[str, str],
    charged_by_name: dict[str, Decimal],
    unidentified_rows: list[tuple[str, Decimal]],
) -> tuple[dict[str, Decimal], dict[str, Decimal], dict[str, str]]:
    """
    Re-key name-addressed charges onto lease keys for ``build_comparison_result``.

    Shared by the default ``actual_billed_amounts`` path (``compare_charges``) and
    the explicit-charged-set path (``compare_explicit_charges``, B1.3), so the
    name-to-lease pairing and duplicate-name combine behavior live in exactly ONE
    place. A ``tenant_name`` can map to zero, one, or several leases; each case is
    handled deterministically so the comparison never fabricates a phantom
    over/undercharge and never drops a correct amount:

      * Exactly one lease  -> attach the charge to that lease_id (clean pairing).
      * Zero leases        -> synthetic "name::<tenant_name>" bucket; surfaces as
                              a single overcharge (capveri_correct = 0).
      * More than one lease, WITH a charge -> AMBIGUOUS. The charge cannot be split
        across the shared-name leases, so the siblings are COMBINED into ONE
        synthetic "name::<tenant_name>" bucket: its correct side is the SUM of the
        siblings' correct amounts and its charged side is the name's charge. The
        siblings are removed from the per-lease correct map (they are represented
        once inside the bucket, never double-counted). Because the charge is
        compared against the combined correct total, an equal charge is a MATCH
        rather than a phantom overcharge.
      * More than one lease, WITHOUT a charge -> NOT ambiguous (no charge to
        split). Each sibling pairs normally as a full undercharge (charged = 0);
        their correct amounts are retained.

    Unidentified rows (blank tenant_name) each become their own ``id::<row_id>``
    finding, keyed by stable id so they never merge with each other or a real lease.

    Args:
        correct_by_lease: lease_id -> CapVeri-correct amount.
        tenant_names: lease_id -> tenant display name.
        charged_by_name: tenant_name -> aggregated charged amount.
        unidentified_rows: ``(row_id, amount)`` for blank-name charged rows.

    Returns:
        ``(correct_for_compare, charged_by_lease, names)`` ready to feed straight
        into ``build_comparison_result``.
    """
    name_to_leases: dict[str, list[str]] = {}
    for lease_id, name in tenant_names.items():
        name_to_leases.setdefault(name, []).append(lease_id)

    # Names that are shared by >1 lease AND have a charge: combine into one bucket.
    combined_names = {
        name
        for name, ids in name_to_leases.items()
        if len(ids) > 1 and name in charged_by_name
    }
    combined_leases: set[str] = {
        lease_id for name in combined_names for lease_id in name_to_leases[name]
    }

    charged_by_lease: dict[str, Decimal] = {}
    synthetic_names: dict[str, str] = {}
    synthetic_correct: dict[str, Decimal] = {}

    # Seed the combined buckets with the summed correct side of their siblings so the
    # leases' correct amounts are preserved (no drop) inside a single finding.
    for name in combined_names:
        key = f"name::{name}"
        synthetic_names[key] = name
        synthetic_correct[key] = sum(
            (
                correct_by_lease.get(lease_id, Decimal("0"))
                for lease_id in name_to_leases[name]
            ),
            Decimal("0"),
        )

    correct_for_compare = {
        lease_id: amount
        for lease_id, amount in correct_by_lease.items()
        if lease_id not in combined_leases
    }
    correct_for_compare.update(synthetic_correct)

    for name, amount in charged_by_name.items():
        lease_ids = name_to_leases.get(name, [])
        if name in combined_names:
            key = f"name::{name}"
        elif len(lease_ids) == 1:
            key = lease_ids[0]
        else:
            # Zero leases (unmatched): synthetic overcharge bucket (correct = 0).
            key = f"name::{name}"
            synthetic_names[key] = name
        charged_by_lease[key] = charged_by_lease.get(key, Decimal("0")) + amount

    # Unidentified charged rows (blank tenant_name) each become their own finding,
    # keyed by stable row id so they never merge with each other or a real lease.
    for row_id, amount in unidentified_rows:
        key = f"id::{row_id}"
        synthetic_names[key] = "Unidentified charge"
        charged_by_lease[key] = charged_by_lease.get(key, Decimal("0")) + amount

    names = {**tenant_names, **synthetic_names}
    return correct_for_compare, charged_by_lease, names


def _rekey_charged_pools_to_leases(
    tenant_names: dict[str, str],
    charged_by_name: dict[str, Decimal],
    charged_pools_by_name: dict[str, dict[str, Decimal]],
) -> dict[str, dict[str, Decimal]]:
    """
    Re-key name-addressed per-pool charges onto lease keys, cleanly-paired ONLY.

    Per-pool comparison is offered only for tenants whose ``tenant_name`` maps to
    EXACTLY ONE lease and is not part of a duplicate-name combined bucket. The
    ambiguous cases handled by ``_rekey_charged_to_leases`` (a name shared by several
    leases with a charge -> one combined finding; an unmatched name -> synthetic
    overcharge; a blank name -> isolated finding) have no well-defined per-pool
    attribution, so they carry no pool breakdown and fall back to the tenant-total
    comparison. This mirrors the duplicate-name combine rule so the two key spaces
    never disagree.

    Args:
        tenant_names: lease_id -> tenant display name.
        charged_by_name: tenant_name -> aggregated charged amount (to detect the
            duplicate-name combine case identically to ``_rekey_charged_to_leases``).
        charged_pools_by_name: tenant_name -> {pool_id -> charged amount}.

    Returns:
        ``lease_id -> {pool_id -> charged amount}`` for cleanly-paired tenants only.
    """
    name_to_leases: dict[str, list[str]] = {}
    for lease_id, name in tenant_names.items():
        name_to_leases.setdefault(name, []).append(lease_id)
    combined_names = {
        name
        for name, ids in name_to_leases.items()
        if len(ids) > 1 and name in charged_by_name
    }

    charged_pools_by_lease: dict[str, dict[str, Decimal]] = {}
    for name, pools in charged_pools_by_name.items():
        lease_ids = name_to_leases.get(name, [])
        if name in combined_names or len(lease_ids) != 1:
            # Ambiguous (duplicate name) or unmatched: no per-pool breakdown.
            continue
        charged_pools_by_lease[lease_ids[0]] = dict(pools)
    return charged_pools_by_lease


def _build_pool_dimension(
    correct_pools_by_lease_name: dict[str, dict[str, Decimal]],
    charged_pools_by_lease_id: dict[str, dict[str, Decimal]],
    pool_id_to_name: dict[str, str],
) -> (
    tuple[dict[str, dict[str, Decimal]], dict[str, dict[str, Decimal]], dict[str, str]]
    | None
):
    """
    Reconcile the name-keyed correct pools with the id-keyed charged pools.

    The correct side keys pools by NAME (from the snapshot's ``pool_breakdowns``);
    the charged side keys by ``pool_id``. Both are reduced to a shared ``pool_id``
    key space using ``pool_id_to_name`` (a correct pool whose name has no matching
    ``expense_pools`` id — e.g. a pool renamed or deleted since the snapshot — is
    dropped from the per-pool view; it remains in the tenant total).

    Crucially, the result is restricted to the INTERSECTION of leases that have pool
    data on BOTH sides. Activating pool mode for a lease with data on only one side
    would fabricate an all-undercharge (correct-only) or all-overcharge (charged-only)
    breakdown for it. When no lease has pool data on both sides this returns ``None``
    so the caller leaves pool mode OFF and the comparison is byte-for-byte identical
    to the per-tenant-total result.

    Returns:
        ``(correct_by_lease_and_pool, charged_by_lease_and_pool, pool_names)`` keyed
        by ``pool_id`` and restricted to the shared leases, or ``None`` when no lease
        qualifies.
    """
    name_to_id = {name: pool_id for pool_id, name in pool_id_to_name.items()}

    correct_by_lease_id: dict[str, dict[str, Decimal]] = {}
    for lease_id, by_name in correct_pools_by_lease_name.items():
        resolved: dict[str, Decimal] = {}
        for pool_name, amount in by_name.items():
            pool_id = name_to_id.get(pool_name)
            if pool_id is None:
                continue
            resolved[pool_id] = resolved.get(pool_id, Decimal("0")) + amount
        if resolved:
            correct_by_lease_id[lease_id] = resolved

    shared = set(correct_by_lease_id) & set(charged_pools_by_lease_id)
    if not shared:
        return None

    correct_gated = {lease_id: correct_by_lease_id[lease_id] for lease_id in shared}
    charged_gated = {
        lease_id: charged_pools_by_lease_id[lease_id] for lease_id in shared
    }
    return correct_gated, charged_gated, pool_id_to_name


def _normalize_explicit_charges(
    charges: list[ExplicitCharge],
) -> tuple[
    dict[str, Decimal], list[tuple[str, Decimal]], dict[str, dict[str, Decimal]]
]:
    """
    Normalize an explicit charged list into the ``actual_billed_amounts`` shape.

    Produces the same ``(charged_by_name, unidentified_rows, charged_pools_by_name)``
    triple that ``_load_charged_rows`` returns from the DB, so the explicit-charged
    path reuses ``_rekey_charged_to_leases`` and the per-pool wiring unchanged:

    - Named charges are aggregated by ``tenant_name`` (multiple charges for the same
      name roll up to that tenant's total).
    - A named charge that carries a ``pool_id`` also accumulates into
      ``charged_pools_by_name`` (``tenant_name -> {pool_id -> amount}``); a charge
      with no ``pool_id`` contributes only to the tenant total.
    - Blank/missing-name charges are kept SEPARATE, each anchored to a stable
      positional key (``explicit::<index>``) so two blank-name charges never merge
      and never attach to a real lease. Index is used because explicit items have no
      DB row id; it is stable for a single request payload.

    Args:
        charges: Caller-supplied "other system" charges.

    Returns:
        ``(charged_by_name, unidentified_rows, charged_pools_by_name)`` for
        ``_rekey_charged_to_leases`` and the per-pool wiring.
    """
    charged_by_name: dict[str, Decimal] = {}
    charged_pools_by_name: dict[str, dict[str, Decimal]] = {}
    unidentified_rows: list[tuple[str, Decimal]] = []
    for index, charge in enumerate(charges):
        name = charge.tenant_name.strip() if charge.tenant_name else ""
        if name:
            charged_by_name[name] = charged_by_name.get(name, Decimal("0")) + (
                charge.amount
            )
            pool_id = charge.pool_id.strip() if charge.pool_id else ""
            if pool_id:
                pools = charged_pools_by_name.setdefault(name, {})
                pools[pool_id] = pools.get(pool_id, Decimal("0")) + charge.amount
            continue
        unidentified_rows.append((f"explicit::{index}", charge.amount))
    return charged_by_name, unidentified_rows, charged_pools_by_name


async def compare_explicit_charges(
    organization_id: UUID,
    property_id: UUID,
    period_start: date,
    period_end: date,
    charges: list[ExplicitCharge],
    tolerance: Decimal = Decimal("0.01"),
    include_drafts: bool = False,
) -> ComparisonResult:
    """
    Compare CapVeri-correct recovery against a caller-supplied charged set (B1.3).

    Identical to ``compare_charges`` except the charged side comes from ``charges``
    (a manual entry or parsed legacy reconciliation) instead of the
    ``actual_billed_amounts`` table. The CapVeri-correct side and the name-to-lease
    re-key/combine handling are shared with ``compare_charges`` via
    ``_load_correct_by_lease`` and ``_rekey_charged_to_leases``, so duplicate-name
    combining, unmatched-name overcharges, and blank-name isolation behave the same.

    A property that does not belong to ``organization_id`` yields an empty result.

    Args:
        organization_id: Organization context (tenant isolation).
        property_id: Property to compare.
        period_start: Start of the comparison period.
        period_end: End of the comparison period.
        charges: The "other system" charges to compare against.
        tolerance: Inclusive absolute MATCH threshold.
        include_drafts: Whether to include draft snapshots as correct amounts.

    Returns:
        A fully aggregated ``ComparisonResult``.
    """
    supabase = get_supabase_admin()

    empty = build_comparison_result(
        correct_by_lease={},
        charged_by_lease={},
        property_id=property_id,
        period_start=period_start,
        period_end=period_end,
        tolerance=tolerance,
    )

    property_result = (
        supabase.table("properties")
        .select("id")
        .eq("id", str(property_id))
        .eq("organization_id", str(organization_id))
        .limit(1)
        .execute()
    )
    if not property_result.data:
        return empty

    correct_by_lease, tenant_names, correct_pools_by_lease = _load_correct_by_lease(
        supabase,
        organization_id,
        property_id,
        period_start,
        period_end,
        include_drafts,
    )
    charged_by_name, unidentified_rows, charged_pools_by_name = (
        _normalize_explicit_charges(charges)
    )

    correct_for_compare, charged_by_lease, names = _rekey_charged_to_leases(
        correct_by_lease, tenant_names, charged_by_name, unidentified_rows
    )

    # Per-pool comparison can only activate when BOTH sides carry pool data. Skip the
    # expense_pools lookup and dimension build entirely when either side has none —
    # pool mode stays off and the result is byte-identical to the tenant-total
    # comparison, with no wasted round-trip.
    charged_pools_by_lease = _rekey_charged_pools_to_leases(
        tenant_names, charged_by_name, charged_pools_by_name
    )
    correct_by_pool: dict[str, dict[str, Decimal]] | None = None
    charged_by_pool: dict[str, dict[str, Decimal]] | None = None
    pool_names: dict[str, str] | None = None
    if correct_pools_by_lease and charged_pools_by_lease:
        pool_id_to_name = _load_pool_names(supabase, property_id)
        pool_dimension = _build_pool_dimension(
            correct_pools_by_lease, charged_pools_by_lease, pool_id_to_name
        )
        if pool_dimension is not None:
            correct_by_pool, charged_by_pool, pool_names = pool_dimension

    return build_comparison_result(
        correct_by_lease=correct_for_compare,
        charged_by_lease=charged_by_lease,
        property_id=property_id,
        period_start=period_start,
        period_end=period_end,
        tolerance=tolerance,
        tenant_names=names,
        correct_by_lease_and_pool=correct_by_pool,
        charged_by_lease_and_pool=charged_by_pool,
        pool_names=pool_names,
    )
