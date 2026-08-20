import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Receipt,
  AlertTriangle,
  DollarSign,
  FileText,
  ListChecks,
  ShieldX,
  TrendingUp,
  BookOpen,
  Hash,
} from "lucide-react";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { JsonLd } from "@/components/JsonLd";
import {
  getAllExpenseCategories,
  getExpenseCategory,
} from "@/lib/content/pseo-data";
import { RelatedContent } from "@/components/content/RelatedContent";
import { CrossSiteCallout } from "@/components/content/CrossSiteCallout";
import { slugToTitle } from "@/lib/slug-to-title";

interface Props {
  params: Promise<{ category: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const categories = await getAllExpenseCategories();
  return categories.map((category) => ({ category: category.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: catSlug } = await params;
  const cat = await getExpenseCategory(catSlug);
  if (!cat) notFound();

  const title = `${cat.name} in CAM Reconciliation - Expense Guide | CapVeri`;
  const description = `${cat.name} CAM expense guide: GL codes, recoverable vs non-recoverable components, allocation methods, billing errors, and benchmarks per SF for commercial landlords.`;
  const url = `${SITE_URL}/resources/expenses/${cat.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
    },
  };
}

export default async function ExpenseCategoryPage({ params }: Props) {
  const { category: catSlug } = await params;
  const cat = await getExpenseCategory(catSlug);
  if (!cat) notFound();

  const url = `${SITE_URL}/resources/expenses/${cat.slug}`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${cat.name} in CAM Reconciliation`,
    author: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    publisher: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    datePublished: "2026-03-17",
    dateModified: "2026-05-08",
    url,
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Resources",
        item: `${SITE_URL}/resources`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Expense Categories",
        item: `${SITE_URL}/resources/expenses`,
      },
      { "@type": "ListItem", position: 4, name: cat.name, item: url },
    ],
  };

  const benchmarks = [
    { label: "Office", value: cat.benchmarksPerSF.office },
    { label: "Retail", value: cat.benchmarksPerSF.retail },
    { label: "Industrial", value: cat.benchmarksPerSF.industrial },
  ].filter((b) => b.value !== null);

