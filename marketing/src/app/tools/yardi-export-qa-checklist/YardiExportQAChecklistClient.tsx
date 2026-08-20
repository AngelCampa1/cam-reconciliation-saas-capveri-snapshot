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
    name: "Yardi Export Error Checklist for CAM Reconciliation",
    description:
      "A step-by-step checklist for verifying Yardi GL exports before running CAM reconciliation. Catches CapEx miscoding, date range mismatches, and management fee errors.",
    operatingSystem: "Windows, macOS (Adobe Acrobat, any PDF viewer)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/yardi-export-qa-checklist"),
    datePublished: "2026-04-01",
  },
];

const TOOL_FAQS = [
  {
    question: "Which Yardi reports should I export for CAM reconciliation?",
    answer:
      "For CAM reconciliation in Yardi Voyager, the essential exports are: the General Ledger Detail report (filtered to your CAM property and the reconciliation year), the Chart of Accounts (to map GL codes to recoverable vs. excluded categories), the Property Occupancy report (for gross-up denominator verification), and the Management Fee Summary. In Yardi Breeze, the equivalent reports are under Accounting > Reports. The checklist cross-references each QA step to the specific report you need.",
  },
  {
    question: "How do I check for CapEx in a Yardi GL export?",
    answer:
      "In Yardi, capital expenditure items are typically posted to account codes in the 1500-1999 range (asset accounts) or to specific project codes that begin with a capital prefix depending on how your chart of accounts is configured. The checklist flags the GL code ranges and project code patterns most commonly used for CapEx in standard Yardi setups. You should also look for large single-line items over $5,000 without recurring vendors, and any entries coded to improvement or renovation accounts.",
  },
  {
    question: "What date range should my Yardi CAM export cover?",
    answer:
      "Your Yardi GL export for CAM reconciliation should cover the full calendar year (January 1 through December 31) unless your lease defines a non-calendar CAM year. Be especially careful in Yardi to use the accounting period dates rather than the transaction entry dates. Late journal entries and accrual reversals can fall in different periods than the transactions they relate to. The checklist includes a specific step for confirming that the period filter in Yardi matches your lease year definition.",
  },
  {
    question: "How long does the Yardi export QA take?",
    answer:
      "For a single property with a straightforward chart of accounts, the 15-step QA typically takes 20 to 45 minutes. Properties with complex GL structures, multiple management fee arrangements, or large volumes of miscellaneous coding can take longer. The checklist is designed to be completed by a single reviewer working from the Yardi GL detail export. No additional Yardi access or queries are required beyond standard reporting.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(TOOL_FAQS);

const BENEFITS = [
  "15-step QA checklist specific to Yardi Voyager and Breeze exports",
  "Covers CapEx detection signals, date range verification, and management fee validation",
  "Includes which Yardi reports to cross-reference for each step",
  "Printable PDF. Works alongside your Yardi workflow.",
];

export function YardiExportQAChecklistClient() {
  const router = useRouter();
  const handleSuccess = () => {
    router.push("/tools/yardi-export-qa-checklist/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free Yardi Export Error Checklist for CAM Reconciliation (PDF) | CapVeri"
      description="A step-by-step checklist for verifying Yardi GL exports before running CAM reconciliation. Catches CapEx miscoding, date range mismatches, and management fee errors."
      canonical={buildSiteUrl("/tools/yardi-export-qa-checklist")}
      toolName="Yardi Export Error Checklist"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free Yardi Export Error Checklist for CAM Reconciliation
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Verify your Yardi GL export before running reconciliation. Catch
              CapEx miscoding, date mismatches, and management fee errors in 15
              steps.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  Bad Yardi exports produce bad reconciliations. Bad
                  reconciliations produce tenant disputes.
                </strong>{" "}
                Most CAM errors traced back to Yardi stem from three sources:
                CapEx items coded to operating expense accounts, date range
                filters that miss accrual entries, and management fee bases
                calculated from the wrong pool. This checklist catches all three
                before your reconciliation runs.
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
                    Built for property accountants and controllers
                  </strong>{" "}
                  running Yardi Voyager or Breeze.
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
                Get the free checklist
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="yardi-export-qa-checklist"
                ctaLabel="Download Free Yardi QA Checklist"
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
