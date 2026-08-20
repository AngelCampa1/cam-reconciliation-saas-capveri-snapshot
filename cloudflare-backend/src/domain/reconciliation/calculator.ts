import {
  CAP_TYPE_CUMULATIVE,
  CAP_TYPE_CUMULATIVE_COMPOUNDING,
  cumulativeEffectiveMaxMoney,
} from "./cumulative-cap";
import { Money, Rate, roundDivide, sumMoney } from "./money";

export type JsonObject = { [key: string]: JsonValue };
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonValue[];

export type CalculationJobRecord = {
  id: string;
  organizationId: string;
  propertyId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  forceRecalculate: boolean;
};

export type CalculationPropertyRecord = {
  id: string;
  totalRentableSqft: string;
  targetOccupancy: string | null;
};

export type CalculationLeaseRecord = {
  id: string;
  tenantName: string;
  // Date columns may arrive as `Date` if not `::text`-cast by the query; the
  // engine normalizes via dayString. loadCalculationLeases casts them to text.
  startDate: string | Date;
  endDate: string | Date | null;
  tenantSqft: string | null;
  recoveryProfile: JsonObject;
  termVersionId: string | null;
  versionProRataShare: string | null;
  versionAdminFeePercentage: string | null;
  versionManagementFeePercentage: string | null;
  versionBaseYear: number | null;
  versionBaseYearAmount: string | null;
  versionCapType: string | null;
  versionCapRate: string | null;
  versionExcludedPools: JsonValue | null;
};

export type CalculationGlEntryRecord = {
  id: string;
  accountCode: string;
  amount: string;
  // Date columns may arrive as `Date` if not `::text`-cast; the engine
  // normalizes via dayString. loadCalculationGlEntries casts them to text.
  transactionDate: string | Date;
  accrualDate: string | Date | null;
};

export type CalculationExpensePoolRecord = {
  id: string;
  name: string;
  poolType: string;
  isGrossUpApplicable: boolean;
  grossUpTarget: string | null;
};

export type CalculationPoolMappingRecord = {
  expensePoolId: string;
  glAccountPattern: string;
  allocationPercentage: string;
  priority: number;
};

export type CalculationPoolAllocationRecord = {
  // A persisted source->target pool split (pool_allocations row). The dollars a
  // GL entry contributes to the SOURCE pool are re-routed: `allocationValue`
  // percent goes to the TARGET pool, the unallocated remainder stays in the
  // source pool. allocationValue is a percentage string ("40" = 40%). Mirrors
  // the oracle's pool_allocations (allocation_type='percentage' only) consumed
  // by pool_aggregator.aggregate_with_splits via
  // build_split_allocations_from_pool_allocations.
  sourcePoolId: string;
  targetPoolId: string;
  allocationValue: string;
};

export type TenantCapHistoryRecord = {
  leaseId: string;
  priorYearAmount: string | null;
  capBaseYearAmount: string | null;
  /**
   * All prior finalized after-cap tenant shares since the base year, ordered
   * chronologically ascending (oldest first). Mirrors the Python oracle's
   * `all_prior_amounts` (data_fetcher.fetch_all_tenant_cap_histories). Used by
   * cumulative / cumulative_compounding caps for the carry-forward bank.
   */
  priorAmounts: string[];
};

export type CalculationDataset = {
  job: CalculationJobRecord;
  property: CalculationPropertyRecord;
  leases: CalculationLeaseRecord[];
  glEntries: CalculationGlEntryRecord[];
  expensePools: CalculationExpensePoolRecord[];
  poolMappings: CalculationPoolMappingRecord[];
  // Persisted source->target pool splits. Optional: a property with no splits
  // (the overwhelming common case) omits it and the aggregation is byte-identical
  // to the pre-split engine. Only allocation_type='percentage' rows belong here.
  poolAllocations?: CalculationPoolAllocationRecord[];
  capHistories: TenantCapHistoryRecord[];
};

export type SnapshotDraft = {
  property_id: string;
  lease_id: string;
  period_start_date: string;
  period_end_date: string;
  status: "draft";
  total_operating_expenses: string;
  grossed_up_expenses: string;
  base_year_amount: string;
  tenant_share_before_cap: string;
  tenant_share_after_cap: string;
  admin_fee: string;
  total_recovery: string;
  calculation_trace: JsonValue[];
  engine_version: string;
  trace_checksum: string;
  pool_breakdowns: JsonValue[] | null;
  lease_terms_snapshot: JsonObject;
  term_version_id: string | null;
  organization_id: string;
};

type PoolTotal = {
  pool: CalculationExpensePoolRecord;
  amount: Money;
};

// aggregatePools returns the pool totals plus an advisory summary of GL entries
// that matched NO pool mapping. A fully-unmatched entry is silently excluded from
// `total_operating_expenses` (it lands in no pool), which under-states the
// recoverable base — a real-dollar error in the LANDLORD's disfavor with no
// surfaced warning. The Python oracle (pool_aggregator.aggregate_by_pools) already
// records these in its trace ("Unmatched entries", note "Consider adding pool
// mappings"); the Worker did not. We surface the same advisory on the snapshot's
// `calculation_trace` (no money math changes). NOTE: a PARTIAL allocation (mappings
// summing < 100%, e.g. a 60% CAM / 40% unrecoverable split) is a legitimate config,
// so only entries that match ZERO pools are flagged — matching the oracle exactly.
type PoolAggregation = {
  totals: PoolTotal[];
  unallocatedAmount: Money;
  unmatchedCount: number;
};

type LeaseTerms = {
  proRataShare: Rate;
  proRataShareSource: "lease_terms" | "tenant_sqft_estimate" | "missing";
  adminFeePercentage: Rate;
  // Lease terms that constrain the admin-fee BASE / amount (tenant_share.py:
  // 75-84, 621-689). Sourced from the recovery-profile JSONB. When all three are
  // at their defaults (no cap, flag off, no excluded list) the admin fee is the
  // unchanged `share_after_cap * rate`, so existing leases are unaffected.
  adminFeeCap: Money | null;
  adminFeeExcludesTaxInsurance: boolean;
  adminFeeExcludedPools: string[];
  managementFeePercentage: Rate | null;
  baseYear: number | null;
  baseYearAmount: Money | null;
  // Σ of imputed_amount for services introduced after the base year. Added to
  // baseYearAmount to form the adjusted base (base_year.py:114-153). Zero when
  // there are no adjustments, preserving the unadjusted behavior.
  baseYearAdjustments: Money;
  capType: string;
  capRate: Rate | null;
  excludedPools: string[];
  accountingBasis: "cash" | "accrual";
  // Active-days factor for a partial-period lease term (1 = full period).
  // Mirrors the Python engine's LeaseTerms.proration_factor.
  prorationFactor: Rate;
};

