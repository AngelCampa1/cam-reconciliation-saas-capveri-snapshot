import { SITE_URL, TRIAL_COPY } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  FileText,
  AlertTriangle,
  HelpCircle,
  Calendar,
  ListChecks,
  Shield,
  Zap,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { PillarNavigation } from "@/components/content/PillarNavigation";
import { buildSiteUrl } from "@/lib/site";
import { VideoEmbed } from "@/components/VideoEmbed";
import { getVideosForPlacement } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CAM Reconciliation: Complete Landlord Guide (2026)",
  description:
    "What is CAM reconciliation and how does it work? Step-by-step process, annual timeline, common errors, tenant audit rights, and software comparison.",
  alternates: {
    canonical: `${SITE_URL}/cam-reconciliation-guide`,
  },
  openGraph: {
    title: "CAM Reconciliation: Complete Landlord Guide (2026)",
    description:
      "What is CAM reconciliation and how does it work? Step-by-step process, annual timeline, common errors, tenant audit rights, and software comparison.",
    url: `${SITE_URL}/cam-reconciliation-guide`,
    type: "article",
    publishedTime: "2025-02-01T00:00:00.000Z",
    modifiedTime: "2026-03-15T00:00:00.000Z",
    images: [
      {
        url: buildSiteUrl(
          `/api/og?title=${encodeURIComponent("CAM Reconciliation Guide")}&category=Guide`,
        ),
        width: 1200,
        height: 630,
        alt: "CAM Reconciliation: Complete Landlord Guide",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CAM Reconciliation: Complete Landlord Guide (2026)",
    description:
      "What is CAM reconciliation and how does it work? Step-by-step process, annual timeline, common errors, tenant audit rights, and software comparison.",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "CAM Reconciliation: Complete Step-by-Step Guide",
  url: `${SITE_URL}/cam-reconciliation-guide`,
  datePublished: "2026-03-21",
  dateModified: "2026-03-21",
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
  name: "How to Complete a CAM Reconciliation",
  totalTime: "PT8H",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Gather GL Expense Data",
      text: "Export your operating expense GL from Yardi, MRI, or other property management system for the reconciliation year.",
      url: `${SITE_URL}/cam-reconciliation-guide#step-1`,
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "Screen for Non-Recoverable Expenses",
      text: "Remove CapEx items, debt service, depreciation, above-market management fees, and lease-specific exclusions.",
      url: `${SITE_URL}/cam-reconciliation-guide#step-2`,
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Apply Gross-Up Adjustment",
      text: "If building occupancy was below the lease threshold (typically 90–95%), normalize variable expenses to the fully occupied equivalent.",
      url: `${SITE_URL}/cam-reconciliation-guide#step-3`,
    },
    {
      "@type": "HowToStep",
      position: 4,
      name: "Calculate Pro-Rata Shares",
      text: "Divide each tenant's RSF by the total leasable denominator from the lease to get their proportionate share percentage.",
      url: `${SITE_URL}/cam-reconciliation-guide#step-4`,
    },
    {
      "@type": "HowToStep",
      position: 5,
      name: "Enforce CAM Caps",
      text: "For leases with controllable expense caps, check whether year-over-year growth exceeds the cap and apply the cap bank if cumulative.",
      url: `${SITE_URL}/cam-reconciliation-guide#step-5`,
    },
    {
      "@type": "HowToStep",
      position: 6,
      name: "Calculate Reconciliation Amounts",
      text: "Multiply total recoverable (post-gross-up, post-cap) by each tenant's pro-rata share; subtract their paid estimates.",
      url: `${SITE_URL}/cam-reconciliation-guide#step-6`,
    },
    {
      "@type": "HowToStep",
      position: 7,
      name: "Prepare Reconciliation Statements",
      text: "Generate statements showing the calculation breakdown, supporting expense detail, and resulting true-up amount.",
      url: `${SITE_URL}/cam-reconciliation-guide#step-7`,
    },
    {
      "@type": "HowToStep",
      position: 8,
      name: "Issue Statements and Collect True-Ups",
      text: "Send statements within the lease deadline (typically 90–180 days after year-end); collect underpayments or credit overpayments.",
      url: `${SITE_URL}/cam-reconciliation-guide#step-8`,
    },
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is CAM reconciliation?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CAM reconciliation is the annual process where a commercial landlord compares actual common area maintenance expenses against the monthly estimates tenants paid throughout the year. If actual costs exceeded estimates, tenants owe a 'true-up' payment. If costs were lower, the landlord issues a credit or refund. Most commercial leases require reconciliation within 90–180 days of year-end.",
      },
    },
    {
      "@type": "Question",
      name: "What is the CAM reconciliation deadline?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most commercial leases require landlords to deliver the annual CAM reconciliation statement within 90–180 days after the end of the calendar year, typically by March 31 to June 30 for calendar-year leases. Missing the deadline can forfeit the landlord's right to collect underpayments in some states. California SB 1103 imposes specific deadlines for qualifying commercial tenants.",
      },
    },
    {
      "@type": "Question",
      name: "What is a CAM reconciliation statement?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A CAM reconciliation statement is a document sent by the landlord to each tenant showing: (1) total recoverable operating expenses for the year, (2) the tenant's pro-rata share percentage, (3) gross-up and cap adjustments applied, (4) the tenant's total annual CAM obligation, (5) the tenant's paid estimates, and (6) the resulting balance due or credit owed.",
      },
    },
    {
      "@type": "Question",
      name: "How long does CAM reconciliation take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Manual CAM reconciliation typically takes 4–8 hours per tenant, or 2–5 days per building, depending on the number of leases and GL complexity. Software that automates gross-up, cap enforcement, and pro-rata calculations can reduce this to minutes per building for routine reconciliations.",
      },
    },
    {
      "@type": "Question",
      name: "What software is used for CAM reconciliation?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Common options include Yardi Voyager's Recovery module, MRI Software's CAM reconciliation tools, and purpose-built tools like CapVeri. Property managers also use Excel spreadsheets, though manual spreadsheets are prone to formula errors and don't automatically enforce lease caps or gross-up rules.",
      },
    },
    {
      "@type": "Question",
      name: "What is the difference between CAM estimates and CAM reconciliation?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CAM estimates (also called CAM advances or CAM budget charges) are the monthly amounts tenants pay throughout the year based on the landlord's projected operating costs. CAM reconciliation is the annual settlement process that compares those estimates to actual expenses, resulting in either additional payment from the tenant or a credit from the landlord.",
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
      name: "CAM Reconciliation Guide",
      item: `${SITE_URL}/cam-reconciliation-guide`,
    },
  ],
};

