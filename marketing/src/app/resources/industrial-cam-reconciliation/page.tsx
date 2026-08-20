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
    "CAM Reconciliation for Industrial Properties: NNN Simplicity vs. Multi-Tenant Complexity",
  description:
    "Industrial CAM is simpler than office or retail. Multi-tenant industrial parks have unique challenges. Here is how to reconcile CAM for warehouse, distribution, and flex industrial properties.",
  alternates: {
    canonical: `${SITE_URL}/resources/industrial-cam-reconciliation`,
  },
  openGraph: {
    title:
      "CAM Reconciliation for Industrial Properties: NNN Simplicity vs. Multi-Tenant Complexity",
    description:
      "Industrial CAM is simpler than office or retail. Multi-tenant industrial parks have unique challenges. Here is how to reconcile CAM for warehouse, distribution, and flex industrial properties.",
    url: `${SITE_URL}/resources/industrial-cam-reconciliation`,
    type: "article",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "CAM Reconciliation for Industrial Properties: NNN Simplicity vs. Multi-Tenant Complexity",
  description:
    "Industrial CAM reconciliation: single-tenant NNN mechanics, multi-tenant park pro-rata, dock and drive court classification, and flex industrial expense profiles. For landlords and property managers.",
  url: `${SITE_URL}/resources/industrial-cam-reconciliation`,
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
      name: "What is included in industrial CAM charges?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Industrial CAM for multi-tenant parks primarily covers shared drive courts and parking areas (paving, striping, lighting), landscaping, perimeter fencing and security, trash enclosures, and shared utility infrastructure. Unlike office and retail, industrial CAM rarely includes interior common area HVAC or janitorial - each industrial unit has its own systems and tenants handle their own suite maintenance.",
      },
    },
    {
      "@type": "Question",
      name: "Do single-tenant NNN industrial tenants need a CAM reconciliation?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "In an absolute NNN industrial lease, the tenant maintains the property directly and there is minimal reconciliation. However, property taxes and insurance still require annual reconciliation statements to confirm actual vs. estimated payments. Even without full CAM reconciliation, maintaining a documentation file for tax and insurance payments protects both parties from future disputes.",
      },
    },
    {
      "@type": "Question",
      name: "Is dock leveler replacement an operating expense or capital expense?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Dock leveler maintenance and repair is an operating expense - recoverable through CAM. Replacement of the entire dock leveler system is typically a capital expenditure. The distinction matters: if the lease excludes capital expenditures, full dock leveler replacement costs cannot be billed to tenants. Some leases permit amortization of equipment replacement capital over useful life.",
      },
    },
    {
      "@type": "Question",
      name: "What is a typical CAM per SF for multi-tenant industrial parks?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Multi-tenant industrial park CAM typically runs $1–3/SF per year. Flex industrial with some office component ranges $2–4/SF. These are significantly lower than office ($4–8/SF) and retail ($3–6/SF) because industrial common areas are simpler: no HVAC in common areas, minimal janitorial, and the expense profile is dominated by outdoor maintenance.",
      },
    },
  ],
};

