export interface LeadMagnetRegistryItem {
  slug: string;
  displayName: string;
  storagePath: string;
  format: "pdf" | "xlsx" | "calculator_unlock";
}

const leadMagnetStoragePath = (filename: string) =>
  `lead-magnets/2026-06-25/${filename}`;

export const LEAD_MAGNETS = [
  {
    slug: "cam-gross-up-calculator",
    displayName: "CAM Gross-Up Scenario Calculator",
    storagePath: leadMagnetStoragePath("cam-gross-up-calculator.xlsx"),
    format: "xlsx",
  },
  {
    slug: "lease-abstract-matrix",
    displayName: "Lease Abstract Discrepancy Matrix",
    storagePath: leadMagnetStoragePath("lease-abstract-matrix.xlsx"),
    format: "xlsx",
  },
  {
    slug: "cam-reconciliation-checklist",
    displayName: "CAM Reconciliation Review Checklist",
    storagePath: leadMagnetStoragePath("cam-reconciliation-checklist.pdf"),
    format: "pdf",
  },
  {
    slug: "boma-2024-calculator",
    displayName: "BOMA 2024 Calculator",
    storagePath: leadMagnetStoragePath("boma-2024-calculator.pdf"),
    format: "calculator_unlock",
  },
  {
    slug: "fixed-cam-vs-traditional",
    displayName: "Fixed CAM vs Traditional Comparison",
    storagePath: leadMagnetStoragePath("fixed-cam-vs-traditional.pdf"),
    format: "calculator_unlock",
  },
  {
    slug: "admin-fee-calculator",
    displayName: "Admin Fee Calculator",
    storagePath: leadMagnetStoragePath("admin-fee-calculator.xlsx"),
    format: "xlsx",
  },
  {
    slug: "cam-estimate-forecaster",
    displayName: "CAM Estimate Forecaster",
    storagePath: leadMagnetStoragePath("cam-estimate-forecaster.xlsx"),
    format: "xlsx",
  },
  {
    slug: "boma-remeasurement-impact",
    displayName: "BOMA Remeasurement Impact Analyzer",
    storagePath: leadMagnetStoragePath("boma-remeasurement-impact.xlsx"),
    format: "xlsx",
  },
  {
    slug: "cam-cap-calculator",
    displayName: "CAM Cap Calculator",
    storagePath: leadMagnetStoragePath("cam-cap-calculator.xlsx"),
    format: "xlsx",
  },
  {
    slug: "base-year-escalation",
    displayName: "Base Year Escalation Calculator",
    storagePath: leadMagnetStoragePath("base-year-escalation.xlsx"),
    format: "xlsx",
  },
  {
    slug: "reconciliation-statement-generator",
    displayName: "Reconciliation Statement Generator",
    storagePath: leadMagnetStoragePath(
      "reconciliation-statement-generator.xlsx",
    ),
    format: "xlsx",
  },
  {
    slug: "recovery-gap-analyzer",
    displayName: "Billing Gap Analyzer",
    storagePath: leadMagnetStoragePath("recovery-gap-analyzer.xlsx"),
    format: "xlsx",
  },
  {
    slug: "pro-rata-calculator",
    displayName: "Pro-Rata Share Calculator",
    storagePath: leadMagnetStoragePath("pro-rata-calculator.xlsx"),
    format: "xlsx",
  },
  {
    slug: "hcad-tax-normalizer",
    displayName: "HCAD Tax Normalizer",
    storagePath: leadMagnetStoragePath("hcad-tax-normalizer.xlsx"),
    format: "xlsx",
  },
  {
    slug: "noi-impact-calculator",
    displayName: "NOI Impact Calculator",
    storagePath: leadMagnetStoragePath("noi-impact-calculator.xlsx"),
    format: "xlsx",
  },
  {
    slug: "cam-leakage-estimator",
    displayName: "CAM Billing Error Estimator",
    storagePath: leadMagnetStoragePath("cam-leakage-estimator.xlsx"),
    format: "xlsx",
  },
  {
    slug: "cam-overcharge-calculator",
    displayName: "Tenant Challenge Exposure Calculator",
    storagePath: leadMagnetStoragePath("cam-overcharge-calculator.pdf"),
    format: "calculator_unlock",
  },
  {
    slug: "audit-risk-scorecard",
    displayName: "Pre-Send Audit Exposure Scorecard",
    storagePath: leadMagnetStoragePath("audit-risk-scorecard.pdf"),
    format: "pdf",
  },
  {
    slug: "sb-1103-checker",
    displayName: "SB 1103 Compliance Checker",
    storagePath: leadMagnetStoragePath("sb-1103-checker.pdf"),
    format: "pdf",
  },
  {
    slug: "audit-risk-quiz",
    displayName: "Pre-Send Audit Exposure Quiz",
    storagePath: leadMagnetStoragePath("audit-risk-quiz.pdf"),
    format: "pdf",
  },
  {
    slug: "cam-reconciliation-statement",
    displayName: "Tenant CAM Statement Outline",
    storagePath: leadMagnetStoragePath("cam-reconciliation-statement.pdf"),
    format: "pdf",
  },
  {
    slug: "cam-reconciliation-excel",
    displayName: "CAM Reconciliation Excel Template",
    storagePath: leadMagnetStoragePath("cam-reconciliation-excel.xlsx"),
    format: "xlsx",
  },
  {
    slug: "tenant-cam-reconciliation-letter",
    displayName: "Landlord CAM Reconciliation Cover Letter",
    storagePath: leadMagnetStoragePath("tenant-cam-reconciliation-letter.pdf"),
    format: "pdf",
  },
  {
    slug: "cam-reconciliation-california",
    displayName: "California CAM Packet Starter",
    storagePath: leadMagnetStoragePath("cam-reconciliation-california.pdf"),
    format: "pdf",
  },
  {
    slug: "cam-reconciliation-texas",
    displayName: "Texas CAM Packet Starter",
    storagePath: leadMagnetStoragePath("cam-reconciliation-texas.pdf"),
    format: "pdf",
  },
  {
    slug: "cam-reconciliation-florida",
    displayName: "Florida CAM Packet Starter",
    storagePath: leadMagnetStoragePath("cam-reconciliation-florida.pdf"),
    format: "pdf",
  },
  {
    slug: "nnn-lease-cam-reconciliation",
    displayName: "NNN Lease CAM Reconciliation Template",
    storagePath: leadMagnetStoragePath("nnn-lease-cam-reconciliation.pdf"),
    format: "pdf",
  },
  {
    slug: "cam-dispute-response-template",
    displayName: "CAM Dispute Response Template",
    storagePath: leadMagnetStoragePath("cam-dispute-response-template.pdf"),
    format: "pdf",
  },
  {
    slug: "cam-estimate-letter",
    displayName: "CAM Estimate / Budget Letter",
    storagePath: leadMagnetStoragePath("cam-estimate-letter.pdf"),
    format: "pdf",
  },
  {
    slug: "cumulative-cap-bank-calculator",
    displayName: "Cumulative CAM Cap Bank Calculator",
    storagePath: leadMagnetStoragePath("cumulative-cap-bank-calculator.xlsx"),
    format: "xlsx",
  },
  {
    slug: "cam-pre-send-packet-checklist",
    displayName: "CAM Pre-Send Packet Checklist",
    storagePath: leadMagnetStoragePath("cam-pre-send-packet-checklist.pdf"),
    format: "pdf",
  },
  {
    slug: "yardi-export-qa-checklist",
    displayName: "Yardi Export Error Checklist",
    storagePath: leadMagnetStoragePath("yardi-export-qa-checklist.pdf"),
    format: "pdf",
  },
  {
    slug: "mri-recovery-billing-qa-checklist",
    displayName: "MRI Recovery Billing Error Checklist",
    storagePath: leadMagnetStoragePath("mri-recovery-billing-qa-checklist.pdf"),
    format: "pdf",
  },
  {
    slug: "multi-state-cam-disclosure-matrix",
    displayName: "Multi-State CAM Packet Review Checklist",
    storagePath: leadMagnetStoragePath("multi-state-cam-disclosure-matrix.pdf"),
    format: "pdf",
  },
  {
    slug: "cam-recovery-ratio-worksheet",
    displayName: "CAM Recovery Ratio Benchmark Worksheet",
    storagePath: leadMagnetStoragePath("cam-recovery-ratio-worksheet.xlsx"),
    format: "xlsx",
  },
  {
    slug: "property-tax-appeal-recovery-calculator",
    displayName: "Property Tax Appeal Impact Calculator",
    storagePath: leadMagnetStoragePath(
      "property-tax-appeal-recovery-calculator.xlsx",
    ),
    format: "xlsx",
  },
  {
    slug: "tenant-dispute-response-letter-template",
    displayName: "Tenant CAM Dispute Response Letter",
    storagePath: leadMagnetStoragePath(
      "tenant-dispute-response-letter-template.pdf",
    ),
    format: "pdf",
  },
  {
    slug: "audit-defense-packet-builder",
    displayName: "Audit Defense Packet Builder",
    storagePath: leadMagnetStoragePath("audit-defense-packet-builder.pdf"),
    format: "pdf",
  },
  {
    slug: "lease-clause-extraction-matrix",
    displayName: "Lease Clause Extraction Matrix",
    storagePath: leadMagnetStoragePath("lease-clause-extraction-matrix.xlsx"),
    format: "xlsx",
  },
] as const satisfies readonly LeadMagnetRegistryItem[];

export const LEAD_MAGNET_DISPLAY_NAMES: Record<string, string> =
  Object.fromEntries(
    LEAD_MAGNETS.map((asset) => [asset.slug, asset.displayName]),
  );

export const LEAD_MAGNET_SLUGS = new Set<string>(
  LEAD_MAGNETS.map((asset) => asset.slug),
);

export function getLeadMagnetName(slug: string): string {
  return LEAD_MAGNET_DISPLAY_NAMES[slug] ?? "Your Resource";
}
