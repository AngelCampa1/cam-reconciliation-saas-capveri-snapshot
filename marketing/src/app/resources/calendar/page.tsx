import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { Calendar, ArrowRight, CheckSquare, CalendarDays } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { RESOURCE_HUB_CROSS_LINKS } from "@/lib/content/content-map";
import { getAllCalendarEntries } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CAM Reconciliation Calendar - Seasonal Deadlines & Checklists",
  description:
    "CAM reconciliation seasonal guide by calendar phase. Q1 reconciliation season, Q4 year-end close, Q2 dispute season, Q3 budget season, and property tax assessment timing.",
  alternates: { canonical: `${SITE_URL}/resources/calendar` },
  openGraph: {
    title: "CAM Reconciliation Calendar - Seasonal Deadlines & Checklists",
    description:
      "CAM reconciliation deadlines, checklists, and process guides by calendar phase - Q1 reconciliation season, Q4 year-end close, Q2 dispute season, Q3 budget season, and property tax assessment timing.",
    url: `${SITE_URL}/resources/calendar`,
    type: "website",
  },
};

export default async function CalendarHubPage() {
  const entries = await getAllCalendarEntries();

  const itemListSchema = structuredDataSchemas.itemList({
    name: "CAM Reconciliation Calendar - Seasonal Guides",
    description:
      "CAM reconciliation deadlines, checklists, and process guides by calendar phase.",
    items: entries.map((e) => ({
      name: e.name,
      url: `/resources/calendar/${e.slug}`,
    })),
  });

  return (
    <ContentPageLayout pageName="Calendar & Seasonal Guides">
      <JsonLd data={itemListSchema} />
      <div className="prose prose-gray  max-w-none">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
          CAM Reconciliation Calendar
        </h1>
        <p className="text-lg text-muted-foreground mb-8 not-prose">
          CAM reconciliation is not a single event - it follows a predictable
          seasonal rhythm. Q4 determines how clean your Q1 will be. Q1
          determines whether Q2 brings disputes. Q3 sets the estimates that
          drive next year&apos;s settlements. Each phase has its own deadlines,
          checklists, and failure modes. These guides cover each one.
        </p>

        {/* Summary stats */}
        <div className="grid grid-cols-1 gap-4 mb-12 not-prose sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-3xl font-bold text-primary">
              {entries.length}
            </div>
            <div className="font-medium text-sm mt-1">Seasonal Guides</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Full-year coverage
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-6 w-6 text-primary" />
            </div>
            <div className="font-medium text-sm mt-1">Key Dates</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Deadlines and milestones by phase
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-6 w-6 text-primary" />
            </div>
            <div className="font-medium text-sm mt-1">Phase Checklists</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              What to do and when, every season
            </div>
          </div>
        </div>

        {/* Entry list */}
        <div className="grid gap-4 not-prose">
          {entries.map((entry) => (
            <Link
              key={entry.slug}
              href={`/resources/calendar/${entry.slug}`}
              className="flex items-start gap-4 rounded-lg border p-5 transition-colors duration-200 hover:bg-muted/50"
            >
              <div className="flex-shrink-0 mt-0.5">
                <Calendar className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{entry.name}</span>
                  <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground flex-shrink-0" />
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {entry.subheadline}
                </p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{entry.keyDates.length} key dates</span>
                  <span className="text-muted-foreground/50">|</span>
                  <span>{entry.checklist.length} checklist items</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <RelatedContent
          title="Explore Related Resource Hubs"
          links={RESOURCE_HUB_CROSS_LINKS["calendar"]}
        />

        {/* CTA */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 mt-12 not-prose">
          <h2 className="text-lg font-bold mb-2">Stay Ahead of Every Season</h2>
          <p className="text-sm text-muted-foreground mb-4">
            CapVeri works through every phase of the CAM calendar. It catches
            errors in Q4 before they become Q1 disputes and gives you the audit
            trail you need to defend Q1 statements in Q2. Start with a 30-day
            trial and no credit card.
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
