import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Users,
  AlertTriangle,
  Clock,
  CheckCircle,
  Briefcase,
  TrendingUp,
} from "lucide-react";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { CrossSiteCallout } from "@/components/content/CrossSiteCallout";
import { JsonLd } from "@/components/JsonLd";
import { getAllRoles, getRole } from "@/lib/content/pseo-data";
import { slugToTitle } from "@/lib/slug-to-title";

interface Props {
  params: Promise<{ role: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const roles = await getAllRoles();
  return roles.map((role) => ({ role: role.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { role: roleSlug } = await params;
  const role = await getRole(roleSlug);
  if (!role) notFound();

  const url = `${SITE_URL}/resources/roles/${role.slug}/cam-guide`;

  return {
    title: role.metaTitle,
    description: role.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: role.metaTitle,
      description: role.metaDescription,
      url,
      type: "article",
    },
  };
}

export default async function RoleCamGuidePage({ params }: Props) {
  const { role: roleSlug } = await params;
  const role = await getRole(roleSlug);
  if (!role) notFound();

  const url = `${SITE_URL}/resources/roles/${role.slug}/cam-guide`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: role.headline,
    author: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    publisher: { "@type": "Organization", name: "CapVeri.com", url: SITE_URL },
    datePublished: "2026-03-19",
    dateModified: "2026-03-19",
    url,
    about: { "@type": "Occupation", name: role.name },
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
        name: "Role Guides",
        item: `${SITE_URL}/resources/roles`,
      },
      { "@type": "ListItem", position: 4, name: role.name, item: url },
    ],
  };

  return (
    <ContentPageLayout
      pageName={`${role.name} CAM Guide`}
      backHref="/resources/roles"
      backLabel="Role Guides"
    >
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />

      <article className="prose prose-gray max-w-none">
        {/* Header */}
        <div className="not-prose mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              {role.name}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {role.headline}
          </h1>
          <p className="text-lg text-muted-foreground">{role.subheadline}</p>
        </div>

        {/* Pain Points */}
        <div className="not-prose mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            What Keeps You Up at Night
          </h2>
          <div className="space-y-2">
            {role.painPoints.map((point, i) => (
              <div
                key={i}
                className="rounded-lg border border-warning/30 bg-warning/10 p-4"
              >
                <p className="text-sm">{point}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Typical Workflow */}
        <div className="not-prose rounded-lg border p-5 mb-8">
          <div className="flex items-start gap-3">
            <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-2">
                Your Typical Reconciliation Workflow
              </h2>
              <p className="text-muted-foreground">{role.typicalWorkflow}</p>
            </div>
          </div>
        </div>

        {/* Time on CAM */}
        <div className="not-prose rounded-lg border p-5 mb-8">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-2">Time Spent on CAM</h2>
              <p className="text-muted-foreground">{role.timeOnCam}</p>
            </div>
          </div>
        </div>

        {/* Common Errors */}
        <div className="not-prose mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Common Errors in Your Role
          </h2>
          <div className="space-y-3">
            {role.commonErrors.map((error, i) => (
              <div
                key={i}
                className="rounded-lg border border-warning/30 bg-warning/10 p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-warning/30 text-warning-foreground text-xs font-bold">
                    {i + 1}
                  </span>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CapVeri Value */}
        <div className="not-prose rounded-lg border-l-4 border-primary bg-primary/5 p-5 mb-8">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-2">How CapVeri Helps</h2>
              <p className="text-muted-foreground">{role.capveriValue}</p>
            </div>
          </div>
        </div>

        {/* Time Savings */}
        <div className="not-prose rounded-lg border p-5 mb-8">
          <div className="flex items-start gap-3">
            <TrendingUp className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold mb-2">Time Savings</h2>
              <p className="text-muted-foreground">{role.timeSavings}</p>
            </div>
          </div>
        </div>

        {/* Cross-site: tenant traffic redirect to lextract.io */}
        <CrossSiteCallout />

        {/* Related Resources */}
        <RelatedContent
          title={`Resources for ${role.name}s`}
          links={role.relatedResources.map((href) => ({
            href,
            label: slugToTitle(href),
          }))}
        />

        {/* Related Tools */}
        <RelatedContent
          title={`Free Tools for ${role.name}s`}
          links={role.relatedTools.map((href) => ({
            href,
            label: slugToTitle(href),
          }))}
        />

        {/* CTA */}
        <div className="not-prose rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-bold mb-2">
            See What CapVeri Finds in Your Reconciliations
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Export your GL data from Yardi, MRI, or any ERP. Upload to CapVeri
            for independent verification of every calculation. The same errors
            tenant auditors look for, caught before statements go out.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/pricing"
              className="inline-flex min-h-[44px] items-center rounded-button bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Start free trial
            </Link>
            <Link
              href={`/for/${role.slug}`}
              className="inline-flex items-center text-sm font-medium text-primary hover:underline"
            >
              See the {role.name} solution
            </Link>
          </div>
        </div>
      </article>
    </ContentPageLayout>
  );
}
