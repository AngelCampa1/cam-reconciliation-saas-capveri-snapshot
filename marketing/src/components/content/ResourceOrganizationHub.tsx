import { SITE_URL } from "@/lib/site";
import Link from "next/link";
import { ArrowRight, Network } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { getAllPosts } from "@/lib/content/mdx";
import {
  getAllAlternatives,
  getAllBomaTopics,
  getAllCalculations,
  getAllCalendarEntries,
  getAllComparisons,
  getAllDisputeTypes,
  getAllExpenseCategories,
  getAllGlossaryTerms,
  getAllIntegrations,
  getAllLeaseClauses,
  getAllLeaseTypes,
  getAllMetros,
  getAllPropertyTypes,
  getAllRoles,
  getAllSoftware,
  getAllSolutions,
  getAllStates,
  getAllSwitchGuides,
  getAllTemplates,
  getAllWorkflows,
} from "@/lib/content/pseo-data";
import {
  DEMOTED_BLOG_SLUGS,
  DEMOTED_RESOURCE_SLUGS,
  filterByRetainedSlugs,
  RETAINED_COMPARISON_SLUGS,
  RETAINED_GLOSSARY_TERM_SLUGS,
  RETAINED_SOFTWARE_GUIDE_SLUGS,
} from "@/lib/seo/content-governance";
import {
  getResourceHub,
  resourceMegamenuHubs,
  type ResourceHubId,
  type ResourceHubLink,
} from "@/lib/seo/resource-organization";
import { structuredDataSchemas } from "@/lib/structured-data";

interface ResourceHubSection {
  title: string;
  description: string;
  links: ResourceHubLink[];
}

const toolLinks: ResourceHubLink[] = [
  ["CAM Gross-Up Calculator", "/tools/cam-gross-up-calculator"],
  ["Pro-Rata Calculator", "/tools/pro-rata-calculator"],
  ["CAM Cap Calculator", "/tools/cam-cap-calculator"],
  ["Base Year Escalation", "/tools/base-year-escalation"],
  ["BOMA 2024 Calculator", "/tools/boma-2024-calculator"],
  ["BOMA Remeasurement Impact", "/tools/boma-remeasurement-impact"],
  ["NOI Impact Calculator", "/tools/noi-impact-calculator"],
  ["CAM Estimate Forecaster", "/tools/cam-estimate-forecaster"],
  ["CAM Billing Error Estimator", "/tools/cam-billing-error-estimator"],
  ["Billing Gap Analyzer", "/tools/recovery-gap-analyzer"],
  ["Statement Generator", "/tools/reconciliation-statement-generator"],
  ["Admin Fee Calculator", "/tools/admin-fee-calculator"],
  ["Pre-Send Audit Exposure Quiz", "/tools/audit-risk-quiz"],
  ["Pre-Send Audit Exposure Scorecard", "/tools/audit-risk-scorecard"],
  ["SB 1103 Checker", "/tools/sb-1103-checker"],
  ["CAM Reconciliation Template", "/tools/cam-reconciliation-template"],
  ["Audit Defense Packet Builder", "/tools/audit-defense-packet-builder"],
  ["Lease Abstract Matrix", "/tools/lease-abstract-matrix"],
  ["Lease Clause Extraction Matrix", "/tools/lease-clause-extraction-matrix"],
  [
    "Pre-Send Packet Checklist",
    "/tools/cam-pre-send-packet-checklist-download",
  ],
  ["CAM Recovery Ratio Worksheet", "/tools/cam-recovery-ratio-worksheet"],
  ["Cumulative Cap Bank Calculator", "/tools/cumulative-cap-bank-calculator"],
  ["Fixed CAM vs Traditional", "/tools/fixed-cam-vs-traditional"],
  ["HCAD Tax Normalizer", "/tools/hcad-tax-normalizer"],
  [
    "MRI Recovery Billing Error Checklist",
    "/tools/mri-recovery-billing-qa-checklist",
  ],
  [
    "Multi-State CAM Packet Review Checklist",
    "/tools/multi-state-cam-disclosure-matrix",
  ],
  [
    "Property Tax Appeal Impact Calculator",
    "/tools/property-tax-appeal-recovery-calculator",
  ],
  [
    "Tenant CAM Dispute Response Letter",
    "/tools/tenant-dispute-response-letter-template",
  ],
  ["Yardi Export Error Checklist", "/tools/yardi-export-qa-checklist"],
].map(([label, href]) => ({ label, href }));

function routeLink(label: string, href: string, description?: string) {
  return { label, href, description };
}

function itemLink(
  item: { slug: string; name?: string; title?: string; label?: string },
  href: (slug: string) => string,
): ResourceHubLink {
  return {
    label: item.name ?? item.title ?? item.label ?? item.slug,
    href: href(item.slug),
  };
}

