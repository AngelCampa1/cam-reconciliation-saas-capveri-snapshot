export type LeadMagnetFormat = "pdf" | "xlsx" | "calculator_unlock";
export type LeadMagnetCategory =
  | "calculator"
  | "checklist"
  | "framework"
  | "template";

export type LeadMagnetAsset = {
  slug: string;
  displayName: string;
  format: LeadMagnetFormat;
  storagePath: string;
  category: LeadMagnetCategory;
  enabled: boolean;
};

const storagePrefix = "lead-magnets/2026-06-25/";

function asset(
  slug: string,
  displayName: string,
  format: LeadMagnetFormat,
  filename: string,
  category: LeadMagnetCategory,
): LeadMagnetAsset {
  return {
    slug,
    displayName,
    format,
    storagePath: `${storagePrefix}${filename}`,
    category,
    enabled: true,
  };
}

export const leadMagnetAssets: Record<string, LeadMagnetAsset> = {
  "cam-gross-up-calculator": asset(
    "cam-gross-up-calculator",
    "CAM Gross-Up Scenario Calculator",
    "xlsx",
    "cam-gross-up-calculator.xlsx",
    "calculator",
  ),
  "lease-abstract-matrix": asset(
    "lease-abstract-matrix",
    "Lease Abstract Discrepancy Matrix",
    "xlsx",
    "lease-abstract-matrix.xlsx",
    "framework",
  ),
  "cam-reconciliation-checklist": asset(
    "cam-reconciliation-checklist",
    "CAM Reconciliation Review Checklist",
    "pdf",
    "cam-reconciliation-checklist.pdf",
    "checklist",
  ),
  "boma-2024-calculator": asset(
    "boma-2024-calculator",
    "BOMA 2024 Calculator",
    "calculator_unlock",
    "boma-2024-calculator.pdf",
    "calculator",
  ),
  "fixed-cam-vs-traditional": asset(
    "fixed-cam-vs-traditional",
    "Fixed CAM vs Traditional Comparison",
    "calculator_unlock",
    "fixed-cam-vs-traditional.pdf",
    "calculator",
  ),
  "admin-fee-calculator": asset(
    "admin-fee-calculator",
    "Admin Fee Calculator",
    "xlsx",
    "admin-fee-calculator.xlsx",
    "calculator",
  ),
  "cam-estimate-forecaster": asset(
    "cam-estimate-forecaster",
    "CAM Estimate Forecaster",
    "xlsx",
    "cam-estimate-forecaster.xlsx",
    "calculator",
  ),
  "boma-remeasurement-impact": asset(
    "boma-remeasurement-impact",
    "BOMA Remeasurement Impact Analyzer",
    "xlsx",
    "boma-remeasurement-impact.xlsx",
    "calculator",
  ),
  "cam-cap-calculator": asset(
    "cam-cap-calculator",
    "CAM Cap Calculator",
    "xlsx",
    "cam-cap-calculator.xlsx",
    "calculator",
  ),
  "base-year-escalation": asset(
    "base-year-escalation",
    "Base Year Escalation Calculator",
    "xlsx",
    "base-year-escalation.xlsx",
    "calculator",
  ),
  "reconciliation-statement-generator": asset(
    "reconciliation-statement-generator",
    "Reconciliation Statement Generator",
    "xlsx",
    "reconciliation-statement-generator.xlsx",
    "template",
  ),
  "recovery-gap-analyzer": asset(
    "recovery-gap-analyzer",
    "Recovery Gap Analyzer",
    "xlsx",
    "recovery-gap-analyzer.xlsx",
    "calculator",
  ),
  "pro-rata-calculator": asset(
    "pro-rata-calculator",
    "Pro-Rata Share Calculator",
    "xlsx",
    "pro-rata-calculator.xlsx",
    "calculator",
  ),
  "hcad-tax-normalizer": asset(
    "hcad-tax-normalizer",
    "HCAD Tax Normalizer",
    "xlsx",
    "hcad-tax-normalizer.xlsx",
    "calculator",
  ),
  "noi-impact-calculator": asset(
    "noi-impact-calculator",
    "NOI Impact Calculator",
    "xlsx",
    "noi-impact-calculator.xlsx",
    "calculator",
  ),
  "cam-leakage-estimator": asset(
    "cam-leakage-estimator",
    "CAM Leakage Estimator",
    "xlsx",
    "cam-leakage-estimator.xlsx",
    "calculator",
  ),
  "cam-overcharge-calculator": asset(
    "cam-overcharge-calculator",
    "Tenant Challenge Exposure Calculator",
    "calculator_unlock",
    "cam-overcharge-calculator.pdf",
    "calculator",
  ),
  "audit-risk-scorecard": asset(
    "audit-risk-scorecard",
    "Pre-Send Audit Exposure Scorecard",
    "pdf",
    "audit-risk-scorecard.pdf",
    "checklist",
  ),
  "sb-1103-checker": asset(
    "sb-1103-checker",
    "SB 1103 Compliance Checker",
    "pdf",
    "sb-1103-checker.pdf",
    "checklist",
  ),
  "audit-risk-quiz": asset(
    "audit-risk-quiz",
    "Pre-Send Audit Exposure Quiz",
    "pdf",
    "audit-risk-quiz.pdf",
    "checklist",
  ),
  "cam-reconciliation-statement": asset(
    "cam-reconciliation-statement",
    "Tenant CAM Statement Outline",
    "pdf",
    "cam-reconciliation-statement.pdf",
    "template",
  ),
  "cam-reconciliation-excel": asset(
    "cam-reconciliation-excel",
    "CAM Reconciliation Excel Template",
    "xlsx",
    "cam-reconciliation-excel.xlsx",
    "template",
  ),
  "tenant-cam-reconciliation-letter": asset(
    "tenant-cam-reconciliation-letter",
    "Landlord CAM Reconciliation Cover Letter",
    "pdf",
    "tenant-cam-reconciliation-letter.pdf",
    "template",
  ),
  "cam-reconciliation-california": asset(
    "cam-reconciliation-california",
    "California CAM Packet Starter",
    "pdf",
    "cam-reconciliation-california.pdf",
    "template",
  ),
  "cam-reconciliation-texas": asset(
    "cam-reconciliation-texas",
    "Texas CAM Packet Starter",
    "pdf",
    "cam-reconciliation-texas.pdf",
    "template",
  ),
  "cam-reconciliation-florida": asset(
    "cam-reconciliation-florida",
    "Florida CAM Packet Starter",
    "pdf",
    "cam-reconciliation-florida.pdf",
    "template",
  ),
  "nnn-lease-cam-reconciliation": asset(
    "nnn-lease-cam-reconciliation",
    "NNN Lease CAM Reconciliation Template",
    "pdf",
    "nnn-lease-cam-reconciliation.pdf",
    "template",
  ),
  "cam-dispute-response-template": asset(
    "cam-dispute-response-template",
    "CAM Dispute Response Template",
    "pdf",
    "cam-dispute-response-template.pdf",
    "template",
  ),
  "cam-estimate-letter": asset(
    "cam-estimate-letter",
    "CAM Estimate / Budget Letter",
    "pdf",
    "cam-estimate-letter.pdf",
    "template",
  ),
  "cumulative-cap-bank-calculator": asset(
    "cumulative-cap-bank-calculator",
    "Cumulative CAM Cap Bank Calculator",
    "xlsx",
    "cumulative-cap-bank-calculator.xlsx",
    "calculator",
  ),
  "cam-pre-send-packet-checklist": asset(
    "cam-pre-send-packet-checklist",
    "CAM Pre-Send Packet Checklist",
    "pdf",
    "cam-pre-send-packet-checklist.pdf",
    "checklist",
  ),
  "yardi-export-qa-checklist": asset(
    "yardi-export-qa-checklist",
    "Yardi Export Error Checklist",
    "pdf",
    "yardi-export-qa-checklist.pdf",
    "checklist",
  ),
  "mri-recovery-billing-qa-checklist": asset(
    "mri-recovery-billing-qa-checklist",
    "MRI Recovery Billing Error Checklist",
    "pdf",
    "mri-recovery-billing-qa-checklist.pdf",
    "checklist",
  ),
  "multi-state-cam-disclosure-matrix": asset(
    "multi-state-cam-disclosure-matrix",
    "Multi-State CAM Packet Review Checklist",
    "pdf",
    "multi-state-cam-disclosure-matrix.pdf",
    "checklist",
  ),
  "cam-recovery-ratio-worksheet": asset(
    "cam-recovery-ratio-worksheet",
    "CAM Recovery Ratio Benchmark Worksheet",
    "xlsx",
    "cam-recovery-ratio-worksheet.xlsx",
    "calculator",
  ),
  "property-tax-appeal-recovery-calculator": asset(
    "property-tax-appeal-recovery-calculator",
    "Property Tax Appeal Recovery Calculator",
    "xlsx",
    "property-tax-appeal-recovery-calculator.xlsx",
    "calculator",
  ),
  "tenant-dispute-response-letter-template": asset(
    "tenant-dispute-response-letter-template",
    "Tenant CAM Dispute Response Letter",
    "pdf",
    "tenant-dispute-response-letter-template.pdf",
    "template",
  ),
  "audit-defense-packet-builder": asset(
    "audit-defense-packet-builder",
    "Audit Defense Packet Builder",
    "pdf",
    "audit-defense-packet-builder.pdf",
    "template",
  ),
  "lease-clause-extraction-matrix": asset(
    "lease-clause-extraction-matrix",
    "Lease Clause Extraction Matrix",
    "xlsx",
    "lease-clause-extraction-matrix.xlsx",
    "template",
  ),
};

export function getLeadMagnetAsset(slug: string): LeadMagnetAsset | undefined {
  return leadMagnetAssets[slug];
}