  return (
    <ContentPageLayout
      pageName={`${cat.name} Expense Guide`}
      backHref="/resources/expenses"
      backLabel="Expense Categories"
    >
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />

      <article className="prose prose-gray max-w-none">
        {/* Header */}
        <div className="not-prose mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">
              CAM Expense Category
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {cat.name} in CAM Reconciliation
          </h1>
          <p className="text-lg text-muted-foreground">{cat.definition}</p>
        </div>

        {/* Benchmark Cost */}
        <div className="not-prose rounded-lg border bg-muted/30 p-5 mb-8">
          <div className="flex items-start gap-3">
            <DollarSign className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">
                Benchmarks per SF
              </h2>
              <div className="flex flex-wrap gap-4">
                {benchmarks.map((b) => (
                  <div key={b.label}>
                    <span className="text-lg font-bold">
                      ${b.value!.toFixed(2)}
                    </span>
                    <span className="text-sm text-muted-foreground ml-1">
                      {b.label}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Source: {cat.benchmarksPerSF.source}
              </p>
            </div>
          </div>
        </div>

        {/* GL Codes */}
        <div className="not-prose rounded-lg border p-5 mb-6">
          <div className="flex items-start gap-3">
            <Hash className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-3">Typical GL Codes</h2>
              <div className="flex flex-wrap gap-2">
                {cat.typicalGlCodes.map((code) => (
                  <span
                    key={code}
                    className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-sm font-mono"
                  >
                    {code}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recoverable Components */}
        <div className="not-prose rounded-lg border p-5 mb-6">
          <div className="flex items-start gap-3">
            <ListChecks className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-3">Recoverable Components</h2>
              <ul className="space-y-1">
                {cat.recoverableComponents.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-success/100 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Non-Recoverable Components */}
        <div className="not-prose rounded-lg border p-5 mb-6">
          <div className="flex items-start gap-3">
            <ShieldX className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-3">Non-Recoverable Components</h2>
              <ul className="space-y-1">
                {cat.nonRecoverableComponents.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive/70 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Allocation Method */}
        <div className="not-prose rounded-lg border p-5 mb-6">
          <div className="flex items-start gap-3">
            <BookOpen className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-2">Allocation Method</h2>
              <p className="text-foreground">{cat.allocationMethod}</p>
            </div>
          </div>
        </div>

        {/* Common Lease Language */}
        <div className="not-prose rounded-lg border-l-4 border-primary bg-primary/5 p-5 mb-6">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-2">Common Lease Language</h2>
              <p className="text-muted-foreground italic">
                &ldquo;{cat.commonLeaseLanguage}&rdquo;
              </p>
            </div>
          </div>
        </div>

        {/* Common Billing Errors */}
        <div className="not-prose rounded-lg border border-destructive/30 bg-destructive/10 p-5 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-3">Common Billing Errors</h2>
              <ul className="space-y-2">
                {cat.commonBillingErrors.map((error) => (
                  <li key={error} className="flex items-start gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive/100 mt-1.5 flex-shrink-0" />
                    {error}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* YoY Trends */}
        <div className="not-prose rounded-lg border p-5 mb-10">
          <div className="flex items-start gap-3">
            <TrendingUp className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-2">Year-over-Year Trends</h2>
              <p className="text-foreground">{cat.yoyTrends}</p>
            </div>
          </div>
        </div>

        {/* Audit Flags */}
        <div className="not-prose rounded-lg border p-5 mb-10">
          <h2 className="text-xl font-bold mb-3">Audit Flags for {cat.name}</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Review this category before tenant statements go out when the GL
            activity, lease language, or benchmark range moves out of pattern.
          </p>
          <ul className="space-y-2 text-sm">
            <li>
              Compare current-year spend to prior-year actuals and budget by
              account.
            </li>
            <li>
              Separate contract base charges from one-time repairs, credits, and
              late invoices.
            </li>
            <li>
              Check whether the lease treats this category as controllable,
              non-controllable, or excluded.
            </li>
            <li>
              Verify that direct tenant charges are not also included in the
              shared CAM pool.
            </li>
            <li>
              Retain invoices for material variances in the audit support
              package.
            </li>
          </ul>
        </div>

        {/* Notes */}
        {cat.notes && (
          <div className="not-prose mb-10">
            <h2 className="text-xl font-bold mb-3">Additional Context</h2>
            <p className="text-muted-foreground">{cat.notes}</p>
          </div>
        )}

        {/* Cross-site Callout */}
        <CrossSiteCallout />

        {/* Related Resources */}
        <RelatedContent
          links={
            cat.relatedResources && cat.relatedResources.length > 0
              ? [
                  ...cat.relatedResources.map((href) => ({
                    href,
                    label: slugToTitle(href),
                  })),
                  ...(cat.relatedTools ?? []).map((href) => ({
                    href,
                    label: slugToTitle(href),
                  })),
                ]
              : [
                  {
                    href: "/glossary/cam-reconciliation",
                    label: "What is CAM Reconciliation?",
                  },
                  {
                    href: "/resources/lease-clauses/cumulative-cam-cap",
                    label: "CAM Cap Lease Clause",
                  },
                  {
                    href: "/blog/cam-reconciliation-errors",
                    label: "Common CAM Reconciliation Errors",
                  },
                  {
                    href: "/tools/cam-gross-up-calculator",
                    label: "CAM Gross-Up Calculator",
                  },
                ]
          }
        />

        {/* CTA */}
        <div className="not-prose rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-bold mb-2">
            Audit Your {cat.name} Charges
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            CapVeri validates every expense line item against lease terms and
            market benchmarks - catching non-recoverable charges, gross-up
            errors, and misclassifications automatically.
          </p>
          <Link
            href="/pricing"
            className="inline-flex min-h-[44px] items-center rounded-button bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start free trial
          </Link>
        </div>
      </article>
    </ContentPageLayout>
  );
}