export async function calculateReconciliationSnapshots(
  dataset: CalculationDataset,
): Promise<SnapshotDraft[]> {
  const actualOccupancy = calculateActualOccupancy(
    dataset.leases,
    dataset.property,
    dataset.job.periodStart,
    dataset.job.periodEnd,
  );
  // Gross-up target occupancy is a PROPERTY/LEASE-level parameter (cam-expert-
  // auditor Rule 5; BOMA / ABA Real Property: "95% is most common", chosen once
  // for the building, not per expense pool). The schema models it exactly that
  // way: properties.target_occupancy NUMERIC(5,4) NOT NULL DEFAULT 0.9500,
  // commented "Target occupancy rate for gross-up calculations (default 95%)".
  //
  // The previous code took `expensePools.find((p) => p.grossUpTarget)?.grossUpTarget`
  // FIRST — i.e. the gross_up_target of the alphabetically-first pool carrying one
  // (loadCalculationExpensePools orders `by name`) — and applied THAT single value
  // to EVERY pool, OVERRIDING the canonical property.targetOccupancy. That is wrong
  // under every interpretation: a per-pool field must not override the configured
  // property target, and certainly not order-dependently; and even a hypothetical
  // real per-pool feature would not apply one pool's target to all pools.
  // Concretely, a landlord who set property.target_occupancy = 0.90 had it silently
  // ignored in favour of an auto-stamped pool target of 0.95 (auto_setup writes 0.95
  // to every recoverable pool), inflating the gross-up factor and over-recovering.
  //
  // NOTE ON THE PYTHON ORACLE: the reference engine does NOT honor the configured
  // target either — but for a different, also-buggy reason. Its API entry reads
  // `property_data.get("gross_up_target", "0.95")` (backend reconciliation.py:423),
  // and `gross_up_target` is an expense_pools column that does not exist on the
  // properties row, so the lookup always misses and the oracle hardcodes 0.95 — it
  // never reads properties.target_occupancy at all. So this is NOT oracle parity; it
  // is a deliberate divergence TOWARD correctness (same spirit as C6/C7/C8): the
  // Worker honors the configured, schema-canonical property target. For the default
  // 0.95 (overwhelming common case) TS and oracle coincide; they diverge only when a
  // landlord explicitly configured a non-default target, where honoring it is right.
  // The Python oracle's get("gross_up_target") bug is tracked as a separate follow-up.
  //
  // firstNonEmpty's "0.95" tail is belt-and-suspenders (the column is NOT NULL, so
  // targetOccupancy is always present). True per-pool gross-up targets, if ever
  // desired, are a deliberate new feature for both engines and out of scope here;
  // the per-pool UI field + auto_setup stamping are now vestigial (cleanup chips).
  const parsedTargetOccupancy = Rate.parse(
    firstNonEmpty(dataset.property.targetOccupancy, "0.95"),
  );
  // Target occupancy is a fraction in (0, 1]. A value > 1 is meaningless (e.g.
  // "95" typed instead of "0.95") and would gross expenses up ~95x. Clamp it so
  // a data-entry slip can never explode recoveries. The Worker has no equivalent
  // Pydantic input-boundary validator, so the guard lives here.
  const targetOccupancy = parsedTargetOccupancy.gt(Rate.one())
    ? Rate.one()
    : parsedTargetOccupancy;
  // The oracle (gross_up.calculate_gross_up_factor) quantizes the factor to
  // 4 dp half-up before applying it; match that so grossed-up amounts stay
  // penny-exact against the Python source of truth.
  const grossUpFactor =
    actualOccupancy.isZero() || actualOccupancy.gte(targetOccupancy)
      ? Rate.one()
      : targetOccupancy.divide(actualOccupancy).quantize(4);
  const capHistories = new Map(
    dataset.capHistories.map((history) => [history.leaseId, history]),
  );

  const snapshots: SnapshotDraft[] = [];
  for (const lease of dataset.leases) {
    const terms = parseLeaseTerms(lease, dataset.property);
    terms.prorationFactor = computeProrationFactor(
      lease,
      dataset.job.periodStart,
      dataset.job.periodEnd,
    );
    const poolAggregation = aggregatePools(
      filterEntriesForBasis(
        dataset.glEntries,
        terms.accountingBasis,
        dataset.job.periodStart,
        dataset.job.periodEnd,
      ),
      dataset.expensePools,
      dataset.poolMappings,
      dataset.poolAllocations ?? [],
    );
    const leasePoolTotals = poolAggregation.totals;
    // Per-pool BARE gross-up (no per-pool safety valve): grossable pools x factor,
    // non-grossable pools as booked. This dict feeds exclusions, the
    // management-fee cap base, and the per-pool recovery breakdown — mirroring the
    // oracle's pool_breakdown (orchestrator.py:430-437, bare gross_up_factor, NO
    // valve). The 100%-occupancy safety valve lives on the AGGREGATE only.
    const grossedUpPools = grossUpPoolsBare(
      leasePoolTotals,
      grossUpFactor,
      actualOccupancy,
    );
    // The lease management_fee_percentage is a CAP, not an add-on: reduce the
    // management-fee pool(s) to `rate * operating_base_excl_fee` and surface the
    // removed excess, so the excess never reaches exclusions, base-year, pro-rata,
    // cap, or admin-fee steps (tenant_share.py:237-385). Applied per lease because
    // the rate lives on the lease recovery profile.
    const { pools: leasePools, excess: managementFeeExcess } =
      capManagementFeePools(grossedUpPools, terms.managementFeePercentage);
    const totalOperatingExpenses = sumMoney(
      leasePoolTotals.map((pool) => pool.amount),
    );
    // Billed scalar (oracle gross_up_orchestrator.calculate_full_gross_up): gross
    // up the AGGREGATE variable (grossable) pool once and apply a SINGLE safety
    // valve, then add the fixed (non-grossable) pools. Decoupling this scalar from
    // the per-pool dict is the fix for the per-pool-valve bug — a per-pool valve
    // drives a net-credit grossable pool more negative and accumulates rounding
    // drift across multiple grossable pools.
    const aggregateGrossedUp = aggregateGrossUp(
      leasePoolTotals,
      grossUpFactor,
      actualOccupancy,
    );
    // Reported grossed-up expenses = recoverable grossed total after the
    // management-fee cap (the non-recoverable fee excess is removed). Tenant-level
    // exclusions / base-year are NOT removed here — they belong to recovery, not
    // to the expense pool total.
    //
    // DELIBERATE divergence from the oracle's persisted field: the oracle stores
    // grossed_up_expenses = total_after_gross_up WITHOUT removing the mgmt-fee
    // excess (orchestrator.py:511), yet computes tenant_share off the post-cap
    // base (tenant_share.py:451). That makes the oracle's reported expense figure
    // fail to reconcile against its own bill: 115,000 × 0.10 = 11,500, but it
    // bills 10,700 (= 107,000 × 0.10). We instead report the post-cap recoverable
    // so the statement ties out: grossed_up_expenses × pro_rata == tenant_share_
    // before_cap for the no-exclusion case. This is the audit-defensible figure;
    // the oracle's pre-cap value is the buggy party here (CLAUDE.md: oracle parity
    // is not automatically correctness). Only this REPORTED field diverges — the
    // recovery dollars are penny-identical to the oracle.
    const grossedUpExpenses = aggregateGrossedUp.subtract(managementFeeExcess);
    const tenant = calculateTenantRecovery({
      lease,
      terms,
      poolTotals: leasePools,
      // The admin-fee inclusion ratio uses the POST-management-cap breakdown —
      // the oracle reduces the management-fee pool to the cap in BOTH the working
      // breakdown AND the original_pool_breakdown that feeds the ratio
      // (tenant_share.py:362-367, "so exclusion and admin-fee ratios use the
      // recoverable amount"), then sums that post-cap breakdown for the ratio
      // denominator (tenant_share.py:456-458, 645). The management-fee excess is
      // non-recoverable, so it must not inflate the ratio denominator; the
      // recoverable pool composition is the audit-correct basis. When a
      // management-fee cap binds, the inclusion ratio is included/total over the
      // REDUCED pools — `grossedUpPools` (pre-cap) would carry the full fee in the
      // denominator and understate the included share. `leasePools` is exactly the
      // post-cap set (all pools, only the mgmt-fee pool reduced to cap); when no
      // cap binds it equals `grossedUpPools`, so the common tax/insurance case is
      // unchanged.
      adminInclusionPools: leasePools,
      totalOperatingExpenses,
      aggregateGrossedUp,
      managementFeeExcess,
      capHistory: capHistories.get(lease.id),
    });
    const trace: JsonValue[] = [
      {
        name: "Cloudflare reconciliation",
        operation:
          "aggregate GL pools, apply occupancy gross-up, lease terms, caps, and admin fee",
        output: tenant.totalRecovery.toString(),
      },
    ];
    if (terms.proRataShareSource === "tenant_sqft_estimate") {
      trace.push({
        name: "Estimated starter terms",
        operation:
          "derive pro-rata share from tenant square feet divided by property rentable square feet because no lease pro-rata share was available",
        output: terms.proRataShare.toString(),
      });
    }
    // Advisory: GL entries that matched no pool mapping were excluded from
    // operating expenses, under-stating the recoverable base. Surface them on the
    // trace so the landlord can spot a missing mapping (mirrors the oracle's
    // "Unmatched entries" step). Money math is unchanged — this is observability
    // only. Emitted per lease because the basis filter (cash/accrual) can change
    // which entries fall in-period for a given lease.
    if (poolAggregation.unmatchedCount > 0) {
      trace.push({
        name: "Unmatched GL entries",
        operation:
          "GL entries matched no pool mapping and were excluded from operating expenses",
        inputs: { count: poolAggregation.unmatchedCount },
        output: poolAggregation.unallocatedAmount.toString(),
        note: "Consider adding pool mappings for these accounts so their expense is recovered.",
      });
    }

    snapshots.push({
      property_id: dataset.job.propertyId,
      lease_id: lease.id,
      period_start_date: dataset.job.periodStart,
      period_end_date: dataset.job.periodEnd,
      status: "draft",
      total_operating_expenses: totalOperatingExpenses.toString(),
      grossed_up_expenses: grossedUpExpenses.toString(),
      base_year_amount: (terms.baseYearAmount ?? Money.zero()).toString(),
      tenant_share_before_cap: tenant.tenantShareBeforeCap.toString(),
      tenant_share_after_cap: tenant.tenantShareAfterCap.toString(),
      admin_fee: tenant.adminFee.toString(),
      total_recovery: tenant.totalRecovery.toString(),
      calculation_trace: trace,
      engine_version: "cloudflare-reconciliation-v1",
      trace_checksum: await checksumJson(trace),
      pool_breakdowns: tenant.poolBreakdowns,
      lease_terms_snapshot: serializeLeaseTerms(lease, terms),
      term_version_id: lease.termVersionId,
      organization_id: dataset.job.organizationId,
    });
  }

  return snapshots;
}

function filterEntriesForBasis(
  entries: CalculationGlEntryRecord[],
  basis: "cash" | "accrual",
  periodStart: string,
  periodEnd: string,
): CalculationGlEntryRecord[] {
  const periodStartDay = dayString(periodStart);
  const periodEndDay = dayString(periodEnd);
  return entries.filter((entry) => {
    // Normalize via dayString: date columns may decode to JS Date if not
    // `::text`-cast, and a Date compared against a YYYY-MM-DD string never
    // satisfies the upper bound (its toString() sorts after digits), silently
    // dropping every in-period entry.
    const date = dayString(
      basis === "accrual"
        ? (entry.accrualDate ?? entry.transactionDate)
        : entry.transactionDate,
    );

    if (!date || !periodStartDay || !periodEndDay) {
      return false;
    }

    return date >= periodStartDay && date <= periodEndDay;
  });
}

