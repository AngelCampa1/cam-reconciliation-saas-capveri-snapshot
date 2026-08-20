import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AlertTriangle, FileText } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Lease Abstraction Fields That Matter for CAM Reconciliation",
  description:
    "Not all lease abstract fields are equally important for CAM. This guide identifies the 15 data fields that directly affect CAM calculations and what errors to look for in each.",
  alternates: {
    canonical: `${SITE_URL}/resources/lease-abstraction-fields-for-cam`,
  },
  openGraph: {
    title: "Lease Abstraction Fields That Matter for CAM Reconciliation",
    description:
      "The 15 lease abstract fields that directly affect CAM calculations, and the errors to look for in each one.",
    url: `${SITE_URL}/resources/lease-abstraction-fields-for-cam`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question:
      "What lease abstraction fields most commonly cause CAM calculation errors?",
    answer:
      "The five highest-impact fields for CAM accuracy are: (1) the denominator definition (total RSF vs. occupied area vs. fixed), (2) the gross-up threshold percentage and whether it applies to all variable expenses or a defined subset, (3) the management fee structure and cap amount, (4) the audit rights window in months after statement receipt, and (5) the reconciliation statement deadline in days after the lease year end. Errors in any of these five fields create systematic over- or under-billing for the full lease term.",
  },
  {
    question: "What is the difference between GLA and RSF for the denominator?",
    answer:
      "Gross Leasable Area (GLA) and Rentable Square Footage (RSF) are related but not identical. GLA is the total floor area designed for tenant occupancy in a retail context, measured from inside surfaces of exterior walls and center of demising walls. RSF per BOMA standards includes usable square footage plus the tenant's proportionate share of common areas (load factor). Using GLA instead of RSF as the denominator produces a different - and usually smaller - denominator, which increases each tenant's pro-rata share. The lease specifies which measurement standard applies.",
  },
  {
    question: "How do I find the audit rights window in a commercial lease?",
    answer:
      "The audit rights provision is typically found in the CAM or Operating Expenses section of the lease, often labeled 'Tenant's Audit Rights,' 'Right to Audit,' or 'Examination of Records.' It specifies: (1) how many months after receipt of the reconciliation statement the tenant has to initiate an audit (commonly 12 to 24 months), (2) notice requirements to exercise the audit right, (3) how many prior years can be audited at once, and (4) whether the tenant must use a CPA or qualified auditor. Missing this field in the lease abstract means the landlord may not know when the audit rights window has closed.",
  },
  {
    question:
      "What goes wrong if the CAM cap base year is abstracted incorrectly?",
    answer:
      "The CAM cap base year is the year from which compounding begins for a cumulative cap, or the prior year amount for a non-cumulative cap. If the cap base year is abstracted incorrectly - for example, using the lease commencement year instead of the year specified in the lease, or using an estimated amount instead of the actual billed amount - every subsequent year's cap calculation is wrong. For a 10-year lease with an incorrect cap base, the error compounds annually and can result in significant cumulative over- or under-collection.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Lease Abstraction Fields for CAM",
    url: `${SITE_URL}/resources/lease-abstraction-fields-for-cam`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline: "Lease Abstraction Fields That Matter for CAM Reconciliation",
  description:
    "The 15 lease abstract fields that directly affect CAM calculations and what errors to look for in each.",
  url: `${SITE_URL}/resources/lease-abstraction-fields-for-cam`,
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
  wordCount: 1450,
});

type AbstractionField = {
  field: string;
  whatItIs: string;
  whereToFind: string;
  whatGoesWrong: string;
};

const denominatorFields: AbstractionField[] = [
  {
    field: "Tenant RSF",
    whatItIs:
      "The tenant's rentable square footage as measured and agreed in the lease. This is the numerator of the pro-rata share calculation.",
    whereToFind:
      "Lease preamble or Exhibit A (premises description). Often stated as 'approximately X RSF'. Verify the exact measured figure used for billing, which may differ from the approximate figure.",
    whatGoesWrong:
      "Using the approximate RSF from the lease summary rather than the exact RSF from the measurement exhibit. A 100 RSF discrepancy in a 5,000 RSF space (2%) compounds across the full CAM pool for every year of the lease.",
  },
  {
    field: "Denominator Definition",
    whatItIs:
      "The total RSF figure used as the divisor in the pro-rata share calculation. May be defined as total rentable area, total leasable area, occupied area, or a fixed number stated in the lease.",
    whereToFind:
      "CAM or Operating Expenses section, often in a definition: 'Tenant's Proportionate Share means X RSF / Y RSF, where Y is the total rentable area of the Building.' Look for whether the denominator is fixed or recalculated annually.",
    whatGoesWrong:
      "Abstracting the denominator as GLA (Gross Leasable Area) instead of RSF. GLA is typically smaller because it excludes common area load factor, producing a larger pro-rata share for each tenant than the lease intends.",
  },
  {
    field: "Anchor Exclusion Clause",
    whatItIs:
      "A provision that excludes anchor tenant RSF from the denominator, effectively increasing the pro-rata share of non-anchor tenants. Common in multi-tenant retail.",
    whereToFind:
      "CAM section, often referenced as 'Excluded Tenants' or 'Anchor Tenants' in the denominator definition. Some leases list the anchor tenants by name; others define them by size (e.g., tenants occupying more than 40,000 RSF).",
    whatGoesWrong:
      "Missing the anchor exclusion and including anchor RSF in the denominator. This understates the pro-rata share of non-anchor tenants, resulting in systematic undercollection from smaller tenants that compounds over the lease term.",
  },
];

