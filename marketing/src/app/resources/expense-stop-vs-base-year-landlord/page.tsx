import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronRight,
  FileText,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Expense Stop vs. Base Year for Landlords: Which Structure Favors You",
  description:
    "Expense stops and base years both shift operating expense risk to tenants, but they work very differently. This guide compares both structures from the landlord's perspective, with examples.",
  alternates: {
    canonical: `${SITE_URL}/resources/expense-stop-vs-base-year-landlord`,
  },
  openGraph: {
    title:
      "Expense Stop vs. Base Year for Landlords: Which Structure Favors You",
    description:
      "Expense stops and base years both shift operating expense risk to tenants, but they work very differently. Compare both structures from the landlord's perspective, with worked examples.",
    url: `${SITE_URL}/resources/expense-stop-vs-base-year-landlord`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "Is a base year stop or expense stop better for landlords?",
    answer:
      "Neither is universally better. A base year stop is more favorable for landlords when operating costs are rising - because the threshold is anchored to historical lower costs, making more of current expenses recoverable. A fixed expense stop is simpler to administer and may be preferable when operating costs are predictable and the tenant has strong negotiating power. In a high-inflation environment, a base year that was set in a low-cost year produces the most landlord revenue.",
  },
  {
    question:
      "Can a building have some leases with base year stops and others with expense stops?",
    answer:
      "Yes, and this is common in buildings with tenants who signed leases at different times. Managing a mixed portfolio requires maintaining separate expense reconciliations for each lease structure. This is one reason property management systems with flexible lease abstraction - and verification tools that check each lease's actual terms - are important for multi-tenant buildings with diverse lease vintages.",
  },
  {
    question:
      "What happens to the base year stop if operating costs decline significantly?",
    answer:
      "If current year operating costs fall below the base year threshold, the tenant pays nothing on the operating expense line - the landlord absorbs the entire cost. The base year does not ratchet down with cost reductions. This is one scenario where a base year stop is more favorable to tenants than a fixed expense stop - the tenant gets the full benefit of cost reductions below the base.",
  },
  {
    question:
      "Should landlords prefer base year stops or net leases for new office deals?",
    answer:
      "Since 2023, many office landlords have negotiated modified gross leases with lower base years or converted to net-lease structures to reduce expense absorption risk. Whether a base year stop or net lease is preferable depends on the competitive market, tenant credit, and lease term. Base year stops are preferred when tenants resist net lease structures but accept a deductible concept.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Expense Stop vs. Base Year for Landlords",
    url: `${SITE_URL}/resources/expense-stop-vs-base-year-landlord`,
  },
]);