function aggregatePools(
  entries: CalculationGlEntryRecord[],
  pools: CalculationExpensePoolRecord[],
  mappings: CalculationPoolMappingRecord[],
  allocations: CalculationPoolAllocationRecord[] = [],
): PoolAggregation {
  const totals = new Map(
    pools.map((pool) => [pool.id, { pool, amount: Money.zero() }]),
  );

  // Persisted source->target pool splits (oracle aggregate_with_splits, the
  // "persisted" branch fed by build_split_allocations_from_pool_allocations).
  // The dollars a GL entry books to a SOURCE pool are re-routed: each target
  // gets `pct` of that pool's slice and the unallocated remainder (1 - Σpct)
  // stays in the source pool. The Worker reconciliation engine previously
  // ignored pool_allocations entirely, so dollars stayed in the source pool —
  // mis-bucketing recoverable cost across the exclusion / management-cap /
  // admin-fee boundaries the splits exist to redraw. An empty map (no
  // allocations configured) leaves the aggregation byte-identical to before.
  //
  // We index by source pool id. `totals` holds only this property's pools, so a
  // split whose source or target is not a real pool on this property is silently
  // skipped (its dollars stay in the source) — the safe behavior for a
  // misconfigured cross-property reference, and the same effect the oracle gets
  // from its valid_pool_ids filter. The loader already scopes source pools to
  // this property; the `totals` membership check is what guards the target.
  // Target order is the loader's created_at order — deterministic, where the
  // oracle relies on DB row order. Only allocation_type='percentage' rows reach
  // here (loader filter, mirroring build_split_allocations_from_pool_allocations).
  const HUNDRED = Rate.parse("100");
  const splitsBySource = new Map<
    string,
    Array<{ target: NonNullable<ReturnType<typeof totals.get>>; pct: Rate }>
  >();
  for (const allocation of allocations) {
    const source = totals.get(allocation.sourcePoolId);
    const target = totals.get(allocation.targetPoolId);
    if (!source || !target) {
      continue;
    }
    const pct = Rate.parse(allocation.allocationValue).divide(HUNDRED);
    const list = splitsBySource.get(allocation.sourcePoolId) ?? [];
    list.push({ target, pct });
    splitsBySource.set(allocation.sourcePoolId, list);
  }
  // TOTAL-order sort so a single GL entry matching several patterns always lands
  // in the same pool(s) run to run. Priority desc is the primary key (as the
  // oracle intends), but the oracle stops there and its sort is STABLE, so on a
  // priority tie the winner is decided by DB heap order — non-deterministic. We
  // break ties deterministically: MORE-SPECIFIC (longer) pattern first, then
  // pattern text, then pool id. Specificity-first is the financially-correct
  // default — a "61*" mapping is added precisely to peel "61xx" out of a broad
  // "6*" bucket, so it must beat "6*" on the same account even at equal priority.
  // (A plain lexicographic tie-break would do the opposite: "6*" < "61*".)
  // Pattern LENGTH is a deterministic heuristic for specificity, not a true
  // subset test (e.g. "61*" vs "6?00" are not strictly nested); the remaining
  // text/pool-id keys make the order total regardless, so the worst case is a
  // stable, reproducible pick rather than heap-order chaos.
  const compiledMappings = [...mappings].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }
    if (right.glAccountPattern.length !== left.glAccountPattern.length) {
      return right.glAccountPattern.length - left.glAccountPattern.length;
    }
    if (left.glAccountPattern !== right.glAccountPattern) {
      return left.glAccountPattern < right.glAccountPattern ? -1 : 1;
    }
    if (left.expensePoolId !== right.expensePoolId) {
      return left.expensePoolId < right.expensePoolId ? -1 : 1;
    }
    return 0;
  });

  let unallocatedAmount = Money.zero();
  let unmatchedCount = 0;

  for (const entry of entries) {
    const entryAmount = Money.parse(entry.amount);
    let remaining = Rate.one();
    // Phase 1 — collect every (pool, allocation) this entry matches, capping the
    // cumulative allocation at 100% via `minRate(allocation, remaining)` exactly
    // as before. We book NOTHING yet: the final slice's value depends on the
    // entry's TOTAL matched allocation, which is only known once the walk ends.
    // A pattern that matches but points at a non-existent pool (totals.get
    // returns undefined) does NOT count as matched, exactly as the entry
    // contributes to no pool total — mirrors the oracle's per-entry `matched` flag.
    const matched: Array<{
      poolTotal: NonNullable<ReturnType<typeof totals.get>>;
      allocation: Rate;
    }> = [];
    for (const mapping of compiledMappings) {
      if (remaining.isZero()) {
        break;
      }

      if (!wildcardMatches(mapping.glAccountPattern, entry.accountCode)) {
        continue;
      }

      const poolTotal = totals.get(mapping.expensePoolId);
      if (!poolTotal) {
        continue;
      }

      const allocation = minRate(
        Rate.parse(mapping.allocationPercentage),
        remaining,
      );
      remaining = remaining.subtract(allocation);
      matched.push({ poolTotal, allocation });
    }

    // Phase 2 — book the slices, conserving to the penny.
    //
    // The oracle keeps full Decimal precision per pool and rounds once
    // downstream, so its per-pool slices always re-sum to round(entry * Σalloc).
    // The Worker stores integer cents per pool, so if every slice were rounded
    // independently the parts could drift from that target: a 3-way FULL split
    // can lose/create a cent, and — the Cycle 15 fix — a multi-mapping PARTIAL
    // split (Σalloc < 100%, e.g. 0.50 + 0.30) over/under-states the recoverable
    // total by re-rounding each slice (round(5c*.5)+round(5c*.3)=5c instead of
    // round(5c*.8)=4c), a same-signed error that accumulates over many entries.
    //
    // Fix: the entry's matched slices must sum to `target = round(entry *
    // Σalloc)` (Σalloc = 1 - remaining). Round each slice independently EXCEPT
    // the last matched one, which is pinned to `target - Σ(prior slices)`. For a
    // FULL split Σalloc = 1 so target = entry — identical to the previous
    // remainder-pin. For a PARTIAL split target = round(entry * Σalloc), so we
    // conserve to the recoverable portion without over-allocating to 100%.
    //
    // Sign guard (unchanged intent): pin only when it keeps the entry's sign. A
    // MISCONFIGURED split whose raw allocations sum to >100% can leave the
    // earlier (rounded-up) slices already exceeding `target` on a sub-dollar
    // entry, flipping the pinned remainder negative. (The oracle rejects >100%
    // at validation; the Worker does not.) When the pin would flip the sign,
    // fall back to the plain re-rounded slice so a bad split can never
    // manufacture a pool of the opposite sign. Valid splits never flip.
    const target = entryAmount.multiplyRate(Rate.one().subtract(remaining));
    let allocatedForEntry = Money.zero();
    for (let i = 0; i < matched.length; i++) {
      const match = matched[i]!;
      const isLast = i === matched.length - 1;
      let slice: Money;
      if (isLast) {
        const pinnedRemainder = target.subtract(allocatedForEntry);
        const pinFlipsSign = entryAmount.isNegative()
          ? pinnedRemainder.isPositive()
          : pinnedRemainder.isNegative();
        slice = pinFlipsSign
          ? entryAmount.multiplyRate(match.allocation)
          : pinnedRemainder;
      } else {
        slice = entryAmount.multiplyRate(match.allocation);
      }
      const split = splitsBySource.get(match.poolTotal.pool.id);
      if (!split) {
        match.poolTotal.amount = match.poolTotal.amount.add(slice);
      } else {
        // Fan this match's `slice` out across the source pool's target pools,
        // conserving to the penny. Book round(slice * pct) per target; pin the
        // FINAL booking to `slice - Σ(prior)` so the parts re-sum to `slice`
        // exactly (the same per-entry rounding model the Worker already uses
        // for partial allocations — round each integer-cent slice rather than
        // the oracle's round-once-downstream). When Σpct < 1 the source pool
        // keeps the remainder (oracle default_pool); when Σpct == 1 there is no
        // source share and the last target absorbs the rounding remainder.
        //
        // Sign guard (same intent as the entry-level pin above): pin only when
        // it keeps `slice`'s sign. A MISCONFIGURED split summing to >100% (the
        // write path validates <=100%, the engine does not) could otherwise
        // drive the pinned remainder negative on a sub-dollar slice and
        // manufacture an opposite-sign pool; fall back to the plain re-rounded
        // share instead. Valid splits never flip.
        const sumPct = split.reduce((acc, s) => acc.add(s.pct), Rate.zero());
        const sourceKeepsRemainder = sumPct.lt(Rate.one());
        let allocatedForSlice = Money.zero();
        for (let s = 0; s < split.length; s++) {
          const part = split[s]!;
          const isFinalBooking =
            !sourceKeepsRemainder && s === split.length - 1;
          let sub: Money;
          if (isFinalBooking) {
            const pinned = slice.subtract(allocatedForSlice);
            const pinFlipsSign = slice.isNegative()
              ? pinned.isPositive()
              : pinned.isNegative();
            sub = pinFlipsSign ? slice.multiplyRate(part.pct) : pinned;
          } else {
            sub = slice.multiplyRate(part.pct);
          }
          part.target.amount = part.target.amount.add(sub);
          allocatedForSlice = allocatedForSlice.add(sub);
        }
        if (sourceKeepsRemainder) {
          const pinned = slice.subtract(allocatedForSlice);
          const pinFlipsSign = slice.isNegative()
            ? pinned.isPositive()
            : pinned.isNegative();
          const sub = pinFlipsSign
            ? slice.multiplyRate(Rate.one().subtract(sumPct))
            : pinned;
          match.poolTotal.amount = match.poolTotal.amount.add(sub);
        }
      }
      allocatedForEntry = allocatedForEntry.add(slice);
    }

    // Fully-unmatched, non-zero entry: its dollars vanish from every pool total.
    // Sum the FULL entry amount (mirrors the oracle's
    // `sum(e.amount for e in unmatched_entries)`). A $0.00 line matching no pool
    // is not a money leak, so it is not flagged.
    if (matched.length === 0 && !entryAmount.isZero()) {
      unallocatedAmount = unallocatedAmount.add(entryAmount);
      unmatchedCount += 1;
    }
  }

  return { totals: [...totals.values()], unallocatedAmount, unmatchedCount };
}

