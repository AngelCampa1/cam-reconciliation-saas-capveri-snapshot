import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, GitBranch, ListChecks } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { RESOURCE_HUB_CROSS_LINKS } from "@/lib/content/content-map";
import { getAllWorkflows } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CAM Reconciliation Workflows: Step-by-Step Process Overview",
  description:
    "Overview of the major CAM reconciliation workflows landlords manage across year-end close, disputes, acquisitions, and portfolio operations.",
  alternates: { canonical: `${SITE_URL}/resources/workflows` },
  openGraph: {
    title: "CAM Reconciliation Workflow Guides",
    description:
      "Overview of the major CAM reconciliation workflows landlords manage across close and portfolio operations.",
    url: `${SITE_URL}/resources/workflows`,
    type: "website",
  },
};

export default async function WorkflowsHubPage() {
  const workflows = await getAllWorkflows();

  const overviewSchema = structuredDataSchemas.webPage({
    name: "CAM Reconciliation Workflow Guides",
    url: `${SITE_URL}/resources/workflows`,
    description:
      "Overview of the major CAM reconciliation workflows landlords need to manage across close, disputes, and portfolio operations.",
    pageType: "CollectionPage",
    dateModified: "2026-04-17",
  });

  return (
    <ContentPageLayout pageName="Workflows">
      <JsonLd data={overviewSchema} />
      <div className="prose prose-gray max-w-none">
        <h1 className="mb-4 text-3xl font-bold not-prose md:text-4xl">
          CAM Reconciliation Workflows
        </h1>
        <p className="mb-8 text-lg text-muted-foreground not-prose">
          CAM reconciliation is not one task. It is a set of workflows with
          different triggers, deadlines, and failure modes. This hub keeps the
          workflow context while the retained guides handle the actual execution
          details.
        </p>

        <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 p-5 not-prose">
          <p className="text-sm text-muted-foreground">
            The old workflow child pages were consolidated into the main
            reconciliation guides so the maintained content stays focused on the
            workflows teams actually execute.
          </p>
          <Link
            href="/cam-reconciliation-guide"
            className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:underline"
          >
            Open the core CAM reconciliation guide
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>

        <div className="mb-12 grid grid-cols-1 gap-4 not-prose sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-3xl font-bold text-primary">
              {workflows.length}
            </div>
            <div className="mt-1 text-sm font-medium">Workflow Patterns</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Major close and dispute motions
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <ListChecks className="h-6 w-6 text-primary" />
            <div className="mt-1 text-sm font-medium">Step Pressure</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Review sequence matters more than volume
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <Clock className="h-6 w-6 text-primary" />
            <div className="mt-1 text-sm font-medium">Timeline Risk</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Delay compounds once year-end slips
            </div>
          </div>
        </div>

        <div className="grid gap-4 not-prose">
          {workflows.map((workflow) => (
            <div
              key={workflow.slug}
              className="flex items-start gap-4 rounded-lg border p-5"
            >
              <div className="mt-0.5 flex-shrink-0">
                <GitBranch className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{workflow.name}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {workflow.subheadline}
                </p>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{workflow.steps.length} steps documented</span>
                  <span className="text-muted-foreground/50">|</span>
                  <span>
                    {workflow.steps.reduce(
                      (count, step) => count + step.commonErrors.length,
                      0,
                    )}
                    {""}
                    common errors
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <RelatedContent
          title="Explore Related Resource Hubs"
          links={RESOURCE_HUB_CROSS_LINKS.workflows}
        />

        <div className="mt-12 rounded-lg border border-primary/20 bg-primary/5 p-6 not-prose">
          <h2 className="mb-2 text-lg font-bold">
            Automate the hard parts of every workflow
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            CapVeri handles the calculation and verification layer so your team
            reviews flagged risk instead of rebuilding workflow math from
            scratch.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-button bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </ContentPageLayout>
  );
}
