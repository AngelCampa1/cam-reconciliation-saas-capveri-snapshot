import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle,
  ChevronRight,
  FileText,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Anchor Exclusion and Denominator Risk in Retail CAM",
  description:
    "When anchor tenants are excluded from the CAM denominator, all other tenants' pro-rata shares increase. Here's how anchor exclusions work, why they create denominator risk, and how to manage it.",
  alternates: {
    canonical: `${SITE_URL}/resources/anchor-exclusion-denominator-risk`,
  },
  openGraph: {
    title: "Anchor Exclusion and Denominator Risk in Retail CAM",
    description:
      "When anchor tenants are excluded from the CAM denominator, all other tenants' pro-rata shares increase. Here's how anchor exclusions work, why they create denominator risk, and how to manage it.",
    url: `${SITE_URL}/resources/anchor-exclusion-denominator-risk`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is an anchor exclusion in retail CAM?",
    answer:
      "An anchor exclusion removes a large tenant (typically a grocery store, department store, or big-box retailer) from the CAM expense pool, the CAM denominator, or both. When excluded from the denominator, all remaining (inline) tenants' pro-rata shares are calculated on a smaller base, resulting in higher individual pro-rata percentages than if the anchor were included.",
  },
  {
    question: "Why do anchor tenants get CAM exclusions?",
    answer:
      "Anchor tenants have significant negotiating power. They drive traffic that makes the center viable for inline tenants. In exchange for signing long-term leases that anchor the center, they typically negotiate self-maintenance rights (they maintain their own space and surrounding areas), which justifies their exclusion from the CAM expense pool. Some anchors also negotiate to be excluded from the denominator, which increases other tenants' CAM exposure.",
  },
  {
    question:
      "What happens to inline tenant pro-rata shares when an anchor vacates?",
    answer:
      "When an anchor vacates, its space becomes vacant. Depending on how the anchor exclusion clause in inline leases is worded, the inline tenants' denominators may or may not change. If the exclusion clause ties the exclusion to the anchor's tenancy, the anchor SF returns to the denominator when the anchor vacates - actually reducing inline tenant pro-rata shares. If the exclusion is permanent regardless of occupancy, the denominator stays small even after vacancy, and inline tenants still pay elevated shares while the anchor space sits empty.",
  },
  {
    question:
      "What due diligence should buyers perform on anchor exclusion clauses?",
    answer:
      "When acquiring a retail center, verify: (1) which tenants are identified as anchors in inline tenant leases; (2) whether the exclusion covers the expense pool, denominator, or both; (3) whether the exclusion is permanent or conditioned on the anchor's continued occupancy; (4) what happens to the denominator if the anchor space is subdivided or re-tenanted with multiple inline tenants; and (5) whether any anchor exclusions create situations where inline tenant pro-rata percentages sum to more than their proportionate SF of the non-anchor space.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Anchor Exclusion and Denominator Risk",
    url: `${SITE_URL}/resources/anchor-exclusion-denominator-risk`,
  },
]);

