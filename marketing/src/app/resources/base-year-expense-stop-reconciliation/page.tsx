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
  title: "Base Year Expense Stop Reconciliation Guide for Commercial Landlords",
  description:
    "How base year stops and expense stops work in commercial leases and how to reconcile them correctly. Covers base year selection, stop thresholds, and the most common reconciliation errors.",
  alternates: {
    canonical: `${SITE_URL}/resources/base-year-expense-stop-reconciliation`,
  },
  openGraph: {
    title:
      "Base Year Expense Stop Reconciliation Guide for Commercial Landlords",
    description:
      "How base year stops and expense stops work in commercial leases and how to reconcile them correctly. Covers base year selection, stop thresholds, and the most common reconciliation errors.",
    url: `${SITE_URL}/resources/base-year-expense-stop-reconciliation`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is a base year expense stop?",
    answer:
      "A base year expense stop sets the actual operating expenses in a specific year (the base year) as the threshold below which the landlord absorbs all costs. The tenant only pays their pro-rata share of operating expenses that exceed the base year amount. If current year expenses are lower than the base year, the tenant pays nothing - the landlord bears the full reduction.",
  },
  {
    question:
      "What is the difference between a base year and a fixed expense stop?",
    answer:
      "A base year stop uses actual expenses from a specific historical year as the threshold. The dollar amount changes per lease if the base year differs. A fixed expense stop sets a specific dollar-per-SF threshold in the lease (e.g., '$8.50/SF') regardless of what expenses were in any prior year. The fixed stop does not change with inflation history; the base year stop is anchored to actual historical costs.",
  },
  {
    question: "What makes a good base year for the landlord?",
    answer:
      "From the landlord's perspective, a lower-cost base year is better - it means the threshold is lower, so more of each year's current expenses exceed the base and become tenant-recoverable. A base year with unusually low expenses (new construction, major cost reductions) favors the landlord. A high-expense base year (major capital project, one-time spike) favors the tenant.",
  },
  {
    question: "What is the stale base year problem?",
    answer:
      "The stale base year problem occurs when the base year was set many years ago and operating costs have since risen substantially above the base. A landlord with a 2019 base year in 2026 is absorbing seven years of accumulated cost inflation before recovering anything from the tenant. As inflation compounds, the gap between the base year amount and current expenses grows. The entire gap below current expenses remains the landlord's obligation.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Base Year Expense Stop Reconciliation",
    url: `${SITE_URL}/resources/base-year-expense-stop-reconciliation`,
  },
]);

