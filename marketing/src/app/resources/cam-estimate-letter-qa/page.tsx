import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "How to QA a CAM Estimate Letter Before It Goes Out",
  description:
    "CAM estimate letters set each tenant's monthly payment for the coming year. Errors lock in for 12 months. Here's a 15-step QA process for catching mistakes before the letter reaches tenants.",
  alternates: {
    canonical: `${SITE_URL}/resources/cam-estimate-letter-qa`,
  },
  openGraph: {
    title: "How to QA a CAM Estimate Letter Before It Goes Out",
    description:
      "CAM estimate letters set each tenant's monthly payment for the coming year. Errors lock in for 12 months. Here's a 15-step QA process for catching mistakes before the letter reaches tenants.",
    url: `${SITE_URL}/resources/cam-estimate-letter-qa`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is a CAM estimate letter?",
    answer:
      "A CAM estimate letter notifies each tenant of their estimated monthly CAM payment for the coming lease year. It is typically sent 30–60 days before the new lease year begins. The letter states the estimated annual recoverable expense pool, the tenant's pro-rata share, the resulting annual obligation, and the monthly estimate payment. Once sent and accepted by the tenant, the monthly estimate amount is collected for the full year. Errors in the estimate compound for 12 months.",
  },
  {
    question: "When should CAM estimate letters be sent?",
    answer:
      "Most commercial leases require CAM estimate letters 30–60 days before the new lease year begins. For calendar-year leases, that means November or December. Sending the estimate letter on time is important because it sets the tenant's payment obligation; a late estimate letter can delay the start of new-year payments.",
  },
  {
    question: "What should the base for a CAM estimate be?",
    answer:
      "The estimate base should be prior-year actual recoverable expenses, not the prior-year estimate. Using the prior-year estimate as the base compounds estimation errors year over year. Start from audited or reconciled actuals, then apply a documented inflation factor to variable expenses and confirm non-controllable expenses (taxes, insurance) with actual renewal amounts.",
  },
  {
    question: "How do you handle the gross-up in a forward-looking estimate?",
    answer:
      "Apply the gross-up to estimated variable expenses using the projected occupancy for the coming year. If the property is expected to reach 90% occupancy (the typical gross-up threshold), you may not need to gross up at all. If occupancy is projected below the threshold, apply the same gross-up method specified in the lease to the variable portion of the estimated expense pool.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: SITE_URL },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CAM Estimate Letter QA",
    url: `${SITE_URL}/resources/cam-estimate-letter-qa`,
  },
]);

