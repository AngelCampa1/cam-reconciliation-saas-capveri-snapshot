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
    name: "Cumulative CAM Cap Bank Calculator",
    description:
      "Track cumulative CAM cap bank balances across multiple lease years. See how unused capacity carries forward and how it affects future billing limits.",
    operatingSystem: "Windows, macOS (Microsoft Excel 2016+, Google Sheets)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/cumulative-cap-bank-calculator"),
    datePublished: "2026-04-01",
  },
];

const TOOL_FAQS = [
  {
    question: "What is a cumulative CAM cap bank?",
    answer:
      "A cumulative CAM cap bank is the running balance of unused cap capacity that carries forward from year to year under a cumulative cap structure. When actual CAM expenses in a given year come in below the cumulative ceiling, the unused allowance does not disappear. It accumulates in the bank. In future years when expenses spike, the landlord can draw on this banked capacity to recover charges above what a simple annual percentage would allow.",
  },
  {
    question: "How is the cumulative cap calculated?",
    answer:
      "The cumulative cap ceiling for any given year equals the base year CAM amount multiplied by (1 + cap percentage) raised to the power of the number of years since the base year. For example, with a $200,000 base year and a 4% cumulative cap, the year 5 ceiling is $200,000 × 1.04^5 = $243,331. The tenant pays the lesser of actual expenses or this ceiling. The bank balance is the ceiling minus what was actually billed in each prior year.",
  },
  {
    question: "When does the cap bank reset?",
    answer:
      "Under most lease drafting, the cumulative cap bank does not reset. The banked capacity compounds throughout the lease term. However, some leases include a reset provision that zeroes the bank at lease renewal or at specific intervals. Review your lease language carefully. The calculator includes a toggle for both scenarios so you can model the lease as written.",
  },
  {
    question: "How is this different from a non-cumulative cap?",
    answer:
      "A non-cumulative cap limits the year-over-year increase to a fixed percentage of the prior year's actual charges. It does not carry unused capacity forward. If expenses rise by only 1% in a year with a 5% non-cumulative cap, the remaining 4% is lost. Under a cumulative cap, that 4% banks and is available in future years. Over a 5 to 10 year lease, the difference between structures can amount to significant recoverable dollars for the landlord.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(TOOL_FAQS);

const BENEFITS = [
  "Track cumulative cap bank balance for each lease year",
  "See how unused cap capacity compounds over time",
  "Model different cap scenarios (3% vs 5% cumulative)",
  "Export a lease-year-by-lease-year summary for each tenant",
];

export function CumulativeCapBankCalculatorClient() {
  const router = useRouter();
  const handleSuccess = () => {
    router.push("/tools/cumulative-cap-bank-calculator/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free Cumulative CAM Cap Bank Calculator (XLSX) | CapVeri"
      description="Track cumulative CAM cap bank balances across multiple lease years. See how unused capacity carries forward and how it affects future billing limits."
      canonical={buildSiteUrl("/tools/cumulative-cap-bank-calculator")}
      toolName="Cumulative CAM Cap Bank Calculator"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free Cumulative CAM Cap Bank Calculator
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Model cumulative cap banks across your lease years and see exactly
              how unused capacity stacks up over time. Download free XLSX.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  Cumulative CAM caps are one of the most misunderstood
                  provisions in commercial leases.
                </strong>{" "}
                Property controllers who fail to track the cap bank year-by-year
                routinely under-bill tenants or expose themselves to lease
                disputes. This calculator gives you a full picture of the bank
                balance, ceiling, and recoverable amounts across the entire
                lease term.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Two-column */}
      <section className="py-8 pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16 max-w-5xl">
            {/* Benefits */}
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
                    Built for property controllers and lease administrators
                  </strong>{" "}
                  managing multi-tenant portfolios with cumulative CAM cap
                  provisions.
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
                to access this and all other tools.
              </p>
            </div>
            {/* Lead capture */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-1">
                Get the free calculator
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="cumulative-cap-bank-calculator"
                ctaLabel="Download Free Cap Bank Calculator"
                onSuccess={handleSuccess}
                source="tools-page"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-8 pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2 className="text-lg md:text-xl lg:text-2xl font-bold mb-8">
              Frequently Asked Questions
            </h2>
            <div className="space-y-2">
              {TOOL_FAQS.map((faq) => (
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
