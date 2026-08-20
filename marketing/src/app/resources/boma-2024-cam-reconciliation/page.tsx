import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title:
    "BOMA 2024 and CAM Reconciliation: What Changed and What Landlords Must Do",
  description:
    "BOMA 2024 revised measurement standards affect how rentable area is calculated. That affects your pro-rata denominators. Here's what changed and how to update your CAM calculations.",
  alternates: {
    canonical: `${SITE_URL}/resources/boma-2024-cam-reconciliation`,
  },
  openGraph: {
    title:
      "BOMA 2024 and CAM Reconciliation: What Changed and What Landlords Must Do",
    description:
      "BOMA 2024 revised measurement standards affect how rentable area is calculated. That affects your pro-rata denominators. Here's what changed and how to update your CAM calculations.",
    url: `${SITE_URL}/resources/boma-2024-cam-reconciliation`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "Does BOMA 2024 automatically apply to my existing leases?",
    answer:
      "No. BOMA 2024 applies to an existing lease only if the lease references 'BOMA standards as updated' or explicitly cites BOMA/ANSI Z65.1-2024. If the lease references a specific prior version (e.g., BOMA 2017) or uses a fixed rentable area, the new standard does not change the denominator. Review your lease language carefully before applying BOMA 2024 to existing tenants.",
  },
  {
    question:
      "What types of areas did BOMA 2024 add to measurement that were previously excluded?",
    answer:
      "BOMA 2024 introduced new measurement methodology for outdoor amenity areas (rooftop terraces, plazas used as building amenities), semi-enclosed structures (covered walkways connecting buildings, some structured parking), and transitional zones between indoor and outdoor spaces. These areas were previously excluded or measured inconsistently under prior standards.",
  },
  {
    question:
      "If BOMA 2024 increases the building's RSF, does each tenant's pro-rata share go down?",
    answer:
      "Yes, assuming the denominator is the total RSF of the building. If the denominator increases and a tenant's leased SF is fixed, the pro-rata percentage decreases, which means each tenant pays a smaller share of the same expense pool. This is typically beneficial to tenants - but only if the lease permits the updated denominator to be used.",
  },
  {
    question:
      "What does 'BOMA 2024-aligned where applicable' mean vs. 'BOMA 2024 compliant'?",
    answer:
      "Use 'BOMA 2024-aligned where applicable' to indicate that your measurement methodology is consistent with the 2024 standard for areas where the new standard applies, while acknowledging that specific lease terms or property characteristics may result in departures. Avoid 'BOMA 2024 compliant' as it implies a formal certification that may trigger tenant audit rights around measurement accuracy.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "BOMA 2024 and CAM Reconciliation",
    url: `${SITE_URL}/resources/boma-2024-cam-reconciliation`,
  },
]);

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "BOMA 2024 and CAM Reconciliation: What Changed and What Landlords Must Do",
  description:
    "How BOMA/ANSI Z65.1-2024 changes rentable area measurement, when it applies to existing leases, and how to update pro-rata denominators correctly.",
  author: {
    "@type": "Person",
    name: "Angel Campa",
    url: `${SITE_URL}/about/angel-campa`,
  },
  publisher: {
    "@type": "Organization",
    name: "CapVeri",
    url: SITE_URL,
  },
  dateModified: "2026-04-01",
  url: `${SITE_URL}/resources/boma-2024-cam-reconciliation`,
};

