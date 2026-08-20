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
    applicationSubCategory: "Template",
    name: "Tenant CAM Statement Outline",
    description:
      "Download a professional CAM reconciliation statement template with California SB 1103 disclosure support, customizable expense categories, and audit-ready formatting.",
    operatingSystem: "Windows, macOS (Microsoft Excel 2016+, Google Sheets)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    datePublished: "2026-03-18",
    url: buildSiteUrl("/tools/reconciliation-statement-generator"),
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Create a Professional CAM Reconciliation Statement",
    description:
      "Download and customize the free reconciliation statement template to produce audit-ready tenant reconciliation packages.",
    totalTime: "PT15M",
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
        name: "Download the template",
        text: "Open the Excel template in Microsoft Excel 2016+ or Google Sheets.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Customize expense categories",
        text: "Add or remove expense line items to match your property's chart of accounts and lease-required disclosure categories.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Generate tenant statements",
        text: "Enter actual expenses, tenant estimates paid, and pro-rata shares. The template calculates the reconciliation balance (amount due or credit) and formats a professional statement ready for tenant delivery.",
      },
    ],
  },
];

const RECON_FAQS = [
  {
    question: "What should a CAM reconciliation statement include?",
    answer:
      "A complete reconciliation statement should include: the reconciliation period, total actual operating expenses by category, the tenant's pro-rata share percentage, the tenant's allocated share of each expense category, total estimated payments collected during the year, and the net balance due or credit. California SB 1103 also requires landlords to provide supporting documentation upon tenant request.",
  },
  {
    question:
      "What is SB 1103 and how does it affect reconciliation statements?",
    answer:
      "California Senate Bill 1103 (effective 2024) requires commercial landlords to provide itemized operating expense statements within specific timeframes and make supporting documentation available for tenant review. Non-compliant statements can expose landlords to disputes and potential forfeiture of recovery rights. This template follows SB 1103 disclosure requirements including category-level itemization and clear calculation methodology.",
  },
  {
    question: "When should reconciliation statements be sent to tenants?",
    answer:
      "Most commercial leases require reconciliation statements within 90-120 days after the calendar year ends (by March 31 or April 30). SB 1103 in California imposes statutory deadlines. Missing these deadlines can result in forfeiture of the right to collect under-recoveries, so property controllers should begin reconciliation work in January and target delivery by mid-March.",
  },
  {
    question: "How do I handle disputed reconciliation items?",
    answer:
      "When a tenant disputes a line item, first verify the expense against your general ledger and supporting invoices. Provide the tenant with the documentation they request (required under many leases and SB 1103). If the dispute is valid, issue a corrected statement. If the landlord's position is correct, provide a written explanation with backup. A well-formatted, itemized statement with clear methodology reduces disputes significantly.",
  },
  {
    question: "Can I use this template for NNN and modified gross leases?",
    answer:
      "Yes. The template supports both NNN (triple net) and modified gross lease structures. For NNN leases, include all three nets (property taxes, insurance, CAM). For modified gross leases, include only the expense categories that are passed through per the lease terms. The customizable category structure lets you match any lease configuration.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(RECON_FAQS);

const BENEFITS = [
  "Pre-formatted reconciliation statement ready for tenant delivery",
  "California SB 1103 disclosure support fields",
  "Customizable expense categories to match any lease structure",
  "Professional presentation format that reduces tenant disputes",
];

export function ReconciliationStatementGenerator() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push("/tools/reconciliation-statement-generator/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free Tenant CAM Statement Outline | CapVeri"
      description="Download a professional CAM reconciliation statement template. Includes California SB 1103 disclosure support fields, customizable expense categories, and audit-ready formatting."
      canonical={buildSiteUrl("/tools/reconciliation-statement-generator")}
      toolName="Tenant CAM Statement Outline"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free Tenant CAM Statement Outline
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Professional reconciliation statement with California SB 1103
              disclosure support. Download free.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  A clear, well-formatted reconciliation statement is your first
                  line of defense against tenant disputes.
                </strong>{" "}
                This template follows SB 1103 disclosure requirements and
                industry best practices for itemized operating expense
                statements. Customize it to your property&apos;s expense
                categories and generate professional statements that tenants and
                their auditors can follow without confusion.
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
                    Built for property accountants
                  </strong>{" "}
                  who need audit-ready reconciliation packages that meet
                  statutory disclosure requirements and reduce tenant pushback.
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
                to generate reconciliation statements automatically from your
                data.
              </p>
            </div>

            {/* Right: lead capture form */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-1">
                Get the free template
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="reconciliation-statement-generator"
                ctaLabel="Download Free Template"
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
              {RECON_FAQS.map((faq) => (
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
