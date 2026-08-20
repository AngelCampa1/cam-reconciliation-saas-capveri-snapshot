/**
 * Denominator change detection service — EP-18.
 *
 * Faithfully ports backend/app/services/analysis/denominator_change.py
 * (DenominatorChangeService) to TypeScript/decimal.js.
 *
 * Precision contract:
 *   - All arithmetic uses Decimal (precision 28, ROUND_HALF_EVEN — the default).
 *   - Explicit ROUND_HALF_UP is applied only where Python uses it: rsf_delta_percent,
 *     the RSF-change pct in _detect_rsf_change, and share_delta_pct_points.
 *   - Number-format helpers match Python's f-string patterns exactly:
 *       fmtThousands(x)    → f"{x:,.0f}"     (integer, comma-separated)
 *       fmtPct2(x)         → f"{x * 100:.2f}%"
 *       fmtSignedPpt(x)    → f"{x:+.2f} pct points" (signed, 2 dp)
 *       fmtRsf(x)          → f"{x:,.0f} RSF"
 */

import Decimal from "decimal.js";
import type { DenominatorChangeRepository, SnapshotRow } from "./repository";

// ── Constants matching Python Enum ────────────────────────────────────────────

export const DenominatorChangeType = {
  RSF_REMEASUREMENT: "rsf_remeasurement",
  TENANT_ADDED: "tenant_added",
  TENANT_REMOVED: "tenant_removed",
  SELF_MAINTENANCE_START: "self_maintenance_start",
  SELF_MAINTENANCE_STOP: "self_maintenance_stop",
  EXCLUSION_CHANGE: "exclusion_change",
  BOMA_STANDARD_CHANGE: "boma_standard_change",
  SHARE_RECALCULATION: "share_recalculation",
} as const;

export type DenominatorChangeTypeValue =
  (typeof DenominatorChangeType)[keyof typeof DenominatorChangeType];

// ── Domain types ──────────────────────────────────────────────────────────────

export type DenominatorChange = {
  change_type: DenominatorChangeTypeValue;
  description: string;
  prior_value: string;
  current_value: string;
  impact_description: string;
};

export type TenantShareImpact = {
  lease_id: string;
  tenant_name: string;
  prior_pro_rata_share: Decimal;
  current_pro_rata_share: Decimal;
  share_delta_pct_points: Decimal;
  prior_estimated_recovery: Decimal;
  current_estimated_recovery: Decimal;
  recovery_delta: Decimal;
  contributing_changes: DenominatorChangeTypeValue[];
};

export type DenominatorChangeReport = {
  property_id: string;
  property_name: string;
  prior_period: string;
  current_period: string;
  prior_total_rsf: Decimal;
  current_total_rsf: Decimal;
  rsf_delta: Decimal;
  rsf_delta_percent: Decimal;
  changes: DenominatorChange[];
  tenant_impacts: TenantShareImpact[];
  summary: string;
  generated_at: Date;
};

// Raised when no finalized snapshot exists for a period — maps to HTTP 400 (PDF route).
export class NoComparableSnapshotsError extends Error {
  constructor(
    public readonly period: string,
    message: string,
  ) {
    super(message);
    this.name = "NoComparableSnapshotsError";
  }
}

// ── Denominator component shape (per-lease, extracted from snapshot JSONB) ───

type LeaseComponent = {
  tenant_name: string;
  pro_rata_share: Decimal;
  rsf: Decimal;
  excluded_pools: string[];
  boma_standard: string | null;
  total_recovery: Decimal;
};

// ── Number-format helpers — MUST match Python f-string output byte-for-byte ──

/** f"{x:,.0f}" — integer with thousands separator (ROUND_HALF_EVEN matches Python) */
function fmtThousands(x: Decimal): string {
  const rounded = x.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
  const abs = rounded.abs();
  const isNeg = rounded.isNegative() && !rounded.isZero();
  const str = abs.toFixed(0);
  const withCommas = str.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
  return `${isNeg ? "-" : ""}${withCommas}`;
}

/** f"{x:,.0f} RSF" */
function fmtRsf(x: Decimal): string {
  return `${fmtThousands(x)} RSF`;
}

/** f"{x * 100:.2f}%" — percentage string from a share ratio (0–1) (ROUND_HALF_EVEN) */
function fmtPct2(share: Decimal): string {
  return `${share.times(100).toFixed(2, Decimal.ROUND_HALF_EVEN)}%`;
}

