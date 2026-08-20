import { readFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { describe, expect, it } from "vitest";
import governance from "../../../data/seo/content-governance.json";
import indexedGovernance from "../../../data/seo/indexed-page-governance.json";
import llmsSections from "../../../data/seo/llms-sections.json";
import { publicKnowledge } from "../../generated/public-knowledge";

function readLlmsFullTxt(): string {
  const filePath = join(process.cwd(), "public", "llms-full.txt");
  return readFileSync(filePath, "utf-8");
}

function readLlmsTxt(): string {
  const filePath = join(process.cwd(), "public", "llms.txt");
  return readFileSync(filePath, "utf-8");
}

function readPricingMd(): string {
  const filePath = join(process.cwd(), "public", "pricing.md");
  return readFileSync(filePath, "utf-8");
}

function readPricingTxt(): string {
  const filePath = join(process.cwd(), "public", "pricing.txt");
  return readFileSync(filePath, "utf-8");
}

function extractUrls(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s)]+/g;
  return content.match(urlRegex) ?? [];
}

const REQUIRED_SECTIONS = [
  "## Core Product",
  "## Product Features",
  "## Educational Resources",
  "## Free Tools",
  "## Key Pages",
];

const allSectionEntries = Object.values(llmsSections).flat();
const llmsPaths = allSectionEntries.map((entry) => entry.path);
const PROJECT_ROOT = process.cwd();
const APP_DIR = join(PROJECT_ROOT, "src/app");

function getStaticCanonicalToolRoutes(): string[] {
  const toolsDir = join(APP_DIR, "tools");
  return readFileSync(join(toolsDir, "page.tsx"), "utf-8")
    .match(/href: "([^"]+)"/g)!
    .map((match) => match.replace(/^href: "|",?$/g, ""))
    .filter((href) => href.startsWith("/tools/"))
    .sort();
}

function getProductFeatureRoutes(): string[] {
  return [
    "/product/features",
    ...publicKnowledge.productFeatures.map(
      (feature) => `/product/features/${feature.key}`,
    ),
  ].sort();
}

