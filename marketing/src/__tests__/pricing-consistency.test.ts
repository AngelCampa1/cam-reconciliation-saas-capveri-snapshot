import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRICING_FAQS } from "@/data/pricing-faqs";
import { LANDING_FAQS } from "@/data/landing-faqs";
import { structuredDataSchemas } from "@/lib/structured-data";
import { LAUNCH_OFFER } from "@/config/launch-offer";

const SOURCE_FILES_TO_GUARD = [
  "public/llms.txt",
  "public/llms-full.txt",
  "public/pricing.md",
  "public/pricing.txt",
  "../docs/feature-inventory/product-marketing-context.md",
  "../generated/brochures/capveri-executive-brochure.html",
  "content/blog/property-management-accounting-software.mdx",
  "src/app/cam-reconciliation-software/page.tsx",
  "src/app/best/cam-reconciliation-software/page.tsx",
  "src/app/cam-audit-software/page.tsx",
  "src/app/commercial-lease-audit-software/page.tsx",
  "src/app/lease-abstraction/page.tsx",
  "src/app/yardi-cam-reconciliation/page.tsx",
  "src/app/mri-cam-reconciliation/page.tsx",
  "src/app/roi/page.tsx",
  "src/data/faq-data.tsx",
  "src/data/landing-faqs.ts",
  "src/data/pricing-faqs.ts",
  "data/alternatives.json",
  "data/comparisons.json",
  "data/integrations.json",
  "data/seo/llms-sections.json",
] as const;

const PUBLIC_MARKETING_CONTENT_DIRS = [
  "content/blog",
  "content/linkedin",
  "content/resources",
  "data",
  "public",
  "src/app",
] as const;

const PRICE_SURFACE_FILES_TO_GUARD = [
  ...SOURCE_FILES_TO_GUARD,
  "../docs/architecture/system-architecture.md",
  "../docs/feature-inventory/billing-subscriptions.md",
  "../docs/feature-inventory/marketing-site-tools.md",
  "../docs/guides/01-infrastructure/BILLING_FLOW_SUMMARY.md",
  "../docs/testing/BILLING_JOURNEY_TEST_REPORT.md",
  "../docs/testing/BILLING_TEST_QUICK_START.md",
  "../docs/testing/E2E_TEST_EXECUTION_TRACKER.md",
  // The docs/01-FEB-GTM-Tasks/ directory-listing drafts that used to be guarded
  // here were removed from the repository when its history was rewritten for
  // publication. Nothing publishes those surfaces any more, so there is no stale
  // price to guard against.
] as const;

const FORBIDDEN_PRICING_STRINGS = [
  "Growth subscription pricing",
  "CapVeri Growth plan",
  "Growth pricing",
  "$249/mo Growth",
  "Growth $249",
  "hybrid per-unit",
  "$2/month per additional",
  "From $249/mo",
  "self-serve subscription starts at $249/month",
  "Every pricing band includes all features",
  "Growth, Portfolio, and Enterprise",
  "Growth</strong>",
  'plan: "Growth"',
  'plan: "Portfolio"',
  "$249/month, 30-day free trial",
  "$149 per audit",
  "volume pricing at $119 and $99",
  "same speed, volume pricing",
  "$25-$50",
  "under $1,200/year",
  "$1.40+/unit",
  "$1.40/unit/mo",
] as const;

const STALE_SELF_SERVE_PRICE_PATTERNS = [
  /Reconcile (?:is|at|starts at|package -) \$1,398(?:\/|\.|,|\s)/i,
  /Control (?:is|at|starts at|package -) \$3,498(?:\/|\.|,|\s)/i,
  /Defend (?:is|at|starts at|package -) \$6,998(?:\/|\.|,|\s)/i,
  /Reconcile (?:is|at|starts at|package -) \$100(?:\/|\.|,|\s)/i,
  /Control (?:is|at|starts at|package -) \$250(?:\/|\.|,|\s)/i,
  /Defend (?:is|at|starts at|package -) \$500(?:\/|\.|,|\s)/i,
  /Reconcile (?:is|at|starts at|package -) \$199(?:\/|\.|,|\s)/i,
  /Control (?:is|at|starts at|package -) \$499(?:\/|\.|,|\s)/i,
  /Defend (?:is|at|starts at|package -) \$999(?:\/|\.|,|\s)/i,
  /self-serve (?:starts|packages from|packages start).*?\$100(?:\/|\.|,|\s)/i,
] as const;