// Below this occupancy a 100%-equivalent cannot be computed safely; mirrors the
// Python oracle's min_safe_occupancy in gross_up.apply_safety_valve.
const MIN_SAFE_OCCUPANCY = Rate.parse("0.0001");

// Pool types that must NEVER be grossed up, regardless of the per-pool
// `is_gross_up_applicable` flag. Gross-up scales a VARIABLE (occupancy-driven)
// expense to its full-occupancy equivalent; it is financially invalid on FIXED
// costs — property taxes, building insurance, and capital — whose dollar amount
// does not move with occupancy. Grossing a fixed cost over-bills the tenant
// (cam-expert-auditor Rule 5; expense_filter.DEFAULT_POOL_SETTINGS sets
// tax/insurance/capital -> False).
//
// This is a deliberate divergence from the live oracle read path: the oracle
// trusts the stored flag (its correct type->grossable map in
// expense_filter.get_default_gross_up_setting is dead code, never called at
// pool-creation time), and THREE real Worker create/template/migration paths
// default `is_gross_up_applicable` to true with no pool_type coupling. A
// tax/insurance/capital pool can therefore reach the engine flagged grossable.
// This engine-side guard makes such a pool fixed no matter what the flag says:
// a no-op for correctly-flagged data, and a fix for mis-flagged data WITHOUT a
// data migration. Same divergence pattern as the C6 excluded_pools type fix.
//
// Members coincide with CAP_EXEMPT_POOL_TYPES today, but the two encode distinct
// domain rules (cap controllability vs. gross-up fixedness) — keep them separate
// so a future change to one never silently moves the other.
const GROSS_UP_EXEMPT_POOL_TYPES = new Set(["tax", "insurance", "capital"]);

/**
 * A pool may be grossed up only when its stored flag allows it AND its type is
 * not a fixed cost. The type guard is authoritative: a fixed-cost pool is never
 * grossed up even if `is_gross_up_applicable` was stored true.
 */
function isPoolGrossable(pool: CalculationExpensePoolRecord): boolean {
  if (GROSS_UP_EXEMPT_POOL_TYPES.has(pool.poolType.toLowerCase())) {
    return false;
  }
  return pool.isGrossUpApplicable;
}

/**
 * Per-pool BARE gross-up for the exclusion / management-fee / breakdown dict:
 * each grossable pool is multiplied by the (already 4-dp-quantized) factor;
 * non-grossable pools pass through unchanged. NO per-pool safety valve — the
 * 100%-occupancy valve is applied once on the aggregate (see aggregateGrossUp).
 * Mirrors the oracle's pool_breakdown (orchestrator.py:430-437).
 *
 * One deliberate divergence from the oracle's literal `amount * factor`: when
 * the building is essentially vacant (occupancy <= MIN_SAFE_OCCUPANCY) the
 * factor explodes (e.g. 0.95 / 0.0001 = 9500x). The oracle leaves the per-pool
 * dict inflated there (its aggregate valve still pins the recoverable total), but
 * an inflated per-pool dict skews the display breakdown and over-states an
 * excluded grossable pool. Since this dict is exclusion/breakdown-only and the
 * aggregate already short-circuits gross-up when near-vacant, keep the booked
 * amounts here too. The observable recovery is identical (a near-vacant building
 * grosses nothing); only the display breakdown stays sane.
 */
function grossUpPoolsBare(
  pools: PoolTotal[],
  factor: Rate,
  actualOccupancy: Rate,
): PoolTotal[] {
  const nearVacant = !actualOccupancy.gt(MIN_SAFE_OCCUPANCY);
  return pools.map((poolTotal) => {
    if (!isPoolGrossable(poolTotal.pool) || nearVacant) {
      return { pool: poolTotal.pool, amount: poolTotal.amount };
    }
    return {
      pool: poolTotal.pool,
      amount: poolTotal.amount.multiplyRate(factor),
    };
  });
}

/**
 * Aggregate gross-up scalar (ports gross_up_orchestrator.calculate_full_gross_up
 * + gross_up.calculate_grossed_up_expenses with apply_safety=True): sum the
 * grossable (variable) pools, gross the SUM up once, apply a SINGLE
 * 100%-occupancy safety valve, then add the fixed (non-grossable) pools.
 *
 * Applying the valve to the aggregate (not per pool) is the financial fix:
 *   - a net-credit grossable pool nets into the variable total BEFORE grossing,
 *     so the valve never drives a credit more negative;
 *   - the grossable total rounds to cents ONCE, so no per-pool rounding drift.
 *
 * The valve caps the grossed variable at its 100%-occupancy equivalent
 * (variable / actualOccupancy). When near-vacant (occupancy <=
 * MIN_SAFE_OCCUPANCY) there is nothing to gross up against, so the booked
 * variable total is kept. The oracle carries the cap at 6 dp; the Worker is
 * cents-native, so the cap is rounded to cents — at most a sub-cent divergence
 * at the boundary, acceptable for an integer-cents engine.
 */
function aggregateGrossUp(
  pools: PoolTotal[],
  factor: Rate,
  actualOccupancy: Rate,
): Money {
  let variableBooked = Money.zero();
  let fixedTotal = Money.zero();
  for (const poolTotal of pools) {
    if (isPoolGrossable(poolTotal.pool)) {
      variableBooked = variableBooked.add(poolTotal.amount);
    } else {
      fixedTotal = fixedTotal.add(poolTotal.amount);
    }
  }

  const nearVacant = !actualOccupancy.gt(MIN_SAFE_OCCUPANCY);
  let valvedVariable: Money;
  if (nearVacant) {
    valvedVariable = variableBooked;
  } else {
    const grossedVariable = variableBooked.multiplyRate(factor);
    const maxAtFullOccupancy = variableBooked.multiplyRate(
      Rate.one().divide(actualOccupancy),
    );
    valvedVariable = grossedVariable.min(maxAtFullOccupancy);
  }

  return valvedVariable.add(fixedTotal);
}

// Substring (lowercased) identifying the property-level management-fee pool
// (tenant_share.py:53 `_MANAGEMENT_FEE_POOL_MARKER`).
const MANAGEMENT_FEE_POOL_MARKER = "management fee";

// Pool types a CAM cap does NOT apply to by convention (controllable-only caps):
// taxes, insurance, and capital expenses keep their full pre-cap share because a
// CAM cap legally applies to controllable expenses only. Mirrors
// tenant_share.py:45 `_CAP_EXEMPT_POOL_TYPES`. The TS `LeaseTerms` carries no
// per-lease `cap_excluded_pools` override (the oracle's name-based override),
// so pool TYPE is the sole classifier here — every PoolTotal always has a type.
const CAP_EXEMPT_POOL_TYPES = new Set(["tax", "insurance", "capital"]);

/**
 * Split `totalCents` across `weights` so the parts sum EXACTLY to it. Each part
 * is the floor of its proportional share; the leftover cents go to the largest
 * fractional remainders (ties broken by lowest index). Non-negative inputs
 * only. Zero/empty weights split the total evenly. Ports
 * pool_allocation._largest_remainder.
 */
function largestRemainder(totalCents: bigint, weights: bigint[]): bigint[] {
  const n = weights.length;
  if (n === 0) {
    return [];
  }
  if (totalCents === 0n) {
    return new Array<bigint>(n).fill(0n);
  }

  let effectiveWeights = weights;
  let totalWeight = weights.reduce((acc, w) => acc + w, 0n);
  if (totalWeight <= 0n) {
    // No meaningful weights: treat all pools equally.
    effectiveWeights = new Array<bigint>(n).fill(1n);
    totalWeight = BigInt(n);
  }

  // exact[i] = totalCents * w / totalWeight. Keep the floor and the remainder
  // (numerator of the fractional part) as integers to avoid any float.
  const floors: bigint[] = [];
  const remainders: bigint[] = [];
  for (const w of effectiveWeights) {
    const numerator = totalCents * w;
    floors.push(numerator / totalWeight);
    remainders.push(numerator % totalWeight);
  }
  const leftover = totalCents - floors.reduce((acc, f) => acc + f, 0n);

  // Hand out the leftover cents to the largest fractional parts (largest
  // remainder first; ties broken by lowest index).
  const order = [...floors.keys()].sort((a, b) => {
    if (remainders[a]! !== remainders[b]!) {
      return remainders[a]! > remainders[b]! ? -1 : 1;
    }
    return a - b;
  });
  for (let k = 0n; k < leftover; k++) {
    floors[order[Number(k)]!]! += 1n;
  }

  return floors;
}

/**
 * Cap the recoverable management-fee pool(s) at `rate * operating_base_excl_fee`
 * BEFORE any tenant-level math, returning adjusted copies (never mutates input).
 * Ports tenant_share.py `_apply_management_fee_cap` (237-385) +
 * `_reduce_pools_to_cap` (210-234):
 *   - management-fee pool: name (lowercased) contains "management fee".
 *   - operating_base = Σ operating-type pools that are NOT management-fee pools.
 *   - cap = max(0, ROUND_HALF_UP(rate * operating_base, cents)).
 *   - if booked_fee <= cap, no change; else reduce the fee pool(s) to sum to cap
 *     (single pool → set to cap; multiple → pro-rata by booked amount via
 *     largest-remainder cent allocation, each non-negative).
 *   - skip when rate is null/0, when no operating pool types exist, or when no
 *     management-fee pool is found.
 */
