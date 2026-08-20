import type { ExitIntentLeadMagnet } from "@/lib/lead-magnets/exit-intent";
import { getLeadMagnetName } from "@/lib/lead-magnets/registry";

interface PoolEntry {
  format: "PDF" | "XLSX";
  promise: string;
}

/**
 * Eligible exit-intent resources. Every slug here is a deliverable file
 * (pdf or xlsx) that exists in the lead-magnet registry. Calculator-unlock
 * magnets are intentionally excluded because they are not emailable files.
 */
const POOL: Record<string, PoolEntry> = {
  "cam-reconciliation-checklist": {
    format: "PDF",
    promise:
      "A quick checklist to catch CAM mistakes before you send the bill.",
  },
  "cam-gross-up-calculator": {
    format: "XLSX",
    promise: "Test your gross-up math before tenants ever see it.",
  },
  "lease-abstract-matrix": {
    format: "XLSX",
    promise: "Spot where your lease terms and your billing do not match.",
  },
  "yardi-export-qa-checklist": {
    format: "PDF",
    promise: "Check your Yardi export for errors before you reconcile.",
  },
  "mri-recovery-billing-qa-checklist": {
    format: "PDF",
    promise: "Check your MRI recovery billing for errors before you send it.",
  },
  "cam-cap-calculator": {
    format: "XLSX",
    promise: "See how CAM caps change the bill or credit amount.",
  },
  "cam-dispute-response-template": {
    format: "PDF",
    promise: "A ready reply for when a tenant pushes back on a CAM bill.",
  },
  "boma-remeasurement-impact": {
    format: "XLSX",
    promise: "See how a BOMA remeasure changes each tenant's share.",
  },
  "audit-risk-scorecard": {
    format: "PDF",
    promise: "Score where your CAM files are most likely to draw an audit.",
  },
  "property-tax-appeal-recovery-calculator": {
    format: "XLSX",
    promise: "See how a property tax appeal changes what you can bill back.",
  },
  "cam-estimate-forecaster": {
    format: "XLSX",
    promise: "Plan next year's CAM estimates from this year's numbers.",
  },
  "cam-reconciliation-california": {
    format: "PDF",
    promise: "A CAM reconciliation template built for California rules.",
  },
  "cam-reconciliation-texas": {
    format: "PDF",
    promise: "A CAM reconciliation template built for Texas rules.",
  },
  "cam-reconciliation-florida": {
    format: "PDF",
    promise: "A CAM reconciliation template built for Florida rules.",
  },
  "nnn-lease-cam-reconciliation": {
    format: "PDF",
    promise: "A CAM reconciliation template made for NNN leases.",
  },
};

/**
 * Ordered match rules. The first rule whose substring appears in the
 * lowercased pathname wins and sets the page-tailored primary resource.
 */
const SELECTION_RULES: ReadonlyArray<{ match: string; slug: string }> = [
  { match: "yardi", slug: "yardi-export-qa-checklist" },
  { match: "mri", slug: "mri-recovery-billing-qa-checklist" },
  { match: "gross-up", slug: "cam-gross-up-calculator" },
  { match: "lease-abstract", slug: "lease-abstract-matrix" },
  { match: "lease-abstraction", slug: "lease-abstract-matrix" },
  { match: "lease-clause", slug: "lease-abstract-matrix" },
  { match: "dispute", slug: "cam-dispute-response-template" },
  { match: "boma", slug: "boma-remeasurement-impact" },
  { match: "california", slug: "cam-reconciliation-california" },
  { match: "texas", slug: "cam-reconciliation-texas" },
  { match: "florida", slug: "cam-reconciliation-florida" },
  { match: "nnn", slug: "nnn-lease-cam-reconciliation" },
  { match: "tax", slug: "property-tax-appeal-recovery-calculator" },
  { match: "estimate", slug: "cam-estimate-forecaster" },
  { match: "forecast", slug: "cam-estimate-forecaster" },
  { match: "cap", slug: "cam-cap-calculator" },
  { match: "audit", slug: "audit-risk-scorecard" },
  { match: "cam-reconciliation", slug: "cam-reconciliation-checklist" },
  { match: "reconciliation", slug: "cam-reconciliation-checklist" },
];

const DEFAULT_PRIMARY_SLUG = "cam-reconciliation-checklist";

/**
 * Default alternatives, in priority order. Used to fill the two non-primary
 * slots without ever duplicating the primary.
 */
const DEFAULT_ALTERNATIVE_SLUGS: ReadonlyArray<string> = [
  "cam-reconciliation-checklist",
  "cam-gross-up-calculator",
  "lease-abstract-matrix",
];

function toLeadMagnet(slug: string): ExitIntentLeadMagnet {
  const entry = POOL[slug];
  if (!entry) {
    throw new Error(`No exit-intent pool entry for slug: ${slug}`);
  }
  return {
    slug,
    name: getLeadMagnetName(slug),
    format: entry.format,
    promise: entry.promise,
  };
}

function selectPrimarySlug(pathname: string): string {
  const lowered = pathname.toLowerCase();
  for (const rule of SELECTION_RULES) {
    if (lowered.includes(rule.match)) {
      return rule.slug;
    }
  }
  return DEFAULT_PRIMARY_SLUG;
}

/**
 * Returns exactly three resources for the exit-intent popup: the page-tailored
 * primary first, followed by two distinct alternatives. Deterministic.
 */
export function getExitIntentLeadMagnets(
  pathname: string,
): ExitIntentLeadMagnet[] {
  const primarySlug = selectPrimarySlug(pathname);
  const slugs: string[] = [primarySlug];

  for (const slug of DEFAULT_ALTERNATIVE_SLUGS) {
    if (slugs.length >= 3) break;
    if (!slugs.includes(slug)) {
      slugs.push(slug);
    }
  }

  // Backfill from the rest of the pool if the default set collided with the
  // primary and left fewer than three distinct slugs.
  for (const slug of Object.keys(POOL)) {
    if (slugs.length >= 3) break;
    if (!slugs.includes(slug)) {
      slugs.push(slug);
    }
  }

  return slugs.map(toLeadMagnet);
}
