import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { slugToTitle } from "@/lib/slug-to-title";
import {
  Download,
  CheckCircle,
  ArrowRight,
  FileText,
  HelpCircle,
} from "lucide-react";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { getAllTemplates, getTemplate } from "@/lib/content/pseo-data";
import { CrossSiteCallout } from "@/components/content/CrossSiteCallout";

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const templates = await getAllTemplates();
  return templates.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const template = await getTemplate(slug);
  if (!template) notFound();

  const url = `${SITE_URL}/resources/templates/${template.slug}`;

  return {
    title: template.metaTitle,
    description: template.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: template.metaTitle,
      description: template.metaDescription,
      url,
      type: "article",
    },
  };
}

export default async function TemplatePage({ params }: Props) {
  const { slug } = await params;
  const template = await getTemplate(slug);
  if (!template) notFound();

  const url = `${SITE_URL}/resources/templates/${template.slug}`;

  const faqSchema =
    template.faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: template.faqs.map((faq) => ({
            "@type": "Question",
            name: faq.q,
            acceptedAnswer: { "@type": "Answer", text: faq.a },
          })),
        }
      : null;

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
        name: "Templates",
        item: `${SITE_URL}/resources/templates`,
      },
      { "@type": "ListItem", position: 4, name: template.name, item: url },
    ],
  };

  return (
    <ContentPageLayout
      pageName={template.name}
      backHref="/resources"
      backLabel="Resources"
    >
      {faqSchema && <JsonLd data={faqSchema} />}
      <JsonLd data={breadcrumbSchema} />

      <article className="prose prose-gray max-w-none">
        {/* Header */}
        <div className="not-prose mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Free Template
            </span>
            <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-mono font-medium text-muted-foreground">
              {template.format}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {template.headline}
          </h1>
          <p className="text-lg text-muted-foreground">
            {template.description}
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            Last updated:{" "}
            {new Date(template.lastUpdated).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
            })}
          </p>
        </div>

        {/* Who it's for */}
        <div className="not-prose rounded-lg border-l-4 border-primary bg-primary/5 p-5 mb-8">
          <p className="text-sm font-semibold text-primary mb-1">
            Who This Is For
          </p>
          <p className="text-foreground">{template.useCase}</p>
        </div>

        {/* Download CTA */}
        <div className="not-prose rounded-xl border border-primary/30 bg-primary/5 p-6 mb-8">
          <h2 className="text-base font-semibold text-foreground mb-2">
            Get This Template
          </h2>
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-sm font-medium text-foreground mb-1">
                Online Generator (Free)
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Enter your data and generate a formatted reconciliation
                statement instantly. No signup required.
              </p>
              <Button asChild size="sm" className="w-full">
                <Link href="/tools/reconciliation-statement-generator">
                  Use Online Generator
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-sm font-medium text-foreground mb-1">
                {template.format} Download (Free)
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Pre-formatted {template.format} file ready to populate with your
                property data.
              </p>
              <Button asChild variant="outline" size="sm" className="w-full">
                <a
                  href={buildTrialLink({
                    content: `template_${template.slug}`,
                  })}
                >
                  Download Template
                  <Download className="ml-2 h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>
        </div>

        {/* What's Included */}
        <div className="not-prose mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            What&apos;s Included
          </h2>
          <div className="rounded-lg border p-5">
            <ul className="space-y-2">
              {template.sections.map((section, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  <span>{section}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Key Features */}
        {template.keyFeatures.length > 0 && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-4">Key Features</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {template.keyFeatures.map((feature, i) => (
                <div
                  key={i}
                  className="rounded-lg border bg-card p-4 flex items-start gap-2"
                >
                  <CheckCircle className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FAQs */}
        {template.faqs.length > 0 && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {template.faqs.map((faq, i) => (
                <div key={i} className="rounded-lg border p-5">
                  <p className="font-semibold mb-2 text-sm">{faq.q}</p>
                  <p className="text-sm text-muted-foreground">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cross-site Callout */}
        <CrossSiteCallout />

        {/* Related Tools */}
        {template.relatedTools.length > 0 && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-4">Related Tools</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {template.relatedTools.map((toolSlug) => (
                <Link
                  key={toolSlug}
                  href={`/tools/${toolSlug}`}
                  className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors duration-200"
                >
                  <ArrowRight className="h-4 w-4 flex-shrink-0" />
                  {slugToTitle(`/tools/${toolSlug}`)}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Related Resources */}
        {template.relatedResources.length > 0 && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-4">Related Resources</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {template.relatedResources.map((href) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors duration-200"
                >
                  <ArrowRight className="h-4 w-4 flex-shrink-0" />
                  {slugToTitle(href)}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Bottom CTA */}
        <div className="not-prose rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-bold mb-2">
            Skip the Template - Automate the Whole Reconciliation
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Import your GL export from Yardi or MRI. CapVeri calculates pro-rata
            share, gross-up, and caps automatically. It also flags the errors
            your current process misses.
          </p>
          <a
            href={buildTrialLink({ content: `template_cta_${template.slug}` })}
            className="inline-flex items-center rounded-button bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start free trial
            <ArrowRight className="h-4 w-4 ml-2" />
          </a>
        </div>
      </article>
    </ContentPageLayout>
  );
}
