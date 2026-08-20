import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { buildComparisonResult } from "../domain/comparison/model";

describe("comparison model", () => {
  it("computes signed overcharge, undercharge, match totals with decimal strings", () => {
    const result = buildComparisonResult({
      propertyId: "33333333-3333-4333-8333-333333333333",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: new Decimal("0.01"),
      correctByLease: new Map([
        ["lease-under", new Decimal("100.00")],
        ["lease-over", new Decimal("100.00")],
        ["lease-match", new Decimal("100.00")],
      ]),
      chargedByLease: new Map([
        ["lease-under", new Decimal("90.00")],
        ["lease-over", new Decimal("125.00")],
        ["lease-match", new Decimal("100.01")],
      ]),
      tenantNames: new Map([
        ["lease-under", "Under Tenant"],
        ["lease-over", "Over Tenant"],
        ["lease-match", "Match Tenant"],
      ]),
    });

    expect(result).toMatchObject({
      total_capveri_correct: "300",
      total_actual_charged: "315.01",
      total_net_variance: "15.01",
      total_overcharge: "25",
      total_undercharge: "10",
      overcharge_count: 1,
      undercharge_count: 1,
      match_count: 1,
    });
    expect(result.tenants.map((tenant) => tenant.lease_id)).toEqual([
      "lease-over",
      "lease-under",
      "lease-match",
    ]);
    expect(result.tenants[0]).toMatchObject({
      match_status: "matched",
      match_note: null,
      direction: "overcharge",
      variance: "25",
      variance_pct: "25.00",
    });
  });

  it("marks synthetic billed rows as needing match review", () => {
    const result = buildComparisonResult({
      propertyId: "33333333-3333-4333-8333-333333333333",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: new Decimal("0.01"),
      correctByLease: new Map([
        ["ambiguous-name::Same Tenant", new Decimal("150.00")],
        ["lease-1", new Decimal("100.00")],
      ]),
      chargedByLease: new Map([
        ["ambiguous-name::Same Tenant", new Decimal("150.00")],
        ["unmatched-name::Unknown Tenant", new Decimal("25.00")],
        ["id::billed-blank", new Decimal("10.00")],
        ["lease-1", new Decimal("100.00")],
      ]),
      tenantNames: new Map([
        ["ambiguous-name::Same Tenant", "Same Tenant"],
        ["unmatched-name::Unknown Tenant", "Unknown Tenant"],
        ["id::billed-blank", "Unidentified charge"],
        ["lease-1", "Acme Retail"],
      ]),
    });

    const byLease = new Map(
      result.tenants.map((tenant) => [tenant.lease_id, tenant]),
    );
    expect(byLease.get("lease-1")).toMatchObject({
      match_status: "matched",
      match_note: null,
    });
    expect(byLease.get("ambiguous-name::Same Tenant")).toMatchObject({
      match_status: "needs_review",
      match_note: "More than one lease matched this tenant name.",
    });
    expect(byLease.get("unmatched-name::Unknown Tenant")).toMatchObject({
      match_status: "needs_review",
      match_note: "No lease matched this billed row.",
    });
    expect(byLease.get("id::billed-blank")).toMatchObject({
      match_status: "needs_review",
      match_note: "This charge is missing a tenant name.",
    });
  });

  it("keeps match reasons stable when amounts are zero or credits", () => {
    const result = buildComparisonResult({
      propertyId: "33333333-3333-4333-8333-333333333333",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: new Decimal("0.01"),
      correctByLease: new Map([
        ["ambiguous-name::Zero Tenant", new Decimal("0.00")],
        ["unmatched-name::Credit Tenant", new Decimal("0.00")],
      ]),
      chargedByLease: new Map([
        ["ambiguous-name::Zero Tenant", new Decimal("0.00")],
        ["unmatched-name::Credit Tenant", new Decimal("-25.00")],
      ]),
      tenantNames: new Map([
        ["ambiguous-name::Zero Tenant", "Zero Tenant"],
        ["unmatched-name::Credit Tenant", "Credit Tenant"],
      ]),
    });

    const byLease = new Map(
      result.tenants.map((tenant) => [tenant.lease_id, tenant]),
    );
    expect(byLease.get("ambiguous-name::Zero Tenant")).toMatchObject({
      match_status: "needs_review",
      match_note: "More than one lease matched this tenant name.",
    });
    expect(byLease.get("unmatched-name::Credit Tenant")).toMatchObject({
      match_status: "needs_review",
      match_note: "No lease matched this billed row.",
    });
  });

  it("emits per-pool breakdowns only when pool maps are supplied", () => {
    const result = buildComparisonResult({
      propertyId: "33333333-3333-4333-8333-333333333333",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: new Decimal("0.01"),
      correctByLease: new Map([["lease-1", new Decimal("100.00")]]),
      chargedByLease: new Map([["lease-1", new Decimal("120.00")]]),
      tenantNames: new Map([["lease-1", "Acme Retail"]]),
      correctByLeaseAndPool: new Map([
        ["lease-1", new Map([["pool-cam", new Decimal("60.00")]])],
      ]),
      chargedByLeaseAndPool: new Map([
        ["lease-1", new Map([["pool-cam", new Decimal("72.00")]])],
      ]),
      poolNames: new Map([["pool-cam", "CAM"]]),
    });

    expect(result.tenants[0]?.pool_breakdowns).toEqual([
      expect.objectContaining({
        pool_id: "pool-cam",
        pool_name: "CAM",
        variance: "12",
        direction: "overcharge",
      }),
    ]);
  });

  it("keeps variance percent sign aligned with variance for net-credit baselines", () => {
    const result = buildComparisonResult({
      propertyId: "33333333-3333-4333-8333-333333333333",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: new Decimal("0.01"),
      correctByLease: new Map([
        ["credit-over", new Decimal("-100.00")],
        ["credit-under", new Decimal("-100.00")],
      ]),
      chargedByLease: new Map([
        ["credit-over", new Decimal("0.00")],
        ["credit-under", new Decimal("-150.00")],
      ]),
      correctByLeaseAndPool: new Map([
        ["credit-over", new Map([["pool-credit", new Decimal("-100.00")]])],
        ["credit-under", new Map([["pool-credit", new Decimal("-100.00")]])],
      ]),
      chargedByLeaseAndPool: new Map([
        ["credit-over", new Map([["pool-credit", new Decimal("0.00")]])],
        ["credit-under", new Map([["pool-credit", new Decimal("-150.00")]])],
      ]),
    });

    const byLease = new Map(
      result.tenants.map((tenant) => [tenant.lease_id, tenant]),
    );
    expect(byLease.get("credit-over")).toMatchObject({
      direction: "overcharge",
      variance: "100",
      variance_pct: "100.00",
    });
    expect(byLease.get("credit-over")?.pool_breakdowns?.[0]).toMatchObject({
      direction: "overcharge",
      variance: "100",
      variance_pct: "100.00",
    });
    expect(byLease.get("credit-under")).toMatchObject({
      direction: "undercharge",
      variance: "-50",
      variance_pct: "-50.00",
    });
    expect(byLease.get("credit-under")?.pool_breakdowns?.[0]).toMatchObject({
      direction: "undercharge",
      variance: "-50",
      variance_pct: "-50.00",
    });
  });
});
