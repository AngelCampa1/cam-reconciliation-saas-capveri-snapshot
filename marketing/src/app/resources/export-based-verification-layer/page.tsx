import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronRight,
  Shield,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title:
    "Why an Export-Based Verification Layer Beats a New Integration Project",
  description:
    "Before committing to a 6-12 month ERP integration, consider an export-based CAM verification layer. It catches the same errors, costs a fraction of the price, and deploys in weeks.",
  alternates: {
    canonical: `${SITE_URL}/resources/export-based-verification-layer`,
  },
  openGraph: {
    title:
      "Why an Export-Based Verification Layer Beats a New Integration Project",
    description:
      "Before committing to a 6-12 month ERP integration, consider an export-based CAM verification layer. It catches the same errors, costs a fraction of the price, and deploys in weeks.",
    url: `${SITE_URL}/resources/export-based-verification-layer`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is an export-based CAM verification layer?",
    answer:
      "An export-based verification layer reads your ERP's standard GL and lease export files - CSV or Excel - cross-checks them against lease abstract rules, and surfaces calculation errors before statements go out. It requires no API integration, no custom development, and no ERP vendor involvement. The ERP remains the system of record; the verification layer runs alongside it.",
  },
  {
    question: "Why do ERP integration projects fail for CAM verification?",
    answer:
      "ERP integration projects for CAM verification typically take 6–12 months, require buy-in from your ERP vendor, and involve ongoing change management as the ERP is upgraded. They often run over budget because data model mismatches between the ERP and the verification tool require custom field mapping that wasn't scoped in the original estimate. For CAM verification specifically, standard export files contain all the data needed - making a live integration an expensive way to solve a problem that exports already solve.",
  },
  {
    question: "Does an export-based approach work with Yardi and MRI?",
    answer:
      "Yes. Both Yardi Voyager and MRI Commercial Management produce standard GL export formats (CSV and Excel) that contain the data needed for CAM verification: account codes, amounts, dates, property codes, and vendor identifiers. CapVeri works from standard exports from supported systems - a full list of supported export formats is available in the product documentation.",
  },
  {
    question:
      "When should I use an export-based verification layer vs. a full ERP integration?",
    answer:
      "Use an export-based verification layer when CAM verification accuracy is the bottleneck - when you need to catch billing errors before statements go out, not replace your ERP's data entry workflow. A full integration project makes sense when you need real-time data synchronization across systems, when you're building a custom reporting layer that requires live data, or when you're replacing your ERP entirely. For CAM verification specifically, reconciliation happens annually - real-time sync adds cost without adding accuracy.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Export-Based Verification Layer",
    url: `${SITE_URL}/resources/export-based-verification-layer`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline:
    "Why an Export-Based Verification Layer Beats a New Integration Project",
  description:
    "Before committing to a 6-12 month ERP integration, consider an export-based CAM verification layer. It catches the same errors, costs a fraction of the price, and deploys in weeks.",
  url: `${SITE_URL}/resources/export-based-verification-layer`,
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
  wordCount: 1200,
});

const advantages = [
  {
    title: "No ERP vendor buy-in required",
    detail:
      "A live ERP integration requires your ERP vendor to provide API credentials, document the data model, and support the integration through upgrades. Standard exports require none of that - every property management ERP already has export functionality built in. You can start running verifications the day you export your first GL file.",
  },
  {
    title: "Deploys in days, not months",
    detail:
      "ERP integration projects for CAM verification typically run 6–12 months from contract to go-live, with a significant portion of that time spent on field mapping, data validation, and change management. An export-based approach typically reaches production within days: upload a sample export, map the column headers, configure your lease abstract rules, and run the first verification.",
  },
  {
    title: "Works across multiple ERP systems in a mixed portfolio",
    detail:
      "Portfolios acquired through M&A frequently have multiple ERPs running in parallel - one property group on Yardi, another on MRI, a third still on AppFolio. A live integration requires a separate integration project for each ERP. An export-based approach ingests whatever format each system produces. Mixed-ERP portfolios can be verified from a single interface without standardizing on one ERP first.",
  },
  {
    title: "Non-destructive - ERP stays as the system of record",
    detail:
      "The verification layer reads your ERP's output; it does not write back to it. Your ERP workflows, approval processes, and audit trails remain intact. When the verification layer flags a discrepancy, the correction happens in the ERP (via a journal entry or configuration update), and the corrected export is re-verified. There is no risk of the verification tool corrupting ERP data.",
  },
];

