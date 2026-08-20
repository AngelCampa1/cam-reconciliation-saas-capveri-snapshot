import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import governance from "../../data/seo/indexed-page-governance.json";
import contentGovernance from "../../data/seo/content-governance.json";
import { resourcesMegamenuPillars } from "@/lib/seo/resources-megamenu";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const DOC_PATH = path.join(REPO_ROOT, "docs/marketing/funnel-system-map.md");
const PRODUCT_CONTEXT_PATH = path.join(
  REPO_ROOT,
  "docs/feature-inventory/product-marketing-context.md",
);

function readDoc(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

describe("funnel system map", () => {
  it("keeps the operator map present and tied to live governance files", () => {
    const doc = readDoc(DOC_PATH);

    for (const requiredPath of [
      "plan-tiers.json",
      "knowledge/source/product.ts",
      ".agents/product-marketing.md",
      "marketing/data/seo/indexed-page-governance.json",
      "marketing/data/seo/content-governance.json",
      "marketing/scripts/internal-link-registry.mjs",
      "marketing/src/app/sitemap.ts",
      "marketing/next.config.ts",
    ]) {
      expect(doc).toContain(requiredPath);
    }

    for (const stage of [
      "Traffic",
      "Education",
      "Fit",
      "Product proof",
      "Conversion",
      "Activation",
      "Retention",
    ]) {
      expect(doc).toContain(`| ${stage} |`);
    }
  });

  it("documents every Resources megamenu pillar and promoted route family", () => {
    const doc = readDoc(DOC_PATH);

    for (const pillar of resourcesMegamenuPillars) {
      expect(doc).toContain(pillar.href);
    }

    for (const promotedPath of governance.promotedPaths) {
      expect(doc).toContain(promotedPath);
    }

    for (const slug of contentGovernance.retainedSoftwareGuideSlugs) {
      expect(doc).toContain("software");
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("keeps the legacy product marketing context pointed at current sources", () => {
    const doc = readDoc(PRODUCT_CONTEXT_PATH);

    expect(doc).toContain("docs/business/canonical-gtm-source-of-truth.md");
    expect(doc).toContain(".agents/product-marketing.md");
    expect(doc).toContain("knowledge/source/product.ts");
    expect(doc).toContain("plan-tiers.json");
    expect(doc).toContain("docs/marketing/funnel-system-map.md");
    expect(doc).toContain("BOMA 2024 aligned workflows");
    expect(doc).not.toMatch(/\bBOMA 2024 compliant\b/i);
    expect(doc).not.toMatch(/\bBOMA compliant\b/i);
    expect(doc).not.toMatch(/\bStart Free Audit\b/i);
    expect(doc).not.toMatch(/\bAudit credits\b/i);
    expect(doc).not.toMatch(/\bcredit packs\b/i);
  });
});
