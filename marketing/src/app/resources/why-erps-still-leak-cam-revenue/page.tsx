import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronRight,
  Database,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Why ERPs Still Leak CAM Revenue (And How to Catch It)",
  description:
    "Yardi, MRI, and other property management ERPs are designed for transaction recording, not CAM verification. Here's why they miss errors and what a verification layer catches.",
  alternates: {
    canonical: `${SITE_URL}/resources/why-erps-still-leak-cam-revenue`,
  },
  openGraph: {
    title: "Why ERPs Still Leak CAM Revenue (And How to Catch It)",
    description:
      "Yardi, MRI, and other property management ERPs are designed for transaction recording, not CAM verification. Here's why they miss errors and what a verification layer catches.",
    url: `${SITE_URL}/resources/why-erps-still-leak-cam-revenue`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "Why do property management ERPs miss CAM billing errors?",
    answer:
      "ERPs are transaction systems. They record what they're told. They do not verify that account codes match lease terms, that gross-up is calculated correctly, or that capital projects haven't slipped into the operating expense pool. CAM verification requires cross-referencing ERP output against lease abstracts and calculation rules, which no ERP does natively.",
  },
  {
    question: "What is the most common CAM revenue leak in Yardi or MRI?",
    answer:
      "Pro-rata share misconfiguration is the most common. When a lease is amended and the tenant's square footage or the building's denominator changes, the ERP configuration often isn't updated to match. The system continues calculating CAM on the old denominator, underbilling or overbilling the tenant for every subsequent month.",
  },
  {
    question: "Can CAM caps be tracked automatically in an ERP?",
    answer:
      "Most property management ERPs require manual configuration of CAM caps per lease. Cumulative caps (which bank unused cap capacity across years) are especially error-prone because the carry-forward calculation requires a separate workbook or a custom ERP configuration that many teams do not maintain. When the configuration is wrong, the system will apply no cap at all or apply the cap to the wrong base amount.",
  },
  {
    question:
      "What does a CAM verification layer add beyond what an ERP provides?",
    answer:
      "A verification layer cross-checks ERP output against lease abstract rules rather than just recording transactions. It flags when gross-up configuration doesn't match lease terms, when pro-rata denominators differ across tenants in the same building, when a single-tenant's cap bank balance is inconsistent with historical billing, and when the expense pool contains items the lease excludes. It runs against standard ERP exports with no API integration required.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Why ERPs Still Leak CAM Revenue",
    url: `${SITE_URL}/resources/why-erps-still-leak-cam-revenue`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline: "Why ERPs Still Leak CAM Revenue (And How to Catch It)",
  description:
    "Yardi, MRI, and other property management ERPs are designed for transaction recording, not CAM verification. Here's why they miss errors and what a verification layer catches.",
  url: `${SITE_URL}/resources/why-erps-still-leak-cam-revenue`,
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
  wordCount: 1400,
});

