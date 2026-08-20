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
    "Lease Clauses That Change CAM Outcomes: The 10 Most Impactful Provisions",
  description:
    "Ten lease clauses that materially affect how much CAM a tenant pays. From gross-up thresholds to cumulative cap banks, a landlord's guide to what to watch for in new leases and amendments.",
  alternates: {
    canonical: `${SITE_URL}/resources/lease-clauses-that-change-cam-outcomes`,
  },
  openGraph: {
    title:
      "Lease Clauses That Change CAM Outcomes: The 10 Most Impactful Provisions",
    description:
      "Ten lease clauses that materially affect how much CAM a tenant pays. From gross-up thresholds to cumulative cap banks, a landlord's guide to what to watch for in new leases and amendments.",
    url: `${SITE_URL}/resources/lease-clauses-that-change-cam-outcomes`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What lease clauses have the biggest impact on CAM charges?",
    answer:
      "The ten clauses with the greatest impact on CAM outcomes are: pro-rata denominator definition, gross-up threshold and variable expense list, CAM cap type (cumulative vs. non-cumulative), management fee cap, audit rights window, reconciliation statement deadline, controllable vs. non-controllable distinction, capital exclusion carve-out, base year definition, and anchor exclusion. Each can materially change the tenant's annual CAM obligation independent of actual expense levels.",
  },
  {
    question:
      "What is the difference between a cumulative and non-cumulative CAM cap?",
    answer:
      "A non-cumulative CAM cap limits year-over-year increases to a fixed percentage (e.g., 5%) and resets every year. Unused cap capacity is forfeited. A cumulative cap banks unused capacity: if expenses only grew 2% when a 5% cap applies, the unused 3% carries forward and can be recovered in a subsequent year. Cumulative caps significantly increase landlord recovery potential over a multi-year lease term and are often not fully understood at signing.",
  },
  {
    question: "How does the pro-rata denominator definition affect tenant CAM?",
    answer:
      "The denominator definition can swing a tenant's CAM allocation by 5-15% depending on the building type and occupancy profile. A denominator based on total rentable area (including vacant space) produces lower per-tenant allocations than one based on occupied area. Anchor exclusions that remove a large tenant's SF from the denominator concentrate costs among remaining tenants, sometimes increasing their allocations by 15-25%.",
  },
  {
    question: "What is a base year in a CAM lease, and why does it matter?",
    answer:
      "A base year CAM structure requires tenants to pay only the increase in operating expenses above a specified base year amount. The choice of base year significantly affects the tenant's obligations. A base year with unusually high expenses creates a high floor that reduces future step-ups. A base year with unusually low expenses creates a low floor that accelerates step-up exposure. The definition of what is included in the base year calculation is equally important.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Lease Clauses That Change CAM Outcomes",
    url: `${SITE_URL}/resources/lease-clauses-that-change-cam-outcomes`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline:
    "Lease Clauses That Change CAM Outcomes: The 10 Most Impactful Provisions",
  description:
    "Ten lease clauses that materially affect how much CAM a tenant pays. From gross-up thresholds to cumulative cap banks, a landlord's guide to what to watch for in new leases and amendments.",
  url: `${SITE_URL}/resources/lease-clauses-that-change-cam-outcomes`,
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
  wordCount: 1600,
});

interface ClauseItem {
  number: number;
  title: string;
  exampleLanguage: string;
  whyItMatters: string;
  watchFor: string;
  relatedLink?: string;
  relatedLinkText?: string;
}