/** f"{delta_pct:+.2f} pct points" — signed floating-point string (ROUND_HALF_EVEN) */
function fmtSignedPpt(deltaPct: Decimal): string {
  const fixed = deltaPct.toFixed(2, Decimal.ROUND_HALF_EVEN);
  return deltaPct.isNegative() ? `${fixed} pct points` : `+${fixed} pct points`;
}

// ── Core report builder (exported for unit testing) ───────────────────────────

export type GenerateReportInput = {
  property_id: string;
  current_period_start: string;
  current_period_end: string;
  prior_period_start?: string | null;
  prior_period_end?: string | null;
  prior_total_rsf?: string | number | null;
  current_total_rsf?: string | number | null;
  organizationId: string;
};

export async function generateDenominatorChangeReport(
  repository: DenominatorChangeRepository,
  input: GenerateReportInput,
): Promise<DenominatorChangeReport> {
  const {
    property_id,
    current_period_start,
    current_period_end,
    prior_period_start,
    prior_period_end,
    organizationId,
  } = input;

  // ── Load current snapshots ──────────────────────────────────────────────────
  const currentSnapshots = await repository.listFinalizedSnapshotsInPeriod({
    propertyId: property_id,
    organizationId,
    periodStart: current_period_start,
    periodEnd: current_period_end,
  });

  if (currentSnapshots.length === 0) {
    throw new NoComparableSnapshotsError(
      "current",
      `No finalized snapshots found for current period ` +
        `${current_period_start} to ${current_period_end}`,
    );
  }

  // ── Load prior snapshots ────────────────────────────────────────────────────
  let priorSnapshots: SnapshotRow[];

  if (prior_period_start && prior_period_end) {
    priorSnapshots = await repository.listFinalizedSnapshotsInPeriod({
      propertyId: property_id,
      organizationId,
      periodStart: prior_period_start,
      periodEnd: prior_period_end,
    });
  } else {
    priorSnapshots = await autoDetectPriorSnapshots(
      repository,
      property_id,
      organizationId,
      current_period_start,
    );
  }

  if (priorSnapshots.length === 0) {
    throw new NoComparableSnapshotsError(
      "prior",
      "No finalized snapshots found for prior period",
    );
  }

  // ── Property data ───────────────────────────────────────────────────────────
  const propertyData = await repository.getProperty({
    propertyId: property_id,
    organizationId,
  });
  const propertyName = propertyData?.name ?? "Unknown Property";
  const propRsf = new Decimal(propertyData?.total_rentable_sqft ?? "0");

  const pRsf =
    input.prior_total_rsf != null
      ? new Decimal(String(input.prior_total_rsf))
      : propRsf;
  const cRsf =
    input.current_total_rsf != null
      ? new Decimal(String(input.current_total_rsf))
      : propRsf;

  // ── Extract denominator components ─────────────────────────────────────────
  const priorComponents = extractDenominatorComponents(priorSnapshots);
  const currentComponents = extractDenominatorComponents(currentSnapshots);

  // ── Detect changes ─────────────────────────────────────────────────────────
  const changes: DenominatorChange[] = [
    ...detectRsfChange(pRsf, cRsf),
    ...detectTenantRosterChanges(priorComponents, currentComponents),
    ...detectExclusionChanges(priorComponents, currentComponents),
    ...detectBomaStandardChanges(priorComponents, currentComponents),
    ...detectShareRecalculations(priorComponents, currentComponents),
  ];

  // ── Per-tenant impacts ─────────────────────────────────────────────────────
  const tenantImpacts = calculateTenantImpacts(
    priorComponents,
    currentComponents,
    changes,
  );

  // ── RSF delta ──────────────────────────────────────────────────────────────
  const rsf_delta = cRsf.minus(pRsf);
  const rsf_delta_percent = pRsf.equals(0)
    ? new Decimal(0)
    : rsf_delta.div(pRsf).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const summary = generateSummary(
    pRsf,
    cRsf,
    rsf_delta_percent,
    changes,
    tenantImpacts,
  );

  // ── Period formatting (mirrors Python period_fmt) ─────────────────────────
  const priorPeriodStr = periodFmt(
    prior_period_start ?? priorSnapshots[0]?.period_start_date ?? "",
    prior_period_end ?? priorSnapshots[0]?.period_end_date ?? "",
  );
  const currentPeriodStr = periodFmt(current_period_start, current_period_end);

  return {
    property_id,
    property_name: propertyName,
    prior_period: priorPeriodStr,
    current_period: currentPeriodStr,
    prior_total_rsf: pRsf,
    current_total_rsf: cRsf,
    rsf_delta,
    rsf_delta_percent,
    changes,
    tenant_impacts: tenantImpacts,
    summary,
    generated_at: new Date(),
  };
}

