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
    "CAM Reconciliation for Mixed-Use Properties: How to Allocate Shared Costs",
  description:
    "Mixed-use properties (retail + office, or retail + residential) have shared infrastructure and no single pro-rata methodology. Here's how to allocate CAM costs across uses and avoid the most common errors.",
  alternates: {
    canonical: `${SITE_URL}/resources/mixed-use-cam-reconciliation`,
  },
  openGraph: {
    title:
      "CAM Reconciliation for Mixed-Use Properties: How to Allocate Shared Costs",
    description:
      "Mixed-use properties have shared infrastructure and no single pro-rata methodology. Here's how to allocate CAM costs across uses and avoid the most common errors.",
    url: `${SITE_URL}/resources/mixed-use-cam-reconciliation`,
    type: "article",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "CAM Reconciliation for Mixed-Use Properties: How to Allocate Shared Costs",
  description:
    "How to allocate shared infrastructure costs in mixed-use properties across retail, office, and residential components - and avoid residential commingling errors.",
  url: `${SITE_URL}/resources/mixed-use-cam-reconciliation`,
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
      name: "How is CAM reconciliation different for mixed-use properties?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Mixed-use CAM reconciliation requires allocating shared building costs - lobby, elevators, parking, security, HVAC - across multiple use types that may have different lease structures and different recovery methodologies. The core challenge is that there is no single pro-rata methodology: retail tenants, office tenants, and residential units have different usage patterns and different contractual relationships with the landlord.",
      },
    },
    {
      "@type": "Question",
      name: "Can residential CAM costs be recovered from commercial tenants?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Residential common area costs (residential lobby maintenance, residential floor elevator usage, residential amenity areas) are not recoverable from commercial tenants, and commercial CAM costs are not recoverable from residential tenants. These pools must be completely separated in the GL and in the reconciliation. Commingling residential and commercial costs - even accidentally - is a significant audit risk for commercial tenants.",
      },
    },
    {
      "@type": "Question",
      name: "What allocation methods are used for shared costs in mixed-use buildings?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Three allocation approaches are common: (1) SF-based - divide shared costs proportionally by total square footage of each use; (2) intensity-based - allocate by estimated usage share (retail uses lobby less than office; residential uses parking more than retail); (3) fixed lease-defined percentages - the lease specifies cost-sharing percentages regardless of actual usage. SF-based is most common for simplicity; intensity-based is most defensible but requires documentation.",
      },
    },
    {
      "@type": "Question",
      name: "How are elevator costs allocated in a mixed-use building?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Elevator cost allocation in mixed-use buildings is typically done by floors served or by estimated trip frequency. A building where floors 1–3 are retail, floors 4–10 are office, and floors 11–20 are residential might allocate elevator costs: 15% retail, 35% office, 50% residential - based on floors served and estimated daily trips. The lease should specify the allocation methodology. When it doesn't, the landlord should use a defensible estimate and document the assumption.",
      },
    },
  ],
};

