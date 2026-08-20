import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  FileSpreadsheet,
  Monitor,
  ShieldCheck,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { RESOURCE_HUB_CROSS_LINKS } from "@/lib/content/content-map";
import { getAllSoftware } from "@/lib/content/pseo-data";
import {
  filterByRetainedSlugs,
  RETAINED_SOFTWARE_GUIDE_SLUGS,
} from "@/lib/seo/content-governance";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CAM Reconciliation Setup by Software",
  description:
    "Operator guides for exporting and validating CAM data from Yardi, MRI, RealPage, Entrata, Sage Intacct, AppFolio, and Yardi Breeze.",
  alternates: { canonical: `${SITE_URL}/resources/software` },
  openGraph: {
    title: "CAM Setup Guides by Property Management Software",
    description:
      "Exact export paths, field checks, and failure modes for the software teams actually use during CAM reconciliation.",
    url: `${SITE_URL}/resources/software`,
    type: "website",
  },
};

export default async function SoftwareHubPage() {
  const software = filterByRetainedSlugs(
    await getAllSoftware(),
    RETAINED_SOFTWARE_GUIDE_SLUGS,
  );

  const itemListSchema = structuredDataSchemas.itemList({
    name: "CAM Configuration Guides by Property Management Software",
    description:
      "Export and setup guides for the retained software pages in CapVeri's CAM reconciliation library.",
    items: software.map((sw) => ({
      name: `${sw.name} CAM Setup`,
      url: `/resources/software/${sw.slug}/cam-setup`,
    })),
  });

  return (
    <ContentPageLayout pageName="Software Guides">
      <JsonLd data={itemListSchema} />

      <div className="prose prose-gray  max-w-none">
        <h1 className="not-prose mb-4 text-3xl font-bold md:text-4xl">
          CAM reconciliation setup by software
        </h1>
        <p className="not-prose mb-8 text-lg text-muted-foreground">
          Use these guides when the real question is not "what is CAM," but
          "which report do I pull, which fields matter, and why does the export
          still not tie out?" Each page is written for operators working inside
          the system, not for generic software comparison traffic.
        </p>

        <div className="not-prose mb-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-3xl font-bold text-primary">
              {software.length}
            </div>
            <div className="mt-1 text-sm font-medium">Retained systems</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Only platforms with meaningful reconciliation demand.
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            <div className="mt-2 text-sm font-medium">
              Export-first workflow
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              The pages focus on CSV and Excel outputs, not integrations.
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <div className="mt-2 text-sm font-medium">QA checkpoints</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Each guide is meant to prevent a bad statement from going out.
            </div>
          </div>
        </div>

        <div className="not-prose mb-8 rounded-xl border border-primary/20 bg-primary/5 p-5">
          <h2 className="text-lg font-semibold">What these pages cover</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>Exact report names and navigation paths.</li>
            <li>Which columns must be present before you export.</li>
            <li>
              What commonly breaks between GL, recovery, and billing files.
            </li>
            <li>How to prepare the exports for validation inside CapVeri.</li>
          </ul>
        </div>

        <div className="not-prose grid gap-4">
          {software.map((sw) => (
            <Link
              key={sw.slug}
              href={`/resources/software/${sw.slug}/cam-setup`}
              className="flex items-start gap-4 rounded-lg border p-5 transition-colors duration-200 hover:bg-muted/50"
            >
              <div className="mt-0.5 flex-shrink-0">
                <Monitor className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{sw.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {sw.vendor}
                  </span>
                  <ArrowRight className="ml-auto h-4 w-4 flex-shrink-0 text-muted-foreground" />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {sw.camModuleName}
                </p>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{sw.commonMistakes.length} failure modes covered</span>
                  <span className="text-muted-foreground/50">|</span>
                  <span>Export prep and QA included</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="not-prose mt-10 rounded-xl border p-5">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">
                Use the system guide before you troubleshoot the math
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Most reconciliation issues do not start with the cap formula.
                They start with an incomplete export, a missing recovery pool, a
                stale charge schedule, or the wrong date basis in the ERP. Fix
                the source file first. Then verify the calculation layer.
              </p>
            </div>
          </div>
        </div>

        <RelatedContent
          title="Explore Related Resource Hubs"
          links={RESOURCE_HUB_CROSS_LINKS["software"]}
        />

        <div className="not-prose mt-12 rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-2 text-lg font-bold">
            Validate your ERP exports before statements go out
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Export your GL, rent roll, and recovery files from any of these
            systems, then run them through CapVeri to catch gross-up errors, cap
            mistakes, and allocation issues before tenants or auditors do.
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