const steps = [
  {
    id: 1,
    title: "Confirm the estimate period matches the upcoming lease year",
    detail:
      "Verify the estimate letter states the correct start and end date for the new lease year, not the just-completed year. This sounds obvious but is a common copy-paste error when estimate letters are generated from prior-year templates.",
  },
  {
    id: 2,
    title: "Start from the prior-year actual, not the prior-year estimate",
    detail:
      "The base for the estimate should be the reconciled prior-year actual recoverable expenses. Using the prior-year estimate as the base compounds estimation errors over time. If the reconciliation is not yet complete, use the best available actual figure with a note that it is preliminary.",
  },
  {
    id: 3,
    title: "Apply a documented inflation factor to variable expenses",
    detail:
      "Variable expenses (utilities, janitorial, landscaping, repairs) should be escalated by an explicit, documented inflation factor. State the percentage used in the estimate letter and its source (CPI, local market data, contract renewal rates). Using an undocumented factor creates disputes when tenants ask how the estimate increased.",
  },
  {
    id: 4,
    title: "Verify management fee calculation uses the projected base",
    detail:
      "The management fee in the estimate should be calculated on the projected expense base for the coming year, not the prior-year actual. If the management fee rate or base definition changed in a lease amendment, use the amended rate. Confirm the calculated fee does not exceed any per-lease cap.",
  },
  {
    id: 5,
    title:
      "Confirm gross-up threshold is correctly applied to estimated variable expenses",
    detail:
      "If projected occupancy is below the gross-up threshold, apply the gross-up to variable estimated expenses using the lease's specified method. If projected occupancy is at or above the threshold, gross-up does not apply. Document the occupancy projection used and its source.",
  },
  {
    id: 6,
    title: "Check that the pro-rata denominator is current",
    detail:
      "If new tenants were added to the building since last year, or if any leases were terminated, the denominator may have changed. Verify the denominator used in the estimate reflects the current tenant roster and any lease changes that took effect for the new lease year.",
  },
  {
    id: 7,
    title: "Apply any CAM cap that limits the increase from prior year",
    detail:
      "For tenants with a CAM cap, calculate whether the estimated increase from prior-year actual to this year's estimate exceeds the cap. If it does, the estimate must be capped at the maximum allowable amount. Show the cap calculation in the estimate supporting schedule.",
  },
  {
    id: 8,
    title: "State the controllable/non-controllable split",
    detail:
      "For leases with controllable CAM caps, the estimate letter should show the controllable and non-controllable portions separately. This is required by the lease and helps tenants verify that their cap is being applied to the correct subset of expenses.",
  },
  {
    id: 9,
    title:
      "Verify the monthly estimate = annual estimate / 12 (or per the lease)",
    detail:
      "Confirm the monthly estimate payment stated in the letter equals the annual estimate divided by 12, or divided by the number of payment periods specified in the lease. Some leases require unequal payments aligned with seasonal expense patterns; if so, the calculation must match the lease schedule.",
  },
  {
    id: 10,
    title: "Check that excluded expenses are still excluded",
    detail:
      "Exclusions established in the original lease or prior amendments sometimes creep back into estimate calculations, especially when using a prior-year estimate as a template. Verify every lease-specific exclusion is still applied in the new year's estimate.",
  },
  {
    id: 11,
    title:
      "Compare to prior-year estimate: document variance if greater than 15%",
    detail:
      "If the new estimate is more than 15% higher or lower than the prior-year estimate, the variance should be explained in the estimate letter or an attached schedule. Tenants who see a large unexplained increase will either dispute the estimate or call for clarification, delaying collections.",
  },
  {
    id: 12,
    title: "Confirm the effective date on the letter is correct",
    detail:
      "The effective date (when the new monthly estimate begins) must match the start of the new lease year. If estimates are being reset for a mid-year lease anniversary, confirm the effective date aligns with the lease commencement month, not the calendar year.",
  },
  {
    id: 13,
    title: "Verify tenant address and suite reference",
    detail:
      "Confirm the mailing address and suite reference on each letter match the current lease and the tenant's preferred notice address. Estimate letters delivered to the wrong address do not create a valid payment obligation. Discovering the error after the new lease year begins creates a gap in collections.",
  },
  {
    id: 14,
    title: "Attach the estimate detail schedule",
    detail:
      "The estimate letter should include or have attached a per-category expense breakdown: utilities, janitorial, landscaping, repairs, property taxes, insurance, management fee, and any other recoverable category. Tenants are more likely to pay without dispute when they can see how the total was built.",
  },
  {
    id: 15,
    title: "Have a second reviewer check the math before sending",
    detail:
      "The person who prepared the estimate should not be the only reviewer. A second reviewer (ideally the property manager or a senior accountant) should verify the math and confirm the estimate is consistent with what tenants expect based on the prior year and known expense changes.",
  },
];