export default function ExpenseStopVsBaseYearPage() {
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
            Expense Stop vs. Base Year for Landlords
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Expense Stop vs. Base Year for Landlords: Which Structure Favors You
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Both structures shift operating expense risk to tenants, but they
            produce very different landlord economics depending on whether costs
            are rising, stable, or declining. Here&apos;s how to evaluate which
            works better in your market and lease context.
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
            A base year ties the tenant&apos;s deductible to actual expenses in
            a specific year - so the threshold reflects historical cost reality
            and grows stale over time. A fixed expense stop sets a dollar
            threshold stated in the lease. Neither is universally better for
            landlords: in a rising-cost environment, a low base year produces
            more recovery; in a declining-cost environment, a fixed stop
            maintains recovery even when actual costs fall below the historical
            base.
          </p>
        </div>

        {/* Mechanism Overview */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            How Each Structure Works
          </h2>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <p className="mb-2 font-semibold">Base Year Stop</p>
              <p className="text-sm text-muted-foreground">
                The landlord establishes the base threshold using actual
                operating expenses in a specific year (the base year). In every
                subsequent year, the tenant pays their pro-rata share of costs
                {""}
                <em>above</em> that threshold. The threshold is fixed in nominal
                dollar terms - it does not adjust for inflation or cost changes
                in later years.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="mb-2 font-semibold">Fixed Expense Stop</p>
              <p className="text-sm text-muted-foreground">
                A specific dollar-per-SF amount is stated directly in the lease
                as the threshold (e.g., &ldquo;$9.50/SF of rentable
                area&rdquo;). The tenant pays their pro-rata share of costs
                above this fixed amount per SF. The threshold does not change
                during the lease term unless an amendment provides for it.
              </p>
            </div>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Side-by-Side Comparison
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-semibold">Dimension</th>
                  <th className="p-3 text-left font-semibold">
                    Base Year Stop
                  </th>
                  <th className="p-3 text-left font-semibold">
                    Fixed Expense Stop
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-3 font-medium">How threshold is set</td>
                  <td className="p-3 text-muted-foreground">
                    Actual expenses in base year (usually lease commencement
                    year)
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Fixed $/SF stated in lease; agreed at signing
                  </td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-3 font-medium">Inflation exposure</td>
                  <td className="p-3 text-muted-foreground">
                    Landlord absorbs costs up to base year amount; recovers
                    excess - more recovery as inflation compounds
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Threshold is fixed; landlord recovers everything above stop
                    regardless of historical costs
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Renegotiation risk</td>
                  <td className="p-3 text-muted-foreground">
                    Stale base year is major risk at renewal - tenant resists
                    reset
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Tenant may push to increase stop at renewal if costs have
                    risen
                  </td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-3 font-medium">Accounting complexity</td>
                  <td className="p-3 text-muted-foreground">
                    Higher - must maintain base year documentation for audit
                    defense
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Lower - stop is in lease, no historical reconciliation
                    needed
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Tenant negotiating power</td>
                  <td className="p-3 text-muted-foreground">
                    Tenant pushes for high-expense base year; can negotiate
                    timing of base year
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Tenant pushes for high $/SF stop; easier to compare to
                    market benchmarks
                  </td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-3 font-medium">Typical lease type</td>
                  <td className="p-3 text-muted-foreground">
                    Full-service gross, modified gross office leases
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Office gross leases, some medical office
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Cost volatility impact</td>
                  <td className="p-3 text-muted-foreground">
                    Landlord absorbs all downside below base; benefits from
                    upside above base
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Tenant benefits from downside below stop; landlord recovers
                    all upside
                  </td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-3 font-medium">Documentation required</td>
                  <td className="p-3 text-muted-foreground">
                    Base year GL and invoices (must be preserved indefinitely)
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Lease exhibit only; no historical documentation needed
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Three Scenarios */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Three Economic Scenarios
          </h2>
          <p className="mb-4 text-muted-foreground">
            To illustrate the difference, consider a 50,000 SF tenant in a
            building where the base year expenses were $400,000 ($8.00/SF) or
            the lease contains a fixed stop at $8.00/SF. The tenant occupies
            12.5% of the building (50,000 &divide; 400,000 SF). Starting
            conditions are identical; the difference emerges as costs change.
          </p>

          <div className="space-y-6">
            <div className="rounded-lg border p-5">
              <h3 className="mb-3 font-semibold text-lg">
                Scenario 1: Stable Costs (+5% over 5 years)
              </h3>
              <div className="mb-3 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left font-semibold">Year</th>
                      <th className="p-2 text-right font-semibold">
                        Total Expenses
                      </th>
                      <th className="p-2 text-right font-semibold">
                        Base Year Recovery
                      </th>
                      <th className="p-2 text-right font-semibold">
                        Fixed Stop Recovery
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs">
                    <tr>
                      <td className="p-2">Year 1</td>
                      <td className="p-2 text-right">$400,000</td>
                      <td className="p-2 text-right">$0</td>
                      <td className="p-2 text-right">$0</td>
                    </tr>
                    <tr>
                      <td className="p-2">Year 2</td>
                      <td className="p-2 text-right">$408,000</td>
                      <td className="p-2 text-right">$1,000</td>
                      <td className="p-2 text-right">$1,000</td>
                    </tr>
                    <tr>
                      <td className="p-2">Year 5</td>
                      <td className="p-2 text-right">$420,400</td>
                      <td className="p-2 text-right">$2,550</td>
                      <td className="p-2 text-right">$2,550</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground">
                With stable 2% annual increases, both structures produce
                identical recovery - the base year threshold and the fixed stop
                started at the same point. Neither has an advantage in this
                scenario.
              </p>
            </div>

            <div className="rounded-lg border p-5">
              <h3 className="mb-3 font-semibold text-lg">
                Scenario 2: Rising Costs (+25% over 5 years)
              </h3>
              <div className="mb-3 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left font-semibold">Year</th>
                      <th className="p-2 text-right font-semibold">
                        Total Expenses
                      </th>
                      <th className="p-2 text-right font-semibold">
                        Base Year Recovery (12.5%)
                      </th>
                      <th className="p-2 text-right font-semibold">
                        Fixed Stop Recovery
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs">
                    <tr>
                      <td className="p-2">Year 1</td>
                      <td className="p-2 text-right">$400,000</td>
                      <td className="p-2 text-right">$0</td>
                      <td className="p-2 text-right">$0</td>
                    </tr>
                    <tr>
                      <td className="p-2">Year 3</td>
                      <td className="p-2 text-right">$454,000</td>
                      <td className="p-2 text-right font-medium">$6,750</td>
                      <td className="p-2 text-right">$6,750</td>
                    </tr>
                    <tr>
                      <td className="p-2">Year 5</td>
                      <td className="p-2 text-right">$500,000</td>
                      <td className="p-2 text-right font-medium">$12,500</td>
                      <td className="p-2 text-right">$12,500</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground">
                When both structures start from the same base threshold, the
                recovery is identical as long as the fixed stop was set at the
                actual base year cost. The difference emerges at{""}
                <em>lease renewal</em>: the base year landlord must fight to
                reset the base to current costs; the fixed stop landlord
                negotiates a new stop amount. Both face renegotiation risk, but
                the base year landlord can more easily argue for a reset using
                actual cost data.
              </p>
            </div>

            <div className="rounded-lg border p-5">
              <h3 className="mb-3 font-semibold text-lg">
                Scenario 3: Declining Costs (HVAC replaced, insurance re-bid)
              </h3>
              <div className="mb-3 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left font-semibold">Year</th>
                      <th className="p-2 text-right font-semibold">
                        Total Expenses
                      </th>
                      <th className="p-2 text-right font-semibold">
                        Base Year Recovery ($400K base)
                      </th>
                      <th className="p-2 text-right font-semibold">
                        Fixed Stop Recovery ($8.00/SF)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs">
                    <tr>
                      <td className="p-2">Year 1</td>
                      <td className="p-2 text-right">$400,000</td>
                      <td className="p-2 text-right">$0</td>
                      <td className="p-2 text-right">$0</td>
                    </tr>
                    <tr>
                      <td className="p-2">Year 2 (HVAC replaced, -$40K)</td>
                      <td className="p-2 text-right">$360,000</td>
                      <td className="p-2 text-right text-muted-foreground">
                        $0
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        $0
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2">Year 3 (costs recover)</td>
                      <td className="p-2 text-right">$415,000</td>
                      <td className="p-2 text-right font-medium">$1,875</td>
                      <td className="p-2 text-right font-medium">$1,875</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground">
                In a year where costs fall below the base/stop threshold, both
                structures produce zero tenant recovery - the landlord absorbs
                the full cost. The base year threshold does not ratchet down
                with cost reductions. In Year 3, when costs recover, both
                structures begin recovering above the original $400,000
                threshold.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Key difference: a fixed stop set above the Year 2 actual costs
                ($360,000) would give the landlord no recovery in Year 2 and
                $6,875 in Year 3 - more than the base year stop. This
                illustrates the fixed stop advantage when costs have declined
                significantly from the original base.
              </p>
            </div>
          </div>
        </section>

        {/* When to Prefer Each */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            When to Prefer Each Structure
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <p className="mb-2 font-semibold text-blue-700">
                Prefer Base Year Stop When:
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                  <span>
                    Operating costs are rising and you expect them to continue
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                  <span>
                    The lease is new construction where the base year is
                    naturally low
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                  <span>
                    You can negotiate a gross-up of the base year expenses if
                    the building is under-occupied at commencement
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                  <span>
                    Market standards in your submarket favor gross lease with
                    base year structures
                  </span>
                </li>
              </ul>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="mb-2 font-semibold text-amber-700">
                Prefer Fixed Expense Stop When:
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    Operating costs are predictable and stable; no major
                    upcoming cost drivers
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    The tenant has strong negotiating power and you want
                    simplicity to close the deal
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    You want to minimize documentation burden - no base year GL
                    preservation required
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    The building has had recent major improvements that pushed
                    base year costs temporarily higher
                  </span>
                </li>
              </ul>
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
                    Setting the Fixed Stop Below Market Without Realizing It
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If the fixed expense stop was set 10 years ago at $7.00/SF
                    and market operating costs are now $12.00/SF, the stop
                    captures more tenant recovery than the landlord may realize
                    - but also means the landlord absorbs nothing below $7.00.
                    If a lease amendment reduces the stop as a concession, the
                    landlord may inadvertently give away recovery that compounds
                    for the remainder of the term.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Failing to Gross Up the Base Year on a Low-Occupancy
                    Commencement
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When a lease commences in a building that is 60–70%
                    occupied, the base year expenses reflect a
                    partially-operating building. Without gross-up, the base is
                    set artificially low - which sounds good for the landlord
                    but actually means the base understates what it costs to
                    serve the tenant at full occupancy. When the building fills
                    up, variable costs jump, and the tenant&apos;s base year
                    deductible is too small to reflect their actual cost basis.
                    This creates a structural mismatch between the base and the
                    tenant&apos;s true cost contribution.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Not Resetting the Base Year at Lease Renewal
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Landlords who roll over a lease renewal without resetting
                    the base year carry forward a potentially decade-old
                    threshold. The tenant&apos;s deductible grows stale, the
                    landlord absorbs more cost than the economics of the deal
                    contemplated, and the opportunity to reset is permanently
                    lost after the renewal is signed. Always negotiate the base
                    year reset as part of renewal terms.
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
                Is a base year stop or expense stop better for landlords?
              </h3>
              <p className="text-muted-foreground">
                Neither is universally better. In a rising-cost environment, a
                base year set at low historical costs produces more recovery as
                inflation compounds above the threshold. A fixed stop is simpler
                to administer and may produce equivalent or better recovery
                depending on how the stop was negotiated relative to actual
                costs.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                Can a building have both base year and expense stop leases?
              </h3>
              <p className="text-muted-foreground">
                Yes, and it is common in buildings with tenants who signed
                leases over many years. Each tenant&apos;s reconciliation is run
                under their specific lease structure. This requires maintaining
                separate calculations and expense pools for each lease type.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What happens to the base year stop when costs decline?
              </h3>
              <p className="text-muted-foreground">
                If current costs fall below the base year threshold, the tenant
                pays nothing and the landlord absorbs the full cost. The base
                year does not ratchet down with cost reductions - it is a fixed
                floor, not a moving average. When costs recover above the base,
                recovery begins again.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                Should landlords prefer base year stops or net leases for new
                office deals?
              </h3>
              <p className="text-muted-foreground">
                Since 2023, many office landlords have negotiated modified gross
                or net structures to reduce expense absorption risk. Whether to
                use a base year stop depends on market competition, tenant
                credit, and whether the tenant will accept a net lease
                alternative.
              </p>
            </div>
          </div>
        </section>

        {/* Related Resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/base-year-expense-stop-reconciliation"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Base Year Expense Stop Reconciliation Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How to reconcile base year stops step by step.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/cam-cap-enforcement"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Cap Enforcement Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How caps interact with expense stop structures.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/lease-clauses-that-change-cam-outcomes"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Lease Clauses That Change CAM Outcomes
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How base year, cap, and exclusion provisions interact.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/cam-reconciliation-software"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Reconciliation Software
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Automated verification for mixed lease portfolios.
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Verify Every Lease Structure in Your Portfolio
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri handles base year stops, fixed expense stops, net leases,
            and gross leases in a single portfolio, verifying each tenant&apos;s
            reconciliation against their specific lease terms from your Yardi or
            MRI export.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "expense_stop_vs_base_year_cta",
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
