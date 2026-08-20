"use client";

import { APP_URL } from "@/lib/site";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { ToolPageLayout } from "@/components/content/ToolPageLayout";
import { LeadCaptureForm } from "@/components/lead-capture/LeadCaptureForm";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildSiteUrl } from "@/lib/site";

const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    applicationCategory: "FinanceApplication",
    applicationSubCategory: "Calculator",
    name: "Base Year Escalation Calculator",
    description:
      "Project base year excess expense obligations over a full lease term. Model CPI escalation scenarios, handle multiple expense categories, and see cumulative tenant obligations year by year.",
    operatingSystem: "Windows, macOS (Microsoft Excel 2016+, Google Sheets)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/base-year-escalation"),
    datePublished: "2026-03-18",
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Project Base Year Excess Expense Obligations",
    description:
      "Download and use the free Base Year Escalation Calculator to model excess expense obligations over your lease term.",
    totalTime: "PT10M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Enter your email",
        text: "Submit your email address to receive the download link instantly.",
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Download the calculator",
        text: "Open the Excel file in Microsoft Excel 2016+ or Google Sheets.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Input base year and lease data",
        text: "Enter your base year expense amounts, lease term, CPI escalation assumptions, and expense categories.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Review escalation projections",
        text: "See year-by-year excess expense obligations, cumulative tenant exposure, and trend charts across the full lease term.",
      },
    ],
  },
];

const BASE_YEAR_FAQS = [
  {
    question: "How does a base year lease work for operating expenses?",
    answer:
      "In a base year lease, the landlord pays all operating expenses in the first year (the base year). In later years, the tenant pays their pro-rata share of any expenses above the base year amount. The base year sets a floor. The tenant only pays the increase above that floor.",
  },
  {
    question: "What is the difference between a base year and an expense stop?",
    answer:
      "A base year uses actual first-year expenses as the benchmark, so it floats with market conditions at lease commencement. An expense stop is a fixed dollar amount negotiated upfront. Base years tend to favor tenants in rising-cost environments because the benchmark is tied to real costs. Expense stops give landlords more predictability.",
  },
  {
    question: "How do you calculate excess expense obligations?",
    answer:
      "Subtract the base year expense amount from the current year's actual expenses. Multiply the positive difference by the tenant's pro-rata share. If current year expenses are lower than the base year, the tenant owes nothing. Most leases do not give a credit or refund for underruns.",
  },
  {
    question: "How does CPI escalation affect base year calculations?",
    answer:
      "Some leases escalate the base year amount by CPI annually, which reduces the tenant's excess obligation over time. Without CPI escalation, the base year stays fixed and the tenant's exposure grows each year as expenses naturally increase. Modeling both scenarios helps you forecast recovery revenue accurately.",
  },
  {
    question:
      "What happens to the base year when a building is not fully occupied?",
    answer:
      "If the building was not fully occupied during the base year, variable expenses may be lower than normal. Many leases require the base year to be grossed up to a specified occupancy threshold (typically 95%) so that the benchmark reflects normalized operations. Without a gross-up clause, the base year may be artificially low, increasing tenant obligations in later years.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(BASE_YEAR_FAQS);

const BENEFITS = [
  "Projects base year excess expense obligations over the full lease term",
  "Models CPI escalation scenarios to compare tenant exposure paths",
  "Handles multiple expense categories with separate base year amounts",
  "Shows cumulative tenant obligation with year-by-year trend visualization",
];

export function BaseYearEscalationClient() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push("/tools/base-year-escalation/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free Base Year Escalation Calculator | CapVeri"
      description="Project base year excess expense obligations over your lease term. Model CPI escalation scenarios and see cumulative tenant obligations year by year."
      canonical={buildSiteUrl("/tools/base-year-escalation")}
      toolName="Base Year Escalation Calculator"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free Base Year Escalation Calculator
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Project excess expense obligations over your full lease term.
              Download free.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  Base year leases are the most common expense structure in
                  office properties. They are also the most prone to forecasting
                  errors that reduce recovery.
                </strong>{" "}
                This calculator models excess expense obligations year by year.
                Use it to forecast tenant billings and catch under-recoveries
                before they compound.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Two-column layout */}
      <section className="py-8 pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16 max-w-5xl">
            {/* Left: benefits */}
            <div>
              <h2 className="text-xl font-semibold mb-6">What&apos;s inside</h2>
              <ul className="space-y-4">
                {BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <span className="text-sm">{benefit}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">
                    Built for property controllers
                  </strong>{" "}
                  managing base year leases across multi-tenant office
                  portfolios where expense escalation drives recovery revenue.
                </p>
              </div>

              <p className="mt-6 text-xs text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href={`${APP_URL}/auth/login`}
                  className="underline hover:text-foreground"
                >
                  Log in
                </Link>{" "}
                to automate base year escalation tracking entirely.
              </p>
            </div>

            {/* Right: lead capture form */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-1">
                Get the free calculator
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="base-year-escalation"
                ctaLabel="Download Free Calculator"
                onSuccess={handleSuccess}
                source="tools-page"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-8 pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2 className="text-lg md:text-xl lg:text-2xl font-bold mb-8">
              Frequently Asked Questions
            </h2>
            <div className="space-y-2">
              {BASE_YEAR_FAQS.map((faq) => (
                <details key={faq.question} className="group border rounded-lg">
                  <summary className="flex cursor-pointer select-none items-center justify-between p-4 font-medium">
                    {faq.question}
                    <ChevronDown className="h-4 w-4 flex-shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-4 text-muted-foreground text-sm leading-relaxed">
                    {faq.answer}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>
    </ToolPageLayout>
  );
}
