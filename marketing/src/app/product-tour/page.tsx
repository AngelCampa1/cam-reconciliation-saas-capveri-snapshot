import { SITE_URL, TRIAL_COPY } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Upload,
  FileText,
  Calculator,
  AlertTriangle,
  Download,
  ShieldAlert,
  TrendingDown,
  Percent,
  HelpCircle,
  ChevronRight,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { VideoEmbed } from "@/components/VideoEmbed";
import { getVideoForPlacement } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";
import {
  AuditPacketMock,
  CapVeriDemoFrame,
  ExceptionQueueMock,
  LeaseRulesMock,
  ReconciliationDashboardMock,
} from "@/components/product-demo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildTrialLink } from "@/lib/auditLink";

export const metadata: Metadata = {
  title: "Product Tour: CAM Reconciliation Workflow for Landlords",
  description:
    "See how CapVeri checks CAM reconciliations from ERP exports, lease terms, and billed amounts before statements go to tenants.",
  alternates: {
    canonical: `${SITE_URL}/product-tour`,
  },
  openGraph: {
    title: "Product Tour: CAM Reconciliation Workflow for Landlords",
    description:
      "Walk through CapVeri from ERP export upload to tenant-ready CAM support packet.",
    url: `${SITE_URL}/product-tour`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Product Tour: Export-Based CAM Reconciliation Software",
    description:
      "Walk through CapVeri from ERP export upload to tenant-ready CAM support packet.",
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    {
      "@type": "ListItem",
      position: 2,
      name: "Product Tour",
      item: `${SITE_URL}/product-tour`,
    },
  ],
};

const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Run a CAM Reconciliation with CapVeri",
  description:
    "A five-step walkthrough of the CapVeri CAM reconciliation workflow, from uploading an ERP export to exporting tenant-ready CAM support.",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Upload ERP Export",
      text: "Drag and drop a CSV or Excel export from Yardi, MRI, RealPage, or another supported system. CapVeri validates the column mapping before reconciliation.",
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "Map Lease Terms",
      text: "Enter or auto-extract lease parameters: RSF, pro-rata share, caps, base year, and exclusions for each tenant.",
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Run Reconciliation",
      text: "The deterministic engine calculates gross-up, enforces caps, validates pro-rata shares, and screens for CapEx misclassification.",
    },
    {
      "@type": "HowToStep",
      position: 4,
      name: "Review Flags and Errors",
      text: "A dashboard shows each issue with the source GL line, the lease clause reference, and the calculation review needed before approval.",
    },
    {
      "@type": "HowToStep",
      position: 5,
      name: "Export Tenant-Ready Support",
      text: "Generate tenant-ready support with full audit trail, ready to attach to reconciliation statements or file for internal review.",
    },
  ],
};

const STEPS = [
  {
    number: 1,
    icon: Upload,
    title: "Upload ERP Export",
    description:
      "Drag and drop a CSV or Excel export from Yardi, MRI, RealPage, or another supported system. CapVeri validates the mapping and data quality before processing.",
    highlights: [
      "Works from common Yardi Voyager, MRI Software, RealPage, AppFolio, and generic CSV exports",
      "Auto-detects GL account codes, dates, amounts, and cost centers",
      "Flags missing or malformed rows before reconciliation begins",
    ],
  },
  {
    number: 2,
    icon: FileText,
    title: "Map Lease Terms",
    description:
      "Enter lease parameters manually or let CapVeri auto-extract them from uploaded lease PDFs. Each tenant gets its own configuration: RSF, pro-rata share percentage, cap structure, base year, and expense exclusions.",
    highlights: [
      "AI-assisted lease extraction with mandatory human verification",
      "Supports cumulative caps, non-cumulative caps, and CPI-based escalations",
      "Tracks base year amounts for year-over-year cap enforcement",
    ],
  },
  {
    number: 3,
    icon: Calculator,
    title: "Run Reconciliation",
    description:
      "The deterministic engine runs every calculation with exact decimal math. It normalizes variable expenses via gross-up and enforces each tenant's cap structure. It also validates pro-rata shares and flags capital items coded to operating accounts.",
    highlights: [
      "Gross-up to 90%, 95%, or custom occupancy thresholds per lease",
      "Separates controllable vs. uncontrollable expenses before applying caps",
      "Deterministic math with full audit trail on every line item",
    ],
  },
  {
    number: 4,
    icon: AlertTriangle,
    title: "Review Flags & Errors",
    description:
      "Every discrepancy surfaces in a review queue. Each flag shows the GL line and the lease clause it may conflict with. You also see the severity level and the calculation context needed for review.",
    highlights: [
      "Issues grouped by severity and review status",
      "Direct reference to the lease clause or rule being checked",
      "Severity tiers: critical, warning, and informational",
    ],
  },
  {
    number: 5,
    icon: Download,
    title: "Export Tenant-Ready Support",
    description:
      "Generate a packet with the full audit trail. It includes every GL entry, the calculation applied, and the lease term that governed it. Packets work for tenant statements, internal review, or dispute support.",
    highlights: [
      "Export with full GL-to-lease traceability",
      "Summary page with total overcharges, undercharges, and net adjustment",
      "Ready to attach to tenant reconciliation statements",
    ],
  },
];

