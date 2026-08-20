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
    applicationSubCategory: "AuditTool",
    name: "Pre-Send Audit Exposure Scorecard",
    description:
      "Score each tenant's audit risk. Find high-risk billing patterns and flag common error patterns before tenant auditors do.",
    operatingSystem: "Windows, macOS (Microsoft Excel 2016+, Google Sheets)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/audit-risk-scorecard"),
    datePublished: "2026-03-18",
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Score Tenant Audit Risk",
    description:
      "Download and use the free Pre-Send Audit Exposure Scorecard to find which tenants are most likely to request an operating expense audit and where your billing risks are.",
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
        name: "Download the scorecard",
        text: "Open the Excel file in Microsoft Excel 2016+ or Google Sheets.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Input tenant and lease data",
        text: "Enter tenant names, lease types, square footage, CAM billing amounts, audit clause details, and recent billing changes for each tenant.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Review risk scores and priorities",
        text: "See per-tenant risk scores, high-risk billing pattern flags, and a prioritized self-audit review list.",
      },
    ],
  },
];

const AUDIT_RISK_FAQS = [
  {
    question: "What factors increase a tenant's audit risk?",
    answer:
      "The top risk factors are large tenants with high CAM bills (they gain the most from an audit), leases with short audit windows, year-over-year billing increases above 5 to 10%, complex pro-rata calculations, and tenants with experienced real estate counsel. National tenants with lease admin teams audit more often than local tenants.",
  },
  {
    question: "How can landlords defend against tenant audits?",
    answer:
      "Keep a clean reconciliation process. Document every expense allocation, make sure gross-up calculations match lease language, check pro-rata shares against current measurements, and keep a clear audit trail from GL entry to tenant invoice. Reviewing your top 10 tenants each year catches most issues before outside auditors do.",
  },
  {
    question: "What are the most common errors tenant auditors find?",
    answer:
      "The five most common findings are: (1) non-recoverable expenses in the CAM pool, (2) gross-up applied wrong or skipped, (3) pro-rata shares based on old square footage, (4) capital costs not properly amortized, and (5) management fees above lease caps. These five areas make up the bulk of tenant audit corrections.",
  },
  {
    question: "Which lease terms create the highest audit exposure?",
    answer:
      "Leases with broad audit rights (covering multiple years at once), short notice windows, tenant-favorable definitions of operating expenses, and provisions that give audit costs to the tenant when errors top a threshold (typically 3 to 5%) carry the most exposure. Full NNN leases with detailed exclusion lists also cause more disputes than simple gross-up structures.",
  },
  {
    question: "How often do commercial tenants use their audit rights?",
    answer:
      "Audit use varies a lot by tenant type. Large national tenants with lease-admin teams audit on a regular cycle. They have the staff and the budget to make it worth their time. Smaller and local tenants audit far less often. Use tends to rise when the economy is tight. There is no single industry rate. Your own tenant base is the clearest signal. Look at who is large and who has used their audit clause before.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(AUDIT_RISK_FAQS);

const BENEFITS = [
  "Scores each tenant based on lease terms, billing patterns, and audit history",
  "Finds high-risk billing patterns that attract tenant auditors",
  "Ranks tenants by risk so you fix the biggest problems first",
  "Flags common error patterns across your portfolio before auditors do",
];

export function AuditRiskScorecardClient() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push("/tools/audit-risk-scorecard/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free Pre-Send Audit Exposure Scorecard | CapVeri"
      description="Score each tenant's audit risk. Find high-risk billing patterns, prioritize self-audit reviews, and flag common error patterns."
      canonical={buildSiteUrl("/tools/audit-risk-scorecard")}
      toolName="Pre-Send Audit Exposure Scorecard"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free Pre-Send Audit Exposure Scorecard
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Find which tenants are most likely to request an operating expense
              audit. Download free.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  Tenant audits can cost landlords 2 to 5% of billed operating
                  expenses in credits. The tenants most likely to audit are the
                  ones with the largest CAM bills.
                </strong>{" "}
                This scorecard helps you find your highest-risk tenants so you
                can fix errors before an outside auditor does.
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
                    Built for property controllers and asset managers
                  </strong>{" "}
                  who want to catch billing issues before a tenant auditor does.
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
                to automate audit risk scoring across your entire portfolio.
              </p>
            </div>

            {/* Right: lead capture form */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-1">
                Get the free scorecard
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="audit-risk-scorecard"
                ctaLabel="Download Free Scorecard"
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
              {AUDIT_RISK_FAQS.map((faq) => (
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
