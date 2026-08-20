import { SITE_URL, TRIAL_COPY } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  XCircle,
  AlertTriangle,
  HelpCircle,
  DollarSign,
  FileText,
  Calculator,
  Shield,
  Search,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "What Are CAM Charges? How to Calculate and Audit Them (2026)",
  description:
    "CAM charges are operating expenses commercial landlords bill tenants for shared building costs. Learn what goes in, how to calculate pro-rata shares, and how to catch billing errors.",
  alternates: {
    canonical: `${SITE_URL}/cam-charges`,
  },
  openGraph: {
    title: "What Are CAM Charges? How to Calculate and Audit Them (2026)",
    description:
      "CAM charges are operating expenses commercial landlords bill tenants for shared building costs. Learn what goes in, how to calculate pro-rata shares, and how to catch billing errors.",
    url: `${SITE_URL}/cam-charges`,
    type: "article",
    publishedTime: "2025-01-15T00:00:00.000Z",
    modifiedTime: "2026-04-17T00:00:00.000Z",
    images: [
      {
        url: buildSiteUrl(
          `/api/og?title=${encodeURIComponent("What Are CAM Charges")}&category=Guide`,
        ),
        width: 1200,
        height: 630,
        alt: "What Are CAM Charges? How to Calculate and Audit Them",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "What Are CAM Charges? How to Calculate and Audit Them (2026)",
    description:
      "CAM charges are operating expenses commercial landlords bill tenants for shared building costs. Learn what goes in, how to calculate pro-rata shares, and how to catch billing errors.",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "What Are CAM Charges? How to Calculate and Audit CAM in Commercial Leases",
  description:
    "CAM charges (Common Area Maintenance) are operating expense recoveries landlords bill to tenants under NNN and modified gross leases. Learn what goes in, how to calculate pro-rata shares, and how to catch billing errors.",
  url: `${SITE_URL}/cam-charges`,
  datePublished: "2025-01-15",
  dateModified: "2026-04-17",
  author: {
    "@type": "Person",
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  publisher: {
    "@type": "Organization",
    name: "CapVeri.com",
    url: SITE_URL,
  },
};

const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Calculate CAM Charges",
  description:
    "Step-by-step process for calculating a tenant's CAM charge obligation under a commercial lease.",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Identify recoverable expenses",
      text: "Review the lease to determine which operating expenses are recoverable. Exclude capital expenditures, debt service, leasing commissions, depreciation, and above-market management fees.",
      url: `${SITE_URL}/cam-charges#step-1`,
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "Calculate tenant's pro-rata share",
      text: "Divide the tenant's rentable square footage (RSF) by the total leasable RSF of the building (as defined in the lease). This percentage is the tenant's pro-rata share.",
      url: `${SITE_URL}/cam-charges#step-2`,
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Apply gross-up (if below occupancy threshold)",
      text: "If the building occupancy falls below the lease's gross-up threshold (typically 90%–95%), normalize variable operating expenses to what they would cost at that threshold. Apply gross-up only to variable expenses. Do not apply it to taxes, insurance, or other fixed costs.",
      url: `${SITE_URL}/cam-charges#step-3`,
    },
    {
      "@type": "HowToStep",
      position: 4,
      name: "Apply CAM caps",
      text: "If the lease has a cap on controllable expenses, verify that the recoverable pool does not exceed the cap limit. Track the cumulative cap bank if the lease uses a cumulative (rolling) cap structure.",
      url: `${SITE_URL}/cam-charges#step-4`,
    },
    {
      "@type": "HowToStep",
      position: 5,
      name: "Subtract tenant's paid estimates",
      text: "Subtract the total CAM estimates (advances) the tenant paid throughout the year. Monthly estimates are collected in advance based on the prior year's actuals.",
      url: `${SITE_URL}/cam-charges#step-5`,
    },
    {
      "@type": "HowToStep",
      position: 6,
      name: "Issue reconciliation statement",
      text: "If actual CAM charges exceed estimates, issue a true-up invoice to the tenant. If estimates exceeded actual charges, issue a credit or refund per the lease terms.",
      url: `${SITE_URL}/cam-charges#step-6`,
    },
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What are CAM charges in a commercial lease?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CAM charges (Common Area Maintenance charges) are a tenant's proportionate share of operating expenses for the common areas and building systems of a commercial property. Under NNN and modified gross leases, landlords recover these costs annually through a reconciliation process. Typical CAM expenses include janitorial services, landscaping, parking lot maintenance, HVAC repairs, property insurance, and property taxes.",
      },
    },
    {
      "@type": "Question",
      name: "What is a reasonable CAM charge per square foot?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Typical CAM charges range from $3–$12 per square foot annually, depending on property type. Office buildings average $6–$10/SF. Retail and shopping centers average $4–$8/SF. Industrial and warehouse properties average $1–$3/SF. These figures vary by market, building age, and what expenses the lease defines as recoverable.",
      },
    },
    {
      "@type": "Question",
      name: "Can tenants dispute CAM charges?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Most commercial leases grant tenants an audit right, typically a 12-month window after receiving the annual reconciliation statement, to review the landlord's books and challenge errors. Common grounds for dispute include non-recoverable expenses in the pool, incorrect pro-rata share calculations, gross-up applied incorrectly, or CAM caps not enforced.",
      },
    },
    {
      "@type": "Question",
      name: "How often are CAM reconciliations done?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CAM reconciliations are typically performed annually, within 90–180 days after the end of the calendar year. During the year, tenants pay monthly CAM estimates (also called CAM advances). The annual reconciliation statement compares actual expenses to estimates and results in either a true-up payment from the tenant or a credit from the landlord.",
      },
    },
    {
      "@type": "Question",
      name: "What is gross-up in CAM charges?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Gross-up is an adjustment that normalizes variable operating expenses to what they would cost at a specified occupancy level, typically 90%–95%. When a building has vacant space, costs like janitorial and utilities are lower. Gross-up ensures tenants pay their fair share of the 'fully occupied' cost, so tenants in occupied buildings do not subsidize vacancies.",
      },
    },
    {
      "@type": "Question",
      name: "What expenses are typically excluded from CAM?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Non-recoverable CAM exclusions typically include: capital expenditures (roof replacement, major HVAC systems), debt service and mortgage payments, leasing commissions and tenant improvement allowances, above-market management fees (capped at 3%–5% of revenues in most leases), depreciation, and expenses for other tenants' specific spaces.",
      },
    },
  ],
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    {
      "@type": "ListItem",
      position: 2,
      name: "CAM Charges",
      item: `${SITE_URL}/cam-charges`,
    },
  ],
};