export default function Boma2024CamReconciliationPage() {
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
            BOMA 2024 and CAM Reconciliation
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            BOMA 2024 and CAM Reconciliation: What Changed and What Landlords
            Must Do
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            BOMA/ANSI Z65.1-2024 introduced new measurement methodology for
            outdoor amenity areas, semi-enclosed structures, and transitional
            zones. For landlords, the critical question is whether your leases
            reference a specific BOMA standard and whether remeasuring under the
            2024 standard changes your pro-rata denominators.
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
            BOMA 2024 (BOMA/ANSI Z65.1-2024) introduced new methodology for
            measuring outdoor areas, semi-enclosed spaces, and transitional
            zones. For landlords, the key question is: does your lease reference
            a specific BOMA standard? If so, does the 2024 standard change your
            denominator? BOMA 2024 applies to existing leases only if the lease
            references BOMA standards as updated or explicitly cites the 2024
            version.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            What Changed in BOMA 2024 vs. Prior Standards
          </h2>
          <p className="mb-4 text-muted-foreground">
            BOMA 2024 (BOMA/ANSI Z65.1-2024) introduced several measurement
            updates relative to the prior 2017 standard. The most significant
            changes for commercial office and mixed-use properties:
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 pr-4 text-left font-medium">Area Type</th>
                  <th className="pb-2 pr-4 text-left font-medium">
                    Prior Standard (2017)
                  </th>
                  <th className="pb-2 text-left font-medium">BOMA 2024</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2 pr-4">Outdoor amenity areas</td>
                  <td className="py-2 pr-4">Generally excluded from RSF</td>
                  <td className="py-2">
                    Included in some measurement methods when used as building
                    amenities (rooftop terraces, plazas)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">Semi-enclosed structures</td>
                  <td className="py-2 pr-4">
                    Inconsistent treatment across properties
                  </td>
                  <td className="py-2">
                    Defined methodology for covered walkways, porte-cocheres,
                    partially open structured parking
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">Void areas (above floors)</td>
                  <td className="py-2 pr-4">
                    Measured per 2017 floor void rules
                  </td>
                  <td className="py-2">
                    Updated methodology for atria, double-height spaces
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Exterior wall measurement</td>
                  <td className="py-2 pr-4">
                    To dominant portion of the exterior wall
                  </td>
                  <td className="py-2">
                    Refined definition of dominant portion for complex facade
                    systems
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-muted-foreground">
            The most impactful change for reconciliation purposes is the
            inclusion of outdoor amenity areas. Properties with rooftop
            terraces, building plazas, and covered walkways may see meaningful
            increases in measured RSF when remeasured under BOMA 2024.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Impact on Pro-Rata Denominators
          </h2>
          <p className="mb-4 text-muted-foreground">
            The pro-rata denominator - total rentable SF used to calculate each
            tenant&apos;s share of CAM - is the mechanical link between BOMA
            2024 and your CAM reconciliation. If a property is remeasured and
            the total RSF increases, each tenant&apos;s pro-rata percentage
            decreases (assuming fixed tenant SF), which reduces their CAM
            obligation.
          </p>

          <div className="mb-4 rounded-lg border bg-muted/40 p-5">
            <p className="mb-3 font-medium">
              Worked Example - 200,000 RSF Suburban Office Remeasured Under BOMA
              2024
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 pr-4 text-left font-medium">
                      Measurement
                    </th>
                    <th className="pb-2 pr-4 text-left font-medium">
                      Prior Standard
                    </th>
                    <th className="pb-2 text-left font-medium">BOMA 2024</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="py-2 pr-4">Building RSF (denominator)</td>
                    <td className="py-2 pr-4">200,000 SF</td>
                    <td className="py-2">205,000 SF</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4">New rooftop terrace (added)</td>
                    <td className="py-2 pr-4">0 SF</td>
                    <td className="py-2">5,000 SF</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4">Tenant A leased SF</td>
                    <td className="py-2 pr-4">20,000 SF</td>
                    <td className="py-2">20,000 SF (unchanged)</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4">Tenant A pro-rata %</td>
                    <td className="py-2 pr-4">10.000%</td>
                    <td className="py-2">
                      <strong>9.756%</strong> (20,000 ÷ 205,000)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">
                      Tenant A CAM share ($500K pool)
                    </td>
                    <td className="py-2 pr-4">$50,000</td>
                    <td className="py-2">
                      <strong>$48,780</strong> (savings: $1,220/year)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              A 2.5% increase in the denominator reduces each tenant&apos;s
              obligation by approximately 2.4%. On a $500,000 CAM pool, this is
              roughly $12,200 transferred from tenants to the landlord
              collectively.
            </p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            When BOMA 2024 Applies to Existing Leases
          </h2>
          <p className="mb-4 text-muted-foreground">
            BOMA 2024 does not automatically apply to existing leases. The lease
            controls which measurement standard governs the rentable area. Three
            scenarios:
          </p>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-5">
              <p className="mb-2 font-medium">
                Scenario 1: Lease references "BOMA standards as updated"
              </p>
              <p className="text-sm text-muted-foreground">
                The lease adopts BOMA 2024 automatically when the new standard
                is published. The landlord should commission a remeasurement and
                update the denominator per the new standard. Notify tenants of
                any denominator change before the next reconciliation.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-5">
              <p className="mb-2 font-medium">
                Scenario 2: Lease references a specific prior version (e.g.,
                "BOMA 2017 Office Standard")
              </p>
              <p className="text-sm text-muted-foreground">
                BOMA 2024 does not apply. The denominator is fixed to the prior
                standard unless the lease is amended. Continue using the
                2017-based measurement.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-5">
              <p className="mb-2 font-medium">
                Scenario 3: Lease states a fixed rentable area in square feet
                with no measurement standard reference
              </p>
              <p className="text-sm text-muted-foreground">
                The fixed SF governs. No remeasurement is required or permitted
                under BOMA 2024. This is the most common structure for older
                leases and provides the most stability.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">Landlord Action Items</h2>
          <p className="mb-4 text-muted-foreground">
            For landlords managing buildings with amenity areas or semi-enclosed
            structures, the BOMA 2024 transition warrants a structured review:
          </p>
          <ol className="mb-4 space-y-3 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">
                1. Audit lease language for BOMA standard references.
              </span>{" "}
              Review every lease in the building to determine whether it
              references BOMA standards as updated, a specific version, or uses
              a fixed area. Categorize leases by measurement standard
              applicable.
            </li>
            <li>
              <span className="font-medium text-foreground">
                2. Commission a BOMA 2024-aligned remeasurement
              </span>{" "}
              for buildings where the new standard would increase the
              denominator (beneficial to tenants) and where leases reference
              updated BOMA standards. Document the methodology.
            </li>
            <li>
              <span className="font-medium text-foreground">
                3. Notify affected tenants
              </span>{" "}
              of any denominator change before applying it to the reconciliation
              statement. Provide the remeasurement report and explain the impact
              on their pro-rata share.
            </li>
            <li>
              <span className="font-medium text-foreground">
                4. Document methodology in the reconciliation statement.
              </span>{" "}
              Note that the denominator is "BOMA 2024-aligned where applicable"
              - not "BOMA 2024 compliant," which implies a formal certification.
            </li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Applying BOMA 2024 to leases that reference a prior standard
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Switching to a BOMA 2024 denominator for leases that
                    reference BOMA 2017 or use a fixed rentable area is a
                    unilateral change to the lease. If the denominator increase
                    reduces tenant obligations, tenants may accept it - but the
                    landlord has no right to demand the new denominator without
                    a lease amendment.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Inconsistent denominators across tenants in the same
                    building
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Using different denominators for different tenants in the
                    same building (some on BOMA 2017, some on BOMA 2024) creates
                    pro-rata share discrepancies where the shares don&apos;t sum
                    to 100% of the building. Maintain a consistent denominator
                    for all tenants in a given reconciliation period.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Claiming "BOMA 2024 compliant" without formal certification
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Using "compliant" language creates an implied warranty that
                    the measurement was performed and certified per the full
                    BOMA 2024 standard. Use "BOMA 2024-aligned where applicable"
                    to describe a methodology that follows the new standard
                    without claiming formal certification.
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
                Does BOMA 2024 automatically apply to my existing leases?
              </h3>
              <p className="text-muted-foreground">
                No. BOMA 2024 applies to an existing lease only if the lease
                references BOMA standards as updated or explicitly cites the
                2024 version. Leases referencing specific prior versions or
                using fixed rentable areas are not affected.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What types of areas did BOMA 2024 add to measurement?
              </h3>
              <p className="text-muted-foreground">
                BOMA 2024 introduced measurement methodology for outdoor amenity
                areas (rooftop terraces, plazas used as building amenities),
                semi-enclosed structures (covered walkways, some structured
                parking), and updated void floor and exterior wall measurement
                rules.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                If BOMA 2024 increases the building&apos;s RSF, does each
                tenant&apos;s pro-rata share go down?
              </h3>
              <p className="text-muted-foreground">
                Yes. If the denominator increases and the tenant&apos;s leased
                SF is fixed, their pro-rata percentage decreases - which means
                they pay a smaller share of the same expense pool. This is
                generally beneficial to tenants.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What does &quot;BOMA 2024-aligned where applicable&quot; mean?
              </h3>
              <p className="text-muted-foreground">
                It indicates that the measurement methodology follows BOMA 2024
                where the new standard applies, without claiming formal
                certification. This is the recommended language for
                reconciliation statements - avoid &quot;BOMA 2024
                compliant,&quot; which implies certification.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/boma-2024-outdoor-areas-cam"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">BOMA 2024 Outdoor Areas and CAM</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Deep dive into how rooftop terraces and plazas are measured and
                affect CAM denominators.
              </p>
            </Link>
            <Link
              href="/resources/pro-rata-denominator-explained"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">Pro-Rata Denominator Explained</p>
              <p className="mt-1 text-sm text-muted-foreground">
                What goes into the denominator and how to validate it against
                your lease.
              </p>
            </Link>
            <Link
              href="/resources/pro-rata-share-validation"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">Pro-Rata Share Validation</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Validate that all pro-rata shares in a building sum correctly
                and match lease terms.
              </p>
            </Link>
            <Link
              href="/resources/boma-2024-outdoor-areas-cam"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">BOMA 2024 Standard Overview</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Full overview of BOMA/ANSI Z65.1-2024 measurement methodology.
              </p>
            </Link>
          </div>
        </section>

        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Validate Your Pro-Rata Denominators Against BOMA 2024
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri checks that your building denominators are consistent,
            correctly applied across all tenants, and documented - reducing
            measurement disputes before they become CAM audit findings.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "boma_2024_cam_reconciliation_cta",
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