// ── Internal helpers (exported for unit testing) ──────────────────────────────

function periodFmt(start: string, end: string): string {
  return `${start} to ${end}`;
}

export async function autoDetectPriorSnapshots(
  repository: DenominatorChangeRepository,
  propertyId: string,
  organizationId: string,
  currentStart: string,
): Promise<SnapshotRow[]> {
  const snapshots = await repository.listFinalizedSnapshotsBefore({
    propertyId,
    organizationId,
    beforeDate: currentStart,
  });
  if (snapshots.length === 0) return [];

  // Take the subset sharing the latest period_end_date
  const latestEnd = snapshots.reduce(
    (best, s) => (s.period_end_date > best ? s.period_end_date : best),
    "",
  );
  return snapshots.filter((s) => s.period_end_date === latestEnd);
}

export function extractDenominatorComponents(
  snapshots: SnapshotRow[],
): Map<string, LeaseComponent> {
  const components = new Map<string, LeaseComponent>();
  for (const snap of snapshots) {
    const leaseId = snap.lease_id;
    const terms = (snap.lease_terms_snapshot ?? {}) as Record<string, unknown>;
    components.set(leaseId, {
      tenant_name:
        typeof terms["tenant_name"] === "string"
          ? terms["tenant_name"]
          : "Unknown",
      pro_rata_share: new Decimal(String(terms["pro_rata_share"] ?? "0")),
      rsf: new Decimal(String(terms["rentable_square_feet"] ?? "0")),
      excluded_pools: Array.isArray(terms["excluded_pools"])
        ? (terms["excluded_pools"] as string[])
        : [],
      boma_standard:
        typeof terms["rsf_measurement_standard"] === "string"
          ? terms["rsf_measurement_standard"]
          : null,
      total_recovery: new Decimal(String(snap.total_recovery ?? "0")),
    });
  }
  return components;
}

export function detectRsfChange(
  priorRsf: Decimal,
  currentRsf: Decimal,
): DenominatorChange[] {
  if (priorRsf.equals(currentRsf)) return [];

  const delta = currentRsf.minus(priorRsf);
  const pct = priorRsf.equals(0)
    ? new Decimal(0)
    : delta.div(priorRsf).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const direction = delta.isPositive() ? "increased" : "decreased";

  return [
    {
      change_type: DenominatorChangeType.RSF_REMEASUREMENT,
      description:
        `Total rentable square footage ${direction} ` +
        `by ${fmtThousands(delta.abs())} RSF`,
      prior_value: fmtRsf(priorRsf),
      current_value: fmtRsf(currentRsf),
      impact_description:
        `Total RSF ${direction} by ${pct.abs().toFixed(2)}%, ` +
        `affecting all tenant pro-rata share calculations`,
    },
  ];
}

export function detectTenantRosterChanges(
  prior: Map<string, LeaseComponent>,
  current: Map<string, LeaseComponent>,
): DenominatorChange[] {
  const changes: DenominatorChange[] = [];
  const priorIds = new Set(prior.keys());
  const currentIds = new Set(current.keys());

  for (const addedId of currentIds) {
    if (priorIds.has(addedId)) continue;
    const tenant = current.get(addedId)!;
    changes.push({
      change_type: DenominatorChangeType.TENANT_ADDED,
      description:
        `${tenant.tenant_name} added to property ` +
        `(${fmtThousands(tenant.rsf)} RSF, ` +
        `${fmtPct2(tenant.pro_rata_share)} share)`,
      prior_value: "Not present",
      current_value: `${tenant.tenant_name} - ${fmtThousands(tenant.rsf)} RSF`,
      impact_description: "New tenant dilutes existing tenants' shares",
    });
  }

  for (const removedId of priorIds) {
    if (currentIds.has(removedId)) continue;
    const tenant = prior.get(removedId)!;
    changes.push({
      change_type: DenominatorChangeType.TENANT_REMOVED,
      description:
        `${tenant.tenant_name} removed from property ` +
        `(${fmtThousands(tenant.rsf)} RSF, ` +
        `${fmtPct2(tenant.pro_rata_share)} share)`,
      prior_value: `${tenant.tenant_name} - ${fmtThousands(tenant.rsf)} RSF`,
      current_value: "Not present",
      impact_description: "Remaining tenants may see share concentration",
    });
  }

  return changes;
}

