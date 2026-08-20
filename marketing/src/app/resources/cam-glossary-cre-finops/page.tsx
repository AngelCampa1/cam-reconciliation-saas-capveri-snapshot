import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CAM Glossary for CRE FinOps Teams: 40 Terms You Need to Know",
  description:
    "A plain-English glossary of CAM and operating expense terms for property accounting and CRE FinOps teams. Covers reconciliation, gross-up, caps, BOMA, and more.",
  alternates: {
    canonical: `${SITE_URL}/resources/cam-glossary-cre-finops`,
  },
  openGraph: {
    title: "CAM Glossary for CRE FinOps Teams: 40 Terms You Need to Know",
    description:
      "Plain-English definitions of 40 CAM and operating expense terms for property accounting and CRE FinOps teams.",
    url: `${SITE_URL}/resources/cam-glossary-cre-finops`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is the difference between a CAM cap and an expense stop?",
    answer:
      "A CAM cap limits how much a tenant's CAM contribution can increase each year (for example, no more than 5% above the prior year's amount). An expense stop is a deductible: the landlord pays CAM costs up to the stop amount, and the tenant pays only costs above the stop. A CAM cap is a ceiling on increases; an expense stop is a floor the landlord covers. Confusing the two leads to significant calculation errors.",
  },
  {
    question:
      "What is the difference between a cumulative cap and a non-cumulative cap?",
    answer:
      "A non-cumulative CAM cap limits increases to a fixed percentage above the prior year's actual amount; each year resets independently. A cumulative cap compounds over time from a base year: in year N, the cap amount equals the base year amount multiplied by (1 + cap rate) raised to the power of N. If actual expenses grow slowly in early years (unused cap room), a cumulative cap banks that unused capacity, allowing for larger increases in later years. Cumulative caps are significantly more tenant-favorable.",
  },
  {
    question: "What does 'base year' mean and why does it matter for CAM?",
    answer:
      "In a base year expense stop structure, the base year is the calendar year whose actual operating expenses define the landlord's expense stop obligation. If the base year is 2024 with $8.50/RSF in actual expenses, the tenant pays only the CAM costs above $8.50/RSF in subsequent years. The base year is not an indexed amount. It is locked at actual costs for that year. If the base year had unusually low expenses (e.g., a partial year or deferred maintenance), tenants pay more in subsequent years than a normal base year would require.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CAM Glossary for CRE FinOps",
    url: `${SITE_URL}/resources/cam-glossary-cre-finops`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline: "CAM Glossary for CRE FinOps Teams: 40 Terms You Need to Know",
  description:
    "Plain-English definitions of 40 CAM and operating expense terms for property accounting and CRE FinOps teams.",
  url: `${SITE_URL}/resources/cam-glossary-cre-finops`,
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Reference",
  wordCount: 1800,
});

type GlossaryEntry = {
  term: string;
  definition: string;
};