const erpGaps = [
  {
    title: "Account code flexibility without verification",
    content: `ERPs allow AP clerks to code an invoice to any account in the chart of accounts. The system has no knowledge of whether an HVAC replacement is a capital asset under the lease's capital exclusion or a recurring maintenance expense. A $38,000 chiller coil replacement coded to account 6215 (HVAC Maintenance) flows directly into the CAM pool. The ERP has done exactly what it was designed to do (record the transaction) but has no way to flag that the lease excludes capital improvements above $15,000.

This isn't a user error. It's a structural gap: the ERP's data model separates accounting from lease management. Lease terms live in one module; invoice coding lives in another. Unless someone manually cross-references every coding decision against the lease, mismatches are invisible until a tenant auditor finds them.`,
  },
  {
    title: "Gross-up requires manual configuration per lease",
    content: `Gross-up (the adjustment that normalizes variable expenses to a defined occupancy threshold) is typically set up as a per-lease configuration in Yardi and MRI. When a lease is executed, someone must enter the gross-up threshold (90% or 95% is most common), the variable expense account codes to be grossed up, and the calculation method.

Problems accumulate over time. When a lease is amended and the gross-up threshold changes from 90% to 95%, the ERP configuration is often not updated. When variable expense account codes are reorganized during a chart of accounts restructuring, the gross-up configuration may point to old codes that no longer exist or to new codes that shouldn't be included. The system continues calculating, just on the wrong inputs.

The result is systematic underbilling. If a building runs at 78% occupancy and the gross-up threshold should be 95% but the ERP is configured to 90%, the difference in grossed-up expenses on a $500,000 variable expense pool is approximately $30,000 across all tenants, every year.`,
  },
  {
    title: "Pro-rata denominators are entered, not verified",
    content: `The building denominator used in pro-rata calculations is entered by a data entry operator when a lease is set up. The ERP calculates pro-rata correctly given whatever denominator is in the system, but it cannot verify that the denominator matches the current lease abstract.

After a lease amendment that adds or removes square footage, the denominator needs to be updated. After an anchor tenant vacates and their exclusion from the denominator is negotiated out of subsequent leases, the denominators for those leases need to be updated. After a building expansion adds rentable area, all affected leases need new denominators.

These updates require manual intervention. When they don't happen, tenants in the same building run on different denominators that no longer reflect the same building. One tenant's pro-rata might be calculated on 48,500 SF; another's on 50,200 SF. Neither is necessarily wrong by the terms of their specific lease, but the inconsistency raises audit flags and signals that at least one denominator has drifted from its lease definition.`,
  },
  {
    title: "No cross-tenant consistency checks",
    content: `ERPs calculate each tenant's CAM obligation independently. This is correct for billing purposes, since each lease has its own terms. But it creates a blind spot: there is no system that asks whether two tenants in the same building are being calculated on consistent assumptions.

Tenant A's lease was abstracted in 2019 with a 50,000 SF denominator. Tenant B's lease was abstracted in 2023 after a building remeasurement showed 51,200 SF of rentable area. The ERP records both values without flagging the discrepancy. From a billing standpoint, both tenants are billed correctly per their respective lease terms. But in a portfolio audit, an attorney will ask the property manager to explain why Tenant A is being charged CAM on a 50,000 SF building while Tenant B is charged on a 51,200 SF building.

Cross-tenant consistency is a verification problem, not a transaction recording problem. ERPs are not designed to perform it.`,
  },
  {
    title: "Cumulative CAP banks require manual tracking",
    content: `A cumulative CAM cap allows unused cap capacity to carry forward. If a lease has a 5% annual cap and expenses only increased 2% in year one, the landlord can theoretically recover up to 8% in year two (the 3% unused capacity plus the 5% current cap).

Most ERPs do not automatically track cumulative cap banks. The bank balance is typically maintained in a separate spreadsheet or, in well-implemented setups, in a custom ERP field that someone must update each year. When the spreadsheet is lost, when a property manager transitions off the account, or when the ERP field isn't updated, the cap bank balance is wrong. The tenant is billed using an incorrect base, and the error compounds annually.

In an audit, a tenant can demand the full cap bank history from lease commencement. If the records show that the cap was applied to the wrong base amount in years 2 through 5, the cumulative adjustment can be substantial. The landlord bears the burden of proof.`,
  },
];

const errorPatterns = [
  {
    title: "Gross-up configuration not updated after lease amendment",
    detail:
      "A tenant's gross-up threshold was changed from 90% to 95% in a 2023 lease amendment. The property manager updated the lease abstract but not the ERP gross-up configuration. For three subsequent reconciliation years, gross-up was calculated at 90% instead of 95%. On a $180,000 variable expense pool with 80% building occupancy, the underbilling per year was approximately $11,250. Across three years and four tenants with similar amendments, the portfolio leakage exceeded $130,000.",
  },
  {
    title: "Pro-rata denominator frozen after anchor tenant vacated",
    detail:
      "An anchor tenant vacating a 120,000 SF retail center triggered a lease provision that removed the anchor's SF from the denominator for three in-line tenants. The ERP was not updated to reflect the denominator reduction. Remaining in-line tenants continued to have their CAM calculated on the 120,000 SF denominator rather than the post-anchor 98,000 SF denominator. Each tenant was underbilled by approximately 18.5% of their actual share, representing a recoverable shortfall that the landlord could not pursue because the billing period had closed.",
  },
  {
    title:
      "Corporate ERP restructuring orphaned gross-up account configurations",
    detail:
      "A portfolio owner migrated from MRI to Yardi across 28 properties over an 18-month period. During the migration, gross-up account code mappings were converted using the old chart of accounts. A subsequent chart of accounts standardization renamed 14 operating expense codes. The gross-up configuration in Yardi continued referencing the old codes, which now mapped to zero. Gross-up calculations returned zero for all variable expenses, effectively eliminating gross-up from 28 properties' CAM reconciliations for the full year before the error was detected during a tenant audit.",
  },
];