const integrationFailureReasons = [
  {
    title: "Long timelines and ERP versioning",
    detail:
      "Yardi Voyager and MRI Commercial Management release major version updates annually and patch releases quarterly. An integration that was built and tested against one version may break when the ERP upgrades - requiring re-testing, re-scoping, and often additional change order fees. Teams that have been through a Yardi upgrade cycle report that API-dependent integrations require re-validation on every major release.",
  },
  {
    title: "Data model mismatches and custom field complexity",
    detail:
      "Every ERP implementation is customized. Account codes, property identifiers, lease term fields, and GL period definitions vary by implementation. An integration scoped for a standard Yardi data model will hit custom fields, renamed tables, and implementation-specific configurations that weren't documented in the original scope. The result is a change order process that extends the timeline and inflates the budget.",
  },
  {
    title: "Expensive change orders when lease terms change",
    detail:
      "When a lease amendment introduces a new CAM calculation provision - a new cap structure, a redefined denominator, an added exclusion category - the integration's mapping logic needs to be updated. If that update requires a change order with the integration vendor, you're paying implementation fees to accommodate a routine lease event. Over a 5-year portfolio, lease amendments generate dozens of these change orders.",
  },
];

const errorPatterns = [
  {
    title: "Exporting the wrong GL date range",
    detail:
      "The most common export error: the operator exports the ERP's default fiscal year rather than the lease year. For properties with fiscal-year leases, the default export may include the wrong 12-month window. Always specify the export date range explicitly and verify the first and last transaction dates in the export before running verification.",
  },
  {
    title: "Export format changing after an ERP upgrade",
    detail:
      "ERP upgrades occasionally change the column order, column names, or data format of standard export files. A verification layer configured to read column 14 as the account code will break silently if a Yardi upgrade moves that data to column 16 or renames the header. Build format validation into your export intake process - check column headers and a sample of values before running each verification cycle.",
  },
  {
    title: "Missing columns in the export",
    detail:
      "Some ERP export configurations omit columns that are needed for verification - most commonly the property code, the sub-account identifier, or the vendor name. If the export template was created before a CAM verification workflow was in place, it may have been scoped for a different reporting purpose. Verify that your export template includes all required fields before running reconciliation season verifications.",
  },
];

