import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import contentGovernance from "../../data/seo/content-governance.json";
import indexedGovernance from "../../data/seo/indexed-page-governance.json";
import alternativesData from "../../data/alternatives.json";
import comparisonsData from "../../data/comparisons.json";
import integrationsData from "../../data/integrations.json";
import solutionsData from "../../data/solutions.json";
import switchData from "../../data/switch.json";
import sitemap from "../app/sitemap";
import nextConfig from "../../next.config";

const { buildValidRouteSet } =
  await import("../../scripts/internal-link-registry.mjs");
const { auditInternalLinks } =
  await import("../../scripts/internal-link-registry.mjs");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const APP_RESOURCES_DIR = path.join(PROJECT_ROOT, "src/app/resources");
const CONTENT_RESOURCES_DIR = path.join(PROJECT_ROOT, "content/resources");

describe("route integrity governance", () => {
  it("pre-renders JSON-backed dynamic route families", async () => {
    const cases = [
      {
        label: "BOMA topics",
        module: await import("../app/resources/boma/[topic]/page"),
        expectedKey: "topic",
      },
      {
        label: "expense categories",
        module: await import("../app/resources/expenses/[category]/page"),
        expectedKey: "category",
      },
      {
        label: "lease clauses",
        module: await import("../app/resources/lease-clauses/[clause]/page"),
        expectedKey: "clause",
      },
      {
        label: "metro guides",
        module: await import("../app/resources/markets/[metro]/cam-guide/page"),
        expectedKey: "metro",
      },
      {
        label: "property type guides",
        module:
          await import("../app/resources/property-types/[type]/cam-guide/page"),
        expectedKey: "type",
      },
      {
        label: "role guides",
        module: await import("../app/resources/roles/[role]/cam-guide/page"),
        expectedKey: "role",
      },
      {
        label: "state compliance guides",
        module:
          await import("../app/resources/states/[state]/cam-compliance/page"),
        expectedKey: "state",
      },
      {
        label: "workflow guides",
        module: await import("../app/resources/workflows/[workflow]/page"),
        expectedKey: "workflow",
      },
    ] as const;

    for (const routeCase of cases) {
      const params = await routeCase.module.generateStaticParams();

      expect(
        params.length,
        `${routeCase.label} should pre-render at least one route`,
      ).toBeGreaterThan(0);
      expect(params[0]).toHaveProperty(routeCase.expectedKey);
    }
  });

  it("keeps demoted overlapping resources out of the indexed sitemap", async () => {
    const entries = await sitemap();
    const paths = new Set(entries.map((entry) => new URL(entry.url).pathname));

    for (const slug of contentGovernance.demotedResourceSlugs ?? []) {
      expect(paths.has(`/resources/${slug}`)).toBe(false);
    }
  });

  it("does not let static resource pages collide with MDX resource slugs", () => {
    const staticResourceRoutes = fs
      .readdirSync(APP_RESOURCES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter(
        (entry) => !entry.name.startsWith("[") && !entry.name.startsWith("__"),
      )
      .filter((entry) =>
        fs.existsSync(path.join(APP_RESOURCES_DIR, entry.name, "page.tsx")),
      )
      .map((entry) => `/resources/${entry.name}`);

    const mdxResourceRoutes = fs
      .readdirSync(CONTENT_RESOURCES_DIR)
      .filter((file) => file.endsWith(".mdx"))
      .map((file) => `/resources/${path.basename(file, ".mdx")}`);

    const collisions = staticResourceRoutes.filter((route) =>
      mdxResourceRoutes.includes(route),
    );

    expect(collisions).toEqual([]);
  });

  it("does not redirect promoted route families or retained comparison slugs", async () => {
    const redirects = await nextConfig.redirects?.();
    const redirectSources = new Set(
      (redirects ?? []).map((redirect) => redirect.source),
    );

    expect(redirectSources.has("/alternatives/:path*")).toBe(false);

    for (const slug of contentGovernance.retainedComparisonSlugs) {
      expect(redirectSources.has(`/vs/${slug}`)).toBe(false);
    }
  });

  it("resolves governed and JSON-backed internal links to real routes", () => {
    const validRoutes = buildValidRouteSet();
    const violations: string[] = [];

    const governedLinks = indexedGovernance.priorityPages.flatMap((page) => [
      `${page.path} -> nextStepHref -> ${page.nextStepHref}`,
      ...page.parentInternalLinks.map(
        (href: string) => `${page.path} -> parentInternalLinks -> ${href}`,
      ),
      ...page.childInternalLinks.map(
        (href: string) => `${page.path} -> childInternalLinks -> ${href}`,
      ),
    ]);

    for (const entry of governedLinks) {
      const href = entry.split(" -> ").at(-1);
      if (!href || !validRoutes.has(href)) {
        violations.push(entry);
      }
    }

    for (const item of alternativesData.alternatives) {
      for (const resource of item.relatedResources) {
        if (!validRoutes.has(resource.href)) {
          violations.push(
            `alternatives/${item.slug} -> relatedResources -> ${resource.href}`,
          );
        }
      }

      for (const comparison of item.relatedComparisons) {
        const href = `/vs/${comparison.slug}`;
        if (!validRoutes.has(href)) {
          violations.push(
            `alternatives/${item.slug} -> relatedComparisons -> ${href}`,
          );
        }
      }
    }

    for (const item of integrationsData.integrations) {
      for (const resource of item.relatedResources) {
        if (!validRoutes.has(resource.href)) {
          violations.push(
            `integrations/${item.slug} -> relatedResources -> ${resource.href}`,
          );
        }
      }

      for (const integration of item.relatedIntegrations) {
        const href = `/integrations/${integration.slug}`;
        if (!validRoutes.has(href)) {
          violations.push(
            `integrations/${item.slug} -> relatedIntegrations -> ${href}`,
          );
        }
      }
    }

    for (const item of solutionsData.solutions) {
      for (const resource of item.relatedResources) {
        if (!validRoutes.has(resource.href)) {
          violations.push(
            `solutions/${item.slug} -> relatedResources -> ${resource.href}`,
          );
        }
      }

      for (const solution of item.relatedSolutions) {
        const href = `/solutions/${solution.slug}`;
        if (!validRoutes.has(href)) {
          violations.push(
            `solutions/${item.slug} -> relatedSolutions -> ${href}`,
          );
        }
      }
    }

    for (const item of switchData.guides) {
      for (const resource of item.relatedResources) {
        if (!validRoutes.has(resource.href)) {
          violations.push(
            `switch/${item.slug} -> relatedResources -> ${resource.href}`,
          );
        }
      }
    }

    for (const item of comparisonsData.comparisons) {
      for (const resource of item.relatedResources) {
        if (!validRoutes.has(resource.href)) {
          violations.push(
            `vs/${item.slug} -> relatedResources -> ${resource.href}`,
          );
        }
      }

      for (const comparison of item.relatedComparisons) {
        const href = `/vs/${comparison.slug}`;
        if (!validRoutes.has(href)) {
          violations.push(`vs/${item.slug} -> relatedComparisons -> ${href}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("resolves hardcoded marketing links in source and MDX content", () => {
    const { broken } = auditInternalLinks();

    expect(broken).toEqual([]);
  });

  it("keeps redirect destinations on valid canonical routes", async () => {
    const validRoutes = buildValidRouteSet();
    const redirects = await nextConfig.redirects?.();
    const invalidRedirects = (redirects ?? [])
      .filter((redirect) => redirect.destination.startsWith("/"))
      // Validate only the path portion: a destination may carry a #fragment
      // (e.g. /docs#security) that targets a real on-page anchor, and route
      // sets never include fragments or query strings.
      .filter((redirect) => !validRoutes.has(redirect.destination.split(/[#?]/)[0]))
      .map((redirect) => `${redirect.source} -> ${redirect.destination}`);

    expect(invalidRedirects).toEqual([]);
  });
});