export default function MixedUseCamReconciliationPage() {
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
          <span className="text-foreground">Mixed-Use CAM Reconciliation</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Reconciliation for Mixed-Use Properties: How to Allocate Shared
            Costs
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Mixed-use properties combine retail, office, and/or residential uses
            under one structure. They share lobbies, elevators, parking, and
            mechanical systems that serve multiple tenants with different lease
            terms, different recovery rights, and different usage patterns.
            Reconciling shared costs correctly requires a clear allocation
            methodology for every shared system.
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
            Mixed-use CAM reconciliation requires allocating shared building
            expenses (HVAC, elevators, parking, security) across multiple use
            types with different lease structures and different recovery
            methodologies. The residential component must be completely
            separated from commercial CAM pools. Residential costs cannot be
            recovered from commercial tenants, and vice versa.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Mixed-Use Property Types
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">Retail + Office</h3>
              <p className="text-sm text-muted-foreground">
                Most common mixed-use structure. Ground floor retail with office
                above. Shared lobby, elevators, and parking structure. Both
                components are commercial, but they have different lease
                structures (NNN retail vs. modified gross office) and different
                expense profiles.
              </p>
            </div>
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">Retail + Residential</h3>
              <p className="text-sm text-muted-foreground">
                Urban mixed-use: street-level retail with residential apartments
                above. The residential component creates a strict separation
                requirement - residential costs must never appear in the
                commercial CAM pool.
              </p>
            </div>
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">
                Retail + Office + Residential
              </h3>
              <p className="text-sm text-muted-foreground">
                Full mixed-use development with three use types. Requires three
                separate CAM pools or a rigorous allocation schedule for every
                shared cost. Property management complexity is highest with this
                structure.
              </p>
            </div>
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">Office + Hotel</h3>
              <p className="text-sm text-muted-foreground">
                Less common but present in urban office towers. Shared
                conference facilities, parking, and lobby. Hotel costs are
                generally not recoverable from office tenants - the allocation
                must exclude hotel-specific expenses from the office CAM pool.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The Core Problem: Shared Infrastructure Costs
          </h2>
          <p className="mb-4 text-muted-foreground">
            Mixed-use buildings share physical systems that serve multiple use
            types simultaneously. Who pays for the lobby? The shared parking
            garage? The elevator that serves residential floors and office
            floors? These costs cannot be excluded from reconciliation - they
            are real, significant, and must be allocated in a defensible way.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold">
                    Shared System
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Allocation Basis (typical)
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Residential Excluded?
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Key Documentation Need
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-3">Lobby and entrance</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    SF or door count
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Separate lobbies if possible
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    SF per use type; lease methodology specification
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Elevators</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Floors served or estimated trips
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Residential floors allocated to residential
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Floors served by use; allocation percentage
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Parking structure</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Parking spaces by use or utilization study
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Residential parking separated
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Space count by use; lease parking ratios
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Security</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    SF or fixed lease percentage
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Residential security allocated separately
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Post locations and hours by use
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">HVAC (central plant)</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Sub-metering or SF by use
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Yes - residential not in commercial pool
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Sub-meter readings; allocation methodology
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Three Allocation Methodologies
          </h2>

          <div className="space-y-6">
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">(a) SF-Based Allocation</h3>
              <p className="mb-3 text-sm text-muted-foreground">
                Divide shared costs proportionally by the square footage of each
                use type. A 200,000 SF building with 60,000 SF retail and
                140,000 SF office allocates 30% of shared costs to retail and
                70% to office.
              </p>
              <div className="rounded bg-muted/30 p-3 text-sm font-mono">
                Retail allocation = 60,000 ÷ 200,000 = 30%
                <br />
                Office allocation = 140,000 ÷ 200,000 = 70%
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                <strong>Pros:</strong> Simple, auditable, objective.{" "}
                <strong>Cons:</strong> May not reflect actual usage - retail may
                use lobby differently than office.
              </p>
            </div>

            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">
                (b) Intensity-Based Allocation
              </h3>
              <p className="mb-3 text-sm text-muted-foreground">
                Allocate shared costs by estimated usage intensity for each
                system. Retail drives higher foot traffic through the lobby;
                residential occupants use parking more intensively than office
                workers in the evenings; office uses elevators more during
                business hours.
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Pros:</strong> More equitable in theory.{" "}
                <strong>Cons:</strong> Requires usage studies or assumptions
                that tenants may challenge. Must be documented before
                reconciliation.
              </p>
            </div>

            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">
                (c) Fixed Lease-Defined Percentages
              </h3>
              <p className="mb-3 text-sm text-muted-foreground">
                The lease defines cost-sharing percentages between uses,
                regardless of actual usage. For example: &quot;Retail component
                shall bear 40% of building operating costs; Office component
                shall bear 60%.&quot;
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Pros:</strong> Contractually clear, minimal dispute
                risk. <strong>Cons:</strong> Fixed percentages may become
                inequitable over time as usage patterns change. Most favorable
                when the percentages are defined in each tenant&apos;s lease.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Retail and Office Components: Different Reconciliation Rules
          </h2>
          <p className="mb-4 text-muted-foreground">
            After allocating shared costs, each component is reconciled under
            its own lease structure:
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 font-semibold text-sm">Retail Component</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• NNN lease structure typical</li>
                <li>• Annual CAM caps may apply</li>
                <li>• Pro-rata based on retail GLA</li>
                <li>
                  • Exterior expenses: parking, landscaping, exterior
                  maintenance
                </li>
                <li>• Interior mall expenses if enclosed retail component</li>
              </ul>
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 font-semibold text-sm">Office Component</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Modified gross lease typical</li>
                <li>• Base year / expense stop applies</li>
                <li>• Pro-rata based on office RSF</li>
                <li>• Interior focus: HVAC, janitorial, security</li>
                <li>• Allocated share of building-wide shared costs</li>
              </ul>
            </div>
          </div>
          <p className="mt-4 text-muted-foreground">
            The same tenant in a retail space cannot be reconciled using office
            methodology, and vice versa. Each use type&apos;s CAM pool is
            calculated from (1) use-specific direct expenses plus (2) its
            allocated share of shared building expenses.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The Residential Separation Requirement
          </h2>
          <p className="mb-4 text-muted-foreground">
            When a mixed-use property includes residential units, the
            residential component&apos;s costs must be completely isolated from
            the commercial CAM pool. Commercial tenants have no obligation to
            pay for residential amenities, and attempting to include residential
            costs in commercial reconciliation is a material billing error.
          </p>
          <div className="rounded-lg border bg-muted/30 p-5 mb-4">
            <h3 className="mb-3 font-semibold">
              Expenses that must NOT appear in commercial CAM:
            </h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>
                • Residential lobby and corridor maintenance (if separate from
                commercial lobby)
              </li>
              <li>
                • Residential amenity areas (gym, rooftop terrace, pool - if
                residential-only)
              </li>
              <li>• Residential parking (if dedicated residential parking)</li>
              <li>
                • Residential-floor elevator maintenance proportionate share
              </li>
              <li>• Residential unit maintenance (plumbing, HVAC)</li>
              <li>
                • Residential property management fees (management of the
                residential leasing operation)
              </li>
            </ul>
          </div>
          <p className="text-muted-foreground">
            If the property is operated by a single property management company
            that handles both commercial and residential, the risk of
            commingling is highest. The GL should have a clear cost center
            separation between residential and commercial operating expenses.
            Without it, residential costs naturally flow into the commercial
            pool and appear in tenant reconciliation statements.
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
                    Commingling residential maintenance costs with commercial
                    CAM
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When a single PM company manages both components and uses a
                    unified GL, residential costs routinely flow into the
                    commercial pool unless cost centers are strictly enforced.
                    Amenity costs for residential-only features (fitness center,
                    dog wash stations, rooftop lounge) appearing in commercial
                    CAM statements are immediately flagged by tenant auditors.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Using total building SF as the denominator when uses have
                    different recoverable pools
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If the retail pool covers only retail-specific and allocated
                    shared costs, the denominator for retail reconciliation
                    should be total retail GLA - not total building SF including
                    residential. Using the full building SF denominator
                    understates each retail tenant&apos;s pro-rata share and
                    underbills the commercial component.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    HVAC allocation not matching lease terms
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Mixed-use buildings often have central HVAC plants that
                    serve all uses. If the lease specifies that commercial
                    tenants pay a defined percentage of central plant costs but
                    the reconciliation uses sub-meter readings (which may
                    diverge from the lease percentage), the reconciliation is
                    non-compliant regardless of whether the math is otherwise
                    correct.
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
                How is CAM reconciliation different for mixed-use properties?
              </h3>
              <p className="text-muted-foreground">
                Mixed-use CAM requires allocating shared costs across multiple
                use types with different lease structures and different recovery
                methodologies. The residential component must be completely
                separated from commercial pools. There is no single pro-rata
                methodology - each use type has its own pool and denominator.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Can residential CAM costs be recovered from commercial tenants?
              </h3>
              <p className="text-muted-foreground">
                No. Residential common area costs are not recoverable from
                commercial tenants. The two pools must be completely separated
                in the GL and in the reconciliation. Commingling is a material
                billing error and a significant tenant audit risk.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What allocation methods are used for shared costs?
              </h3>
              <p className="text-muted-foreground">
                Three approaches: (1) SF-based - proportional to square footage
                of each use; (2) intensity-based - proportional to estimated
                usage share per system; (3) fixed lease-defined percentages -
                lease specifies cost-sharing regardless of actual usage.
                SF-based is most common; lease-defined is most defensible.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How are elevator costs allocated in a mixed-use building?
              </h3>
              <p className="text-muted-foreground">
                Typically by floors served or estimated trip frequency. A
                building with retail on floors 1–3, office on 4–10, and
                residential on 11–20 might allocate elevator costs by the number
                of floors each use occupies, adjusted by estimated trip counts.
                The lease should specify the methodology.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                href: "/resources/cam-benchmarks-by-property-type",
                title: "CAM Benchmarks by Property Type",
                desc: "Mixed-use CAM benchmarks and comparison to pure-use property types",
              },
              {
                href: "/resources/operating-expense-reconciliation-commercial-lease",
                title: "Operating Expense Reconciliation Handbook",
                desc: "Complete OE reconciliation across all four expense categories",
              },
              {
                href: "/resources/pro-rata-share-validation",
                title: "Pro-Rata Share Validation",
                desc: "How to verify denominator and pool calculations in complex properties",
              },
              {
                href: "/resources/retail-cam-reconciliation",
                title: "Retail CAM Reconciliation",
                desc: "Reconciliation mechanics for the retail component of mixed-use properties",
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
            Reconcile Mixed-Use Properties Without Commingling Risk
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri keeps retail, office, and residential expenses in separate
            pools so every tenant is billed only what their lease allows.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "mixed_use_cam_reconciliation_cta",
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
