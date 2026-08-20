import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  Calculator,
  HelpCircle,
} from "lucide-react";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { JsonLd } from "@/components/JsonLd";
import { getAllLeaseTypes, getLeaseType } from "@/lib/content/pseo-data";
import { CrossSiteCallout } from "@/components/content/CrossSiteCallout";
import { slugToTitle } from "@/lib/slug-to-title";

interface Props {
  params: Promise<{ type: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const leaseTypes = await getAllLeaseTypes();
  return leaseTypes.map((lt) => ({ type: lt.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type } = await params;
  const leaseType = await getLeaseType(type);
  if (!leaseType) notFound();

  const url = `${SITE_URL}/resources/lease-types/${leaseType.slug}/cam-guide`;

  return {
    title: leaseType.metaTitle,
    description: leaseType.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: leaseType.metaTitle,
      description: leaseType.metaDescription,
      url,
      type: "article",
    },
  };
}

export default async function LeaseTypeCamGuidePage({ params }: Props) {
  const { type } = await params;
  const leaseType = await getLeaseType(type);
  if (!leaseType) notFound();

  const url = `${SITE_URL}/resources/lease-types/${leaseType.slug}/cam-guide`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: leaseType.headline,
    description: leaseType.metaDescription,
    url,
    datePublished: leaseType.lastUpdated,
    dateModified: leaseType.lastUpdated,
    author: { "@type": "Organization", name: "CapVeri", url: SITE_URL },
    publisher: { "@type": "Organization", name: "CapVeri", url: SITE_URL },
  };

  const faqSchema =
    leaseType.faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: leaseType.faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: { "@type": "Answer", text: faq.answer },
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
        name: "Lease Types",
        item: `${SITE_URL}/resources/lease-types`,
      },
      { "@type": "ListItem", position: 4, name: leaseType.name, item: url },
    ],
  };

  return (
    <ContentPageLayout
      pageName={leaseType.name}
      backHref="/resources"
      backLabel="Resources"
    >
      <JsonLd data={articleSchema} />
      {faqSchema && <JsonLd data={faqSchema} />}
      <JsonLd data={breadcrumbSchema} />

      <article className="prose prose-gray max-w-none">
        {/* Header */}
        <div className="not-prose mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Lease Type Guide
            </span>
            {leaseType.abbreviation && (
              <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-mono font-medium text-muted-foreground">
                {leaseType.abbreviation}
              </span>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {leaseType.headline}
          </h1>
          <p className="text-lg text-muted-foreground">
            {leaseType.subheadline}
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            Last updated:{""}
            {new Date(leaseType.lastUpdated).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
            })}
          </p>
        </div>

        {/* Answer Primitive: Definition - placed in first 150 words for AI citation */}
        <div className="not-prose rounded-lg border-l-4 border-primary bg-primary/5 p-5 mb-8">
          <p className="text-sm font-semibold text-primary mb-1">Definition</p>
          <p className="text-foreground font-medium">{leaseType.definition}</p>
        </div>

        {/* CAM Quick Facts */}
        <div className="not-prose mb-8">
          <h2 className="text-xl font-bold mb-4">
            CAM Reconciliation at a Glance
          </h2>
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-semibold">
                    Attribute
                  </th>
                  <th className="text-left px-4 py-3 font-semibold">
                    {leaseType.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-muted/20 transition-colors duration-200">
                  <td className="px-4 py-3 text-muted-foreground">
                    CAM Included in Lease
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {leaseType.camIncluded ? (
                      <span className="text-success-strong flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" /> Yes
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        No (typically)
                      </span>
                    )}
                  </td>
                </tr>
                <tr className="border-b hover:bg-muted/20 transition-colors duration-200">
                  <td className="px-4 py-3 text-muted-foreground">
                    Annual Reconciliation Required
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {leaseType.reconciliationRequired ? (
                      <span className="text-success-strong flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" /> Yes
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        No (see notes)
                      </span>
                    )}
                  </td>
                </tr>
                <tr className="border-b hover:bg-muted/20 transition-colors duration-200">
                  <td className="px-4 py-3 text-muted-foreground">
                    Gross-Up Applicable
                  </td>
                  <td className="px-4 py-3">
                    {leaseType.grossUpApplicable ? (
                      <span className="font-medium text-success-strong">
                        Yes - variable expenses
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Not typically
                      </span>
                    )}
                  </td>
                </tr>
                <tr className="border-b hover:bg-muted/20 transition-colors duration-200">
                  <td className="px-4 py-3 text-muted-foreground">
                    CAM Caps Applicable
                  </td>
                  <td className="px-4 py-3">
                    {leaseType.capApplicable ? (
                      <span className="font-medium text-success-strong">
                        Yes - by negotiation
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Not typically
                      </span>
                    )}
                  </td>
                </tr>
                <tr className="hover:bg-muted/20 transition-colors duration-200">
                  <td className="px-4 py-3 text-muted-foreground">
                    Common Property Types
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {leaseType.commonFor.join(", ")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Who Bears Expenses */}
        <div className="not-prose mb-8">
          <h2 className="text-xl font-bold mb-3">
            Who Bears Operating Expenses
          </h2>
          <div className="rounded-lg border bg-muted/30 p-5">
            <p className="text-foreground">{leaseType.whoBearsExpenses}</p>
          </div>
        </div>

        {/* CAM Notes */}
        <div className="not-prose mb-8">
          <h2 className="text-xl font-bold mb-3">CAM Reconciliation Notes</h2>
          <div className="rounded-lg border bg-muted/30 p-5">
            <p className="text-foreground">{leaseType.camNotes}</p>
          </div>
        </div>

        {/* Formula Blocks */}
        {leaseType.formulaBlocks.length > 0 && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Formulas
            </h2>
            <div className="space-y-6">
              {leaseType.formulaBlocks.map((block, i) => (
                <div key={i} className="rounded-lg border p-5">
                  <p className="font-semibold mb-3">{block.label}</p>
                  <pre className="rounded-md border bg-muted/50 p-3 font-mono text-sm overflow-x-auto whitespace-pre-wrap mb-4">
                    {block.formula}
                  </pre>
                  {Object.keys(block.variables).length > 0 && (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left px-3 py-2 font-semibold">
                              Variable
                            </th>
                            <th className="text-left px-3 py-2 font-semibold">
                              Definition
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(block.variables).map(
                            ([name, def]) => (
                              <tr key={name} className="border-b last:border-0">
                                <td className="px-3 py-2 font-mono text-xs text-primary font-medium">
                                  {name}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground text-xs">
                                  {def}
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Worked Example */}
        {leaseType.workedExample && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              Worked Example
            </h2>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
              {leaseType.workedExample.split("\n").map((line, i) => (
                <p
                  key={i}
                  className={`text-sm text-primary/90 ${i > 0 ? "mt-2" : ""}`}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Landlord Risks */}
        {leaseType.landlordRisks.length > 0 && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Landlord Risks Under This Lease Type
            </h2>
            <div className="space-y-3">
              {leaseType.landlordRisks.map((risk, i) => (
                <div
                  key={i}
                  className="rounded-md border border-warning/30 bg-warning/10 p-4"
                >
                  <p className="text-sm text-warning-foreground flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                    {risk}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Common Mistakes */}
        {leaseType.commonMistakes.length > 0 && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-4">
              Common Reconciliation Mistakes
            </h2>
            <ul className="space-y-2">
              {leaseType.commonMistakes.map((mistake, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                  <span>{mistake}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* FAQs */}
        {leaseType.faqs.length > 0 && (
          <div className="not-prose mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {leaseType.faqs.map((faq, i) => (
                <div key={i} className="rounded-lg border p-5">
                  <p className="font-semibold mb-2">{faq.question}</p>
                  <p className="text-sm text-muted-foreground">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cross-site Callout */}
        <CrossSiteCallout />

        {/* Related Tools */}
        {leaseType.relatedTools.length > 0 && (
          <RelatedContent
            title="Free Calculators for This Lease Type"
            links={leaseType.relatedTools.map((href) => ({
              href,
              label: slugToTitle(href),
            }))}
          />
        )}

        {/* Related Resources */}
        {leaseType.relatedResources.length > 0 && (
          <RelatedContent
            links={leaseType.relatedResources.map((href) => ({
              href,
              label: slugToTitle(href),
            }))}
          />
        )}

        {/* CTA */}
        <div className="not-prose rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-bold mb-2">
            Verify Your CAM Math Before Statements Go Out
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Upload your GL export and CapVeri runs every calculation
            automatically: gross-ups, caps, pro-rata shares, and expense
            classifications, regardless of which lease type you use. Every
            figure traces to a GL entry and a specific lease clause. Start with
            a 30-day trial and no credit card.
          </p>
          <Link
            href="/pricing"
            className="inline-flex min-h-[44px] items-center rounded-button bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start free trial
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        </div>
      </article>
    </ContentPageLayout>
  );
}
