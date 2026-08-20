import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Calculator,
  FileSpreadsheet,
  Monitor,
  Receipt,
  Scale,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { getAllPosts } from "@/lib/content/mdx";
import { SEO_CLUSTERS } from "@/lib/seo/clusters";
import { resourcesMegamenuPillars } from "@/lib/seo/resources-megamenu";
import { JsonLd } from "@/components/JsonLd";
import { structuredDataSchemas } from "@/lib/structured-data";

const TOPIC_HUB_LABELS: Record<string, string> = {
  tofu: "Start here",
  mofu: "Core guide",
  bofu: "Decision",
};

const resourcesBreadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: SITE_URL },
  { name: "Resources", url: `${SITE_URL}/resources` },
]);

const resourcesFaqSchema = structuredDataSchemas.faqPage([
  {
    question:
      "What should a landlord read first before sending CAM statements?",
    answer:
      "Start with the export guide, the gross-up calculation guide, and the pro-rata share guide. Those three pages cover the files you need, the math that most often goes wrong, and the denominator logic that drives nearly every CAM dispute.",
  },
  {
    question:
      "Which resource pages matter most for year-end reconciliation work?",
    answer:
      "The highest-value pages are the software setup/export guides, the lease clause and expense playbooks, the BOMA reference pages, and the state-by-state disclosure guide. Those pages map directly to the operational questions property accountants and controllers face during reconciliation season.",
  },
  {
    question: "Why did CapVeri narrow the resource library?",
    answer:
      "Because broad, templated SEO pages do not help operators close a reconciliation file. This library now concentrates on fewer pages with better worked examples, clearer decision logic, and more defensible process guidance.",
  },
]);

const RESOURCES_TITLE =
  "CAM Reconciliation Resources for Controllers and Landlords";
const RESOURCES_DESC =
  "Operator-focused CAM reconciliation guides: exports, gross-up, pro-rata share, lease clauses, recoverable expenses, BOMA rules, and disclosure requirements.";

const featuredSlugs = new Set([
  "export-guide",
  "cam-gross-up-calculation-guide",
  "pro-rata-share-calculation",
  "export-cam-yardi-voyager",
  "export-cam-mri",
]);

const clusterCards = [
  {
    href: "/resources/software",
    icon: Monitor,
    title: "Software and Export Guides",
    description:
      "Exact report paths, field selections, export order, and QA checks for Yardi, MRI, RealPage, Entrata, Sage Intacct, and AppFolio.",
  },
  {
    href: "/resources/lease-clauses",
    icon: Scale,
    title: "Lease Clause Playbooks",
    description:
      "Gross-up thresholds, caps, base year language, admin fees, and the clause wording that changes whether a charge is defensible.",
  },
  {
    href: "/resources/expenses",
    icon: Receipt,
    title: "Expense Classification",
    description:
      "What belongs in CAM, what should stay out, and which GL lines trigger the most tenant pushback.",
  },
  {
    href: "/resources/boma",
    icon: BookOpen,
    title: "BOMA Standards",
    description:
      "How rentable area, load factors, and measurement changes affect pro-rata share and annual recovery math.",
  },
  {
    href: "/resources/commercial-tenant-cam-disclosure-by-state",
    icon: ShieldAlert,
    title: "Disclosure and Documentation Rules",
    description:
      "The compliance page to use when a tenant asks what must be disclosed, how fast support must be delivered, and where stale charges become unsafe.",
  },
  {
    href: "/vs",
    icon: FileSpreadsheet,
    title: "Comparison Pages",
    description:
      "Commercial evaluation pages for teams deciding whether to keep working inside their ERP and spreadsheets or move reconciliation QA into CapVeri.",
  },
];

