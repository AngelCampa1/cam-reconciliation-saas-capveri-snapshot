import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Calculator,
  AlertTriangle,
  CheckCircle,
  BookOpen,
  ArrowRight,
} from "lucide-react";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { JsonLd } from "@/components/JsonLd";
import { getAllCalculations, getCalculation } from "@/lib/content/pseo-data";
import { CrossSiteCallout } from "@/components/content/CrossSiteCallout";
import { slugToTitle } from "@/lib/slug-to-title";

interface Props {
  params: Promise<{ scenario: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const calculations = await getAllCalculations();
  return calculations.map((c) => ({ scenario: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { scenario } = await params;
  const calculation = await getCalculation(scenario);
  if (!calculation) notFound();

  const url = `${SITE_URL}/resources/calculations/${calculation.slug}`;

  return {
    title: calculation.metaTitle,
    description: calculation.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: calculation.metaTitle,
      description: calculation.metaDescription,
      url,
      type: "article",
    },
  };
}

export default async function CalculationDetailPage({ params }: Props) {
  const { scenario } = await params;
  const calculation = await getCalculation(scenario);
  if (!calculation) notFound();

  const url = `${SITE_URL}/resources/calculations/${calculation.slug}`;

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: calculation.headline,
    description: calculation.overview,
    url,
    author: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    step: calculation.steps.map((s) => ({
      "@type": "HowToStep",
      position: s.step,
      name: s.title,
      text: s.description,
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
        name: "CAM Calculations",
        item: `${SITE_URL}/resources/calculations`,
      },
      { "@type": "ListItem", position: 4, name: calculation.name, item: url },
    ],
  };

  return (
    <ContentPageLayout
      pageName={calculation.name}
      backHref="/resources/calculations"
      backLabel="CAM Calculations"
    >
      <JsonLd data={howToSchema} />
      <JsonLd data={breadcrumbSchema} />

      <article className="prose prose-gray max-w-none">
        {/* Header */}
        <div className="not-prose mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
              <Calculator className="h-3.5 w-3.5 mr-1.5" />
              CAM Calculation Guide
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {calculation.headline}
          </h1>
          <p className="text-lg text-muted-foreground">
            {calculation.subheadline}
          </p>
        </div>

        {/* Overview */}
        <div className="not-prose rounded-lg border bg-muted/30 p-5 mb-8">
          <p className="text-foreground">{calculation.overview}</p>
        </div>

        {/* Formula */}
        <div className="not-prose mb-8">
          <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Formula
          </h2>
          <pre className="rounded-lg border bg-muted/50 p-4 font-mono text-sm overflow-x-auto whitespace-pre-wrap">
            {calculation.formula}
          </pre>
        </div>

        {/* Variables Table */}
        {calculation.variables.length > 0 && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-4">Variables</h2>
            {/* Mobile: stacked cards */}
            <div className="md:hidden space-y-3">
              {calculation.variables.map((v, i) => (
                <div key={i} className="rounded-lg border p-4 bg-card">
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <span className="font-semibold text-base">{v.name}</span>
                    <span className="font-mono text-primary text-sm">
                      {v.symbol}
                    </span>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                        Definition
                      </dt>
                      <dd className="text-foreground">{v.definition}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                        Example
                      </dt>
                      <dd className="text-muted-foreground">{v.example}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-semibold">Name</th>
                    <th className="text-left px-4 py-3 font-semibold">
                      Symbol
                    </th>
                    <th className="text-left px-4 py-3 font-semibold">
                      Definition
                    </th>
                    <th className="text-left px-4 py-3 font-semibold">
                      Example
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {calculation.variables.map((v, i) => (
                    <tr
                      key={i}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors duration-200"
                    >
                      <td className="px-4 py-3 font-medium">{v.name}</td>
                      <td className="px-4 py-3 font-mono text-primary">
                        {v.symbol}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {v.definition}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {v.example}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step-by-Step Process */}
        <div className="not-prose mb-10">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Step-by-Step Process ({calculation.steps.length} steps)
          </h2>
          <div className="space-y-6">
            {calculation.steps.map((step) => (
              <div key={step.step} className="rounded-lg border p-5">
                <div className="flex items-start gap-4">
                  <span className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-sm font-bold">
                    {step.step}
                  </span>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">{step.title}</h3>
                    <p className="text-sm text-foreground mb-3">
                      {step.description}
                    </p>
                    {step.formula && (
                      <pre className="rounded-md border bg-muted/50 p-3 font-mono text-xs overflow-x-auto whitespace-pre-wrap mb-3">
                        {step.formula}
                      </pre>
                    )}
                    <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                      <p className="text-xs font-semibold text-primary mb-1">
                        Example:
                      </p>
                      <p className="text-xs text-primary/90">{step.example}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Worked Example */}
        <div className="not-prose mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            Worked Example
          </h2>
          <div className="rounded-lg border p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-muted-foreground mb-1">
                Scenario
              </p>
              <p className="text-foreground">
                {calculation.workedExample.scenario}
              </p>
            </div>

            {Object.keys(calculation.workedExample.inputs).length > 0 && (
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-2">
                  Inputs
                </p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-3 py-2 font-semibold">
                          Variable
                        </th>
                        <th className="text-left px-3 py-2 font-semibold">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(calculation.workedExample.inputs).map(
                        ([key, value]) => (
                          <tr key={key} className="border-b last:border-0">
                            <td className="px-3 py-2 font-mono text-xs text-primary">
                              {key}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {value}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <p className="text-sm font-semibold text-muted-foreground mb-1">
                Calculation
              </p>
              <pre className="rounded-md border bg-muted/50 p-3 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                {calculation.workedExample.calculation}
              </pre>
            </div>

            <div className="rounded-md border border-success/30 bg-success/10 p-3">
              <p className="text-xs font-semibold text-success-strong mb-1">Result:</p>
              <p className="text-sm font-medium text-success-strong">
                {calculation.workedExample.result}
              </p>
            </div>
          </div>
        </div>

        {/* Common Mistakes */}
        {calculation.commonMistakes.length > 0 && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Common Mistakes
            </h2>
            <div className="space-y-3">
              {calculation.commonMistakes.map((mistake, i) => (
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

        {/* When to Use */}
        {calculation.whenToUse.length > 0 && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-4">
              When to Use This Calculation
            </h2>
            <ul className="space-y-2">
              {calculation.whenToUse.map((use, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                  <span>{use}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Cross-site Callout */}
        <CrossSiteCallout />

        {/* Related Calculations */}
        {calculation.relatedCalculations.length > 0 && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-4">Related Calculations</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {calculation.relatedCalculations.map((href) => (
                <Link
                  key={href}
                  href={href}
                  className="flex min-h-[44px] items-center gap-2 rounded-full border bg-background p-3 text-base sm:text-sm font-medium hover:bg-muted/50 transition-colors duration-200"
                >
                  <Calculator className="h-4 w-4 text-primary flex-shrink-0" />
                  {slugToTitle(href)}
                  <ArrowRight className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Related Resources */}
        <RelatedContent
          links={calculation.relatedResources.map((href) => ({
            href,
            label: slugToTitle(href),
          }))}
        />

        {/* Related Tools */}
        <RelatedContent
          title="Free Tools for This Calculation"
          links={calculation.relatedTools.map((href) => ({
            href,
            label: slugToTitle(href),
          }))}
        />

        {/* CTA */}
        <div className="not-prose rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-bold mb-2">Skip the Spreadsheet Math</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Upload your GL export and let CapVeri run every calculation
            automatically: gross-ups, caps, tenant shares, and more. Every
            figure is independently verified before statements go out. First
            audit is always free.
          </p>
          <Link
            href="/pricing"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-button bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
          >
            Start free trial
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        </div>
      </article>
    </ContentPageLayout>
  );
}
