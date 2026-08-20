import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  DollarSign,
  Clock,
  TrendingUp,
  AlertTriangle,
  Building2,
  Users,
  ShieldAlert,
  Calculator,
  CheckCircle,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { publicKnowledge } from "@/generated/public-knowledge";
import { buildTrialLink } from "@/lib/auditLink";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "CAM Reconciliation Software Value Check",
  description:
    "See the cost of checking CAM statements before they go out. Compare manual work vs. CapVeri across 5, 20, and 50+ building portfolios.",
  alternates: {
    canonical: `${SITE_URL}/roi`,
  },
  openGraph: {
    title: "CAM Reconciliation Software Value Check",
    description:
      "Compare manual CAM work vs. CapVeri. See modeled billing-error exposure and time estimates by portfolio size.",
    url: `${SITE_URL}/roi`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CAM Reconciliation Software Value Check",
    description:
      "Compare manual CAM work vs. CapVeri. See modeled billing-error exposure and time estimates by portfolio size.",
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
      name: "ROI of CAM Reconciliation",
      item: `${SITE_URL}/roi`,
    },
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How much billing-error exposure can CAM software check?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We model billing-error exposure at 0.25% to 1.5% of operating expenses. For a 200,000 square foot Class A office building, that is about $5,900 to $35,300 per building per year. This is a model, not a promised amount. Your actual figure depends on lease terms, tenant count, and your current process.",
      },
    },
    {
      "@type": "Question",
      name: "What is the payback period for CAM reconciliation software?",
      acceptedAnswer: {
        "@type": "Answer",
        text: `Reconcile uses annual unit-based pricing. Current offer details are ${publicKnowledge.pricing.display.launchOfferLabel}. The modeled billing-error range is about $5,900 to $35,300 per building per year. If your building falls in that range, the software can cost very little next to the errors it helps you catch. These are modeled estimates, not promised results. Run your own numbers to see what fits your portfolio.`,
      },
    },
    {
      "@type": "Question",
      name: "How much time does manual CAM reconciliation take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Manual CAM reconciliation often takes 40-80 hours per building per year. This includes pulling GL data, mapping expenses to lease categories, calculating gross-up adjustments, enforcing caps, validating pro-rata shares, and documenting the audit trail. This is a modeled estimate, not a fixed figure. CapVeri reduces this to minutes per building by automating the calculation and validation steps.",
      },
    },
    {
      "@type": "Question",
      name: "What are the hidden costs of manual CAM reconciliation?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Beyond direct labor costs ($2,000-$4,000 per building at typical analyst rates), manual reconciliation creates hidden costs: billing errors that carry forward, tenant audit exposure from inconsistent calculations, late reconciliation penalties when deadlines slip, and key-person risk when the analyst who understands the spreadsheets leaves.",
      },
    },
    {
      "@type": "Question",
      name: "Does CapVeri offer a free trial?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. CapVeri offers a 30-day free trial with full access to every feature. You can upload your GL data, run reconciliations, and review flagged errors before you pay. No credit card is required to start. Add annual billing before the trial ends to keep access.",
      },
    },
    {
      "@type": "Question",
      name: "How does CAM reconciliation software compare to outsourcing?",
      acceptedAnswer: {
        "@type": "Answer",
        text: `Outsourced CAM reconciliation typically costs $2,000 to $5,000 per building per year and takes 2 to 4 weeks. CapVeri Reconcile uses annual unit-based pricing; current offer details are ${publicKnowledge.pricing.display.launchOfferLabel}. You also keep full control of the process, maintain a complete audit trail, and can re-run reconciliations whenever lease terms change or new GL data arrives.`,
      },
    },
  ],
};

const tierLookup = Object.fromEntries(
  publicKnowledge.pricing.tiers.map((t) => [t.id, t]),
);

const COST_OF_INACTION = [
  {
    icon: DollarSign,
    title: "Unchecked Billing Errors",
    stat: "0.25-1.5%",
    description:
      "We model billing-error exposure at 0.25% to 1.5% of operating expenses. For a 200,000 square foot building, that is roughly $5,900 to $35,300 a year.",
  },
  {
    icon: ShieldAlert,
    title: "Tenant Audit Exposure",
    stat: "Audit rights",
    description:
      "Many commercial leases give tenants the right to audit your charges. When your reconciliation has errors, tenant auditors can find them. You may end up paying their audit costs plus a refund.",
  },
  {
    icon: AlertTriangle,
    title: "Late Reconciliation Penalties",
    stat: "90-180 days",
    description:
      "Most leases require reconciliation within 90-180 days of year-end. Miss the deadline and you may lose the right to collect true-ups for the whole year.",
  },
  {
    icon: Clock,
    title: "Staff Time and Key-Person Risk",
    stat: "40-80 hrs",
    description:
      "Manual reconciliation takes 40-80 hours per building per year. When the one analyst who built the spreadsheet leaves, the process knowledge goes with them.",
  },
];