const TIMELINE_ROWS = [
  {
    period: "Jan–Mar (Year N)",
    activity: "Prior-year reconciliation statements prepared",
    deadline: "Typically 90 days after Dec 31",
  },
  {
    period: "Jan–Mar",
    activity: "True-up invoices issued / credits applied",
    deadline: "Same as above",
  },
  {
    period: "Jan–Dec",
    activity: "Monthly CAM estimate (advance) charges collected",
    deadline: "Ongoing",
  },
  {
    period: "Oct–Nov",
    activity: "Budget CAM estimates prepared for next year",
    deadline: "Before year-end",
  },
  {
    period: "Dec 31",
    activity: "CAM year closes (calendar-year leases)",
    deadline: "Year-end",
  },
  {
    period: "Mar 31 – Jun 30",
    activity: "Latest typical statement delivery deadline",
    deadline: "Per lease (usually 90–180 days)",
  },
];

const PROCESS_STEPS = [
  {
    name: "Gather GL Expense Data",
    description:
      "Export your operating expense GL from Yardi, MRI, or other property management system for the reconciliation year.",
  },
  {
    name: "Screen for Non-Recoverable Expenses",
    description:
      "Remove CapEx items, debt service, depreciation, above-market management fees, and lease-specific exclusions.",
  },
  {
    name: "Apply Gross-Up Adjustment",
    description:
      "If building occupancy was below the lease threshold (typically 90–95%), normalize variable expenses to the fully occupied equivalent.",
  },
  {
    name: "Calculate Pro-Rata Shares",
    description:
      "Divide each tenant's RSF by the total leasable denominator from the lease to get their proportionate share percentage.",
  },
  {
    name: "Enforce CAM Caps",
    description:
      "For leases with controllable expense caps, check whether year-over-year growth exceeds the cap and apply the cap bank if cumulative.",
  },
  {
    name: "Calculate Reconciliation Amounts",
    description:
      "Multiply total recoverable (post-gross-up, post-cap) by each tenant's pro-rata share; subtract their paid estimates.",
  },
  {
    name: "Prepare Reconciliation Statements",
    description:
      "Generate statements showing the calculation breakdown, supporting expense detail, and resulting true-up amount.",
  },
  {
    name: "Issue Statements and Collect True-Ups",
    description:
      "Send statements within the lease deadline (typically 90–180 days after year-end); collect underpayments or credit overpayments.",
  },
];

