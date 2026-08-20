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
    "Gross-Up Clauses Explained: How They Work in CAM Reconciliation (2026)",
  description:
    "What is a gross-up clause in a commercial lease? How to calculate the grossed-up CAM expense pool, which expenses are variable, and what landlords get wrong when applying gross-up.",
  alternates: {
    canonical: `${SITE_URL}/resources/gross-up-clause-explained`,
  },
  openGraph: {
    title: "Gross-Up Clauses Explained: How They Work in CAM Reconciliation",
    description:
      "What is a gross-up clause? How to calculate the grossed-up CAM expense pool, variable vs. fixed expense classification, and common landlord errors.",
    url: `${SITE_URL}/resources/gross-up-clause-explained`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is a gross-up clause in a commercial lease?",
    answer:
      "A gross-up clause requires adjusting variable operating expenses to what they would be if the building were occupied at a defined threshold - typically 90% or 95% - regardless of actual occupancy. The purpose is to protect the landlord's recovery when actual occupancy falls below the threshold, preventing tenants from benefiting from vacant space by paying a smaller share than they would in a fully occupied building.",
  },
  {
    question: "What is the gross-up formula for CAM?",
    answer:
      "The gross-up formula is: Grossed-Up Variable Expenses = Actual Variable Expenses ÷ Actual Occupancy % × Gross-Up Threshold %. For example, if actual variable expenses are $150,000, actual occupancy is 80%, and the gross-up threshold is 95%: $150,000 ÷ 0.80 × 0.95 = $178,125. Fixed expenses (property tax, insurance) are not grossed up.",
  },
  {
    question: "Which expenses are variable vs. fixed for gross-up purposes?",
    answer:
      "Variable expenses fluctuate with occupancy: janitorial/cleaning, trash removal, common area utilities, landscaping, security staffing, and tenant-responsive HVAC. Fixed expenses remain constant regardless of occupancy: property taxes, building insurance premiums, base management fees, and debt service. The lease may define variable and fixed categories explicitly - if not, industry convention governs, but this ambiguity should be resolved against the landlord in many jurisdictions.",
  },
  {
    question:
      "Does gross-up apply even when the building is over 90% occupied?",
    answer:
      "No. Gross-up provisions only activate when actual occupancy falls below the threshold defined in the lease. If the lease specifies a 90% gross-up threshold and actual occupancy is 93%, no gross-up adjustment is applied - variable expenses are billed at actual. Many landlords incorrectly apply gross-up in all years, even when the building is above the threshold, resulting in overbilling.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "Gross-Up Clause Explained",
    url: `${SITE_URL}/resources/gross-up-clause-explained`,
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline: "Gross-Up Clauses Explained: How They Work in CAM Reconciliation",
  description:
    "What is a gross-up clause? How to calculate the grossed-up CAM expense pool, variable vs. fixed expense classification, and common landlord errors.",
  url: `${SITE_URL}/resources/gross-up-clause-explained`,
  datePublished: "2026-04-26",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  articleSection: "CRE FinOps Guide",
});