const clauses: ClauseItem[] = [
  {
    number: 1,
    title: "Pro-Rata Denominator Definition",
    exampleLanguage:
      "Tenant's Pro-Rata Share shall equal the Rentable Area of the Premises divided by the total Rentable Area of the Building as of the Commencement Date, which the parties agree is [X] square feet.",
    whyItMatters:
      "The denominator definition can swing a tenant's CAM allocation by 5-15% depending on the building's occupancy profile and how vacant space is treated. A denominator fixed at the total rentable area at commencement does not change as occupancy fluctuates. It protects the tenant from increased allocations when the building fills up, but also protects the landlord when the building empties. A denominator based on occupied area shifts more cost to remaining tenants during vacancy.",
    watchFor:
      "Whether the denominator is fixed or dynamic. Whether anchor tenant SF is excluded. Whether the denominator updates automatically when the tenant expands or contracts. A fixed denominator that is never updated after lease amendments is one of the most common sources of pro-rata errors.",
    relatedLink: "/resources/pro-rata-denominator-explained",
    relatedLinkText: "Pro-Rata Denominator Explained",
  },
  {
    number: 2,
    title: "Gross-Up Threshold and Variable Expense List",
    exampleLanguage:
      "If the Building is not at least ninety-five percent (95%) occupied during any year, Operating Expenses for such year shall be adjusted to reflect what Operating Expenses would have been if the Building had been ninety-five percent (95%) occupied during such year, applying such adjustment only to those Operating Expenses that are variable in nature.",
    whyItMatters:
      "The gross-up threshold (90% vs. 95%) materially changes the CAM pool in low-occupancy buildings. On a $500,000 variable expense pool in a building running at 78% occupancy, the difference between a 90% and 95% threshold is approximately $30,000 in grossed-up expenses. The variable expense list (which expenses are adjusted and which are not) has equal or greater impact. A list that includes utilities but excludes janitorial and landscaping produces a different result than one that includes all three.",
    watchFor:
      "Whether the threshold is 90% or 95%. Whether the variable expense list is defined explicitly or left to interpretation. Whether gross-up applies to management fees. Some landlord-favorable leases define all expenses as variable; tenant-favorable leases define most as fixed.",
    relatedLink: "/resources/cam-gross-up-guide",
    relatedLinkText: "CAM Gross-Up Guide",
  },
  {
    number: 3,
    title: "CAM Cap Type: Cumulative vs. Non-Cumulative",
    exampleLanguage:
      "Notwithstanding the foregoing, the year-over-year increase in Controllable Operating Expenses charged to Tenant shall not exceed five percent (5%) per year on a cumulative, compounding basis.",
    whyItMatters:
      "The difference between cumulative and non-cumulative caps is one of the most underestimated lease economic issues. A non-cumulative 5% cap limits each year's increase to 5% and resets annually. If expenses grow only 2% in year one, the landlord cannot recover more than 5% in year two. A cumulative cap banks the unused 3% from year one and allows the landlord to recover up to 8% in year two (3% carried forward plus 5% current cap). Over a 10-year lease with consistent 2-3% expense growth, cumulative cap banks can accumulate significant unclaimed capacity that the landlord can deploy in a high-expense year.",
    watchFor:
      "Whether the cap is cumulative or non-cumulative. Whether the base is the prior year's actual or the prior year's capped amount. Whether caps apply only to controllable expenses (most common) or to all CAM.",
    relatedLink: "/resources/cam-cap-enforcement",
    relatedLinkText: "CAM Cap Enforcement Guide",
  },
  {
    number: 4,
    title: "Management Fee Cap",
    exampleLanguage:
      "Operating Expenses shall include a management fee not to exceed three percent (3%) of gross revenues from the Property.",
    whyItMatters:
      "The management fee calculation basis (gross revenues vs. eligible operating expenses vs. a flat fee) produces substantially different fee amounts on the same property. A 4% fee on gross revenues in a 100,000 SF property with $30/SF in gross revenue yields $120,000 annually. A 4% fee on eligible operating expenses of $600,000 yields $24,000. The choice of basis is more impactful than the percentage itself.",
    watchFor:
      "The fee basis: gross revenues, eligible expenses, or flat amount. Whether the cap applies to fees paid to affiliated property managers. Whether the cap changes if the landlord switches from a third-party manager to an affiliated entity.",
    relatedLink: "/resources/management-fee-recoverability-cam",
    relatedLinkText: "Management Fee Recoverability in CAM",
  },
  {
    number: 5,
    title: "Audit Rights Window",
    exampleLanguage:
      "Tenant shall have the right, at Tenant's sole cost and expense, to audit Landlord's books and records relating to Operating Expenses for any calendar year, provided Tenant delivers written notice of such audit within twelve (12) months following delivery of the applicable reconciliation statement.",
    whyItMatters:
      "The audit window determines how long the landlord's statement remains contestable. A 12-month window gives tenants one year from statement delivery to file an audit demand; a 24-month window doubles the exposure period. From the landlord's perspective, a shorter window (12 months) and clear statement-delivery mechanics (certified mail or email with read receipt) create a documented starting point for the window.",
    watchFor:
      "The window length (12, 18, or 24 months). Whether the window runs from statement delivery or from the end of the reconciliation year. Whether there is a deemed-final provision if the landlord does not respond to audit findings within a specified period.",
    relatedLink: "/resources/landlord-audit-rights-cam-recordkeeping",
    relatedLinkText: "Landlord Audit Rights and Recordkeeping",
  },
  {
    number: 6,
    title: "Reconciliation Statement Deadline",
    exampleLanguage:
      "Landlord shall deliver to Tenant a reconciliation statement for each calendar year within one hundred twenty (120) days following the end of such year. Landlord's failure to deliver such statement within such period shall constitute a waiver of any additional amounts due for such year.",
    whyItMatters:
      "A waiver provision tied to the statement deadline creates real landlord risk. If the reconciliation statement for 2024 is due by April 30, 2025, and it is delivered May 15, 2025, a strict waiver clause means the landlord forfeits any true-up owed by the tenant for that year. That forfeiture can reach tens of thousands of dollars per tenant. Some leases do not include a waiver provision; others make the waiver conditional on the tenant providing written notice of the late delivery.",
    watchFor:
      "Whether a waiver provision exists. The statement delivery deadline (90 days, 120 days, or 180 days after year-end). Whether the waiver applies to the entire true-up or only to amounts above estimated payments.",
  },
  {
    number: 7,
    title: "Controllable vs. Non-Controllable CAM",
    exampleLanguage:
      "For purposes of the cap set forth in Section [X], Controllable Operating Expenses shall mean all Operating Expenses other than Taxes, Insurance, Utilities, and costs arising from compliance with applicable law.",
    whyItMatters:
      "Most CAM caps apply only to controllable expenses, which are typically defined as everything except taxes, insurance, utilities, and compliance costs. The practical effect is that the categories with the highest year-over-year volatility (taxes and insurance especially) are uncapped. A property in a market with rapidly rising valuations (and therefore rapidly rising property taxes) can see non-controllable expenses increase 20-30% in a single year with no cap protection for the tenant.",
    watchFor:
      "Which expenses are defined as non-controllable and therefore uncapped. Whether utilities are fully excluded (most common) or only metered utilities. Whether insurance for specific perils (earthquake, flood) is treated separately.",
  },
  {
    number: 8,
    title: "Capital Exclusion Carve-Out",
    exampleLanguage:
      "Operating Expenses shall exclude costs of capital improvements, capital replacements, and capital repairs, as determined in accordance with generally accepted accounting principles; provided, however, that the cost of capital improvements that are required by applicable law enacted after the Commencement Date, or that are installed for the purpose of reducing Operating Expenses, may be included in Operating Expenses on an amortized basis.",
    whyItMatters:
      "The capital exclusion is the most frequently disputed line in a CAM audit. The lease-specific definition of capital (which may differ from GAAP) controls what the landlord can include in the expense pool. Carve-outs that allow amortized capital for law-compliance and cost-reduction projects create a pathway for large capital costs to enter the pool over time. An HVAC replacement required by an energy efficiency ordinance could be amortized into CAM over its useful life even though it is a capital improvement.",
    watchFor:
      "Whether amortized capital is allowed and under what conditions. Whether there is a materiality threshold (only capital items above $X are excluded). Whether the lease defines capital by reference to GAAP, which gives accountants discretion.",
    relatedLink: "/resources/detect-capex-in-gl-export",
    relatedLinkText: "Detecting CapEx in a GL Export",
  },
  {
    number: 9,
    title: "Base Year Definition",
    exampleLanguage:
      "Tenant's Base Year shall be the calendar year in which the Commencement Date occurs. Operating Expense increases recoverable from Tenant shall be limited to the amount by which actual Operating Expenses in any subsequent year exceed the Operating Expenses incurred in the Base Year.",
    whyItMatters:
      "The base year sets the floor for tenant CAM exposure. A base year with unusually high expenses (major repair, first-year build-out costs, abnormal weather events) creates a high floor and reduces the tenant's step-up obligations for the duration of the lease. A base year with managed, below-average expenses sets a low floor that accelerates step-up exposure. Some tenants negotiate for the base year to be grossed up to 95% occupancy so that low-occupancy base-year expenses don't create an artificially low floor.",
    watchFor:
      "Whether the base year is the commencement year or a specific calendar year (which matters if the tenant takes possession mid-year). Whether the base year is grossed up. Whether non-recurring base-year expenses are normalized out.",
    relatedLink: "/resources/base-year-expense-stop-reconciliation",
    relatedLinkText: "Base Year and Expense Stop Reconciliation",
  },
  {
    number: 10,
    title: "Anchor Exclusion",
    exampleLanguage:
      "Notwithstanding the foregoing, [Anchor Tenant Name] and any replacement anchor tenant occupying more than [X] square feet of the Building shall be excluded from the denominator used to calculate Tenant's Pro-Rata Share.",
    whyItMatters:
      "Anchor exclusions remove a major tenant's square footage from the denominator used to calculate other tenants' pro-rata shares. In a retail center where the anchor occupies 40% of the total square footage, removing the anchor from the denominator concentrates 100% of the recoverable CAM pool among the remaining 60% of tenants, effectively increasing each in-line tenant's pro-rata share by 40-67% compared to a full-denominator calculation. When the anchor vacates or when the anchor exclusion clause is negotiated out of a new lease, the impact on remaining tenant allocations is substantial.",
    watchFor:
      "Whether the exclusion is permanent or only applies while the anchor occupies above a square footage threshold. Whether a replacement anchor is also excluded. Whether other large tenants have similar exclusion provisions that, in aggregate, concentrate costs disproportionately on smaller tenants.",
    relatedLink: "/resources/anchor-exclusion-denominator-risk",
    relatedLinkText: "Anchor Exclusion and Denominator Risk",
  },
];

