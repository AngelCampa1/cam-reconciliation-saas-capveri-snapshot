import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AlertTriangle, CheckCircle } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Why Management Fee Calculations Trigger CAM Disputes",
  description:
    "Management fees are one of the most-disputed CAM line items. Here's why: how management fees should be calculated, common errors, and what tenants look for in an audit.",
  alternates: {
    canonical: `${SITE_URL}/resources/management-fee-cam-disputes`,
  },
  openGraph: {
    title: "Why Management Fee Calculations Trigger CAM Disputes",
    description:
      "Management fees are one of the most-disputed CAM line items. How they should be calculated, common errors, and what tenants look for in an audit.",
    url: `${SITE_URL}/resources/management-fee-cam-disputes`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question:
      "Why are management fees one of the most common CAM dispute items?",
    answer:
      "Management fees are disputed frequently because the calculation base is easy to mis-state. If a landlord applies a 4% management fee to total expenses (including capital items and other excluded costs) rather than only the recoverable expense pool, the overcharge compounds across every tenant in the building and every reconciliation year. Auditors screen for this pattern in almost every CAM audit they perform.",
  },
  {
    question:
      "What is the difference between a management fee on gross revenues vs. a management fee on CAM expenses?",
    answer:
      "A management fee expressed as a percentage of gross revenues uses the total rental income from the property as its base, typically 3–5% of gross revenues. A management fee expressed as a percentage of CAM expenses uses the recoverable operating expense pool as its base, typically 10–15% of CAM. These produce very different dollar amounts on the same property. The lease controls which structure applies, and the two methods are not interchangeable.",
  },
  {
    question:
      "Can a landlord charge both a property management fee and a separate oversight or asset management fee?",
    answer:
      "Some landlords charge a base property management fee and a separate oversight or asset management fee layered on top. This double-counting is a significant dispute trigger. The lease must explicitly authorize both fees and define their separate bases. A fee labeled 'asset management' charged in addition to the property management fee is generally not recoverable as CAM unless specifically included in the lease's definition of recoverable expenses.",
  },
  {
    question:
      "What does 'gross operating revenues' mean vs. 'gross revenues' for management fee calculation?",
    answer:
      "These terms produce different calculation bases. 'Gross revenues' typically includes all amounts collected from tenants: base rent, CAM recoveries, percentage rents, parking income, and other charges. 'Gross operating revenues' is often defined to exclude proceeds from asset sales, insurance proceeds, and condemnation awards. If the lease says 'gross operating revenues' but the landlord calculates the management fee on 'gross revenues' (a broader base), the management fee is overstated.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Management Fee CAM Disputes",
    url: `${SITE_URL}/resources/management-fee-cam-disputes`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline: "Why Management Fee Calculations Trigger CAM Disputes",
  description:
    "Management fees are one of the most-disputed CAM line items. How they should be calculated, common errors, and what tenants look for in an audit.",
  url: `${SITE_URL}/resources/management-fee-cam-disputes`,
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
  wordCount: 1350,
});

export default function ManagementFeeCAMDisputesPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />

      <div className="border-b bg-muted">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <nav className="text-sm text-muted-foreground mb-4">
            <Link
              href="/resources"
              className="hover:text-foreground transition-colors duration-200"
            >
              Resources
            </Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">Management Fee CAM Disputes</span>
          </nav>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Why Management Fee Calculations Trigger CAM Disputes
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-2xl">
            The management fee is the most frequently challenged line in a CAM
            audit. The errors that cause disputes are almost always preventable.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>
              By{" "}
              <Link
                href="/about/angel-campa"
                className="text-foreground font-medium hover:text-primary transition-colors duration-200"
              >
                Angel Campa
              </Link>
              , Founder, CapVeri
            </span>
            <span aria-hidden="true">·</span>
            <time dateTime="2026-04-26">Updated April 2026</time>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 max-w-3xl">
        {/* Quick answer */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 mb-10">
          <h2 className="text-base font-semibold text-foreground mb-2">
            Quick Answer
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Management fee disputes arise when the fee is calculated on an
            incorrect base (including excluded expenses), exceeds the lease cap,
            or is applied inconsistently across multi-tenant buildings. The
            single most common error: applying the management fee percentage to
            the full expense pool (including capital items, reserves, and other
            non-recoverable costs) rather than only the recoverable CAM pool.
          </p>
        </div>

        {/* How management fees are structured */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            How Management Fees Are Structured
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Commercial leases use two distinct structures for management fee
            recovery, and they produce very different results on the same
            property.
          </p>
          <div className="space-y-4 mb-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                Structure 1: Percentage of gross revenues (or gross operating
                revenues)
              </p>
              <p className="text-sm text-muted-foreground">
                The management fee is calculated as a percentage, typically
                3–5%, of all gross revenues collected from the property. This
                includes base rent, CAM recoveries, percentage rents, and
                parking income. On a 100,000 RSF retail center generating $3.5M
                in gross revenues, a 4% management fee equals $140,000. The
                lease language matters critically: &quot;gross revenues&quot;
                and &quot;gross operating revenues&quot; are not synonymous -
                the latter typically excludes asset sale proceeds and insurance
                settlements.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                Structure 2: Percentage of CAM expenses
              </p>
              <p className="text-sm text-muted-foreground">
                The management fee is calculated as a percentage of the
                recoverable CAM pool, typically 10–15%. On a building with
                $800,000 in recoverable CAM, a 12% management fee equals
                $96,000. This structure directly ties the management fee to the
                expense pool it is supposed to manage, but it creates a
                problematic incentive: higher expenses generate a higher
                management fee. Auditors review expense growth rates in
                comparison to management fee growth for exactly this reason.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A critical point: these two structures can produce dramatically
            different management fee amounts on the same property. A landlord
            who switches calculation methods between years, or who interprets
            ambiguous lease language to use whichever base produces a higher
            fee, faces significant dispute exposure.
          </p>
        </section>

        {/* Common lease language */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Common Lease Language
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Two standard formulations appear most often in institutional NNN
            leases:
          </p>
          <div className="space-y-4 mb-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-mono text-foreground mb-2 text-xs leading-relaxed">
                &quot;...a management fee not to exceed [X]% of the gross
                revenues from the Property for the applicable period, which
                shall be included as an Operating Expense...&quot;
              </p>
              <p className="text-sm text-muted-foreground">
                This structure caps the total management fee at a percentage of
                gross revenues. The landlord must verify that the actual
                management fee invoiced by the management company does not
                exceed this cap. The lease cap is an upper limit, not an
                automatic entitlement.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-mono text-foreground mb-2 text-xs leading-relaxed">
                &quot;...a management fee equal to [Y]% of Operating Expenses
                (excluding capital expenditures and Excluded Expenses), not to
                exceed [Z]% of the total amounts payable by Tenant as Additional
                Rent...&quot;
              </p>
              <p className="text-sm text-muted-foreground">
                This structure explicitly excludes capital expenditures and
                &quot;Excluded Expenses&quot; from the management fee base. The
                double cap (a percentage of expenses and a percentage of tenant
                additional rent) requires two separate calculations to confirm
                compliance.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            If the lease is silent on management fee recoverability, most
            well-advised tenants will argue the fee is non-recoverable absent
            explicit authorization. Market custom is not a substitute for lease
            language.
          </p>
        </section>

        {/* Three common errors */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Three Common Calculation Errors
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1">
                    Error 1: Applying the fee to excluded expenses
                  </p>
                  <p className="text-sm text-muted-foreground">
                    The most common management fee dispute involves applying the
                    fee percentage to the total operating expense pool -
                    including capital projects, reserves, landlord-specific
                    costs, and other non-recoverable items, rather than only the
                    recoverable CAM pool. On a building with $1.2M in total
                    expenses where $200,000 are excluded, applying a 4% fee to
                    $1.2M generates $48,000 in fees. The correct base is $1.0M,
                    producing a $40,000 fee. The $8,000 difference is billed to
                    tenants without authorization.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1">
                    Error 2: Using &quot;gross revenues&quot; when the lease
                    says &quot;gross operating revenues&quot;
                  </p>
                  <p className="text-sm text-muted-foreground">
                    These are different bases. &quot;Gross revenues&quot; is
                    broader: it may include insurance proceeds from a casualty
                    loss ($450,000), a condemnation award ($150,000), or
                    proceeds from a partial sale of an outparcel. Including
                    these windfalls in the management fee base inflates the
                    calculation significantly. If the lease says &quot;gross
                    operating revenues,&quot; those items are excluded by
                    definition, and using the broader base results in an
                    overbilling.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1">
                    Error 3: Double-counting via a separate oversight fee
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Some third-party management companies charge a base
                    management fee (e.g., 4% of gross revenues) and a separate
                    &quot;construction oversight,&quot; &quot;project
                    management,&quot; or &quot;asset management&quot; fee
                    layered on top for capital projects or major vendor
                    contracts. If both charges appear in the GL and both are
                    included in CAM, tenants are paying twice for the same
                    management function. The lease must explicitly authorize
                    both fees separately for both to be recoverable.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What auditors look for */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            What Auditors Look For
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            When a tenant or their auditor reviews management fee charges, the
            audit typically covers four areas:
          </p>
          <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground">
            <li className="leading-relaxed">
              <strong className="text-foreground">
                The management company&apos;s actual invoice.
              </strong>{" "}
              Auditors request the management agreement and invoices to verify
              that the amount billed to tenants matches what was actually paid
              to the management company. If the GL management fee line exceeds
              the management company&apos;s invoice, the excess is not
              recoverable.
            </li>
            <li className="leading-relaxed">
              <strong className="text-foreground">
                The calculation base used.
              </strong>{" "}
              Auditors reconstruct the management fee calculation from the GL
              export: total operating expenses billed, less excluded items, to
              determine what base was used. They then verify this matches the
              lease definition of &quot;gross revenues,&quot; &quot;gross
              operating revenues,&quot; or &quot;CAM expenses&quot; as
              applicable.
            </li>
            <li className="leading-relaxed">
              <strong className="text-foreground">
                The cap compliance test.
              </strong>{" "}
              If the lease caps the management fee at, for example, 4% of gross
              revenues, auditors calculate 4% × verified gross revenues and
              compare it to the management fee billed. Any excess above the cap
              is a credit.
            </li>
            <li className="leading-relaxed">
              <strong className="text-foreground">
                Consistency across the portfolio.
              </strong>{" "}
              In multi-tenant buildings, auditors look for whether the
              management fee calculation is applied consistently across all
              tenants or whether different tenants are using different bases, a
              common problem when a property is managed by a new team that
              inherited inconsistent practices.
            </li>
          </ol>
        </section>

        {/* What can go wrong */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-6">
            What Can Go Wrong
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Management fee billed on a gross expense total that includes
                    capital
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A property completes $350,000 in roof and HVAC capital work
                    in a single year. The management fee is calculated on the
                    full expense pool including the capital work. Even if the
                    capital expenditures themselves are excluded from CAM
                    recovery, the management fee on those items inflates the
                    recoverable pool. This creates a compounding error: the
                    capital costs are excluded, but the management fee on those
                    costs slips through unchallenged.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Management fee exceeds the lease cap and the excess is
                    billed
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A management company charges 5% of gross revenues as their
                    actual fee, but the lease caps management fee recovery at
                    3%. The landlord passes through the full 5%, creating a 2%
                    excess on every dollar of gross revenues. On a $4M gross
                    revenue property, the tenant overpays $80,000 per year -
                    compounded by their proportionate share across multiple
                    tenants.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Internal management fees with no supporting invoice
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When the landlord self-manages the property through an
                    affiliated entity, the management fee is an intercompany
                    transfer, not an arms-length payment. Auditors request the
                    management agreement and supporting payroll or cost
                    documentation. If the landlord cannot demonstrate actual
                    costs incurred, the management fee recovery may be
                    challenged as unsubstantiated, even if it is within the
                    lease cap.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-6">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                Why are management fees one of the most common CAM dispute
                items?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Management fees are disputed frequently because the calculation
                base is easy to mis-state. Applying the fee percentage to total
                expenses rather than only the recoverable pool generates an
                overcharge that compounds across every tenant and every
                reconciliation year. Auditors screen for this pattern routinely.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                What is the difference between a management fee on gross
                revenues vs. a fee on CAM expenses?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A fee on gross revenues uses total rental income as the base. A
                fee on CAM expenses uses the recoverable operating expense pool.
                These produce different dollar amounts on the same property. The
                lease controls which structure applies. The two methods are not
                interchangeable.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                Can a landlord charge both a property management fee and a
                separate oversight fee?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Only if the lease explicitly authorizes both fees and defines
                their separate bases. A fee labeled &quot;asset management&quot;
                or &quot;construction oversight&quot; charged in addition to the
                base management fee is generally not recoverable as CAM without
                specific lease language permitting it.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                What does &quot;gross operating revenues&quot; mean vs.
                &quot;gross revenues&quot;?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                &quot;Gross operating revenues&quot; typically excludes
                insurance proceeds, condemnation awards, and asset sale proceeds
                These items are not generated by ordinary property operations.
                Using the broader &quot;gross revenues&quot; base when the lease
                specifies &quot;gross operating revenues&quot; inflates the
                management fee calculation.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Related Resources
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              {
                title: "Recoverable vs. Non-Recoverable CAM",
                href: "/resources/recoverable-vs-nonrecoverable-cam",
                description:
                  "Which operating costs can you pass through to tenants",
              },
              {
                title: "CAM Dispute Trends 2026",
                href: "/resources/cam-dispute-trends-2026",
                description:
                  "The most common CAM billing errors tenants are finding this year",
              },
              {
                title: "Management Fee Recoverability",
                href: "/resources/management-fee-recoverability-cam",
                description:
                  "How to correctly calculate and cap management fee recovery",
              },
              {
                title: "How to Respond to a CAM Dispute",
                href: "/resources/cam-dispute-response",
                description:
                  "Step-by-step process for handling tenant audit disputes",
              },
              {
                title: "CAM Reconciliation Software",
                href: "/cam-reconciliation-software",
                description:
                  "Automate management fee base calculation and cap compliance checks",
              },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <p className="font-medium group-hover:text-primary text-sm">
                  {link.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {link.description}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground text-background p-8 text-center">
          <h2 className="text-xl font-bold mb-2">
            Catch Management Fee Errors Before Tenants Do
          </h2>
          <p className="text-background/70 mb-6 text-sm">
            CapVeri automatically verifies your management fee calculation base
            against your lease language, so you know the number is defensible
            before you send the reconciliation statement.
          </p>
          <Button asChild variant="secondary" size="lg">
            <a
              href={buildTrialLink({ content: "management_fee_disputes_cta" })}
            >
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
