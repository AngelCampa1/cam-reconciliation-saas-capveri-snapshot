import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronRight,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Management Fee Recoverability in CAM: What Landlords Can Charge",
  description:
    "Are management fees recoverable as CAM? The answer depends on the lease. This guide covers how management fees are structured, what's recoverable, how caps work, and what tenants dispute.",
  alternates: {
    canonical: `${SITE_URL}/resources/management-fee-recoverability-cam`,
  },
  openGraph: {
    title: "Management Fee Recoverability in CAM: What Landlords Can Charge",
    description:
      "Are management fees recoverable as CAM? The answer depends on the lease. This guide covers how management fees are structured, what's recoverable, how caps work, and what tenants dispute.",
    url: `${SITE_URL}/resources/management-fee-recoverability-cam`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "Are management fees recoverable as CAM?",
    answer:
      "Management fees are recoverable in most NNN and modified gross leases, but only up to the cap stated in the lease. The fee structure (percentage of gross revenues vs. percentage of CAM pool) and any explicit cap determine how much can be passed through. Always verify the lease language, as some leases exclude management fees entirely from the recoverable pool.",
  },
  {
    question:
      "What is the difference between a management fee based on gross revenues vs. a management fee based on the CAM pool?",
    answer:
      "A gross-revenue-based fee (e.g., 3% × $2M gross revenues = $60,000/year) is calculated on total property income and is common in institutional portfolios. A CAM-pool-based fee (e.g., 15% × $300,000 CAM = $45,000/year) is calculated only on operating expenses. Which is higher depends on the property's rent levels and occupancy. At high occupancy and high rents, the gross-revenue fee is typically larger.",
  },
  {
    question:
      "Can a landlord recover a management fee if the property is self-managed?",
    answer:
      "Only if the lease explicitly permits self-management recovery and states the applicable rate. Without express lease language, a self-management fee charged as CAM is subject to tenant dispute. Most well-drafted leases that allow self-management fees specify a rate not to exceed what a third-party property manager would charge for comparable properties.",
  },
  {
    question:
      "What is an oversight fee, and is it separately recoverable from the management fee?",
    answer:
      "An oversight fee (sometimes called an asset management fee) is charged by some ownership entities for high-level oversight of the property manager. Whether it is separately recoverable depends entirely on the lease. If the lease only permits recovery of a'property management fee,' a separately charged oversight fee is likely not recoverable unless the lease specifically includes it.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Management Fee Recoverability in CAM",
    url: `${SITE_URL}/resources/management-fee-recoverability-cam`,
  },
]);

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Management Fee Recoverability in CAM: What Landlords Can Charge",
  description:
    "A guide to management fee structures, recoverability under NNN and modified gross leases, caps, and common tenant disputes.",
  author: {
    "@type": "Person",
    name: "Angel Campa",
    url: `${SITE_URL}/about/angel-campa`,
  },
  publisher: { "@type": "Organization", name: "CapVeri", url: SITE_URL },
  dateModified: "2026-04-01",
  url: `${SITE_URL}/resources/management-fee-recoverability-cam`,
};

