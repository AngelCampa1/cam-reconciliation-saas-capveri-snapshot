import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "BOMA 2024 Outdoor Areas and CAM: What Changed for Landlords (2026)",
  description:
    "BOMA 2024 introduced new measurement standards for outdoor areas including covered parking, exterior corridors, and amenity spaces. Here's how these changes affect your CAM denominator and reconciliation.",
  alternates: {
    canonical: `${SITE_URL}/resources/boma-2024-outdoor-areas-cam`,
  },
  openGraph: {
    title: "BOMA 2024 Outdoor Areas and CAM: What Changed for Landlords",
    description:
      "BOMA 2024 expanded outdoor and semi-enclosed area measurement. Here's how it affects your CAM denominator, pro-rata calculations, and existing tenant leases.",
    url: `${SITE_URL}/resources/boma-2024-outdoor-areas-cam`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What did BOMA 2024 change about outdoor area measurement?",
    answer:
      "BOMA 2024 expanded the methodology for measuring outdoor and semi-enclosed areas, including covered parking structures, exterior common corridors, transitional spaces between interior and exterior (such as covered walkways and canopied entries), and outdoor amenity areas (rooftop terraces, courtyards). Under prior BOMA standards, these areas were often excluded from rentable area calculations or measured inconsistently. BOMA 2024 provides explicit inclusion and allocation methods for these space types.",
  },
  {
    question: "Do existing leases automatically adopt BOMA 2024 measurements?",
    answer:
      "No. Existing leases do not automatically adopt BOMA 2024 measurement standards. The lease must explicitly reference BOMA 2024 or include language stating that measurements will be updated to the current BOMA standard. Most leases reference the BOMA standard in effect at the time of execution. To apply BOMA 2024 measurements to an existing lease, you need either a lease amendment or specific lease language permitting measurement updates.",
  },
  {
    question:
      "If BOMA 2024 increases the building's rentable area, what happens to pro-rata shares?",
    answer:
      "If the total rentable area increases under BOMA 2024 (because outdoor areas are now included), and the lease uses 'total rentable area' as the denominator dynamically, each tenant's pro-rata share percentage would decrease - the denominator got larger while the tenant's leased SF stayed the same. However, this only applies if the lease permits denominator updates based on new BOMA measurements. A fixed contractual denominator is unaffected.",
  },
  {
    question:
      "What is 'BOMA 2024-aligned where applicable' and why not 'BOMA 2024 compliant'?",
    answer:
      "A building is 'BOMA 2024-aligned where applicable' when its measurement methodology follows BOMA 2024 standards for the space types addressed by the 2024 standard, recognizing that some space categories may still be governed by prior standards referenced in existing leases. 'BOMA 2024 compliant' implies full certification - a formal designation that requires a certified measurement by a BOMA-credentialed professional and may not apply to all buildings or space types.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "BOMA 2024 Outdoor Areas and CAM",
    url: `${SITE_URL}/resources/boma-2024-outdoor-areas-cam`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline: "BOMA 2024 Outdoor Areas and CAM: What Changed for Landlords",
  description:
    "BOMA 2024 expanded outdoor and semi-enclosed area measurement. Here's how it affects your CAM denominator, pro-rata calculations, and existing tenant leases.",
  url: `${SITE_URL}/resources/boma-2024-outdoor-areas-cam`,
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
});