export function detectExclusionChanges(
  prior: Map<string, LeaseComponent>,
  current: Map<string, LeaseComponent>,
): DenominatorChange[] {
  const changes: DenominatorChange[] = [];
  for (const [leaseId, curr] of current.entries()) {
    const prev = prior.get(leaseId);
    if (!prev) continue;

    const priorExcl = new Set(prev.excluded_pools);
    const currExcl = new Set(curr.excluded_pools);

    const addedPools = [...currExcl].filter((p) => !priorExcl.has(p));
    const removedPools = [...priorExcl].filter((p) => !currExcl.has(p));

    if (addedPools.length === 0 && removedPools.length === 0) continue;

    const descParts: string[] = [];
    if (addedPools.length > 0) {
      descParts.push(`now excludes ${[...addedPools].sort().join(", ")}`);
    }
    if (removedPools.length > 0) {
      descParts.push(
        `no longer excludes ${[...removedPools].sort().join(", ")}`,
      );
    }

    const priorExclSorted = [...priorExcl].sort().join(", ") || "None";
    const currExclSorted = [...currExcl].sort().join(", ") || "None";

    changes.push({
      change_type: DenominatorChangeType.EXCLUSION_CHANGE,
      description: `${curr.tenant_name} pool exclusions changed: ${descParts.join("; ")}`,
      prior_value: priorExclSorted,
      current_value: currExclSorted,
      impact_description: `Changes which expense pools ${curr.tenant_name} participates in`,
    });
  }
  return changes;
}

export function detectBomaStandardChanges(
  prior: Map<string, LeaseComponent>,
  current: Map<string, LeaseComponent>,
): DenominatorChange[] {
  const changes: DenominatorChange[] = [];
  // Deduplicate transitions — first-seen order preserved (matches Python seen-set)
  const seenTransitions = new Set<string>();

  for (const [leaseId, curr] of current.entries()) {
    const prev = prior.get(leaseId);
    if (!prev) continue;

    const priorStd = prev.boma_standard;
    const currStd = curr.boma_standard;

    if (priorStd === currStd) continue;
    if (!priorStd && !currStd) continue;

    const transitionKey = `${priorStd ?? ""}|||${currStd ?? ""}`;
    if (seenTransitions.has(transitionKey)) continue;
    seenTransitions.add(transitionKey);

    changes.push({
      change_type: DenominatorChangeType.BOMA_STANDARD_CHANGE,
      description:
        `BOMA measurement standard changed` +
        ` from ${priorStd ?? "unspecified"}` +
        ` to ${currStd ?? "unspecified"}`,
      prior_value: priorStd ?? "unspecified",
      current_value: currStd ?? "unspecified",
      impact_description:
        "BOMA re-measurement may affect rentable area " +
        "calculations and pro-rata shares",
    });
  }
  return changes;
}

export function detectShareRecalculations(
  prior: Map<string, LeaseComponent>,
  current: Map<string, LeaseComponent>,
): DenominatorChange[] {
  const changes: DenominatorChange[] = [];

  for (const [leaseId, curr] of current.entries()) {
    const prev = prior.get(leaseId);
    if (!prev) continue;

    if (prev.pro_rata_share.equals(curr.pro_rata_share)) continue;

    const deltaPct = curr.pro_rata_share.minus(prev.pro_rata_share).times(100);
    changes.push({
      change_type: DenominatorChangeType.SHARE_RECALCULATION,
      description:
        `${curr.tenant_name} pro-rata share changed from ` +
        `${fmtPct2(prev.pro_rata_share)} to ${fmtPct2(curr.pro_rata_share)} ` +
        `(${fmtSignedPpt(deltaPct)})`,
      prior_value: fmtPct2(prev.pro_rata_share),
      current_value: fmtPct2(curr.pro_rata_share),
      impact_description:
        `${curr.tenant_name}'s share of recoverable expenses ` +
        `${deltaPct.isPositive() ? "increased" : "decreased"}`,
    });
  }
  return changes;
}