const ERROR_TYPES = [
  {
    icon: TrendingDown,
    title: "Gross-Up Errors",
    description:
      "CapVeri reviews whether variable expenses were normalized to the lease-defined occupancy threshold and shows the source expense pool, occupancy assumption, and gross-up method used.",
  },
  {
    icon: ShieldAlert,
    title: "Cap Violations",
    description:
      "CapVeri checks controllable expenses against annual or cumulative cap terms and shows the base amount, cap rule, current-year calculation, and any variance that needs review.",
  },
  {
    icon: AlertTriangle,
    title: "CapEx Misclassification",
    description:
      "CapVeri screens GL descriptions and account codes for capital-item indicators, then routes potential CapEx charges for review before they are treated as recoverable operating expenses.",
  },
  {
    icon: Percent,
    title: "Pro-Rata Mistakes",
    description:
      "CapVeri compares tenant share percentages against the lease inputs and denominator assumptions, so teams can confirm RSF, rentable area, and allocation rules before finalizing.",
  },
];

const FAQS = [
  {
    question: "How long does it take to complete a reconciliation?",
    answer:
      "Timing depends on portfolio size, export quality, and how much lease-term review is needed. The workflow is designed around a repeatable process: upload the export, confirm mapped fields and lease inputs, run the deterministic checks, then review flagged issues before exporting the audit trail.",
  },
  {
    question: "Do I need to reformat my GL export before uploading?",
    answer:
      "No. CapVeri auto-detects column mappings from standard exports out of Yardi Voyager, MRI Software, RealPage, AppFolio, and generic CSV formats. If a column cannot be mapped automatically, the system prompts you to confirm the mapping before proceeding.",
  },
  {
    question: "Does CapVeri use AI for financial calculations?",
    answer:
      "No. All financial math, including gross-up, cap enforcement, and pro-rata validation, uses deterministic decimal arithmetic. AI is used only for document extraction (OCR and lease parsing), and every AI-extracted value requires human verification before it enters a calculation.",
  },
  {
    question: "What if my property management system is not listed?",
    answer:
      "Any system that can export to CSV or Excel works with CapVeri. The generic CSV parser handles arbitrary column layouts, and you can save custom column mappings for reuse across future imports.",
  },
  {
    question: "Can I share the audit report with tenants?",
    answer:
      "Yes. The exported PDF includes a summary page with net adjustments and a detailed section with full GL-to-lease traceability. You can attach it to the annual reconciliation statement or use it as backup during tenant disputes.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

const productSchema = structuredDataSchemas.product({
  name: "CapVeri CAM Reconciliation Workflow",
  description:
    "CAM reconciliation software for ERP exports and lease rules. Check billed costs before statements go out.",
  url: `${SITE_URL}/product-tour`,
});

const heroCta = buildTrialLink({
  content: "product_tour_hero",
  campaign: "product_tour",
});

const bottomCta = buildTrialLink({
  content: "product_tour_bottom",
  campaign: "product_tour",
});

export default async function ProductTourPage() {
  const video = await getVideoForPlacement("product-tour");
  return (
    <div className="pb-24">
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={howToSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={productSchema} />

      {/* Hero */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-background to-muted/30 py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-primary">
            Product tour
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            From ERP export to tenant-ready CAM packet
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            See how landlords check exports and lease rules. Verify billed
            amounts before statements go out.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" asChild>
              <a href={heroCta}>
                Start free trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/sample-report">
                View sample packet
                <ChevronRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* 5-Step Walkthrough */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Five steps from ERP export to verified reconciliation
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              CapVeri acts as an independent verification layer over your
              existing exports. No ERP replacement and no financial math handled
              by AI.
            </p>
          </div>

          <div className="mt-16 space-y-12">
            {STEPS.map((step) => (
              <Card key={step.number} className="relative overflow-hidden">
                <CardHeader className="flex flex-row items-start gap-4 pb-2">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                    {step.number}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <step.icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-xl">{step.title}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pl-[4.5rem]">
                  <p className="text-muted-foreground">{step.description}</p>
                  <ul className="mt-4 space-y-2">
                    {step.highlights.map((highlight) => (
                      <li
                        key={highlight}
                        className="flex items-start gap-2 text-sm"
                      >
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y bg-muted/20 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Step-specific product previews
            </h2>
            <p className="mt-4 text-muted-foreground">
              Sample screens show the verification workspace without using real
              customer data or production screenshots.
            </p>
          </div>
          {/* min-w-0 lets each grid item shrink below its content's min-content
              width; without it the demo frames keep their wider inner minimum
              tables' width and overflow the viewport on mobile. */}
          <div className="grid gap-5 [&>section]:min-w-0 lg:grid-cols-2">
            <CapVeriDemoFrame>
              <ReconciliationDashboardMock />
            </CapVeriDemoFrame>
            <CapVeriDemoFrame title="Lease rules">
              <LeaseRulesMock />
            </CapVeriDemoFrame>
            <CapVeriDemoFrame title="Exception queue">
              <ExceptionQueueMock />
            </CapVeriDemoFrame>
            <CapVeriDemoFrame title="Audit packet">
              <AuditPacketMock />
            </CapVeriDemoFrame>
          </div>
        </div>
      </section>

      {/* What You'll Find */}
      <section className="border-y bg-muted/30 py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              What you will find
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              These are the issue categories CapVeri routes into review. Each
              flag points back to the source GL line, the lease rule or
              calculation being checked, and the context needed before approval.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {ERROR_TYPES.map((error) => (
              <Card key={error.title}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <error.icon className="h-5 w-5 text-destructive" />
                    <CardTitle className="text-lg">{error.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {error.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Sample Report CTA */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            See a sample audit packet
          </h2>
          <p className="mt-4 text-muted-foreground">
            See a sample CapVeri packet. It shows flagged issues and the math
            behind each one. Every number ties back to the lease. No signup
            needed.
          </p>
          <Button className="mt-8" size="lg" variant="outline" asChild>
            <Link href="/sample-report">
              View sample packet
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t bg-muted/30 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Frequently asked questions
          </h2>
          <div className="mt-12 space-y-8">
            {FAQS.map((faq) => (
              <div key={faq.question}>
                <h3 className="flex items-start gap-2 text-lg font-semibold">
                  <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  {faq.question}
                </h3>
                <p className="mt-2 pl-7 text-muted-foreground">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Watch band */}
      {video && (
        <section className="py-16 border-t">
          <div className="container mx-auto max-w-3xl px-4">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6 text-center">
              Watch the Full Demo
            </h2>
            <JsonLd
              data={structuredDataSchemas.videoObject({
                name: video.title,
                description: video.description,
                youtubeId: video.youtubeId,
                uploadDate: video.uploadDate,
                durationSeconds: video.durationSeconds,
                thumbnailUrl: video.thumbnailUrl,
              })}
            />
            <VideoEmbed
              youtubeId={video.youtubeId}
              title={video.title}
              thumbnailUrl={video.thumbnailUrl}
            />
            <p className="text-sm text-muted-foreground text-center mt-3">
              {video.description}
            </p>
          </div>
        </section>
      )}

      {/* Bottom CTA */}
      <section className="border-t py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Check one building before statements go out
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Start a {TRIAL_COPY}. Upload an ERP export, check the lease math,
            and review flagged reconciliation issues before statements go out.
          </p>
          <Button className="mt-8" size="lg" asChild>
            <a href={bottomCta}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}