function capManagementFeePools(
  pools: PoolTotal[],
  rate: Rate | null,
): { pools: PoolTotal[]; excess: Money } {
  if (rate === null || rate.isZero()) {
    return { pools, excess: Money.zero() };
  }

  const mgmtFeeIndices = pools
    .map((poolTotal, index) => ({ poolTotal, index }))
    .filter(({ poolTotal }) =>
      poolTotal.pool.name.toLowerCase().includes(MANAGEMENT_FEE_POOL_MARKER),
    )
    // _reduce_pools_to_cap iterates `sorted(pool_names)` (tenant_share.py:225),
    // so the largest-remainder cent distribution and its lowest-index tie-break
    // run in name-sorted order. Match that exactly (ties broken by array index
    // for same-named pools).
    .sort((a, b) => {
      const an = a.poolTotal.pool.name;
      const bn = b.poolTotal.pool.name;
      if (an < bn) return -1;
      if (an > bn) return 1;
      return a.index - b.index;
    });
  if (mgmtFeeIndices.length === 0) {
    return { pools, excess: Money.zero() };
  }

  // operating_base = Σ operating-type pools EXCLUDING the management-fee pool(s).
  // The oracle's "skip when pool types are unavailable" (tenant_share.py:269)
  // has no TS analogue — every PoolTotal always carries a poolType — so we never
  // skip on that condition. With no operating pool the base is 0, the cap is 0,
  // and the booked fee is removed entirely, exactly as the oracle does
  // (operating_base sums to Decimal("0")).
  const mgmtIndexSet = new Set(mgmtFeeIndices.map(({ index }) => index));
  let operatingBase = Money.zero();
  pools.forEach((poolTotal, index) => {
    if (
      poolTotal.pool.poolType.toLowerCase() === "operating" &&
      !mgmtIndexSet.has(index)
    ) {
      operatingBase = operatingBase.add(poolTotal.amount);
    }
  });

  // cap = max(0, ROUND_HALF_UP(rate * operating_base)). Floor at zero: a
  // net-negative operating base (GL reversals/credits) must not produce a
  // negative cap that would over-remove the fee. Money.multiplyRate already
  // rounds half-up to cents.
  const cap = operatingBase.multiplyRate(rate).max(Money.zero());

  const bookedFee = sumMoney(
    mgmtFeeIndices.map(({ poolTotal }) => poolTotal.amount),
  );
  if (!bookedFee.gt(cap)) {
    return { pools, excess: Money.zero() };
  }

  // Reduce the management-fee pool(s) so they sum to exactly `cap`.
  let reduced: Money[];
  if (mgmtFeeIndices.length === 1) {
    reduced = [cap];
  } else {
    const weights = mgmtFeeIndices.map(({ poolTotal }) =>
      poolTotal.amount.toCents(),
    );
    reduced = largestRemainder(cap.toCents(), weights).map((cents) =>
      Money.fromCents(cents),
    );
  }

  const reducedByIndex = new Map<number, Money>();
  mgmtFeeIndices.forEach(({ index }, position) => {
    reducedByIndex.set(index, reduced[position]!);
  });

  const adjustedPools = pools.map((poolTotal, index) => {
    const adjusted = reducedByIndex.get(index);
    return adjusted === undefined
      ? { pool: poolTotal.pool, amount: poolTotal.amount }
      : { pool: poolTotal.pool, amount: adjusted };
  });
  // Excess removed from recovery = booked fee above the cap (tenant_share.py:357).
  return { pools: adjustedPools, excess: bookedFee.subtract(cap) };
}

/**
 * A lease's `excluded_pools` is a list of pool TYPE strings — the
 * `PoolType` enum (`operating | tax | insurance | capital | other`) that the
 * extraction and the frontend recovery-profile schema both emit and validate
 * (frontend `LeaseRecoveryProfileSchema.excluded_pools: z.array(PoolTypeSchema)`;
 * backend `extraction_models` types it `list[PoolType]`). So an exclusion must be
 * matched against each pool's `poolType`, NOT its display `name`.
 *
 * The earlier implementation matched `excluded.has(pool.name.toLowerCase())`,
 * which silently DROPPED every exclusion whose type word differs from the pool's
 * display name — e.g. excluding `"tax"` never matched the default-named
 * "Real Estate Taxes" pool, `"capital"` never matched "Capital Improvements",
 * `"operating"` never matched "Utilities" — over-billing the tenant the full
 * excluded pool × pro-rata. Only `"insurance"` happened to work because the
 * default pool name equals its type. Every other type/name comparison in this
 * module already matches on `poolType` (CAP_EXEMPT_POOL_TYPES, the management-fee
 * operating filter, the breakdown's `pool_type`); the exclusion was the lone
 * outlier. The Python oracle has the same name-match defect (tenant_share.py),
 * but the data contract makes type-matching the audit-correct behavior, so this
 * deliberately diverges from the oracle's reported exclusion set.
 *
 * We also keep the legacy name match as a fallback (`|| name`) so the comparison
 * is a strict superset of the old behavior: it can only ADD an intended exclusion
 * (the type match), never remove one that previously worked.
 */
function isPoolExcluded(
  pool: CalculationExpensePoolRecord,
  excluded: Set<string>,
): boolean {
  return (
    excluded.has(pool.poolType.toLowerCase()) ||
    excluded.has(pool.name.toLowerCase())
  );
}

// Default pool NAMES removed from the admin-fee base when a lease sets
// `admin_fee_excludes_tax_insurance` but gives no explicit excluded list
// (tenant_share.py:643-651). Matching is exact-lowercased-name against these
// tokens, mirroring the oracle's `pool.lower() in excluded_from_admin` test on
// the pool-breakdown dict keys: a pool only drops out of the admin base if its
// name lowercases to one of these. A lease that names its pools differently
// (e.g. "Property Taxes") should use the explicit `admin_fee_excluded_pools`
// list, which is the reliable path in both engines.
const DEFAULT_ADMIN_FEE_EXCLUDED_TAX_INSURANCE: ReadonlySet<string> = new Set([
  "taxes",
  "insurance",
  "real_estate_taxes",
  "property_insurance",
  "tax",
  "property_tax",
  "building_insurance",
]);

/**
 * Resolve the set of pool NAMES (lowercased) removed from the admin-fee base for
 * a lease (tenant_share.py:624-628). An explicit `admin_fee_excluded_pools`
 * list wins; otherwise, when `admin_fee_excludes_tax_insurance` is set, the
 * default T&I pool names apply. The same resolved set drives both the aggregate
 * fee base (computeAdminFee) and the per-pool admin-fee attribution
 * (allocatePoolBreakdowns Layer 3), so they never disagree on eligibility.
 */
function resolveAdminFeeExcludedPools(terms: LeaseTerms): Set<string> {
  const explicit = new Set(
    terms.adminFeeExcludedPools.map((pool) => pool.toLowerCase()),
  );
  if (terms.adminFeeExcludesTaxInsurance && explicit.size === 0) {
    return new Set(DEFAULT_ADMIN_FEE_EXCLUDED_TAX_INSURANCE);
  }
  return explicit;
}

/**
 * Compute the admin (administrative) fee on a tenant's post-cap share, honoring
 * the lease terms that constrain it (tenant_share.py:621-689):
 *
 *   1. `adminExcluded` (resolved pool names) shrinks the fee BASE to the share
 *      of the recoverable expense that comes from admin-feeable pools. The
 *      reduction is an inclusion RATIO (included_pool / total_pool) applied to
 *      `shareAfterCap`, NOT a dollar subtraction — the oracle computes the ratio
 *      on the grossed-up pool breakdown then multiplies the (already pro-rated,
 *      capped) share by it.
 *   2. `admin_fee_cap` is a hard dollar ceiling on the resulting fee.
 *
 * When no exclusions and no cap are set this is exactly `shareAfterCap × rate`,
 * so leases without these terms are unaffected.
 *
 * Money math is exact-rational in integer cents: admin_base =
 * round_half_up(shareAfterCap_cents × included_cents / total_cents). This is a
 * DELIBERATE, penny-tighter divergence from the oracle, which derives the ratio
 * as `Decimal(str(included / total))` — a Python FLOAT division truncated to
 * ~17 digits — then `(share × ratio).quantize(0.01, HALF_UP)`, double-rounding
 * off a lossy ratio. In ~1e-5 of exclusion cases the oracle lands 1 cent low;
 * the integer-rational result here is the mathematically correct party
 * (CLAUDE.md: oracle parity is not automatically correctness). The cap and the
 * exclusion / precedence semantics are otherwise penny-identical to the oracle.
 */
function computeAdminFee(
  shareAfterCap: Money,
  terms: LeaseTerms,
  inclusionPools: PoolTotal[],
  adminExcluded: Set<string>,
): Money {
  let adminBase: Money;
  if (adminExcluded.size > 0) {
    const totalCents = sumMoney(
      inclusionPools.map((pool) => pool.amount),
    ).toCents();
    const excludedCents = sumMoney(
      inclusionPools
        .filter((pool) => adminExcluded.has(pool.pool.name.toLowerCase()))
        .map((pool) => pool.amount),
    ).toCents();
    if (totalCents > 0n) {
      const includedCents =
        totalCents - excludedCents > 0n ? totalCents - excludedCents : 0n;
      adminBase = Money.fromCents(
        roundDivide(shareAfterCap.toCents() * includedCents, totalCents),
      ).max(Money.zero());
    } else {
      // Net-zero or net-credit pool composition: no positive base to fee.
      adminBase = Money.zero();
    }
  } else {
    adminBase = shareAfterCap;
  }

  let adminFee = adminBase.multiplyRate(terms.adminFeePercentage);
  if (terms.adminFeeCap !== null) {
    adminFee = adminFee.min(terms.adminFeeCap);
  }
  return adminFee;
}