const glossaryEntries: GlossaryEntry[] = [
  {
    term: "Anchor Exclusion",
    definition:
      "A lease provision that excludes an anchor tenant's leased premises from the denominator used to calculate other tenants' pro-rata shares. Because anchor tenants often have separately negotiated CAM arrangements or fixed CAM contributions, their RSF is removed from the denominator. The effect is to increase the pro-rata share (and therefore the CAM obligation) of non-anchor tenants in the same shopping center.",
  },
  {
    term: "Base Year",
    definition:
      "In an expense stop structure, the base year is the calendar or fiscal year whose actual operating expenses define the landlord's baseline obligation. The landlord absorbs operating costs up to the base year amount; the tenant pays the excess above it. The base year is a fixed dollar amount. It does not adjust for inflation. A base year with unusually low expenses (due to deferred maintenance or a partial occupancy year) creates an unfavorable baseline for tenants in subsequent years.",
  },
  {
    term: "Base Year Expense Stop",
    definition:
      "A net lease structure in which the landlord agrees to pay all operating expenses up to the amount incurred in the base year (the expense stop), and the tenant pays only operating costs above that threshold. Unlike a fixed dollar expense stop, a base year expense stop floats with whatever the actual costs were in that specific year. This structure is common in multi-story office buildings.",
  },
  {
    term: "BOMA",
    definition:
      "Building Owners and Managers Association. BOMA publishes measurement standards widely used in commercial real estate to define rentable square footage, common area, and load factors. The current standard for office buildings is BOMA 2017 (ANSI/BOMA Z65.1-2017); for retail and industrial, separate standards apply. BOMA measurement methodology directly affects the denominator used in pro-rata share calculations. Disputes about whether a building was measured per BOMA standards are a subset of CAM audit findings.",
  },
  {
    term: "CAM (Common Area Maintenance)",
    definition:
      "The operating expenses associated with maintaining the common areas and building systems of a commercial property, allocated to tenants as additional rent beyond base rent. CAM charges include items such as janitorial services, landscaping, security, common area utilities, insurance, property management fees, and property taxes (in a NNN lease). The specific expenses recoverable as CAM are defined by the lease. Market custom is a guide, not a rule.",
  },
  {
    term: "CAM Cap",
    definition:
      "A lease provision that limits how much a tenant's annual CAM contribution can increase from one year to the next. Caps are typically expressed as a percentage (e.g., 5% per year) above the prior year's actual amount or a base year amount. CAM caps apply only to controllable CAM expenses. Non-controllable costs (taxes, insurance, utilities) are typically excluded from the cap calculation. Landlords must track cap compliance separately for each tenant with a cap clause.",
  },
  {
    term: "CAM Estimate",
    definition:
      "The landlord's projection of annual CAM expenses for an upcoming year, used to set tenants' monthly additional rent payments during the year. At year-end, the actual expenses are compared to the estimate. Tenants pay the shortfall (true-up) or receive a credit for overpayment. Estimates that significantly understate actual costs create large true-up collection problems; estimates that significantly overstate actual costs generate tenant complaints and refund obligations.",
  },
  {
    term: "CAM Pool",
    definition:
      "The aggregate of all recoverable operating expenses for a property in a given year, after excluding non-recoverable items and applying any required adjustments (gross-up, capital exclusions, excluded expense carve-outs). The CAM pool is the numerator base before management fees are added and before tenants' individual pro-rata shares are applied. An error in defining the CAM pool (including expenses that should be excluded) flows through to every tenant's bill.",
  },
  {
    term: "CAM Reconciliation",
    definition:
      "The annual process of comparing actual CAM expenses for the prior year against the estimates tenants paid monthly during the year. The reconciliation produces either a true-up invoice (if actual costs exceeded estimates) or a credit (if estimates exceeded actuals) for each tenant. CAM reconciliation must be completed and statements delivered within the deadline specified in each lease, typically 90 to 180 days after the lease year ends.",
  },
  {
    term: "Capital Expenditure",
    definition:
      "A cost that extends the useful life of a building component, replaces an asset entirely, or improves the property beyond its original condition. Capital expenditures (CapEx) are generally excluded from the recoverable CAM pool under standard NNN leases. Some leases permit amortized recovery of capital items - the annual amortized slice (cost divided by useful life) may be billed to tenants if the lease explicitly authorizes this structure. The IRS useful-life test (useful life ≥ 1 year = capital) provides a practical classification standard.",
  },
  {
    term: "Common Area",
    definition:
      "The portions of a commercial property used by all tenants and their visitors: lobbies, hallways, elevators, restrooms, parking lots, landscaped areas, and mechanical equipment rooms. The definition of common area affects both the expenses eligible for CAM recovery and the denominator calculation for pro-rata shares. Lease definitions of common area vary; some leases treat certain areas (roof, structure) as landlord-exclusive areas, affecting which maintenance costs are recoverable.",
  },
  {
    term: "Controllable CAM",
    definition:
      "Operating expenses that the landlord can manage and control through vendor selection, service levels, and operational decisions: typically janitorial, landscaping, security, and management fees. Controllable CAM is the category subject to annual cap limitations in most lease structures. The specific definition of controllable vs. non-controllable CAM varies by lease; absent a definition, disputes arise over which category applies to specific line items.",
  },
  {
    term: "Cumulative Cap",
    definition:
      "A CAM cap structure that compounds from a base year, allowing unused cap room from years when actual increases were below the cap rate to carry forward. If the cap is 5% compounding and actual increases were only 2% in years 1 and 2, the cumulative cap in year 3 allows the landlord to recover more than 5% above the year-2 amount. Cumulative caps are more tenant-favorable than non-cumulative caps because they theoretically prevent landlords from recovering deferred cost increases. The base year and the start of the compounding period must be precisely defined in the lease.",
  },
  {
    term: "Denominator",
    definition:
      "The total rentable square footage of the building or project used in the pro-rata share calculation. The denominator definition is one of the most frequently litigated CAM issues: whether it includes anchor tenant space (see Anchor Exclusion), whether it is based on total rentable area or occupied area, whether it is fixed or recalculated annually, and whether it is measured per BOMA standards. An incorrect denominator affects every tenant's bill for every year.",
  },
  {
    term: "Expense Stop",
    definition:
      "A dollar threshold (usually expressed in dollars per RSF per year) above which the tenant is responsible for operating costs. The landlord absorbs all operating expenses up to the expense stop amount; the tenant pays only the costs above the stop. An expense stop functions as a deductible. It is not a cap. Expense stops are typical in full-service gross and modified gross office leases and are distinct from CAM caps, which limit annual increases rather than the tenant's absolute share.",
  },
  {
    term: "Fixed CAM",
    definition:
      "A lease structure in which the tenant pays a fixed dollar amount per RSF per year (or per month) for CAM, without reconciliation against actual expenses. Fixed CAM eliminates the annual reconciliation process and the true-up, providing billing certainty for both parties. The tradeoff: if actual costs significantly exceed the fixed amount, the landlord absorbs the difference; if actual costs are below the fixed amount, the tenant overpays. Fixed CAM is common in certain retail leases and is increasingly favored by tenants seeking cost predictability.",
  },
  {
    term: "GL Export",
    definition:
      "A general ledger export from the property management system (Yardi, MRI, AppFolio) containing all transactions coded to operating expense accounts for a property during a period. The GL export is the primary source document for CAM reconciliation. Before reconciliation calculations begin, the GL export should be screened for CapEx miscoding, excluded expenses, tenant-specific costs, and account mapping errors. A GL export that has not been reviewed is not a reconciliation. It is an unaudited data dump.",
  },
  {
    term: "Gross-Up",
    definition:
      "An adjustment that increases variable operating expenses (those that fluctuate with occupancy) to the amount they would have been if the building were at the lease's defined occupancy threshold, typically 90% to 95%. Without gross-up, tenants in a partially occupied building would pay a pro-rata share calculated on actual low-occupancy costs; when the building fills up, costs increase and per-tenant expenses jump significantly. Gross-up eliminates this variability. Gross-up applies only to variable expenses. Fixed costs (taxes, insurance, management fees on gross revenues) are not grossed up.",
  },
  {
    term: "Gross Lease",
    definition:
      "A lease structure in which the tenant pays a single, all-inclusive rent amount and the landlord is responsible for all operating expenses: taxes, insurance, maintenance, utilities. The tenant has no separate CAM obligation. Full-service gross leases are common in office buildings; the lease may include an expense stop above which the tenant shares in cost increases. Under a true gross lease with no expense stop, CAM reconciliation does not occur.",
  },
  {
    term: "Lease Abstract",
    definition:
      "A summary document that extracts and organizes the key business and legal terms from a commercial lease into a standardized format. For CAM purposes, a complete lease abstract must capture: the pro-rata share denominator definition, gross-up threshold and methodology, CAM exclusions, management fee cap, audit rights window, estimate letter timing requirement, and reconciliation statement deadline. Lease abstracts that omit CAM-specific fields create systematic errors in the reconciliation process.",
  },
  {
    term: "Lease Year",
    definition:
      "The twelve-month period defined in the lease as the basis for CAM calculations and reconciliation. For most leases, the lease year is the calendar year (January 1 to December 31), but some leases define a fiscal year that does not align with the calendar year. The lease year affects when reconciliation statements are due, when estimate letters must be sent, and when the audit rights clock starts. In portfolios with tenants on multiple lease year schedules, the reconciliation calendar must be managed separately for each lease year group.",
  },
  {
    term: "Management Fee",
    definition:
      "A charge for property management services, recoverable from tenants as CAM under most NNN leases. Management fees are structured either as a percentage of gross revenues (typically 3–5%) or as a percentage of recoverable CAM expenses (typically 10–15%). The lease controls which structure applies and typically caps the recoverable amount. The management fee must be calculated on the recoverable expense pool only. Applying the fee percentage to excluded expenses (capital items, non-recoverable costs) inflates the recovery and is the most common management fee audit finding.",
  },
  {
    term: "Modified Gross Lease",
    definition:
      "A hybrid lease structure that falls between a full-service gross lease and a NNN lease. In a modified gross lease, the tenant pays base rent plus some but not all operating expenses (for example, base rent plus utilities, or base rent plus a share of operating costs above an expense stop). The specific split is defined in the lease and varies widely. Modified gross leases are common in multi-tenant office and flex/industrial properties.",
  },
  {
    term: "Net Lease",
    definition:
      "A lease structure in which the tenant pays base rent plus some or all operating expenses separately. Net (N), double-net (NN), and triple-net (NNN) leases represent increasing tenant responsibility for operating costs. In a NNN lease, the tenant pays base rent plus property taxes, property insurance, and CAM expenses. In a N or NN lease, the landlord retains responsibility for some operating cost categories. CAM reconciliation is a feature of NNN and, to a lesser extent, NN lease structures.",
  },
  {
    term: "NNN Lease",
    definition:
      "A triple-net lease in which the tenant pays base rent plus all three categories of operating expenses: property taxes, property insurance, and common area maintenance (CAM). Under a NNN lease, the tenant bears the risk of operating cost increases and receives the benefit of decreases. NNN leases are the standard structure for retail, industrial, and single-tenant commercial properties. CAM reconciliation processes, gross-up, caps, and audit rights are all constructs of the NNN lease structure.",
  },
  {
    term: "Non-Controllable CAM",
    definition:
      "Operating expenses outside the landlord's direct control: typically real estate taxes, property insurance premiums, and utilities. Non-controllable CAM is excluded from annual cap calculations in most lease structures, meaning tenants bear full increases in these categories regardless of any CAM cap. The boundary between controllable and non-controllable CAM is a frequent source of dispute (for example, whether a utility cost spike due to landlord inefficiency should be treated as non-controllable).",
  },
  {
    term: "Non-Recoverable Expense",
    definition:
      "An operating cost that is excluded from the CAM pool either by explicit lease carve-out or by inherent nature. Standard non-recoverable expenses include capital expenditures, depreciation, financing costs, leasing commissions, tenant improvement costs, income taxes, and costs correcting original construction defects. The specific exclusion list is lease-defined. Market custom is a guide, not a substitute for reading the lease. An expense not listed in the exclusion list is not automatically recoverable.",
  },
  {
    term: "Occupancy Rate",
    definition:
      "The percentage of a building's total rentable square footage that is leased to paying tenants at a given time. Occupancy rate is the key variable in gross-up calculations: if occupancy falls below the lease's gross-up threshold (e.g., 90%), variable expenses are grossed up to the amount they would have been at the threshold occupancy. Occupancy rate must be calculated consistently with the lease's denominator definition. Whether it uses total RSF or only the leasable area affects the rate.",
  },
  {
    term: "Operating Expenses",
    definition:
      "The recurring costs of running and maintaining a commercial property in its current condition, as distinguished from capital expenditures (which improve or extend the property's useful life). Operating expenses include janitorial, utilities, landscaping, security, routine maintenance, insurance, property taxes, and management fees. In a NNN lease, operating expenses (or a defined subset of them) are recoverable from tenants as CAM. The operating expense category is the starting point for CAM pool construction, from which excluded items and non-recoverable costs are then removed.",
  },
  {
    term: "Pro-Rata Share",
    definition:
      "The percentage of total CAM expenses allocated to a specific tenant, calculated by dividing the tenant's rentable square footage by the building's total rentable square footage (or by the lease-defined denominator). Pro-rata share = tenant RSF ÷ denominator RSF. If a tenant occupies 8,500 RSF in a building with a denominator of 85,000 RSF, their pro-rata share is 10.0%. Errors in the denominator definition or in the tenant's RSF are multiplied by the full CAM pool amount for every year of the lease.",
  },
  {
    term: "Recoverable Expense",
    definition:
      "An operating cost that the lease explicitly permits to be passed through to tenants as part of CAM. Recoverable expenses are not defined by an industry standard list. They are defined by each lease. Common recoverable expenses in NNN leases include janitorial, landscaping, parking lot maintenance, snow removal, common area utilities, property insurance, property taxes, HVAC maintenance contracts, security, and property management fees (within the cap). Always verify recoverability against the specific lease language.",
  },
  {
    term: "Reconciliation Period",
    definition:
      "The lease year for which actual CAM expenses are being compared against estimates in a CAM reconciliation. The reconciliation period is typically one year (the lease year) and aligns with the period for which monthly CAM estimates were collected. For a calendar-year lease, the reconciliation period is January 1 through December 31 of the prior year. The reconciliation period determines which GL entries are included in the reconciliation and which estimate payments are offset against the actual expenses.",
  },
  {
    term: "Reconciliation Statement",
    definition:
      "The formal document sent by the landlord to each tenant after the close of the lease year, summarizing actual CAM expenses, the tenant's pro-rata share, the total amount billed to the tenant, the total amount paid by the tenant in estimates, and the resulting true-up amount (balance due or credit). The reconciliation statement must be sent within the deadline specified in each lease, typically 90 to 180 days after the lease year ends. The statement is the starting point for the tenant's audit rights clock.",
  },
  {
    term: "RSF (Rentable Square Feet)",
    definition:
      "The measurement of a tenant's leased space including both the usable square footage (the tenant's exclusive area) and the tenant's allocated share of common areas (load factor). RSF is calculated using the BOMA standard methodology: usable square footage multiplied by the building's load factor. RSF is the basis for base rent calculation, pro-rata share calculation, and CAM expense allocation. Disputes about RSF measurement (whether the tenant's space was measured per the applicable BOMA standard) are a component of some CAM audits.",
  },
  {
    term: "True-Up",
    definition:
      "The payment or credit resulting from a CAM reconciliation. If actual CAM expenses for the year exceeded the estimates the tenant paid monthly, the tenant owes a true-up payment (the shortfall). If actual expenses were below estimates, the landlord issues a credit applied to future monthly payments or a refund. True-up amounts are typically due within 30 days of the tenant receiving the reconciliation statement. Large true-up invoices, particularly those resulting from estimate understatements, are a common trigger for tenant disputes and audit requests.",
  },
  {
    term: "Useful Life Test",
    definition:
      "The IRS standard for distinguishing capital expenditures from operating expenses: if the resulting asset or improvement has a useful life of one year or more, it is capital. This test is widely used in CAM reconciliation as the practical standard for classifying borderline repair vs. replacement decisions. The IRS MACRS depreciation schedule assigns specific useful lives to common building components (e.g., 15-year land improvements, 39-year nonresidential real property). Applying the useful life test consistently prevents CapEx from flowing into the recoverable CAM pool.",
  },
  {
    term: "Variable Expense",
    definition:
      "A CAM expense whose total cost fluctuates with building occupancy (for example, janitorial services, utilities for common areas, and trash removal). Variable expenses increase as the building fills and decrease when occupancy falls. Variable expenses are subject to gross-up adjustments; fixed expenses are not. The distinction between variable and fixed expenses is important because grossing up a fixed expense (such as insurance or taxes) would overstate the recoverable pool.",
  },
  {
    term: "Year-End Close",
    definition:
      "The process of finalizing the prior fiscal year's general ledger entries before extracting the GL export for CAM reconciliation. The year-end close includes posting year-end accruals (utility billing lags, insurance final premiums, property tax adjustments), reclassifying any capital expenditures miscoded to operating accounts, and freezing the GL for the closed period. CAM reconciliation should not begin until the year-end close is complete. Reconciliations run against a non-closed GL produce preliminary results that must be restated when late entries are posted.",
  },
  {
    term: "Gross-Up Threshold",
    definition:
      "The minimum occupancy level specified in the lease above which variable expenses are not adjusted. If the building's actual occupancy is at or above the threshold (commonly 90% or 95%), no gross-up adjustment is applied. If actual occupancy falls below the threshold, variable expenses are adjusted upward to the amount they would have been at the threshold level. The threshold percentage and the occupancy measurement methodology (based on total RSF, leasable area, or occupied area) must both be specified in the lease to avoid disputes.",
  },
  {
    term: "Audit Rights Window",
    definition:
      "The period after a tenant receives a CAM reconciliation statement during which the tenant may request and conduct an audit of the landlord's CAM calculations. Most commercial leases provide an audit rights window of 12 to 24 months after receipt of the reconciliation statement. Once the window closes, the tenant generally waives the right to challenge that year's reconciliation. The audit rights window is calculated from the date the reconciliation statement is received (not the date the landlord mailed it), making delivery confirmation important for both parties.",
  },
];