const COMMON_ERRORS = [
  {
    title: "Non-recoverable expenses in the pool",
    body: "CapEx items, depreciation, and above-market management fees are the most common inclusions that inflate CAM.",
  },
  {
    title: "Gross-up applied to fixed expenses",
    body: "Taxes and insurance are fixed costs; gross-up should only apply to variable expenses that scale with occupancy.",
  },
  {
    title: "CAM cap bank not tracked",
    body: "Cumulative caps require a running ledger of unused cap capacity; missing this allows landlords to over-recover in high-expense years.",
  },
  {
    title: "Wrong reconciliation period",
    body: "Using incorrect year-end dates or mixing fiscal vs. calendar year reconciliations creates systemic errors across all tenant statements.",
  },
];

const COMPARISON_ROWS = [
  {
    aspect: "Gross-up automation",
    manual: "Manual formula",
    software: "Automated per lease",
  },
  {
    aspect: "Cap enforcement",
    manual: "Manual tracking",
    software: "Automated cap bank ledger",
  },
  {
    aspect: "Pro-rata calculation",
    manual: "Manual lookup",
    software: "Calculated from lease data",
  },
  {
    aspect: "Audit trail",
    manual: "Spreadsheet version history",
    software: "finalized traceable snapshots",
  },
  {
    aspect: "Time per building",
    manual: "2–5 days",
    software: "minutes",
  },
  {
    aspect: "Error rate",
    manual: "High (formula errors)",
    software: "Low (deterministic calculations)",
  },
];