function calculateTenantRecovery(input: {
  lease: CalculationLeaseRecord;
  terms: LeaseTerms;
  poolTotals: PoolTotal[];
  // Grossed-up, post-management-cap per-pool breakdown — the basis for the
  // admin-fee inclusion ratio (oracle exclusion_pool_breakdown, which is itself
  // post-cap: tenant_share.py:362-367, 456-458).
  adminInclusionPools: PoolTotal[];
  totalOperatingExpenses: Money;
  // Aggregate grossed-up scalar BEFORE the management-fee excess is removed
  // (oracle total_after_gross_up). The recovery base is this minus the excess.
  aggregateGrossedUp: Money;
  managementFeeExcess: Money;
  capHistory: TenantCapHistoryRecord | undefined;
}): {
  tenantShareBeforeCap: Money;
  tenantShareAfterCap: Money;
  adminFee: Money;
  totalRecovery: Money;
  poolBreakdowns: JsonValue[] | null;
} {
  const excluded = new Set(
    input.terms.excludedPools.map((pool) => pool.toLowerCase()),
  );
  const excludedAmount = sumMoney(
    input.poolTotals
      .filter((pool) => isPoolExcluded(pool.pool, excluded))
      .map((pool) => pool.amount),
  );
  // Recovery base = aggregate grossed-up scalar, less the non-recoverable
  // management-fee excess (tenant_share.py:451), less excluded pools
  // (tenant_share.py:468). The excluded amount is summed from the per-pool dict
  // (management-fee pool already capped), matching the oracle's
  // exclusion_pool_breakdown.
  const netRecoverable = input.aggregateGrossedUp
    .subtract(input.managementFeeExcess)
    .subtract(excludedAmount);
  // The oracle gates the base-year branch on BOTH `base_year` and a present,
  // non-zero `base_year_amount` (tenant_share.py:490 `if terms.base_year and
  // terms.base_year_amount`). Only inside that branch is the base subtracted —
  // and only there does `adjusted_base = raw_base + Σ(imputed_amount)` apply
  // (base_year.py:141). When the base year is set but the amount is missing/zero,
  // the oracle takes the else-branch: the full net-recoverable flows to pro-rata
  // and the new-service adjustments are NOT applied.
  const rawBaseYearAmount = input.terms.baseYearAmount;
  const baseYearActive =
    input.terms.baseYear != null &&
    rawBaseYearAmount !== null &&
    !rawBaseYearAmount.isZero();
  let increaseOverBase: Money;
  if (baseYearActive) {
    const adjustedBase = rawBaseYearAmount.add(input.terms.baseYearAdjustments);
    increaseOverBase = netRecoverable.gt(adjustedBase)
      ? netRecoverable.subtract(adjustedBase)
      : Money.zero();
  } else {
    increaseOverBase = netRecoverable;
  }
  // Day-based proration for partial-period lease terms. The Python engine
  // scales the pre-cap share by active_days / period_days BEFORE applying the
  // cap (see backend tenant_share.calculate_tenant_share). A lease active for
  // only part of the reconciliation period must not be billed a full-period
  // share — without this the engine over-recovers from partial-period tenants.
  const tenantShareBeforeCap = increaseOverBase
    .multiplyRate(input.terms.proRataShare)
    .multiplyRate(input.terms.prorationFactor)
    .max(Money.zero());
  const tenantShareAfterCap = applyCap(
    tenantShareBeforeCap,
    input.terms,
    input.capHistory,
  );
  const adminExcluded = resolveAdminFeeExcludedPools(input.terms);
  const adminFee = computeAdminFee(
    tenantShareAfterCap,
    input.terms,
    input.adminInclusionPools,
    adminExcluded,
  );
  const totalRecovery = tenantShareAfterCap.add(adminFee);

  return {
    tenantShareBeforeCap,
    tenantShareAfterCap,
    adminFee,
    totalRecovery,
    poolBreakdowns: allocatePoolBreakdowns(
      input.poolTotals,
      excluded,
      tenantShareBeforeCap,
      tenantShareAfterCap,
      adminFee,
      adminExcluded,
    ),
  };
}

function applyCap(
  amount: Money,
  terms: LeaseTerms,
  history: TenantCapHistoryRecord | undefined,
): Money {
  if (terms.capType === "none" || !terms.capRate) {
    return amount;
  }

  // For cumulative caps the base is the original base-year after-cap share
  // (falling back to the prior year), mirroring tenant_share.py: base_year_amount
  // = cap_base_year_amount if not None else prior_year_amount.
  const cumulativeBase = history?.capBaseYearAmount ?? history?.priorYearAmount;

  if (
    terms.capType === CAP_TYPE_CUMULATIVE ||
    terms.capType === CAP_TYPE_CUMULATIVE_COMPOUNDING
  ) {
    // tenant_share.py skips the cap entirely (CapType.NONE) when a cumulative
    // cap has no historical base at all. With a base present — including a
    // genuine "0.00" — the oracle DOES apply the cap (a zero base caps to
    // reference + annual_increase + bank, which can be > 0). Do NOT short-circuit
    // a zero base here: that is the non_cumulative-only FIX CAP-4 guard.
    if (cumulativeBase === null || cumulativeBase === undefined) {
      return amount;
    }
    const priorAmounts = history?.priorAmounts ?? [];
    const effectiveMax = cumulativeEffectiveMaxMoney({
      base: cumulativeBase,
      capRate: terms.capRate.toString(),
      // The live orchestrator always passes cap_fixed_amount=None; LeaseTerms
      // carries no fixed-amount field, so the percentage path is authoritative.
      capFixedAmount: null,
      yearsSinceBase: priorAmounts.length + 1,
      orderedPriorActuals: priorAmounts,
      capType: terms.capType,
    });
    return amount.min(effectiveMax);
  }

  // non_cumulative (and any other rate-based cap).
  const base = history?.priorYearAmount;

  // caps.py FIX CAP-4: a zero base (missing OR a real "0.00") has no meaningful
  // baseline — 0 * (1 + rate) = $0 would lock the tenant at $0 forever. Treat a
  // zero base like a missing base and return the amount uncapped. This runs
  // BEFORE the rate validation below to mirror caps.py.calculate_non_cumulative_cap,
  // which returns the amount uncapped on a missing/zero prior year WITHOUT ever
  // inspecting cap_rate (its Year-1 and FIX CAP-4 guards precede the rate checks).
  if (!base || Money.parse(base).isZero()) {
    return amount;
  }

  // caps.py FIX FC-6 + CAP-5: with a real positive baseline, an out-of-range cap
  // rate is a data-entry error (e.g. "5" meaning 500%, or a negative rate), not a
  // valid cap. The oracle RAISES here; the cumulative/compounding branch already
  // validates via cumulative-cap.ts:validateRate. The non_cumulative branch was
  // the lone cap path that silently skipped this — a "5" would never bind (6×
  // headroom) and over-bill, a negative rate would cap BELOW the baseline and
  // under-bill. Reject both to match the oracle and the sibling cap branch. (HTTP
  // write paths already bound cap_rate to [0,1] via Zod; this guards rows that
  // reach the engine through any non-Zod path — raw/legacy/AI-extracted.)
  if (terms.capRate.lt(Rate.zero())) {
    throw new Error("cap_rate must be non-negative");
  }
  if (terms.capRate.gt(Rate.one())) {
    throw new Error(
      `cap_rate ${terms.capRate.toString()} exceeds maximum 1.0 (100%). ` +
        "Cap rates should be decimals (0.05 = 5%).",
    );
  }

  const onePlusRate = Rate.one().add(terms.capRate);
  return amount.min(Money.parse(base).multiplyRate(onePlusRate));
}

/**
 * Push the aggregate tenant-share results back onto the individual expense pools
 * so Module B "Compare" can check a charge pool-by-pool. This is a **layer-faithful
 * (Option B)** port of `pool_allocation.allocate_pool_recoveries`, driven by
 * `tenant_share.py:718-751`:
 *
 *   Layer 1 — `share_before_cap` is split across included pools in proportion to
 *             each pool's recoverable contribution (largest-remainder).
 *   Layer 2 — the cap reduction is attributed to cap-eligible (controllable)
 *             pools first; if they cannot absorb the whole cut, the remainder
 *             spills onto cap-exempt pools so the per-pool total still reconciles
 *             to the (already-capped) aggregate.
 *   Layer 3 — the admin fee is split across fee-eligible pools in proportion to
 *             each pool's post-cap share.
 *
 * Every layer uses `largestRemainder`, so the per-pool numbers always sum EXACTLY
 * to the aggregate amounts and **no part is ever driven negative** — replacing the
 * prior "last pool absorbs the remainder" split, which could report a negative
 * recovery on a pool that incurred positive expense (CYCLE4-ALLOC Finding #1).
 *
 * Classification: cap-eligibility is decided by pool TYPE (`CAP_EXEMPT_POOL_TYPES`);
 * the oracle's per-lease `cap_excluded_pools` override has no TS analogue. Admin-
 * fee eligibility is decided by pool NAME against `adminExcluded` (the resolved
 * admin-fee exclusion set, matching pool_allocation.py:146): the aggregate admin
 * fee is attributed only to fee-eligible pools (or, when none are eligible,
 * spread across all to preserve the sum invariant).
 * Because every PoolTotal always carries a type, classification is always available,
 * so the oracle's "withhold when a cap reduced the share but classification is
 * unavailable" guard never fires here.
 */