const ROI_SCENARIOS = [
  {
    title: "Small Portfolio",
    units: 25,
    buildings: 5,
    plan: "Reconcile (25 units)",
    annualCost: tierLookup.reconcile.launchAnnual ?? 0,
    recoveryLow: "29,500",
    recoveryHigh: "176,500",
    roiLow: "25x",
    roiHigh: "149x",
    manualHours: "200-400",
    capveriTime: "Under 1 hour total",
  },
  {
    title: "Mid-Size Portfolio",
    units: 125,
    buildings: 20,
    plan: "Reconcile (125 units)",
    annualCost: 4578,
    recoveryLow: "118,000",
    recoveryHigh: "706,000",
    roiLow: "39x",
    roiHigh: "236x",
    manualHours: "800-1,600",
    capveriTime: "A few hours total",
  },
  {
    title: "Enterprise Portfolio",
    units: 500,
    buildings: 50,
    plan: "Reconcile (500 units)",
    annualCost: 17303,
    recoveryLow: "295,000",
    recoveryHigh: "1,765,000",
    roiLow: "49x",
    roiHigh: "295x",
    manualHours: "2,000-4,000",
    capveriTime: "A few hours total",
  },
];

const TIME_COMPARISON = [
  {
    task: "Pull GL data and map to lease categories",
    manual: "8-16 hours",
    capveri: "Minutes (CSV upload)",
  },
  {
    task: "Calculate gross-up adjustments",
    manual: "4-8 hours",
    capveri: "Automatic",
  },
  {
    task: "Enforce expense caps (cumulative + non-cumulative)",
    manual: "4-8 hours",
    capveri: "Automatic",
  },
  {
    task: "Validate pro-rata share allocations",
    manual: "4-8 hours",
    capveri: "Automatic",
  },
  {
    task: "Identify CapEx misclassifications",
    manual: "8-16 hours",
    capveri: "Flagged automatically",
  },
  {
    task: "Document audit trail",
    manual: "8-16 hours",
    capveri: "Built-in",
  },
  {
    task: "Total per building per year",
    manual: "40-80 hours",
    capveri: "Under 15 minutes",
  },
];