export default function IndustrialCamReconciliationPage() {
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
          <span className="text-foreground">Industrial CAM Reconciliation</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Reconciliation for Industrial Properties: NNN Simplicity vs.
            Multi-Tenant Complexity
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Industrial properties have the simplest CAM profiles of any property
            type. Multi-tenant industrial parks have their own reconciliation
            challenges around drive court classification, dock maintenance, and
            the OpEx/CapEx line. Here is what industrial landlords need to know.
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
            Single-tenant NNN industrial leases have minimal CAM complexity -
            the tenant often pays direct; the landlord reconciles property tax
            and insurance only. Multi-tenant industrial parks have the same
            pro-rata mechanics as retail but with a different expense profile:
            no common area HVAC, minimal janitorial, and higher proportions of
            outdoor maintenance (drive courts, parking, dock areas).
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Industrial Property Types and CAM Profiles
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold">Type</th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Common Lease Structure
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    CAM/SF Range
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Landlord CAM Role
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Single-tenant warehouse / distribution
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Absolute NNN
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    $0 (tenant pays direct)
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Document tax and insurance only
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Multi-tenant industrial park
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">NNN</td>
                  <td className="px-4 py-3 text-muted-foreground">$1–3</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Full annual reconciliation
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Flex industrial</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    NNN or modified gross
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">$2–4</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Full reconciliation; includes some interior CAM
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Cold storage / specialized
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">NNN</td>
                  <td className="px-4 py-3 text-muted-foreground">$2–5</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Refrigeration system maintenance classification critical
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Single-Tenant NNN Industrial: What Reconciliation Covers
          </h2>
          <p className="mb-4 text-muted-foreground">
            Under an absolute NNN structure, the tenant is responsible for
            maintaining the property - including the building envelope, dock
            equipment, roof maintenance, and all interior systems. The landlord
            typically collects:
          </p>
          <ul className="space-y-2 text-muted-foreground mb-4">
            <li>
              <strong>Base rent:</strong> Fixed per the lease schedule.
            </li>
            <li>
              <strong>Property taxes:</strong> Tenant pays directly or
              reimburses landlord based on actual tax bills. Annual
              reconciliation confirms the correct amount for the lease year.
            </li>
            <li>
              <strong>Insurance:</strong> Tenant maintains their own property
              and liability insurance. Landlord may carry a lender-required
              policy and bill the tenant for it per the lease.
            </li>
          </ul>
          <p className="text-muted-foreground">
            The reconciliation for single-tenant absolute NNN is straightforward
            - but do not skip it. Without a reconciliation statement, disputes
            about whether the tenant was billed correctly for taxes and
            insurance are difficult to resolve. The statement also resets the
            tenant audit window for those components.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Multi-Tenant Industrial Parks: The Expense Profile
          </h2>
          <p className="mb-4 text-muted-foreground">
            Multi-tenant industrial parks have shared infrastructure that
            requires active management and reconciliation. The expense profile
            is dominated by outdoor maintenance - which makes it simpler than
            retail but still requires careful classification.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 font-semibold text-sm">
                Typical recoverable expenses
              </h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Drive court and parking lot maintenance</li>
                <li>• Parking and dock area lighting</li>
                <li>• Landscaping and irrigation</li>
                <li>• Perimeter fencing and gates</li>
                <li>• Shared trash enclosures</li>
                <li>• Property management fees</li>
                <li>• Shared utility infrastructure (site lighting power)</li>
              </ul>
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 font-semibold text-sm">
                Generally not recoverable
              </h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Interior HVAC for individual units</li>
                <li>• Janitorial within leased spaces</li>
                <li>• Structural building repairs</li>
                <li>• Complete drive court resurfacing (CapEx)</li>
                <li>• Dock leveler replacement (CapEx)</li>
                <li>• Roof replacement</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Dock and Drive Court: The OpEx/CapEx Line
          </h2>
          <p className="mb-4 text-muted-foreground">
            Dock equipment and drive courts are the most common OpEx/CapEx
            classification dispute in industrial CAM reconciliation. The
            principles are consistent with other property types, but the
            specific items are industrial-specific:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold">Item</th>
                  <th className="px-4 py-3 text-left font-semibold">
                    OpEx or CapEx?
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Recoverable?
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-3">Dock leveler service and repair</td>
                  <td className="px-4 py-3 text-muted-foreground">OpEx</td>
                  <td className="px-4 py-3 text-green-700 font-medium">Yes</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Annual maintenance contracts
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Dock leveler replacement</td>
                  <td className="px-4 py-3 text-muted-foreground">CapEx</td>
                  <td className="px-4 py-3 text-destructive-strong font-medium">
                    Usually no
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Some leases allow amortization
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    Drive court sealing and striping
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">OpEx</td>
                  <td className="px-4 py-3 text-green-700 font-medium">Yes</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Routine maintenance
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    Drive court full resurfacing (2+ inches)
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">CapEx</td>
                  <td className="px-4 py-3 text-destructive-strong font-medium">
                    Usually no
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Extends useful life significantly
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    Pothole repair and crack filling
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">OpEx</td>
                  <td className="px-4 py-3 text-green-700 font-medium">Yes</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Preventive maintenance
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    Parking lot lighting replacement
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    OpEx (bulbs); CapEx (poles/fixtures)
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Depends on scope
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    LED conversions are often CapEx
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            The general test: does the work restore the asset to its prior
            condition (OpEx) or meaningfully extend its useful life or add new
            capability (CapEx)? When in doubt, err toward CapEx classification.
            Tenant auditors will challenge anything that looks like a capital
            improvement billed as maintenance.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Flex Industrial: The Hybrid Challenge
          </h2>
          <p className="mb-4 text-muted-foreground">
            Flex industrial properties include an office component (typically
            10–30% of the unit is finished office space) in addition to the
            warehouse/light industrial area. This changes the CAM profile:
          </p>
          <ul className="space-y-2 text-muted-foreground">
            <li>
              <strong>HVAC:</strong> The office portion typically has HVAC
              separate from the warehouse. Maintenance for the office HVAC is
              OpEx; replacement is CapEx. The classification rules are the same
              as office buildings.
            </li>
            <li>
              <strong>Janitorial:</strong> Common areas in flex parks (lobbies,
              corridors connecting multi-unit buildings) may require common area
              janitorial - a cost not present in pure warehouse parks.
            </li>
            <li>
              <strong>Lease structure:</strong> Flex leases may be modified
              gross rather than full NNN - particularly for smaller tenants
              (2,000–5,000 SF office/flex). Confirm the recovery structure per
              lease before applying full NNN reconciliation.
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Including drive court resurfacing in the CAM pool as a
                    maintenance expense
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A full resurfacing project (milling and repaving) for a
                    multi-tenant park&apos;s drive courts can run $200,000–
                    $500,000. If it is coded as maintenance and billed through
                    CAM in a single year, the spike is immediately visible in
                    tenant statements and typically triggers audits. Confirm
                    scope and classify correctly before including.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Not issuing reconciliation statements for single-tenant NNN
                    properties
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Some landlords skip year-end reconciliation for
                    single-tenant absolute NNN properties because &ldquo;the
                    tenant pays everything directly.&rdquo; Without a statement,
                    disputes about property tax allocation or insurance premium
                    allocation cannot be resolved cleanly - and the
                    tenant&apos;s audit right never starts to run.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Treating all units in a flex park identically when lease
                    structures vary
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A flex industrial park may have some full NNN tenants and
                    some modified gross tenants - often as a result of different
                    leasing cycles. Applying the full NNN reconciliation to a
                    modified gross tenant overbills them. Each lease must be
                    read separately.
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
                What is included in industrial CAM charges?
              </h3>
              <p className="text-muted-foreground">
                Industrial CAM covers shared drive courts and parking
                maintenance, landscaping, perimeter fencing, parking and dock
                lighting, shared trash enclosures, and property management fees.
                It does not include interior HVAC (tenant-specific), janitorial
                within units, or capital improvements.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Do single-tenant NNN industrial tenants need a CAM
                reconciliation?
              </h3>
              <p className="text-muted-foreground">
                Absolute NNN tenants handle most costs directly, so there is
                minimal CAM reconciliation. However, property taxes and
                insurance still require annual statements to confirm amounts and
                reset the tenant audit window.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Is dock leveler replacement an operating expense or capital
                expense?
              </h3>
              <p className="text-muted-foreground">
                Dock leveler maintenance and repair is operating expense -
                recoverable. Replacement of the entire dock leveler system is
                capital and generally not immediately recoverable. Some leases
                allow amortization of capital equipment over its useful life.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is a typical CAM per SF for multi-tenant industrial parks?
              </h3>
              <p className="text-muted-foreground">
                Multi-tenant industrial park CAM typically runs $1–3/SF per
                year. Flex industrial with an office component ranges $2–4/SF.
                Both are significantly lower than office ($4–8/SF) and retail
                ($3–6/SF) due to the simpler common area profile.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                href: "/resources/nnn-reconciliation",
                title: "NNN Reconciliation Guide",
                desc: "Full NNN reconciliation mechanics for property taxes, insurance, and CAM",
              },
              {
                href: "/resources/q1-2026-industrial-vacancy-cam-estimates",
                title: "Q1 2026 Industrial Vacancy & CAM Estimates",
                desc: "Current vacancy trends and their impact on industrial CAM estimates",
              },
              {
                href: "/resources/cam-benchmarks-by-property-type",
                title: "CAM Benchmarks by Property Type",
                desc: "Industrial CAM per SF benchmarks vs. office and retail",
              },
              {
                href: "/cam-reconciliation-software",
                title: "CAM Reconciliation Software",
                desc: "How CapVeri handles NNN reconciliation for industrial portfolios",
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
            Run Accurate Industrial CAM for Any Portfolio Size
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri handles the full range of industrial lease structures, from
            absolute NNN documentation to multi-tenant park reconciliation with
            complex OpEx/CapEx classification.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "industrial_cam_reconciliation_cta",
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
