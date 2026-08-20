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
    "Pro-Rata Denominator Explained: The Hidden Variable in CAM Calculations (2026)",
  description:
    "The denominator in your pro-rata share calculation is defined by the lease and is often wrong. This guide explains denominator types, anchor exclusions, and how to verify your numbers.",
  alternates: {
    canonical: `${SITE_URL}/resources/pro-rata-denominator-explained`,
  },
  openGraph: {
    title:
      "Pro-Rata Denominator Explained: The Hidden Variable in CAM Calculations",
    description:
      "Denominator types, anchor exclusions, and how to verify the pro-rata denominator in your CAM calculations.",
    url: `${SITE_URL}/resources/pro-rata-denominator-explained`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is the pro-rata denominator in a commercial lease?",
    answer:
      "The pro-rata denominator is the total square footage figure used to calculate each tenant's share of CAM expenses. It is defined by the lease and may differ significantly from the building's actual or total rentable area. Common denominator types include total rentable area, total leasable area, a fixed contractual number, or occupied area - each producing different pro-rata percentages.",
  },
  {
    question:
      "What is the difference between total rentable area and total leasable area?",
    answer:
      "Total Rentable Area (TRA) includes all leasable space plus common areas allocated to tenants per BOMA measurement standards. Total Leasable Area (TLA) includes only the space that can be directly leased to tenants - it typically excludes shared common areas like lobbies and mechanical rooms. TRA is typically larger than TLA, so using TRA as the denominator results in lower pro-rata percentages for each tenant.",
  },
  {
    question:
      "What is an anchor exclusion and how does it affect the denominator?",
    answer:
      "An anchor exclusion removes an anchor tenant's square footage from the CAM denominator, despite that tenant occupying a large portion of the building. When a 100,000 SF anchor is excluded from a 400,000 SF building's denominator, the denominator becomes 300,000 SF. All other tenants' pro-rata shares are calculated against the smaller base - materially increasing their percentage and their CAM obligation. Anchor exclusions must be explicitly checked in each lease.",
  },
  {
    question: "How do I verify the correct pro-rata denominator for a tenant?",
    answer:
      "Review the lease for the definition of 'denominator,' 'project area,' or 'total rentable area' in the CAM clause. Compare the lease-defined figure against the BOMA measurement certificate for the building. Verify the rent roll to confirm each tenant's leased SF matches the lease abstract. If the lease specifies a fixed contractual denominator, use that number regardless of actual building area changes.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Pro-Rata Denominator Explained",
    url: `${SITE_URL}/resources/pro-rata-denominator-explained`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline:
    "Pro-Rata Denominator Explained: The Hidden Variable in CAM Calculations",
  description:
    "Denominator types, anchor exclusions, and how to verify the pro-rata denominator in your CAM calculations.",
  url: `${SITE_URL}/resources/pro-rata-denominator-explained`,
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
});