export default function ROIPage() {
  const heroCta = buildTrialLink({
    content: "roi_hero_cta",
    campaign: "roi_page",
  });
  const bottomCta = buildTrialLink({
    content: "roi_bottom_cta",
    campaign: "roi_page",
  });

  return (
    <div>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={faqSchema} />

      {/* Hero */}
      <section className="bg-gradient-to-b from-background to-muted/30 py-20 md:py-28">
        <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
            What a CAM Check Saves You
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Check CAM statements before tenants see them. Find over-bills,
            under-bills, and math issues in minutes.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg">
              <a href={heroCta}>
                Start free trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Cost of Doing Nothing */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              The Cost of Skipping a Check
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              Manual reconciliation can leave billing errors in place. A clear
              check helps your team fix them first.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {COST_OF_INACTION.map((item) => (
              <Card key={item.title} className="relative overflow-hidden">
                <CardHeader className="pb-2">
                  <item.icon className="mb-2 h-8 w-8 text-amber-500" />
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-2 text-2xl font-bold text-destructive-strong">
                    {item.stat}
                  </p>
                  <p className="text-base text-muted-foreground">
                    {item.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ROI Breakdown by Portfolio Size */}
      <section className="bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              Value by Portfolio Size
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              We model $5,900 to $35,300 in bill risk per building each year.
              Your real result depends on your leases and process.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {ROI_SCENARIOS.map((scenario) => (
              <Card
                key={scenario.title}
                className="relative flex flex-col overflow-hidden"
              >
                <CardHeader className="bg-primary/5 pb-4">
                  <div className="mb-1 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    <CardTitle className="text-xl">{scenario.title}</CardTitle>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    ~{scenario.units} units
                  </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4 pt-6">
                  <div>
                    <p className="mb-1 text-sm font-medium text-muted-foreground">
                      Modeled Billing-Error Exposure
                    </p>
                    <p className="text-2xl font-bold text-success-strong">
                      ${scenario.recoveryLow} - ${scenario.recoveryHigh}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Across about {scenario.buildings} buildings
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-sm font-medium text-muted-foreground">
                      CapVeri Annual Cost
                    </p>
                    <p className="text-xl font-semibold">
                      {scenario.annualCost > 0
                        ? `$${scenario.annualCost.toLocaleString()}/yr`
                        : "Custom"}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        {scenario.annualCost > 0
                          ? `(${scenario.plan} annual plan)`
                          : `(${scenario.plan}: contact us)`}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-sm font-medium text-muted-foreground">
                      Modeled Value-to-Cost Ratio
                    </p>
                    <p className="text-2xl font-bold text-primary">
                      {scenario.roiLow === "contact"
                        ? "Contact us"
                        : `${scenario.roiLow} - ${scenario.roiHigh}`}
                    </p>
                  </div>
                  <div className="mt-auto border-t pt-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Manual: {scenario.manualHours} hrs/yr
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span className="font-medium">
                        CapVeri: {scenario.capveriTime}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Fine-print verification disclaimer */}
          <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted-foreground">
            These numbers come from other buildings, not yours. Check your own
            numbers before you act on them.
          </p>
        </div>
      </section>

      {/* Time Savings Comparison */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              Time Savings: Manual vs. CapVeri
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              A single building reconciliation broken down by task. At $50 to
              $100 per analyst hour, the labor cost on one building can run past
              what many portfolios pay for a year of CapVeri.
            </p>
          </div>
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full">
                <caption className="sr-only">
                  Reconciliation task time comparison
                </caption>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-sm font-semibold"
                    >
                      Reconciliation Task
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-center text-sm font-semibold"
                    >
                      <span className="flex items-center justify-center gap-1">
                        <Users className="h-4 w-4" />
                        Manual
                      </span>
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-center text-sm font-semibold"
                    >
                      <span className="flex items-center justify-center gap-1">
                        <Calculator className="h-4 w-4" />
                        CapVeri
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {TIME_COMPARISON.map((row, i) => (
                    <tr
                      key={row.task}
                      className={`border-b ${
                        i === TIME_COMPARISON.length - 1
                          ? "bg-muted/30 font-semibold"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-sm">{row.task}</td>
                      <td className="px-4 py-3 text-center text-sm text-destructive-strong">
                        {row.manual}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-success-strong">
                        {row.capveri}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Context */}
      <section className="bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
            Pricing That Fits the Check
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">
            See pricing for your rentable unit count. Reconcile includes a
            30-day free trial. No credit card required to start. Add annual
            billing before the trial ends to keep access.
          </p>
          <div className="mx-auto grid max-w-xl gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Reconcile</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-3xl font-bold">
                  {publicKnowledge.pricing.display.tierPriceLabels.reconcile}
                </p>
                <p className="text-xs font-semibold text-primary">
                  {publicKnowledge.pricing.display.launchOfferTerms}
                </p>
                <p className="text-base text-muted-foreground">
                  {tierLookup.reconcile.display.limit}. One corrected billing
                  error can outweigh the annual subscription.
                </p>
              </CardContent>
            </Card>
          </div>
          <div className="mt-8">
            <Button asChild variant="outline" size="lg">
              <Link href="/pricing">
                See Full Plan Comparison
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-12 text-center text-3xl font-bold tracking-tight md:text-4xl">
            Frequently Asked Questions
          </h2>
          <div className="space-y-8">
            {faqSchema.mainEntity.map((faq) => (
              <div key={faq.name}>
                <h3 className="mb-2 text-lg font-semibold">{faq.name}</h3>
                <p className="text-muted-foreground">
                  {faq.acceptedAnswer.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-primary py-16 text-primary-foreground md:py-24">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <CheckCircle className="mx-auto mb-6 h-12 w-12" />
          <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
            Check Your Portfolio Before You Bill
          </h2>
          <p className="mx-auto mb-8 max-w-xl opacity-90">
            Upload one building&apos;s GL data during your 30-day free trial. No
            credit card required to start. Review the flags before you pay
            anything.
          </p>
          <Button asChild size="lg" variant="secondary">
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