export function calculateTenantImpacts(
  prior: Map<string, LeaseComponent>,
  current: Map<string, LeaseComponent>,
  changes: DenominatorChange[],
): TenantShareImpact[] {
  const impacts: TenantShareImpact[] = [];

  // Build per-lease contributing-change set (mirrors Python logic exactly)
  const tenantChanges = new Map<string, Set<DenominatorChangeTypeValue>>();
  const commonIds = [...current.keys()].filter((id) => prior.has(id));

  for (const change of changes) {
    if (
      change.change_type === DenominatorChangeType.RSF_REMEASUREMENT ||
      change.change_type === DenominatorChangeType.BOMA_STANDARD_CHANGE
    ) {
      for (const lid of commonIds) {
        if (!tenantChanges.has(lid)) tenantChanges.set(lid, new Set());
        tenantChanges.get(lid)!.add(change.change_type);
      }
    } else if (
      change.change_type === DenominatorChangeType.TENANT_ADDED ||
      change.change_type === DenominatorChangeType.TENANT_REMOVED
    ) {
      for (const lid of commonIds) {
        if (!tenantChanges.has(lid)) tenantChanges.set(lid, new Set());
        tenantChanges.get(lid)!.add(change.change_type);
      }
    } else if (change.change_type === DenominatorChangeType.EXCLUSION_CHANGE) {
      for (const lid of commonIds) {
        const tName = current.get(lid)!.tenant_name;
        if (change.description.includes(tName)) {
          if (!tenantChanges.has(lid)) tenantChanges.set(lid, new Set());
          tenantChanges.get(lid)!.add(change.change_type);
        }
      }
    } else if (
      change.change_type === DenominatorChangeType.SHARE_RECALCULATION
    ) {
      for (const lid of commonIds) {
        const tName = current.get(lid)!.tenant_name;
        if (change.description.includes(tName)) {
          if (!tenantChanges.has(lid)) tenantChanges.set(lid, new Set());
          tenantChanges.get(lid)!.add(change.change_type);
        }
      }
    }
  }

  for (const [leaseId, curr] of current.entries()) {
    const prev = prior.get(leaseId);
    if (!prev) continue; // New tenant — no prior to compare

    const priorShare = prev.pro_rata_share;
    const currentShare = curr.pro_rata_share;

    if (
      priorShare.equals(currentShare) &&
      prev.total_recovery.equals(curr.total_recovery)
    ) {
      continue; // No change for this tenant
    }

    const deltaPctPoints = currentShare
      .minus(priorShare)
      .times(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const contributing = [...(tenantChanges.get(leaseId) ?? new Set())];

    // Auto-append SHARE_RECALCULATION if share changed and not already in list
    if (
      !priorShare.equals(currentShare) &&
      !contributing.includes(DenominatorChangeType.SHARE_RECALCULATION)
    ) {
      contributing.push(DenominatorChangeType.SHARE_RECALCULATION);
    }

    impacts.push({
      lease_id: leaseId,
      tenant_name: curr.tenant_name,
      prior_pro_rata_share: priorShare,
      current_pro_rata_share: currentShare,
      share_delta_pct_points: deltaPctPoints,
      prior_estimated_recovery: prev.total_recovery,
      current_estimated_recovery: curr.total_recovery,
      recovery_delta: curr.total_recovery.minus(prev.total_recovery),
      contributing_changes: contributing,
    });
  }

  return impacts;
}

export function generateSummary(
  priorRsf: Decimal,
  currentRsf: Decimal,
  rsf_delta_percent: Decimal,
  changes: DenominatorChange[],
  impacts: TenantShareImpact[],
): string {
  const parts: string[] = [];

  if (!priorRsf.equals(currentRsf)) {
    const direction = currentRsf.greaterThan(priorRsf)
      ? "increase"
      : "decrease";
    parts.push(
      `Total RSF changed from ${fmtThousands(priorRsf)} to ${fmtThousands(currentRsf)} ` +
        `(${rsf_delta_percent.abs().toFixed(2)}% ${direction}).`,
    );
  }

  if (changes.length > 0) {
    parts.push(
      `${changes.length} denominator ` +
        `change${changes.length !== 1 ? "s" : ""} detected.`,
    );
  } else {
    parts.push("No denominator changes detected between periods.");
  }

  if (impacts.length > 0) {
    parts.push(
      `${impacts.length} tenant${impacts.length !== 1 ? "s" : ""} affected.`,
    );
  }

  return parts.join(" ");
}
