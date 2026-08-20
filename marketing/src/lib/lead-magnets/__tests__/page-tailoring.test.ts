import { describe, expect, it } from "vitest";
import { getExitIntentLeadMagnets } from "@/lib/lead-magnets/page-tailoring";
import { LEAD_MAGNETS } from "@/lib/lead-magnets/registry";

const FORMAT_BY_SLUG = new Map<string, string>(
  LEAD_MAGNETS.map((entry) => [entry.slug, entry.format]),
);

const CLUSTER_CASES: ReadonlyArray<{ pathname: string; primary: string }> = [
  { pathname: "/integrations/yardi", primary: "yardi-export-qa-checklist" },
  {
    pathname: "/integrations/mri",
    primary: "mri-recovery-billing-qa-checklist",
  },
  { pathname: "/guides/cam-gross-up", primary: "cam-gross-up-calculator" },
  { pathname: "/tools/lease-abstract", primary: "lease-abstract-matrix" },
  { pathname: "/guides/lease-abstraction", primary: "lease-abstract-matrix" },
  { pathname: "/guides/lease-clause", primary: "lease-abstract-matrix" },
  { pathname: "/cam-dispute-help", primary: "cam-dispute-response-template" },
  { pathname: "/guides/boma-2024", primary: "boma-remeasurement-impact" },
  { pathname: "/cam/california", primary: "cam-reconciliation-california" },
  { pathname: "/cam/texas", primary: "cam-reconciliation-texas" },
  { pathname: "/cam/florida", primary: "cam-reconciliation-florida" },
  { pathname: "/nnn-leases", primary: "nnn-lease-cam-reconciliation" },
  {
    pathname: "/property-tax-recovery",
    primary: "property-tax-appeal-recovery-calculator",
  },
  { pathname: "/cam-estimate-guide", primary: "cam-estimate-forecaster" },
  { pathname: "/cam-forecast", primary: "cam-estimate-forecaster" },
  { pathname: "/cam-cap-guide", primary: "cam-cap-calculator" },
  { pathname: "/cam-audit-risk", primary: "audit-risk-scorecard" },
  { pathname: "/cam-reconciliation", primary: "cam-reconciliation-checklist" },
  { pathname: "/reconciliation-tips", primary: "cam-reconciliation-checklist" },
];

describe("getExitIntentLeadMagnets", () => {
  it.each(CLUSTER_CASES)(
    "maps $pathname to primary $primary",
    ({ pathname, primary }) => {
      const result = getExitIntentLeadMagnets(pathname);
      expect(result[0].slug).toBe(primary);
    },
  );

  it("falls back to the reconciliation checklist for unmatched paths", () => {
    expect(getExitIntentLeadMagnets("/about-us")[0].slug).toBe(
      "cam-reconciliation-checklist",
    );
    expect(getExitIntentLeadMagnets("/")[0].slug).toBe(
      "cam-reconciliation-checklist",
    );
  });

  it("matches earlier rules first (ordered substring)", () => {
    // "/yardi-cap-audit" contains yardi, cap, and audit; yardi wins.
    expect(getExitIntentLeadMagnets("/yardi-cap-audit")[0].slug).toBe(
      "yardi-export-qa-checklist",
    );
  });

  it("is case-insensitive on the pathname", () => {
    expect(getExitIntentLeadMagnets("/Integrations/YARDI")[0].slug).toBe(
      "yardi-export-qa-checklist",
    );
  });

  const SAMPLE_PATHS = [
    ...CLUSTER_CASES.map((c) => c.pathname),
    "/",
    "/about-us",
    "/pricing",
  ];

  it.each(SAMPLE_PATHS)(
    "returns exactly 3 distinct slugs with primary first for %s",
    (pathname) => {
      const result = getExitIntentLeadMagnets(pathname);
      expect(result).toHaveLength(3);

      const slugs = result.map((r) => r.slug);
      expect(new Set(slugs).size).toBe(3);

      const primary = getExitIntentLeadMagnets(pathname)[0].slug;
      expect(slugs[0]).toBe(primary);

      // Alternatives never duplicate the primary.
      expect(slugs.slice(1)).not.toContain(slugs[0]);
    },
  );

  it.each(SAMPLE_PATHS)(
    "only returns deliverable pdf/xlsx files for %s",
    (pathname) => {
      for (const resource of getExitIntentLeadMagnets(pathname)) {
        const registryFormat = FORMAT_BY_SLUG.get(resource.slug);
        expect(registryFormat).toBeDefined();
        expect(["pdf", "xlsx"]).toContain(registryFormat);
        expect(["PDF", "XLSX"]).toContain(resource.format);
      }
    },
  );

  it("is deterministic across calls", () => {
    expect(getExitIntentLeadMagnets("/integrations/yardi")).toEqual(
      getExitIntentLeadMagnets("/integrations/yardi"),
    );
  });
});
