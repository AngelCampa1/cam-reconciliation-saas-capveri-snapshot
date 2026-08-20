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
    name: "Pro-Rata Share Calculator: Multi-Denominator Comparison",
    description:
      "Compare pro-rata share allocations under different denominator definitions. Model gross-up impact, handle anchor exclusions, and show per-tenant variance.",
    operatingSystem: "Windows, macOS (Microsoft Excel 2016+, Google Sheets)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    datePublished: "2026-03-18",
    url: buildSiteUrl("/tools/pro-rata-calculator"),
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Compare Pro-Rata Shares Across Denominator Definitions",
    description:
      "Download and use the free Pro-Rata Calculator to model tenant share allocations under different denominator methods and anchor exclusion scenarios.",
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
        name: "Input tenant and building data",
        text: "Enter total building area, each tenant's leased square footage, anchor exclusions, and the occupancy rate for gross-up comparison.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Compare denominator scenarios",
        text: "Review side-by-side pro-rata shares under total GLA, occupied GLA, and leasable GLA denominators. See per-tenant dollar variance across methods.",
      },
    ],
  },
];

const PRO_RATA_FAQS = [
  {
    question: "How is a tenant's pro-rata share calculated?",
    answer:
      "Pro-rata share equals the tenant's leased square footage divided by the denominator (the building area used for allocation). A tenant leasing 5,000 SF in a 100,000 SF building has a 5% pro-rata share. The critical variable is the denominator: total GLA, occupied GLA, or leasable GLA can produce materially different allocations for the same tenant.",
  },
  {
    question:
      "What is the difference between total GLA, occupied GLA, and leasable GLA denominators?",
    answer:
      "Total GLA uses the entire building footprint. Occupied GLA uses only leased space, increasing each tenant's share when vacancies exist. Leasable GLA excludes common areas and management offices. For a building with 10% vacancy, the difference between total and occupied GLA denominators can shift a tenant's share by 10-15%, translating to thousands of dollars annually.",
  },
  {
    question: "How do anchor tenant exclusions affect pro-rata shares?",
    answer:
      "When an anchor tenant is excluded from the CAM pool (common in retail leases), the denominator shrinks and every remaining tenant's pro-rata share increases. A 50,000 SF anchor exclusion in a 200,000 SF building means the remaining tenants split costs over 150,000 SF instead of 200,000 SF. That is a 33% increase in their individual share percentages.",
  },
  {
    question: "How does gross-up affect pro-rata allocation?",
    answer:
      "Gross-up inflates variable expenses to a target occupancy threshold before applying pro-rata shares. Without gross-up, tenants in a 70% occupied building pay their share of understated variable costs. With gross-up to 95%, variable expenses are adjusted upward, and the grossed-up total is then divided by the chosen denominator. The interaction between gross-up and denominator choice can compound allocation differences significantly.",
  },
  {
    question: "Why do my tenants' pro-rata shares not add up to 100%?",
    answer:
      "This typically happens when the denominator includes vacant space or excluded anchors. If you use total GLA as the denominator but only have 80% occupancy, tenant shares sum to 80%. If an anchor is excluded, tenant shares sum to the non-anchor percentage. Whether you gross up to cover the gap or absorb it as landlord vacancy cost depends on lease language.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(PRO_RATA_FAQS);

const BENEFITS = [
  "Compares pro-rata under total GLA, occupied GLA, and leasable GLA denominators",
  "Models gross-up impact on pro-rata allocation at multiple occupancy thresholds",
  "Handles anchor tenant exclusions with automatic share redistribution",
  "Shows per-tenant dollar variance across denominator methods",
];

export function ProRataCalculator() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push("/tools/pro-rata-calculator/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free Pro-Rata Share Calculator: Multi-Denominator | CapVeri"
      description="Compare pro-rata share allocations under different denominator definitions. Model gross-up impact, anchor exclusions, and per-tenant variance side by side."
      canonical={buildSiteUrl("/tools/pro-rata-calculator")}
      toolName="Pro-Rata Share Calculator"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free Pro-Rata Share Calculator
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Compare tenant allocations across denominator definitions.
              Download free.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  The denominator used to calculate pro-rata share is the single
                  biggest variable in CAM allocation.
                </strong>{" "}
                Whether you use total GLA, occupied GLA, or leasable GLA (and
                whether anchors are excluded) can swing a tenant&apos;s annual
                bill by thousands of dollars. This calculator lets you model all
                scenarios before reconciliation.
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
                    Essential for property controllers
                  </strong>{" "}
                  managing multi-tenant properties where lease language varies
                  across tenants on denominator definitions.
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
                to automate this calculation entirely.
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
                assetSlug="pro-rata-calculator"
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
              {PRO_RATA_FAQS.map((faq) => (
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