function allocatePoolBreakdowns(
  pools: PoolTotal[],
  excluded: Set<string>,
  tenantShareBeforeCap: Money,
  tenantShareAfterCap: Money,
  adminFee: Money,
  adminExcluded: Set<string>,
): JsonValue[] | null {
  // Included pools = all non-excluded pools, order preserved. A negative
  // contribution is clamped to 0 for WEIGHTING but the pool is KEPT in the
  // output (pool_allocation.py:139). When every weight is 0 the oracle returns
  // [] → we return null so the caller falls back to aggregate-only reporting.
  const included = pools.filter((pool) => !isPoolExcluded(pool.pool, excluded));
  const amounts = included.map((pool) =>
    pool.amount.isPositive() ? pool.amount.toCents() : 0n,
  );
  const totalWeight = amounts.reduce((acc, w) => acc + w, 0n);
  if (included.length === 0 || totalWeight <= 0n) {
    return null;
  }

  const isCapEligible = included.map(
    (pool) => !CAP_EXEMPT_POOL_TYPES.has(pool.pool.poolType.toLowerCase()),
  );

  const beforeCents = tenantShareBeforeCap.toCents();
  const afterCents = tenantShareAfterCap.toCents();

  // Layer 1: pre-cap share, proportional to recoverable amounts.
  const shareBefore = largestRemainder(beforeCents, amounts);

  // Layer 2: attribute the cap reduction to controllable pools first.
  const reduction = beforeCents > afterCents ? beforeCents - afterCents : 0n;
  const capAdj = new Array<bigint>(included.length).fill(0n);
  if (reduction > 0n) {
    const eligibleIdx = included
      .map((_, i) => i)
      .filter((i) => isCapEligible[i]);
    const eligibleCapacity = eligibleIdx.reduce(
      (acc, i) => acc + shareBefore[i]!,
      0n,
    );
    if (reduction <= eligibleCapacity) {
      const alloc = largestRemainder(
        reduction,
        eligibleIdx.map((i) => shareBefore[i]!),
      );
      eligibleIdx.forEach((i, pos) => {
        capAdj[i] = -alloc[pos]!;
      });
    } else {
      // Controllable pools cannot absorb the whole cut: zero them out, then
      // spill the remainder onto cap-exempt pools.
      eligibleIdx.forEach((i) => {
        capAdj[i] = -shareBefore[i]!;
      });
      const spill = reduction - eligibleCapacity;
      const exemptIdx = included
        .map((_, i) => i)
        .filter((i) => !isCapEligible[i]);
      const alloc = largestRemainder(
        spill,
        exemptIdx.map((i) => shareBefore[i]!),
      );
      exemptIdx.forEach((i, pos) => {
        capAdj[i] = -alloc[pos]!;
      });
    }
  }
  const shareAfter = shareBefore.map((s, i) => s + capAdj[i]!);

  // Layer 3: admin fee, proportional to post-cap share, over fee-eligible pools
  // ONLY (pool_allocation.py:182-204). A pool whose name is in `adminExcluded`
  // receives no admin-fee slice; if NO pool is eligible but a fee exists, the
  // fee spreads across all pools to preserve the sum invariant. The split always
  // sums EXACTLY to the aggregate admin fee.
  const isFeeEligible = included.map(
    (pool) => !adminExcluded.has(pool.pool.name.toLowerCase()),
  );
  const adminCents = adminFee.toCents();
  const adminAlloc = new Array<bigint>(included.length).fill(0n);
  if (adminCents !== 0n) {
    let feeIdx = included.map((_, i) => i).filter((i) => isFeeEligible[i]);
    if (feeIdx.length === 0) {
      feeIdx = included.map((_, i) => i);
    }
    const alloc = largestRemainder(
      adminCents,
      feeIdx.map((i) => shareAfter[i]!),
    );
    feeIdx.forEach((i, pos) => {
      adminAlloc[i] = alloc[pos]!;
    });
  }

  return included.map((pool, i) => ({
    pool_name: pool.pool.name,
    pool_type: pool.pool.poolType,
    recovery: Money.fromCents(shareAfter[i]! + adminAlloc[i]!).toString(),
  }));
}

/**
 * Day-weighted actual occupancy for the reconciliation period.
 *
 * Mirrors the Python engine's `occupancy.py calculate_occupancy`: each lease's
 * sqft is weighted by its INCLUSIVE active-day overlap with the period
 * (overlap_days / total_days), malformed leases (start > end) and leases with
 * no overlap are skipped (Python "FIX FC-5"), and the final rate is quantized
 * to 4 decimal places ROUND_HALF_UP. Falls back to the prior un-weighted
 * Σ sqft / total behavior when the period dates are missing/unparseable so an
 * un-`::text`-cast date can never crash the engine (dayString guard).
 */
function calculateActualOccupancy(
  leases: CalculationLeaseRecord[],
  property: CalculationPropertyRecord,
  periodStart: string,
  periodEnd: string,
): Rate {
  const totalRentableSqft = Rate.parse(property.totalRentableSqft);
  if (totalRentableSqft.isZero()) {
    return Rate.zero();
  }

  const periodStartDay = dayString(periodStart);
  const periodEndDay = dayString(periodEnd);

  // Fallback: missing/unparseable period dates → prior un-weighted behavior.
  if (!periodStartDay || !periodEndDay) {
    let occupiedSqft = Rate.zero();
    for (const lease of leases) {
      occupiedSqft = occupiedSqft.add(Rate.parse(lease.tenantSqft ?? "0"));
    }
    // Cap at 1.0 like the main path (occupancy.py:185) so overlapping/double-
    // booked leases cannot push the fallback occupancy above 100%.
    return occupiedSqft.divide(totalRentableSqft).min(Rate.one());
  }

  const totalDays = inclusiveDayCount(periodStartDay, periodEndDay);
  if (totalDays <= 0) {
    return Rate.zero();
  }
  const totalDaysRate = Rate.parse(String(totalDays));

  let weightedSqft = Rate.zero();
  for (const lease of leases) {
    const leaseStartDay = dayString(lease.startDate);
    const leaseEndDay = dayString(lease.endDate);

    // FIX FC-5: skip malformed leases (start > end).
    if (leaseStartDay && leaseEndDay && leaseStartDay > leaseEndDay) {
      continue;
    }

    const overlapStart =
      leaseStartDay && leaseStartDay > periodStartDay
        ? leaseStartDay
        : periodStartDay;
    const overlapEnd =
      leaseEndDay && leaseEndDay < periodEndDay ? leaseEndDay : periodEndDay;

    // No overlap → lease outside the period.
    if (overlapStart > overlapEnd) {
      continue;
    }

    const overlapDays = inclusiveDayCount(overlapStart, overlapEnd);
    const weight = Rate.parse(String(overlapDays)).divide(totalDaysRate);
    weightedSqft = weightedSqft.add(
      Rate.parse(lease.tenantSqft ?? "0").multiply(weight),
    );
  }

  // occupancy.py: quantize to 4dp ROUND_HALF_UP (Rate has no quantize method).
  const occupancy = quantizeRate4dp(weightedSqft.divide(totalRentableSqft));
  // Cap at 1.0 (occupancy.py:185 does `occupancy_rate = min(occupancy_rate, 1)`).
  // Overlapping/double-booked leases can push raw occupancy above 100%; an
  // uncapped value would shrink the gross-up safety valve (maxAtFullOccupancy =
  // amount / occupancy < amount), causing systematic under-recovery.
  return occupancy.min(Rate.one());
}

/** Quantize a Rate to 4 decimal places, ROUND_HALF_UP (matches occupancy.py). */
function quantizeRate4dp(rate: Rate): Rate {
  // Rate is stored at 1e8 scale; 4dp rounding has a step of 1e4 scaled units.
  const step = 10_000n;
  const scaled = rate.scaledValue;
  const negative = scaled < 0n;
  const absolute = negative ? -scaled : scaled;
  const quotient = absolute / step;
  const remainder = absolute % step;
  // ROUND_HALF_UP on the magnitude (4dp units): count of 1e-4 units.
  const units = remainder * 2n >= step ? quotient + 1n : quotient;
  // Render as a YYYY.dddd decimal string and re-parse so Rate stays canonical.
  const whole = units / 10_000n;
  const fraction = (units % 10_000n).toString().padStart(4, "0");
  return Rate.parse(`${negative ? "-" : ""}${whole}.${fraction}`);
}

