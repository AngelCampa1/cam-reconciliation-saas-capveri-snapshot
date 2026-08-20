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
  title: "Cumulative CAM Cap Bank Explained: Multi-Year Cap Carryforward",
  description:
    "Cumulative CAM caps allow unused capacity to carry forward, creating a bank that landlords can draw on in future years. Here's how to calculate, track, and apply cumulative cap banks correctly.",
  alternates: { canonical: `${SITE_URL}/resources/cumulative-cam-cap-bank` },
  openGraph: {
    title:
      "Cumulative CAM Cap Bank Explained: Tracking Multi-Year Cap Carryforward",
    description:
      "Cumulative CAM caps allow unused capacity to carry forward, creating a bank that landlords can draw on in future years. Learn how to calculate, track, and apply cumulative cap banks correctly.",
    url: `${SITE_URL}/resources/cumulative-cam-cap-bank`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is a cumulative CAM cap bank?",
    answer:
      "A cumulative CAM cap bank tracks unused cap capacity from years where actual CAM increases were below the cap limit. In a 5% cumulative cap, if actual expenses increased only 3% in a given year, the unused 2% carries forward as a bank balance. In future years where actual expenses increase more than 5%, the landlord can draw on the bank to allow a larger recovery up to the sum of the annual cap and the accumulated bank balance.",
  },
  {
    question: "How do I know if my lease has a cumulative cap bank?",
    answer:
      "Look for language in the CAM cap provision stating that unused amounts 'shall carry forward,' 'accumulate,' or are 'available for use in subsequent years.' Some leases use the phrase 'the unused portion shall be added to the cap for the following year.' If the cap provision says only that the increase 'shall not exceed X% per year' with no carryforward language, it is non-cumulative.",
  },
  {
    question: "When does a cumulative cap bank reset to zero?",
    answer:
      "Cap banks typically reset at lease renewal or when explicitly triggered by the lease (e.g., after a partial draw event in some lease structures). A bank does not automatically reset at the end of a calendar year - the bank balance carries forward indefinitely until drawn, unless the lease specifies otherwise. Always check for reset trigger language in the lease before zeroing out a bank balance.",
  },
  {
    question: "Can the bank balance grow indefinitely?",
    answer:
      "Technically yes, subject to lease language. In a sustained low-inflation environment over a multi-year lease term, a cumulative bank can grow to represent several years of cap allowance. Some leases cap the maximum bank balance or require it to be drawn down within a defined number of years. If the lease does not limit the bank, it grows each year actual increases fall below the cap.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Cumulative CAM Cap Bank",
    url: `${SITE_URL}/resources/cumulative-cam-cap-bank`,
  },
]);

