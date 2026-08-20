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
  title:
    "Insurance Pass-Throughs in Commercial Leases: What's Recoverable and How to Document It",
  description:
    "Which insurance premiums can landlords pass through as CAM? Covers property insurance, liability insurance, umbrella policies, and what tenants dispute in CAM audits.",
  alternates: {
    canonical: `${SITE_URL}/resources/insurance-pass-through-cam`,
  },
  openGraph: {
    title:
      "Insurance Pass-Throughs in Commercial Leases: What's Recoverable and How to Document It",
    description:
      "Which insurance premiums can landlords pass through as CAM? Covers property insurance, liability insurance, umbrella policies, and what tenants dispute in CAM audits.",
    url: `${SITE_URL}/resources/insurance-pass-through-cam`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "Are insurance deductibles recoverable as CAM?",
    answer:
      "Insurance deductibles are generally not recoverable as CAM unless the lease specifically includes them. Most NNN leases permit recovery of insurance premiums - the cost of the policy - but deductibles are a loss-related payment, not a premium, and are excluded by most lease definitions. Some leases include language permitting recovery of deductibles for specific covered losses, but this requires express provision.",
  },
  {
    question:
      "Can a landlord pass through the cost of a blanket insurance policy for multiple properties?",
    answer:
      "Yes, but the allocation to each individual property must be documented and defensible. The most common methodology is allocation by insured value - each property's allocated premium equals the blanket premium times the ratio of that property's insured value to the total portfolio insured value. Tenants can request the allocation methodology and compare it against single-property market rates.",
  },
  {
    question: "Is self-insurance recoverable as a CAM expense?",
    answer:
      "Self-insurance is recoverable only if the lease explicitly permits it and the self-insured'premium' is commercially reasonable - typically benchmarked against what a third-party insurer would charge for equivalent coverage. Large REITs increasingly use captive insurance arrangements. The landlord must demonstrate the rate is not above market; otherwise, the implicit premium may be challenged.",
  },
  {
    question: "What insurance types are not recoverable even in a NNN lease?",
    answer:
      "Non-recoverable insurance typically includes: directors and officers (D&O) liability, employment practices liability (EPLI), property owner's errors and omissions, key person insurance, lender-required title insurance, and any insurance that solely protects the landlord's ownership interests rather than the property itself. Review the lease exclusion list carefully - many modern NNN leases explicitly enumerate excluded insurance types.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Insurance Pass-Throughs in Commercial Leases",
    url: `${SITE_URL}/resources/insurance-pass-through-cam`,
  },
]);

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "Insurance Pass-Throughs in Commercial Leases: What's Recoverable and How to Document It",
  description:
    "Which insurance premiums are recoverable in NNN and modified gross leases, how to handle blanket policies, and common tenant disputes.",
  author: {
    "@type": "Person",
    name: "Angel Campa",
    url: `${SITE_URL}/about/angel-campa`,
  },
  publisher: { "@type": "Organization", name: "CapVeri", url: SITE_URL },
  dateModified: "2026-04-01",
  url: `${SITE_URL}/resources/insurance-pass-through-cam`,
};