export default function ManagementFeeRecoverabilityPage() {
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
            Management Fee Recoverability in CAM
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Management Fee Recoverability in CAM: What Landlords Can Charge
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Management fees are one of the most scrutinized line items in any
            CAM reconciliation. This guide explains the two primary fee
            structures, how lease caps work, self-management scenarios, and the
            oversight fee problem that creates audit exposure.
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
            Management fees are recoverable in most NNN and modified gross
            leases, but the fee structure (percentage of gross revenues vs.
            percentage of the CAM pool) and the lease cap determine how much can
            actually be passed through. Self-management fees require explicit
            lease authorization. Oversight fees are only recoverable if the
            lease specifically permits them in addition to the base management
            fee.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Two Management Fee Structures
          </h2>
          <p className="mb-4 text-muted-foreground">
            Commercial property management fees are almost universally expressed
            as a percentage, but the base against which that percentage is
            applied varies significantly between lease types and portfolio
            strategies.
          </p>

          <h3 className="mb-3 text-xl font-semibold">
            Structure A: Percentage of Gross Revenues
          </h3>
          <p className="mb-3 text-muted-foreground">
            Common in institutional portfolios and REITs, this structure applies
            the management fee percentage to the property&apos;s total gross
            operating revenues: rents, CAM reimbursements, parking income, and
            other operating income.
          </p>
          <div className="mb-6 rounded-lg border bg-muted/40 p-5">
            <p className="mb-2 font-medium">Example - Structure A</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Gross revenues: $2,000,000/year</li>
              <li>Management fee rate: 3%</li>
              <li>Management fee: $60,000/year</li>
              <li>
                Pro-rata portion billed to a 10% tenant: $6,000/year (before
                cap)
              </li>
            </ul>
          </div>

          <h3 className="mb-3 text-xl font-semibold">
            Structure B: Percentage of the CAM Pool
          </h3>
          <p className="mb-3 text-muted-foreground">
            Common in smaller and mid-market properties, this structure applies
            the fee percentage to the total recoverable operating expenses (the
            CAM pool). The management fee is effectively a line item within CAM
            itself.
          </p>
          <div className="mb-6 rounded-lg border bg-muted/40 p-5">
            <p className="mb-2 font-medium">Example - Structure B</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Total recoverable CAM expenses: $300,000/year</li>
              <li>Management fee rate: 15%</li>
              <li>Management fee: $45,000/year</li>
              <li>
                Pro-rata portion billed to a 10% tenant: $4,500/year (before
                cap)
              </li>
            </ul>
          </div>

          <div className="mb-4 rounded-lg border bg-muted/40 p-5">
            <p className="mb-3 font-medium">
              Which Structure Produces a Higher Fee?
            </p>
            <p className="mb-2 text-sm text-muted-foreground">
              It depends on occupancy and rent levels. Consider a 100,000 RSF
              suburban office building:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 pr-4 text-left font-medium">
                      Scenario
                    </th>
                    <th className="pb-2 pr-4 text-left font-medium">
                      Structure A (3% of $2M gross)
                    </th>
                    <th className="pb-2 text-left font-medium">
                      Structure B (15% of $300K CAM)
                    </th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="py-2 pr-4">High-rent, 95% occupancy</td>
                    <td className="py-2 pr-4">$60,000</td>
                    <td className="py-2">$45,000</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4">Low-rent, 70% occupancy</td>
                    <td className="py-2 pr-4">$33,000</td>
                    <td className="py-2">$45,000</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">High-expense, any occupancy</td>
                    <td className="py-2 pr-4">Fixed to revenue</td>
                    <td className="py-2">Scales with expenses</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              At high occupancy and strong rents, Structure A typically produces
              a larger fee. At lower occupancy, Structure B can exceed Structure
              A.
            </p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            What "Gross Revenues" Typically Includes and Excludes
          </h2>
          <p className="mb-4 text-muted-foreground">
            When the management fee is based on gross revenues, the lease
            definition of"gross revenues" or"gross operating revenues" controls
            what goes into the base. Landlords should verify this definition
            carefully. Inadvertently including excluded items inflates the
            management fee recovery.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <div>
                  <p className="font-medium text-green-800">
                    Typically Included
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-green-700">
                    <li>Base rent</li>
                    <li>CAM reimbursements</li>
                    <li>Property tax reimbursements</li>
                    <li>Insurance reimbursements</li>
                    <li>Parking income</li>
                    <li>Storage income</li>
                    <li>Antenna/telecom license fees</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <div>
                  <p className="font-medium text-red-800">Typically Excluded</p>
                  <ul className="mt-2 space-y-1 text-sm text-red-700">
                    <li>Capital proceeds (sales, refinancing)</li>
                    <li>Insurance loss recoveries</li>
                    <li>Condemnation awards</li>
                    <li>Security deposits</li>
                    <li>Loan proceeds</li>
                    <li>Tax refunds and credits</li>
                    <li>Tenant improvement allowance repayments</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Management Fee Caps in Leases
          </h2>
          <p className="mb-4 text-muted-foreground">
            Many leases include an explicit cap on the management fee that can
            be passed through, regardless of the actual fee paid to the property
            manager. A cap of "not to exceed 4% of gross revenues" means the
            landlord cannot recover more than 4% even if the actual contract
            calls for 5%.
          </p>
          <div className="mb-4 rounded-lg border bg-muted/40 p-5">
            <p className="mb-2 font-medium">Cap Example</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Actual management fee paid: $75,000 (3.75% of $2M)</li>
              <li>Lease cap: 3% of gross revenues = $60,000</li>
              <li>
                Maximum recoverable: <strong>$60,000</strong>
              </li>
              <li>Non-recoverable overage: $15,000 (landlord absorbs this)</li>
            </ul>
          </div>
          <p className="text-muted-foreground">
            Some leases state the cap as a percentage of CAM expenses rather
            than gross revenues. Always determine which base the cap applies to.
            A 15% cap on CAM expenses produces a very different dollar ceiling
            than a 4% cap on gross revenues for the same property.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Self-Management: Is the Fee Recoverable?
          </h2>
          <p className="mb-4 text-muted-foreground">
            When a landlord manages the property directly rather than through a
            third-party management company, the question is whether an
            internally charged management fee is recoverable from tenants. The
            answer is almost always: only if the lease explicitly permits it.
          </p>
          <p className="mb-4 text-muted-foreground">
            Well-drafted leases that anticipate self-management typically
            include language like: "If the Property is self-managed by Landlord
            or an affiliate, Landlord may recover a management fee not to exceed
            the rate a third-party property manager would charge for comparable
            properties in the market, but in no event more than [X]% of gross
            revenues."
          </p>
          <p className="text-muted-foreground">
            Without similar language, a tenant auditor will argue that the
            self-management fee is a non-recoverable ownership cost. The risk is
            heightened if the fee is paid to an affiliated entity. Courts in
            multiple jurisdictions have denied recovery of related-party fees
            that lacked explicit lease authorization.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            The Oversight Fee Problem
          </h2>
          <p className="mb-4 text-muted-foreground">
            Some ownership structures layer an "oversight fee" or "asset
            management fee" on top of the base property management fee. This
            second fee is typically charged by the ownership entity (or a
            general partner) for supervising the property manager and handling
            higher-level asset management functions.
          </p>
          <p className="mb-4 text-muted-foreground">
            The recoverability of both fees depends on what the lease permits.
            If the lease says "management fee not to exceed 3% of gross
            revenues," billing both a 2% property management fee and a 1%
            oversight fee may push the total to 3% and still fit within the cap,
            but only if both fees are clearly within the definition of
            "management fee" in the lease.
          </p>
          <p className="text-muted-foreground">
            A more aggressive interpretation that bills both fees separately,
            totaling 4% against a 3% cap, will generate tenant disputes and
            potential liability for overbilling. The safest practice is to
            aggregate all management-related fees and compare the total against
            the lease cap before passing any amount through.
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
                    Applying the management fee to excluded expenses
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If the management fee is calculated as a percentage of the
                    CAM pool, but the CAM pool improperly includes
                    non-recoverable items (depreciation, capital expenditures,
                    ground lease payments), the management fee is inflated by
                    the same contamination. Audit the CAM pool before
                    calculating the management fee.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Recovering the full management fee when a cap applies
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The actual management contract may specify a rate that
                    exceeds the lease cap. Billing the actual rate rather than
                    the capped rate creates a quantifiable overbilling. This is
                    one of the most common findings in tenant CAM audits.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Recovering an oversight or asset management fee without
                    lease authority
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Passing through an asset management fee when the lease only
                    authorizes a"property management fee" exposes the landlord
                    to a dispute. The oversight fee should be reviewed against
                    the lease definition of recoverable management fees before
                    inclusion in the reconciliation.
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
                Are management fees recoverable as CAM?
              </h3>
              <p className="text-muted-foreground">
                Management fees are recoverable in most NNN and modified gross
                leases, but only up to the cap stated in the lease. Always check
                the lease definition of "management fee" and any cap provision
                before including the fee in your reconciliation statement.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is the difference between a gross-revenue-based fee and a
                CAM-pool-based fee?
              </h3>
              <p className="text-muted-foreground">
                A gross-revenue-based fee applies the percentage to total
                property income (common in institutional portfolios). A
                CAM-pool-based fee applies the percentage only to recoverable
                operating expenses. Which is higher depends on occupancy and
                rent levels relative to operating expense levels.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Can a landlord recover a management fee if the property is
                self-managed?
              </h3>
              <p className="text-muted-foreground">
                Only if the lease explicitly permits it and specifies the
                applicable rate or cap. Without express lease language, a
                self-management fee is subject to tenant dispute and may not be
                enforceable.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is an oversight fee, and is it recoverable?
              </h3>
              <p className="text-muted-foreground">
                An oversight or asset management fee is charged above the
                property management fee for ownership-level supervision. Whether
                it is recoverable depends on whether the lease definition of
                "management fee" encompasses it. When in doubt, aggregate all
                management-related fees and compare the total against the lease
                cap.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/recoverable-vs-nonrecoverable-cam"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">
                Recoverable vs. Non-Recoverable CAM Expenses
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete guide to which operating expenses can be passed through
                to tenants.
              </p>
            </Link>
            <Link
              href="/resources/management-fee-cam-disputes"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">Management Fee CAM Disputes</p>
              <p className="mt-1 text-sm text-muted-foreground">
                How tenants challenge management fees in audits and how to
                respond.
              </p>
            </Link>
            <Link
              href="/resources/cam-dispute-response"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">CAM Dispute Response Playbook</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Step-by-step process for responding to tenant CAM audit
                findings.
              </p>
            </Link>
            <Link
              href="/cam-reconciliation-software"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">CAM Reconciliation Software</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Automate management fee calculations and cap enforcement with
                CapVeri.
              </p>
            </Link>
          </div>
        </section>

        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Automate Management Fee Cap Enforcement
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri flags management fees that exceed the lease cap before your
            reconciliation goes out, eliminating one of the most common CAM
            audit findings.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "management_fee_recoverability_cta",
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