export default function AnchorExclusionDenominatorRiskPage() {
  return (
    <>
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />
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
            Anchor Exclusion and Denominator Risk
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Anchor Exclusion and Denominator Risk in Retail CAM
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            How anchor tenant exclusions work, why they concentrate CAM cost
            risk in inline tenants, and what happens to the denominator when an
            anchor vacates. Includes worked examples and due diligence guidance.
          </p>
          <p className="text-sm text-muted-foreground">
            By{" "}
            <Link
              href="/about/angel-campa"
              className="text-foreground hover:underline"
            >
              Angel Campa, Founder, CapVeri
            </Link>
            {""}· Updated April 2026
          </p>
        </header>

        {/* Quick Answer */}
        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">Quick Answer</h2>
          <p className="text-muted-foreground">
            Anchor exclusions remove a large tenant (typically a grocery,
            department store, or big-box retailer) from the CAM expense pool,
            the denominator, or both. When excluded from the denominator, all
            remaining tenants&apos; pro-rata shares are calculated on a smaller
            base, resulting in higher individual shares than if the anchor were
            included. This is deliberate when the anchor is active, but becomes
            a significant risk when the anchor vacates while the exclusion
            clause remains in inline leases.
          </p>
        </div>

        {/* How Anchor Exclusions Work */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            How Anchor Exclusions Work
          </h2>
          <p className="mb-4 text-muted-foreground">
            In most retail center structures, major anchor tenants negotiate
            self-maintenance rights as a condition of their long-term lease
            commitment. The anchor maintains its own building pad, parking
            areas, and in some cases perimeter landscaping - independently of
            the CAM pool. Because the anchor funds its own maintenance, it is
            excluded from contributing to (and therefore from being billed
            under) the common area maintenance pool.
          </p>
          <p className="mb-4 text-muted-foreground">
            The exclusion is memorialized in the inline tenants&apos; leases -
            not just the anchor&apos;s lease. The inline lease says, in effect:
            &ldquo;Tenant&apos;s pro-rata share is calculated excluding the
            following anchor spaces from the denominator: [list of anchor
            parcels].&rdquo;
          </p>
          <p className="text-muted-foreground">
            The two types of exclusions produce different financial effects:
          </p>
        </section>

        {/* Two Types of Exclusions */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The Two Types of Anchor Exclusions
          </h2>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <p className="mb-2 font-semibold">
                Type A: Excluded from Expense Pool AND Denominator
              </p>
              <p className="text-sm text-muted-foreground">
                The anchor does not contribute to CAM (expense pool exclusion)
                and is not counted in the denominator. Inline tenants pay a
                higher pro-rata share of a smaller expense pool. The net effect
                on inline tenants depends on whether the anchor would have
                contributed meaningful CAM charges relative to its SF.
              </p>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <p className="mb-2 font-semibold text-destructive-strong">
                Type B: Excluded from Denominator Only (Higher Risk)
              </p>
              <p className="text-sm text-muted-foreground">
                More common and more impactful: the anchor is excluded from the
                denominator but its areas are still maintained by the landlord
                (using inline CAM funds). Inline tenants pay a higher pro-rata
                share of a full expense pool that includes areas the anchor does
                not fund. This is the structure that creates the most
                denominator risk.
              </p>
            </div>
          </div>
        </section>

        {/* Concrete Example */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Worked Example: Power Center with Anchor Exclusion
          </h2>
          <div className="mb-4 rounded-lg border p-4">
            <p className="mb-2 font-medium text-sm">Center profile:</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Total center RSF: 500,000 SF</li>
              <li>
                Anchor A (grocery): 120,000 SF - excluded from denominator
              </li>
              <li>12 inline tenants: 380,000 SF total</li>
              <li>Annual total CAM expenses: $1,500,000</li>
              <li>Tenant X occupies 10,000 SF</li>
            </ul>
          </div>

          <div className="mb-6 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-semibold">Scenario</th>
                  <th className="p-3 text-right font-semibold">Denominator</th>
                  <th className="p-3 text-right font-semibold">
                    Tenant X Pro-Rata
                  </th>
                  <th className="p-3 text-right font-semibold">
                    Tenant X Annual CAM
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-3">No anchor exclusion</td>
                  <td className="p-3 text-right">500,000 SF</td>
                  <td className="p-3 text-right">2.000%</td>
                  <td className="p-3 text-right font-medium">$30,000</td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-3 font-medium text-destructive-strong">
                    Anchor excluded from denominator
                  </td>
                  <td className="p-3 text-right">380,000 SF</td>
                  <td className="p-3 text-right font-medium text-destructive-strong">
                    2.632%
                  </td>
                  <td className="p-3 text-right font-medium text-destructive-strong">
                    $39,474
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-muted-foreground">
            The anchor exclusion increases Tenant X&apos;s pro-rata share from
            2.000% to 2.632%, a{""}
            <strong>31.6% increase in their CAM obligation</strong> attributable
            entirely to the denominator change. Tenant X now pays $39,474
            instead of $30,000: an additional $9,474 per year on a 10,000 SF
            space. Across a 10-year lease, this is nearly $95,000 in incremental
            CAM burden from the anchor exclusion alone.
          </p>
          <p className="mt-4 text-muted-foreground">
            This is the correct and intended outcome while the anchor is present
            and generating traffic that benefits inline tenants. The risk
            emerges when the anchor vacates.
          </p>
        </section>

        {/* Vacancy Risk */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Denominator Risk: What Happens When the Anchor Vacates
          </h2>
          <p className="mb-4 text-muted-foreground">
            The anchor exclusion clause in inline leases creates significant
            denominator risk in the event of anchor vacancy. The specific risk
            depends on how the clause is worded:
          </p>

          <div className="space-y-4">
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
              <p className="mb-1 font-medium text-green-700">
                Tenant-Protective Language: Exclusion Tied to Occupancy
              </p>
              <p className="text-sm text-muted-foreground">
                If the inline lease states: &ldquo;[Anchor A] shall be excluded
                from the denominator for so long as [Anchor A] occupies its
                premises under a lease with Landlord,&rdquo; the exclusion
                terminates when the anchor vacates. The anchor&apos;s SF returns
                to the denominator, and inline tenant pro-rata shares
                automatically decrease. This is tenant-protective and is the
                version inline tenants should push for.
              </p>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <p className="mb-1 font-medium text-destructive-strong">
                Landlord/Anchor Favorable Language: Permanent Exclusion
              </p>
              <p className="text-sm text-muted-foreground">
                If the inline lease states: &ldquo;[Anchor A&apos;s] Parcel
                shall be permanently excluded from the Building&apos;s
                denominator,&rdquo; the exclusion persists even after the anchor
                vacates. Inline tenants continue to pay the elevated pro-rata
                shares based on the 380,000 SF denominator - for space the
                anchor no longer occupies and for which no traffic benefit is
                delivered. This is the maximum denominator risk scenario.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border p-4 text-sm">
            <p className="font-medium">Vacancy Impact Example</p>
            <p className="mt-2 text-muted-foreground">
              Using the example above: Anchor A (120,000 SF) vacates. The center
              now operates at 380,000 SF of occupancy, but maintenance costs for
              the entire 500,000 SF site remain largely the same (parking lot,
              security, lighting). Under a permanent exclusion clause, Tenant X
              still pays 2.632% of the full $1,500,000 expense pool =
              $39,474/year. Under an occupancy-based exclusion, Tenant X now
              pays 10,000 &divide; 500,000 = 2.000% = $30,000/year. The
              difference: $9,474/year in additional burden Tenant X bears under
              the permanent exclusion - for a space that is now contributing no
              traffic.
            </p>
          </div>
        </section>

        {/* Operational Impact */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Operational Impacts When an Anchor Vacates
          </h2>
          <p className="mb-4 text-muted-foreground">
            Beyond the denominator issue, anchor vacancy creates secondary CAM
            impacts:
          </p>
          <ul className="mb-4 space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                The anchor previously maintained its own pad and surrounding
                areas. After vacancy, the landlord may absorb those maintenance
                costs into the general CAM pool - increasing total recoverable
                expenses.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                Security and lighting costs for the vacant anchor pad continue -
                the landlord must maintain the dark store to prevent
                deterioration and preserve re-tenanting optionality.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                Inline tenants may have co-tenancy clauses tied to the
                anchor&apos;s operation - granting them reduced rent or
                termination rights if the anchor vacates. This creates a
                cascading risk where anchor vacancy triggers inline tenant
                departures, further concentrating CAM cost among fewer remaining
                tenants.
              </span>
            </li>
          </ul>
        </section>

        {/* Due Diligence */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Acquisition Due Diligence for Anchor Exclusion Clauses
          </h2>
          <p className="mb-4 text-muted-foreground">
            When acquiring a retail center, anchor exclusion clauses in inline
            leases require dedicated due diligence:
          </p>
          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <div>
                  <p className="font-medium text-sm">
                    Identify Which Tenants Are Named as Anchors in Each Inline
                    Lease
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The exclusion is in the inline tenant&apos;s lease, not just
                    the anchor&apos;s. Pull every inline lease and identify the
                    specific anchor exclusion language - the tenant name, the
                    parcel description, and the conditions (permanent or
                    occupancy-based).
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <div>
                  <p className="font-medium text-sm">
                    Quantify the Denominator Impact for Each Inline Tenant
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    For each anchor exclusion, calculate the current pro-rata
                    shares with exclusion vs. what they would be without
                    exclusion. This tells you how much CAM cost the inline
                    tenants are absorbing on behalf of the anchor - and what
                    changes if the anchor vacates.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <div>
                  <p className="font-medium text-sm">
                    Review Anchor Lease Terms for Remaining Obligation
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How much time remains on the anchor lease? What are the
                    renewal options? Is the anchor paying a minimum rent that
                    covers any CAM contribution, or are they paying a nominal
                    amount? Anchor credit quality and lease term are directly
                    related to the denominator risk premium you should price
                    into the acquisition.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <div>
                  <p className="font-medium text-sm">
                    Model the Vacancy Scenario
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Build a pro forma that models CAM economics under anchor
                    vacancy: revised denominators (permanent vs. occupancy-based
                    exclusion), increased CAM pool from absorbing anchor-area
                    maintenance, co-tenancy risk triggering inline departures.
                    This is the stress test for any retail center acquisition.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What Can Go Wrong */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Applying the Wrong Denominator After Anchor Vacancy
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When an anchor vacates, the denominator for each inline
                    tenant depends on the specific language in their lease - not
                    a building-wide rule. If one inline tenant has an
                    occupancy-based exclusion (denominator increases after
                    vacancy) and another has a permanent exclusion (denominator
                    stays reduced), applying the same denominator to both is a
                    billing error. Property management systems often cannot
                    handle per-tenant denominator adjustments triggered by
                    third-party vacancy events.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Charging Inline Tenants for Anchor-Area Maintenance That
                    Anchor Previously Funded
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When the anchor maintained its own areas under a
                    self-maintenance obligation, those costs were never in the
                    CAM pool. After anchor vacancy, the landlord absorbs those
                    maintenance costs - but whether those costs can be pushed
                    into the inline tenant CAM pool depends on lease language.
                    If the anchor&apos;s parcel is excluded from the
                    denominator, it may be excluded from the expense pool as
                    well. Charging inline tenants for anchor-area maintenance in
                    that scenario is a billing error.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Failing to Update the Denominator When the Anchor Space Is
                    Subdivided
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When a former anchor space is subdivided and re-tenanted
                    with multiple inline tenants, the exclusion clause may no
                    longer apply - the new tenants are not the named anchor. If
                    the property management system continues to apply the anchor
                    exclusion to the denominator after re-tenanting, inline
                    tenant pro-rata shares remain elevated when they should have
                    normalized. The new inline tenants who occupy the former
                    anchor space will also have their own (typically larger)
                    denominators, compounding the inconsistency.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-lg font-medium">
                What is an anchor exclusion in retail CAM?
              </h3>
              <p className="text-muted-foreground">
                An anchor exclusion removes a major tenant from the CAM
                denominator, the expense pool, or both. When excluded from the
                denominator, all remaining tenants&apos; pro-rata shares are
                calculated on a smaller base, increasing each inline
                tenant&apos;s individual share.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                Why do anchor tenants get CAM exclusions?
              </h3>
              <p className="text-muted-foreground">
                Anchor tenants negotiate self-maintenance rights in exchange for
                long-term lease commitments that anchor the center. Because they
                fund their own maintenance, they are excluded from the CAM pool.
                The denominator exclusion is often an additional concession the
                anchor negotiates to protect itself from over-contributing to
                pool expenses.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What happens to inline shares when an anchor vacates?
              </h3>
              <p className="text-muted-foreground">
                It depends on the exclusion clause language. If the exclusion is
                tied to the anchor&apos;s occupancy, the anchor SF returns to
                the denominator and inline shares normalize. If the exclusion is
                permanent, inline shares stay elevated even as the anchor
                delivers no traffic. Permanent exclusions are the higher-risk
                scenario for inline tenants and for buyers of retail centers
                with aging anchors.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What due diligence should buyers perform on anchor exclusions?
              </h3>
              <p className="text-muted-foreground">
                Review every inline lease for exclusion language, quantify the
                denominator impact per tenant, model the vacancy scenario using
                both permanent and occupancy-based exclusion outcomes, and
                review the anchor&apos;s remaining lease term and renewal
                options. The gap between the &ldquo;anchor present&rdquo; and
                &ldquo;anchor absent&rdquo; CAM economics should be priced into
                any acquisition.
              </p>
            </div>
          </div>
        </section>

        {/* Related Resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/pro-rata-denominator-explained"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Pro-Rata Denominator Explained
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How denominator definitions vary by lease type and
                    exclusion.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/pro-rata-share-validation"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Pro-Rata Share Validation Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How to validate pro-rata shares including anchor exclusions.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/retail-cam-reconciliation"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Retail CAM Reconciliation Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How retail CAM structures differ from office and industrial.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/tools/pro-rata-calculator"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Pro-Rata Calculator
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Calculate pro-rata shares with and without anchor
                    exclusions.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/cam-reconciliation-software"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50 sm:col-span-2"
            >
              <div className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Reconciliation Software
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Automated retail CAM verification with anchor exclusion
                    handling.
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Verify Anchor Exclusion Calculations Across Your Retail Portfolio
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri checks pro-rata denominators against the exclusion clauses
            in each inline tenant&apos;s lease - finding misapplied
            denominators, incorrect post-vacancy shares, and re-tenanting
            updates that were never reflected in the billing system.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "anchor_exclusion_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