const errorPatterns = [
  {
    title: "Amending one clause without reviewing downstream impacts on others",
    detail:
      "A lease amendment that changes the pro-rata denominator definition also affects the gross-up calculation, the CAM cap base, and the management fee calculation if that fee is based on a percentage of recoverable expenses. Teams that redline the denominator clause in isolation without reviewing its interactions with gross-up, cap, and fee provisions create internal inconsistencies in the lease that complicate every subsequent reconciliation.",
  },
  {
    title: "Using a form lease without customizing capital carve-outs",
    detail:
      "Standard form leases often have generic capital exclusion language that was not drafted with the specific property's capital profile in mind. A retail center with aging HVAC infrastructure and a near-term obligation to upgrade to a building automation system has fundamentally different capital risk than an office building with new MEP systems. Using a form lease's capital exclusion without tailoring it to the property's capital schedule leaves the landlord exposed when planned capital work is contested as non-recoverable.",
  },
  {
    title:
      "Not updating the lease abstract when amendments modify these clauses",
    detail:
      "A lease amendment executed in 2022 changed the CAM cap from non-cumulative to cumulative and lowered the gross-up threshold from 95% to 90%. The lease abstract in the property management system was not updated. Three subsequent reconciliation cycles applied the old (non-cumulative, 95% gross-up) terms. The underbilling on the gross-up difference alone was approximately $18,000 per year across four affected tenants. The misconfiguration was discovered during a portfolio audit in 2025. By then, the statute of limitations on the earliest year had run.",
  },
];

