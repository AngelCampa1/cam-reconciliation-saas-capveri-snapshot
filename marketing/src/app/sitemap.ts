import type { MetadataRoute } from "next";
import fs from "fs";
import path from "path";
import { publicKnowledge } from "@/generated/public-knowledge";
import { getAllPosts } from "@/lib/content/mdx";
import {
  getAllAlternatives,
  getAllBomaTopics,
  getAllCalendarEntries,
  getAllCalculations,
  getAllComparisons,
  getAllDisputeTypes,
  getAllExpenseCategories,
  getAllGlossaryTerms,
  getAllIntegrations,
  getAllLeaseClauses,
  getAllLeaseTypes,
  getAllMetros,
  getAllPersonas,
  getAllPropertyTypes,
  getAllRoles,
  getAllSolutions,
  getAllSoftware,
  getAllStates,
  getAllSwitchGuides,
  getAllTemplates,
  getAllWorkflows,
  getDataFileLastUpdated,
} from "@/lib/content/pseo-data";
import {
  DEMOTED_BLOG_SLUGS,
  DEMOTED_RESOURCE_SLUGS,
  filterByRetainedSlugs,
  RETAINED_COMPARISON_SLUGS,
  RETAINED_GLOSSARY_TERM_SLUGS,
  RETAINED_SOFTWARE_GUIDE_SLUGS,
} from "@/lib/seo/content-governance";
import { LAST_MODIFIED_BY_ROUTE } from "@/lib/seo/sitemap-dates";
import { SITE_URL } from "@/lib/site";

const BASE = SITE_URL;
const DEFAULT_LAST_MODIFIED = "2026-05-12";

export const dynamic = "force-static";

function routeEntry(
  path: string,
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
  priority: number,
): MetadataRoute.Sitemap[number] {
  return {
    url: `${SITE_URL}${path}`,
    lastModified:
      LAST_MODIFIED_BY_ROUTE[path as keyof typeof LAST_MODIFIED_BY_ROUTE] ??
      DEFAULT_LAST_MODIFIED,
    changeFrequency,
    priority,
  };
}