function postLinks(
  posts: { slug: string; frontmatter: { title: string } }[],
  basePath: "/blog" | "/resources",
  demotedSlugs: readonly string[],
): ResourceHubLink[] {
  return posts
    .filter((post) => !demotedSlugs.includes(post.slug))
    .map((post) =>
      routeLink(post.frontmatter.title, `${basePath}/${post.slug}`),
    );
}

async function getHubSections(
  id: ResourceHubId,
): Promise<ResourceHubSection[]> {
  const [
    resources,
    blogPosts,
    states,
    metros,
    propertyTypes,
    software,
    boma,
    leaseClauses,
    expenses,
    roles,
    workflows,
    calendar,
    calculations,
    disputes,
    leaseTypes,
    templates,
    alternatives,
    comparisons,
    integrations,
    solutions,
    switchGuides,
    glossaryTerms,
  ] = await Promise.all([
    getAllPosts("resources"),
    getAllPosts("blog"),
    getAllStates(),
    getAllMetros(),
    getAllPropertyTypes(),
    getAllSoftware(),
    getAllBomaTopics(),
    getAllLeaseClauses(),
    getAllExpenseCategories(),
    getAllRoles(),
    getAllWorkflows(),
    getAllCalendarEntries(),
    getAllCalculations(),
    getAllDisputeTypes(),
    getAllLeaseTypes(),
    getAllTemplates(),
    getAllAlternatives(),
    getAllComparisons(),
    getAllIntegrations(),
    getAllSolutions(),
    getAllSwitchGuides(),
    getAllGlossaryTerms(),
  ]);

  const resourceArticles = postLinks(
    resources,
    "/resources",
    DEMOTED_RESOURCE_SLUGS,
  );
  const blogArticleLinks = postLinks(blogPosts, "/blog", DEMOTED_BLOG_SLUGS);
  const retainedSoftware = filterByRetainedSlugs(
    software,
    RETAINED_SOFTWARE_GUIDE_SLUGS,
  );
  const retainedComparisons = filterByRetainedSlugs(
    comparisons,
    RETAINED_COMPARISON_SLUGS,
  );
  const retainedGlossary = filterByRetainedSlugs(
    glossaryTerms,
    RETAINED_GLOSSARY_TERM_SLUGS,
  );

  const allResourceHubs = [
    routeLink("Resources Master Directory", "/resources"),
    routeLink("BOMA Standards", "/resources/boma"),
    routeLink("CAM Calculations", "/resources/calculations"),
    routeLink("CAM Calendar", "/resources/calendar"),
    routeLink("CAM Dispute Guides", "/resources/cam-dispute"),
    routeLink("Recoverable Expenses", "/resources/expenses"),
    routeLink("Lease Clause Playbooks", "/resources/lease-clauses"),
    routeLink("Commercial Lease Types", "/resources/lease-types"),
    routeLink("CAM by Market", "/resources/markets"),
    routeLink("CAM by Property Type", "/resources/property-types"),
    routeLink("CAM by Role", "/resources/roles"),
    routeLink("Software Setup Guides", "/resources/software"),
    routeLink("State Compliance", "/resources/states"),
    routeLink("Operator Templates", "/resources/templates"),
    routeLink("CAM Workflows", "/resources/workflows"),
  ];

  if (id === "cam-guides") {
    return [
      {
        title: "Core CAM pillars",
        description: "Start here for the main concepts and workflows.",
        links: [
          routeLink("CAM Reconciliation Guide", "/cam-reconciliation-guide"),
          routeLink("CAM Charges Guide", "/cam-charges"),
          routeLink("CAM Audit Guide", "/cam-audit"),
          routeLink(
            "CAM Reconciliation Software",
            "/cam-reconciliation-software",
          ),
          routeLink("CAM Audit Software", "/cam-audit-software"),
          routeLink(
            "Commercial Lease Audit Software",
            "/commercial-lease-audit-software",
          ),
          routeLink("Yardi CAM Reconciliation", "/yardi-cam-reconciliation"),
          routeLink("MRI CAM Reconciliation", "/mri-cam-reconciliation"),
        ],
      },
      {
        title: "Process, dispute, and calculation hubs",
        description: "Directory pages for operational CAM work.",
        links: [
          routeLink("CAM Workflows", "/resources/workflows"),
          routeLink("CAM Calculation Scenarios", "/resources/calculations"),
          routeLink("CAM Dispute Guides", "/resources/cam-dispute"),
          routeLink("CAM Templates", "/resources/templates"),
          ...workflows.map((item) =>
            itemLink(item, (slug) => `/resources/workflows/${slug}`),
          ),
          ...calculations.map((item) =>
            itemLink(item, (slug) => `/resources/calculations/${slug}`),
          ),
          ...disputes.map((item) =>
            itemLink(item, (slug) => `/resources/cam-dispute/${slug}`),
          ),
          ...templates.map((item) =>
            itemLink(item, (slug) => `/resources/templates/${slug}`),
          ),
        ],
      },
      {
        title: "CAM guide library",
        description:
          "All retained resource articles connected to the CAM guide hub.",
        links: resourceArticles,
      },
    ];
  }

  if (id === "tools-calculators") {
    return [
      {
        title: "Tools directory",
        description:
          "The parent directory and every public calculator or worksheet.",
        links: [routeLink("Tools Directory", "/tools"), ...toolLinks],
      },
      {
        title: "Tool support resources",
        description:
          "Reference pages that explain the math, files, and clauses behind the tools.",
        links: [
          routeLink("Recoverable Expense Guides", "/resources/expenses"),
          routeLink("CAM Calculation Scenarios", "/resources/calculations"),
          routeLink("Lease Clause Playbooks", "/resources/lease-clauses"),
          routeLink("BOMA Standards", "/resources/boma"),
          ...calculations.map((item) =>
            itemLink(item, (slug) => `/resources/calculations/${slug}`),
          ),
        ],
      },
    ];
  }

  if (id === "compliance-leases") {
    return [
      {
        title: "Compliance and lease hubs",
        description:
          "Every compliance, lease, BOMA, market, and expense directory.",
        links: [
          routeLink("State Compliance", "/resources/states"),
          routeLink(
            "Commercial Tenant CAM Disclosure by State",
            "/resources/commercial-tenant-cam-disclosure-by-state",
          ),
          routeLink(
            "California SB 1103 CAM Guide",
            "/resources/california-sb-1103-cam-guide",
          ),
          routeLink("BOMA Standards", "/resources/boma"),
          routeLink("Lease Clause Playbooks", "/resources/lease-clauses"),
          routeLink("Commercial Lease Types", "/resources/lease-types"),
          routeLink("Recoverable Expense Guides", "/resources/expenses"),
          routeLink("CAM Calendar", "/resources/calendar"),
          routeLink("CAM by Market", "/resources/markets"),
          routeLink("CAM by Property Type", "/resources/property-types"),
        ],
      },
      {
        title: "State, market, BOMA, and lease pages",
        description:
          "All generated child pages under the compliance and lease system.",
        links: [
          ...states.map((item) =>
            itemLink(
              item,
              (slug) => `/resources/states/${slug}/cam-compliance`,
            ),
          ),
          ...metros.map((item) =>
            itemLink(item, (slug) => `/resources/markets/${slug}/cam-guide`),
          ),
          ...boma.map((item) =>
            itemLink(item, (slug) => `/resources/boma/${slug}`),
          ),
          ...leaseClauses.map((item) =>
            itemLink(item, (slug) => `/resources/lease-clauses/${slug}`),
          ),
          ...leaseTypes.map((item) =>
            itemLink(
              item,
              (slug) => `/resources/lease-types/${slug}/cam-guide`,
            ),
          ),
          ...expenses.map((item) =>
            itemLink(item, (slug) => `/resources/expenses/${slug}`),
          ),
          ...calendar.map((item) =>
            itemLink(item, (slug) => `/resources/calendar/${slug}`),
          ),
          ...propertyTypes.map((item) =>
            itemLink(
              item,
              (slug) => `/resources/property-types/${slug}/cam-guide`,
            ),
          ),
        ],
      },
    ];
  }

  if (id === "solutions") {
    return [
      {
        title: "Product and buying paths",
        description: "Decision-stage pages for teams evaluating CapVeri.",
        links: [
          routeLink("Solutions", "/solutions"),
          routeLink("Product Tour", "/product-tour"),
          routeLink("Pricing", "/pricing"),
          routeLink("ROI", "/roi"),
          routeLink(
            "Best CAM Reconciliation Software",
            "/best/cam-reconciliation-software",
          ),
          routeLink("Case Studies", "/case-studies"),
          routeLink("Sample Report", "/sample-report"),
          routeLink("Lease Abstraction", "/lease-abstraction"),
          routeLink("Compare CapVeri", "/vs"),
          routeLink("Alternatives", "/alternatives"),
          routeLink("Integrations", "/integrations"),
          routeLink("Switch Guides", "/switch"),
        ],
      },
      {
        title: "Solutions, roles, comparisons, and switching",
        description:
          "All commercial child pages attached to the buying journey.",
        links: [
          ...solutions.map((item) =>
            itemLink(item, (slug) => `/solutions/${slug}`),
          ),
          ...roles.map((item) =>
            itemLink(item, (slug) => `/resources/roles/${slug}/cam-guide`),
          ),
          ...retainedSoftware.map((item) =>
            itemLink(item, (slug) => `/resources/software/${slug}/cam-setup`),
          ),
          ...retainedComparisons.map((item) =>
            itemLink(item, (slug) => `/vs/${slug}`),
          ),
          ...alternatives.map((item) =>
            itemLink(item, (slug) => `/alternatives/${slug}`),
          ),
          ...integrations.map((item) =>
            itemLink(item, (slug) => `/integrations/${slug}`),
          ),
          ...switchGuides.map((item) =>
            itemLink(item, (slug) => `/switch/${slug}`),
          ),
        ],
      },
    ];
  }

  return [
    {
      title: "Research and reference hubs",
      description:
        "The blog, glossary, sources, and every resource family index.",
      links: [
        routeLink("Blog", "/blog"),
        routeLink("CAM Glossary", "/glossary"),
        routeLink("Sources", "/sources"),
        routeLink("Help Center", "/help"),
        routeLink("Docs", "/docs"),
        routeLink("CRE FinOps Glossary", "/resources/cam-glossary-cre-finops"),
        ...allResourceHubs,
      ],
    },
    {
      title: "Blog and glossary pages",
      description: "All retained blog posts and retained glossary references.",
      links: [
        routeLink("CAM Errors Blog Category", "/blog/category/cam-errors"),
        routeLink("Compliance Blog Category", "/blog/category/compliance"),
        routeLink("CRE FinOps Blog Category", "/blog/category/cre-finops"),
        routeLink("How-To Blog Category", "/blog/category/how-to"),
        routeLink("Operations Blog Category", "/blog/category/operations"),
        routeLink(
          "Market Trends Blog Category",
          "/blog/category/market-trends",
        ),
        routeLink("Technology Blog Category", "/blog/category/technology"),
        ...blogArticleLinks,
        ...retainedGlossary.map((item) =>
          itemLink(item, (slug) => `/glossary/${slug}`),
        ),
      ],
    },
  ];
}

