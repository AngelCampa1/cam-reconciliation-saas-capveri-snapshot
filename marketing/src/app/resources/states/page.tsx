import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { RESOURCE_HUB_CROSS_LINKS } from "@/lib/content/content-map";
import { getAllStates } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Commercial CAM Compliance by State: Landlord Obligations Guide",
  description:
    "State-level CAM compliance overview for commercial landlords. Review complexity, audit-right exposure, and where disclosure and response obligations are highest.",
  alternates: { canonical: `${SITE_URL}/resources/states` },
  openGraph: {
    title: "Commercial CAM Compliance by State",
    description:
      "State-level CAM compliance overview for commercial landlords.",
    url: `${SITE_URL}/resources/states`,
    type: "website",
  },
};

const complexityConfig = {
  high: {
    icon: AlertTriangle,
    color: "text-destructive-strong",
    bg: "bg-destructive/10",
    border: "border-destructive/30",
  },
  medium: {
    icon: ShieldCheck,
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/30",
  },
  low: {
    icon: CheckCircle,
    color: "text-success-strong",
    bg: "bg-success/5",
    border: "border-success/30",
  },
} as const;

export default async function StatesHubPage() {
  const states = await getAllStates();

  const overviewSchema = structuredDataSchemas.webPage({
    name: "Commercial CAM Compliance by State",
    url: `${SITE_URL}/resources/states`,
    description:
      "Overview of state-level commercial CAM compliance risk, complexity, and documentation expectations for landlords.",
    pageType: "CollectionPage",
    dateModified: "2026-04-17",
  });

  const highComplexity = states.filter(
    (state) => state.complianceComplexity === "high",
  );
  const mediumComplexity = states.filter(
    (state) => state.complianceComplexity === "medium",
  );
  const lowComplexity = states.filter(
    (state) => state.complianceComplexity === "low",
  );

  return (
    <ContentPageLayout pageName="State CAM Compliance">
      <JsonLd data={overviewSchema} />
      <div className="prose prose-gray max-w-none">
        <h1 className="mb-4 text-3xl font-bold not-prose md:text-4xl">
          Commercial CAM Compliance by State
        </h1>
        <p className="mb-8 text-lg text-muted-foreground not-prose">
          Landlord obligations for CAM reconciliation vary dramatically by
          state. California carries explicit response deadlines and treble
          damage exposure. Many other states have no CAM-specific statute and
          rely on lease language plus general contract law.
        </p>

        <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 p-5 not-prose">
          <p className="text-sm text-muted-foreground">
            The old state-specific child pages were consolidated into one
            maintained compliance reference so the guidance stays current and
            does not drift into redirect-only URLs.
          </p>
          <Link
            href="/resources/commercial-tenant-cam-disclosure-by-state"
            className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:underline"
          >
            Open the state-by-state CAM disclosure guide
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>

        <div className="mb-12 grid grid-cols-1 gap-4 not-prose sm:grid-cols-3">
          {[
            {
              count: highComplexity.length,
              label: "High Complexity",
              desc: "Detailed statutory requirements",
              ...complexityConfig.high,
            },
            {
              count: mediumComplexity.length,
              label: "Medium Complexity",
              desc: "Some statutory or case-law risk",
              ...complexityConfig.medium,
            },
            {
              count: lowComplexity.length,
              label: "Low Complexity",
              desc: "Mostly lease-governed disputes",
              ...complexityConfig.low,
            },
          ].map((item) => (
            <div
              key={item.label}
              className={`rounded-lg border p-4 ${item.bg} ${item.border}`}
            >
              <div className={`text-3xl font-bold ${item.color}`}>
                {item.count}
              </div>
              <div className="mt-1 text-sm font-medium">{item.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {item.desc}
              </div>
            </div>
          ))}
        </div>

        {[
          { title: "High Compliance Complexity", states: highComplexity },
          { title: "Medium Compliance Complexity", states: mediumComplexity },
          { title: "Low Compliance Complexity", states: lowComplexity },
        ].map((group) => (
          <section key={group.title} className="mb-10 not-prose">
            <h2 className="mb-4 text-xl font-bold">{group.title}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {group.states
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((state) => {
                  const config = complexityConfig[state.complianceComplexity];
                  const Icon = config.icon;

                  return (
                    <div
                      key={state.slug}
                      className={`flex items-start gap-3 rounded-lg border p-4 ${config.border}`}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        <MapPin className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{state.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({state.abbreviation})
                          </span>
                          <Icon className={`ml-auto h-4 w-4 ${config.color}`} />
                        </div>
                        <p
                          className="mt-1 line-clamp-2 text-sm text-muted-foreground"
                          title={
                            state.primaryStatute ??
                            "No CAM-specific statute. Governed by lease terms and general contract law."
                          }
                        >
                          {state.primaryStatute ??
                            "No CAM-specific statute. Governed by lease terms and general contract law."}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        ))}

        <RelatedContent
          title="Explore Related Resource Hubs"
          links={RESOURCE_HUB_CROSS_LINKS.states}
        />

        <div className="mt-12 rounded-lg border border-primary/20 bg-primary/5 p-6 not-prose">
          <h2 className="mb-2 text-lg font-bold">
            Ensure compliance before you send
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            CapVeri validates your CAM reconciliation against lease terms and
            disclosure expectations so your team can fix risky statements before
            tenants or auditors do.
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
