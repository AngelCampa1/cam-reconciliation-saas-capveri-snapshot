import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title:
    "Recoverable vs. Non-Recoverable CAM Expenses: A Landlord's Guide (2026)",
  description:
    "Which operating expenses can you pass through to tenants? A definitive guide to recoverable vs. non-recoverable CAM for NNN, modified gross, and full gross leases, with common exclusions.",
  alternates: {
    canonical: `${SITE_URL}/resources/recoverable-vs-nonrecoverable-cam`,
  },
  openGraph: {
    title: "Recoverable vs. Non-Recoverable CAM Expenses: A Landlord's Guide",
    description:
      "Which operating expenses can you pass through to tenants? A definitive guide to recoverable vs. non-recoverable CAM for NNN, modified gross, and full gross leases.",
    url: `${SITE_URL}/resources/recoverable-vs-nonrecoverable-cam`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question:
      "What is the difference between recoverable and non-recoverable CAM expenses?",
    answer:
      "Recoverable expenses are operating costs that the lease explicitly permits to be passed through to tenants as CAM. Non-recoverable expenses are excluded by lease carve-outs (e.g., capital improvements, financing costs, depreciation) or are inherently excluded by market custom. Always verify recoverability against the specific lease language, not market custom alone.",
  },
  {
    question: "Are management fees recoverable as CAM?",
    answer:
      "Management fees are generally recoverable, but most leases cap the recovery at 3–5% of gross revenues or 10–15% of total CAM. The fee must be calculated only on recoverable expenses. Applying the management fee percentage to excluded expenses (like capital items) results in an inflated recovery and creates tenant audit exposure.",
  },
  {
    question: "Are capital improvements recoverable under a NNN lease?",
    answer:
      "Capital improvements (roof replacement, HVAC replacement, parking lot resurfacing) are generally not recoverable as CAM under standard NNN leases. Some leases permit amortization of capital items. The landlord may recover the annual amortized portion (cost divided by useful life) rather than the full capital outlay in the year incurred. The lease must explicitly authorize this.",
  },
  {
    question: "Can depreciation be billed to tenants as a CAM expense?",
    answer:
      "No. Depreciation is a non-cash accounting entry and is universally excluded from CAM under well-drafted leases. Some landlords attempt to pass through 'capital amortization' without having lease language permitting it. This is effectively depreciation by another name and creates significant tenant audit risk.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Recoverable vs. Non-Recoverable CAM",
    url: `${SITE_URL}/resources/recoverable-vs-nonrecoverable-cam`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline: "Recoverable vs. Non-Recoverable CAM Expenses: A Landlord's Guide",
  description:
    "Which operating expenses can you pass through to tenants? A definitive guide to recoverable vs. non-recoverable CAM for NNN, modified gross, and full gross leases.",
  url: `${SITE_URL}/resources/recoverable-vs-nonrecoverable-cam`,
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
});

const lineItems: {
  item: string;
  category: string;
  classification: "Recoverable" | "Non-Recoverable" | "Depends on Lease";
}[] = [
  {
    item: "Janitorial / cleaning services",
    category: "Operations",
    classification: "Recoverable",
  },
  {
    item: "Landscaping and grounds maintenance",
    category: "Operations",
    classification: "Recoverable",
  },
  {
    item: "Parking lot maintenance (sealing, striping)",
    category: "Operations",
    classification: "Recoverable",
  },
  {
    item: "Snow removal and ice treatment",
    category: "Operations",
    classification: "Recoverable",
  },
  {
    item: "Trash removal and recycling",
    category: "Operations",
    classification: "Recoverable",
  },
  {
    item: "Common area utilities (lighting, HVAC)",
    category: "Utilities",
    classification: "Recoverable",
  },
  {
    item: "Property insurance (fire, liability, casualty)",
    category: "Insurance",
    classification: "Recoverable",
  },
  {
    item: "Real estate / property tax",
    category: "Taxes",
    classification: "Recoverable",
  },
  {
    item: "HVAC preventive maintenance contracts",
    category: "Maintenance",
    classification: "Recoverable",
  },
  {
    item: "Security services and monitoring",
    category: "Operations",
    classification: "Recoverable",
  },
  {
    item: "Property management fees (within cap)",
    category: "Management",
    classification: "Depends on Lease",
  },
  {
    item: "HVAC equipment replacement (capital)",
    category: "Capital",
    classification: "Non-Recoverable",
  },
  {
    item: "Roof replacement (capital)",
    category: "Capital",
    classification: "Non-Recoverable",
  },
  {
    item: "Parking lot resurfacing (full replacement)",
    category: "Capital",
    classification: "Non-Recoverable",
  },
  {
    item: "Cosmetic upgrades / lobby renovations",
    category: "Capital",
    classification: "Non-Recoverable",
  },
  {
    item: "Depreciation (any form)",
    category: "Accounting",
    classification: "Non-Recoverable",
  },
  {
    item: "Mortgage interest / debt service",
    category: "Financing",
    classification: "Non-Recoverable",
  },
  {
    item: "Ground lease payments",
    category: "Financing",
    classification: "Non-Recoverable",
  },
  {
    item: "Leasing commissions / TI allowances",
    category: "Leasing",
    classification: "Non-Recoverable",
  },
  {
    item: "Income tax / franchise tax",
    category: "Taxes",
    classification: "Non-Recoverable",
  },
  {
    item: "Capital amortization (if authorized by lease)",
    category: "Capital",
    classification: "Depends on Lease",
  },
  {
    item: "Roof repairs (patching, not replacement)",
    category: "Maintenance",
    classification: "Depends on Lease",
  },
];

export default function RecoverableVsNonRecoverableCAMPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />

      {/* Header */}
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
            <span className="text-foreground">
              Recoverable vs. Non-Recoverable CAM
            </span>
          </nav>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Recoverable vs. Non-Recoverable CAM Expenses: A Landlord&apos;s
            Guide
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-2xl">
            Which operating costs can you pass through to tenants? Which ones
            create audit exposure if you try?
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
        {/* Featured snippet box */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 mb-10">
          <h2 className="text-base font-semibold text-foreground mb-2">
            Quick Answer
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Recoverable expenses are operating costs that the lease explicitly
            permits to be passed through to tenants as CAM. Non-recoverable
            expenses are excluded by lease carve-outs or are inherently capital
            in nature. The distinction is lease-specific. Market custom is a
            guide, not a rule. Always verify against the actual lease language
            before billing a tenant.
          </p>
        </div>

        {/* The capital vs. operating distinction */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            The Capital vs. Operating Distinction
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            The foundational principle in CAM recoverability is the difference
            between <strong>operating expenses</strong> and{""}
            <strong>capital expenditures</strong>. Operating expenses are
            recurring costs of maintaining and running the property in its
            current condition: janitorial, utilities, routine maintenance. They
            are generally recoverable under NNN leases.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Capital expenditures are costs that extend the useful life of a
            building component, replace an asset entirely, or improve the
            property beyond its original condition. A roof repair (patching a
            section of membrane) may be an operating expense; a full roof
            replacement is a capital expenditure. An HVAC service contract is
            operating; replacing a rooftop unit is capital.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Standard NNN leases exclude capital expenditures from CAM recovery.
            Some leases permit <strong>amortization of capital items</strong> -
            the landlord may recover the annual amortized portion (total cost
            divided by useful life, typically per IRS MACRS schedules) rather
            than the full outlay. This must be explicitly authorized by the
            lease.
          </p>
        </section>

        {/* Classification table */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            CAM Line Item Classification Table
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            The following table classifies 22 common operating expense line
            items. &quot;Depends on Lease&quot; items require specific lease
            language to be recoverable. Do not assume recoverability for these
            categories.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Expense Line Item
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Category
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Classification
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lineItems.map((row) => (
                  <tr key={row.item} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-foreground align-top">
                      {row.item}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground align-top">
                      {row.category}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={
                          row.classification === "Recoverable"
                            ? "text-green-700  font-medium"
                            : row.classification === "Non-Recoverable"
                              ? "text-destructive-strong font-medium"
                              : "text-amber-700  font-medium"
                        }
                      >
                        {row.classification}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Management fee caps */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Management Fee Recoverability and Caps
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Property management fees are recoverable under most NNN leases, but
            with two critical constraints:
          </p>
          <div className="space-y-4 mb-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                Cap on recovery amount
              </p>
              <p className="text-sm text-muted-foreground">
                The lease typically caps management fee recovery at{""}
                <strong>3–5% of gross revenues</strong> from the property, or
                {""}
                <strong>10–15% of total recoverable CAM expenses</strong>. The
                specific cap figure is in the lease. Do not apply a market
                standard if the lease is silent on the amount.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                Fee must be calculated on recoverable expenses only
              </p>
              <p className="text-sm text-muted-foreground">
                If the management fee is expressed as a percentage of expenses,
                that percentage must be applied only to the recoverable expense
                pool, not the total expense pool including non-recoverable
                items. Applying the management fee to a gross expense total that
                includes capital expenditures or excluded items inflates the
                recovery and is the most common management-fee audit finding.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            For a detailed analysis of management fee recoverability, see the
            {""}
            <Link
              href="/resources/management-fee-recoverability-cam"
              className="text-primary hover:underline"
            >
              Management Fee Recoverability Guide
            </Link>
            .
          </p>
        </section>

        {/* Lease carve-outs */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Lease Exclusion Carve-Outs: Market Standard vs. Negotiated
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            NNN leases typically include an exclusion list, a set of items the
            landlord cannot bill as CAM. These fall into two categories:
          </p>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                Market-standard exclusions (present in most well-drafted NNN
                leases)
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Capital expenditures and improvements</li>
                <li>Financing costs, mortgage interest, and debt service</li>
                <li>
                  Depreciation and amortization (unless explicitly permitted)
                </li>
                <li>Leasing commissions and tenant improvement costs</li>
                <li>
                  Income, franchise, and gains taxes on the landlord&apos;s
                  income
                </li>
                <li>Costs of correcting original construction defects</li>
              </ul>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                Negotiated exclusions (tenant-specific, vary by deal)
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>
                  Costs related to other specific tenants or vacant space
                  preparation
                </li>
                <li>Expenses recovered from insurance or warranty proceeds</li>
                <li>
                  Owner&apos;s overhead, including corporate travel and
                  entertainment
                </li>
                <li>Environmental remediation for pre-existing conditions</li>
                <li>
                  Costs arising from landlord negligence or willful misconduct
                </li>
              </ul>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Older leases (particularly those drafted before 2005) often have
            thin exclusion language. Newer institutional leases commonly include
            two to four pages of exclusions. If a lease has a short exclusion
            list, do not assume the absence of an item makes it recoverable.
            Check whether your jurisdiction&apos;s case law implies additional
            exclusions.
          </p>
        </section>

        {/* What Can Go Wrong */}
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
                    Treating multi-year capital projects as operating expenses
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A full parking lot resurfacing ($180,000) billed entirely in
                    year one creates a CAM spike that triggers tenant audits.
                    Even if the lease permits amortized capital recovery,
                    billing the full capital outlay in a single year rather than
                    the annual amortized slice overstates the recoverable pool
                    and exposes the landlord to credits plus interest.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Applying the management fee percentage to excluded expenses
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A landlord with $500,000 in total expenses ($400,000
                    recoverable, $100,000 excluded as capital items) applies a
                    4% management fee to the full $500,000 total, billing
                    $20,000 in management fees. The correct calculation is 4% x
                    $400,000 = $16,000. The $4,000 difference compounds across
                    all tenants and multiple years.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Passing through depreciation disguised as
                    &quot;amortization&quot;
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Billing a line item labeled &quot;capital amortization&quot;
                    or &quot;building reserve&quot; without explicit lease
                    language authorizing capital amortization recovery is
                    effectively billing depreciation. This is one of the most
                    litigated CAM issues. Tenants who audit find this pattern
                    frequently and are entitled to full credits for all years
                    billed.
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
                What is the difference between recoverable and non-recoverable
                CAM expenses?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Recoverable expenses are operating costs the lease explicitly
                permits to be passed through to tenants as CAM. Non-recoverable
                expenses are excluded by lease carve-outs or are inherently
                capital in nature. Always verify against the specific lease. Do
                not rely on market custom alone.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                Are management fees recoverable as CAM?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Generally yes, but with caps. Most leases limit recovery to 3–5%
                of gross revenues or 10–15% of total CAM. The fee must be
                applied only to the recoverable expense pool, not to excluded
                items like capital expenditures.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                Are capital improvements recoverable under a NNN lease?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Generally no. Some leases allow amortized recovery of capital
                items. The annual amortized portion (cost divided by useful
                life) may be recoverable if the lease explicitly authorizes it.
                The full capital outlay is never recoverable in a single year
                under a standard NNN lease.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                Can depreciation be billed to tenants as CAM?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                No. Depreciation is a non-cash accounting entry and is
                universally excluded from CAM. Billing &quot;capital
                amortization&quot; without specific lease authorization is
                effectively depreciation and creates significant tenant audit
                risk.
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
                title: "What Are CAM Charges?",
                href: "/resources/what-are-cam-charges",
                description:
                  "Foundational overview of common area maintenance charges",
              },
              {
                title: "Management Fee Recoverability",
                href: "/resources/management-fee-recoverability-cam",
                description:
                  "How to correctly calculate and cap management fee recovery",
              },
              {
                title: "CapEx vs. OpEx in CAM",
                href: "/resources/capex-vs-opex-cam",
                description:
                  "Detailed framework for classifying capital vs. operating expenses",
              },
              {
                title: "Capital Expenditures Recoverable in CAM",
                href: "/resources/capital-expenditures-recoverable-in-cam",
                description:
                  "When and how capital items can be recovered through amortization",
              },
              {
                title: "CAM Reconciliation Software",
                href: "/cam-reconciliation-software",
                description:
                  "Automate expense classification and recoverability checks",
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
            Stop Guessing What&apos;s Recoverable
          </h2>
          <p className="text-background/70 mb-6 text-sm">
            CapVeri classifies every GL line item against your lease exclusion
            schedule automatically. You only bill what you can defend in an
            audit.
          </p>
          <Button asChild variant="secondary" size="lg">
            <a
              href={buildTrialLink({
                content: "recoverable_nonrecoverable_cta",
              })}
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
