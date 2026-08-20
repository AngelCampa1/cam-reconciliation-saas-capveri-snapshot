import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Which Capital Expenditures Are Recoverable in CAM?",
  description:
    "Most capital expenditures are not directly recoverable in CAM, but amortized CapEx is sometimes permitted. Here's how to determine what's recoverable, how to amortize it correctly, and what tenants contest.",
  alternates: {
    canonical: `${SITE_URL}/resources/capital-expenditures-recoverable-in-cam`,
  },
  openGraph: {
    title: "Which Capital Expenditures Are Recoverable in CAM?",
    description:
      "Most capital expenditures are not directly recoverable in CAM, but amortized CapEx is sometimes permitted. Learn what qualifies, how to calculate the recoverable amount, and what tenants dispute.",
    url: `${SITE_URL}/resources/capital-expenditures-recoverable-in-cam`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question:
      "Is the full cost of a capital improvement recoverable in the year it is incurred?",
    answer:
      "Almost never. Direct recovery of capital expenditures in the year incurred is prohibited under virtually all commercial leases. The exception is the amortization approach: leases that permit recovery of capital improvements require that the cost be spread over the useful life of the asset, with only the annual amortized portion included in each year's CAM charges.",
  },
  {
    question:
      "What useful life should be used for amortizing capital expenses?",
    answer:
      "The lease may specify a useful life or direct the landlord to use IRS depreciation schedules as a guide. Common useful lives: HVAC systems (15–20 years), roofing (20–27.5 years), parking lots (15 years), elevators (20+ years). A shorter useful life increases the annual amortization amount billed to tenants, so tenants will contest unusually short lives. Document your useful life determination with an independent source.",
  },
  {
    question:
      "Are ADA compliance upgrades and other law-required capital projects recoverable?",
    answer:
      "Yes, in most leases. Law-required capital improvements - including ADA compliance upgrades, code-required fire suppression upgrades, and environmental remediation required by law - are typically recoverable without the amortization requirement, because many leases exempt'legally required' capital from the general non-recovery rule. Some leases require amortization even for law-required capital; check the specific lease language.",
  },
  {
    question:
      "Can the landlord include interest on the financing of a capital improvement in the amortized CAM amount?",
    answer:
      "Rarely. Including an interest component on capital project financing requires express lease language. Most leases that permit amortized CapEx recovery specify recovery of the cost amortized over useful life, without mention of interest. Tenants routinely dispute interest charges as unauthorized. Review the lease language precisely before adding any financing cost to the amortized amount.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Which Capital Expenditures Are Recoverable in CAM?",
    url: `${SITE_URL}/resources/capital-expenditures-recoverable-in-cam`,
  },
]);

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Which Capital Expenditures Are Recoverable in CAM?",
  description:
    "Amortized CapEx recovery in commercial leases - which capital improvements qualify, useful life methodology, and what tenants dispute.",
  author: {
    "@type": "Person",
    name: "Angel Campa",
    url: `${SITE_URL}/about/angel-campa`,
  },
  publisher: { "@type": "Organization", name: "CapVeri", url: SITE_URL },
  dateModified: "2026-04-01",
  url: `${SITE_URL}/resources/capital-expenditures-recoverable-in-cam`,
};