describe("llms.txt", () => {
  it("matches the deterministic generator output", () => {
    expect(() =>
      execFileSync("node", ["scripts/generate-llms.mjs", "--check"], {
        cwd: process.cwd(),
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it("contains no broken /resources/ URLs for migrated blog slugs", () => {
    const content = readLlmsTxt();
    for (const slug of [
      "cam-reconciliation-errors",
      "cam-overbilling-liability",
      "cam-reconciliation-too-slow",
      "cam-numbers-not-matching-yardi",
      "cam-demand-letter",
      "boma-2024-changes",
      "cam-reconciliation-deadlines",
      "cam-reconciliation-audit-trail",
    ]) {
      expect(
        content,
        `llms.txt references old /resources/${slug} path - should be /blog/${slug}`,
      ).not.toContain(`/resources/${slug}`);
    }
  });

  it("contains all required sections", () => {
    const content = readLlmsTxt();
    for (const section of REQUIRED_SECTIONS) {
      expect(content, `Missing section: ${section}`).toContain(section);
    }
  });

  it("includes every curated llms registry path", () => {
    const content = readLlmsTxt();
    for (const page of llmsPaths) {
      expect(content, `Missing registry path: ${page}`).toContain(page);
    }
  });

  it("does not point AI crawlers at redirected or noindex paths", () => {
    const blockedPaths = [
      "/resources/cam-presend-checklist",
      "/resources/state-by-state-cam-disclosure",
      "/resources/tenant-auditor-guide",
      "/docs",
      "/help",
      "/sources",
    ];

    for (const blockedPath of blockedPaths) {
      expect(
        llmsPaths,
        `LLM registry should not include ${blockedPath}`,
      ).not.toContain(blockedPath);
      expect(readLlmsTxt()).not.toContain(
        `https://www.capveri.com${blockedPath}`,
      );
    }
  });

  it("includes every tool promoted on the tools hub", () => {
    const content = readLlmsTxt();
    for (const route of getStaticCanonicalToolRoutes()) {
      expect(content, `Missing tool route from llms.txt: ${route}`).toContain(
        route,
      );
    }
  });

  it("includes every indexed product feature route", () => {
    const content = readLlmsTxt();
    for (const route of getProductFeatureRoutes()) {
      expect(
        content,
        `Missing product feature route from llms.txt: ${route}`,
      ).toContain(route);
    }
  });

  it("includes retained comparison priorities", () => {
    const content = readLlmsTxt();
    for (const slug of governance.retainedComparisonSlugs) {
      expect(content).toContain(`/vs/${slug}`);
    }
  });

  it("promotes the governed commercial and proof paths", () => {
    const content = readLlmsTxt();
    for (const page of indexedGovernance.promotedPaths) {
      expect(content).toContain(page);
    }
  });

  it("has a minimum number of URLs (sanity check)", () => {
    const content = readLlmsTxt();
    const urls = extractUrls(content);
    expect(urls.length).toBeGreaterThanOrEqual(llmsPaths.length);
  });

  it("all URLs use the correct production domain", () => {
    const content = readLlmsTxt();
    const urls = extractUrls(content);
    const capveriUrls = urls.filter((url) => url.includes("capveri.com"));
    expect(capveriUrls.length).toBeGreaterThan(0);
    for (const url of capveriUrls) {
      expect(url, `URL uses wrong domain: ${url}`).toMatch(
        /^https:\/\/www\.capveri\.com\//,
      );
    }
  });

  it("contains current Reconcile unit-based pricing", () => {
    const content = readLlmsTxt();
    expect(content).toContain("Current Reconcile pricing");
    expect(content).toContain("current Reconcile unit-based pricing");
    expect(content).toContain("/pricing.md");
    expect(content).toContain("80% off the first year");
    expect(content).not.toContain("redemptions only");
    expect(content).not.toContain("$2/month per additional unit");
    expect(content).not.toContain("hybrid per-unit");
  });

  it("contains Last updated header", () => {
    const content = readLlmsTxt();
    expect(content).toContain(
      `Last updated: ${publicKnowledge.pricing.lastUpdated}`,
    );
  });
});

describe("llms-full.txt", () => {
  it("exists and has substantial content", () => {
    const content = readLlmsFullTxt();
    expect(content.length).toBeGreaterThan(1000);
  });

  it("contains key CAM glossary terms", () => {
    const content = readLlmsFullTxt();
    expect(content).toContain("gross-up");
    expect(content).toContain("pro-rata");
    expect(content).toContain("CAM cap");
  });

  it("contains Last updated header", () => {
    const content = readLlmsFullTxt();
    expect(content).toContain(
      `Last updated: ${publicKnowledge.pricing.lastUpdated}`,
    );
  });

  it("contains current Reconcile unit-based pricing and not old per-audit pricing", () => {
    const content = readLlmsFullTxt();
    expect(content).toContain("$998/year");
    expect(content).toContain("$4,990/year");
    expect(content).toContain("80% off the first year");
    expect(content).not.toContain("redemptions only");
    expect(content).not.toContain("$699/audit");
    expect(content).not.toContain("$599/audit");
    expect(content).not.toContain("$499/audit");
    expect(content).not.toContain("$2/month per additional");
    expect(content).not.toContain("hybrid per-unit");
  });
});

describe("machine-readable pricing files", () => {
  it("exposes current Reconcile pricing in markdown and text formats", () => {
    for (const content of [readPricingMd(), readPricingTxt()]) {
      expect(content).toContain(
        `Last updated: ${publicKnowledge.pricing.lastUpdated}`,
      );
      expect(content).toContain("Reconcile");
      expect(content).toContain("$998/year");
      expect(content).toContain("$4,990/year");
      expect(content).toContain("80% off the first year");
      expect(content).not.toContain("redemptions only");
      expect(content).toContain("26-150 units");
      expect(content).not.toContain("$2/month per additional");
      expect(content).not.toContain("Growth");
    }
  });
});
