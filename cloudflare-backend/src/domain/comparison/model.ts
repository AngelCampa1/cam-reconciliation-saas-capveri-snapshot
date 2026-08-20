import Decimal from "decimal.js";

export type VarianceDirection = "overcharge" | "undercharge" | "match";
export type ComparisonSource = "actual_billed" | "explicit";
export type MatchStatus = "matched" | "needs_review";

export type PoolVariance = {
  pool_id: string;
  pool_name: string | null;
  capveri_correct: string;
  actual_charged: string;
  variance: string;
  direction: VarianceDirection;
  abs_variance: string;
  variance_pct: string | null;
};

export type TenantVariance = {
  lease_id: string;
  tenant_name: string | null;
  match_status: MatchStatus;
  match_note: string | null;
  capveri_correct: string;
  actual_charged: string;
  variance: string;
  direction: VarianceDirection;
  abs_variance: string;
  variance_pct: string | null;
  pool_breakdowns: PoolVariance[] | null;
};

export type ComparisonResult = {
  property_id: string;
  period_start: string;
  period_end: string;
  tolerance: string;
  tenants: TenantVariance[];
  total_capveri_correct: string;
  total_actual_charged: string;
  total_net_variance: string;
  total_overcharge: string;
  total_undercharge: string;
  overcharge_count: number;
  undercharge_count: number;
  match_count: number;
};

export type ExplicitCharge = {
  lease_id?: string | null;
  tenant_name?: string | null;
  pool_id?: string | null;
  amount: string;
};

export type StoredComparisonRunSummary = Omit<
  ComparisonResult,
  "tenants" | "period_start" | "period_end"
> & {
  id: string;
  period_start: string;
  period_end: string;
  source: ComparisonSource;
  created_by: string | null;
  created_at: string;
};

export type StoredComparisonRun = StoredComparisonRunSummary & {
  findings: TenantVariance[];
};

export function classifyVariance(
  variance: Decimal,
  tolerance = new Decimal("0.01"),
): VarianceDirection {
  if (variance.abs().lte(tolerance)) {
    return "match";
  }

  return variance.gt(0) ? "overcharge" : "undercharge";
}

export function buildComparisonResult(input: {
  correctByLease: Map<string, Decimal>;
  chargedByLease: Map<string, Decimal>;
  propertyId: string;
  periodStart: string;
  periodEnd: string;
  tolerance: Decimal;
  tenantNames?: Map<string, string>;
  correctByLeaseAndPool?: Map<string, Map<string, Decimal>>;
  chargedByLeaseAndPool?: Map<string, Map<string, Decimal>>;
  poolNames?: Map<string, string>;
}): ComparisonResult {
  if (input.tolerance.lt(0)) {
    throw new Error(`tolerance must be non-negative, got ${input.tolerance}`);
  }

  const tenantNames = input.tenantNames ?? new Map<string, string>();
  const poolMode =
    input.correctByLeaseAndPool !== undefined ||
    input.chargedByLeaseAndPool !== undefined;
  const correctPools = input.correctByLeaseAndPool ?? new Map();
  const chargedPools = input.chargedByLeaseAndPool ?? new Map();
  const poolNames = input.poolNames ?? new Map<string, string>();
  const leaseIds = new Set([
    ...input.correctByLease.keys(),
    ...input.chargedByLease.keys(),
  ]);

  const tenants: TenantVariance[] = [];
  let totalCorrect = new Decimal(0);
  let totalCharged = new Decimal(0);
  let totalOvercharge = new Decimal(0);
  let totalUndercharge = new Decimal(0);
  let overchargeCount = 0;
  let underchargeCount = 0;
  let matchCount = 0;

  for (const leaseId of leaseIds) {
    const correct = input.correctByLease.get(leaseId) ?? new Decimal(0);
    const charged = input.chargedByLease.get(leaseId) ?? new Decimal(0);
    const variance = charged.minus(correct);
    const direction = classifyVariance(variance, input.tolerance);
    const absVariance = variance.abs();
    const poolBreakdowns = poolMode
      ? buildPoolBreakdowns({
          correctPools: correctPools.get(leaseId) ?? new Map(),
          chargedPools: chargedPools.get(leaseId) ?? new Map(),
          poolNames,
          tolerance: input.tolerance,
        })
      : null;

    tenants.push({
      lease_id: leaseId,
      tenant_name: tenantNames.get(leaseId) ?? null,
      ...matchStatusForLeaseKey(leaseId, correct, charged),
      capveri_correct: correct.toFixed(),
      actual_charged: charged.toFixed(),
      variance: variance.toFixed(),
      direction,
      abs_variance: absVariance.toFixed(),
      variance_pct: signedVariancePct(variance, correct),
      pool_breakdowns: poolBreakdowns,
    });

    totalCorrect = totalCorrect.plus(correct);
    totalCharged = totalCharged.plus(charged);
    if (direction === "overcharge") {
      totalOvercharge = totalOvercharge.plus(variance);
      overchargeCount += 1;
    } else if (direction === "undercharge") {
      totalUndercharge = totalUndercharge.plus(absVariance);
      underchargeCount += 1;
    } else {
      matchCount += 1;
    }
  }

  tenants.sort((left, right) =>
    new Decimal(right.abs_variance).cmp(new Decimal(left.abs_variance)),
  );

  return {
    property_id: input.propertyId,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    tolerance: input.tolerance.toFixed(),
    tenants,
    total_capveri_correct: totalCorrect.toFixed(),
    total_actual_charged: totalCharged.toFixed(),
    total_net_variance: totalCharged.minus(totalCorrect).toFixed(),
    total_overcharge: totalOvercharge.toFixed(),
    total_undercharge: totalUndercharge.toFixed(),
    overcharge_count: overchargeCount,
    undercharge_count: underchargeCount,
    match_count: matchCount,
  };
}

