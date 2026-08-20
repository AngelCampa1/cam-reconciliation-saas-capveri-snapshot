import { SITE_URL, TRIAL_COPY } from "@/lib/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle,
  FileText,
  ShieldAlert,
  ArrowRight,
  HelpCircle,
} from "lucide-react";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { JsonLd } from "@/components/JsonLd";
import { getAllDisputeTypes, getDisputeType } from "@/lib/content/pseo-data";
import { CrossSiteCalloutCamAudit } from "@/components/content/CrossSiteCallout";
import { slugToTitle } from "@/lib/slug-to-title";

interface Props {
  params: Promise<{ type: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const types = await getAllDisputeTypes();
  return types.map((t) => ({ type: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type } = await params;
  const dispute = await getDisputeType(type);
  if (!dispute) notFound();

  const url = `${SITE_URL}/resources/cam-dispute/${dispute.slug}`;

  return {
    title: dispute.metaTitle,
    description: dispute.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: dispute.metaTitle,
      description: dispute.metaDescription,
      url,
      type: "article",
    },
  };
}

const AUDIENCE_LABELS: Record<string, string> = {
  tenant: "For Tenants",
  landlord: "For Landlords",
  both: "For Tenants & Landlords",
};

const AUDIENCE_COLORS: Record<string, { badge: string; dot: string }> = {
  tenant: {
    badge: "bg-primary/10 text-primary",
    dot: "bg-primary",
  },
  landlord: {
    badge: "bg-secondary/10 text-secondary-foreground",
    dot: "bg-secondary-foreground",
  },
  both: {
    badge: "bg-success/10 text-success-strong",
    dot: "bg-success",
  },
};

export default async function CamDisputeDetailPage({ params }: Props) {
  const { type } = await params;
  const dispute = await getDisputeType(type);
  if (!dispute) notFound();

  const url = `${SITE_URL}/resources/cam-dispute/${dispute.slug}`;
  const audienceStyle =
    AUDIENCE_COLORS[dispute.audience] ?? AUDIENCE_COLORS.both;

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: dispute.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
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
        name: "CAM Dispute Guides",
        item: `${SITE_URL}/resources/cam-dispute`,
      },
      { "@type": "ListItem", position: 4, name: dispute.name, item: url },
    ],
  };

  return (
    <ContentPageLayout
      pageName={dispute.name}
      backHref="/resources/cam-dispute"
      backLabel="CAM Dispute Guides"
    >
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />

      <article className="prose prose-gray max-w-none">
        {/* Header */}
        <div className="not-prose mb-8">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
              <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
              CAM Dispute Guide
            </span>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium gap-1.5 ${audienceStyle.badge}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${audienceStyle.dot}`}
              />
              {AUDIENCE_LABELS[dispute.audience] ?? dispute.audience}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {dispute.headline}
          </h1>
          <p className="text-lg text-muted-foreground">{dispute.subheadline}</p>
        </div>

        {/* Overview */}
        <div className="not-prose rounded-lg border bg-muted/30 p-5 mb-8">
          <p className="text-foreground">{dispute.overview}</p>
        </div>

        {/* When to Use */}
        {dispute.whenToUse.length > 0 && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-4">When to Use This Guide</h2>
            <ul className="space-y-2">
              {dispute.whenToUse.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Step-by-Step Process */}
        <div className="not-prose mb-10">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Step-by-Step Process ({dispute.steps.length} steps)
          </h2>
          <div className="space-y-6">
            {dispute.steps.map((step) => (
              <div key={step.step} className="rounded-lg border p-5">
                <div className="flex items-start gap-4">
                  <span className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-sm font-bold">
                    {step.step}
                  </span>
                  <div className="flex-1 space-y-3">
                    <h3 className="font-semibold">{step.title}</h3>
                    <p className="text-sm text-foreground">
                      {step.description}
                    </p>

                    {step.warnings && step.warnings.length > 0 && (
                      <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
                        <p className="text-xs font-semibold text-warning-foreground mb-1 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Warnings:
                        </p>
                        <ul className="space-y-1">
                          {step.warnings.map((w, i) => (
                            <li key={i} className="text-xs text-warning-foreground">
                              • {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {step.tips && step.tips.length > 0 && (
                      <div className="rounded-md border border-success/30 bg-success/10 p-3">
                        <p className="text-xs font-semibold text-success-strong mb-1 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Tips:
                        </p>
                        <ul className="space-y-1">
                          {step.tips.map((tip, i) => (
                            <li key={i} className="text-xs text-success-strong">
                              • {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Template Content */}
        {dispute.templateContent && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Template
            </h2>
            <p className="text-xs text-muted-foreground mb-2">
              Copy and adapt the template below for your situation.
            </p>
            <pre className="rounded-lg border bg-muted/50 p-4 text-sm overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {dispute.templateContent}
            </pre>
          </div>
        )}

        {/* Common Mistakes */}
        {dispute.commonMistakes.length > 0 && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Common Mistakes
            </h2>
            <div className="space-y-3">
              {dispute.commonMistakes.map((mistake, i) => (
                <div
                  key={i}
                  className="rounded-md border border-warning/30 bg-warning/10 p-4"
                >
                  <p className="text-sm text-warning-foreground flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                    {mistake}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FAQ */}
        {dispute.faqs.length > 0 && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {dispute.faqs.map((faq, i) => (
                <div key={i} className="rounded-lg border p-5">
                  <p className="font-semibold mb-2">{faq.question}</p>
                  <p className="text-sm text-muted-foreground">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cross-site Callout */}
        <CrossSiteCalloutCamAudit />

        {/* Related Resources */}
        <RelatedContent
          links={dispute.relatedResources.map((href) => ({
            href,
            label: slugToTitle(href),
          }))}
        />

        {/* Related Tools */}
        <RelatedContent
          title="Free Tools for This Dispute"
          links={dispute.relatedTools.map((href) => ({
            href,
            label: slugToTitle(href),
          }))}
        />

        {/* CTA */}
        <div className="not-prose rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-bold mb-2">
            Build Your Case with Hard Numbers
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            CapVeri independently recalculates every line of your CAM
            reconciliation, flagging overbillings, cap overruns, and excluded
            expenses before or during a dispute. {TRIAL_COPY}, no credit card
            required.
          </p>
          <Link
            href="/pricing"
            className="inline-flex min-h-[44px] items-center rounded-button bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start free trial
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        </div>

        {/* Legal disclaimer */}
        <p className="not-prose mt-8 text-xs text-muted-foreground">
          This guide is general information, not legal advice. Lease terms,
          audit deadlines, and your rights vary by lease and by state. Talk to a
          qualified attorney before you act on your own situation.
        </p>
      </article>
    </ContentPageLayout>
  );
}