export default function WhyErpsLeakCamRevenuePage() {
  return (
    <>
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={articleSchema} />
      <main className="mx-auto max-w-4xl px-4 py-12 pb-24 sm:px-6 lg:px-8">
        <nav className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <Link href="/resources" className="hover:text-foreground">
            Resources
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-foreground">
            Why ERPs Still Leak CAM Revenue
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Why ERPs Still Leak CAM Revenue (And How to Catch It)
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Yardi, MRI, and RealPage record transactions accurately. They do not
            verify that those transactions are correctly applied to lease terms.
            Here is where the gap shows up.
          </p>
          <p className="text-sm text-muted-foreground">
            By{" "}
            <Link
              href="/about/angel-campa"
              className="text-foreground hover:underline"
            >
              Angel Campa, Founder, CapVeri
            </Link>{" "}
            · Updated April 2026
          </p>
        </header>

        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">Quick Answer</h2>
          <p className="text-muted-foreground">
            Property management ERPs are transaction systems. They record what
            you tell them. They do not verify that GL coding matches lease
            terms, that gross-up is correctly applied, or that capital projects
            haven't slipped into the operating expense pool. A verification
            layer that cross-checks ERP output against lease abstracts and
            calculation rules is the piece that closes the gap.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-2 text-2xl font-semibold">
            ERPs Are Necessary. They Are Not Sufficient.
          </h2>
          <p className="mb-6 text-muted-foreground">
            Yardi Voyager, MRI Commercial Management, RealPage, and their
            competitors are the system of record for commercial real estate
            operations. They handle lease administration, accounts payable,
            billing, and financial reporting at scale. They are well-designed
            for what they do. But their architecture is fundamentally about
            recording and retrieving transactions, not verifying that those
            transactions are correctly applied to the specific terms of each
            lease in a portfolio. CAM verification is a cross-referencing
            problem: ERP output on one side, lease abstracts on the other. ERPs
            solve the first half. No ERP natively solves the second.
          </p>
          <p className="text-muted-foreground">
            The five categories below describe where the gap shows up in
            practice. Each one is a structural limitation of the ERP data model,
            not a user error that better training would fix.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Five Categories of ERP Gaps for CAM
          </h2>
          <div className="space-y-8">
            {erpGaps.map((gap, index) => (
              <div key={gap.title} className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {index + 1}
                </div>
                <div className="flex-1 pt-0.5">
                  <h3 className="mb-3 font-semibold text-foreground">
                    {gap.title}
                  </h3>
                  {gap.content.split("\n\n").map((para, i) => (
                    <p
                      key={i}
                      className="mb-3 text-sm text-muted-foreground leading-relaxed"
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            What a Verification Layer Does Instead
          </h2>
          <p className="mb-4 text-muted-foreground">
            A verification layer reads your ERP&apos;s standard GL and lease
            export, then cross-checks the output against lease abstract rules
            for every tenant in the portfolio. It does not replace the ERP - the
            ERP remains the system of record. It runs alongside the ERP, after
            the GL export, and before statements are delivered.
          </p>
          <div className="rounded-lg border bg-muted/40 p-5">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-foreground">
                  The verification loop
                </p>
                <ol className="mt-2 space-y-1 text-sm text-muted-foreground list-decimal list-inside">
                  <li>
                    Export GL data and lease abstract from your ERP (CSV or
                    Excel)
                  </li>
                  <li>
                    Verification layer classifies expenses against lease
                    exclusion lists
                  </li>
                  <li>
                    Gross-up is recalculated from lease terms and compared to
                    ERP output
                  </li>
                  <li>
                    Pro-rata denominators are cross-checked across tenants in
                    each building
                  </li>
                  <li>
                    CAP bank balances are reconciled against historical billing
                  </li>
                  <li>Discrepancy report is generated for human review</li>
                  <li>
                    Corrected reconciliation is finalized and statements are
                    delivered
                  </li>
                </ol>
              </div>
            </div>
          </div>
          <p className="mt-4 text-muted-foreground">
            CapVeri works from standard exports from supported systems - no ERP
            vendor buy-in or API integration project required. See the{" "}
            <Link
              href="/resources/export-based-verification-layer"
              className="text-primary hover:underline"
            >
              export-based verification layer guide
            </Link>{" "}
            for a detailed breakdown.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            {errorPatterns.map((pattern) => (
              <div
                key={pattern.title}
                className="rounded-lg border border-destructive/20 bg-destructive/5 p-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  <div>
                    <p className="font-medium text-destructive-strong">
                      {pattern.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {pattern.detail}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {[
              {
                q: "Why do property management ERPs miss CAM billing errors?",
                a: "ERPs are transaction systems - they record what they're told. They do not verify that account codes match lease terms, that gross-up is calculated correctly, or that capital projects haven't slipped into the operating expense pool. CAM verification requires cross-referencing ERP output against lease abstracts and calculation rules, which no ERP does natively.",
              },
              {
                q: "What is the most common CAM revenue leak in Yardi or MRI?",
                a: "Pro-rata share misconfiguration is among the most common. When a lease is amended and the tenant's square footage or the building's denominator changes, the ERP configuration often isn't updated to match. The system continues calculating CAM on the old denominator, producing systematic underbilling or overbilling for every subsequent period.",
              },
              {
                q: "Can CAM caps be tracked automatically in an ERP?",
                a: "Most property management ERPs require manual configuration of CAM caps per lease. Cumulative caps - which bank unused cap capacity across years - are especially error-prone because the carry-forward calculation requires either a separate workbook or a custom ERP configuration that many teams do not maintain consistently.",
              },
              {
                q: "What does a CAM verification layer add beyond what an ERP provides?",
                a: "A verification layer cross-checks ERP output against lease abstract rules rather than just recording transactions. It flags gross-up configuration mismatches, pro-rata denominator inconsistencies across tenants, cap bank errors, and excluded expenses in the pool. It runs against standard ERP exports - no API integration required.",
              },
            ].map((item) => (
              <div key={item.q}>
                <h3 className="mb-2 font-semibold text-foreground">{item.q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                href: "/resources/gl-export-qa-cam",
                title: "GL Export QA Checklist",
                desc: "12 pre-reconciliation checks to run on every GL export before calculating CAM.",
              },
              {
                href: "/resources/export-based-verification-layer",
                title: "Export-Based Verification Layer",
                desc: "Why a verification layer beats an ERP integration project for CAM accuracy.",
              },
              {
                href: "/resources/detect-capex-in-gl-export",
                title: "Detecting CapEx in a GL Export",
                desc: "Specific techniques for flagging capital projects miscoded as operating expenses.",
              },
              {
                href: "/cam-reconciliation-software",
                title: "CAM Reconciliation Software",
                desc: "How to evaluate software for commercial CAM reconciliation.",
              },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
              >
                <p className="font-medium group-hover:text-primary">
                  {link.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {link.desc}
                </p>
              </Link>
            ))}
          </div>
          <div className="mt-4">
            <Link
              href="/cam-reconciliation-software"
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <CheckCircle className="h-4 w-4" />
              CAM Reconciliation Software Comparison
            </Link>
          </div>
        </section>

        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Close the ERP Verification Gap
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri runs the cross-checks your ERP can&apos;t - gross-up
            verification, pro-rata consistency, cap bank reconciliation - from
            your standard GL export.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "erp_cam_leakage_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
