import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { slugToTitle } from "@/lib/slug-to-title";
import {
  Monitor,
  Navigation,
  Settings,
  Tag,
  Download,
  AlertTriangle,
  Plug,
  StickyNote,
  HelpCircle,
} from "lucide-react";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { JsonLd } from "@/components/JsonLd";
import { getAllSoftware, getSoftware } from "@/lib/content/pseo-data";
import { RelatedContent } from "@/components/content/RelatedContent";
import { CrossSiteCallout } from "@/components/content/CrossSiteCallout";
import {
  filterByRetainedSlugs,
  RETAINED_SOFTWARE_GUIDE_SLUGS,
} from "@/lib/seo/content-governance";

interface Props {
  params: Promise<{ product: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const software = filterByRetainedSlugs(
    await getAllSoftware(),
    RETAINED_SOFTWARE_GUIDE_SLUGS,
  );
  return software.map((s) => ({ product: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { product: productSlug } = await params;
  const sw = await getSoftware(productSlug);
  if (!sw) notFound();

  const title = `${sw.name} CAM Reconciliation Setup Guide - Configuration & Export | CapVeri`;
  const description = `How to configure CAM reconciliation in ${sw.name}. ${sw.camModuleName} setup: recovery pools, charge codes, export procedures, and common mistakes to avoid.`;
  const url = `${SITE_URL}/resources/software/${sw.slug}/cam-setup`;

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

export default async function SoftwareCamSetupPage({ params }: Props) {
  const { product: productSlug } = await params;
  const sw = await getSoftware(productSlug);
  if (!sw) notFound();

  const url = `${SITE_URL}/resources/software/${sw.slug}/cam-setup`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${sw.name} CAM Reconciliation Setup Guide`,
    author: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    publisher: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    datePublished: "2026-03-17",
    dateModified: "2026-05-08",
    url,
    about: {
      "@type": "SoftwareApplication",
      name: sw.name,
      applicationCategory: "Property Management Software",
    },
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
        name: "Software Guides",
        item: `${SITE_URL}/resources/software`,
      },
      { "@type": "ListItem", position: 4, name: sw.name, item: url },
    ],
  };

  const faqSchema =
    sw.troubleshooting && sw.troubleshooting.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: sw.troubleshooting.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }
      : null;

  const sections = [
    {
      icon: Navigation,
      title: "Module Navigation",
      content: sw.moduleNavigation,
    },
    {
      icon: Settings,
      title: "Recovery Pool Configuration",
      content: sw.recoveryPoolConfig,
    },
    {
      icon: Tag,
      title: "Charge Code Setup",
      content: sw.chargeCodeSetup,
    },
    {
      icon: Download,
      title: "Export Procedure for CapVeri",
      content: sw.exportProcedure,
    },
  ];

  return (
    <ContentPageLayout
      pageName={`${sw.name} CAM Setup`}
      backHref="/resources/software"
      backLabel="Software Guides"
    >
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />
      {faqSchema && <JsonLd data={faqSchema} />}

      <article className="prose prose-gray max-w-none">
        {/* Header */}
        <div className="not-prose mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
              <Monitor className="h-3.5 w-3.5 mr-1.5" />
              {sw.vendor}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {sw.name} CAM Reconciliation Setup Guide
          </h1>
          <p className="text-lg text-muted-foreground">
            How to configure CAM reconciliation, export data, and avoid common
            mistakes in {sw.name}.
          </p>
        </div>

        {/* CAM Module Name */}
        <div className="not-prose rounded-lg border bg-muted/30 p-5 mb-8">
          <div className="flex items-start gap-3">
            <Monitor className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-1">
                CAM Module
              </h2>
              <p className="font-medium">{sw.camModuleName}</p>
            </div>
          </div>
        </div>

        {/* Configuration Sections */}
        <div className="not-prose space-y-6 mb-10">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.title} className="rounded-lg border p-5">
                <div className="flex items-start gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <h2 className="font-semibold mb-2">{section.title}</h2>
                    <p className="text-foreground">{section.content}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Common Mistakes */}
        <div className="not-prose mb-10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Common Mistakes to Avoid
          </h2>
          <div className="space-y-3">
            {sw.commonMistakes.map((mistake, i) => (
              <div
                key={i}
                className="rounded-lg border border-warning/30 bg-warning/10 p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-warning/30 text-warning-foreground text-xs font-bold">
                    {i + 1}
                  </span>
                  <p className="text-sm text-foreground">{mistake}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CapVeri Integration */}
        <div className="not-prose rounded-lg border-l-4 border-primary bg-primary/5 p-5 mb-10">
          <div className="flex items-start gap-3">
            <Plug className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-2">
                How {sw.name} Works with CapVeri
              </h2>
              <p className="text-muted-foreground">{sw.capveriIntegration}</p>
            </div>
          </div>
        </div>

        {/* Export QA */}
        <div className="not-prose rounded-lg border p-5 mb-10">
          <h2 className="text-xl font-bold mb-3">
            Export QA Checklist Before Reconciliation
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            When {sw.name} CAM setup breaks, the first symptom is usually an
            export, recovery pool, or billed amount that will not tie. Check
            these items before changing lease math.
          </p>
          <ul className="space-y-2 text-sm">
            <li>
              Confirm the export covers the full fiscal year and includes
              late-posted accruals.
            </li>
            <li>
              Compare GL detail totals to the trial balance by account range.
            </li>
            <li>
              Verify new mid-year expense accounts were mapped to the right
              recovery pool.
            </li>
            <li>
              Keep property, tenant, suite, account, date, and amount columns on
              every row.
            </li>
            <li>
              Remove report headers, subtotal rows, and page totals before
              importing.
            </li>
          </ul>
        </div>

        {/* Notes */}
        {sw.notes && (
          <div className="not-prose mb-10">
            <div className="flex items-start gap-3">
              <StickyNote className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="text-xl font-bold mb-3">About {sw.name}</h2>
                <p className="text-muted-foreground">{sw.notes}</p>
              </div>
            </div>
          </div>
        )}

        {/* Troubleshooting FAQ */}
        {sw.troubleshooting && sw.troubleshooting.length > 0 && (
          <div className="not-prose mb-10">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Troubleshooting Common {sw.name} Issues
            </h2>
            <div className="space-y-4">
              {sw.troubleshooting.map((item, i) => (
                <div key={i} className="rounded-lg border p-5">
                  <h3 className="font-semibold mb-2">{item.q}</h3>
                  <p className="text-sm text-muted-foreground">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related Resources */}
        <RelatedContent
          links={
            sw.relatedResources && sw.relatedResources.length > 0
              ? [
                  ...sw.relatedResources.map((href) => ({
                    href,
                    label: slugToTitle(href),
                  })),
                  ...(sw.relatedTools ?? []).map((href) => ({
                    href,
                    label: slugToTitle(href),
                  })),
                ]
              : [
                  {
                    href: "/blog/cam-numbers-not-matching-yardi",
                    label: "Why CAM Numbers Don't Match",
                  },
                  {
                    href: "/resources/workflows/year-end-reconciliation",
                    label: "GL Export Reconciliation Workflow",
                  },
                  {
                    href: "/tools/cam-billing-error-estimator",
                    label: "CAM Billing Error Estimator",
                  },
                  {
                    href: "/tools/recovery-gap-analyzer",
                    label: "Billing Gap Analyzer",
                  },
                ]
          }
        />

        {/* Cross-site: lease abstraction referral */}
        <CrossSiteCallout />

        {/* CTA */}
        <div className="not-prose rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-bold mb-2">
            Validate Your {sw.name} Exports
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Export your GL data from {sw.name} as CSV. Upload to CapVeri to
            catch gross-up errors, cap violations, and allocation mistakes
            before tenants find them.
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
