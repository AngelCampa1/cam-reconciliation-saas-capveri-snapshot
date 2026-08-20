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
    name: "CAM Pre-Send Packet Checklist",
    description:
      "A 20-item pre-send quality check for CAM reconciliation statements. Catches the errors most likely to trigger tenant disputes before statements leave your office.",
    operatingSystem: "Windows, macOS (Adobe Acrobat, any PDF viewer)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/cam-pre-send-packet-checklist-download"),
    datePublished: "2026-04-01",
  },
];

const TOOL_FAQS = [
  {
    question: "What should a CAM pre-send packet include?",
    answer:
      "A complete CAM pre-send packet includes the reconciliation statement itself, the supporting expense detail (GL summary or backup), the gross-up calculation worksheet, the pro-rata calculation with lease denominator evidence, the cap bank summary (if applicable), and any invoices for high-dollar items flagged for dispute risk. Many landlords also include a summary cover letter that references the relevant lease sections. The checklist walks through each of these components with specific verification steps.",
  },
  {
    question: "How long does a pre-send review take?",
    answer:
      "A thorough pre-send review typically takes 30 to 90 minutes per property depending on complexity. Simple NNN leases with a single tenant can take less time, while multi-tenant gross leases with complex pools, exclusions, and cap provisions can take significantly longer. The checklist is structured so review work can be split across team members. A senior reviewer handles calculations while a junior handles document assembly.",
  },
  {
    question: "What errors does the checklist catch?",
    answer:
      "The most common errors caught at the pre-send stage include: misapplied gross-up percentage (using the wrong occupancy threshold), stale denominators that do not reflect the actual lease year square footage, CapEx items misclassified as operating expenses, management fees calculated on the wrong base, cap bank balances that were not carried forward correctly, and statement date ranges that do not match the lease year definition. Any of these errors can trigger tenant disputes or audit requests.",
  },
  {
    question: "When should I do the pre-send review?",
    answer:
      "The pre-send review should happen after the reconciliation calculation is complete but before statements are finalized and mailed. Aim for 5 to 10 business days before the send date. This buffer allows time to resolve any issues found during review without delaying the send. Many property accounting teams build the pre-send checklist into their formal reconciliation sign-off workflow, requiring sign-off from both the preparer and reviewer before statements are approved.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(TOOL_FAQS);

const BENEFITS = [
  "20-item checklist covering expense pool, calculations, statement format, and documentation",
  "Organized by review phase so you can split the work across your team",
  "Specific items for gross-up verification and cap bank accuracy",
  "Printable PDF for paper-based review workflows",
];

export function CamPreSendPacketChecklistClient() {
  const router = useRouter();
  const handleSuccess = () => {
    router.push("/tools/cam-pre-send-packet-checklist-download/thank-you");
  };

  return (
    <ToolPageLayout
      title="Free CAM Pre-Send Packet Checklist (PDF) | CapVeri"
      description="A 20-item pre-send quality check for CAM reconciliation statements. Catches the errors most likely to trigger tenant disputes before statements leave your office."
      canonical={buildSiteUrl("/tools/cam-pre-send-packet-checklist-download")}
      toolName="CAM Pre-Send Packet Checklist"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Hero */}
      <section className="bg-background py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Free CAM Pre-Send Packet Checklist
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              A 20-item quality check designed to catch the errors that trigger
              tenant disputes before your reconciliation statements go out.
            </p>
            <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
              <p>
                <strong>
                  Most tenant CAM disputes are triggered by errors that a
                  structured review would have caught.
                </strong>{" "}
                Misapplied gross-up percentages, stale denominators, and CapEx
                miscoding are all detectable before statements leave your
                office. This checklist gives your team a repeatable process for
                pre-send review that actually catches the issues auditors look
                for first.
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
                    Built for property accounting teams
                  </strong>{" "}
                  sending annual CAM reconciliation statements.
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
                assetSlug="cam-pre-send-packet-checklist"
                ctaLabel="Download Free Pre-Send Checklist"
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
