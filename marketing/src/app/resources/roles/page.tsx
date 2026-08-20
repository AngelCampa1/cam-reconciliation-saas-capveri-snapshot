import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, Users } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { RESOURCE_HUB_CROSS_LINKS } from "@/lib/content/content-map";
import { getAllRoles } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CAM Reconciliation by Role: Stakeholder Context Overview",
  description:
    "Overview of how CAM reconciliation responsibility, time pressure, and risk vary by stakeholder role.",
  alternates: { canonical: `${SITE_URL}/resources/roles` },
  openGraph: {
    title: "CAM Reconciliation Guides by Role",
    description:
      "Overview of how CAM reconciliation responsibility, time pressure, and risk vary by stakeholder role.",
    url: `${SITE_URL}/resources/roles`,
    type: "website",
  },
};

export default async function RolesHubPage() {
  const roles = await getAllRoles();

  const overviewSchema = structuredDataSchemas.webPage({
    name: "CAM Reconciliation Guides by Role",
    url: `${SITE_URL}/resources/roles`,
    description:
      "Overview of how CAM reconciliation responsibilities and risk vary by stakeholder role.",
    pageType: "CollectionPage",
    dateModified: "2026-04-17",
  });

  return (
    <ContentPageLayout pageName="Roles">
      <JsonLd data={overviewSchema} />
      <div className="prose prose-gray max-w-none">
        <h1 className="mb-4 text-3xl font-bold not-prose md:text-4xl">
          CAM Reconciliation by Role
        </h1>
        <p className="mb-8 text-lg text-muted-foreground not-prose">
          CAM reconciliation looks different depending on where you sit in the
          organization. Controllers own the math. CFOs own the liability. Lease
          admins own the supporting clause logic. This hub keeps the role
          context while the retained guides handle the actual work.
        </p>

        <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 p-5 not-prose">
          <p className="text-sm text-muted-foreground">
            The role-specific child pages were retired so the maintained content
            can stay focused on exports, calculations, and recoverability
            instead of duplicating the same workflow by title.
          </p>
          <Link
            href="/resources/software"
            className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:underline"
          >
            Go to the software and export guides
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>

        <div className="mb-12 grid grid-cols-1 gap-4 not-prose sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-3xl font-bold text-primary">
              {roles.length}
            </div>
            <div className="mt-1 text-sm font-medium">Role Profiles</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Responsibility models represented
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <Clock className="h-6 w-6 text-primary" />
            <div className="mt-1 text-sm font-medium">Time Pressure</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Controllers still absorb the Q1 bottleneck
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <Users className="h-6 w-6 text-primary" />
            <div className="mt-1 text-sm font-medium">Shared Liability</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Review quality still crosses accounting, finance, and operations
            </div>
          </div>
        </div>

        <div className="grid gap-4 not-prose">
          {roles.map((role) => (
            <div
              key={role.slug}
              className="flex items-start gap-4 rounded-lg border p-5"
            >
              <div className="mt-0.5 flex-shrink-0">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{role.name}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {role.subheadline}
                </p>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{role.painPoints.length} key pain points</span>
                  <span className="text-muted-foreground/50">|</span>
                  <span>{role.commonErrors.length} common errors</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <RelatedContent
          title="Explore Related Resource Hubs"
          links={RESOURCE_HUB_CROSS_LINKS.roles}
        />

        <div className="mt-12 rounded-lg border border-primary/20 bg-primary/5 p-6 not-prose">
          <h2 className="mb-2 text-lg font-bold">
            Reconcile it right before tenants see it
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            CapVeri gives every stakeholder the same verified calculation base
            so the review process stays aligned even when accounting, finance,
            and operations have different priorities.
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