function parseLeaseTerms(
  lease: CalculationLeaseRecord,
  property: CalculationPropertyRecord,
): LeaseTerms {
  const profile = lease.recoveryProfile;
  const explicitProRataShare =
    lease.versionProRataShare ?? stringFromJson(profile.pro_rata_share);
  const fallbackProRataShare = deriveProRataShareFromSqft(lease, property);

  const proRataShare = explicitProRataShare
    ? Rate.parse(explicitProRataShare)
    : fallbackProRataShare.share;
  const proRataShareSource: LeaseTerms["proRataShareSource"] =
    explicitProRataShare ? "lease_terms" : fallbackProRataShare.source;
  assertProRataShareInRange(proRataShare, lease, proRataShareSource);

  return {
    proRataShare,
    proRataShareSource,
    adminFeePercentage: Rate.parse(
      lease.versionAdminFeePercentage ??
        stringFromJson(profile.admin_fee_percentage) ??
        "0",
    ),
    // Admin-fee BASE constraints (tenant_share.py:621-689). Profile-only — the
    // Worker term-version data model carries no override columns for these.
    //   - admin_fee_cap: a hard dollar ceiling on the computed admin fee.
    //   - admin_fee_excludes_tax_insurance: when true (and no explicit excluded
    //     list is given), the default T&I pool names are removed from the
    //     admin-fee base via the inclusion ratio.
    //   - admin_fee_excluded_pools: explicit pool NAMES removed from the base.
    adminFeeCap: stringFromJson(profile.admin_fee_cap)
      ? Money.parse(stringFromJson(profile.admin_fee_cap))
      : null,
    adminFeeExcludesTaxInsurance:
      profile.admin_fee_excludes_tax_insurance === true,
    adminFeeExcludedPools: stringArrayFromJson(
      profile.admin_fee_excluded_pools,
    ),
    managementFeePercentage:
      (lease.versionManagementFeePercentage ??
      stringFromJson(profile.management_fee_percentage))
        ? Rate.parse(
            lease.versionManagementFeePercentage ??
              stringFromJson(profile.management_fee_percentage),
          )
        : null,
    baseYear: lease.versionBaseYear ?? numberFromJson(profile.base_year),
    baseYearAmount:
      (lease.versionBaseYearAmount ?? stringFromJson(profile.base_year_amount))
        ? Money.parse(
            lease.versionBaseYearAmount ??
              stringFromJson(profile.base_year_amount),
          )
        : null,
    // base_year.py:114-153 adds Σ(item.imputed_amount) to the raw base before
    // computing the increase. Term-version overrides do not carry adjustments,
    // so these are sourced from the recovery profile only.
    baseYearAdjustments: sumBaseYearAdjustments(profile.base_year_adjustments),
    capType: lease.versionCapType ?? stringFromJson(profile.cap_type) ?? "none",
    capRate:
      (lease.versionCapRate ?? stringFromJson(profile.cap_rate))
        ? Rate.parse(lease.versionCapRate ?? stringFromJson(profile.cap_rate))
        : null,
    excludedPools: stringArrayFromJson(
      lease.versionExcludedPools ?? profile.excluded_pools,
    ),
    accountingBasis:
      stringFromJson(profile.accounting_basis) === "accrual"
        ? "accrual"
        : "cash",
    // Default to a full period; calculateReconciliationSnapshots overrides this
    // with the active-days factor once the job period is known.
    prorationFactor: Rate.one(),
  };
}

/**
 * A single tenant's pro-rata share is a fraction of one building, so it can
 * never be negative or exceed 100%. The Python oracle enforces this with a
 * Pydantic `Field(ge=0, le=1)` on `LeaseTerms.pro_rata_share`
 * (tenant_share.py:61-66, "FIX NEW-FC-5"): a value outside [0, 1] raises at
 * construction and aborts the run (the lease-build loop in
 * data_fetcher.fetch_active_leases has no try/except).
 *
 * The Worker had no equivalent guard, so an out-of-range value billed the
 * tenant straight through:
 *   - a corrupt explicit `pro_rata_share` (e.g. "1.5"), or
 *   - a sqft-derived share where `tenantSqft > totalRentableSqft` (a stale or
 *     mismeasured building denominator) — `deriveProRataShareFromSqft` does a
 *     bare divide with no upper clamp.
 * Either case silently billed >100% of recoverable expenses (e.g. share 1.2 on
 * a $200k net pool over-bills $40k). Match the oracle: reject the bad lease
 * loudly rather than emit an impossible bill. Surfacing the data error is
 * safer than clamping to 1.0, which would hide the bad denominator behind a
 * full-pool bill that may itself be wrong.
 */
function assertProRataShareInRange(
  share: Rate,
  lease: CalculationLeaseRecord,
  source: LeaseTerms["proRataShareSource"],
): void {
  if (share.lt(Rate.zero()) || share.gt(Rate.one())) {
    throw new Error(
      `Invalid pro-rata share ${share.toString()} for lease ${lease.id} ` +
        `(${lease.tenantName}); source=${source}. A tenant's pro-rata share ` +
        `must be within [0, 1]. Check the lease recovery profile or the ` +
        `tenant/building square footage.`,
    );
  }
}

function deriveProRataShareFromSqft(
  lease: CalculationLeaseRecord,
  property: CalculationPropertyRecord,
): {
  share: Rate;
  source: "tenant_sqft_estimate" | "missing";
} {
  const tenantSqft = Rate.parse(lease.tenantSqft ?? "0");
  const totalRentableSqft = Rate.parse(property.totalRentableSqft);

  if (tenantSqft.isZero() || totalRentableSqft.isZero()) {
    return { share: Rate.zero(), source: "missing" };
  }

  return {
    share: tenantSqft.divide(totalRentableSqft),
    source: "tenant_sqft_estimate",
  };
}

/**
 * Active-days proration factor for a lease over the reconciliation period.
 *
 * Mirrors the Python engine's `_period_proration_factor`: both day counts are
 * INCLUSIVE (`+ 1`) and the ratio is held to 8 decimal places, ROUND_HALF_UP
 * (Rate's native scale/rounding). Returns 1 for a full-period lease and 0 when
 * the lease does not overlap the period at all. Dates are compared as
 * `YYYY-MM-DD` strings, which order lexicographically.
 *
 * KNOWN GAP vs Python: the Python engine's `_build_prorated_version_terms`
 * splits a lease whose term-version changes mid-period into one segment per
 * version, each with its own proration_factor AND its own economic terms
 * (pro-rata, cap, admin fee). This engine loads only the single latest term
 * version (`order by effective_date desc limit 1`) and applies one whole-period
 * factor. For a lease whose terms change mid-period the two engines diverge.
 * This is acceptable for current production data (no mid-period version splits
 * observed); revisit if multi-version mid-period leases appear.
 */
function computeProrationFactor(
  lease: CalculationLeaseRecord,
  periodStart: string,
  periodEnd: string,
): Rate {
  const periodStartDay = dayString(periodStart);
  const periodEndDay = dayString(periodEnd);
  const leaseStartDay = dayString(lease.startDate);
  const leaseEndDay = dayString(lease.endDate);

  if (!periodStartDay || !periodEndDay) {
    return Rate.one();
  }

  const activeStart =
    leaseStartDay && leaseStartDay > periodStartDay
      ? leaseStartDay
      : periodStartDay;
  const activeEnd =
    leaseEndDay && leaseEndDay < periodEndDay ? leaseEndDay : periodEndDay;

  if (activeStart > activeEnd) {
    return Rate.zero();
  }

  const totalDays = inclusiveDayCount(periodStartDay, periodEndDay);
  const segmentDays = inclusiveDayCount(activeStart, activeEnd);
  if (totalDays <= 0 || segmentDays >= totalDays) {
    return Rate.one();
  }

  return Rate.parse(String(segmentDays)).divide(Rate.parse(String(totalDays)));
}

/**
 * Normalize a date value to a `YYYY-MM-DD` day string.
 *
 * The postgres driver decodes bare `date` columns to JS `Date` objects unless
 * the query casts them to text. Reconciliation date reads are `::text`-cast in
 * SQL, but this guards the engine against an un-cast value reaching it (which
 * would otherwise throw `value.slice is not a function` in production).
 */
function dayString(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}

/** Inclusive day count between two `YYYY-MM-DD` dates (matches Python `(b - a).days + 1`). */
function inclusiveDayCount(startDay: string, endDay: string): number {
  const startMs = Date.parse(`${startDay}T00:00:00Z`);
  const endMs = Date.parse(`${endDay}T00:00:00Z`);
  return Math.round((endMs - startMs) / 86_400_000) + 1;
}

function serializeLeaseTerms(
  lease: CalculationLeaseRecord,
  terms: LeaseTerms,
): JsonObject {
  return {
    lease_id: lease.id,
    tenant_name: lease.tenantName,
    pro_rata_share: terms.proRataShare.toString(),
    pro_rata_share_source: terms.proRataShareSource,
    estimated_terms_note:
      terms.proRataShareSource === "tenant_sqft_estimate"
        ? "We used tenant SF divided by property SF. Add lease terms to firm this up."
        : null,
    admin_fee_percentage: terms.adminFeePercentage.toString(),
    management_fee_percentage:
      terms.managementFeePercentage?.toString() ?? null,
    base_year: terms.baseYear,
    base_year_amount: terms.baseYearAmount?.toString() ?? null,
    cap_type: terms.capType,
    cap_rate: terms.capRate?.toString() ?? null,
    excluded_pools: terms.excludedPools,
    accounting_basis: terms.accountingBasis,
    proration_factor: terms.prorationFactor.toString(),
  };
}

function wildcardMatches(pattern: string, value: string): boolean {
  const expression = `^${pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll("%", ".*")
    .replaceAll("?", ".")}$`;

  return new RegExp(expression, "i").test(value);
}

function stringFromJson(value: JsonValue | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return null;
}

function numberFromJson(value: JsonValue | undefined): number | null {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }

  return null;
}

/**
 * Sum the `imputed_amount` of every base-year adjustment (base_year.py:126-128:
 * `total_adj += item.imputed_amount`). Each adjustment is an object with a
 * decimal-string `imputed_amount`; malformed entries contribute zero. Returns
 * Money.zero() when there are no adjustments, so the unadjusted base is
 * preserved.
 */
function sumBaseYearAdjustments(value: JsonValue | undefined): Money {
  if (!Array.isArray(value)) {
    return Money.zero();
  }

  let total = Money.zero();
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const imputed = stringFromJson(item.imputed_amount)?.trim() ?? null;
    // Money.parse throws on a non-numeric string; a single malformed adjustment
    // must not abort the whole reconciliation. Validate against Money's numeric
    // contract first and skip (contribute zero) on anything else.
    if (imputed !== null && /^-?\d+(\.\d+)?$/.test(imputed)) {
      total = total.add(Money.parse(imputed));
    }
  }

  return total;
}

function stringArrayFromJson(value: JsonValue | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  return values.find((value) => value !== null && value !== undefined) ?? "";
}

function minRate(left: Rate, right: Rate): Rate {
  return left.lt(right) ? left : right;
}

async function checksumJson(value: JsonValue): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
