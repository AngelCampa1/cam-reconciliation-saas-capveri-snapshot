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
    name: "CAM Recovery Ratio Benchmark Worksheet",
    description:
      "Calculate your CAM recovery ratio and compare it to industry benchmarks by property type. Identify structural lease issues that are reducing your operating expense recovery.",
    operatingSystem: "Windows, macOS (Microsoft Excel 2016+, Google Sheets)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/cam-recovery-ratio-worksheet"),
    datePublished: "2026-04-01",
  },
];

const TOOL_FAQS = [
  {
    question: "What is a good CAM recovery ratio?",
    answer:
      "CAM recovery ratios vary significantly by property type and lease structure. For institutional-quality suburban office, a recovery ratio of 85% to 95% is typical where gross leases or modified gross leases are common. Class A retail (strip and power centers) often achieves 95% to 100% recovery on controllable expenses under NNN leases. Industrial and flex properties generally target 95%+ given the prevalence of triple-net structures. Below 80% on a portfolio that should be largely NNN indicates structural lease problems. The worksheet benchmarks your ratio against these property-type standards.",
  },
  {
    question: "What typically reduces CAM recovery ratios?",
    answer:
      "The most common structural causes of low CAM recovery ratios are: CAM caps that have been fully consumed by expense growth, gross-up provisions that are not being applied or are being applied to a too-low occupancy threshold, base year stops that lock the landlord into absorbing expenses above a fixed floor, exclusion clauses that were negotiated too broadly (removing large expense categories from the recoverable pool), and pro-rata denominators that include significant vacant space without a gross-up provision. The worksheet helps you identify which factor is driving under-recovery on each property.",
  },
  {
    question: "How do I improve my recovery ratio?",
    answer:
      "Improving recovery ratio at lease renewal is the most effective approach. The specific tactics depend on the structural cause. If caps are the issue, renegotiate the cap percentage or convert from non-cumulative to cumulative. If gross-up is the problem, add a gross-up provision at 90% or 95% occupancy. If base year stops are dragging recovery, negotiate a moving base year or convert to a CPI escalation structure. For in-place leases, review your current reconciliations for calculation errors. Misapplied gross-up and stale denominators often reduce recovery below what the lease actually allows.",
  },
  {
    question: "How often should I calculate my recovery ratio?",
    answer:
      "Recovery ratio should be calculated at least annually as part of your CAM reconciliation process. Comparing actual recovered amounts to total operating expenses gives you the ratio for that year. It should also be projected forward at each lease renewal and new lease negotiation to evaluate the economic terms being offered. A lease that looks acceptable on face value can produce a 70% recovery ratio at year 5 once caps compound and expense growth is modeled. The worksheet lets you project that before signing.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(TOOL_FAQS);

const BENEFITS = [
  "Calculate your portfolio's CAM recovery ratio by property",
  "Compare against industry benchmarks (office, retail, industrial)",
  "Identify which leases are dragging your recovery ratio down",
  "Model improvement scenarios (cap renegotiation, gross-up correction)",
];

export function CamRecoveryRatioWorksheetClient() {
  const router = useRouter();
  const handleSuccess = () => {
    router.push("/tools/cam-recovery-ratio-worksheet/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free CAM Recovery Ratio Benchmark Worksheet (XLSX) | CapVeri"
      description="Calculate your CAM recovery ratio and compare it to industry benchmarks by property type. Identify structural lease issues that are reducing your operating expense recovery."
      canonical={buildSiteUrl("/tools/cam-recovery-ratio-worksheet")}
      toolName="CAM Recovery Ratio Benchmark Worksheet"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free CAM Recovery Ratio Benchmark Worksheet
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Calculate your recovery ratio, benchmark it against your property
              type, and identify which leases are leaving operating expenses
              unrecovered.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  Most portfolio-level CAM under-recovery is structural, not
                  computational.
                </strong>{" "}
                Caps, base year stops, and poorly drafted gross-up provisions
                can silently reduce recovery ratios by 10 to 20 percentage
                points over a lease term. This worksheet calculates your current
                ratio and benchmarks it against industry standards so you know
                exactly where you stand and what to fix at the next renewal.
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
                    Built for asset managers and CFOs
                  </strong>{" "}
                  benchmarking portfolio operating expense recovery.
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
                Get the free worksheet
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="cam-recovery-ratio-worksheet"
                ctaLabel="Download Free Recovery Ratio Worksheet"
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