const STALE_FRACTIONAL_CAPVERI_PRICE_PATTERNS = [
  /\$99\.50\/(?:mo|month)/i,
  /\$249\.50\/(?:mo|month)/i,
  /\$499\.50\/(?:mo|month)/i,
  /CapVeri'?s?\s+Growth plan/i,
  /Growth pricing/i,
  /\$2\s+per\s+unit\s+overage\s+applies\s+above/i,
  /\$2\/month\s+per\s+additional/i,
  /rounded up to whole-dollar monthly amounts/i,
  /No annual contract/i,
  /Monthly subscription/i,
] as const;

function readMarketingFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function collectPublicTextFiles(relativeDir: string): string[] {
  const dir = resolve(process.cwd(), relativeDir);
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") {
        return [];
      }
      return collectPublicTextFiles(relativePath);
    }

    if (/\.(?:md|mdx|json|txt|tsx?|html)$/i.test(entry.name)) {
      return [relativePath];
    }

    return [];
  });
}

describe("pricing consistency", () => {
  it("keeps public pricing surfaces aligned to generated package config", () => {
    const expected = [
      ["Reconcile", "$998/year"],
      ["list price", "$4,990/year"],
      ["26-150 units", "$179 per extra unit/year"],
    ] as const;

    const publicContent = [
      readMarketingFile("public/llms.txt"),
      readMarketingFile("public/llms-full.txt"),
      readMarketingFile("public/pricing.md"),
      readMarketingFile("public/pricing.txt"),
      JSON.stringify(PRICING_FAQS),
      JSON.stringify(LANDING_FAQS),
      readMarketingFile("src/data/faq-data.tsx"),
    ].join("\n");

    for (const [name, price] of expected) {
      expect(publicContent).toContain(name);
      expect(publicContent).toContain(price);
    }
    expect(publicContent).toContain(LAUNCH_OFFER.code);
  });

  it("does not reintroduce retired pricing models on guarded SEO pages", () => {
    const content = SOURCE_FILES_TO_GUARD.map(readMarketingFile).join("\n");

    for (const retired of FORBIDDEN_PRICING_STRINGS) {
      expect(content).not.toContain(retired);
    }
  });

  it("does not publish stale self-serve product prices on guarded public surfaces", () => {
    const content = SOURCE_FILES_TO_GUARD.map(readMarketingFile).join("\n");

    for (const pattern of STALE_SELF_SERVE_PRICE_PATTERNS) {
      expect(content).not.toMatch(pattern);
    }

    expect(content).toContain("$998");
    expect(content).toContain("$4,990");
    expect(content).toContain("$179 per extra unit/year");
  });

  // Walks the repository tree, so it runs well past vitest's 15s default
  // whenever the full suite saturates the machine. Given an explicit budget:
  // it passes in ~8s isolated and the work is genuinely filesystem-bound.
  it("does not publish retired fractional CapVeri limited offer pricing", () => {
    const files = new Set([
      ...PUBLIC_MARKETING_CONTENT_DIRS.flatMap(collectPublicTextFiles),
      ...PRICE_SURFACE_FILES_TO_GUARD,
    ]);
    const contentByFile = new Map(
      [...files].map((file) => [file, readMarketingFile(file)]),
    );
    const violations: string[] = [];

    for (const pattern of STALE_FRACTIONAL_CAPVERI_PRICE_PATTERNS) {
      for (const [file, content] of contentByFile) {
        if (pattern.test(content)) {
          violations.push(`${file}: ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  }, 60_000);

  it("keeps structured data offer prices aligned to plan tiers", () => {
    const offers = structuredDataSchemas.softwareApplication.offers;
    const fixedTierPrices = ["998.00"];

    for (const price of fixedTierPrices) {
      expect(
        offers.some((offer) => "price" in offer && offer.price === price),
      ).toBe(true);
    }
  });
});
