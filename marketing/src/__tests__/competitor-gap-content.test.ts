import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import alternativesData from "../../data/alternatives.json";
import comparisonsData from "../../data/comparisons.json";
import switchData from "../../data/switch.json";

function stringify(value: unknown): string {
  return JSON.stringify(value);
}

function readMarketingFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("competitor gap content", () => {
  it("uses current package pricing in competitor content", () => {
    const content = [
      stringify(alternativesData),
      stringify(comparisonsData),
      stringify(switchData),
    ].join("\n");

    expect(content).not.toContain("$249/mo Growth");
    expect(content).not.toContain("Growth $249/mo");
    expect(content).not.toContain("from $249/month");
    expect(content).not.toContain("Annual self-serve pricing from $1,398/year");
    expect(content).toContain("{{pricing.selfServeSummary}}");
    expect(content).toContain("{{pricing.launchOfferTerms}}");
    expect(content).toContain("{{pricing.trialCopy}}");
  });

  it("covers RealPage as a first-class alternatives page", () => {
    const realPage = alternativesData.alternatives.find(
      (item) => item.slug === "realpage",
    );

    expect(realPage?.competitorName).toBe("RealPage Commercial");
    expect(realPage?.whySwitch.map((item) => item.title)).toContain(
      "Support handoffs and full-suite complexity",
    );
    expect(realPage?.capveriPitch.paragraphs.join(" ")).toContain(
      "independent verification layer",
    );
  });

  it("adds ERP switch guides for the highest-priority competitors", () => {
    const switchSlugs = switchData.guides.map((guide) => guide.slug);

    expect(switchSlugs).toEqual(
      expect.arrayContaining(["yardi", "mri", "appfolio"]),
    );
  });

  it("positions CapVeri as the winner on broader landlord-side comparison surfaces", () => {
    const content = [
      stringify(alternativesData),
      readMarketingFile("src/app/best/cam-reconciliation-software/page.tsx"),
      readMarketingFile("src/app/cam-reconciliation-software/page.tsx"),
      readMarketingFile(
        "content/blog/cam-reconciliation-software-comparison-2026.mdx",
      ),
      readMarketingFile("content/resources/cam-software-comparison-hub.mdx"),
    ].join("\n");

    expect(content).toMatch(/CapVeri[^.]{0,120}(winner|recommended choice)/i);
    expect(content).toMatch(/landlord-side CAM reconciliation verification/i);
    expect(content).toMatch(/deterministic gross-up\/cap math/i);
    expect(content).toMatch(/CSV setup/i);
    expect(content).toMatch(/audit trail/i);
    expect(content).toMatch(/dispute readiness/i);
  });

  it("does not publish stale per-audit or audit-credit pricing on broader comparison surfaces", () => {
    const content = [
      stringify(alternativesData),
      readMarketingFile("src/app/best/cam-reconciliation-software/page.tsx"),
      readMarketingFile("src/app/cam-reconciliation-software/page.tsx"),
      readMarketingFile(
        "content/blog/cam-reconciliation-software-comparison-2026.mdx",
      ),
      readMarketingFile("content/resources/cam-software-comparison-hub.mdx"),
    ].join("\n");

    expect(content).not.toMatch(/\$499(?:–|-)\$699/);
    expect(content).not.toMatch(/per-audit pricing/i);
    expect(content).not.toMatch(/audit credit/i);
    expect(content).not.toContain("$149 per audit");
  });
});