const directorySections = [
  {
    title: "Reconciliation fundamentals",
    links: [
      { label: "CAM reconciliation guide", href: "/cam-reconciliation-guide" },
      {
        label: "What is CAM reconciliation?",
        href: "/resources/common-area-maintenance-reconciliation-explained",
      },
      { label: "CAM charges guide", href: "/cam-charges" },
      { label: "CAM audit guide", href: "/cam-audit" },
      {
        label: "CAM reconciliation software",
        href: "/cam-reconciliation-software",
      },
    ],
  },
  {
    title: "Guides by topic",
    links: [
      { label: "BOMA measurement standards", href: "/resources/boma" },
      { label: "CAM compliance by state", href: "/resources/states" },
      { label: "CAM guides by market", href: "/resources/markets" },
      { label: "CAM by property type", href: "/resources/property-types" },
      { label: "CAM by role", href: "/resources/roles" },
      { label: "CAM workflows", href: "/resources/workflows" },
      { label: "CAM calendar", href: "/resources/calendar" },
      { label: "CAM dispute guides", href: "/resources/cam-dispute" },
      { label: "CAM calculation scenarios", href: "/resources/calculations" },
      { label: "Commercial lease types", href: "/resources/lease-types" },
    ],
  },
  {
    title: "Lease, expense, and software hubs",
    links: [
      { label: "Lease clause playbooks", href: "/resources/lease-clauses" },
      { label: "Recoverable expense guides", href: "/resources/expenses" },
      { label: "Property software setup guides", href: "/resources/software" },
      { label: "Operator templates", href: "/resources/templates" },
      {
        label: "CAM reconciliation example",
        href: "/resources/cam-reconciliation-example",
      },
      {
        label: "How to calculate CAM charges",
        href: "/resources/how-to-calculate-cam-charges",
      },
    ],
  },
  {
    title: "Compare and choose",
    links: [
      { label: "Compare CapVeri", href: "/vs" },
      { label: "Alternatives", href: "/alternatives" },
      { label: "Integrations", href: "/integrations" },
      { label: "Solutions", href: "/solutions" },
      { label: "Switch guides", href: "/switch" },
      {
        label: "Best CAM reconciliation software",
        href: "/best/cam-reconciliation-software",
      },
      { label: "ROI calculator", href: "/roi" },
      { label: "Pricing", href: "/pricing" },
      { label: "Product tour", href: "/product-tour" },
      { label: "Sample report", href: "/sample-report" },
    ],
  },
  {
    title: "Reference and tools",
    links: [
      { label: "Tools directory", href: "/tools" },
      { label: "CAM glossary", href: "/glossary" },
      {
        label: "CAM glossary for CRE FinOps",
        href: "/resources/cam-glossary-cre-finops",
      },
      {
        label: "Operating expense reconciliation",
        href: "/resources/commercial-lease-operating-expense-reconciliation",
      },
      { label: "Blog", href: "/blog" },
      { label: "Sources and research", href: "/sources" },
      { label: "Help center", href: "/help" },
      { label: "Documentation", href: "/docs" },
    ],
  },
  {
    title: "Operator tools and worksheets",
    links: [
      {
        label: "Commercial lease audit software",
        href: "/commercial-lease-audit-software",
      },
      {
        label: "Yardi export QA checklist",
        href: "/tools/yardi-export-qa-checklist",
      },
      {
        label: "MRI recovery billing QA checklist",
        href: "/tools/mri-recovery-billing-qa-checklist",
      },
      {
        label: "Multi-state CAM disclosure matrix",
        href: "/tools/multi-state-cam-disclosure-matrix",
      },
      {
        label: "CAM recovery ratio worksheet",
        href: "/tools/cam-recovery-ratio-worksheet",
      },
      {
        label: "Property tax appeal recovery calculator",
        href: "/tools/property-tax-appeal-recovery-calculator",
      },
      {
        label: "Tenant dispute response letter template",
        href: "/tools/tenant-dispute-response-letter-template",
      },
      {
        label: "Lease clause extraction matrix",
        href: "/tools/lease-clause-extraction-matrix",
      },
    ],
  },
];

