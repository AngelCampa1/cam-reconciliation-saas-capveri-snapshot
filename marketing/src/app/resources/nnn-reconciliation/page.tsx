import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import {
  structuredDataSchemas,
  AUTHOR_ANGEL_CAMPA,
} from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "NNN Reconciliation Guide for Landlords: How Triple-Net Leases Work",
  description:
    "NNN (triple-net) leases pass operating expenses, property taxes, and insurance directly to tenants. Here's how to reconcile NNN charges, avoid common errors, and document your calculations.",
  alternates: {
    canonical: `${SITE_URL}/resources/nnn-reconciliation`,
  },
  openGraph: {
    title: "NNN Reconciliation Guide for Landlords: How Triple-Net Leases Work",
    description:
      "NNN (triple-net) leases pass operating expenses, property taxes, and insurance directly to tenants. Here's how to reconcile NNN charges, avoid common errors, and document your calculations.",
    url: `${SITE_URL}/resources/nnn-reconciliation`,
    type: "article",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "NNN Reconciliation Guide for Landlords: How Triple-Net Leases Work",
  description:
    "How to reconcile the three NNN components - property taxes, insurance, and CAM - and avoid the most common triple-net errors.",
  url: `${SITE_URL}/resources/nnn-reconciliation`,
  datePublished: "2026-04-01",
  dateModified: "2026-04-26",
  author: AUTHOR_ANGEL_CAMPA,
  publisher: structuredDataSchemas.organization,
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What does NNN stand for in a commercial lease?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "NNN stands for triple-net. The three 'nets' are: (1) property taxes, (2) building insurance, and (3) common area maintenance (CAM). In a NNN lease, the tenant pays base rent plus their pro-rata share of all three net components. This contrasts with gross leases, where operating expenses are bundled into base rent.",
      },
    },
    {
      "@type": "Question",
      name: "Do NNN leases still require annual reconciliation?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Even in NNN leases, tenants typically pay monthly estimates for each of the three nets throughout the year. At year-end, the landlord must reconcile estimates against actual expenses and deliver a reconciliation statement. The true-up collects any underpayment or credits any overpayment.",
      },
    },
    {
      "@type": "Question",
      name: "What is an absolute NNN (bond NNN) lease?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "An absolute NNN lease (also called a bond NNN) is the most landlord-favorable structure: the tenant is responsible for virtually all property costs including structural repairs, roof replacement, and HVAC capital. The landlord effectively collects net rent with no building responsibility. These are common for single-tenant net-leased retail (banks, fast food, pharmacies). Reconciliation under absolute NNN is minimal - the tenant maintains everything directly.",
      },
    },
    {
      "@type": "Question",
      name: "How is NNN different from NN (double-net)?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "In a NN (double-net) lease, the tenant pays two of the three nets - typically property taxes and insurance - but the landlord retains responsibility for building maintenance and CAM. Reconciliation under NN covers only taxes and insurance. Structural and maintenance costs are the landlord's obligation and are not recoverable through tenant billings.",
      },
    },
  ],
};

