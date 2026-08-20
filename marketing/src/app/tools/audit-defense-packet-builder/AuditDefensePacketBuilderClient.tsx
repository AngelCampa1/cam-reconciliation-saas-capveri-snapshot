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
    name: "CAM Audit Defense Packet Builder",
    description:
      "A structured template for assembling your CAM audit defense packet. Includes the document index, checklist for each required item, and how-to notes for organizing your GL, invoices, and calculation workbooks.",
    operatingSystem: "Windows, macOS (Adobe Acrobat, any PDF viewer)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/audit-defense-packet-builder"),
    datePublished: "2026-04-01",
  },
];

const TOOL_FAQS = [
  {
    question: "What documents are required in a CAM audit defense packet?",
    answer:
      "A complete CAM audit defense packet typically includes: (1) the executed lease and all amendments relevant to CAM provisions, (2) the annual CAM reconciliation statement for the audited year, (3) the general ledger detail for all expense accounts in the CAM pool, (4) an indexed invoice file for any expenses over a threshold (typically $5,000 to $10,000), (5) the management fee calculation worksheet, (6) the pro-rata share calculation with supporting denominator evidence (typically a rent roll or certificate of occupancy), (7) the gross-up calculation worksheet, and (8) the cap bank reconciliation if a cumulative cap is in the lease. The template provides a checklist and document index for all eight components.",
  },
  {
    question: "How should I organize the audit defense packet?",
    answer:
      "Organize the packet with a numbered document index at the front, followed by tabbed sections that mirror the reconciliation statement order. Start with the legal foundation (lease and amendments), then the reconciliation statement itself, then the supporting schedules in the same order they appear in the statement: expense pool, management fee, gross-up, pro-rata, and cap bank. Within each section, organize supporting documents chronologically. An auditor who can navigate your packet without assistance is an auditor who finishes faster and finds fewer issues.",
  },
  {
    question: "What do auditors look for first?",
    answer:
      "Most tenant auditors begin with three items: (1) the expense pool (looking for CapEx items, excluded expenses, and unusually large or vendor-specific charges), (2) the management fee calculation (verifying the base and percentage against the lease), and (3) the gross-up calculation (confirming the occupancy threshold and percentage match the lease and were applied correctly). If your packet makes these three items immediately verifiable, the audit moves faster with less back-and-forth. The builder template organizes these items to match auditor review order.",
  },
  {
    question: "How long does it take to build an audit defense packet?",
    answer:
      "For a well-organized property accounting team with current files, a complete audit defense packet typically takes 4 to 8 hours for a single property and audit year. Properties where GL exports need to be re-run, invoices need to be located, or calculation workbooks need to be rebuilt can take longer. The best time to build the packet is at the close of each reconciliation cycle, before files are archived and while the context is fresh. The template includes a year-end assembly checklist you can complete as part of reconciliation close.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(TOOL_FAQS);

const BENEFITS = [
  "Complete document checklist for your audit defense packet",
  "Includes GL, invoice index, management fee, pro-rata, gross-up, and cap bank templates",
  "Organization guide with recommended folder structure",
  "Pre-built document request response checklist",
];

export function AuditDefensePacketBuilderClient() {
  const router = useRouter();
  const handleSuccess = () => {
    router.push("/tools/audit-defense-packet-builder/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free CAM Audit Defense Packet Builder (PDF) | CapVeri"
      description="A structured template for assembling your CAM audit defense packet. Includes the document index, checklist for each required item, and how-to notes for organizing your GL, invoices, and calculation workbooks."
      canonical={buildSiteUrl("/tools/audit-defense-packet-builder")}
      toolName="CAM Audit Defense Packet Builder"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free CAM Audit Defense Packet Builder
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              A structured template for assembling a complete CAM audit defense
              packet. Includes a document index, section-by-section checklist,
              and organization guide.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  Tenant CAM audits are won or lost before the auditor arrives.
                </strong>{" "}
                A well-organized defense packet makes GL detail, invoice backup,
                and calculation workbooks easy to find. That signals your
                reconciliation is solid and keeps the audit moving. This
                template gives you the document structure that property
                controllers use to close audits quickly.
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
                    Built for property controllers and asset managers
                  </strong>{" "}
                  preparing for or responding to tenant CAM audit requests.
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
                Get the free template
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send the download link
                instantly.
              </p>
              <LeadCaptureForm
                assetSlug="audit-defense-packet-builder"
                ctaLabel="Download Free Audit Defense Template"
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