export default async function CamReconciliationGuidePage() {
  const videos = await getVideosForPlacement("cam-reconciliation-guide");
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
                <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                Step-by-Step Process Guide
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              CAM Reconciliation: Complete Step-by-Step Guide
            </h1>
            <p className="text-xl text-muted-foreground mb-3 max-w-3xl">
              CAM reconciliation is the annual process commercial landlords use
              to settle operating expense estimates against actual costs. The
              result is either a true-up charge to the tenant or a credit. It is
              one of the most dispute-prone activities in commercial leasing.
            </p>
            {/* Answer primitive - definition in top 150 words for AI citation */}
            <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4 mb-8 max-w-3xl">
              <p className="text-sm font-semibold text-primary mb-1">
                Definition
              </p>
              <p className="text-sm text-foreground">
                CAM reconciliation is the annual comparison of actual operating
                expenses against the monthly estimates (CAM advances) tenants
                paid throughout the year. The process produces a reconciliation
                statement showing each tenant&apos;s true-up amount. It shows
                either a balance due or a credit, based on their pro-rata share
                of recoverable expenses.
              </p>
            </div>
            {/* Stat chips */}
            <div className="flex flex-wrap gap-3 mb-8">
              {[
                "40% of CAM reconciliations contain material errors (Tango Analytics)",
                "90\u2013180 days: typical statement deadline after year-end",
                "15\u201320%: CAM charges recovered in tenant audits (Springbord)",
              ].map((stat, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  {stat}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mb-8">
              By{" "}
              <Link
                href="/about/angel-campa"
                className="font-medium hover:underline"
              >
                Angel Campa
              </Link>
              , Founder, CapVeri · Last updated: March 2026
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-button bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Start free trial
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
              <Link
                href="/cam-charges"
                className="inline-flex items-center justify-center rounded-button border px-6 py-3 text-sm font-medium hover:bg-muted/50"
              >
                <FileText className="h-4 w-4 mr-2" />
                What Are CAM Charges?
              </Link>
            </div>
          </div>
        </section>

        <div className="container mx-auto max-w-5xl px-4 pt-8">
          <PillarNavigation currentPath="/cam-reconciliation-guide" />
        </div>

        {/* Table of Contents */}
        <nav className="border-b py-8 bg-muted/20">
          <div className="container mx-auto max-w-5xl px-4">
            <p className="text-sm font-semibold mb-3">In this guide</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {[
                { href: "#timeline", label: "Annual Calendar" },
                { href: "#process", label: "8-Step Process" },
                { href: "#errors", label: "Common Errors" },
                { href: "#audit-rights", label: "Tenant Audit Rights" },
                { href: "#software", label: "CAM Reconciliation Software" },
                { href: "#faq", label: "FAQs" },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm hover:bg-muted/50 transition-colors duration-200"
                >
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </nav>

        {/* Annual Timeline */}
        <section id="timeline" className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
              <Calendar className="h-6 w-6 text-primary" />
              The CAM Reconciliation Annual Calendar
            </h2>
            <p className="text-muted-foreground mb-6">
              Understanding the annual cycle helps landlords plan workloads and
              avoid missed deadlines.
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  CAM reconciliation annual calendar
                </caption>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      Period
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      Activity
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      Deadline
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {TIMELINE_ROWS.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors duration-200"
                    >
                      <td className="px-4 py-3 font-medium font-mono text-xs">
                        {row.period}
                      </td>
                      <td className="px-4 py-3">{row.activity}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.deadline}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              California SB 1103 imposes stricter requirements for small
              business commercial tenants. See our{" "}
              <Link
                href="/tools/sb-1103-checker"
                className="underline underline-offset-2 hover:text-foreground"
              >
                SB 1103 compliance checker
              </Link>
              .
            </p>
          </div>
        </section>

        {/* 8-Step Process */}
        <section id="process" className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2">
              The 8-Step CAM Reconciliation Process
            </h2>
            <p className="text-muted-foreground mb-6">
              Each step maps to a distinct phase of the reconciliation workflow
              and must be completed in order.
            </p>
            {/* Before You Start callout */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 mb-8">
              <p className="text-sm font-semibold text-foreground mb-1">
                Before You Start: Get Accurate Lease Data
              </p>
              <p className="text-sm text-muted-foreground">
                Reconciliation accuracy depends on reading the correct terms
                from each lease: gross-up threshold, pro-rata share denominator,
                CAM cap structure, and expense exclusions. Before running the
                numbers, upload lease PDFs to{" "}
                <a
                  href="https://www.lextract.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary underline underline-offset-2 hover:no-underline"
                >
                  lextract.io
                </a>{" "}
                to extract these CAM-critical fields in minutes, so your
                reconciliation math is grounded in the actual lease language,
                not assumptions.
              </p>
            </div>
            <div className="space-y-4">
              {PROCESS_STEPS.map((step, i) => (
                <div
                  key={i}
                  id={`step-${i + 1}`}
                  className="rounded-lg border bg-background p-5 flex gap-4"
                >
                  <div className="flex-shrink-0 h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">
                      {i + 1}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{step.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Common Errors */}
        <section id="errors" className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-warning" />
              The Most Common CAM Reconciliation Errors
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {COMMON_ERRORS.map((item, i) => (
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
        <section id="audit-rights" className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Tenant Audit Rights in CAM Reconciliation
            </h2>
            <div className="rounded-lg border bg-background p-6 max-w-3xl space-y-3">
              <p className="text-sm text-muted-foreground">
                Most commercial leases give tenants{" "}
                <span className="font-medium text-foreground">
                  12 months from statement delivery
                </span>{" "}
                to request an audit of the landlord&apos;s CAM reconciliation.
              </p>
              <ul className="space-y-2">
                {[
                  "Tenant must provide written notice of audit intent within the lease-specified window",
                  "Landlord must make supporting GL documentation available within 30 days of the request",
                  "Many leases restrict audit frequency to once per year and require a CPA or qualified auditor",
                  "Errors discovered during audit are typically reconciled via credit or invoice adjustment",
                ].map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">{point}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground pt-2">
                <span className="font-medium text-foreground">
                  Note for landlords:
                </span>{" "}
                If your tenants are disputing CAM charges, they may be using
                tools like{" "}
                <a
                  href="https://www.camaudit.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary underline underline-offset-2 hover:no-underline"
                >
                  camaudit.io
                </a>{" "}
                to audit your reconciliation statements and identify potential
                overcharges before engaging a formal CPA auditor. Delivering
                accurate, well-documented statements is your strongest defense.
              </p>
              <p className="text-sm text-muted-foreground pt-2">
                <Link
                  href="/resources/states"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline underline-offset-2"
                >
                  State-specific CAM compliance guides
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </p>
            </div>
          </div>
        </section>

        {/* Manual vs. Software */}
        <section id="software" className="py-16 border-b">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
              <Zap className="h-6 w-6 text-primary" />
              Manual Reconciliation vs. Software: What&apos;s the Difference?
            </h2>
            <p className="text-muted-foreground mb-6">
              Spreadsheets can handle simple portfolios but break down as lease
              complexity increases.
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Manual reconciliation vs. software comparison
                </caption>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold w-[220px]"
                    >
                      Aspect
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold"
                    >
                      Manual (Excel/Spreadsheet)
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold text-primary"
                    >
                      CAM Reconciliation Software
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b last:border-0 hover:bg-muted/20 transition-colors duration-200"
                    >
                      <td className="px-4 py-3 font-medium text-muted-foreground">
                        {row.aspect}
                      </td>
                      <td className="px-4 py-3">{row.manual}</td>
                      <td className="px-4 py-3 font-medium text-primary">
                        {row.software}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-16 border-b bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <HelpCircle className="h-6 w-6 text-primary" />
              Frequently Asked Questions
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

        {/* Related Resources */}
        <section className="py-16 border-b">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold mb-6">
              Related CAM Reconciliation Resources
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
              {[
                {
                  href: "/resources/cam-expense-caps",
                  title: "CAM Expense Caps Guide",
                  description: "Cumulative vs non-cumulative cap math",
                },
                {
                  href: "/resources/cam-gross-up-calculation-guide",
                  title: "Gross-Up Calculation Guide",
                  description: "Variable vs fixed expense gross-up",
                },
                {
                  href: "/tools/cam-reconciliation-template",
                  title: "Free CAM Template",
                  description: "Download a reconciliation spreadsheet",
                },
                {
                  href: "/blog/cam-exclusion-list-complete-guide",
                  title: "CAM Exclusion List",
                  description: "Non-recoverable expense reference",
                },
                {
                  href: "/blog/cam-reconciliation-deadlines",
                  title: "CAM Deadlines 2026",
                  description: "State-by-state deadline requirements",
                },
                {
                  href: "/tools/cam-gross-up-calculator",
                  title: "Gross-Up Calculator",
                  description: "Calculate gross-up adjustments free",
                },
                {
                  href: "/cam-audit",
                  title: "CAM Audit Software",
                  description:
                    "Run your CAM numbers right. They hold up to any tenant audit.",
                },
                {
                  href: "/cam-charges",
                  title: "What Are CAM Charges?",
                  description:
                    "Complete breakdown of CAM charges and what's recoverable.",
                },
                {
                  href: "/lease-abstraction",
                  title: "Lease Abstraction",
                  description:
                    "Extract CAM-critical fields from lease PDFs automatically.",
                },
                {
                  href: "/glossary",
                  title: "CAM Glossary",
                  description:
                    "Reconciliation terminology: true-up, variance, cap bank, and more.",
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
        </section>

        {/* Watch videos band */}
        {videos.length > 0 && (
          <section className="py-16 border-b">
            <div className="container mx-auto max-w-4xl px-4">
              <h2 className="text-xl font-bold mb-8 text-center">
                Watch: CAM Reconciliation in Plain English
              </h2>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                {videos.map((v) => (
                  <div key={v.slug} className="flex flex-col gap-3">
                    <JsonLd
                      data={structuredDataSchemas.videoObject({
                        name: v.title,
                        description: v.description,
                        youtubeId: v.youtubeId,
                        uploadDate: v.uploadDate,
                        durationSeconds: v.durationSeconds,
                        thumbnailUrl: v.thumbnailUrl,
                      })}
                    />
                    <VideoEmbed
                      youtubeId={v.youtubeId}
                      title={v.title}
                      thumbnailUrl={v.thumbnailUrl}
                    />
                    <p className="text-sm font-medium">{v.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {v.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="py-16">
          <div className="container mx-auto max-w-5xl px-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-8 text-center">
              <h2 className="text-2xl font-bold mb-3">
                Automate Your CAM Reconciliation
              </h2>
              <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                CapVeri processes Yardi, MRI, and AppFolio GL exports. No
                integration, no consultant. {TRIAL_COPY}.
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
                  href="/cam-charges"
                  className="inline-flex items-center justify-center rounded-button border px-6 py-3 text-sm font-medium hover:bg-muted/50"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  What Are CAM Charges?
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