export default function CAMGlossaryCREFinOpsPage() {
  // Group by first letter
  const grouped = glossaryEntries.reduce<Record<string, GlossaryEntry[]>>(
    (acc, entry) => {
      const letter = entry.term[0].toUpperCase();
      if (!acc[letter]) acc[letter] = [];
      acc[letter].push(entry);
      return acc;
    },
    {},
  );
  const letters = Object.keys(grouped).sort();

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
            <span className="text-foreground">CAM Glossary</span>
          </nav>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            CAM Glossary for CRE FinOps Teams: 40 Terms You Need to Know
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-2xl">
            Plain-English definitions of the key CAM and operating expense terms
            used in commercial lease accounting, reconciliation, and audit.
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
            CAM reconciliation has a specialized vocabulary that bridges real
            estate law, accounting, and property management. This glossary
            covers the 40 terms you will encounter most in practice, from
            gross-up and CAM caps to audit rights windows and denominator
            definitions. Each definition includes context for how the term is
            applied and where errors commonly occur.
          </p>
        </div>

        {/* Alphabet nav */}
        <div className="mb-8 flex flex-wrap gap-2">
          {letters.map((letter) => (
            <a
              key={letter}
              href={`#letter-${letter}`}
              className="flex h-8 w-8 items-center justify-center rounded border border-border text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
            >
              {letter}
            </a>
          ))}
        </div>

        {/* Glossary entries */}
        <div className="space-y-8 mb-12">
          {letters.map((letter) => (
            <div key={letter} id={`letter-${letter}`}>
              <h2 className="text-lg font-bold text-foreground mb-4 border-b border-border pb-2">
                {letter}
              </h2>
              <div className="space-y-5">
                {grouped[letter].map((entry) => (
                  <div
                    key={entry.term}
                    className="rounded-lg border border-border p-4"
                  >
                    <p className="text-sm font-semibold text-foreground mb-2">
                      {entry.term}
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {entry.definition}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* What can go wrong */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-6">
            Where Terminology Confusion Causes Calculation Errors
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Using &quot;controllable&quot; and
                    &quot;non-controllable&quot; CAM interchangeably with the
                    cap
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    CAM caps apply to controllable expenses only. If a property
                    accountant applies the annual cap to total CAM (including
                    taxes and insurance) rather than only to the controllable
                    portion, the cap limits cost recovery in a year when taxes
                    and insurance have legitimate increases. The landlord
                    undercollects from tenants. Conversely, if the cap is not
                    applied at all to controllable expenses because the team
                    misunderstands the mechanism, tenants are overbilled. The
                    controllable/non-controllable split must be precisely
                    defined per lease and applied correctly in the cap
                    calculation.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Treating the &quot;base year&quot; as an indexed floor
                    rather than a fixed historical amount
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    In a base year expense stop structure, the base year amount
                    is the actual dollar cost incurred in that specific year -
                    it does not adjust for inflation. A property team that
                    annually inflates the base year amount (believing it
                    represents a &quot;current dollar equivalent&quot;) reduces
                    the tenant&apos;s obligation below what the lease provides.
                    Conversely, a tenant who believes the base year should be
                    indexed to CPI when the lease is silent on indexing has no
                    contractual basis for that position.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Interpreting &quot;expense stop&quot; as a CAM cap
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    An expense stop defines the floor below which the landlord
                    pays all operating costs. The tenant pays only costs above
                    the stop. A CAM cap limits annual increases in the
                    tenant&apos;s contribution. These are entirely different
                    mechanisms. A tenant on a $9.00/RSF expense stop does not
                    have a cap on annual increases above $9.00. They pay all
                    costs above $9.00 regardless of how much those costs grow.
                    Confusing an expense stop with a cap leads to systematic
                    undercollection (if the landlord mistakenly limits annual
                    increases) or overbilling (if the tenant mistakenly claims a
                    cap protection that does not exist).
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
                What is the difference between a CAM cap and an expense stop?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A CAM cap limits annual increases in the tenant&apos;s CAM
                contribution (for example, no more than 5% above the prior
                year&apos;s amount). An expense stop is a deductible: the
                landlord pays CAM up to the stop amount; the tenant pays only
                costs above the stop. A cap is a ceiling on increases; an
                expense stop is a floor the landlord covers.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                What is the difference between a cumulative and non-cumulative
                CAM cap?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A non-cumulative cap limits increases to a fixed percentage
                above each prior year&apos;s actual amount; each year is
                independent. A cumulative cap compounds from a base year,
                banking unused cap room when increases are below the cap rate
                and allowing larger increases in later years. Cumulative caps
                are more tenant-favorable because they prevent landlords from
                recovering deferred cost increases beyond the cap rate.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                Why does the base year matter and can it be adjusted for
                inflation?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The base year amount in an expense stop structure is the fixed
                actual cost for that specific year. It does not adjust for
                inflation unless the lease explicitly provides for indexing. A
                lease that is silent on indexing locks the base year at its
                original dollar amount for the entire lease term.
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
                title: "Full CAM Glossary",
                href: "/glossary",
                description:
                  "Extended glossary covering all CAM and CRE FinOps terms",
              },
              {
                title: "What Are CAM Charges?",
                href: "/resources/what-are-cam-charges",
                description:
                  "Foundational overview of common area maintenance charges",
              },
              {
                title: "How to Calculate CAM Charges",
                href: "/resources/how-to-calculate-cam-charges",
                description:
                  "Step-by-step guide to the CAM calculation methodology",
              },
              {
                title: "Recoverable vs. Non-Recoverable CAM",
                href: "/resources/recoverable-vs-nonrecoverable-cam",
                description:
                  "Which operating costs can be passed through to tenants",
              },
              {
                title: "CAM Reconciliation Software",
                href: "/cam-reconciliation-software",
                description:
                  "Software that applies these definitions to your actual lease data",
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
            Put These Definitions to Work in Your Reconciliations
          </h2>
          <p className="text-background/70 mb-6 text-sm">
            CapVeri applies gross-up, cap calculations, denominator definitions,
            and expense exclusions from your actual lease terms. The math
            reflects what the lease says, not what the system defaults to.
          </p>
          <Button asChild variant="secondary" size="lg">
            <a href={buildTrialLink({ content: "cam_glossary_cta" })}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