export default function GrossUpClauseExplainedPage() {
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
            <span className="text-foreground">Gross-Up Clause Explained</span>
          </nav>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Gross-Up Clauses Explained: How They Work in CAM Reconciliation
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-2xl">
            The gross-up clause normalizes variable expenses to full-occupancy
            levels, protecting landlords in low-vacancy years. Here is exactly
            how it works and where landlords go wrong.
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
            A gross-up clause requires adjusting variable operating expenses to
            what they would be if the building were fully occupied at a defined
            threshold (usually 90–95%), preventing tenants from underpaying
            during low-occupancy periods. Fixed expenses like property tax and
            insurance are never grossed up. Only variable expenses that
            fluctuate with occupancy are adjusted.
          </p>
        </div>

        {/* Why gross-up exists */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Why Gross-Up Clauses Exist
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            In a building that is 75% occupied, janitorial costs, common area
            utilities, and trash removal are lower than they would be at full
            occupancy - but not proportionally lower. The building still needs
            to be cleaned, heated, and maintained. The landlord bears the cost
            of vacant space.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Without a gross-up clause, occupied tenants would pay a smaller
            total CAM pool in a low-occupancy year - the expenses are lower, so
            their pro-rata share is lower. But this doesn&apos;t reflect the
            true cost burden. The landlord is subsidizing the cost that vacant
            tenants are not paying.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The gross-up clause solves this by saying: &quot;For purposes of
            calculating each tenant&apos;s share, we will treat variable
            expenses as if the building were 90% (or 95%) occupied.&quot; Each
            occupied tenant pays a fair share based on a normalized occupancy
            level rather than the actual depressed vacancy. The landlord still
            absorbs the cost of vacant units above the threshold - but not the
            artificially suppressed variable expense pool.
          </p>
        </section>

        {/* The formula */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            The Gross-Up Formula
          </h2>
          <div className="font-mono text-sm bg-muted rounded-lg p-4 border border-border mb-4">
            <div className="text-muted-foreground mb-2">Core formula:</div>
            <div className="text-foreground font-medium">
              Grossed-Up Variable = Actual Variable Expenses ÷ Actual Occupancy%
              × Gross-Up Threshold%
            </div>
            <div className="text-muted-foreground mt-3 mb-2">
              Full pool after gross-up:
            </div>
            <div className="text-foreground font-medium">
              Total Grossed-Up Pool = Fixed Expenses + Grossed-Up Variable
              Expenses
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            The total grossed-up pool replaces the actual expense pool for all
            pro-rata share calculations. Each tenant&apos;s pro-rata percentage
            is then multiplied against the grossed-up pool, not actual expenses.
          </p>

          {/* Worked example */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm font-semibold text-foreground mb-3">
              Worked Example: 85% Occupied Building, 90% Gross-Up Threshold
            </p>
            <div className="font-mono text-xs space-y-1">
              <div className="text-muted-foreground">
                Building: 120,000 SF | Leased: 102,000 SF (85% occupied)
              </div>
              <div className="text-muted-foreground">
                Gross-Up Threshold: 90%
              </div>
              <div className="mt-2 border-t border-border pt-2">
                <div>Fixed Expenses (property tax + insurance): $280,000</div>
                <div>
                  Actual Variable Expenses (janitorial, utilities, maintenance):
                  $210,000
                </div>
              </div>
              <div className="mt-2 border-t border-border pt-2">
                <div>
                  Grossed-Up Variable: $210,000 ÷ 0.85 × 0.90 ={" "}
                  <strong>$222,353</strong>
                </div>
                <div>
                  Total Grossed-Up Pool: $280,000 + $222,353 ={" "}
                  <strong>$502,353</strong>
                </div>
                <div className="text-muted-foreground mt-1">
                  vs. Actual Pool (no gross-up): $280,000 + $210,000 = $490,000
                </div>
              </div>
              <div className="mt-2 border-t border-border pt-2">
                <div>
                  Tenant with 10,000 SF (pro-rata: 10,000 ÷ 120,000 = 8.33%)
                </div>
                <div>
                  Tenant CAM with gross-up: $502,353 × 8.33% ={" "}
                  <strong>$41,846</strong>
                </div>
                <div>
                  Tenant CAM without gross-up: $490,000 × 8.33% = $40,817
                </div>
                <div className="text-muted-foreground mt-1">
                  Gross-up impact for this tenant: +$1,029 per year
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Variable vs. fixed */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Variable vs. Fixed Expenses for Gross-Up Purposes
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            The gross-up calculation only applies to variable expenses - those
            that increase or decrease with occupancy. Fixed expenses are billed
            at actual regardless of occupancy.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-3">
                Variable Expenses (gross up these)
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Janitorial and cleaning services</li>
                <li>Trash removal and recycling</li>
                <li>Common area utilities (electricity, water, HVAC)</li>
                <li>Landscaping and grounds maintenance</li>
                <li>Security staffing (if headcount-based)</li>
                <li>Elevator maintenance (usage-dependent)</li>
                <li>Parking lot maintenance (usage-dependent)</li>
              </ul>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground mb-3">
                Fixed Expenses (do NOT gross up)
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Property taxes (always fixed)</li>
                <li>Building insurance premiums (always fixed)</li>
                <li>Base management fee (flat dollar)</li>
                <li>
                  HVAC preventive maintenance contracts (fixed contract price)
                </li>
                <li>Security monitoring contracts (fixed)</li>
                <li>Capital amortization (if authorized)</li>
              </ul>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Some expenses fall in a gray area - for example, a management fee
            expressed as a percentage of expenses is partly variable. Many
            leases specify the variable/fixed classification explicitly in the
            gross-up provision. If the lease is silent, conservative practice is
            to classify ambiguous items as fixed to avoid gross-up disputes.
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
                    Including fixed expenses in the variable pool
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Grossing up property tax ($220,000) along with variable
                    expenses inflates the recoverable pool significantly. At an
                    85% occupancy with a 95% threshold, including property tax
                    in the gross-up increases it from $220,000 to $246,000 - a
                    $26,000 overbilling that compounds across all tenants every
                    year occupancy is below the threshold.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Using building occupancy instead of the occupancy defined in
                    the lease
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Some leases define occupancy as &quot;leased SF ÷ rentable
                    SF&quot; - others define it as &quot;occupied SF ÷ leasable
                    SF.&quot; A tenant may be &quot;leased&quot; but not yet in
                    occupancy (free rent period). The two figures can differ by
                    5–10 percentage points, producing materially different
                    gross-up calculations. Always use the occupancy definition
                    from the lease, not the building&apos;s physical occupancy.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Applying gross-up when the lease is silent or when occupancy
                    exceeds the threshold
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Gross-up is not implied - it must be explicitly stated in
                    the lease. Applying a gross-up in years where actual
                    occupancy exceeds the threshold (e.g., building is at 93%
                    and the threshold is 90%) is also incorrect. Both errors
                    result in overbilling the recoverable pool and create
                    significant refund exposure if the tenant audits.
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
                What is a gross-up clause in a commercial lease?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A gross-up clause adjusts variable operating expenses to what
                they would be at a defined occupancy threshold (typically
                90–95%), preventing tenants from underpaying during
                low-occupancy periods. It must be explicitly stated in the
                lease. It is not implied.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                What is the gross-up formula for CAM?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Grossed-Up Variable = Actual Variable Expenses ÷ Actual
                Occupancy% × Gross-Up Threshold%. Fixed expenses are not
                adjusted. Add the grossed-up variable amount to actual fixed
                expenses to get the total grossed-up pool.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                Which expenses are variable vs. fixed for gross-up purposes?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Variable: janitorial, trash removal, common area utilities,
                landscaping, security staffing. Fixed: property taxes, building
                insurance premiums, base management fees, fixed maintenance
                contracts. The lease may specify the classification - if silent,
                industry convention governs.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                Does gross-up apply when the building is above 90% occupied?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                No. Gross-up only activates when actual occupancy falls below
                the threshold in the lease. If actual occupancy exceeds the
                threshold, expenses are billed at actual. Applying gross-up in
                above-threshold years is a common overbilling error.
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
                  "Deep-dive into gross-up mechanics and lease language",
              },
              {
                title: "Pro-Rata Share Validation",
                href: "/resources/pro-rata-share-validation",
                description: "How to verify pro-rata calculations are correct",
              },
              {
                title: "How to Calculate CAM Charges",
                href: "/resources/how-to-calculate-cam-charges",
                description: "Full CAM calculation walkthrough with examples",
              },
              {
                title: "CAM Gross-Up Calculator",
                href: "/tools/cam-gross-up-calculator",
                description:
                  "Model gross-up at 85%, 90%, and 95% occupancy thresholds",
              },
              {
                title: "CAM Reconciliation Software",
                href: "/cam-reconciliation-software",
                description:
                  "Automate gross-up calculations from your GL export",
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
            Verify Your Gross-Up Calculations Automatically
          </h2>
          <p className="text-background/70 mb-6 text-sm">
            CapVeri checks gross-up logic against each lease&apos;s threshold,
            variable expense classifications, and occupancy definition. It flags
            errors before they become audit findings.
          </p>
          <Button asChild variant="secondary" size="lg">
            <a href={buildTrialLink({ content: "gross_up_explained_cta" })}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