const expenseFields: AbstractionField[] = [
  {
    field: "Recoverable Expense Inclusions",
    whatItIs:
      "The specific categories of operating expenses the lease permits to be included in the CAM pool and billed to the tenant as additional rent.",
    whereToFind:
      "Definition of 'Operating Expenses,' 'CAM,' or 'Common Area Costs': typically 1–3 paragraphs listing included categories (janitorial, landscaping, insurance, taxes, management fees, etc.).",
    whatGoesWrong:
      "Using a generic industry list of recoverable expenses rather than the lease-specific inclusion list. Leases vary materially in what they include. A lease that excludes property tax from the CAM definition means taxes are not recoverable through the CAM mechanism even in a NNN structure.",
  },
  {
    field: "Non-Recoverable Exclusions",
    whatItIs:
      "The explicit list of expense categories the landlord cannot bill to the tenant as CAM: capital expenditures, depreciation, financing costs, leasing commissions, and other carve-outs.",
    whereToFind:
      "Exclusion list immediately following the CAM inclusion definition. In institutional leases, this can be 2–4 pages. In older leases, the exclusion language may be one sentence or absent entirely.",
    whatGoesWrong:
      "Failing to capture the full exclusion list. A partial exclusion list means expenses that should be excluded flow into the CAM pool unchallenged. This is the most common source of systematic overbilling in older portfolios.",
  },
  {
    field: "Capital Exclusion Carve-Out",
    whatItIs:
      "The specific language addressing whether capital expenditures are excluded entirely or whether amortized capital recovery is permitted. If amortized recovery is allowed, the lease specifies the methodology (straight-line, useful life per MACRS, etc.).",
    whereToFind:
      "Within the exclusion list or in a separate capital expenditures subsection. Look for language like 'Capital Improvements shall be excluded except that...' followed by amortization terms.",
    whatGoesWrong:
      "Abstracting only 'capital excluded' without capturing the amortization carve-out. If the lease permits amortized capital recovery and the abstract says simply 'CapEx excluded,' the landlord may fail to recover legitimately amortizable capital costs.",
  },
  {
    field: "Management Fee Structure and Cap",
    whatItIs:
      "Whether the management fee is calculated as a percentage of gross revenues or a percentage of recoverable CAM expenses, and the maximum percentage permitted by the lease.",
    whereToFind:
      "Management fee definition within the Operating Expenses section. Usually stated as 'a management fee not to exceed X% of gross revenues' or 'a management fee equal to Y% of Operating Expenses.'",
    whatGoesWrong:
      "Abstracting only the percentage without the base definition. A 4% management fee means 4% of something. Without the base ('gross revenues,' 'gross operating revenues,' or 'recoverable CAM'), the number is unactionable and will be calculated incorrectly.",
  },
];

