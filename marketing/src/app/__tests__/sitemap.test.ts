import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import sitemap from "../sitemap";
import {
  getAllBomaTopics,
  getAllExpenseCategories,
  getAllLeaseClauses,
  getDataFileLastUpdated,
} from "@/lib/content/pseo-data";
import { DEMOTED_BLOG_SLUGS } from "@/lib/seo/content-governance";
import { PROMOTED_INDEX_PATHS } from "@/lib/seo/indexed-page-governance";
import { LAST_MODIFIED_BY_ROUTE } from "@/lib/seo/sitemap-dates";

const EXPECTED_STATIC_PATHS = [
  "/",
  "/pricing",
  "/tools",
  "/tools/boma-2024-calculator",
  "/tools/cam-billing-error-estimator",
  "/tools/noi-impact-calculator",
  "/tools/audit-risk-quiz",
  "/tools/cam-gross-up-calculator",
  "/tools/lease-abstract-matrix",
  "/tools/hcad-tax-normalizer",
  "/tools/cumulative-cap-bank-calculator",
  "/tools/cam-recovery-ratio-worksheet",
  "/tools/yardi-export-qa-checklist",
  "/tools/mri-recovery-billing-qa-checklist",
  "/tools/audit-defense-packet-builder",
  "/tools/cam-pre-send-packet-checklist-download",
  "/tools/tenant-dispute-response-letter-template",
  "/tools/multi-state-cam-disclosure-matrix",
  "/tools/property-tax-appeal-recovery-calculator",
  "/tools/lease-clause-extraction-matrix",
  "/resources",
  "/resources/cam-guides",
  "/resources/tools-calculators",
  "/resources/compliance-leases",
  "/resources/solutions",
  "/resources/blog-research",
  "/resources/states",
  "/resources/markets",
  "/resources/property-types",
  "/resources/roles",
  "/resources/workflows",
  "/blog",
  "/alternatives",
  "/integrations",
  "/solutions",
  "/switch",
  "/vs",
  "/vs/yardi",
  "/vs/mri",
  "/vs/appfolio",
  "/vs/buildium",
  "/vs/sage-intacct",
  "/vs/realpage",
  "/glossary",
  "/about",
  "/contact",
  "/roi",
  "/product-tour",
  "/product/features",
  "/best/cam-reconciliation-software",
  "/sample-report",
  "/privacy",
  "/terms",
  "/cookies",
] as const;

const EXPECTED_RESOURCE_PATHS = [
  "/resources/cam-pre-send-packet-checklist",
  "/resources/tenant-cam-audit-landlord-side",
  "/resources/gl-coding-guide",
  "/resources/export-guide",
  "/resources/harris-county-gross-up",
  "/resources/sb-1103-compliance",
  "/resources/deterministic-vs-ai-cam",
  "/resources/tenant-cam-dispute",
] as const;

const EXPECTED_BLOG_PATHS = [
  "/blog/boma-2024-changes",
  "/blog/cam-reconciliation-errors",
] as const;

const AI_PUBLIC_ASSET_PATHS = [
  "/llms.txt",
  "/llms-full.txt",
  "/pricing.md",
  "/pricing.txt",
] as const;

const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const APP_DIR = path.join(PROJECT_ROOT, "src/app");
const registry = await import("../../../scripts/internal-link-registry.mjs");