export default function BaseYearExpenseStopPage() {
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
            Base Year Expense Stop Reconciliation
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Base Year Expense Stop Reconciliation Guide for Commercial Landlords
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            How base year stops and expense stops work in commercial leases: the
            reconciliation formula, base year selection strategy, the stale base
            year problem, and the three errors most likely to produce incorrect
            tenant billings.
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
            A base year expense stop sets a fixed dollar amount (the base
            year&apos;s actual operating expenses) as the threshold below which
            the landlord absorbs all costs. Tenants only pay their pro-rata
            share of expenses that <em>exceed</em> the base year amount. If
            current year expenses are below the base, the tenant pays nothing on
            the operating expense line.
          </p>
        </div>

        {/* How It Works */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            How Base Year Stops Work
          </h2>
          <p className="mb-4 text-muted-foreground">
            A base year stop is the defining feature of a gross lease with an
            expense stop. Rather than recovering operating expenses from the
            first dollar (as in a net lease), the landlord absorbs all costs up
            to the base year threshold and only recovers the excess. The lease
            specifies which year is the base year - typically the year of lease
            commencement.
          </p>
          <p className="mb-6 text-muted-foreground">
            The formula is straightforward:
          </p>
          <div className="mb-6 rounded-xl border bg-muted/40 p-6 font-mono text-sm">
            <p className="mb-3 font-bold">Base Year Stop Formula</p>
            <p className="mb-2 text-muted-foreground">
              Tenant Obligation = Max(0, Current Year Expenses &minus; Base Year
              Expenses) &times; Pro-Rata %
            </p>
            <p className="text-muted-foreground">
              If Current Year Expenses &lt; Base Year Expenses: Tenant
              Obligation = $0
            </p>
          </div>
          <p className="text-muted-foreground">
            The key conceptual difference from a standard net lease: the
            landlord is always absorbing a layer of operating cost equal to the
            base year amount. Only the growth above that layer is recoverable
            from tenants.
          </p>
        </section>

        {/* Worked Example */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Worked Example: 3-Tenant Office Building
          </h2>
          <div className="mb-4 rounded-lg border p-4">
            <p className="mb-2 font-medium text-sm">Building assumptions:</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Total building RSF: 80,000 SF</li>
              <li>Base year (2023) total operating expenses: $400,000</li>
              <li>Base year expense per SF: $5.00/SF</li>
            </ul>
          </div>

          <div className="mb-6 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-semibold">Year</th>
                  <th className="p-3 text-right font-semibold">
                    Total Expenses
                  </th>
                  <th className="p-3 text-right font-semibold">
                    Less Base ($400K)
                  </th>
                  <th className="p-3 text-right font-semibold">
                    Recoverable Pool
                  </th>
                  <th className="p-3 text-right font-semibold">
                    Tenant at 15% Share
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-3">2024 (Year 1)</td>
                  <td className="p-3 text-right">$420,000</td>
                  <td className="p-3 text-right">$20,000</td>
                  <td className="p-3 text-right">$20,000</td>
                  <td className="p-3 text-right font-medium">$3,000</td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-3">2025 (Year 2)</td>
                  <td className="p-3 text-right">$460,000</td>
                  <td className="p-3 text-right">$60,000</td>
                  <td className="p-3 text-right">$60,000</td>
                  <td className="p-3 text-right font-medium">$9,000</td>
                </tr>
                <tr>
                  <td className="p-3">2026 (Year 3)</td>
                  <td className="p-3 text-right">$510,000</td>
                  <td className="p-3 text-right">$110,000</td>
                  <td className="p-3 text-right">$110,000</td>
                  <td className="p-3 text-right font-medium">$16,500</td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-3">2027 (Year 4, expenses drop)</td>
                  <td className="p-3 text-right">$380,000</td>
                  <td className="p-3 text-right text-muted-foreground">
                    $0 (negative)
                  </td>
                  <td className="p-3 text-right">$0</td>
                  <td className="p-3 text-right font-medium text-muted-foreground">
                    $0
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-sm text-muted-foreground">
            In 2027, expenses dropped below the base year amount. The tenant
            owes nothing - the landlord absorbs the entire operating expense.
            Note: this also means that if expenses recovered in 2028, the base
            is still $400,000 (the 2023 base year), not $380,000. The base does
            not ratchet down with expense reductions.
          </p>
        </section>

        {/* Base Year vs Fixed Stop */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Expense Stop (Fixed Dollar) vs. Base Year: How They Differ
          </h2>
          <div className="mb-4 overflow-x-auto">
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
                  <td className="p-3 font-medium">Threshold basis</td>
                  <td className="p-3 text-muted-foreground">
                    Actual expenses in a specific prior year
                  </td>
                  <td className="p-3 text-muted-foreground">
                    A fixed dollar amount per SF stated in the lease
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Inflation anchoring</td>
                  <td className="p-3 text-muted-foreground">
                    Anchored to historical costs; stales over time
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Fixed in nominal terms; may stale faster or slower
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Documentation required</td>
                  <td className="p-3 text-muted-foreground">
                    Base year GL and invoices to establish threshold
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Lease states the stop; no historical documentation needed
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Negotiating position</td>
                  <td className="p-3 text-muted-foreground">
                    Tenant pushes for high-expense base year; landlord pushes
                    for low
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Both parties negotiate the specific dollar amount
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Common lease types</td>
                  <td className="p-3 text-muted-foreground">
                    Full-service gross, modified gross
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Office gross leases, some medical office
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Gross-up applicability</td>
                  <td className="p-3 text-muted-foreground">
                    Base year can be grossed up at commencement if building is
                    under-occupied
                  </td>
                  <td className="p-3 text-muted-foreground">
                    Stop amount is fixed; no gross-up applies
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Base Year Selection */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Base Year Selection: Landlord vs. Tenant Perspective
          </h2>
          <p className="mb-4 text-muted-foreground">
            The choice of base year is one of the most financially significant
            decisions in a gross lease negotiation. The same building with
            different base years can produce dramatically different landlord
            economics over a 10-year lease term.
          </p>

          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <p className="mb-2 font-semibold text-blue-700">
                Landlord Prefers
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                  <span>
                    A low-expense base year - minimum tenant deductible, maximum
                    recoverable pool
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                  <span>
                    A year before major capital expenditures that temporarily
                    inflated costs
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                  <span>
                    A year with low occupancy (if grossed up) - the grossed-up
                    base gives a low absolute threshold
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                  <span>
                    The current year (commencing year) so the base starts fresh
                    without historical baggage
                  </span>
                </li>
              </ul>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="mb-2 font-semibold text-amber-700">
                Tenant Prefers
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    A high-expense base year - larger deductible means less
                    current-year exposure
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    A year with known one-time elevated costs that won&apos;t
                    recur
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    The year immediately before a known period of cost reduction
                    (e.g., HVAC replacement, new insurance contract)
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Stale Base Year */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            The Stale Base Year Problem
          </h2>
          <p className="mb-4 text-muted-foreground">
            A base year established in 2019 was reasonable in 2020. By 2026,
            seven years of compound inflation have pushed operating costs well
            above 2019 levels in most markets - and the entire gap between 2019
            costs and 2026 costs sits below the recoverable threshold. The
            landlord is absorbing costs that should, in a fair economic
            exchange, be shared with the tenant.
          </p>
          <p className="mb-4 text-muted-foreground">
            This is the stale base year problem, and it is endemic to long-term
            gross leases. It does not represent a billing error - the lease is
            working as written. But it is a significant economic disadvantage
            that accumulates quietly over the lease term.
          </p>
          <p className="mb-4 text-muted-foreground">
            At lease renewal, the stale base year becomes a major negotiation
            point. Landlords should negotiate to reset the base year to the
            renewal commencement year. Tenants who understand the stale base
            year advantage will resist this reset - it dramatically increases
            their operating expense exposure going forward.
          </p>
          <div className="rounded-lg border p-4 text-sm">
            <p className="font-medium">Example: 2019 Base Year in 2026</p>
            <p className="mt-2 text-muted-foreground">
              Base year 2019 expenses: $400,000. Current year 2026 expenses:
              $580,000 (45% cumulative increase). Recoverable pool: only
              $180,000. If the base had been reset at each renewal to
              current-year expenses, the landlord would be recovering
              significantly more of the $580,000. Instead, $400,000 of the
              current cost base is permanently landlord-absorbed.
            </p>
          </div>
        </section>

        {/* Gross-Up at Commencement */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Base Year Gross-Up at Commencement
          </h2>
          <p className="mb-4 text-muted-foreground">
            If the base year is a year in which the building was less than
            90–95% occupied, the base year expenses will be artificially low -
            reflecting the reduced operating costs of a partially occupied
            building. This gives tenants an inflated deductible in future years
            (when the building fills up and costs increase) at the
            landlord&apos;s expense.
          </p>
          <p className="mb-4 text-muted-foreground">
            To prevent this, many landlords negotiate a gross-up of the base
            year expenses to what they would have been at the defined occupancy
            threshold (typically 90–95%). This grossed-up base year applies the
            same logic as a gross-up provision in a net lease: normalize the
            base year to a fully-occupied standard so tenants pay
            proportionately in later years.
          </p>
          <p className="text-sm text-muted-foreground">
            Example: Building was 70% occupied in the base year. Total operating
            expenses: $350,000. Variable expenses (65%): $227,500. Grossed-up
            variable expenses at 95%: $227,500 &divide; 0.70 &times; 0.95 =
            $308,571. Grossed-up base year expenses: $308,571 + $122,500 (fixed)
            = $431,071. Future years compare actual expenses to $431,071, not
            $350,000 - substantially reducing the landlord&apos;s absorbed
            layer.
          </p>
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
                    Using Estimated Rather Than Actual Base Year Expenses
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Some landlords set up the base year stop using a budget
                    figure or prior-year estimate rather than the actual audited
                    expenses for the base year. If actual expenses turned out
                    lower than the estimate, the tenant&apos;s threshold is too
                    high - and the landlord is under-recovering on every
                    subsequent year. Always reconcile the base year with actual
                    GL data before setting it in the billing system.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Not Applying the Base Year Gross-Up at Commencement
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If the lease provides for a grossed-up base year but the
                    billing system stores the actual (un-grossed) base year
                    amount, every subsequent year&apos;s reconciliation
                    understates the recoverable pool. The error is systematic
                    and compounds as expenses grow. It can only be corrected by
                    recalculating the grossed-up base year from original
                    occupancy and expense data.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Applying a CAP to the Base Year Stop Structure
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Base year stops and CAM caps address different things. A
                    base year stop determines when recovery begins (above the
                    base). A CAM cap limits how fast recovery grows. Some leases
                    have both. Applying a cap to a base year stop structure
                    requires calculating both limits and applying whichever is
                    more restrictive in each year - and maintaining a cap bank
                    if the cap is cumulative. Conflating the two or applying one
                    where the lease calls for the other produces incorrect
                    billings.
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
                What is a base year expense stop?
              </h3>
              <p className="text-muted-foreground">
                A base year expense stop sets the actual operating expenses in a
                specific year as the threshold below which the landlord absorbs
                all costs. Tenants only pay their pro-rata share of costs that
                exceed the base year amount.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What is the difference between a base year and a fixed expense
                stop?
              </h3>
              <p className="text-muted-foreground">
                A base year stop uses actual expenses from a prior year as the
                threshold - tied to historical cost reality. A fixed expense
                stop states a specific dollar-per-SF amount in the lease,
                regardless of what historical expenses were. Fixed stops are
                simpler to administer; base year stops are more common in gross
                office leases.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What makes a good base year for the landlord?
              </h3>
              <p className="text-muted-foreground">
                A lower-cost base year benefits the landlord by lowering the
                tenant&apos;s deductible - making more of each year&apos;s
                expenses recoverable. New construction years with minimal
                maintenance costs, or years with high efficiency from recent
                system upgrades, are favorable base years for landlords.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                What is the stale base year problem?
              </h3>
              <p className="text-muted-foreground">
                When a base year was set many years ago, compound inflation
                pushes current expenses well above the base - but everything
                below current expenses remains the landlord&apos;s obligation. A
                2019 base year in 2026 means seven years of cumulative cost
                increases below the recoverable threshold. At lease renewal,
                landlords should negotiate to reset the base year.
              </p>
            </div>
          </div>
        </section>

        {/* Related Resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/expense-stop-vs-base-year-landlord"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Expense Stop vs. Base Year: Which Favors Landlords
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Side-by-side comparison with three economic scenarios.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/resources/cam-gross-up-guide"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Gross-Up Calculation Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    How gross-up applies to base year calculations.
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
                    How base year, cap, and exclusion clauses interact.
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
                    Automated reconciliation for base year and expense stop
                    leases.
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Verify Your Base Year Reconciliations
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri checks your base year expense stop reconciliations against
            the lease - correct threshold, grossed-up base where applicable, and
            correct recoverable pool calculation - using your Yardi or MRI
            export.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({ content: "base_year_reconciliation_cta" })}
            >
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