const BENCHMARKS = [
  {
    type: "Office",
    range: "$6–$10/SF/yr",
    drivers: "HVAC, security, common area cleaning",
  },
  {
    type: "Retail / Shopping Center",
    range: "$4–$8/SF/yr",
    drivers: "Parking lot, landscaping, common area",
  },
  {
    type: "Industrial / Warehouse",
    range: "$1–$3/SF/yr",
    drivers: "Minimal common areas, exterior only",
  },
  {
    type: "Medical Office",
    range: "$8–$14/SF/yr",
    drivers: "HVAC, compliance, specialized cleaning",
  },
  {
    type: "Mixed-Use",
    range: "$5–$9/SF/yr",
    drivers: "Varies by use mix",
  },
];

const CAM_ERRORS = [
  {
    title: "Non-recoverable expenses in the pool",
    body: "CapEx items, depreciation, and debt service included in the CAM pool inflate tenant charges. These are among the most common and highest-dollar errors found in reconciliation audits.",
  },
  {
    title: "Gross-up applied incorrectly",
    body: "Using the wrong occupancy threshold or applying gross-up to non-variable expenses (taxes, insurance) overstates the normalized expense pool. At $500K of variable expenses, a single threshold error can drive a $14,000+ overbilling.",
  },
  {
    title: "CAM cap not enforced",
    body: "Controllable expense cap exceeded without tracking the cumulative cap bank. When landlords fail to apply the cap, tenants pay more than the lease allows. This is a clear audit dispute trigger.",
  },
  {
    title: "Wrong pro-rata share denominator",
    body: "Using total building RSF instead of total leasable RSF (or vice versa) can shift thousands of dollars between tenants annually. The denominator definition is set by the lease, not convention.",
  },
];