function getStaticCanonicalToolRoutes(): string[] {
  const toolsDir = path.join(APP_DIR, "tools");
  return fs
    .readdirSync(toolsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !entry.name.includes("["))
    .map((entry) => {
      const pagePath = path.join(toolsDir, entry.name, "page.tsx");
      return { pagePath, route: `/tools/${entry.name}` };
    })
    .filter(({ pagePath }) => fs.existsSync(pagePath))
    .filter(({ pagePath }) => {
      const source = fs.readFileSync(pagePath, "utf8");
      return (
        source.includes("canonical") &&
        !/robots\s*:\s*\{[\s\S]{0,120}index\s*:\s*false/.test(source)
      );
    })
    .map(({ route }) => route)
    .sort();
}

describe("sitemap metadata route", () => {
  it("includes all indexable marketing pages and excludes non-indexable routes", async () => {
    const entries = await sitemap();
    const paths = entries.map((entry) => new URL(entry.url).pathname);

    for (const expected of EXPECTED_STATIC_PATHS) {
      expect(paths).toContain(expected);
    }

    for (const expected of EXPECTED_RESOURCE_PATHS) {
      expect(paths).toContain(expected);
    }

    for (const expected of EXPECTED_BLOG_PATHS) {
      expect(paths).toContain(expected);
    }

    for (const promotedPath of PROMOTED_INDEX_PATHS) {
      expect(paths).toContain(promotedPath);
    }

    for (const slug of DEMOTED_BLOG_SLUGS) {
      expect(paths).not.toContain(`/blog/${slug}`);
    }

    expect(paths).toContain("/tools/noi-impact-calculator");
    expect(paths).not.toContain("/sources");
    expect(paths).not.toContain("/docs");
    expect(paths).not.toContain("/help");
    expect(paths).not.toContain("/resources/cam-presend-checklist");
    expect(paths).not.toContain("/resources/state-by-state-cam-disclosure");
    expect(paths).not.toContain("/resources/tenant-auditor-guide");
    expect(paths).not.toContain("/unsubscribe");
    expect(paths).not.toContain("/blog/category/cam-errors");
    expect(paths).not.toContain("/checkout");
    expect(paths).not.toContain("/checkout/success");
    expect(paths).not.toContain("/tools/[slug]/thank-you");

    for (const assetPath of AI_PUBLIC_ASSET_PATHS) {
      expect(paths).toContain(assetPath);
    }
  });

  it("includes only explicitly allowlisted public AI text assets", async () => {
    const entries = await sitemap();
    const publicTextAssetPaths = entries
      .map((entry) => new URL(entry.url).pathname)
      .filter((path) => /\.(md|txt)$/i.test(path));

    expect(publicTextAssetPaths.sort()).toEqual(
      [...AI_PUBLIC_ASSET_PATHS].sort(),
    );
  });

  it("includes every static canonical indexable tool route", async () => {
    const entries = await sitemap();
    const paths = entries.map((entry) => new URL(entry.url).pathname);

    for (const route of getStaticCanonicalToolRoutes()) {
      expect(paths, `Missing static canonical tool route: ${route}`).toContain(
        route,
      );
    }
  });

  it("matches the internal link registry indexable route set", async () => {
    const entries = await sitemap();
    const sitemapPaths = new Set(
      entries.map((entry) => new URL(entry.url).pathname),
    );
    const indexableRoutes = registry.buildIndexableRouteSet(
      registry.buildValidRouteSet(),
    );

    const missingFromSitemap = [...indexableRoutes]
      .filter((route) => !sitemapPaths.has(route))
      .sort();
    const extraInSitemap = [...sitemapPaths]
      .filter((route) => !indexableRoutes.has(route))
      .filter((route) => !AI_PUBLIC_ASSET_PATHS.includes(route as never))
      .sort();

    expect(missingFromSitemap).toEqual([]);
    expect(extraInSitemap).toEqual([]);
  });

  it("uses canonical absolute URLs and unique paths", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    const paths = urls.map((url) => new URL(url).pathname);

    for (const url of urls) {
      expect(url.startsWith("https://www.capveri.com/")).toBe(true);
    }

    expect(new Set(paths).size).toBe(paths.length);
  });

  it("preserves explicit metadata when static route discovery finds duplicate paths", async () => {
    const entries = await sitemap();
    const byPath = new Map(
      entries.map((entry) => [new URL(entry.url).pathname, entry]),
    );

    expect(byPath.get("/resources/boma")).toMatchObject({
      changeFrequency: "monthly",
      priority: 0.8,
    });
    expect(byPath.get("/resources/cam-guides")).toMatchObject({
      changeFrequency: "weekly",
      priority: 0.8,
    });
  });

  it("assigns a non-trivial positive priority to every /resources/* article page", async () => {
    const entries = await sitemap();
    const resourceArticles = entries.filter((entry) => {
      const path = new URL(entry.url).pathname;
      return path.startsWith("/resources/") && path !== "/resources";
    });

    expect(resourceArticles.length).toBeGreaterThan(0);

    for (const entry of resourceArticles) {
      const path = new URL(entry.url).pathname;
      expect(
        entry.priority,
        `Expected ${path} to have priority >= 0.4, got ${entry.priority}`,
      ).toBeGreaterThanOrEqual(0.4);
    }
  });

  it("includes JSON-backed resource detail pages with data file dates", async () => {
    const entries = await sitemap();
    const byPath = new Map(
      entries.map((entry) => [new URL(entry.url).pathname, entry]),
    );
    const [
      bomaTopics,
      leaseClauses,
      expenseCategories,
      bomaLastUpdated,
      leaseClausesLastUpdated,
      expensesLastUpdated,
    ] = await Promise.all([
      getAllBomaTopics(),
      getAllLeaseClauses(),
      getAllExpenseCategories(),
      getDataFileLastUpdated("boma-topics.json"),
      getDataFileLastUpdated("lease-clauses.json"),
      getDataFileLastUpdated("expenses.json"),
    ]);

    for (const topic of bomaTopics) {
      const entry = byPath.get(`/resources/boma/${topic.slug}`);
      expect(entry).toBeDefined();
      expect(entry?.lastModified).toBe(bomaLastUpdated);
    }

    for (const clause of leaseClauses) {
      const entry = byPath.get(`/resources/lease-clauses/${clause.slug}`);
      expect(entry).toBeDefined();
      expect(entry?.lastModified).toBe(leaseClausesLastUpdated);
    }

    for (const category of expenseCategories) {
      const entry = byPath.get(`/resources/expenses/${category.slug}`);
      expect(entry).toBeDefined();
      expect(entry?.lastModified).toBe(expensesLastUpdated);
    }
  });

  it("uses deterministic lastModified values from the central route map for static routes", async () => {
    const entries = await sitemap();

    for (const entry of entries) {
      const path = new URL(entry.url).pathname;
      if (path in LAST_MODIFIED_BY_ROUTE) {
        const lastModified = entry.lastModified;
        const asIso =
          typeof lastModified === "string"
            ? lastModified
            : lastModified?.toISOString();
        expect(asIso).toBe(
          LAST_MODIFIED_BY_ROUTE[path as keyof typeof LAST_MODIFIED_BY_ROUTE],
        );
      } else {
        // Dynamic MDX-driven entries (resources, blog) use ISO date strings from frontmatter
        const lastModified = entry.lastModified;
        expect(typeof lastModified).toBe("string");
        expect(isNaN(new Date(lastModified as string).getTime())).toBe(false);
      }
    }
  });
});
