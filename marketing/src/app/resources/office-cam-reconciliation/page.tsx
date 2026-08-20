import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import {
  structuredDataSchemas,
  AUTHOR_ANGEL_CAMPA,
} from "@/lib/structured-data";

export const metadata: Metadata = {
  title:
    "CAM Reconciliation for Office Buildings: What's Different and What to Watch For",
  description:
    "Office CAM reconciliation has unique challenges: high HVAC costs, service-level agreements, and modified gross leases that don't always separate expenses clearly. Here's what office landlords need to know.",
  alternates: {
    canonical: `${SITE_URL}/resources/office-cam-reconciliation`,
  },
  openGraph: {
    title:
      "CAM Reconciliation for Office Buildings: What's Different and What to Watch For",
    description:
      "Office CAM reconciliation has unique challenges: high HVAC costs, service-level agreements, and modified gross leases that don't always separate expenses clearly. Here's what office landlords need to know.",
    url: `${SITE_URL}/resources/office-cam-reconciliation`,
    type: "article",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "CAM Reconciliation for Office Buildings: What's Different and What to Watch For",
  description:
    "Office CAM reconciliation challenges: HVAC classification, base-year mechanics, gross-up in high-vacancy environments, and modified gross lease structures.",
  url: `${SITE_URL}/resources/office-cam-reconciliation`,
  datePublished: "2026-04-01",
  dateModified: "2026-04-26",
  author: AUTHOR_ANGEL_CAMPA,
  publisher: structuredDataSchemas.organization,
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is included in office CAM charges?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Office CAM typically includes: HVAC operation and maintenance for common areas (25–35% of total CAM), janitorial services for lobbies and corridors, elevator maintenance, security and concierge, common area utilities, and parking structure maintenance if applicable. What is NOT included: tenant-specific HVAC after-hours charges, janitorial within leased suites, and capital replacements of major building systems.",
      },
    },
    {
      "@type": "Question",
      name: "What is a base-year lease and how does it affect office CAM reconciliation?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A base-year lease sets a reference year (e.g., 2019 or the first year of the lease) for operating expenses. The tenant only pays CAM above the base year level. If the base year expenses were $12/SF and current expenses are $16/SF, the tenant pays $4/SF in additional CAM. The landlord absorbs the base year amount - which is effectively bundled into base rent.",
      },
    },
    {
      "@type": "Question",
      name: "Is HVAC maintenance an operating expense or a capital expense in office CAM?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Routine HVAC maintenance contracts and service agreements are operating expenses - recoverable through CAM. Major component replacements (compressors, AHUs, chillers) are capital expenditures and are generally not immediately recoverable. Some leases allow amortization of capital HVAC expenditures over their useful life with interest, in which case only the annual amortization amount is billed to tenants.",
      },
    },
    {
      "@type": "Question",
      name: "What is the typical CAM per SF for Class A office in 2026?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Class A office CAM typically runs $4–8/SF per year in 2026, driven primarily by HVAC, security, and janitorial costs. Class B office ranges $3–6/SF. These figures have risen 20–30% from pre-2020 levels due to HVAC upgrades for air quality, increased security costs, and higher labor rates for maintenance staff.",
      },
    },
  ],
};