export default function NnnReconciliationPage() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />
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
          <span className="text-foreground">NNN Reconciliation</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            NNN Reconciliation Guide for Landlords: How Triple-Net Leases Work
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Triple-net leases are the most landlord-favorable lease structure,
            but they still require rigorous annual reconciliation. Each of the
            three "nets" has different data sources, billing mechanics, and
            error patterns. Here is how to reconcile all three correctly.
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
            In a triple-net lease, the tenant pays base rent plus their pro-rata
            share of three "nets": property taxes, building insurance, and
            common area maintenance. Reconciliation tracks actual costs vs.
            estimated payments for each net component. Even single-tenant
            absolute NNN properties benefit from documentation - particularly
            for property tax and insurance reconciliation.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            NNN Lease Structure Explained
          </h2>
          <p className="mb-6 text-muted-foreground">
            A triple-net tenant pays:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold">
                    Component
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    What it covers
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Data source for reconciliation
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Billing mechanic
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-3 font-medium">Base rent</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Fixed contract rent
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Lease schedule
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">Monthly</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Net 1: Property taxes
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Real estate taxes for the lease year
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Tax bills from taxing authority
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Monthly estimates; annual true-up
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Net 2: Building insurance
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Property and casualty premiums
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Insurance invoices
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Monthly estimates; annual true-up
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Net 3: CAM</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Operating expenses for common areas
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    General ledger export
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Monthly estimates; annual true-up
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The NNN Reconciliation Cycle
          </h2>

          <div className="space-y-6">
            <div>
              <h3 className="mb-3 text-xl font-semibold">
                Property Tax Reconciliation
              </h3>
              <p className="mb-3 text-muted-foreground">
                Property tax reconciliation compares tenant tax estimates paid
                during the year against actual tax bills. Three complications
                arise consistently:
              </p>
              <ol className="space-y-2 text-muted-foreground">
                <li>
                  <strong>1. Tax year vs. lease year alignment.</strong> Most
                  jurisdictions bill property taxes on a fiscal year that does
                  not match the calendar year. Prorate based on days in the
                  lease year that fall within each tax year.
                </li>
                <li>
                  <strong>2. Supplemental and escape assessments.</strong>{" "}
                  Post-acquisition or post-improvement supplemental bills arrive
                  after the standard billing cycle. Include them in the lease
                  year they cover, not the year they are received.
                </li>
                <li>
                  <strong>3. Tax appeal refunds.</strong> If the landlord
                  appealed the assessment and received a refund, the tenant
                  overpaid. Credit their share of the refund, including interest
                  if the lease requires it.
                </li>
              </ol>
            </div>

            <div>
              <h3 className="mb-3 text-xl font-semibold">
                Insurance Reconciliation
              </h3>
              <p className="mb-3 text-muted-foreground">
                Insurance premium reconciliation prorate the annual premium to
                the lease year and allocates the tenant&apos;s pro-rata share.
                For multi-building portfolio policies, the landlord must
                allocate the building&apos;s share of the total portfolio
                premium using either square footage, insured value, or another
                methodology specified in the lease.
              </p>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <p className="font-semibold mb-2">
                  Worked example: Policy allocation
                </p>
                <p className="text-muted-foreground">
                  Portfolio premium: $480,000 for 5 buildings. Building B is
                  200,000 SF of 1,000,000 total SF. Building B allocation ={" "}
                  <span className="font-mono">20% × $480,000 = $96,000</span>.
                  Each tenant&apos;s share is then their RSF divided by total
                  building RSF, applied to $96,000.
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-xl font-semibold">CAM Reconciliation</h3>
              <p className="text-muted-foreground">
                CAM reconciliation under NNN is identical to the standard CAM
                process: export the GL, classify expenses, remove
                non-recoverable items, apply gross-up if applicable, apply any
                CAM caps, and calculate each tenant&apos;s pro-rata share. See
                the{" "}
                <Link
                  href="/resources/cam-reconciliation-process"
                  className="text-primary underline"
                >
                  CAM Reconciliation Process guide
                </Link>{" "}
                for full detail.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            NNN Lease Variations: What Changes in Reconciliation
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">Single-Tenant NNN</h3>
              <p className="text-sm text-muted-foreground">
                The tenant occupies 100% of the building and pays 100% of all
                three nets. Reconciliation is simpler because there is no
                pro-rata calculation. The tenant pays the entire actual bill.
                Documentation is still important: the reconciliation statement
                confirms the actual amounts and supports the true-up payment or
                credit.
              </p>
            </div>
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">Multi-Tenant NNN</h3>
              <p className="text-sm text-muted-foreground">
                Each tenant pays their pro-rata share of each of the three nets.
                The mechanics mirror retail CAM reconciliation but require three
                separate calculations (or a bundled calculation if the lease
                combines them). Pro-rata denominators may differ by component if
                the lease specifies different measurement bases for taxes vs.
                CAM.
              </p>
            </div>
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">Double-Net (NN) Leases</h3>
              <p className="text-sm text-muted-foreground">
                The tenant pays taxes and insurance but not CAM. The landlord
                handles and absorbs maintenance costs. Reconciliation covers
                only the two net components. NN structures are less common in
                institutional commercial real estate but appear in older retail
                and industrial leases.
              </p>
            </div>
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">Absolute NNN (Bond NNN)</h3>
              <p className="text-sm text-muted-foreground">
                The tenant takes responsibility for all three nets plus
                structural maintenance: roof, foundation, and structural
                systems. Common for single-tenant net-leased retail
                (quick-service restaurants, pharmacies, banks). The
                landlord&apos;s reconciliation role is minimal: confirm tax and
                insurance payments were made and document the record. The tenant
                manages and pays for everything directly.
              </p>
            </div>
            <div className="rounded-lg border p-5">
              <h3 className="mb-2 font-semibold">Modified NNN</h3>
              <p className="text-sm text-muted-foreground">
                A hybrid structure that passes some NNN components to tenants
                while the landlord retains others. For example, the tenant might
                pay CAM and taxes but the landlord handles insurance. Read
                modified NNN leases carefully. There is no standard definition,
                and what is included vs. excluded varies by deal.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            NNN Tenants and Audit Rights
          </h2>
          <p className="mb-4 text-muted-foreground">
            NNN tenants, particularly national retailers and institutional
            operators, are significantly more sophisticated about their audit
            rights than gross-lease tenants. They have in-house lease
            administration teams and external audit firms that systematically
            review reconciliation statements.
          </p>
          <p className="mb-4 text-muted-foreground">
            Common NNN audit targets include: insurance premium allocation from
            blanket policies (tenants question whether the allocation
            methodology is fair), property tax proration across fiscal years,
            and management fee calculation when the lease caps the recoverable
            fee or requires arm&apos;s-length pricing.
          </p>
          <p className="text-muted-foreground">
            The best defense is a well-documented reconciliation that clearly
            shows each component&apos;s source documents, calculation
            methodology, and supporting schedules. Reconciliations that lack
            documentation are harder to defend even when the math is correct.
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
                    Applying a gross lease pro-rata methodology to NNN
                    components
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Some property management systems default to a single
                    pro-rata calculation for all expense categories. NNN leases
                    may specify different denominators for each component.
                    Verify the denominator per lease before applying it to all
                    three nets.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Missing supplemental tax bills in the NNN reconciliation
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    After a property sale or major improvement, the assessor may
                    issue a supplemental bill that arrives 6–18 months after the
                    triggering event. These bills are frequently missed in the
                    year-end reconciliation, resulting in under-recovery or a
                    delayed true-up when the bill eventually surfaces.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Treating absolute NNN properties as if no reconciliation is
                    needed
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Even when the tenant pays all costs directly, maintaining a
                    landlord reconciliation file for property taxes and
                    insurance provides a record of compliance. Without it,
                    disputes about whether payments were made and for which
                    amounts are difficult to resolve.
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
                What does NNN stand for in a commercial lease?
              </h3>
              <p className="text-muted-foreground">
                NNN stands for triple-net. The three "nets" are: (1) property
                taxes, (2) building insurance, and (3) common area maintenance.
                In a NNN lease, the tenant pays base rent plus their pro-rata
                share of all three net components.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Do NNN leases still require annual reconciliation?
              </h3>
              <p className="text-muted-foreground">
                Yes. Even in NNN leases, tenants typically pay monthly estimates
                for each net throughout the year. At year-end, the landlord
                reconciles estimates against actual expenses and delivers a
                statement. The true-up collects underpayments or credits
                overpayments.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What is an absolute NNN (bond NNN) lease?
              </h3>
              <p className="text-muted-foreground">
                An absolute NNN lease assigns virtually all property costs to
                the tenant, including structural repairs and roof replacement.
                Common for single-tenant net-leased retail (banks, fast food,
                pharmacies). Reconciliation under absolute NNN is minimal; the
                tenant maintains everything directly.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How is NNN different from NN (double-net)?
              </h3>
              <p className="text-muted-foreground">
                In a double-net lease, the tenant pays property taxes and
                insurance but the landlord handles CAM and maintenance. The
                landlord cannot recover CAM costs through tenant billings under
                a NN structure.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                href: "/resources/cam-reconciliation-process",
                title: "CAM Reconciliation Process",
                desc: "Detailed workflow for the CAM component of NNN reconciliation",
              },
              {
                href: "/resources/operating-expense-reconciliation-commercial-lease",
                title: "Operating Expense Reconciliation Handbook",
                desc: "How all four OE categories differ in reconciliation mechanics",
              },
              {
                href: "/resources/industrial-cam-reconciliation",
                title: "Industrial CAM Reconciliation",
                desc: "NNN simplicity vs. multi-tenant complexity in industrial parks",
              },
              {
                href: "/cam-reconciliation-software",
                title: "CAM Reconciliation Software",
                desc: "How CapVeri reconciles all three NNN components from one export",
              },
            ].map(({ href, title, desc }) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/30 transition-colors"
              >
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Reconcile All Three NNN Components Without Spreadsheets
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri handles property tax, insurance, and CAM reconciliation in a
            single workflow with built-in checks for supplemental tax bills,
            policy allocation errors, and pro-rata mismatches.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "nnn_reconciliation_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