export default function CumulativeCamCapBankPage() {
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
          <span className="text-foreground">Cumulative CAM Cap Bank</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Cumulative CAM Cap Bank Explained: Tracking Multi-Year Cap
            Carryforward
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            How to calculate the cumulative cap bank, track it across multiple
            lease years, and correctly apply it when actual expenses exceed the
            annual cap limit - with a complete 5-year worked example.
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

        {/* Quick Answer */}
        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">Quick Answer</h2>
          <p className="text-muted-foreground">
            A cumulative CAM cap bank tracks unused cap capacity from years
            where actual increases were below the cap limit. This banked
            capacity carries forward - allowing larger increases in future years
            when the landlord can draw on the accumulated balance. The math
            compounds, is easily miscalculated, and produces significant
            financial consequences in high-inflation years following a
            low-inflation period.
          </p>
        </div>

        {/* Why Cumulative Caps Matter */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Why the Cumulative Cap Bank Matters
          </h2>
          <p className="mb-4 text-muted-foreground">
            A non-cumulative 5% cap means the landlord can recover at most 5%
            more than last year, every year, regardless of actual expense
            trends. A cumulative 5% cap means the same in any single year, but
            years of sub-5% increases accumulate as a bank that allows larger
            recovery in years with high expense growth.
          </p>
          <p className="mb-4 text-muted-foreground">
            From the landlord&apos;s perspective, cumulative caps are
            significantly more valuable in environments with volatile operating
            costs. In the 2021–2024 period, where inflation ran above 5% after
            years of 1–3% increases, landlords with cumulative cap leases
            recovered materially more than those with non-cumulative leases,
            because years of banked capacity could be applied to the
            high-inflation catch-up.
          </p>
          <p className="text-muted-foreground">
            The cap bank is also the source of the most costly calculation
            errors: treating a cumulative bank as non-cumulative (resetting it
            annually) has the same effect as silently converting the tenant's
            lease to a non-cumulative structure. The tenant will not notice
            until a high-inflation year arrives.
          </p>
        </section>

        {/* The Formula */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            The Cumulative Cap Bank Formula
          </h2>
          <div className="mb-6 rounded-xl border bg-muted/40 p-6 font-mono text-sm">
            <p className="mb-3 font-bold">Each Year:</p>
            <p className="mb-2 text-muted-foreground">
              Annual Cap Allowance = Cap % &times; Prior Year Actual Obligation
            </p>
            <p className="mb-2 text-muted-foreground">
              Maximum Recoverable = Prior Year Actual + Opening Bank + Annual
              Cap Allowance
            </p>
            <p className="mb-4 text-muted-foreground">
              Tenant Obligation = Min(Actual Controllable CAM, Maximum
              Recoverable) + Non-Controllable CAM
            </p>
            <p className="mb-3 font-bold">Closing Bank Balance:</p>
            <p className="mb-2 text-muted-foreground">
              If actual &lt; maximum: Closing Bank = Opening Bank + Annual
              Allowance &minus; Actual Increase
            </p>
            <p className="text-muted-foreground">
              If actual &ge; maximum: Closing Bank = Opening Bank + Annual
              Allowance &minus; Draw Amount (drawn to cap maximum)
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Note: &ldquo;Actual Increase&rdquo; is the change in controllable
            CAM from the prior year actual (not the prior year cap maximum). The
            bank grows when the actual increase is less than the annual cap
            allowance; it shrinks when the landlord draws on it to recover above
            the annual allowance.
          </p>
        </section>

        {/* 5-Year Worked Example */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">5-Year Worked Example</h2>
          <div className="mb-4 rounded-lg border p-4">
            <p className="font-medium text-sm">
              Lease terms: 5% cumulative cap on controllable CAM; Base year
              controllable CAM = $60,000
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-2 text-left font-semibold">Year</th>
                  <th className="p-2 text-right font-semibold">Prior Base</th>
                  <th className="p-2 text-right font-semibold">Annual 5%</th>
                  <th className="p-2 text-right font-semibold">Open Bank</th>
                  <th className="p-2 text-right font-semibold">Max Allowed</th>
                  <th className="p-2 text-right font-semibold">Actual</th>
                  <th className="p-2 text-right font-semibold">Tenant Owes</th>
                  <th className="p-2 text-right font-semibold">Close Bank</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-2 font-medium">Year 1</td>
                  <td className="p-2 text-right">$60,000</td>
                  <td className="p-2 text-right">$3,000</td>
                  <td className="p-2 text-right">$0</td>
                  <td className="p-2 text-right">$63,000</td>
                  <td className="p-2 text-right">$61,800</td>
                  <td className="p-2 text-right font-medium">$61,800</td>
                  <td className="p-2 text-right text-green-600">$1,200</td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-2 font-medium">Year 2</td>
                  <td className="p-2 text-right">$61,800</td>
                  <td className="p-2 text-right">$3,090</td>
                  <td className="p-2 text-right">$1,200</td>
                  <td className="p-2 text-right">$66,090</td>
                  <td className="p-2 text-right">$62,400</td>
                  <td className="p-2 text-right font-medium">$62,400</td>
                  <td className="p-2 text-right text-green-600">$3,690</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium">Year 3</td>
                  <td className="p-2 text-right">$62,400</td>
                  <td className="p-2 text-right">$3,120</td>
                  <td className="p-2 text-right">$3,690</td>
                  <td className="p-2 text-right">$69,210</td>
                  <td className="p-2 text-right">$63,500</td>
                  <td className="p-2 text-right font-medium">$63,500</td>
                  <td className="p-2 text-right text-green-600">$5,710</td>
                </tr>
                <tr className="bg-muted/20">
                  <td className="p-2 font-medium">Year 4</td>
                  <td className="p-2 text-right">$63,500</td>
                  <td className="p-2 text-right">$3,175</td>
                  <td className="p-2 text-right">$5,710</td>
                  <td className="p-2 text-right font-semibold">$72,385</td>
                  <td className="p-2 text-right text-destructive-strong">$74,000</td>
                  <td className="p-2 text-right font-medium">$72,385</td>
                  <td className="p-2 text-right text-muted-foreground">$0</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium">Year 5</td>
                  <td className="p-2 text-right">$72,385</td>
                  <td className="p-2 text-right">$3,619</td>
                  <td className="p-2 text-right">$0</td>
                  <td className="p-2 text-right">$76,004</td>
                  <td className="p-2 text-right">$75,200</td>
                  <td className="p-2 text-right font-medium">$75,200</td>
                  <td className="p-2 text-right text-green-600">$804</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>Years 1–3:</strong> Actual increases were below the cap
              (2–3% vs. 5% limit). The bank accumulated to $5,710 by the end of
              Year 3.
            </p>
            <p>
              <strong>Year 4:</strong> Actual expenses jumped to $74,000, an
              ~16.5% increase over the prior year. Without the cumulative bank,
              the cap would have limited recovery to $66,675 ($63,500 &times;
              1.05). With the $5,710 bank, the landlord recovered $72,385, which
              is $5,710 more than under a non-cumulative cap. The bank was fully
              drawn.
            </p>
            <p>
              <strong>Year 5:</strong> With the bank reset to zero, a new bank
              starts accumulating. Year 5 actual increase (3.9%) left $804 of
              unused capacity.
            </p>
          </div>
        </section>

        {/* Lease Language */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            What Lease Language Triggers a Cumulative Bank
          </h2>
          <p className="mb-4 text-muted-foreground">
            The distinction between cumulative and non-cumulative caps lies in a
            few words of lease language. Common cumulative cap language:
          </p>
          <div className="mb-4 space-y-3">
            <div className="rounded-lg border-l-4 border-primary bg-muted/30 p-4 text-sm italic text-muted-foreground">
              &ldquo;...provided that to the extent the CAM charges in any
              calendar year are less than the maximum permitted under this
              provision, the unused portion of such maximum shall be carried
              forward and added to the permitted amount for succeeding
              years.&rdquo;
            </div>
            <div className="rounded-lg border-l-4 border-primary bg-muted/30 p-4 text-sm italic text-muted-foreground">
              &ldquo;...the cumulative cap limit for any given year shall equal
              the cap limit for such year plus any unused cap amounts from prior
              years of the Lease Term.&rdquo;
            </div>
            <div className="rounded-lg border-l-4 border-primary bg-muted/30 p-4 text-sm italic text-muted-foreground">
              &ldquo;...any unused increase allowance from prior periods shall
              accumulate and may be applied in any subsequent period during the
              Lease Term.&rdquo;
            </div>
          </div>
          <p className="text-muted-foreground">
            Non-cumulative caps use language such as &ldquo;shall not increase
            by more than X% per year&rdquo; with no carryforward provision. When
            the lease is silent on whether unused capacity carries forward,
            courts in most jurisdictions have held that a cap is non-cumulative
            unless it explicitly provides for carryforward.
          </p>
        </section>

        {/* Landlord and Tenant Implications */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Landlord and Tenant Implications
          </h2>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <p className="mb-2 font-semibold">Landlord Perspective</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                  <span>
                    Cumulative banks allow catch-up recovery in inflation spikes
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                  <span>
                    More valuable than non-cumulative in volatile cost
                    environments
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    Requires precise multi-year tracking - errors compound
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    High bank draws in one year can surprise tenants and trigger
                    disputes
                  </span>
                </li>
              </ul>
            </div>
            <div className="rounded-lg border p-4">
              <p className="mb-2 font-semibold">Tenant Perspective</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                  <span>
                    In stable or low-inflation years, the bank grows but is not
                    drawn - tenant pays actual (lower) costs
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    In high-inflation years, the bank enables larger increases
                    than a non-cumulative cap would allow
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    Tenants should verify that the landlord has not been
                    erroneously resetting the bank - which inflates future
                    exposure
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* When Banks Reset */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">When Cap Banks Reset</h2>
          <p className="mb-4 text-muted-foreground">
            A cumulative cap bank resets to zero only when the lease specifies a
            reset trigger. Common reset triggers:
          </p>
          <ul className="mb-4 space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2">
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                <strong>Lease renewal:</strong> Most cumulative cap provisions
                reset at the start of each lease option period, with a new base
                year established
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                <strong>Full draw event:</strong> Some leases provide that the
                bank resets after a year in which the full accumulated balance
                is drawn (the landlord recovered at the maximum)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                <strong>Lease amendment:</strong> If the parties amend the cap
                provision, the amendment typically establishes a new base year
                and a fresh bank
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                <strong>Maximum bank limit reached:</strong> If the lease caps
                the bank balance, the bank stops growing once the limit is
                reached
              </span>
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">
            The bank does <em>not</em> automatically reset at the end of a
            calendar year unless the lease explicitly says so. Annual resets
            would make the provision non-cumulative, which contradicts the
            carryforward language.
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
                    Treating the Cumulative Bank as Non-Cumulative (Annual
                    Reset)
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The most common error: zeroing out the bank at the start of
                    each calendar year. This is functionally equivalent to
                    operating under a non-cumulative cap. The landlord loses the
                    benefit of years of banked capacity. When a high-inflation
                    year arrives and the landlord tries to draw a bank that was
                    silently reset, the calculation is wrong. Tenants who audit
                    will find the bank should have been maintained and demand
                    the correction, often with interest.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Calculating the Bank on the Cap Maximum Rather Than Actual
                    Obligation
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The bank balance should be calculated on the difference
                    between the actual tenant obligation and the maximum
                    recoverable, not on the cap limit alone. Using the cap limit
                    as the base year for each year&apos;s bank calculation
                    (rather than the actual amount paid) inflates the bank
                    artificially, allowing the landlord to draw more than the
                    lease permits.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Including Non-Controllable Expenses in the Bank Calculation
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The cumulative bank applies only to controllable expenses
                    (those subject to the cap). If property taxes or insurance
                    are included in the bank calculation, the bank will be
                    either overstated (if non-controllables increased) or
                    understated (if they decreased). The bank must be calculated
                    exclusively on the controllable expense component.
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
                What is a cumulative CAM cap bank?
              </h3>
              <p className="text-muted-foreground">
                A cumulative CAM cap bank tracks unused cap capacity from years
                where actual CAM increases were below the limit. This banked
                capacity carries forward, allowing larger recoveries in future
                years when actual expenses grow faster than the annual cap
                percentage.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                How do I know if my lease has a cumulative cap?
              </h3>
              <p className="text-muted-foreground">
                Look for language stating unused amounts &ldquo;shall carry
                forward,&rdquo; &ldquo;accumulate,&rdquo; or are
                &ldquo;available for use in subsequent years.&rdquo; A cap that
                simply limits annual increases without carryforward language is
                non-cumulative.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                When does a cumulative cap bank reset?
              </h3>
              <p className="text-muted-foreground">
                Cap banks reset at lease renewal or when explicitly triggered by
                the lease (e.g., after a full draw event, or when the lease
                specifies a periodic reset). They do not automatically reset at
                the end of a calendar year, as that would make the cap
                non-cumulative.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium">
                Can the bank balance grow indefinitely?
              </h3>
              <p className="text-muted-foreground">
                Yes, unless the lease caps the maximum bank balance or requires
                it to be drawn within a specified number of years. Some leases
                limit the bank to a maximum of two or three years of cap
                allowance; others do not limit it at all.
              </p>
            </div>
          </div>
        </section>

        {/* Related Resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/cam-cap-enforcement"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Cap Enforcement Guide
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cumulative and non-cumulative caps with worked examples.
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
                    How cap, gross-up, and exclusion clauses interact.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/tools/cam-cap-calculator"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    CAM Cap Calculator
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Calculate cumulative and non-cumulative cap limits.
                  </p>
                </div>
              </div>
            </Link>
            <Link
              href="/tools/cumulative-cap-bank-calculator"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium group-hover:text-primary">
                    Cumulative Cap Bank Calculator (.xlsx)
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Multi-year bank tracking spreadsheet template.
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Verify Your Cap Bank Across Every Tenant
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri tracks cumulative cap banks across your entire portfolio,
            checking that banks are maintained correctly, not reset annually,
            and applied only to controllable expenses. Run it against your Yardi
            or MRI export before your next reconciliation cycle.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "cumulative_cap_bank_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
