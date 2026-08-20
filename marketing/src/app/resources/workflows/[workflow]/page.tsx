import { SITE_URL, TRIAL_COPY } from "@/lib/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { slugToTitle } from "@/lib/slug-to-title";
import {
  GitBranch,
  AlertTriangle,
  Clock,
  CheckCircle,
  ListChecks,
} from "lucide-react";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { JsonLd } from "@/components/JsonLd";
import { getAllWorkflows, getWorkflow } from "@/lib/content/pseo-data";
import { CrossSiteCallout } from "@/components/content/CrossSiteCallout";

interface Props {
  params: Promise<{ workflow: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const workflows = await getAllWorkflows();
  return workflows.map((workflow) => ({ workflow: workflow.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workflow: workflowSlug } = await params;
  const workflow = await getWorkflow(workflowSlug);
  if (!workflow) notFound();

  const url = `${SITE_URL}/resources/workflows/${workflow.slug}`;

  return {
    title: workflow.metaTitle,
    description: workflow.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: workflow.metaTitle,
      description: workflow.metaDescription,
      url,
      type: "article",
    },
  };
}

export default async function WorkflowDetailPage({ params }: Props) {
  const { workflow: workflowSlug } = await params;
  const workflow = await getWorkflow(workflowSlug);
  if (!workflow) notFound();

  const url = `${SITE_URL}/resources/workflows/${workflow.slug}`;

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: workflow.headline,
    description: workflow.overview,
    url,
    author: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    step: workflow.steps.map((s) => ({
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
        name: "Workflow Guides",
        item: `${SITE_URL}/resources/workflows`,
      },
      { "@type": "ListItem", position: 4, name: workflow.name, item: url },
    ],
  };

  return (
    <ContentPageLayout
      pageName={workflow.name}
      backHref="/resources/workflows"
      backLabel="Workflow Guides"
    >
      <JsonLd data={howToSchema} />
      <JsonLd data={breadcrumbSchema} />

      <article className="prose prose-gray max-w-none">
        {/* Header */}
        <div className="not-prose mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
              <GitBranch className="h-3.5 w-3.5 mr-1.5" />
              Workflow Guide
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {workflow.headline}
          </h1>
          <p className="text-lg text-muted-foreground">
            {workflow.subheadline}
          </p>
        </div>

        {/* Overview */}
        <div className="not-prose rounded-lg border bg-muted/30 p-5 mb-8">
          <p className="text-foreground">{workflow.overview}</p>
        </div>

        {/* Steps */}
        <div className="not-prose mb-10">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            Step-by-Step Process ({workflow.steps.length} steps)
          </h2>
          <div className="space-y-6">
            {workflow.steps.map((step) => (
              <div key={step.step} className="rounded-lg border p-5">
                <div className="flex items-start gap-4">
                  <span className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-sm font-bold">
                    {step.step}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold">{step.title}</h3>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {step.timeframe}
                      </span>
                    </div>
                    <p className="text-sm text-foreground mb-3">
                      {step.description}
                    </p>
                    {step.commonErrors.length > 0 && (
                      <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
                        <p className="text-xs font-semibold text-warning-foreground mb-1 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Common errors at this step:
                        </p>
                        <ul className="space-y-1">
                          {step.commonErrors.map((err, i) => (
                            <li key={i} className="text-xs text-warning-foreground">
                              • {err}
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

        {/* Timeline */}
        <div className="not-prose rounded-lg border p-5 mb-8">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-2">Timeline</h2>
              <p className="text-muted-foreground">{workflow.timeline}</p>
            </div>
          </div>
        </div>

        {/* CapVeri Role */}
        <div className="not-prose rounded-lg border-l-4 border-primary bg-primary/5 p-5 mb-8">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-2">Where CapVeri Fits</h2>
              <p className="text-muted-foreground">{workflow.capveriRole}</p>
            </div>
          </div>
        </div>

        {/* Cross-site Callout */}
        <CrossSiteCallout />

        {/* Related Resources */}
        <RelatedContent
          links={workflow.relatedResources.map((href) => ({
            href,
            label: slugToTitle(href),
          }))}
        />

        {/* Related Tools */}
        <RelatedContent
          title="Free Tools for This Workflow"
          links={workflow.relatedTools.map((href) => ({
            href,
            label: slugToTitle(href),
          }))}
        />

        {/* CTA */}
        <div className="not-prose rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-bold mb-2">
            Automate the Most Error-Prone Steps
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Export your GL data and upload to CapVeri. Every tenant's
            reconciliation is recalculated independently and errors are flagged
            before statements go out. {TRIAL_COPY}, no credit card required.
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
