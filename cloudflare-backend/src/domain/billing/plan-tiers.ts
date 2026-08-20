export const LAUNCH_OFFER = {
  checkout_param: "offer",
  code: "80OFF",
  label: "80% off the first year",
  discount_percent: 80,
  max_redemptions: 300,
  ends_at: "2026-07-04T07:00:00Z",
  ends_at_display: "Friday, July 3",
  phases: [
    {
      phase_index: 1,
      code: "80OFF",
      label: "80% off the first year",
      discount_percent: 80,
      max_redemptions: 300,
    },
  ],
} as const;

export const SUBSCRIPTION_TIERS = [
  {
    id: "reconcile",
    base_annual: 4990,
    max_units: null,
    included_units: 25,
    unit_pricing_bands: [
      {
        min_units: 26,
        max_units: 150,
        price_per_unit_annual: 179,
      },
      {
        min_units: 151,
        max_units: 500,
        price_per_unit_annual: 169,
      },
      {
        min_units: 501,
        max_units: 2500,
        price_per_unit_annual: 159,
      },
      {
        min_units: 2501,
        max_units: null,
        price_per_unit_annual: 149,
      },
    ],
  },
] as const;

export const FEATURE_LABELS = {
  gl_import_and_parsing: "GL import and parsing",
  cam_reconciliation: "CAM reconciliation",
  leakage_detection: "Exception summary",
  expense_pools: "Expense pool management",
  lease_management: "Lease management and versioning",
  rent_roll_upload: "Rent roll upload",
  basic_reporting: "Reconciliation summaries",
  csv_exports: "CSV exports",
  unlimited_team_members: "Unlimited team members",
  portfolio_dashboard: "Portfolio dashboard",
  cap_bank_tracking: "Cumulative cap bank tracking",
  trend_analysis: "Year-over-year trend analysis",
  anomaly_alerts: "Anomaly detection alerts",
  pdf_exports: "PDF reconciliation reports",
  excel_exports: "Excel exports",
  noi_impact_calculator: "NOI impact calculator",
  tax_protest: "HCAD tax protest normalization",
  ai_lease_extraction: "AI lease extraction with human review",
  ai_gl_narrative_analysis: "AI GL analysis + CapEx screening",
  tenant_portal: "Tenant self-serve portal",
  dispute_system: "Dispute management with audit trail",
  sb1103_compliance_export: "California SB 1103 compliance export",
  demand_letters: "Tenant response templates",
  audit_defense_package: "Audit defense package",
  priority_support: "Priority support",
  support_access: "Support access",
  published_unit_pricing: "Published pricing for every unit count",
  onboarding_support: "Onboarding support",
} as const;

export const FEATURE_TIERS: Record<keyof typeof FEATURE_LABELS, "reconcile"> =
  Object.fromEntries(
    Object.keys(FEATURE_LABELS).map((key) => [key, "reconcile"]),
  ) as Record<keyof typeof FEATURE_LABELS, "reconcile">;

export function getTierDetails(planId: string) {
  return SUBSCRIPTION_TIERS.find((tier) => tier.id === planId) ?? null;
}

export function getAnnualTotalCents(
  planId: string,
  unitCount: number,
): number | null {
  const tier = getTierDetails(planId);

  if (!tier) {
    return null;
  }

  const resolvedUnitCount = Math.max(unitCount, 1);
  const overageTotal = tier.unit_pricing_bands.reduce((total, band) => {
    if (resolvedUnitCount < band.min_units) {
      return total;
    }

    const bandMax = band.max_units ?? resolvedUnitCount;
    const bandUnitCount = Math.max(
      Math.min(resolvedUnitCount, bandMax) - band.min_units + 1,
      0,
    );

    return total + bandUnitCount * band.price_per_unit_annual;
  }, 0);

  return (tier.base_annual + overageTotal) * 100;
}