export default function OfficeCamReconciliationPage() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />
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
          <span className="text-foreground">Office CAM Reconciliation</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Reconciliation for Office Buildings: What&apos;s Different and
            What to Watch For
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Office CAM reconciliation is structurally different from retail or
            industrial. It is dominated by interior costs, complicated by
            modified gross lease structures, and facing a unique gross-up
            challenge in a post-2020 high-vacancy market. Here is what office
            landlords need to get right.
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
            Office building CAM differs from retail and industrial primarily in
            the expense composition (HVAC dominates at 25–35% of CAM), the lease
            structure (modified gross leases are common with fewer pass-throughs
            than NNN), and the occupancy dynamics (19–20% national vacancy in
            2026 creates significant gross-up complexity that most office
            landlords are under-applying).
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Office CAM Expense Profile
          </h2>
          <p className="mb-4 text-muted-foreground">
            Understanding what drives office CAM costs is the starting point for
            reconciliation. Unlike retail (exterior-dominated) or industrial
            (minimal common area), office CAM is predominantly interior
            maintenance.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold">
                    Expense Category
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    % of Total CAM
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    OpEx or CapEx?
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Key Reconciliation Issue
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-3 font-medium">HVAC (common areas)</td>
                  <td className="px-4 py-3 text-muted-foreground">25–35%</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    OpEx (maintenance); CapEx (replacement)
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Separating maintenance from capital work
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Janitorial</td>
                  <td className="px-4 py-3 text-muted-foreground">20–30%</td>
                  <td className="px-4 py-3 text-muted-foreground">OpEx</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Common area only - not tenant suites
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Utilities</td>
                  <td className="px-4 py-3 text-muted-foreground">15–25%</td>
                  <td className="px-4 py-3 text-muted-foreground">OpEx</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Sub-metering of tenant vs. common area
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Security / concierge
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">10–20%</td>
                  <td className="px-4 py-3 text-muted-foreground">OpEx</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    24/7 vs. business hours staffing levels
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Elevator maintenance
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">5–10%</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    OpEx (service); CapEx (cab replacement)
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Full modernization vs. maintenance contract
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Parking / exterior</td>
                  <td className="px-4 py-3 text-muted-foreground">5–15%</td>
                  <td className="px-4 py-3 text-muted-foreground">OpEx</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Garage structure maintenance classification
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Modified Gross vs. Full NNN in Office
          </h2>
          <p className="mb-4 text-muted-foreground">
            The majority of office leases, particularly for Class A and B
            properties, are modified gross leases, not full NNN. This
            distinction fundamentally changes what is recoverable and how the
            reconciliation works.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">Full NNN Office Lease</h3>
              <p className="text-sm text-muted-foreground">
                Less common. Tenant pays all operating expenses above a base.
                Reconciliation covers all categories. Common in Class C
                properties, older suburban office parks, and sale-leaseback
                structures with sophisticated tenants.
              </p>
            </div>
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">Modified Gross Office</h3>
              <p className="text-sm text-muted-foreground">
                Most common. Base rent includes certain operating expenses
                (typically utilities, janitorial within suites). Only
                recoverable CAM above the base year stop is billed separately.
                The "modification" varies by lease.
              </p>
            </div>
          </div>
          <p className="mt-4 text-muted-foreground">
            When reconciling a modified gross lease, the first question is: what
            does the base rent include? If base rent includes utilities and
            janitorial for tenant suites, those categories may not appear in the
            CAM reconciliation at all. Misclassifying included vs. excluded
            expenses inflates the CAM pool and overbills tenants.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Base Year Mechanics: Why 2019 Is Problematic in 2026
          </h2>
          <p className="mb-4 text-muted-foreground">
            A base-year lease sets the reference level for operating expenses.
            The tenant pays only the overage above the base. For leases where
            the base year was set in 2019, operating costs have risen 30–40%
            since then, meaning the landlord absorbs a substantial
            below-base-year expense pool and only recovers the increase.
          </p>
          <div className="rounded-lg border bg-muted/30 p-6 mb-4">
            <h3 className="mb-4 font-semibold">Base Year Example</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  <tr>
                    <td className="py-2 text-muted-foreground">
                      2019 base year operating expenses (per lease)
                    </td>
                    <td className="py-2 text-right font-mono">$12.00/SF</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-muted-foreground">
                      2025 actual operating expenses
                    </td>
                    <td className="py-2 text-right font-mono">$16.50/SF</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">
                      Recoverable from tenant (above base)
                    </td>
                    <td className="py-2 text-right font-mono font-medium">
                      $4.50/SF
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-muted-foreground">
                      Landlord absorbs (at or below base)
                    </td>
                    <td className="py-2 text-right font-mono text-destructive-strong">
                      $12.00/SF
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-muted-foreground">
                      Recovery ratio
                    </td>
                    <td className="py-2 text-right font-mono">27%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              This is why office recovery ratios are lower than NNN. The
              base-year structure is designed to protect tenants from absorbing
              the full operating cost burden.
            </p>
          </div>
          <p className="text-muted-foreground">
            Some landlords attempt to negotiate "grossed-up base years",
            adjusting the base year to reflect full occupancy, when renewing or
            extending leases. This can meaningfully change the above-stop
            amount.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The Vacancy Problem: Gross-Up in Office Buildings
          </h2>
          <p className="mb-4 text-muted-foreground">
            National office vacancy was approximately 19–20% in early 2026. Many
            Class B markets exceed 25% vacancy. Under standard gross-up
            provisions, when occupancy falls below the lease threshold (commonly
            90–95%), variable operating expenses should be grossed up to reflect
            what they would have been at full occupancy.
          </p>
          <p className="mb-4 text-muted-foreground">
            This is a critical protection for occupied tenants. Without
            gross-up, they effectively subsidize the vacant space by paying a
            full pro-rata share of expenses that are distributed across only
            occupied square footage. But gross-up is under-applied in
            high-vacancy office environments.
          </p>
          <div className="rounded-lg border bg-muted/30 p-6 mb-4">
            <h3 className="mb-4 font-semibold">
              Gross-Up Example: 75% Occupied Office
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  <tr>
                    <td className="py-2 text-muted-foreground">
                      Building: 100,000 RSF, 75% occupied (75,000 SF leased)
                    </td>
                    <td className="py-2 text-right font-mono"></td>
                  </tr>
                  <tr>
                    <td className="py-2 text-muted-foreground">
                      Actual variable CAM (janitorial, utilities - usage-based)
                    </td>
                    <td className="py-2 text-right font-mono">$450,000</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">
                      Grossed up to 95% occupancy: $450,000 × (95,000 / 75,000)
                    </td>
                    <td className="py-2 text-right font-mono font-medium">
                      $570,000
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-muted-foreground">
                      Additional recoverable expense from gross-up
                    </td>
                    <td className="py-2 text-right font-mono text-green-700">
                      +$120,000
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-muted-foreground">
            See{" "}
            <Link
              href="/resources/cam-gross-up-guide"
              className="text-primary underline"
            >
              the full gross-up guide
            </Link>{" "}
            for the complete mechanics, including which expenses are variable
            vs. fixed and how to document the gross-up calculation for tenant
            review.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Including HVAC capital replacements in the recoverable CAM
                    pool
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When a chiller or AHU is replaced, the capital cost may be
                    coded to a maintenance GL account rather than a capital
                    account. Unless it is caught in the expense classification
                    review, it flows through to tenants as an operating expense.
                    This is among the most common office CAM audit findings.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Not applying gross-up when occupancy falls below 90%
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    In a 20%-vacant building, the failure to gross up variable
                    expenses means occupied tenants pay less than they should
                    (because the pool is smaller than it would be at full
                    occupancy), and the landlord absorbs the difference. This is
                    a recoverable revenue gap that compounds across years of
                    high vacancy.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Applying the wrong base year in multi-term tenancies
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When a tenant exercises a renewal option, the base year may
                    reset to the first year of the renewal term, or it may stay
                    fixed at the original base year. This depends entirely on
                    the lease. Using the wrong base year (often the original one
                    when the renewal reset it) systematically overbills tenants
                    in renewal periods.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 font-semibold">
                What is included in office CAM charges?
              </h3>
              <p className="text-muted-foreground">
                Office CAM typically includes: HVAC for common areas (25–35% of
                CAM), janitorial for lobbies and corridors, elevator
                maintenance, security, common area utilities, and parking
                maintenance. It does not include HVAC replacements (capital),
                janitorial within leased suites, or tenant improvement costs.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is a base-year lease and how does it affect office CAM
                reconciliation?
              </h3>
              <p className="text-muted-foreground">
                A base-year lease sets a reference year for operating expenses.
                The tenant pays only the overage above the base year level. For
                a 2019 base-year lease in 2026, the tenant might pay $4.50/SF in
                above-base CAM while the landlord absorbs the base $12.00/SF
                within the base rent.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Is HVAC maintenance an operating expense or a capital expense?
              </h3>
              <p className="text-muted-foreground">
                Routine HVAC maintenance contracts are operating expenses -
                recoverable through CAM. Major component replacements
                (compressors, AHUs, chillers) are capital expenditures. Some
                leases allow amortization of capital HVAC work over its useful
                life, in which case only the annual amortization is billed.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is the typical CAM per SF for Class A office in 2026?
              </h3>
              <p className="text-muted-foreground">
                Class A office CAM runs $4–8/SF per year in 2026. Class B office
                ranges $3–6/SF. These figures have risen 20–30% from pre-2020
                levels due to HVAC upgrades, security cost increases, and higher
                labor rates.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                href: "/resources/cam-gross-up-guide",
                title: "CAM Gross-Up Guide",
                desc: "How to apply gross-up provisions correctly in high-vacancy office buildings",
              },
              {
                href: "/resources/q1-2026-office-vacancy-cam-gross-up",
                title: "Q1 2026 Office Vacancy & Gross-Up",
                desc: "Current vacancy rates and gross-up impact analysis",
              },
              {
                href: "/resources/cam-benchmarks-by-property-type",
                title: "CAM Benchmarks by Property Type",
                desc: "Office CAM per SF benchmarks vs. retail and industrial",
              },
              {
                href: "/cam-reconciliation-software",
                title: "CAM Reconciliation Software",
                desc: "How CapVeri handles base-year mechanics and gross-up for office portfolios",
              },
            ].map(({ href, title, desc }) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/30 transition-colors"
              >
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Catch Office CAM Errors Before Tenants Do
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri flags HVAC capital items in GL exports, applies gross-up
            automatically at the correct occupancy threshold, and validates
            base-year calculations against lease terms for every tenant in your
            office portfolio.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "office_cam_reconciliation_cta",
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