export default function ProRataDenominatorExplainedPage() {
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
              Pro-Rata Denominator Explained
            </span>
          </nav>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Pro-Rata Denominator Explained: The Hidden Variable in CAM
            Calculations
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-2xl">
            The denominator is defined by the lease, and it is frequently wrong.
            Understanding denominator types and anchor exclusions is important
            for accurate CAM billing.
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
            The pro-rata denominator is the total square footage figure used to
            calculate each tenant&apos;s share of CAM expenses. It is defined by
            the lease and may differ from the building&apos;s actual rentable
            area. Using the wrong denominator, even by a few thousand square
            feet, results in systematic over- or underbilling for every tenant
            in every reconciliation year.
          </p>
        </div>

        {/* Four denominator types */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            The Four Denominator Types
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                1. Total Rentable Area (TRA)
              </p>
              <p className="text-sm text-muted-foreground">
                All space in the building that generates rent, measured per BOMA
                standards. Includes tenant-usable space plus the tenant&apos;s
                share of common areas (lobbies, corridors, restrooms). TRA is
                the most common denominator in office leases. Because it
                includes common area allocations, it produces a higher total SF
                and therefore a lower pro-rata percentage for each tenant.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                2. Total Leasable Area (TLA)
              </p>
              <p className="text-sm text-muted-foreground">
                Only the space that can be directly leased, typically excluding
                building common areas, mechanical rooms, and lobbies. GLA (Gross
                Leasable Area) is the retail equivalent term. TLA is generally
                smaller than TRA, so it produces higher pro-rata percentages for
                tenants. Common in retail strip centers and power centers.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                3. Fixed Contractual Denominator
              </p>
              <p className="text-sm text-muted-foreground">
                The lease specifies a fixed number regardless of actual building
                area or tenant mix. Example: &quot;Tenant&apos;s pro-rata share
                shall be 8.33% (based on a fixed denominator of 120,000
                SF).&quot; This protects tenants from denominator changes if the
                building is renovated or remeasured. It also protects the
                landlord from administrative errors in denominator maintenance.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                4. Occupied Area (Floating Denominator)
              </p>
              <p className="text-sm text-muted-foreground">
                Pro-rata is calculated as tenant SF ÷ currently occupied SF.
                This denominator floats with occupancy. If the building goes
                from 90% to 80% occupied, all remaining tenants&apos; pro-rata
                percentages increase automatically. Most institutional landlords
                avoid this structure because it produces unpredictable annual
                changes. Where a lease uses occupied area as the denominator, a
                gross-up clause is typically paired with it.
              </p>
            </div>
          </div>
        </section>

        {/* Impact on CAM - worked example */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            How Denominator Type Affects What a Tenant Pays
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Consider a tenant in a 200,000 SF retail property leasing 15,000 SF.
            The property has 20,000 SF of common area. Total recoverable CAM
            pool: $600,000. The following table shows what the tenant pays under
            each denominator definition:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-foreground">
                    Denominator Type
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-foreground">
                    Denominator SF
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-foreground">
                    Pro-Rata %
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-foreground">
                    Tenant CAM
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-foreground">
                    Total Rentable Area (TRA)
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-right">
                    200,000
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-right">
                    7.50%
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground text-right">
                    $45,000
                  </td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-foreground">
                    Total Leasable Area / GLA (excludes 20k common)
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-right">
                    180,000
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-right">
                    8.33%
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground text-right">
                    $50,000
                  </td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-foreground">
                    Fixed Contractual (lease says 180,000)
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-right">
                    180,000
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-right">
                    8.33%
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground text-right">
                    $50,000
                  </td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-foreground">
                    Occupied Area (85% occupancy = 153,000 SF)
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-right">
                    153,000
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-right">
                    9.80%
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground text-right">
                    $58,824
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            The same tenant pays $45,000 or $58,824, a $13,824 difference,
            depending solely on which denominator is applied. This is why
            denominator verification is not a minor administrative task.
          </p>
        </section>

        {/* Anchor exclusions */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Anchor Exclusions: The Denominator Risk in Retail Properties
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Many retail shopping center leases, particularly those with
            department stores, grocery anchors, or big-box retailers, contain
            anchor exclusion provisions. These provisions exclude the
            anchor&apos;s square footage from the CAM denominator used to
            calculate all other tenants&apos; shares.
          </p>
          <div className="font-mono text-xs bg-muted rounded-lg p-4 border border-border mb-4">
            <div className="text-muted-foreground mb-2">
              Example: 500,000 SF power center with a 120,000 SF anchor
              exclusion
            </div>
            <div>Total Building GLA: 500,000 SF</div>
            <div>Anchor Tenant (excluded from denominator): 120,000 SF</div>
            <div>Effective Denominator for all other tenants: 380,000 SF</div>
            <div className="mt-2">In-line tenant with 8,000 SF:</div>
            <div>Pro-rata with anchor included: 8,000 ÷ 500,000 = 1.60%</div>
            <div>
              Pro-rata with anchor excluded: 8,000 ÷ 380,000 ={" "}
              <strong>2.11%</strong>
            </div>
            <div className="text-muted-foreground mt-1">
              At $400,000 CAM pool: tenant pays $6,400 vs. $8,421 - a $2,021
              annual difference from the denominator alone
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Anchor exclusions are typically reciprocal. The anchor pays its own
            CAM separately at a negotiated fixed or capped amount, and in
            exchange its SF is removed from the shared pool denominator. The
            practical effect is that the anchor&apos;s share of variable costs
            is redistributed to smaller in-line tenants. Smaller tenants in
            anchor-excluding centers pay a materially higher effective CAM rate
            per SF than the headline denominator would suggest.
          </p>
        </section>

        {/* How to verify */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            How to Verify the Denominator Against the Lease
          </h2>
          <div className="space-y-4">
            {[
              {
                step: 1,
                title:
                  "Read the CAM and pro-rata share definitions in the lease",
                detail:
                  "The pro-rata definition is typically in the CAM clause or the lease definitions section. Look for language like 'total rentable area of the building,' 'gross leasable area,' or a fixed square footage number. Note whether anchor exclusions or exclusion zones are referenced.",
              },
              {
                step: 2,
                title: "Obtain the BOMA measurement certificate",
                detail:
                  "Request the current BOMA measurement certificate for the property. The certificate specifies total rentable area, each tenant's usable and rentable square footage, and how common areas are allocated. If the building has been renovated since the lease was executed, the BOMA measurement may have changed.",
              },
              {
                step: 3,
                title:
                  "Reconcile the lease-defined denominator to the BOMA measurement",
                detail:
                  "Compare the denominator defined in the lease to the current BOMA total rentable area. If the lease specifies a fixed denominator, use that regardless of the current BOMA figure. If the lease references 'total rentable area' dynamically, confirm the BOMA measurement is current.",
              },
              {
                step: 4,
                title: "Verify anchor exclusions are applied consistently",
                detail:
                  "If any tenant leases include anchor exclusion provisions, confirm the same exclusion is applied consistently across all non-anchor tenant bills. A common error is applying the anchor exclusion for some tenants but not others, producing inconsistent pro-rata shares that add up to more than 100%.",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-4">
                <div className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {item.step}
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="font-semibold text-foreground text-sm mb-1">
                    {item.title}
                  </p>
                  <p className="text-sm text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
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
                    Using occupied SF instead of total leasable SF
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Property management systems often default to occupied square
                    footage from the rent roll, not the lease-defined
                    denominator. If the lease says &quot;total rentable
                    area&quot; but the system is using the current occupied SF
                    (which changes as tenants turn over), every reconciliation
                    statement has the wrong denominator. In a building going
                    from 90% to 80% occupied, tenant shares increase by over 12%
                    with no change in expenses.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Not updating the denominator after renovations that changed
                    building RSF
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A building expansion or major renovation may change the
                    building&apos;s total rentable area. If the lease references
                    &quot;total rentable area&quot; dynamically and the BOMA
                    measurement changed but the denominator was not updated, the
                    pro-rata shares are incorrect. Conversely, if a
                    lease-defined fixed denominator is incorrectly updated after
                    a renovation, tenants may dispute the change without a lease
                    amendment.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Anchor exclusion not reflected consistently across all
                    tenant bills
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    In a center where one anchor&apos;s 100,000 SF is excluded
                    from the denominator, some tenants&apos; bills use the
                    400,000 SF denominator (anchor excluded) while others use
                    the 500,000 SF denominator (anchor included). This creates
                    inconsistent pro-rata shares that sum to either more or less
                    than 100% of recoverable expenses, and exposes the landlord
                    to tenants comparing bills with each other.
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
                What is the pro-rata denominator in a commercial lease?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The total square footage figure used to calculate each
                tenant&apos;s share of CAM expenses. It is defined by the lease
                and may differ from actual building area. Common types: total
                rentable area, total leasable area, a fixed contractual number,
                or occupied area.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                What is the difference between TRA and TLA?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Total Rentable Area (TRA) includes leasable space plus common
                area allocations per BOMA standards. Total Leasable Area (TLA)
                includes only directly leasable space. TRA is larger, so it
                produces lower pro-rata percentages. TLA is smaller and common
                in retail properties.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                What is an anchor exclusion and how does it affect the
                denominator?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                An anchor exclusion removes the anchor tenant&apos;s square
                footage from the denominator, which increases all other
                tenants&apos; pro-rata shares. In a 500,000 SF center with a
                120,000 SF anchor excluded, the effective denominator becomes
                380,000 SF, increasing in-line tenants&apos; shares by 32%.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                How do I verify the correct pro-rata denominator?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Read the CAM and pro-rata definitions in the lease. Obtain the
                BOMA measurement certificate. If the lease specifies a fixed
                denominator, use that number regardless of building area
                changes. Verify anchor exclusions are applied consistently
                across all non-anchor tenant bills.
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
                title: "CAM Gross-Up Guide",
                href: "/resources/cam-gross-up-guide",
                description:
                  "Gross-up mechanics and how they interact with the denominator",
              },
              {
                title: "Pro-Rata Share Validation",
                href: "/resources/pro-rata-share-validation",
                description:
                  "How to audit and validate pro-rata share calculations",
              },
              {
                title: "Anchor Exclusion Denominator Risk",
                href: "/resources/anchor-exclusion-denominator-risk",
                description:
                  "The financial impact of anchor exclusions on in-line tenants",
              },
              {
                title: "Pro-Rata Calculator",
                href: "/tools/pro-rata-calculator",
                description:
                  "Model pro-rata shares with anchor exclusions and variable denominators",
              },
              {
                title: "CAM Reconciliation Software",
                href: "/cam-reconciliation-software",
                description:
                  "Verify denominator definitions across all tenant leases automatically",
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
            Catch Denominator Errors Before Tenants Do
          </h2>
          <p className="text-background/70 mb-6 text-sm">
            CapVeri verifies each tenant&apos;s pro-rata denominator against the
            lease abstract and flags anchor exclusion inconsistencies across
            your entire portfolio automatically.
          </p>
          <Button asChild variant="secondary" size="lg">
            <a href={buildTrialLink({ content: "pro_rata_denominator_cta" })}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