const adjustmentFields: AbstractionField[] = [
  {
    field: "Gross-Up Threshold Percentage",
    whatItIs:
      "The minimum occupancy level specified in the lease. If actual occupancy falls below this threshold, variable expenses are adjusted (grossed up) to what they would have been at the threshold occupancy level.",
    whereToFind:
      "Gross-up provision within the CAM section: 'If the Building is less than X% occupied during any period, variable Operating Expenses shall be adjusted to reflect X% occupancy.'",
    whatGoesWrong:
      "Abstracting the threshold percentage but not the occupancy measurement methodology. A 90% threshold calculated on total RSF (including vacant speculative space) produces a different gross-up than 90% of leasable RSF. The measurement basis must be captured with the percentage.",
  },
  {
    field: "Variable vs. Fixed Expense Definition",
    whatItIs:
      "Which expense categories the lease classifies as variable (subject to gross-up) vs. fixed (not subject to gross-up). Standard variable expenses include janitorial, utilities, and landscaping; standard fixed expenses include taxes, insurance, and management fees on gross revenues.",
    whereToFind:
      "Within the gross-up provision or in separate definitions. Some leases explicitly list variable expenses; others define them by exclusion ('all expenses except the following are variable...').",
    whatGoesWrong:
      "Applying gross-up to fixed expenses (taxes, insurance) because the lease's variable/fixed classification was not abstracted. Grossing up fixed expenses overstates the CAM pool and creates a systematic overbilling.",
  },
  {
    field: "CAM Cap Type",
    whatItIs:
      "Whether the CAM cap is cumulative (compounding from a base year) or non-cumulative (each year limited to a percentage above the prior year's actual).",
    whereToFind:
      "CAM cap provision: look for 'cumulative' or 'non-cumulative' language, or language like 'Controllable CAM shall not increase by more than X% over the immediately preceding calendar year' (non-cumulative) vs. 'the cumulative average increase...' (cumulative).",
    whatGoesWrong:
      "Defaulting to non-cumulative when the lease specifies cumulative, or vice versa. These produce different cap amounts, particularly in years where prior-year increases were below the cap rate. A cumulative cap error accumulates over the full lease term.",
  },
  {
    field: "CAM Cap Base Year and Percentage",
    whatItIs:
      "The starting year for the CAM cap calculation and the annual cap rate (e.g., 5% above the base year amount, or 5% above the prior year's actual amount). The base year amount is typically the actual controllable CAM for the stated year.",
    whereToFind:
      "CAM cap provision, immediately following the cap type definition: 'shall not exceed X% above the Controllable Expenses incurred in calendar year Y.'",
    whatGoesWrong:
      "Using the lease commencement year as the base year when the lease specifies a different year, or using estimated expenses for the base year when the lease requires actual expenses. Both errors shift every subsequent year's cap calculation.",
  },
];

const billingFields: AbstractionField[] = [
  {
    field: "Estimate Period and Amount Setting",
    whatItIs:
      "How the landlord sets monthly CAM estimate payments for the upcoming year: whether based on prior year actuals, a budget, or a fixed amount, and the period the estimates cover.",
    whereToFind:
      "CAM payment provisions: 'Tenant shall pay monthly installments equal to Landlord's estimate of Tenant's Proportionate Share of Operating Expenses for such calendar year.'",
    whatGoesWrong:
      "Not capturing whether the lease limits how much estimates can increase from year to year. Some leases restrict estimate increases (separate from the cap on actuals); abstracting only the cap without this provision leads to inadvertent violations.",
  },
  {
    field: "Estimate Letter Timing Requirement",
    whatItIs:
      "The number of days before the new lease year begins by which the landlord must deliver updated monthly CAM estimate amounts for the upcoming year.",
    whereToFind:
      "Within the CAM payment section: 'Landlord shall provide Tenant with a written estimate of Operating Expenses for each calendar year at least X days prior to the commencement of such calendar year.'",
    whatGoesWrong:
      "Missing this field entirely. When estimate letters are sent late, tenants in buildings with significant CAM increases may dispute the true-up amount by arguing the landlord failed to provide timely notice of the updated estimate obligation.",
  },
  {
    field: "Reconciliation Statement Deadline",
    whatItIs:
      "The number of days after the end of the lease year by which the landlord must deliver the CAM reconciliation statement to the tenant. This is the single most time-sensitive field in the lease abstract for CAM purposes.",
    whereToFind:
      "CAM reconciliation section: 'Landlord shall deliver to Tenant an annual statement of actual Operating Expenses within X days following the end of each calendar year.'",
    whatGoesWrong:
      "Abstracting a single portfolio-wide deadline (e.g., '90 days') rather than the per-lease deadline. Individual leases within the same portfolio may have 90, 120, or 180-day deadlines. Missing any individual tenant's deadline creates waiver risk for that tenant's true-up.",
  },
  {
    field: "Audit Rights Window",
    whatItIs:
      "The number of months after receipt of the reconciliation statement during which the tenant may request and conduct an audit of the CAM calculation. Once this window closes, the tenant generally waives the right to challenge that year's reconciliation.",
    whereToFind:
      "Audit rights provision: 'Tenant shall have the right to audit Landlord's books and records... within X months following Tenant's receipt of the annual statement.'",
    whatGoesWrong:
      "Abstracting the audit rights window as days from delivery (landlord perspective) rather than months from receipt (tenant perspective). The difference matters for determining when the window has closed. Also: failing to capture whether the window is 12 months (favorable to landlord) or 24–36 months (favorable to tenant).",
  },
];

