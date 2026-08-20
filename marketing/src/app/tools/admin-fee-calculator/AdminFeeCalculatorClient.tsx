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
    name: "Admin Fee Calculator",
    description:
      "Compare gross, net, and capped admin fee calculation methods side by side. See the dollar impact per tenant and verify which method matches your lease language.",
    operatingSystem: "Windows, macOS (Microsoft Excel 2016+, Google Sheets)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/admin-fee-calculator"),
    datePublished: "2026-03-18",
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Compare Admin Fee Calculation Methods",
    description:
      "Download and use the free Admin Fee Calculator to compare gross, net, and capped admin fee methods across your tenant roster.",
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
        name: "Input your expense and lease data",
        text: "Enter total operating expenses, admin fee percentages, and any fee cap provisions from your leases.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Compare admin fee methods",
        text: "Review the side-by-side comparison of gross, net, and capped admin fee calculations and the dollar impact per tenant.",
      },
    ],
  },
];

const ADMIN_FEE_FAQS = [
  {
    question: "What is the difference between gross and net admin fee methods?",
    answer:
      "A gross admin fee is calculated on total operating expenses before any exclusions, while a net admin fee is calculated only on recoverable expenses after removing non-recoverable items. The gross method typically produces higher fees because the base amount is larger. Which method applies depends entirely on your lease language.",
  },
  {
    question: "How does capping affect admin fee revenue?",
    answer:
      "An admin fee cap limits the management fee to a fixed dollar amount or a percentage ceiling, regardless of the underlying calculation. Caps protect tenants from runaway fees but can erode landlord revenue when operating expenses increase. This calculator models capped scenarios so you can see the dollar impact of various cap thresholds.",
  },
  {
    question: "What percentage is a typical admin fee in commercial leases?",
    answer:
      "Admin fees in commercial leases typically range from 3% to 5% of operating expenses for office properties and 5% to 15% for retail properties. The percentage varies by market, property type, and negotiating position. Institutional landlords often command higher fees due to economies of scale.",
  },
  {
    question:
      "Can admin fees be included in the CAM expense pool for recovery?",
    answer:
      "Yes, most NNN leases allow landlords to include management and admin fees in the recoverable expense pool. However, the lease must explicitly permit this. Some leases cap the fee or exclude it from gross-up calculations. Always verify the exact lease language before including admin fees in your reconciliation.",
  },
  {
    question: "How do I know which admin fee method my lease requires?",
    answer:
      "Review the management fee or administrative fee clause in your lease. Look for language specifying whether the fee is calculated on 'total operating expenses,' 'recoverable expenses,' or 'net expenses.' If the lease includes a cap, note whether it is a dollar cap or a percentage cap and whether it escalates annually.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(ADMIN_FEE_FAQS);

const BENEFITS = [
  "Side-by-side comparison of gross, net, and capped admin fee methods",
  "Shows dollar impact per tenant across all three calculation approaches",
  "Models fee cap scenarios to quantify revenue ceiling effects",
  "Spots gaps between your billings and your lease language",
];

export function AdminFeeCalculatorClient() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push("/tools/admin-fee-calculator/thank-you");
  };

  return (
    <ToolPageLayout
      title="Admin Fee Calculator: Compare Gross, Net and Capped Methods | CapVeri"
      description="Compare gross, net, and capped admin fee calculation methods side by side. See the dollar impact per tenant and spot gaps between your billings and your lease language."
      canonical={buildSiteUrl("/tools/admin-fee-calculator")}
      toolName="Admin Fee Calculator"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Admin Fee Calculator
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Compare gross, net, and capped admin fee methods. Download free.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  Admin fees are one of the most commonly miscalculated line
                  items in CAM reconciliation. The method you use (gross, net,
                  or capped) can swing recovery by thousands per tenant.
                </strong>{" "}
                Model all three methods side by side and verify your billings
                match your lease language.
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
                    Used by property controllers
                  </strong>{" "}
                  who need to verify admin fee calculations match lease language
                  across multi-tenant portfolios.
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
                to automate admin fee calculations entirely.
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
                assetSlug="admin-fee-calculator"
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
              {ADMIN_FEE_FAQS.map((faq) => (
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