export default function BOMA2024OutdoorAreasCAMPage() {
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
            <Link
              href="/resources/boma"
              className="hover:text-foreground transition-colors duration-200"
            >
              BOMA
            </Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">BOMA 2024 Outdoor Areas</span>
          </nav>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            BOMA 2024 Outdoor Areas and CAM: What Changed for Landlords
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-2xl">
            BOMA 2024 expanded how outdoor and semi-enclosed areas are measured.
            Here&apos;s what changed, how it affects your CAM denominator, and
            what you need to check in your existing leases before applying new
            measurements.
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
            BOMA 2024 expanded the measurement methodology for outdoor and
            semi-enclosed areas (covered parking structures, exterior corridors,
            transitional spaces, and amenity areas), potentially changing the
            total rentable area of your property. This directly affects the
            denominator used in pro-rata CAM calculations. However, existing
            leases do not automatically adopt BOMA 2024 measurements unless the
            lease references the 2024 standard or permits measurement updates.
          </p>
        </div>

        {/* What BOMA 2024 changed */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            What BOMA 2024 Changed for Outdoor Areas
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Prior BOMA standards (2017, 2012, and earlier) were primarily
            focused on interior building space. Outdoor and transitional spaces
            were either excluded from rentable area measurements or handled
            inconsistently across measurement firms. BOMA 2024 introduced
            explicit methodology for four categories of outdoor space:
          </p>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                Covered Parking Structures
              </p>
              <p className="text-sm text-muted-foreground">
                Multi-level parking structures with a roof or partial enclosure
                may now be included in rentable area calculations under BOMA
                2024, based on the degree of enclosure and intended use. Surface
                parking lots remain excluded. The inclusion of parking structure
                area can meaningfully increase the total rentable area of
                properties with large structured parking - particularly office
                campuses and mixed-use developments.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                Exterior Common Corridors and Covered Walkways
              </p>
              <p className="text-sm text-muted-foreground">
                Covered exterior walkways connecting buildings, canopied
                entries, and exterior corridors between building wings are
                addressed explicitly in BOMA 2024. These areas, previously
                categorized inconsistently, now have a defined measurement
                methodology based on whether they are weather-protected and
                serve tenant circulation. When included in the rentable area
                base, they are allocated to tenants as a common area load
                factor.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                Outdoor Amenity Areas
              </p>
              <p className="text-sm text-muted-foreground">
                Rooftop terraces, courtyards, and outdoor common amenity spaces
                that are actively programmed for tenant use may be included in
                the building&apos;s common area under BOMA 2024. This is a
                significant departure from prior practice, where outdoor
                amenities were typically excluded from rentable area even if
                tenants paid maintenance costs for them through CAM.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                Transitional Spaces Between Interior and Exterior
              </p>
              <p className="text-sm text-muted-foreground">
                Spaces at the boundary of interior and exterior - covered
                loading areas, semi-enclosed lobbies with operable wall systems,
                and enclosed atria with exterior-facing features - receive more
                detailed treatment in BOMA 2024. The standard provides specific
                criteria for determining whether these spaces are measured as
                interior rentable area or excluded.
              </p>
            </div>
          </div>
        </section>

        {/* Impact on CAM denominator */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            How BOMA 2024 Affects the CAM Denominator
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            The CAM pro-rata denominator is the total square footage base
            against which each tenant&apos;s share is calculated. If BOMA 2024
            remeasurement adds outdoor areas to the total rentable area, the
            denominator increases - and each tenant&apos;s pro-rata percentage
            decreases (assuming their leased SF is unchanged).
          </p>
          <div className="font-mono text-xs bg-muted rounded-lg p-4 border border-border mb-4">
            <div className="text-muted-foreground mb-2">
              Example: Office campus with covered parking and rooftop terrace
            </div>
            <div>Prior BOMA measurement (interior only): 180,000 RSF</div>
            <div>
              BOMA 2024-aligned measurement (adds covered parking + terrace):{" "}
              <strong>195,000 RSF</strong>
            </div>
            <div className="mt-2">Tenant with 12,000 SF leased:</div>
            <div>
              Pro-rata under prior measurement: 12,000 ÷ 180,000 = 6.67%
            </div>
            <div>
              Pro-rata under BOMA 2024: 12,000 ÷ 195,000 ={" "}
              <strong>6.15%</strong>
            </div>
            <div className="text-muted-foreground mt-1">
              At $500,000 CAM pool: tenant pays $33,333 vs. $30,769 - a $2,564
              annual decrease if BOMA 2024 denominator is adopted
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Note: The example above shows a tenant paying less under BOMA 2024
            because the larger denominator reduces their percentage. However, if
            the outdoor areas being added to the denominator also generate CAM
            expenses (covered parking maintenance, rooftop terrace upkeep), the
            total recoverable expense pool may also increase - partially or
            fully offsetting the denominator effect.
          </p>
        </section>

        {/* Do leases auto-adopt? */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Do Existing Leases Automatically Adopt BOMA 2024?
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            No. Existing leases do not automatically adopt BOMA 2024 measurement
            standards. The square footage and denominator in a lease are fixed
            at execution unless the lease specifically includes language
            permitting measurement updates.
          </p>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                Leases that reference a specific BOMA standard year
              </p>
              <p className="text-sm text-muted-foreground">
                If the lease says &quot;measured per BOMA 2017 standards,&quot;
                the 2017 measurement controls for the lease term. A BOMA 2024
                remeasurement does not change the lease square footage or
                denominator without a lease amendment.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                Leases that reference &quot;current BOMA standards&quot;
                dynamically
              </p>
              <p className="text-sm text-muted-foreground">
                If the lease says &quot;measured per then-current BOMA
                standards&quot; or &quot;as updated from time to time,&quot; a
                BOMA 2024 remeasurement may be applicable. Consult counsel
                before applying updated measurements, as some courts have held
                that material changes in square footage require tenant consent
                even under dynamic BOMA references.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                New leases executed after BOMA 2024 publication
              </p>
              <p className="text-sm text-muted-foreground">
                For new leases, use the phrase &quot;BOMA 2024-aligned where
                applicable&quot; rather than &quot;BOMA 2024 compliant.&quot;
                Include the measured SF and the denominator as fixed numbers in
                the lease - do not rely on a dynamic reference to a BOMA
                standard that may change again in the future.
              </p>
            </div>
          </div>
        </section>

        {/* Practical steps */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Practical Steps for Landlords
          </h2>
          <div className="space-y-4">
            {[
              {
                step: 1,
                title: "Get a BOMA 2024-aligned remeasurement",
                detail:
                  "Engage a licensed BOMA-credentialed professional to remeasure your property using the 2024 methodology. Document the difference between the prior measurement and the BOMA 2024 figure, broken down by the specific space categories that changed (covered parking, exterior corridors, amenity areas).",
              },
              {
                step: 2,
                title: "Compare to your prior BOMA measurement",
                detail:
                  "Quantify the delta: how many SF were added or removed by BOMA 2024? Identify the specific space categories driving the change. Model the pro-rata denominator change for each tenant to understand the financial impact before making any billing adjustments.",
              },
              {
                step: 3,
                title: "Review lease language before applying new measurements",
                detail:
                  "For each tenant, review whether the lease references a specific BOMA year, uses a dynamic standard reference, or includes a fixed contractual square footage. Only apply the BOMA 2024 denominator to tenants whose leases explicitly permit it. Do not apply BOMA 2024 measurements unilaterally to leases that reference a prior standard.",
              },
              {
                step: 4,
                title:
                  "For new leases, document the BOMA 2024-aligned figure explicitly",
                detail:
                  "State the measured SF and the denominator as fixed numbers in the lease. Include a notation that the measurement is BOMA 2024-aligned where applicable. Avoid dynamic references to future BOMA updates to provide certainty for both parties.",
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
                    Applying new BOMA measurements without checking the lease
                    standard reference
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Updating the denominator in your property management system
                    to the BOMA 2024 total without verifying each tenant&apos;s
                    lease BOMA reference. If a lease executed in 2019 says
                    &quot;measured per BOMA 2017,&quot; billing that tenant
                    using a BOMA 2024 denominator is a lease violation. The
                    tenant can dispute the reconciliation and demand a rerun
                    with the lease-specified measurement.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Remeasuring mid-lease without tenant consent
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Even if the lease includes a dynamic BOMA reference,
                    applying a mid-lease remeasurement that materially changes
                    the tenant&apos;s leased square footage - and therefore
                    their rent and CAM - without notifying and obtaining consent
                    from the tenant creates legal exposure. The process requires
                    formal notification, the opportunity for the tenant to
                    contest the measurement, and in many cases a right to
                    terminate if the measured SF differs materially from the
                    lease-stated SF.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Inconsistent measurement across multi-tenant floors
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    In a multi-tenant building, applying BOMA 2024 methodology
                    for some tenants&apos; floor measurements while using prior
                    BOMA for others (based on lease execution date) creates
                    inconsistent load factors. Floor common area loads differ
                    between BOMA versions, which can result in tenants on the
                    same floor having different effective pro-rata contributions
                    that don&apos;t reconcile to 100% of the floor.
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
                What did BOMA 2024 change about outdoor area measurement?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                BOMA 2024 expanded the methodology for measuring covered parking
                structures, exterior corridors, transitional interior/exterior
                spaces, and outdoor amenity areas. These areas, previously
                excluded or measured inconsistently, now have explicit inclusion
                and allocation methods.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                Do existing leases automatically adopt BOMA 2024?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                No. Existing leases only adopt BOMA 2024 if they explicitly
                reference the 2024 standard or include dynamic language
                permitting measurement updates. Most leases executed before 2024
                reference an earlier BOMA standard and are unaffected.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                If BOMA 2024 increases rentable area, do tenant pro-rata shares
                decrease?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Yes - if the denominator increases and the tenant&apos;s leased
                SF is unchanged, their percentage decreases. However, if the
                additional measured outdoor areas generate CAM expenses, the
                recoverable expense pool may also increase, partially offsetting
                the denominator effect.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                What does &quot;BOMA 2024-aligned where applicable&quot; mean?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                It means the measurement methodology follows BOMA 2024 standards
                for space types the 2024 standard addresses, while recognizing
                that some categories may still be governed by prior standards
                referenced in existing leases. It is more accurate than
                &quot;BOMA 2024 compliant,&quot; which implies formal
                certification.
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
                title: "Pro-Rata Denominator Explained",
                href: "/resources/pro-rata-denominator-explained",
                description:
                  "How denominator types affect every tenant's CAM share",
              },
              {
                title: "BOMA 2024 CAM Reconciliation",
                href: "/resources/boma-2024-cam-reconciliation",
                description:
                  "Full guide to reconciliation impacts of BOMA 2024",
              },
              {
                title: "BOMA 2024 Standards Overview",
                href: "/resources/boma-2024-cam-reconciliation",
                description: "Overview of all BOMA 2024 measurement changes",
              },
              {
                title: "Pro-Rata Calculator",
                href: "/tools/pro-rata-calculator",
                description:
                  "Model pro-rata shares under different denominator definitions",
              },
              {
                title: "CAM Reconciliation Software",
                href: "/cam-reconciliation-software",
                description:
                  "Automate denominator management and pro-rata calculations",
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
            Keep Your Denominators Current and Correct
          </h2>
          <p className="text-background/70 mb-6 text-sm">
            CapVeri tracks the BOMA standard referenced in each lease and flags
            denominator discrepancies when measurements change - so you
            don&apos;t apply new measurements to leases that don&apos;t permit
            them.
          </p>
          <Button asChild variant="secondary" size="lg">
            <a href={buildTrialLink({ content: "boma_2024_outdoor_cta" })}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