export default function LeaseClausesThatChangeCamOutcomesPage() {
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
            Lease Clauses That Change CAM Outcomes
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Lease Clauses That Change CAM Outcomes: The 10 Most Impactful
            Provisions
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            The lease terms you agree to at signing determine how much CAM
            revenue you can recover, and how much risk you carry in an audit.
            These are the 10 provisions that matter most.
          </p>
          <p className="text-sm text-muted-foreground">
            By{" "}
            <Link
              href="/about/angel-campa"
              className="text-foreground hover:underline"
            >
              Angel Campa, Founder, CapVeri
            </Link>{" "}
            &middot; Updated April 2026
          </p>
        </header>

        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">Quick Answer</h2>
          <p className="text-muted-foreground">
            The 10 lease clauses with the greatest impact on CAM outcomes are:
            pro-rata denominator definition, gross-up threshold and variable
            expense list, CAM cap type (cumulative vs. non-cumulative),
            management fee cap, audit rights window, statement deadline,
            controllable vs. non-controllable distinction, capital exclusion
            carve-out, base year definition, and anchor exclusion. Each one
            changes the math independently of actual expense levels. Two
            properties with identical operating costs can have dramatically
            different CAM recovery profiles depending on their lease terms.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Why These Clauses Matter Before Signing
          </h2>
          <p className="mb-4 text-muted-foreground">
            CAM recovery is not purely a function of operating expenses. It is a
            function of operating expenses as filtered through the specific
            terms of each lease. Two properties with identical expense pools and
            identical tenants can have substantially different net CAM
            recoveries, and substantially different audit exposure, based solely
            on how these 10 clauses were drafted.
          </p>
          <p className="text-muted-foreground">
            This page is the hub for the lease clause mechanics cluster. Each of
            the 10 clauses links to a dedicated page with detailed calculation
            examples, negotiation patterns, and audit defense considerations.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-8 text-2xl font-semibold">
            The 10 Most Impactful CAM Lease Provisions
          </h2>
          <div className="space-y-8">
            {clauses.map((clause) => (
              <div key={clause.number} className="rounded-lg border p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {clause.number}
                  </div>
                  <div className="flex-1">
                    <h3 className="mb-3 text-lg font-semibold text-foreground">
                      {clause.title}
                    </h3>

                    <div className="mb-4 rounded-md border-l-4 border-primary/40 bg-muted/60 px-4 py-3">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Example lease language:
                      </p>
                      <p className="text-sm italic text-muted-foreground">
                        &ldquo;{clause.exampleLanguage}&rdquo;
                      </p>
                    </div>

                    <div className="mb-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Why it matters
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {clause.whyItMatters}
                      </p>
                    </div>

                    <div className="mb-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        What to watch for
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {clause.watchFor}
                      </p>
                    </div>

                    {clause.relatedLink && (
                      <Link
                        href={clause.relatedLink}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        {clause.relatedLinkText}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            {errorPatterns.map((pattern) => (
              <div
                key={pattern.title}
                className="rounded-lg border border-destructive/20 bg-destructive/5 p-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  <div>
                    <p className="font-medium text-destructive-strong">
                      {pattern.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {pattern.detail}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {[
              {
                q: "What lease clauses have the biggest impact on CAM charges?",
                a: "The ten clauses with the greatest impact are: pro-rata denominator definition, gross-up threshold and variable expense list, CAM cap type (cumulative vs. non-cumulative), management fee cap, audit rights window, reconciliation statement deadline, controllable vs. non-controllable distinction, capital exclusion carve-out, base year definition, and anchor exclusion. Each can materially change the tenant's annual CAM obligation independent of actual expense levels.",
              },
              {
                q: "What is the difference between a cumulative and non-cumulative CAM cap?",
                a: "A non-cumulative CAM cap limits year-over-year increases to a fixed percentage (e.g., 5%) and resets annually. Unused cap capacity is forfeited. A cumulative cap banks unused capacity: if expenses grew only 2% when a 5% cap applies, the unused 3% carries forward and can be recovered in a subsequent year. Cumulative caps significantly increase landlord recovery potential over a multi-year lease term.",
              },
              {
                q: "How does the pro-rata denominator definition affect tenant CAM?",
                a: "The denominator definition can swing a tenant's CAM allocation by 5-15% depending on the building's occupancy profile. A denominator fixed at total rentable area produces lower per-tenant allocations than one based on occupied area. Anchor exclusions that remove a large tenant's SF from the denominator concentrate costs among remaining tenants, sometimes increasing their allocations by 15-25%.",
              },
              {
                q: "What is a base year in a CAM lease, and why does it matter?",
                a: "A base year CAM structure requires tenants to pay only the increase in operating expenses above a specified base year amount. The choice of base year significantly affects the tenant's obligations. A base year with unusually high expenses creates a high floor that reduces future step-ups. A base year with unusually low expenses sets a low floor that accelerates step-up exposure.",
              },
            ].map((item) => (
              <div key={item.q}>
                <h3 className="mb-2 font-semibold text-foreground">{item.q}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                href: "/resources/cam-gross-up-guide",
                title: "CAM Gross-Up Guide",
                desc: "How gross-up works, when it applies, and how the variable expense list changes the calculation.",
              },
              {
                href: "/resources/cam-cap-enforcement",
                title: "CAM Cap Enforcement",
                desc: "Cumulative vs. non-cumulative cap mechanics and how to track cap banks correctly.",
              },
              {
                href: "/resources/pro-rata-denominator-explained",
                title: "Pro-Rata Denominator Explained",
                desc: "The four denominator types and how each affects tenant allocation in different buildings.",
              },
              {
                href: "/resources/base-year-expense-stop-reconciliation",
                title: "Base Year and Expense Stop Reconciliation",
                desc: "How base year structures work and common errors in calculating step-up obligations.",
              },
              {
                href: "/resources/anchor-exclusion-denominator-risk",
                title: "Anchor Exclusion and Denominator Risk",
                desc: "How anchor exclusions concentrate CAM costs and what happens when anchors vacate.",
              },
              {
                href: "/resources/management-fee-recoverability-cam",
                title: "Management Fee Recoverability",
                desc: "The three calculation bases for management fees and how each affects the CAM pool.",
              },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
              >
                <p className="font-medium group-hover:text-primary">
                  {link.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {link.desc}
                </p>
              </Link>
            ))}
          </div>
          <div className="mt-4">
            <Link
              href="/cam-reconciliation-software"
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <CheckCircle className="h-4 w-4" />
              CAM Reconciliation Software Guide
            </Link>
          </div>
        </section>

        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Verify Every Clause Is Applied Correctly
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri checks that your reconciliation applies the right gross-up
            threshold, denominator, cap type, and exclusion rules from your
            lease abstract, catching the mismatches before statements go out.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "lease_clauses_cam_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