const otherFields: AbstractionField[] = [
  {
    field: "Base Year Amount (Expense Stop Structures)",
    whatItIs:
      "In a base year expense stop lease, the actual operating expenses incurred in the designated base year, used as the landlord's floor below which the tenant has no obligation. This is a fixed dollar amount, not an indexed or estimated figure.",
    whereToFind:
      "Operating Expenses or Base Year provision: 'Base Year Operating Expenses shall mean the actual Operating Expenses incurred during calendar year Y.' The base year amount is often attached as an exhibit once the base year closes.",
    whatGoesWrong:
      "Abstracting the base year calendar year but not the actual dollar amount, or using an estimated amount when the actual close amount is available. The base year dollar amount must be confirmed against the actual closed GL for that year, not estimated from a budget.",
  },
];

export default function LeaseAbstractionFieldsForCAMPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />

      <div className="border-b bg-muted">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <nav className="text-sm text-muted-foreground mb-4">
            <Link
              href="/resources"
              className="hover:text-foreground transition-colors duration-200"
            >
              Resources
            </Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">
              Lease Abstraction Fields for CAM
            </span>
          </nav>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Lease Abstraction Fields That Matter for CAM Reconciliation
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-2xl">
            The 15 data fields that directly affect CAM calculations: what each
            one is, where to find it in the lease, and what goes wrong when it
            is abstracted incorrectly.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>
              By{" "}
              <Link
                href="/about/angel-campa"
                className="text-foreground font-medium hover:text-primary transition-colors duration-200"
              >
                Angel Campa
              </Link>
              , Founder, CapVeri
            </span>
            <span aria-hidden="true">·</span>
            <time dateTime="2026-04-26">Updated April 2026</time>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 max-w-3xl">
        {/* Quick answer */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 mb-10">
          <h2 className="text-base font-semibold text-foreground mb-2">
            Quick Answer
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A complete lease abstract for CAM purposes must capture the pro-rata
            denominator definition, gross-up threshold, CAM exclusions,
            management fee cap, audit rights window, and statement deadline -
            not just the rent schedule. A lease abstract that captures only
            rent, term, and renewal options is incomplete for property
            accounting purposes and will produce systematic CAM calculation
            errors throughout the lease term.
          </p>
        </div>

        {/* Field categories */}
        {[
          {
            title: "Denominator Fields",
            icon: FileText,
            description:
              "These three fields define how the tenant's share of CAM is calculated. An error in any denominator field affects every year of billing for the full lease term.",
            fields: denominatorFields,
          },
          {
            title: "Expense Fields",
            icon: FileText,
            description:
              "These four fields define what goes into and stays out of the recoverable CAM pool. Errors here result in either overbilling (excluded items included) or undercollection (recoverable items missed).",
            fields: expenseFields,
          },
          {
            title: "Adjustment Fields",
            icon: FileText,
            description:
              "These four fields govern gross-up calculations and CAM cap enforcement: the two adjustments most commonly applied incorrectly.",
            fields: adjustmentFields,
          },
          {
            title: "Billing and Timing Fields",
            icon: FileText,
            description:
              "These four fields govern the timing of estimate letters, reconciliation statements, and audit rights. Missing any of them creates compliance exposure.",
            fields: billingFields,
          },
          {
            title: "Additional Fields",
            icon: FileText,
            description: "Applicable in expense stop lease structures.",
            fields: otherFields,
          },
        ].map((category) => (
          <section key={category.title} className="mb-12">
            <h2 className="text-xl font-bold text-foreground mb-2">
              {category.title}
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              {category.description}
            </p>
            <div className="space-y-4">
              {category.fields.map((field) => (
                <div
                  key={field.field}
                  className="rounded-lg border border-border overflow-hidden"
                >
                  <div className="bg-muted px-4 py-2 border-b border-border">
                    <p className="text-sm font-semibold text-foreground">
                      {field.field}
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    <div className="px-4 py-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                        What it is
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {field.whatItIs}
                      </p>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                        Where to find it
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {field.whereToFind}
                      </p>
                    </div>
                    <div className="px-4 py-3 bg-destructive/3">
                      <p className="text-xs font-medium text-destructive-strong uppercase tracking-wide mb-1">
                        What goes wrong if abstracted incorrectly
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {field.whatGoesWrong}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* What can go wrong */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-6">
            What Can Go Wrong
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Denominator abstracted as GLA instead of RSF
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A 200,000 RSF retail center has a GLA of 185,000 SF (the
                    difference is common area load). If the denominator is
                    abstracted as 185,000 instead of 200,000, every non-anchor
                    tenant&apos;s pro-rata share is 8.1% larger than the lease
                    provides. On a $1.2M CAM pool, a 10,000 RSF tenant&apos;s
                    annual bill is $6,486 higher than it should be. Over a
                    10-year lease term, that is $64,860 in overbilling from a
                    single abstraction error on a single field.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Audit rights window not captured: exposure discovered only
                    when tenant audits
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A property management transition means no one tracks when
                    tenant audit rights windows expire. A national retail tenant
                    initiates an audit for years 2021, 2022, and 2023
                    simultaneously in late 2024. Without a record of when each
                    year&apos;s statement was delivered, the landlord cannot
                    demonstrate that the audit rights window for 2021 closed in
                    early 2023. The tenant audits all three years and recovers
                    credits. The 2021 audit would have been time-barred with
                    proper tracking.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Management fee base not captured: fee calculated on wrong
                    denominator
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The lease abstract captures &quot;management fee: 4%.&quot;
                    The property accounting team applies 4% to total operating
                    expenses. The lease says 4% of gross revenues. On a building
                    with $4.2M in gross revenues and $1.1M in operating
                    expenses, 4% of gross revenues equals $168,000; 4% of
                    expenses equals $44,000. The difference - $124,000 - is
                    either undercollected (if gross revenues is the correct base
                    and expenses were used) or overbilled (if expenses is the
                    correct base and gross revenues were used). Both errors are
                    traceable to an incomplete lease abstract.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-6">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                Which lease abstraction fields most commonly cause CAM errors?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The five highest-impact fields are: denominator definition,
                gross-up threshold and methodology, management fee structure and
                cap, audit rights window, and reconciliation statement deadline.
                Errors in any of these create systematic billing problems for
                the full lease term.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                What is the difference between GLA and RSF for the denominator?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                GLA (Gross Leasable Area) measures tenant-accessible floor area
                without common area load. RSF (Rentable Square Feet) per BOMA
                includes the tenant&apos;s proportionate share of common areas.
                RSF is typically larger than GLA. Using GLA as the denominator
                produces a larger pro-rata share for each tenant than using RSF.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                How do I find the audit rights window in a lease?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Look for &quot;Tenant&apos;s Audit Rights,&quot; &quot;Right to
                Audit,&quot; or &quot;Examination of Records&quot; in the CAM or
                Operating Expenses section. The provision states how many months
                after receipt of the reconciliation statement the tenant may
                initiate an audit - typically 12 to 24 months.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                What happens if the CAM cap base year is abstracted incorrectly?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Every subsequent year&apos;s cap calculation is wrong. For a
                cumulative cap, the error compounds annually. Even for a
                non-cumulative cap, using the wrong base year dollar amount
                shifts all subsequent caps up or down - resulting in either
                systematic overbilling or undercollection throughout the lease
                term.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Related Resources
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              {
                title: "Pro-Rata Denominator Explained",
                href: "/resources/pro-rata-denominator-explained",
                description:
                  "How denominator definitions affect every tenant's CAM bill",
              },
              {
                title: "CAM Cap Enforcement",
                href: "/resources/cam-cap-enforcement",
                description:
                  "Cumulative vs. non-cumulative caps and how to calculate them",
              },
              {
                title: "Gross-Up Clause Explained",
                href: "/resources/gross-up-clause-explained",
                description:
                  "How gross-up works and which expenses are subject to it",
              },
              {
                title: "What Is a CAM Audit?",
                href: "/resources/what-is-a-cam-audit-landlord",
                description:
                  "What happens when a tenant exercises their audit rights",
              },
              {
                title: "CAM Reconciliation Software",
                href: "/cam-reconciliation-software",
                description:
                  "Software that applies abstracted lease fields to reconciliation automatically",
              },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <p className="font-medium group-hover:text-primary text-sm">
                  {link.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {link.description}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground text-background p-8 text-center">
          <h2 className="text-xl font-bold mb-2">
            Turn Your Lease Abstracts into Accurate CAM Calculations
          </h2>
          <p className="text-background/70 mb-6 text-sm">
            CapVeri ingests your lease abstract data and applies every
            CAM-critical field - denominator, gross-up, caps, management fee
            structure - to each reconciliation automatically.
          </p>
          <Button asChild variant="secondary" size="lg">
            <a href={buildTrialLink({ content: "lease_abstraction_cam_cta" })}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