function getStaticResourceRoutes(): string[] {
  const resourcesDir = path.join(process.cwd(), "src/app/resources");
  if (!fs.existsSync(resourcesDir)) return [];

  return fs
    .readdirSync(resourcesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter(
      (entry) => !entry.name.startsWith("[") && !entry.name.startsWith("__"),
    )
    .map((entry) => ({
      pagePath: path.join(resourcesDir, entry.name, "page.tsx"),
      route: `/resources/${entry.name}`,
    }))
    .filter(({ pagePath }) => fs.existsSync(pagePath))
    .map(({ route }) => route)
    .sort();
}

function dataRouteEntries<T extends { slug: string }>(
  items: T[],
  routeForSlug: (slug: string) => string,
  lastModified: string,
  priority = 0.5,
): MetadataRoute.Sitemap {
  return items.map((item) => ({
    url: `${BASE}${routeForSlug(item.slug)}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const resources = await getAllPosts("resources");
  const blogPosts = await getAllPosts("blog");
  const alternatives = await getAllAlternatives();
  const integrations = await getAllIntegrations();
  const solutions = await getAllSolutions();
  const switchGuides = await getAllSwitchGuides();
  const states = await getAllStates();
  const metros = await getAllMetros();
  const propertyTypes = await getAllPropertyTypes();
  const bomaTopics = await getAllBomaTopics();
  const leaseClauses = await getAllLeaseClauses();
  const expenseCategories = await getAllExpenseCategories();
  const roles = await getAllRoles();
  const personas = await getAllPersonas();
  const workflows = await getAllWorkflows();
  const calendarEntries = await getAllCalendarEntries();
  const calculations = await getAllCalculations();
  const disputeTypes = await getAllDisputeTypes();
  const leaseTypes = await getAllLeaseTypes();
  const templates = await getAllTemplates();
  const software = filterByRetainedSlugs(
    await getAllSoftware(),
    RETAINED_SOFTWARE_GUIDE_SLUGS,
  );
  const glossaryTerms = filterByRetainedSlugs(
    await getAllGlossaryTerms(),
    RETAINED_GLOSSARY_TERM_SLUGS,
  );
  const comparisons = filterByRetainedSlugs(
    await getAllComparisons(),
    RETAINED_COMPARISON_SLUGS,
  );

  const [
    softwareLastUpdated,
    glossaryLastUpdated,
    comparisonsLastUpdated,
    bomaLastUpdated,
    leaseClausesLastUpdated,
    expensesLastUpdated,
    statesLastUpdated,
    metrosLastUpdated,
    propertyTypesLastUpdated,
    rolesLastUpdated,
    personasLastUpdated,
    workflowsLastUpdated,
    calendarLastUpdated,
    calculationsLastUpdated,
    disputeLastUpdated,
    leaseTypesLastUpdated,
    templatesLastUpdated,
  ] = await Promise.all([
    getDataFileLastUpdated("software.json"),
    getDataFileLastUpdated("glossary-terms.json"),
    getDataFileLastUpdated("comparisons.json"),
    getDataFileLastUpdated("boma-topics.json"),
    getDataFileLastUpdated("lease-clauses.json"),
    getDataFileLastUpdated("expenses.json"),
    getDataFileLastUpdated("states.json"),
    getDataFileLastUpdated("metros.json"),
    getDataFileLastUpdated("property-types.json"),
    getDataFileLastUpdated("roles.json"),
    getDataFileLastUpdated("personas.json"),
    getDataFileLastUpdated("workflows.json"),
    getDataFileLastUpdated("calendar.json"),
    getDataFileLastUpdated("cam-calculations.json"),
    getDataFileLastUpdated("cam-dispute.json"),
    getDataFileLastUpdated("lease-types.json"),
    getDataFileLastUpdated("templates.json"),
  ]);

  const resourceEntries: MetadataRoute.Sitemap = resources
    .filter((resource) => !DEMOTED_RESOURCE_SLUGS.includes(resource.slug))
    .map((resource) => ({
      url: `${BASE}/resources/${resource.slug}`,
      lastModified: resource.frontmatter.dateModified,
      changeFrequency: "monthly",
      priority: 0.7,
    }));

  const blogEntries: MetadataRoute.Sitemap = blogPosts
    .filter((post) => !DEMOTED_BLOG_SLUGS.includes(post.slug))
    .map((post) => ({
      url: `${BASE}/blog/${post.slug}`,
      lastModified: post.frontmatter.dateModified,
      changeFrequency: "monthly",
      priority: 0.7,
    }));

  const entries: MetadataRoute.Sitemap = [
    routeEntry("/", "weekly", 1.0),
    routeEntry("/pricing", "weekly", 0.9),
    routeEntry("/tools", "weekly", 0.9),
    routeEntry("/cam-reconciliation-guide", "weekly", 0.9),
    routeEntry("/cam-reconciliation-software", "weekly", 0.9),
    routeEntry("/cam-audit-software", "weekly", 0.9),
    routeEntry("/commercial-lease-audit-software", "weekly", 0.9),
    routeEntry("/yardi-cam-reconciliation", "weekly", 0.9),
    routeEntry("/mri-cam-reconciliation", "weekly", 0.9),
    routeEntry("/cam-charges", "weekly", 0.9),
    routeEntry("/cam-audit", "weekly", 0.9),
    routeEntry("/tools/boma-2024-calculator", "monthly", 0.8),
    routeEntry("/tools/cam-billing-error-estimator", "monthly", 0.8),
    routeEntry("/tools/cam-overcharge-calculator", "monthly", 0.8),
    routeEntry("/tools/noi-impact-calculator", "monthly", 0.8),
    routeEntry("/tools/audit-risk-quiz", "monthly", 0.8),
    routeEntry("/tools/cam-gross-up-calculator", "monthly", 0.8),
    routeEntry("/tools/lease-abstract-matrix", "monthly", 0.7),
    routeEntry("/tools/hcad-tax-normalizer", "monthly", 0.7),
    routeEntry("/tools/fixed-cam-vs-traditional", "monthly", 0.8),
    routeEntry("/tools/cam-cap-calculator", "monthly", 0.8),
    routeEntry("/tools/pro-rata-calculator", "monthly", 0.8),
    routeEntry("/tools/reconciliation-statement-generator", "monthly", 0.8),
    routeEntry("/tools/cam-estimate-forecaster", "monthly", 0.8),
    routeEntry("/tools/recovery-gap-analyzer", "monthly", 0.8),
    routeEntry("/tools/admin-fee-calculator", "monthly", 0.8),
    routeEntry("/tools/base-year-escalation", "monthly", 0.8),
    routeEntry("/tools/sb-1103-checker", "monthly", 0.8),
    routeEntry("/tools/boma-remeasurement-impact", "monthly", 0.8),
    routeEntry("/tools/audit-risk-scorecard", "monthly", 0.8),
    routeEntry("/tools/cam-reconciliation-template", "monthly", 0.9),
    routeEntry("/tools/lease-clause-extraction-matrix", "monthly", 0.7),
    routeEntry("/tools/cumulative-cap-bank-calculator", "monthly", 0.7),
    routeEntry("/tools/cam-recovery-ratio-worksheet", "monthly", 0.7),
    routeEntry("/tools/yardi-export-qa-checklist", "monthly", 0.7),
    routeEntry("/tools/mri-recovery-billing-qa-checklist", "monthly", 0.7),
    routeEntry("/tools/audit-defense-packet-builder", "monthly", 0.7),
    routeEntry("/tools/cam-pre-send-packet-checklist-download", "monthly", 0.7),
    routeEntry(
      "/tools/tenant-dispute-response-letter-template",
      "monthly",
      0.7,
    ),
    routeEntry("/tools/multi-state-cam-disclosure-matrix", "monthly", 0.7),
    routeEntry(
      "/tools/property-tax-appeal-recovery-calculator",
      "monthly",
      0.7,
    ),
    routeEntry("/llms.txt", "monthly", 0.2),
    routeEntry("/llms-full.txt", "monthly", 0.2),
    routeEntry("/pricing.md", "monthly", 0.2),
    routeEntry("/pricing.txt", "monthly", 0.2),
    routeEntry("/resources", "weekly", 0.8),
    routeEntry("/resources/cam-guides", "weekly", 0.8),
    routeEntry("/resources/tools-calculators", "weekly", 0.8),
    routeEntry("/resources/compliance-leases", "weekly", 0.8),
    routeEntry("/resources/solutions", "weekly", 0.8),
    routeEntry("/resources/blog-research", "weekly", 0.8),
    routeEntry("/resources/states", "monthly", 0.6),
    ...dataRouteEntries(
      states,
      (slug) => `/resources/states/${slug}/cam-compliance`,
      statesLastUpdated,
    ),
    routeEntry("/resources/markets", "monthly", 0.6),
    ...dataRouteEntries(
      metros,
      (slug) => `/resources/markets/${slug}/cam-guide`,
      metrosLastUpdated,
    ),
    routeEntry("/resources/property-types", "monthly", 0.6),
    ...dataRouteEntries(
      propertyTypes,
      (slug) => `/resources/property-types/${slug}/cam-guide`,
      propertyTypesLastUpdated,
    ),
    routeEntry("/resources/roles", "monthly", 0.6),
    ...dataRouteEntries(
      roles,
      (slug) => `/resources/roles/${slug}/cam-guide`,
      rolesLastUpdated,
    ),
    routeEntry("/for", "monthly", 0.8),
    ...dataRouteEntries(
      personas,
      (slug) => `/for/${slug}`,
      personasLastUpdated,
      0.8,
    ),
    routeEntry("/resources/workflows", "monthly", 0.6),
    ...dataRouteEntries(
      workflows,
      (slug) => `/resources/workflows/${slug}`,
      workflowsLastUpdated,
    ),
    routeEntry("/resources/calendar", "monthly", 0.6),
    ...dataRouteEntries(
      calendarEntries,
      (slug) => `/resources/calendar/${slug}`,
      calendarLastUpdated,
    ),
    routeEntry("/resources/calculations", "monthly", 0.6),
    ...dataRouteEntries(
      calculations,
      (slug) => `/resources/calculations/${slug}`,
      calculationsLastUpdated,
    ),
    routeEntry("/resources/cam-dispute", "monthly", 0.6),
    ...dataRouteEntries(
      disputeTypes,
      (slug) => `/resources/cam-dispute/${slug}`,
      disputeLastUpdated,
    ),
    routeEntry("/resources/lease-types", "monthly", 0.6),
    ...dataRouteEntries(
      leaseTypes,
      (slug) => `/resources/lease-types/${slug}/cam-guide`,
      leaseTypesLastUpdated,
    ),
    routeEntry("/resources/templates", "monthly", 0.6),
    ...dataRouteEntries(
      templates,
      (slug) => `/resources/templates/${slug}`,
      templatesLastUpdated,
    ),
    routeEntry("/resources/software", "monthly", 0.8),
    routeEntry("/resources/boma", "monthly", 0.8),
    ...bomaTopics.map((topic) => ({
      url: `${BASE}/resources/boma/${topic.slug}`,
      lastModified: bomaLastUpdated,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    routeEntry("/resources/lease-clauses", "monthly", 0.8),
    ...leaseClauses.map((clause) => ({
      url: `${BASE}/resources/lease-clauses/${clause.slug}`,
      lastModified: leaseClausesLastUpdated,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    routeEntry("/resources/expenses", "monthly", 0.8),
    ...expenseCategories.map((category) => ({
      url: `${BASE}/resources/expenses/${category.slug}`,
      lastModified: expensesLastUpdated,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...resourceEntries,
    routeEntry("/blog", "weekly", 0.8),
    ...blogEntries,
    routeEntry("/alternatives", "monthly", 0.8),
    ...alternatives.map((alternative) => ({
      url: `${BASE}/alternatives/${alternative.slug}`,
      lastModified: alternative.dateModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    routeEntry("/integrations", "monthly", 0.8),
    ...integrations.map((integration) => ({
      url: `${BASE}/integrations/${integration.slug}`,
      lastModified: integration.dateModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    routeEntry("/solutions", "monthly", 0.8),
    ...solutions.map((solution) => ({
      url: `${BASE}/solutions/${solution.slug}`,
      lastModified: solution.dateModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    routeEntry("/switch", "monthly", 0.8),
    ...switchGuides.map((guide) => ({
      url: `${BASE}/switch/${guide.slug}`,
      lastModified: guide.dateModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    routeEntry("/vs", "monthly", 0.8),
    ...comparisons.map((comparison) => ({
      url: `${BASE}/vs/${comparison.slug}`,
      lastModified:
        LAST_MODIFIED_BY_ROUTE[
          `/vs/${comparison.slug}` as keyof typeof LAST_MODIFIED_BY_ROUTE
        ] ?? comparisonsLastUpdated,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    routeEntry("/about/angel-campa", "monthly", 0.7),
    routeEntry("/lease-abstraction", "monthly", 0.8),
    routeEntry("/glossary", "monthly", 0.8),
    ...glossaryTerms.map((term) => ({
      url: `${BASE}/glossary/${term.slug}`,
      lastModified: glossaryLastUpdated,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
    ...software.map((product) => ({
      url: `${BASE}/resources/software/${product.slug}/cam-setup`,
      lastModified: softwareLastUpdated,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    routeEntry("/about", "monthly", 0.6),
    routeEntry("/contact", "monthly", 0.6),
    routeEntry("/roi", "monthly", 0.8),
    routeEntry("/product-tour", "monthly", 0.8),
    routeEntry("/product/features", "weekly", 0.8),
    ...publicKnowledge.productFeatures.map((feature) => ({
      url: `${BASE}/product/features/${feature.key}`,
      lastModified: "2026-05-31T00:00:00.000Z",
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    routeEntry("/best/cam-reconciliation-software", "monthly", 0.8),
    routeEntry("/sample-report", "monthly", 0.5),
    routeEntry("/videos", "monthly", 0.6),
    routeEntry("/case-studies", "monthly", 0.7),
    routeEntry("/privacy", "yearly", 0.3),
    routeEntry("/terms", "yearly", 0.3),
    routeEntry("/cookies", "yearly", 0.3),
    ...getStaticResourceRoutes().map((route) =>
      routeEntry(route, "monthly", 0.7),
    ),
  ];

  const uniqueEntries = new Map<string, MetadataRoute.Sitemap[number]>();
  for (const entry of entries) {
    if (!uniqueEntries.has(entry.url)) {
      uniqueEntries.set(entry.url, entry);
    }
  }
  return [...uniqueEntries.values()];
}