export const metadata: Metadata = {
  title: RESOURCES_TITLE,
  description: RESOURCES_DESC,
  alternates: { canonical: `${SITE_URL}/resources` },
  openGraph: {
    title: RESOURCES_TITLE,
    description: RESOURCES_DESC,
    url: `${SITE_URL}/resources`,
    type: "website",
    images: [
      {
        url: `${SITE_URL}/api/og?title=${encodeURIComponent("CAM Reconciliation Resources")}&category=Resource`,
        width: 1200,
        height: 630,
        alt: RESOURCES_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: RESOURCES_TITLE,
    description: RESOURCES_DESC,
  },
};

export default async function ResourcesHub() {
  const resources = await getAllPosts("resources");
  const featuredResources = resources.filter((resource) =>
    featuredSlugs.has(resource.slug),
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={resourcesBreadcrumbSchema} />
      <JsonLd data={resourcesFaqSchema} />
      <JsonLd
        data={structuredDataSchemas.webPage({
          name: RESOURCES_TITLE,
          url: `${SITE_URL}/resources`,
          description: RESOURCES_DESC,
          pageType: "CollectionPage",
          dateModified: "2026-04-17",
        })}
      />

      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              Resource library
            </p>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Fewer pages. Better reconciliation guidance.
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-lg text-muted-foreground">
              This library is built for controllers, property accountants, and
              asset managers who need to close CAM work cleanly. It focuses on
              the pages that actually drive defensible statements: exports,
              calculations, expense classification, BOMA, and lease language.
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
            <div className="rounded-xl border bg-card p-5">
              <div className="text-3xl font-bold text-primary">
                {featuredResources.length}
              </div>
              <p className="mt-2 text-sm font-medium">
                Priority operator guides
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The pages most likely to prevent a broken reconciliation.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <div className="text-3xl font-bold text-primary">5</div>
              <p className="mt-2 text-sm font-medium">Core risk areas</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Exports, gross-up, pro-rata share, clauses, and recoverability.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <div className="text-3xl font-bold text-primary">0</div>
              <p className="mt-2 text-sm font-medium">Template filler pages</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pages now need worked logic, examples, and operational use.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/30 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-bold">
              Start with the cluster you need
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Each hub below consolidates the pages worth using during an actual
              reconciliation cycle.
            </p>
          </div>

          <div className="mx-auto mt-8 grid max-w-5xl gap-4 md:grid-cols-2 xl:grid-cols-3">
            {clusterCards.map(({ href, icon: Icon, title, description }) => (
              <Link
                key={href}
                href={href}
                className="rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:bg-background"
              >
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-primary/10 p-2.5">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 max-w-3xl">
              <h2 className="text-2xl font-bold">Topic hubs</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Start with the area closest to the reconciliation problem in
                front of you. Each hub connects the core guide, related tools,
                and the next operational pages.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {SEO_CLUSTERS.map((cluster) => (
                <div
                  key={cluster.id}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">
                        <Link href={cluster.hub.href}>{cluster.label}</Link>
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {cluster.description}
                      </p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase text-primary">
                      {TOPIC_HUB_LABELS[cluster.funnelStage] ?? "Guide"}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={cluster.hub.href}
                      className="inline-flex min-h-11 items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium no-underline hover:bg-muted"
                    >
                      Hub
                    </Link>
                    <Link
                      href={cluster.product.href}
                      className="inline-flex min-h-11 items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium no-underline hover:bg-muted"
                    >
                      Product path
                    </Link>
                    {cluster.priorityRoutes.slice(0, 3).map((route) => (
                      <Link
                        key={route.href}
                        href={route.href}
                        className="inline-flex min-h-11 items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium no-underline hover:bg-muted"
                      >
                        {route.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 max-w-3xl">
              <h2 className="text-2xl font-bold">
                Complete resource directory
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                This page lists every guide and tool we have. The top menu shows
                the popular ones. Here you can see them all, grouped by topic.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {directorySections.map((section) => (
                <div
                  key={section.title}
                  className="rounded-xl border border-border bg-card p-6 shadow-sm"
                >
                  <h3 className="text-lg font-semibold">{section.title}</h3>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {section.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="inline-flex min-h-11 items-center rounded-full border border-border/70 px-3 py-2 text-sm font-medium no-underline transition-colors hover:bg-muted"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex items-center gap-3">
              <Calculator className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-2xl font-bold">Best pages to read first</h2>
                <p className="text-sm text-muted-foreground">
                  These are the retained pages most likely to answer the first
                  operational question in a reconciliation workflow.
                </p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {featuredResources.map((resource) => (
                <div
                  key={resource.slug}
                  className="rounded-xl border border-border bg-card p-6 shadow-sm"
                >
                  <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <BookOpen className="h-3 w-3" />
                    Featured guide
                  </p>
                  <h3 className="text-xl font-semibold">
                    {resource.frontmatter.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {resource.frontmatter.description}
                  </p>
                  <Button asChild variant="outline" className="mt-5 w-full">
                    <Link href={`/resources/${resource.slug}`}>
                      {resource.frontmatter.buttonText}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-foreground py-16 text-background">
        <div className="container mx-auto px-4 text-center sm:px-6 lg:px-8">
          <div className="mx-auto mb-8 grid max-w-5xl gap-4 text-left md:grid-cols-5">
            {resourcesMegamenuPillars.map((pillar) => (
              <div key={pillar.href}>
                <Link
                  href={pillar.href}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-background no-underline hover:text-background/80"
                >
                  {pillar.label}
                </Link>
                <p className="mt-1 text-xs leading-relaxed text-background/60">
                  {pillar.description}
                </p>
              </div>
            ))}
          </div>
          <p className="text-lg text-background/80">
            If your team still closes reconciliation in spreadsheets, start with
            the export workflow and then use CapVeri to test one live CAM file
            before statements go out.
          </p>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="mt-5 w-full sm:w-auto"
          >
            <Link href={buildTrialLink({ content: "resources_hub_cta" })}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