export default function InsurancePassThroughPage() {
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
            Insurance Pass-Throughs in Commercial Leases
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Insurance Pass-Throughs in Commercial Leases: What&apos;s
            Recoverable and How to Document It
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Insurance premiums are a standard CAM line item in NNN and modified
            gross leases, but not all insurance types are recoverable, and the
            documentation requirements are more specific than most landlords
            realize. This guide covers recoverability by insurance type, blanket
            policy allocations, premium spikes, and self-insurance scenarios.
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

        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">Quick Answer</h2>
          <p className="text-muted-foreground">
            Property and liability insurance premiums are recoverable in most
            NNN and modified gross leases as non-controllable CAM expenses. The
            key documentation requirement is the actual insurance bill - not
            just a GL entry - showing the property-specific premium or the
            portfolio-allocation methodology. Deductibles, D&amp;O insurance,
            and employment practices liability are almost universally excluded.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Insurance Types: Recoverable vs. Non-Recoverable
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <div>
                  <p className="font-medium text-green-800">
                    Typically Recoverable
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-green-700">
                    <li>Property/hazard insurance</li>
                    <li>General liability insurance</li>
                    <li>Umbrella/excess liability</li>
                    <li>Earthquake/flood (if required by lease or lender)</li>
                    <li>Terrorism insurance (post-TRIA; if lease permits)</li>
                    <li>Business interruption (some leases)</li>
                    <li>Boiler and machinery / equipment breakdown</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <div>
                  <p className="font-medium text-red-800">
                    Typically Non-Recoverable
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-red-700">
                    <li>Directors &amp; officers (D&amp;O)</li>
                    <li>Employment practices liability (EPLI)</li>
                    <li>Property owner&apos;s errors &amp; omissions</li>
                    <li>Key person / life insurance</li>
                    <li>Lender-required title insurance</li>
                    <li>Crime/fidelity insurance (internal)</li>
                    <li>Workers&apos; compensation (landlord staff)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            The distinction generally follows whether the insurance protects the
            property itself and its users (recoverable) or protects the
            landlord&apos;s business entity and personnel (non-recoverable).
            Always verify against the specific lease exclusion list.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Blanket Policies: Allocating Multi-Property Insurance
          </h2>
          <p className="mb-4 text-muted-foreground">
            Large landlords and REITs commonly purchase insurance on a blanket
            basis covering their entire portfolio. While this is economically
            efficient, it creates a documentation challenge: tenants at each
            property need to know what portion of the blanket premium was
            allocated to their building.
          </p>
          <p className="mb-4 text-muted-foreground">
            The standard allocation methodology is by insured value. If a
            portfolio has a total insured value of $500 million and one property
            has an insured value of $50 million, that property is allocated 10%
            of the blanket premium.
          </p>
          <div className="mb-4 rounded-lg border bg-muted/40 p-5">
            <p className="mb-2 font-medium">
              Blanket Policy Allocation Example
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Blanket portfolio insurance premium: $2,400,000/year</li>
              <li>Total portfolio insured value: $500,000,000</li>
              <li>Subject property insured value: $50,000,000</li>
              <li>
                Allocation ratio: $50M ÷ $500M = <strong>10%</strong>
              </li>
              <li>
                Property allocated premium: $2,400,000 × 10% ={""}
                <strong>$240,000/year</strong>
              </li>
              <li>
                Tenant with 10% pro-rata share: $24,000/year insurance
                contribution
              </li>
            </ul>
          </div>
          <p className="text-muted-foreground">
            Tenants who receive a blanket-policy allocation can request
            documentation showing the total premium, total portfolio insured
            value, the subject property&apos;s insured value, and the
            calculation. Compare the allocated rate per square foot against
            single-property market rates as a reasonableness check - a blanket
            rate should generally be at or below market for equivalent
            single-property coverage.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Premium Spikes: How to Document and Defend Large Year-Over-Year
            Increases
          </h2>
          <p className="mb-4 text-muted-foreground">
            Commercial property insurance markets in coastal and catastrophe-
            exposed markets have seen 20–40% premium increases in recent years.
            When a tenant receives a reconciliation showing a significant
            insurance increase, disputes are common.
          </p>
          <p className="mb-4 text-muted-foreground">
            Documentation that reduces dispute risk includes:
          </p>
          <ul className="mb-4 space-y-2 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">
                The actual insurance invoice
              </span>
              {""}
              from the insurer showing the premium breakdown by coverage type
              and property.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Evidence of competitive quoting
              </span>
              {""}: proof the landlord solicited quotes from at least two or
              three carriers before renewing. This demonstrates the premium
              reflects market conditions.
            </li>
            <li>
              <span className="font-medium text-foreground">
                A market explanation
              </span>
              {""}: a brief note in the reconciliation letter explaining that
              commercial insurance markets experienced significant hardening in
              [year] affecting most commercial property owners in the region.
            </li>
          </ul>
          <p className="text-muted-foreground">
            Insurance is typically a non-controllable expense not subject to CAM
            caps, so tenants cannot cap the increase. They may still dispute the
            reasonableness of the premium. Documentation eliminates most
            disputes before they escalate.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Deductibles: Generally Not Recoverable
          </h2>
          <p className="mb-4 text-muted-foreground">
            Insurance deductibles are the landlord&apos;s out-of-pocket payment
            when a loss occurs - they are not a premium cost and are generally
            not recoverable as CAM unless the lease specifically includes them.
          </p>
          <p className="mb-4 text-muted-foreground">
            Some leases include a specific provision allowing the landlord to
            recover a"commercially reasonable deductible" for certain loss types
            (typically wind and hail in storm-prone markets). Without this
            language, billing tenants for a deductible is an unauthorized
            charge.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Self-Insurance: What REITs Can Recover
          </h2>
          <p className="mb-4 text-muted-foreground">
            Large REITs and institutional landlords increasingly self-insure
            through captive insurance companies, where the landlord&apos;s
            entity purchases coverage from a captive insurer it controls.
            The"premium" paid to the captive may be recoverable as CAM if:
          </p>
          <ol className="mb-4 space-y-2 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">1.</span> The lease
              explicitly permits self-insurance and specifies that the
              self-insured charge is recoverable.
            </li>
            <li>
              <span className="font-medium text-foreground">2.</span> The rate
              is commercially reasonable - i.e., at or below what a third-party
              insurer would charge for equivalent coverage on the same property.
            </li>
            <li>
              <span className="font-medium text-foreground">3.</span> The
              methodology for determining the self-insured rate is documented
              and available to tenants upon request.
            </li>
          </ol>
          <p className="text-muted-foreground">
            Without express lease language, a self-insured"premium" is subject
            to challenge. Tenants may argue that absent a real third-party
            insurance cost, there is no actual expense to recover.
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
                    Including D&amp;O or EPLI in the insurance CAM line item
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When a blanket policy covers multiple coverage types, the
                    allocated amount to each property sometimes includes
                    non-recoverable policies like D&amp;O or employment
                    practices. Verify that the allocated premium includes only
                    property-protecting policies, not entity-protecting ones.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Billing a blanket allocation without documentation
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tenants who receive only a dollar amount for insurance with
                    no explanation of how it was derived from a blanket policy
                    will frequently dispute it. Provide the allocation
                    methodology - insured values, total premium, and calculation
                    - proactively with the reconciliation statement.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Recovering a deductible as if it were a premium
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    After a significant loss event (hail, flood, fire), some
                    landlords inadvertently include the deductible paid in the
                    annual insurance line item. Deductibles are not premiums and
                    are not recoverable as CAM without explicit lease language.
                    Keep loss payments and premium payments separate in the GL.
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
                Are insurance deductibles recoverable as CAM?
              </h3>
              <p className="text-muted-foreground">
                Generally not. Deductibles are a loss-related payment, not a
                premium. Recovery requires express lease language. Most NNN
                leases permit recovery of premiums only.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Can a landlord pass through the cost of a blanket insurance
                policy?
              </h3>
              <p className="text-muted-foreground">
                Yes, but the allocation methodology must be documented and
                defensible. The standard method is allocation by insured value -
                each property&apos;s share is proportional to its insured value
                relative to the total portfolio insured value.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Is self-insurance recoverable as a CAM expense?
              </h3>
              <p className="text-muted-foreground">
                Self-insurance is recoverable only with explicit lease
                authorization and a commercially reasonable rate benchmarked
                against third-party market rates. Without lease language, the
                self-insured charge may be challenged as a non-expense.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What insurance types are never recoverable even in a NNN lease?
              </h3>
              <p className="text-muted-foreground">
                Non-recoverable insurance typically includes D&amp;O liability,
                employment practices liability, property owner&apos;s errors and
                omissions, key person insurance, and lender-required title
                insurance. These protect the landlord&apos;s entity or
                financing, not the property itself.
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
              href="/resources/property-tax-pass-through-cam"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">Property Tax Pass-Throughs</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Documentation and proration requirements for property tax CAM
                line items.
              </p>
            </Link>
            <Link
              href="/resources/cam-dispute-response"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">CAM Dispute Response Playbook</p>
              <p className="mt-1 text-sm text-muted-foreground">
                How to respond when tenants dispute insurance line items in a
                CAM audit.
              </p>
            </Link>
            <Link
              href="/cam-reconciliation-software"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">CAM Reconciliation Software</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Automate insurance premium validation and documentation with
                CapVeri.
              </p>
            </Link>
          </div>
        </section>

        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Validate Every Insurance Line Item Before Billing
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri cross-references your insurance GL entries against policy
            documents. It flags non-recoverable types and missing allocation
            documentation before your statement goes out.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "insurance_pass_through_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
