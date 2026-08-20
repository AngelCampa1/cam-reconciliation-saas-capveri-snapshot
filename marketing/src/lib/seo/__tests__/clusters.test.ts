import { describe, expect, it } from "vitest";
import {
  getClusterRelatedLinks,
  getSeoClusterForPath,
  SEO_CLUSTERS,
} from "@/lib/seo/clusters";

const registry = await import("../../../../scripts/internal-link-registry.mjs");

describe("SEO cluster governance", () => {
  it("keeps cluster hubs, product paths, and priority links resolvable", () => {
    const validRoutes = registry.buildValidRouteSet();
    const brokenLinks = SEO_CLUSTERS.flatMap((cluster) =>
      [cluster.hub, cluster.product, ...cluster.priorityRoutes]
        .filter((link) => !validRoutes.has(link.href))
        .map((link) => `${cluster.id} -> ${link.href}`),
    );

    expect(brokenLinks).toEqual([]);
  });

  it("assigns every indexable public route to a cluster with reciprocal links", () => {
    const report = registry.auditInternalLinks();
    const missingReciprocalLinks: string[] = [];

    for (const route of report.indexableRoutes) {
      if (
        route === "/" ||
        route.startsWith("/blog/category/") ||
        ["/privacy", "/terms", "/cookies"].includes(route)
      ) {
        continue;
      }

      const cluster = getSeoClusterForPath(route);
      const relatedLinks = getClusterRelatedLinks(route);

      expect(cluster).toBeDefined();
      if (
        route !== cluster.hub.href &&
        !relatedLinks.some((link) => link.href === cluster.hub.href)
      ) {
        missingReciprocalLinks.push(`${route} -> ${cluster.hub.href}`);
      }
    }

    expect(missingReciprocalLinks).toEqual([]);
  });

  it("prevents duplicate cluster hub ownership", () => {
    const hubRoutes = SEO_CLUSTERS.map((cluster) => cluster.hub.href);
    expect(new Set(hubRoutes).size).toBe(hubRoutes.length);
  });
});