export default function CamChargesPage() {
  return (
    <div className="pb-24">
      <JsonLd data={articleSchema} />
      <JsonLd data={howToSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />

      <div className="flex flex-col">
        {/* Hero */}
        <section className="border-b bg-gradient-to-b from-primary/5 to-background py-16 md:py-24">
          <div className="container mx-auto max-w-5xl px-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
                <DollarSign className="h-3.5 w-3.5 mr-1.5" />
                CAM Charges &amp; Calculation Guide
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              What Are CAM Charges and How Are They Calculated?
            </h1>
            <p className="text-xl text-muted-foreground mb-3 max-w-3xl">
              CAM charges are what landlords bill tenants for shared building
              costs. This guide shows what&apos;s included. You will learn how
              to split costs by tenant. You will also see how to check for
              overbilling.
            </p>
            {/* Definition block */}
            <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4 mb-3 max-w-3xl">
              <p className="text-sm font-semibold text-primary mb-1">
                Definition
              </p>
              <p className="text-sm text-foreground">
                CAM charges (Common Area Maintenance) are operating expense
                recoveries that commercial landlords bill to tenants under NNN
                and modified gross leases. They represent the tenant&apos;s
                share of costs to operate and maintain shared building areas and
                systems. The amounts are reconciled annually against actual
                expenses.
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-2 mb-8">
              By{" "}
              <Link
                href="/about/angel-campa"
                className="font-medium hover:underline"
              >
                Angel Campa
              </Link>
              , Founder, CapVeri · Last updated: March 2026
            </p>
            {/* Stats row */}
            <div className="flex flex-col sm:flex-row gap-4 mb-8 max-w-3xl">
              {[
                {
                  stat: "Avg $6.50/SF",
                  label: "BOMA survey of 4,400+ properties nationwide",
                },
                {
                  stat: "15–20%",
                  label: "of billed CAM charges recovered in tenant audits (Springbord)",
                },
                {
                  stat: "12-month",
                  label: "audit window in most commercial leases",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="rounded-lg border bg-background px-4 py-3 flex-1"
                >
                  <p className="text-lg font-bold text-primary">{item.stat}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-button bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                View Pricing
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
              <Link
                href="/cam-reconciliation-guide"
                className="inline-flex items-center justify-center rounded-button border px-6 py-3 text-sm font-medium hover:bg-muted/50"
              >
                <FileText className="h-4 w-4 mr-2" />
                CAM Reconciliation Guide
              </Link>
            </div>
          </div>
        </section>

        {/* What's Included in CAM */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              What Expenses Are Included in CAM Charges?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-3xl">
              The lease defines what is recoverable. These are the most common
              inclusions and exclusions across NNN commercial leases.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Recoverable */}
              <div className="rounded-lg border p-6">
                <p className="font-semibold text-sm mb-4 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  Typically Recoverable
                </p>
                <ul className="space-y-2">
                  {[
                    "Janitorial and cleaning",
                    "Parking lot maintenance and snow removal",
                    "Landscaping and grounds maintenance",
                    "Building exterior maintenance",
                    "Common area electricity and lighting",
                    "HVAC for common areas",
                    "Elevator maintenance",
                    "Security and pest control",
                    "Property insurance premiums",
                    "Property management fees (capped)",
                    "Property taxes (in some leases)",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Non-recoverable */}
              <div className="rounded-lg border p-6">
                <p className="font-semibold text-sm mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Typically NOT Recoverable
                </p>
                <ul className="space-y-2">
                  {[
                    "Capital expenditures (roof/HVAC replacement)",
                    "Debt service and mortgage payments",
                    "Leasing commissions and tenant improvements",
                    "Above-market management fees",
                    "Depreciation",
                    "Interior improvements for other tenants",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* How CAM is Calculated */}
        <section className="py-16 border-b bg-muted/30" id="how-it-works">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              How Are CAM Charges Calculated?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-3xl">
              CAM reconciliation follows six steps from identifying recoverable
              expenses to issuing the annual statement.
            </p>
            <div className="space-y-4">
              {[
                {
                  id: "step-1",
                  title: "Identify total recoverable expenses for the year",
                  body: "Pull all operating expenses from the GL and exclude non-recoverable items per the lease: CapEx, debt service, leasing commissions, depreciation, and any above-market management fees.",
                },
                {
                  id: "step-2",
                  title:
                    "Calculate tenant's pro-rata share (tenant RSF ÷ total leasable RSF)",
                  body: "The denominator is defined in the lease, typically total leasable RSF, though some leases use total building RSF. Using the wrong denominator is one of the most common billing errors.",
                },
                {
                  id: "step-3",
                  title:
                    "Apply gross-up adjustment (if occupancy < threshold, normalize to 90–95%)",
                  body: "Gross-up applies only to variable expenses (janitorial, utilities). Do not apply it to fixed costs like taxes and insurance. Verify the occupancy threshold and the gross-up formula in the lease before calculating.",
                },
                {
                  id: "step-4",
                  title:
                    "Apply CAM cap (if lease has cap provision on controllable expenses)",
                  body: "Caps limit year-over-year increases in controllable expenses. Cumulative caps carry unused cap room forward. Non-cumulative caps reset each year. Verify the cap structure, base year, and which expenses are capped.",
                },
                {
                  id: "step-5",
                  title:
                    "Subtract tenant's paid monthly estimates (CAM advances)",
                  body: "Monthly CAM estimates collected throughout the year are subtracted from the annual actual obligation. Estimates are set based on prior-year actuals or the landlord's budget.",
                },
                {
                  id: "step-6",
                  title:
                    "Issue reconciliation statement (overpayment → credit, underpayment → true-up)",
                  body: "If actual CAM exceeds estimates, the tenant owes a true-up. If estimates exceeded actuals, the landlord issues a credit or refund per the lease's reconciliation terms.",
                },
              ].map((step, i) => (
                <div
                  key={i}
                  id={step.id}
                  className="rounded-lg border bg-background p-5 flex gap-4"
                >
                  <div className="flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 text-primary font-bold text-sm">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-sm mb-1">{step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Example */}
            <div className="mt-6 rounded-lg border-l-4 border-primary bg-primary/5 p-4 max-w-3xl">
              <p className="text-sm font-semibold text-primary mb-1 flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Example Calculation
              </p>
              <p className="text-sm text-foreground">
                A 5,000 SF tenant in a 50,000 SF building has a 10% pro-rata
                share. If the building&apos;s recoverable CAM expenses total
                $400,000 after gross-up, the tenant&apos;s annual CAM obligation
                is $40,000 ($8.00/SF).
              </p>
            </div>
          </div>
        </section>

        {/* Benchmarks */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              CAM Charge Benchmarks by Property Type
            </h2>
            <p className="text-muted-foreground mb-6 max-w-3xl">
              Use these ranges to identify outliers in your portfolio or to
              evaluate a reconciliation statement before paying.
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  CAM charges by property type
                </caption>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      Property Type
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      Typical CAM Range
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      Key Cost Drivers
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {BENCHMARKS.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors duration-200"
                    >
                      <td className="px-4 py-3 font-medium">{row.type}</td>
                      <td className="px-4 py-3 font-mono text-xs text-primary">
                        {row.range}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.drivers}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Sources: BOMA Experience Exchange Report, IREM Income/Expense
              Analysis. Figures reflect U.S. national averages.
            </p>
          </div>
        </section>

        {/* Common CAM Errors */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-warning" />
              Common CAM Billing Errors Landlords Make
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {CAM_ERRORS.map((item, i) => (
                <div
                  key={i}
                  className="rounded-md border border-warning/30 bg-warning/10 p-4"
                >
                  <p className="font-semibold text-warning-foreground mb-1 text-sm">
                    {item.title}
                  </p>
                  <p className="text-sm text-warning-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tenant Audit Rights */}
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Tenant Rights to Audit CAM Charges
            </h2>
            <p className="text-muted-foreground mb-6 max-w-3xl">
              Most commercial leases include an audit right that allows tenants
              to challenge CAM reconciliation statements. Exercising this right
              within the required window is the most effective way to recover
              overbillings.
            </p>
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              {[
                {
                  icon: Search,
                  title: "12-month audit window",
                  body: "Most leases require tenants to request an audit within 12 months of receiving the annual reconciliation statement. Missing this deadline typically waives the right.",
                },
                {
                  icon: FileText,
                  title: "Written request required",
                  body: "The audit request must usually be submitted in writing and specify which year(s) are being challenged. Review the lease for the exact notice requirements.",
                },
                {
                  icon: Shield,
                  title: "Landlord must provide documentation",
                  body: "Upon a valid audit request, the landlord must produce GL detail, invoices, and supporting documentation for the reconciled expenses. Refusal is grounds for dispute.",
                },
                {
                  icon: Calculator,
                  title: "Dispute resolution process",
                  body: "If the audit reveals overbillings, most leases specify a cure period and dispute resolution mechanism, typically mediation before litigation. Document every finding with GL line references.",
                },
              ].map(({ icon: Icon, title, body }, i) => (
                <div key={i} className="flex gap-3 rounded-lg border p-4">
                  <div className="flex-shrink-0 h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm mb-1">{title}</p>
                    <p className="text-sm text-muted-foreground">{body}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/tools/audit-risk-scorecard"
              className="inline-flex items-center justify-center rounded-button border px-5 py-2.5 text-sm font-medium hover:bg-muted/50"
            >
              <Search className="h-4 w-4 mr-2" />
            Pre-Send Audit Exposure Scorecard
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <HelpCircle className="h-6 w-6 text-primary" />
              Frequently Asked Questions About CAM Charges
            </h2>
            <div className="space-y-4">
              {faqSchema.mainEntity.map((item, i) => (
                <div key={i} className="rounded-lg border bg-background p-5">
                  <p className="font-semibold mb-2">{item.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.acceptedAnswer.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Related Tools */}
        <section className="py-12 border-b bg-muted/20">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-xl font-bold mb-3">Related Tools</h2>
            <p className="text-sm text-muted-foreground mb-2">
              Tenants can verify their CAM charge allocation with{" "}
              <a
                href="https://www.camaudit.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                CAMAudit.io
              </a>
              .
            </p>
            <p className="text-sm text-muted-foreground">
              To extract CAM-related clauses from your lease, use{" "}
              <a
                href="https://www.lextract.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Lextract.io
              </a>
              .
            </p>
          </div>
        </section>

        {/* Related Resources */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold mb-6">Related Resources</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    href: "/cam-audit",
                    title: "CAM Audit Software",
                    description:
                      "Run your CAM numbers right. They hold up to any tenant audit.",
                  },
                  {
                    href: "/cam-reconciliation-guide",
                    title: "CAM Reconciliation Guide",
                    description:
                      "Step-by-step reconciliation process from GL export to demand letter.",
                  },
                  {
                    href: "/lease-abstraction",
                    title: "Lease Abstraction",
                    description:
                      "Extract CAM-critical fields from lease PDFs automatically.",
                  },
                  {
                    href: "/tools/cam-gross-up-calculator",
                    title: "Gross-Up Calculator",
                    description:
                      "Calculate gross-up adjustments for variable CAM expenses.",
                  },
                  {
                    href: "/tools/cam-cap-calculator",
                    title: "CAM Cap Calculator",
                    description:
                      "Model cumulative and non-cumulative cap scenarios.",
                  },
                  {
                    href: "/blog/cam-exclusion-list-complete-guide",
                    title: "CAM Exclusion List",
                    description:
                      "Complete guide to non-recoverable expenses and exclusions.",
                  },
                  {
                    href: "/glossary",
                    title: "CAM Glossary",
                    description:
                      "Key terms: NNN, controllable expenses, expense stop, and more.",
                  },
                ].map(({ href, title, description }) => (
                  <Link
                    key={href}
                    href={href}
                    className="rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <p className="font-semibold text-sm mb-1">{title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {description}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16">
          <div className="container mx-auto max-w-5xl px-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-8 text-center">
              <h2 className="text-2xl font-bold mb-3">
                Run Your CAM Reconciliation in CapVeri
              </h2>
              <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                CapVeri runs your CAM reconciliation from Yardi, MRI, and
                AppFolio exports and hands you a tenant-ready statement. No
                integration needed. {TRIAL_COPY}, no credit card required.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center rounded-button bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Start free trial
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
                <Link
                  href="/cam-reconciliation-guide"
                  className="inline-flex items-center justify-center rounded-button border px-6 py-3 text-sm font-medium hover:bg-muted/50"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  CAM Reconciliation Guide
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