export function matchStatusForLeaseKey(
  leaseId: string,
  correct: Decimal,
  charged: Decimal,
): { match_status: MatchStatus; match_note: string | null } {
  if (leaseId.startsWith("id::") || leaseId.startsWith("explicit::")) {
    return {
      match_status: "needs_review",
      match_note: "This charge is missing a tenant name.",
    };
  }

  if (!leaseId.startsWith("name::")) {
    if (leaseId.startsWith("ambiguous-name::")) {
      return {
        match_status: "needs_review",
        match_note: "More than one lease matched this tenant name.",
      };
    }

    if (leaseId.startsWith("unmatched-name::")) {
      return {
        match_status: "needs_review",
        match_note: "No lease matched this billed row.",
      };
    }

    if (leaseId.startsWith("unmatched-lease::")) {
      return {
        match_status: "needs_review",
        match_note: "No lease matched this billed row.",
      };
    }

    return { match_status: "matched", match_note: null };
  }

  if (correct.eq(0) && charged.gt(0)) {
    return {
      match_status: "needs_review",
      match_note: "No lease matched this billed row.",
    };
  }

  return {
    match_status: "needs_review",
    match_note: "More than one lease matched this tenant name.",
  };
}

function buildPoolBreakdowns(input: {
  correctPools: Map<string, Decimal>;
  chargedPools: Map<string, Decimal>;
  poolNames: Map<string, string>;
  tolerance: Decimal;
}): PoolVariance[] {
  const poolIds = new Set([
    ...input.correctPools.keys(),
    ...input.chargedPools.keys(),
  ]);
  const breakdowns = [...poolIds].map((poolId) => {
    const correct = input.correctPools.get(poolId) ?? new Decimal(0);
    const charged = input.chargedPools.get(poolId) ?? new Decimal(0);
    const variance = charged.minus(correct);

    return {
      pool_id: poolId,
      pool_name: input.poolNames.get(poolId) ?? null,
      capveri_correct: correct.toFixed(),
      actual_charged: charged.toFixed(),
      variance: variance.toFixed(),
      direction: classifyVariance(variance, input.tolerance),
      abs_variance: variance.abs().toFixed(),
      variance_pct: signedVariancePct(variance, correct),
    };
  });

  breakdowns.sort((left, right) =>
    new Decimal(right.abs_variance).cmp(new Decimal(left.abs_variance)),
  );

  return breakdowns;
}

function signedVariancePct(variance: Decimal, correct: Decimal): string | null {
  if (correct.eq(0)) {
    return null;
  }

  return variance
    .div(correct.abs())
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
}