export async function ResourceOrganizationHub({
  hubId,
}: {
  hubId: ResourceHubId;
}) {
  const hub = getResourceHub(hubId);
  const sections = await getHubSections(hubId);
  const links = sections.flatMap((section) => section.links);
  const uniqueLinks = links.filter(
    (link, index, all) =>
      all.findIndex((candidate) => candidate.href === link.href) === index,
  );
  const relatedHubs = resourceMegamenuHubs.filter((item) => item.id !== hubId);

  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd
        data={structuredDataSchemas.breadcrumbList([
          { name: "Home", url: SITE_URL },
          { name: "Resources", url: `${SITE_URL}/resources` },
          { name: hub.label, url: `${SITE_URL}${hub.href}` },
        ])}
      />
      <JsonLd
        data={structuredDataSchemas.webPage({
          name: `${hub.label} Hub`,
          url: `${SITE_URL}${hub.href}`,
          description: hub.description ?? "",
          pageType: "CollectionPage",
          dateModified: "2026-05-02",
        })}
      />
      <JsonLd
        data={structuredDataSchemas.itemList({
          name: `${hub.label} resource links`,
          description: hub.description ?? "",
          items: uniqueLinks.map((link) => ({
            name: link.label,
            url: link.href,
          })),
        })}
      />

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              Resource Hub
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              {hub.label}
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
              {hub.description}
            </p>
          </div>
        </div>
      </section>

      <section className="border-y bg-muted/30 py-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-5xl gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-5">
            {resourceMegamenuHubs.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block min-h-[44px] rounded-lg border bg-card p-4 no-underline transition-colors hover:bg-background"
              >
                <div className="text-sm font-semibold">{item.label}</div>
                <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {item.id === hubId ? "Current hub" : item.description}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-6">
            {sections.map((section) => (
              <div
                key={section.title}
                className="rounded-xl border bg-card p-6 shadow-sm"
              >
                <div className="mb-5 flex items-start gap-3">
                  <Network
                    className="mt-1 h-5 w-5 text-primary"
                    aria-hidden="true"
                  />
                  <div>
                    <h2 className="text-2xl font-bold">{section.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {section.description}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {section.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex min-h-12 items-center gap-2 rounded-full border border-border/70 px-3 py-2 text-sm font-medium no-underline transition-colors hover:bg-muted"
                    >
                      <span>{link.label}</span>
                      <ArrowRight
                        className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-foreground py-14 text-background">
        <div className="container mx-auto px-4 text-center sm:px-6 lg:px-8">
          <p className="mx-auto max-w-2xl text-lg text-background/80">
            Move from research to a defensible reconciliation file with an
            export-first workflow.
          </p>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="mt-5 w-full sm:w-auto"
          >
            <Link href={buildTrialLink({ content: `${hubId}_hub_cta` })}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {relatedHubs.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex min-h-[44px] items-center rounded-full border border-background/20 px-3 py-1.5 text-sm font-medium text-background no-underline hover:bg-background/10"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