export default function ExportBasedVerificationLayerPage() {
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
            Export-Based Verification Layer
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Why an Export-Based Verification Layer Beats a New Integration
            Project
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Six to twelve months. That&apos;s how long ERP integration projects
            take. An export-based verification layer deploys in days and catches
            the same errors.
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
            An export-based verification layer reads your ERP&apos;s standard GL
            and lease export, cross-checks it against lease terms, and surfaces
            calculation errors - without requiring an API integration, custom
            development, or a multi-month implementation project. For CAM
            verification, exports contain all the data needed. A live
            integration adds cost and complexity without adding accuracy.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Why Integration Projects Fail for CAM Verification
          </h2>
          <p className="mb-6 text-muted-foreground">
            When a CAM reconciliation problem becomes visible - a tenant audit
            that found $85,000 in overbillings, a recurring error that costs two
            analysts a week every February - the natural response is to solve it
            at the data layer: build a real-time integration between the ERP and
            a verification tool so errors are caught before they make it into
            statements.
          </p>
          <p className="mb-6 text-muted-foreground">
            The instinct is correct. The implementation path often isn&apos;t.
          </p>
          <div className="space-y-4">
            {integrationFailureReasons.map((reason) => (
              <div key={reason.title} className="rounded-lg border p-5">
                <h3 className="mb-2 font-semibold text-foreground">
                  {reason.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {reason.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            What an Export-Based Approach Does Instead
          </h2>
          <p className="mb-6 text-muted-foreground">
            An export-based verification layer skips the integration entirely.
            It ingests CSV and Excel exports from your existing ERP - the same
            files your team already exports for internal reporting - runs
            calculation verification against lease abstract rules, and flags
            discrepancies before statements go out.
          </p>

          <div className="mb-6 rounded-lg border bg-muted/40 p-5">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-foreground">
                  The verification loop
                </p>
                <ol className="mt-2 space-y-1 text-sm text-muted-foreground list-decimal list-inside">
                  <li>
                    Export GL data from your ERP in standard format (CSV/Excel)
                  </li>
                  <li>
                    Verification layer classifies expenses against lease
                    exclusion lists
                  </li>
                  <li>
                    Calculation rules checked: gross-up threshold, variable vs.
                    fixed expense split
                  </li>
                  <li>
                    Pro-rata denominators cross-referenced against lease
                    abstracts
                  </li>
                  <li>
                    CAM cap bank balances reconciled against prior-year billing
                  </li>
                  <li>Discrepancy report generated for human review</li>
                  <li>
                    Corrected reconciliation finalized; statements delivered
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Four Key Advantages Over an Integration Project
          </h2>
          <div className="space-y-6">
            {advantages.map((advantage, index) => (
              <div key={advantage.title} className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {index + 1}
                </div>
                <div className="flex-1 pt-0.5">
                  <h3 className="mb-2 font-semibold text-foreground">
                    {advantage.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {advantage.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            When to Use This vs. an Integration
          </h2>
          <p className="mb-4 text-muted-foreground">
            An export-based verification layer is the right choice when CAM
            verification accuracy is the bottleneck - when your core problem is
            catching billing errors before statements go out, not replacing your
            ERP&apos;s data entry workflow or building a real-time reporting
            dashboard. CAM reconciliation happens annually. Real-time sync adds
            cost without adding meaningful accuracy for an annual process.
          </p>
          <p className="text-muted-foreground">
            A full ERP integration project makes sense when: you are replacing
            your ERP and need to migrate data, you need real-time occupancy data
            feeding into a dynamic reporting layer, or you are building a
            customer-facing portal that requires live data synchronization. For
            everything else - and specifically for CAM verification - the
            export-based approach delivers faster, cheaper, and with less
            operational risk.
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
                q: "What is an export-based CAM verification layer?",
                a: "An export-based verification layer reads your ERP's standard GL and lease export files, cross-checks them against lease abstract rules, and surfaces calculation errors before statements go out. It requires no API integration and no ERP vendor involvement. The ERP remains the system of record; the verification layer runs alongside it on export files.",
              },
              {
                q: "Why do ERP integration projects fail for CAM verification?",
                a: "ERP integration projects for CAM verification typically take 6–12 months, require ERP vendor buy-in, and involve ongoing change management through ERP upgrades. Data model mismatches between the ERP and the verification tool require custom field mapping that wasn't scoped in the original estimate. For CAM verification, standard export files already contain all the needed data. A live integration is expensive for a problem exports already solve.",
              },
              {
                q: "Does an export-based approach work with Yardi and MRI?",
                a: "Yes. Both Yardi Voyager and MRI Commercial Management produce standard GL export formats (CSV and Excel) that contain the data needed for CAM verification: account codes, amounts, dates, property codes, and vendor identifiers. CapVeri works from standard exports from supported systems.",
              },
              {
                q: "When should I use an export-based verification layer vs. a full ERP integration?",
                a: "Use an export-based verification layer when CAM verification accuracy is the bottleneck - when you need to catch billing errors before statements go out. A full integration project makes sense when you need real-time data synchronization or are replacing your ERP entirely. For CAM verification specifically, reconciliation happens annually - real-time sync adds cost without adding accuracy.",
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
                href: "/resources/why-erps-still-leak-cam-revenue",
                title: "Why ERPs Still Leak CAM Revenue",
                desc: "The five structural gaps in ERP architecture that let CAM billing errors through.",
              },
              {
                href: "/resources/gl-export-qa-cam",
                title: "GL Export QA Checklist",
                desc: "12 checks to run on your GL export before feeding it into any verification process.",
              },
              {
                href: "/resources/software/yardi-voyager/cam-setup",
                title: "Yardi Voyager CAM Setup Guide",
                desc: "How to configure gross-up, pro-rata, and CAM cap rules in Yardi Voyager.",
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
            Deploy a Verification Layer in Days, Not Months
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri reads your GL export, cross-checks it against lease terms,
            and surfaces discrepancies - no ERP integration required.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "export_verification_layer_cta",
              })}
            >
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
