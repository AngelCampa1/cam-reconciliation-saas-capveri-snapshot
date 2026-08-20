import { describe, expect, it } from "vitest";
import { resourcesMegamenuPillars } from "@/lib/seo/resources-megamenu";

const registry = await import("../../scripts/internal-link-registry.mjs");

describe("internal link graph governance", () => {
  it("resolves every discovered internal link to a real route", () => {
    const report = registry.auditInternalLinks();
    expect(report.broken).toEqual([]);
  });

  it("keeps every indexable public page reachable from an internal link", () => {
    const report = registry.auditInternalLinks();
    expect(report.orphans).toEqual([]);
    expect(report.indexableRoutes.has("/blog/what-is-cam-reconciliation")).toBe(
      false,
    );
    expect(
      report.indexableRoutes.has("/resources/what-is-cam-reconciliation"),
    ).toBe(false);
  });

  it("does not render links to demoted CAM reconciliation canonical pages", () => {
    const report = registry.auditInternalLinks();

    expect(report.linkSources.get("/blog/what-is-cam-reconciliation")).toBe(
      undefined,
    );
    expect(
      report.linkSources.get("/resources/what-is-cam-reconciliation"),
    ).toBe(undefined);
  });

  it("keeps Resources megamenu pillar links valid", () => {
    const validRoutes = registry.buildValidRouteSet();

    expect(resourcesMegamenuPillars.map((p) => p.label)).toEqual([
      "CAM Guides",
      "Tools & Calculators",
      "Compliance & Leases",
      "Solutions",
      "Blog & Research",
    ]);
    expect(resourcesMegamenuPillars.map((p) => p.href)).toEqual([
      "/resources/cam-guides",
      "/resources/tools-calculators",
      "/resources/compliance-leases",
      "/resources/solutions",
      "/resources/blog-research",
    ]);
    expect(resourcesMegamenuPillars.length).toBe(5);

    const invalidLinks = resourcesMegamenuPillars.filter(
      (pillar) => !validRoutes.has(pillar.href),
    );
    expect(invalidLinks).toEqual([]);
  });

  it("keeps every indexable public page attached to one Resources megamenu hub", () => {
    const report = registry.auditInternalLinks();
    const hubRoutes = new Set(resourcesMegamenuPillars.map((hub) => hub.href));
    const detachedRoutes = [...report.indexableRoutes].filter((route) => {
      if (hubRoutes.has(route)) return false;
      if (report.legalOrSupportRoutes.has(route)) return false;
      return !report.resourceMegamenuHubForRoute(route);
    });

    expect(detachedRoutes).toEqual([]);

    for (const hub of resourcesMegamenuPillars) {
      const attachedRoutes = [...report.indexableRoutes].filter(
        (route) => report.resourceMegamenuHubForRoute(route) === hub.href,
      );
      expect(
        attachedRoutes.length,
        `Expected ${hub.href} to own at least one indexable route`,
      ).toBeGreaterThan(0);
    }
  });

  it("generates crawl links from Resources megamenu hubs to their attached pages", () => {
    const report = registry.auditInternalLinks();
    const missingHubLinks = [...report.indexableRoutes].filter((route) => {
      const hub = report.resourceMegamenuHubForRoute(route);
      if (!hub) return false;
      const generatedSources = report.linkSources.get(route)?.generatedSources;
      return !generatedSources?.has(`generated:${hub}`);
    });

    expect(missingHubLinks).toEqual([]);
  });

  it("exposes every SEO resource family through the Resources hub or megamenu", () => {
    const report = registry.auditInternalLinks();
    expect(report.missingResourceFamilies).toEqual([]);
    expect([...report.linkedResourceHubs.keys()].sort()).toEqual([
      "/resources/boma",
      "/resources/calculations",
      "/resources/calendar",
      "/resources/cam-dispute",
      "/resources/expenses",
      "/resources/lease-clauses",
      "/resources/lease-types",
      "/resources/markets",
      "/resources/property-types",
      "/resources/roles",
      "/resources/software",
      "/resources/states",
      "/resources/templates",
      "/resources/workflows",
    ]);
  });

  it("counts resource family data links as rendered inbound links", () => {
    const report = registry.auditInternalLinks();

    expect(
      report.linkSources
        .get("/resources/common-area-maintenance-reconciliation-explained")
        ?.sources.has("data/calendar.json"),
    ).toBe(true);
    expect(
      report.linkSources.get("/resources/what-is-cam-reconciliation"),
    ).toBe(undefined);
  });

  it("does not count route governance metadata as rendered inbound links", () => {
    const report = registry.auditInternalLinks();
    const metadataSources = [...report.linkSources.values()].flatMap((entry) =>
      [...entry.sources].filter((source) => source.startsWith("data/")),
    );

    expect(
      metadataSources.filter((source) => source.startsWith("data/seo/")),
    ).toEqual([]);
  });
});