export default function CamEstimateLetterQaPage() {
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
          <span className="text-foreground">CAM Estimate Letter QA</span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            How to QA a CAM Estimate Letter Before It Goes Out
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            CAM estimate letters set each tenant&apos;s monthly payment for the
            coming year. Errors compound for 12 months, and correcting a
            mid-year estimate adjustment requires tenant consent. This 15-step
            QA process catches the most expensive mistakes before the letter
            leaves your office.
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

        {/* Quick answer */}
        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">
            Estimate QA vs. Reconciliation QA
          </h2>
          <p className="text-muted-foreground">
            CAM estimate QA is different from reconciliation QA because
            estimates are forward-looking, based on budget projections rather
            than actual expenses. A reconciliation error can be corrected by
            issuing an amended statement. An estimate error gets collected for
            12 months before it is corrected at the next reconciliation. Every
            dollar of overcollection creates a credit obligation; every dollar
            of undercollection creates a large true-up that tenants dispute.
          </p>
        </div>

        {/* Estimate timing note */}
        <div className="mb-10 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Timing:</span> Most
            leases require estimate letters 30–60 days before the new lease year
            begins. For calendar-year properties, this means November or
            December delivery. Confirm the per-property deadline in each lease -
            it varies.
          </p>
        </div>

        {/* The 15 steps */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            15-Step CAM Estimate Letter QA Process
          </h2>
          <div className="space-y-4">
            {steps.map((step) => (
              <div key={step.id} className="rounded-lg border p-5">
                <div className="mb-2 flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {step.id}
                  </span>
                  <p className="font-semibold">{step.title}</p>
                </div>
                <p className="ml-9 text-sm text-muted-foreground">
                  {step.detail}
                </p>
              </div>
            ))}
          </div>
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
                    Using prior-year estimate as the base instead of actuals
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    If last year&apos;s estimate was, say, 8% below actual
                    expenses, and you use that estimate as the base for next
                    year&apos;s estimate, you are starting from a number that is
                    already 8% low. Apply the inflation factor on top of that,
                    and the estimate drifts further from reality each year -
                    until a large true-up forces a correction that tenants
                    dispute as a billing error.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Excluded expenses creeping back into the estimate
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    When estimate letters are generated from prior-year
                    templates, lease-specific exclusions that were carefully
                    applied last year sometimes disappear, particularly after a
                    staff change. A tenant who was excluded from paying for
                    parking lot maintenance will dispute any estimate that
                    includes it, holding payment until a corrected letter is
                    issued.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Large unexplained increases generating payment holds
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tenants who receive an estimate 20–30% higher than the prior
                    year with no explanation often withhold payment while they
                    investigate. Even when the increase is legitimate (property
                    tax reassessment, insurance premium increase), failure to
                    explain it in the estimate letter creates a collection
                    delay. Step 11 requires documenting any variance over 15%.
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
              <h3 className="mb-2 font-semibold">
                What is a CAM estimate letter?
              </h3>
              <p className="text-muted-foreground">
                A CAM estimate letter notifies each tenant of their estimated
                monthly CAM payment for the coming lease year. Once sent, the
                monthly estimate is collected for the full year. Errors compound
                for 12 months before being corrected at reconciliation.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                When should CAM estimate letters be sent?
              </h3>
              <p className="text-muted-foreground">
                Most commercial leases require estimate letters 30–60 days
                before the new lease year begins. For calendar-year leases, that
                means November or December. Always verify the per-lease
                deadline. It varies.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What should the base for a CAM estimate be?
              </h3>
              <p className="text-muted-foreground">
                The base should be prior-year actual recoverable expenses, not
                the prior-year estimate. Using the estimate as a base compounds
                errors year over year. Apply a documented inflation factor to
                actual variable expenses and use actual renewal amounts for
                non-controllable items.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How do you handle gross-up in a forward-looking estimate?
              </h3>
              <p className="text-muted-foreground">
                Apply gross-up to estimated variable expenses using projected
                occupancy for the coming year. If projected occupancy is at or
                above the lease threshold, gross-up does not apply. Document the
                occupancy projection and its source.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/cam-reconciliation-process"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                CAM Reconciliation Process Guide
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The 7-phase process from year-end close to audit defense.
              </p>
            </Link>
            <Link
              href="/resources/month-end-cam-controls"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                Month-End CAM Controls
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The 12 monthly controls that prevent year-end surprises.
              </p>
            </Link>
            <Link
              href="/resources/cam-pre-send-packet-checklist"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                Pre-Send Packet Checklist
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                20 items to verify before reconciliation statements go out.
              </p>
            </Link>
            <Link
              href="/cam-reconciliation-software"
              className="group rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <p className="font-medium group-hover:text-primary">
                CAM Reconciliation Software
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                How CapVeri automates estimate generation and QA.
              </p>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Generate Accurate CAM Estimate Letters Automatically
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri generates CAM estimate letters from your reconciled actuals,
            with gross-up, cap calculations, and lease-specific exclusions
            applied automatically. No more template errors or missing
            adjustments.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "cam_estimate_letter_qa_cta",
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
