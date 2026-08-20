import type {
  ContentAudience,
  ContentTag,
  FunnelStage,
} from "@/lib/content/types";

export interface ContextualLink {
  href: string;
  label: string;
}

interface BuildContextualLinksInput {
  currentPath: string;
  funnelStage?: FunnelStage;
  audience?: ContentAudience;
  tags?: ContentTag[];
  limit?: number;
}

const BASE_LINKS: Record<FunnelStage, ContextualLink[]> = {
  tofu: [
    { href: "/cam-reconciliation-guide", label: "CAM Reconciliation Guide" },
    {
      href: "/resources/common-area-maintenance-reconciliation-explained",
      label: "What Is CAM Reconciliation?",
    },
    { href: "/glossary", label: "CAM Glossary" },
    { href: "/tools", label: "CAM Tools" },
  ],
  mofu: [
    {
      href: "/tools/cam-billing-error-estimator",
      label: "CAM Billing Error Estimator",
    },
    {
      href: "/tools/cam-reconciliation-template",
      label: "CAM Reconciliation Template",
    },
    {
      href: "/resources/cam-pre-send-packet-checklist",
      label: "CAM Pre-Send Checklist",
    },
    { href: "/resources/software", label: "Software Setup Guides" },
  ],
  bofu: [
    {
      href: "/cam-reconciliation-software",
      label: "CAM Reconciliation Software",
    },
    { href: "/pricing", label: "Pricing" },
    { href: "/product-tour", label: "Product Tour" },
    { href: "/sample-report", label: "Sample Report" },
  ],
};

const TAG_LINKS: Partial<Record<ContentTag, ContextualLink[]>> = {
  "gross-up": [
    {
      href: "/tools/cam-gross-up-calculator",
      label: "CAM Gross-Up Calculator",
    },
    {
      href: "/resources/cam-gross-up-calculation-guide",
      label: "Gross-Up Calculation Guide",
    },
  ],
  "pro-rata": [
    { href: "/tools/pro-rata-calculator", label: "Pro-Rata Calculator" },
    {
      href: "/resources/pro-rata-share-calculation",
      label: "Pro-Rata Share Guide",
    },
  ],
  "cap-math": [
    { href: "/tools/cam-cap-calculator", label: "CAM Cap Calculator" },
    { href: "/resources/cam-expense-caps", label: "CAM Expense Caps" },
  ],
  yardi: [
    {
      href: "/resources/software/yardi-voyager/cam-setup",
      label: "Yardi CAM Setup Guide",
    },
    { href: "/vs/yardi", label: "CapVeri vs Yardi" },
  ],
  mri: [
    {
      href: "/resources/software/mri-software/cam-setup",
      label: "MRI CAM Setup Guide",
    },
    { href: "/vs/mri", label: "CapVeri vs MRI" },
  ],
  appfolio: [{ href: "/vs/appfolio", label: "CapVeri vs AppFolio" }],
  realpage: [
    {
      href: "/resources/export-cam-realpage",
      label: "Export CAM from RealPage",
    },
  ],
  "boma-2024": [
    { href: "/resources/boma", label: "BOMA Standards" },
    { href: "/tools/boma-2024-calculator", label: "BOMA 2024 Calculator" },
  ],
  compliance: [
    { href: "/resources/states", label: "State CAM Compliance" },
    { href: "/tools/sb-1103-checker", label: "SB 1103 Checker" },
  ],
  "tenant-audit": [
    {
      href: "/resources/tenant-audit-rights-landlord",
      label: "Tenant Audit Rights",
    },
    { href: "/cam-audit", label: "CAM Audit Guide" },
  ],
  texas: [
    { href: "/resources/texas-cam-compliance", label: "Texas CAM Compliance" },
    { href: "/tools/hcad-tax-normalizer", label: "HCAD Tax Normalizer" },
  ],
  california: [
    { href: "/resources/sb-1103-compliance", label: "SB 1103 Compliance" },
    { href: "/tools/sb-1103-checker", label: "SB 1103 Checker" },
  ],
  "base-year": [
    { href: "/tools/base-year-escalation", label: "Base Year Escalation Tool" },
    {
      href: "/resources/base-year-expense-stop",
      label: "Base Year Expense Stop Guide",
    },
  ],
  "management-fee": [
    { href: "/tools/admin-fee-calculator", label: "Admin Fee Calculator" },
    {
      href: "/resources/expenses/administrative-overhead",
      label: "Administrative Overhead Guide",
    },
  ],
  "gl-export": [
    { href: "/resources/export-guide", label: "CAM Export Guide" },
    { href: "/resources/gl-coding-guide", label: "GL Coding Guide" },
  ],
  occupancy: [
    {
      href: "/resources/vacancy-cost-allocation",
      label: "Vacancy Cost Allocation",
    },
    {
      href: "/tools/cam-gross-up-calculator",
      label: "CAM Gross-Up Calculator",
    },
  ],
  vacancy: [
    {
      href: "/resources/vacancy-cost-allocation",
      label: "Vacancy Cost Allocation",
    },
    {
      href: "/tools/cam-billing-error-estimator",
      label: "CAM Billing Error Estimator",
    },
  ],
  industrial: [
    {
      href: "/resources/cam-reconciliation-industrial",
      label: "Industrial CAM Reconciliation",
    },
    {
      href: "/resources/property-types/flex-industrial/cam-guide",
      label: "Flex Industrial CAM Guide",
    },
  ],
  retail: [
    {
      href: "/resources/cam-charges-retail-lease-guide",
      label: "Retail CAM Charges",
    },
    {
      href: "/resources/property-types/neighborhood-retail/cam-guide",
      label: "Retail CAM Guide",
    },
  ],
};

const AUDIENCE_LINKS: Partial<Record<ContentAudience, ContextualLink[]>> = {
  tenant: [{ href: "/cam-audit", label: "CAM Audit Guide" }],
  mixed: [
    { href: "/cam-audit", label: "CAM Audit Guide" },
    {
      href: "/cam-reconciliation-software",
      label: "CAM Reconciliation Software",
    },
  ],
  landlord: [
    {
      href: "/cam-reconciliation-software",
      label: "CAM Reconciliation Software",
    },
  ],
};

export function buildContextualLinks({
  currentPath,
  funnelStage = "mofu",
  audience = "landlord",
  tags = [],
  limit = 8,
}: BuildContextualLinksInput): ContextualLink[] {
  const candidates = [
    ...tags.flatMap((tag) => TAG_LINKS[tag] ?? []),
    ...(AUDIENCE_LINKS[audience] ?? []),
    ...BASE_LINKS[funnelStage],
    ...BASE_LINKS.bofu,
  ];

  const seen = new Set<string>([currentPath]);
  const links: ContextualLink[] = [];

  for (const link of candidates) {
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    links.push(link);
    if (links.length >= limit) break;
  }

  return links;
}
