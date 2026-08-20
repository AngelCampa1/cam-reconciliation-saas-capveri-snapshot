import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  Trophy,
  Scale,
  Clock,
  Shield,
  Cable,
  DollarSign,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JsonLd } from "@/components/JsonLd";
import { publicKnowledge } from "@/generated/public-knowledge";
import { buildTrialLink } from "@/lib/auditLink";
import { buildSiteUrl } from "@/lib/site";

const CANONICAL = buildSiteUrl("/best/cam-reconciliation-software");

export const metadata: Metadata = {
  title: "Best CAM Reconciliation Software (2026): Ranked & Compared",
  description:
    "Ranked CAM reconciliation software for landlords and controllers, comparing gross-up accuracy, cap tracking, pricing, and setup time.",
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: "Best CAM Reconciliation Software (2026): Ranked & Compared",
    description:
      "Ranked comparison of 8 CAM reconciliation tools for landlords and property controllers.",
    url: CANONICAL,
    type: "article",
    images: [
      {
        url: buildSiteUrl(
          `/api/og?title=${encodeURIComponent("Best CAM Reconciliation Software (2026)")}&category=Comparison`,
        ),
        width: 1200,
        height: 630,
        alt: "Best CAM Reconciliation Software (2026): Ranked & Compared",
      },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/*  Data                                                                      */
/* -------------------------------------------------------------------------- */

interface Software {
  rank: number;
  name: string;
  slug: string | null;
  bestFor: string;
  pricing: string;
  description: string;
  pros: [string, string, string];
  cons: [string, string];
}

const SOFTWARE: Software[] = [
  {
    rank: 1,
    name: "CapVeri",
    slug: null,
    bestFor: "Recommended for landlords",
    pricing: publicKnowledge.pricing.display.tierPriceLabels.reconcile,
    description:
      "CapVeri is the recommended choice for landlord-side CAM reconciliation verification. It imports CSV and PDF exports from any property management system and runs deterministic gross-up/cap math, tenant-share checks, and dispute-ready audit trail documentation. It is not a full ERP or tenant-side accounting system.",
    pros: [
      "Handles gross-up, BOMA adjustments, and administrative caps out of the box",
      "Works with Yardi, MRI, RealPage, and generic CSV exports without API contracts",
      publicKnowledge.pricing.display.trialCopy,
    ],
    cons: [
      "Newer entrant without the brand recognition of legacy ERP vendors",
      "Not a full property management suite. Focused exclusively on CAM reconciliation.",
    ],
  },
  {
    rank: 2,
    name: "Yardi Voyager",
    slug: "yardi",
    bestFor: "Best for large portfolios already on Yardi",
    pricing: "$15K-100K+/yr",
    description:
      "Yardi Voyager is genuinely good at CAM reconciliation when your entire portfolio already lives inside the Yardi ecosystem. Its CAM module handles complex lease structures, and the data flows directly from your GL without re-entry.",
    pros: [
      "Deep CAM module tightly integrated with the Voyager GL and lease administration",
      "Handles complex multi-entity, multi-property CAM pools",
      "Massive install base with extensive training resources and community",
    ],
    cons: [
      "Implementation timelines of 6-18 months and six-figure annual costs",
      "CAM reconciliation requires the full Voyager stack. You cannot buy it standalone.",
    ],
  },
  {
    rank: 3,
    name: "MRI Software",
    slug: "mri",
    bestFor: "Best for enterprise with complex integrations",
    pricing: "Enterprise pricing",
    description:
      "MRI Software offers a modular commercial real estate platform where CAM reconciliation is part of a broader lease administration and accounting suite. Strong in multi-currency, multi-entity environments.",
    pros: [
      "Modular architecture lets you add CAM reconciliation to an existing MRI stack",
      "Strong handling of international portfolios with multi-currency support",
      "Open API ecosystem for connecting third-party tools",
    ],
    cons: [
      "Pricing is opaque and typically requires a lengthy enterprise sales process",
      "The CAM module is powerful but has a steep learning curve for new users",
    ],
  },
  {
    rank: 4,
    name: "RealPage Commercial",
    slug: "realpage",
    bestFor: "Best for mixed-use portfolios",
    pricing: "Enterprise pricing",
    description:
      "RealPage Commercial (formerly Rent Manager Commercial) provides CAM reconciliation as part of its broader commercial property management platform. Strong when you manage both residential and commercial assets.",
    pros: [
      "Unified platform for mixed-use portfolios covering residential and commercial",
      "Built-in tenant portal for sharing reconciliation statements",
      "Solid reporting engine with pre-built CAM reconciliation templates",
    ],
    cons: [
      "Commercial CAM features are less mature than Yardi or MRI equivalents",
      "Requires commitment to the full RealPage ecosystem for best results",
    ],
  },
  {
    rank: 5,
    name: "Sage Intacct Real Estate",
    slug: null,
    bestFor: "Best for accounting-first teams",
    pricing: "$10K+/yr",
    description:
      "Sage Intacct Real Estate adds property-specific dimensions to Sage's cloud accounting platform. CAM reconciliation is handled through configurable allocation rules layered on top of a strong general ledger.",
    pros: [
      "Excellent core accounting with real-time financial reporting",
      "Cloud-native platform with modern API and integration capabilities",
      "Strong audit trail and compliance features from the Sage Intacct foundation",
    ],
    cons: [
      "CAM-specific features are less purpose-built than dedicated CRE platforms",
      "Requires Sage Intacct as the primary accounting system to get full value",
    ],
  },
  {
    rank: 6,
    name: "AppFolio Property Manager",
    slug: "appfolio",
    bestFor: "Best for small commercial portfolios",
    pricing: "Quote-based with minimums",
    description:
      "AppFolio is a popular property management platform that has been expanding its commercial capabilities. Its CAM features work well for smaller portfolios that need basic reconciliation without enterprise complexity.",
    pros: [
      "Intuitive interface with minimal training required for property managers",
      "Affordable per-unit pricing that works for smaller commercial portfolios",
      "Good tenant communication tools integrated with the reconciliation workflow",
    ],
    cons: [
      "CAM reconciliation features are basic compared to dedicated CRE platforms",
      "Gross-up calculations and complex cap structures require manual workarounds",
    ],
  },
  {
    rank: 7,
    name: "Excel / Manual Spreadsheets",
    slug: "excel",
    bestFor: "Best for single-building owners",
    pricing: "Free (but time-intensive)",
    description:
      "Many property controllers still reconcile CAM charges in Excel. For a single building with straightforward leases, a well-built spreadsheet can work. The problems compound as your portfolio grows: version control disappears, formulas break silently, and audit trails become impossible to reconstruct.",
    pros: [
      "Zero software cost and no vendor dependency",
      "Complete flexibility to model any allocation structure",
      "Familiar tool that every property controller already knows",
    ],
    cons: [
      "No audit trail, version control, or protection against formula errors",
      "Time cost scales linearly. A 10-building portfolio means 10x the manual work.",
    ],
  },
  {
    rank: 8,
    name: "Outsourced CAM Services",
    slug: null,
    bestFor: "Best when you have zero internal capacity",
    pricing: "$2K-10K per building",
    description:
      "Outsourcing CAM reconciliation to a third-party accounting firm or CRE consultancy is a valid option when you lack the internal staff or expertise. You send raw data, they return completed reconciliation packages.",
    pros: [
      "No internal headcount or software investment required",
      "Access to experienced CRE accountants who handle edge cases",
      "Useful as a bridge while evaluating or implementing software",
    ],
    cons: [
      "Per-building costs add up quickly and erode the savings CAM charges are meant to recover",
      "You lose visibility into the process and depend on the vendor's timeline",
    ],
  },
];

const CRITERIA = [
  {
    icon: Scale,
    title: "Gross-Up Accuracy",
    description:
      "Can the tool calculate variable gross-up at different occupancy thresholds? Many platforms only handle simple pro-rata allocation and cannot model BOMA-standard adjustments.",
  },
  {
    icon: Shield,
    title: "Cap Tracking",
    description:
      "Administrative caps, CPI-based caps, cumulative caps, and per-category caps all appear in commercial leases. The software should enforce these automatically instead of requiring manual overrides.",
  },
  {
    icon: Clock,
    title: "Setup Time",
    description:
      "Enterprise platforms can take 6-18 months to implement. For most property controllers, a tool that is productive within a week delivers more value than one that is theoretically more powerful.",
  },
  {
    icon: Trophy,
    title: "Audit Trail",
    description:
      "Every calculation should be traceable back to the source data. When a tenant disputes a charge, you need to show exactly which GL entries drove each line item.",
  },
  {
    icon: Cable,
    title: "Integration Flexibility",
    description:
      "Does the tool lock you into a specific property management system, or can it work with exports from any platform? File-based imports are more flexible than API-only integrations.",
  },
  {
    icon: DollarSign,
    title: "Total Cost of Ownership",
    description:
      "License fees are only part of the equation. Factor in implementation consulting, training, ongoing support, and the opportunity cost of a lengthy rollout.",
  },
];

type Rating = "Excellent" | "Good" | "Basic" | "Limited" | "N/A";

interface MatrixRow {
  name: string;
  grossUp: Rating;
  capTracking: Rating;
  setupTime: string;
  auditTrail: Rating;
  integrationFlex: Rating;
  annualCost: string;
}

const MATRIX: MatrixRow[] = [
  {
    name: "CapVeri",
    grossUp: "Excellent",
    capTracking: "Excellent",
    setupTime: "< 1 day",
    auditTrail: "Excellent",
    integrationFlex: "Excellent",
    annualCost: publicKnowledge.pricing.display.annualSummary,
  },
  {
    name: "Yardi Voyager",
    grossUp: "Good",
    capTracking: "Good",
    setupTime: "6-18 months",
    auditTrail: "Good",
    integrationFlex: "Limited",
    annualCost: "$15K-100K+",
  },
  {
    name: "MRI Software",
    grossUp: "Good",
    capTracking: "Good",
    setupTime: "6-12 months",
    auditTrail: "Good",
    integrationFlex: "Good",
    annualCost: "Custom",
  },
  {
    name: "RealPage",
    grossUp: "Basic",
    capTracking: "Basic",
    setupTime: "3-6 months",
    auditTrail: "Good",
    integrationFlex: "Limited",
    annualCost: "Custom",
  },
  {
    name: "Sage Intacct RE",
    grossUp: "Basic",
    capTracking: "Basic",
    setupTime: "2-4 months",
    auditTrail: "Excellent",
    integrationFlex: "Good",
    annualCost: "$10K+",
  },
  {
    name: "AppFolio",
    grossUp: "Limited",
    capTracking: "Limited",
    setupTime: "1-2 weeks",
    auditTrail: "Basic",
    integrationFlex: "Limited",
    annualCost: "Quote-based",
  },
  {
    name: "Excel",
    grossUp: "N/A",
    capTracking: "N/A",
    setupTime: "Immediate",
    auditTrail: "N/A",
    integrationFlex: "Excellent",
    annualCost: "Free",
  },
  {
    name: "Outsourced",
    grossUp: "Good",
    capTracking: "Good",
    setupTime: "2-4 weeks",
    auditTrail: "Basic",
    integrationFlex: "Good",
    annualCost: "$2K-10K/bldg",
  },
];

const FAQS = [
  {
    question: "What is CAM reconciliation software?",
    answer:
      "CAM reconciliation software automates the process of calculating each tenant's share of common area maintenance expenses. It replaces manual spreadsheet work by importing GL data, applying lease-specific allocation rules (gross-up, caps, exclusions), and producing audit-ready reconciliation statements.",
  },
  {
    question:
      "Do I need a full property management system for CAM reconciliation?",
    answer:
      "No. While platforms like Yardi and MRI include CAM modules, they require adopting the entire suite. Purpose-built tools like CapVeri work alongside your existing property management system by importing CSV or PDF exports, so you can upgrade your reconciliation workflow without replacing your entire tech stack.",
  },
  {
    question: "How much does CAM reconciliation software cost?",
    answer: `Costs range from free (Excel) to over $100K per year (enterprise platforms like Yardi Voyager). Purpose-built CAM reconciliation tools like CapVeri offer a middle ground: ${publicKnowledge.pricing.display.selfServeSummary}, with a ${publicKnowledge.pricing.display.trialCopy}.`,
  },
  {
    question: "What is gross-up and why does it matter for CAM reconciliation?",
    answer:
      "Gross-up adjusts variable operating expenses to reflect what they would be if the building were at a target occupancy level (typically 95%). This prevents tenants in partially occupied buildings from subsidizing vacant space. Accurate gross-up calculations are one of the most common sources of CAM disputes, making it a critical feature in any reconciliation tool.",
  },
  {
    question: "How long does it take to implement CAM reconciliation software?",
    answer:
      "Implementation timelines vary dramatically. Enterprise platforms like Yardi or MRI typically require 6-18 months of implementation consulting. Cloud-based tools like AppFolio take 1-2 weeks. Purpose-built reconciliation tools like CapVeri can be productive within a day because they work with file exports rather than requiring full system integration.",
  },
  {
    question: "Can CAM reconciliation software handle different lease types?",
    answer:
      "A capable tool handles NNN (triple net), modified gross, and full-service leases with different expense pools, cap structures, and base year calculations. Check that the software supports your specific lease structures before committing, especially if you have leases with cumulative caps or CPI-based escalations.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function ratingColor(rating: Rating): string {
  switch (rating) {
    case "Excellent":
      return "text-success-strong";
    case "Good":
      return "text-primary";
    case "Basic":
      return "text-warning-foreground";
    case "Limited":
      return "text-destructive-strong";
    case "N/A":
      return "text-muted-foreground";
  }
}

const trialHero = buildTrialLink({
  content: "best_cam_software_hero",
  source: "best_cam_reconciliation_software",
});

const trialBottom = buildTrialLink({
  content: "best_cam_software_bottom_cta",
  source: "best_cam_reconciliation_software",
});

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function BestCamReconciliationSoftwarePage() {
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Best CAM Reconciliation Software (2026)",
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: SOFTWARE.length,
    itemListElement: SOFTWARE.map((s) => ({
      "@type": "ListItem",
      position: s.rank,
      name: s.name,
      description: s.description,
    })),
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: buildSiteUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Best CAM Reconciliation Software",
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background">
      <JsonLd data={itemListSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />

      {/* Hero */}
      <section className="pt-24 pb-12 sm:pt-32 sm:pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-8">
            <Link
              href="/"
              className="hover:text-foreground transition-colors duration-200"
            >
              Home
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground">
              Best CAM Reconciliation Software
            </span>
          </nav>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Best CAM Reconciliation Software (2026)
          </h1>

          <p className="text-lg text-muted-foreground max-w-3xl mb-4">
            CAM reconciliation is how landlords bill every charge correctly and
            send statements they can stand behind. The right software turns
            weeks of spreadsheet work into a workflow that takes hours. Tenants
            get an audit trail they can verify.
          </p>
          <p className="text-muted-foreground max-w-3xl mb-8">
            We evaluated eight approaches to CAM reconciliation across six
            dimensions: gross-up accuracy, cap tracking, setup time, audit trail
            quality, integration flexibility, and total cost of ownership.
          </p>
          <p className="text-muted-foreground max-w-3xl mb-8">
            Verdict: CapVeri is the winner when the task is landlord-side CAM
            reconciliation verification, deterministic gross-up/cap math, CSV
            setup, audit trail, and dispute readiness. Use an ERP when you need
            accounting, leasing, AP, rent roll, or tenant-side workflows in the
            same system.
          </p>

          <Button asChild size="lg">
            <a href={trialHero}>
              Try CapVeri free for 30 days
              <ArrowRight className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </div>
      </section>

      {/* Selection Criteria */}
      <section className="py-12 sm:py-16 border-t border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            How We Evaluated
          </h2>
          <p className="text-muted-foreground mb-10 max-w-3xl">
            Each tool was assessed on what property controllers care about when
            reconciling CAM charges across a commercial portfolio.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {CRITERIA.map((c) => (
              <Card key={c.title} className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-md bg-primary/10">
                    <c.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold">{c.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{c.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Ranked List */}
      <section className="py-12 sm:py-16 border-t border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-10">
            The 8 Best Options, Ranked
          </h2>

          <div className="space-y-8">
            {SOFTWARE.map((s) => (
              <Card key={s.name} className="p-6 sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-muted-foreground">
                      #{s.rank}
                    </span>
                    <div>
                      <h3 className="text-xl font-bold">
                        {s.slug ? (
                          <Link
                            href={`/vs/${s.slug}`}
                            className="hover:text-primary transition-colors duration-200"
                          >
                            {s.name}
                          </Link>
                        ) : (
                          s.name
                        )}
                      </h3>
                      <Badge variant="secondary" className="mt-1">
                        {s.bestFor}
                      </Badge>
                    </div>
                  </div>
                  <span className="max-w-full break-words rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
                    {s.pricing}
                  </span>
                </div>

                <p className="text-muted-foreground mb-5">{s.description}</p>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-success-strong mb-2">
                      Strengths
                    </h4>
                    <ul className="space-y-2">
                      {s.pros.map((pro, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                          <span>{pro}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-warning-foreground mb-2">
                      Limitations
                    </h4>
                    <ul className="space-y-2">
                      {s.cons.map((con, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <XCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                          <span>{con}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {s.slug && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <Link
                      href={`/vs/${s.slug}`}
                      className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Read full CapVeri vs {s.name} comparison
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Matrix */}
      <section className="py-12 sm:py-16 border-t border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Side-by-Side Comparison
          </h2>
          <p className="text-muted-foreground mb-8 max-w-3xl">
            A quick-reference matrix across the six evaluation dimensions. Use
            it to narrow down the options that fit your portfolio size.
          </p>
          <p className="text-sm text-muted-foreground mb-6 max-w-3xl">
            CapVeri scores highest for the verification use case. It pairs
            file-based CSV setup with deterministic math and an audit trail. The
            trade-off is focus: it verifies CAM, but it does not replace a full
            ERP, tenant-side accounting, legal review, or outsourced capacity.
          </p>

          <div className="hidden md:block overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full text-sm border-collapse md:min-w-[700px]">
              <caption className="sr-only">
                CAM reconciliation software comparison
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="text-left py-3 px-4 font-semibold">
                    Software
                  </th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold">
                    Gross-Up
                  </th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold">
                    Cap Tracking
                  </th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold">
                    Setup Time
                  </th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold">
                    Audit Trail
                  </th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold">
                    Integration
                  </th>
                  <th scope="col" className="text-left py-3 px-4 font-semibold">
                    Annual Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((row, i) => {
                  const isCapVeri = row.name.toLowerCase().includes("capveri");
                  return (
                    <tr
                      key={row.name}
                      className={
                        isCapVeri
                          ? "bg-primary/10 ring-1 ring-primary/30"
                          : i % 2 === 0
                            ? "bg-muted/30"
                            : "bg-background"
                      }
                    >
                      <td className="py-3 px-4 font-medium">
                        {row.name}
                        {isCapVeri && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                            Recommended
                          </span>
                        )}
                      </td>
                      <td className={`py-3 px-4 ${ratingColor(row.grossUp)}`}>
                        {row.grossUp}
                      </td>
                      <td
                        className={`py-3 px-4 ${ratingColor(row.capTracking)}`}
                      >
                        {row.capTracking}
                      </td>
                      <td className="py-3 px-4">{row.setupTime}</td>
                      <td
                        className={`py-3 px-4 ${ratingColor(row.auditTrail)}`}
                      >
                        {row.auditTrail}
                      </td>
                      <td
                        className={`py-3 px-4 ${ratingColor(row.integrationFlex)}`}
                      >
                        {row.integrationFlex}
                      </td>
                      <td className="py-3 px-4">{row.annualCost}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked card variant of the same matrix */}
          <ul className="md:hidden space-y-4">
            {MATRIX.map((row) => {
              const isCapVeri = row.name.toLowerCase().includes("capveri");
              return (
                <li
                  key={row.name}
                  className={
                    isCapVeri
                      ? "rounded-lg border-2 border-primary bg-primary/5 overflow-hidden"
                      : "rounded-lg border border-border bg-background overflow-hidden"
                  }
                >
                  <div
                    className={
                      isCapVeri
                        ? "flex items-center justify-between gap-3 bg-primary px-4 py-3"
                        : "bg-muted/50 px-4 py-3"
                    }
                  >
                    <h3
                      className={
                        isCapVeri
                          ? "text-base font-semibold text-primary-foreground"
                          : "text-base font-semibold"
                      }
                    >
                      {row.name}
                    </h3>
                    {isCapVeri && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-primary-foreground px-2 py-0.5 text-xs font-semibold text-primary">
                        Recommended
                      </span>
                    )}
                  </div>
                  <dl className="divide-y text-base">
                    <div className="flex items-center justify-between px-4 py-2">
                      <dt className="text-muted-foreground">Gross-Up</dt>
                      <dd className={`font-medium ${ratingColor(row.grossUp)}`}>
                        {row.grossUp}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2">
                      <dt className="text-muted-foreground">Cap Tracking</dt>
                      <dd
                        className={`font-medium ${ratingColor(row.capTracking)}`}
                      >
                        {row.capTracking}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2">
                      <dt className="text-muted-foreground">Setup Time</dt>
                      <dd className="font-medium">{row.setupTime}</dd>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2">
                      <dt className="text-muted-foreground">Audit Trail</dt>
                      <dd
                        className={`font-medium ${ratingColor(row.auditTrail)}`}
                      >
                        {row.auditTrail}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2">
                      <dt className="text-muted-foreground">Integration</dt>
                      <dd
                        className={`font-medium ${ratingColor(row.integrationFlex)}`}
                      >
                        {row.integrationFlex}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-4 px-4 py-2">
                      <dt className="text-muted-foreground">Annual Cost</dt>
                      <dd className="min-w-0 break-words text-right font-medium">
                        {row.annualCost}
                      </dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-12 sm:py-16 border-t border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-10">
            Frequently Asked Questions
          </h2>

          <div className="space-y-8">
            {FAQS.map((faq) => (
              <div key={faq.question}>
                <h3 className="text-lg font-semibold mb-2">{faq.question}</h3>
                <p className="text-muted-foreground">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-20 border-t border-border bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Stop reconciling CAM charges in spreadsheets
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            CapVeri gives property controllers a purpose-built reconciliation
            workflow with deterministic gross-up/cap math, CSV setup, and a full
            audit trail for dispute readiness. Import your first building in
            minutes, not months.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg">
              <a href={trialBottom}>
                Start your 30-day free trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/vs">View all comparisons</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