export default function CapExRecoverableInCamPage() {
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
            Capital Expenditures Recoverable in CAM
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Which Capital Expenditures Are Recoverable in CAM?
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Direct capital expenditure recovery is prohibited under virtually
            all NNN leases. The amortization exception, which spreads CapEx
            recovery over the useful life of the asset, is widely available and
            widely misapplied. This guide explains what qualifies, how to
            calculate the recoverable amount, and what tenants contest.
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
            Direct capital expenditures (HVAC replacement, roof replacement,
            major structural work) are generally not recoverable in CAM in the
            year incurred. However, many leases allow amortization of capital
            improvements over the asset&apos;s useful life, with the annual
            amortized portion recoverable as CAM. Law-required capital (ADA
            compliance, code upgrades) is often recoverable without
            amortization.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            The General Rule: Capital Is Not Recoverable
          </h2>
          <p className="mb-4 text-muted-foreground">
            The cornerstone of CAM expense classification is the
            capital/operating distinction. Operating expenses maintain the
            property in its current condition and are recoverable. Capital
            expenditures improve, replace, or extend the life of a building
            component and are generally not recoverable, because the tenant
            would be paying to improve the landlord&apos;s asset.
          </p>
          <p className="mb-4 text-muted-foreground">
            Standard NNN lease language excludes capital expenditures from
            recoverable CAM either explicitly ("excluding capital improvements
            as defined under GAAP") or by including only "operating and
            maintenance" expenses in the defined recovery pool. Either way, a
            landlord who books a $250,000 HVAC replacement as a GL expense and
            includes it in CAM is creating significant audit exposure.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            The Amortization Exception
          </h2>
          <p className="mb-4 text-muted-foreground">
            Most modern NNN leases include an amortization carve-out that
            permits recovery of two categories of capital improvements:
          </p>
          <ul className="mb-4 space-y-3 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">
                Law-required capital:
              </span>
              {""}
              Capital improvements required by applicable law, ordinance, or
              regulation after the commencement date of the lease.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Expense-reduction capital:
              </span>
              {""}
              Capital improvements that reduce operating expenses that would
              otherwise be recoverable from tenants.
            </li>
          </ul>
          <p className="mb-4 text-muted-foreground">
            For both categories, the typical requirement is that the capital
            cost be amortized over the useful life of the improvement, and only
            the annual amortization amount (cost ÷ useful life years) may be
            included in CAM charges.
          </p>

          <div className="mb-4 rounded-lg border bg-muted/40 p-5">
            <p className="mb-3 font-medium">
              Amortization Calculation: Roof Replacement
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Capital cost: $200,000</li>
              <li>Useful life: 20 years</li>
              <li>Annual amortization: $200,000 ÷ 20 = $10,000/year</li>
              <li>
                Tenant with 10% pro-rata share pays: $1,000/year for 20 years
              </li>
              <li>
                vs. Full cost in year of replacement: $20,000 (prohibited)
              </li>
            </ul>
          </div>

          <div className="mb-4 rounded-lg border bg-muted/40 p-5">
            <p className="mb-3 font-medium">
              Amortization Calculation: LED Lighting Retrofit
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Capital cost: $80,000</li>
              <li>Useful life: 10 years</li>
              <li>Annual amortization: $80,000 ÷ 10 = $8,000/year</li>
              <li>
                Annual energy savings: $12,000/year (documented reduction in
                recoverable utility expenses)
              </li>
              <li>Net annual impact to tenants: $8,000 − $12,000 = −$4,000</li>
              <li className="text-green-700">
                Tenants pay less per year than before the retrofit - this passes
                the expense-reduction test
              </li>
            </ul>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            IRS Useful Life as a Guide
          </h2>
          <p className="mb-4 text-muted-foreground">
            When the lease does not specify a useful life, landlords typically
            reference IRS depreciation schedules as a reasonable proxy. Tenants
            and their auditors use the same reference point, so using IRS-based
            lives reduces dispute risk.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 pr-4 text-left font-medium">Asset</th>
                  <th className="pb-2 pr-4 text-left font-medium">
                    IRS Useful Life
                  </th>
                  <th className="pb-2 text-left font-medium">
                    Annual Recovery on $100K Cost
                  </th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2 pr-4">HVAC system</td>
                  <td className="py-2 pr-4">15–20 years</td>
                  <td className="py-2">$5,000–$6,667/year</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">Roof / roofing system</td>
                  <td className="py-2 pr-4">20–27.5 years</td>
                  <td className="py-2">$3,636–$5,000/year</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">Parking lot</td>
                  <td className="py-2 pr-4">15 years</td>
                  <td className="py-2">$6,667/year</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">Elevator cab / equipment</td>
                  <td className="py-2 pr-4">20+ years</td>
                  <td className="py-2">$5,000/year or less</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">LED lighting retrofit</td>
                  <td className="py-2 pr-4">10–15 years</td>
                  <td className="py-2">$6,667–$10,000/year</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Fire suppression system</td>
                  <td className="py-2 pr-4">15–20 years</td>
                  <td className="py-2">$5,000–$6,667/year</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Law-Required Capital: Recoverable Without Amortization Requirement
          </h2>
          <p className="mb-4 text-muted-foreground">
            Capital improvements mandated by law - ADA compliance work, seismic
            retrofitting required by local ordinance, fire code upgrades, and
            environmental remediation required by law - are recoverable in most
            leases without requiring full amortization over useful life. The
            rationale: neither party anticipated the requirement, and it would
            be inequitable to require the landlord to absorb the entire cost.
          </p>
          <p className="mb-4 text-muted-foreground">
            Even for law-required capital, some leases impose an amortization
            requirement. Review the specific lease language. The critical
            question is whether the lease says "amortized over useful life" for
            law-required items or whether law-required capital is separately
            addressed.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            What Tenants Contest in CapEx Recovery
          </h2>
          <p className="mb-4 text-muted-foreground">
            Even when the lease permits amortized CapEx recovery, tenants
            routinely dispute specific elements:
          </p>
          <ul className="mb-4 space-y-3 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">
                Useful life used (too short):
              </span>
              {""}A shorter useful life produces a higher annual amortization
              charge. Tenants will compare the life used against IRS schedules
              and industry standards. Using 10 years for a roof replacement that
              has a 25-year IRS life is difficult to defend.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Whether the improvement was truly required vs. voluntary:
              </span>
              {""}
              An HVAC replacement because the old system was inefficient is not
              the same as one required by ASHRAE code changes. The landlord must
              document that code, law, or demonstrated expense-reduction need
              drove the improvement.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Including interest or financing costs:
              </span>
              {""}
              Unless the lease explicitly allows it, adding a financing cost
              component to the amortized amount is unauthorized. Tenants will
              strip it out and calculate damages on the excess charged.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Expense-reduction capital where savings aren&apos;t
                demonstrated:
              </span>
              {""}
              If the landlord claims a capital project reduces operating
              expenses, tenants will ask for documentation of the actual savings
              achieved and how they were passed back.
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Passing the full capital cost through in the year incurred
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The most serious CapEx error: billing a $350,000 HVAC
                    replacement or roof project directly in one year&apos;s CAM
                    reconciliation. Without amortization, this is a clear lease
                    violation. Large capital charges trigger immediate tenant
                    audits.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Using an artificially short useful life to accelerate
                    recovery
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A landlord who uses a 10-year life for a 25-year roof
                    doubles the annual recovery amount. The difference between a
                    10-year and 25-year amortization on a $200,000 roof is
                    $12,000/year, a significant overcharge for large tenant
                    portfolios.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Including financing costs in the amortized recovery amount
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Unless the lease explicitly includes interest on capital
                    project financing as a recoverable cost, adding a financing
                    component to the amortized amount is unauthorized. Most
                    leases are silent on this, and silence means exclusion.
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
                Is the full cost of a capital improvement recoverable in the
                year it is incurred?
              </h3>
              <p className="text-muted-foreground">
                Almost never. The standard approach under leases that permit any
                CapEx recovery is amortization over the useful life of the
                asset. Only the annual amortized amount may be included in each
                year&apos;s CAM charges.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What useful life should be used for amortizing capital expenses?
              </h3>
              <p className="text-muted-foreground">
                IRS depreciation schedules are the standard reference when the
                lease is silent. Common useful lives: HVAC (15–20 years),
                roofing (20–27.5 years), parking lots (15 years), elevators (20+
                years). Using significantly shorter lives invites tenant
                disputes.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Are ADA compliance upgrades recoverable without amortization?
              </h3>
              <p className="text-muted-foreground">
                In most leases, yes. Law-required capital is separately
                addressed and typically recoverable without the full
                amortization requirement. However, some leases require
                amortization even for law-required capital. Always check the
                specific lease language.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Can the landlord include financing interest in the amortized CAM
                amount?
              </h3>
              <p className="text-muted-foreground">
                Only with explicit lease language permitting it. Most leases are
                silent on this point, and silence means exclusion. Tenants
                routinely strip out interest components from amortized CapEx
                charges during audits.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/capex-vs-opex-cam"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">CapEx vs. OpEx Classification</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Three tests for classifying building expenses correctly before
                including them in CAM.
              </p>
            </Link>
            <Link
              href="/resources/recoverable-vs-nonrecoverable-cam"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">
                Recoverable vs. Non-Recoverable CAM Expenses
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete guide to the recoverable expense framework across lease
                types.
              </p>
            </Link>
            <Link
              href="/resources/detect-capex-in-gl-export"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">Detect CapEx in GL Exports</p>
              <p className="mt-1 text-sm text-muted-foreground">
                How to find misclassified capital items in your GL before they
                appear in CAM statements.
              </p>
            </Link>
            <Link
              href="/cam-reconciliation-software"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">CAM Reconciliation Software</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Automate CapEx detection and amortization scheduling with
                CapVeri.
              </p>
            </Link>
          </div>
        </section>

        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Catch CapEx in CAM Before Tenants Do
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri automatically flags capital expenditure amounts in your GL
            export and verifies that any amortized recovery uses the correct
            useful life and excludes interest, before your reconciliation
            statement goes out.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "capex_recoverable_cam_cta",
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
