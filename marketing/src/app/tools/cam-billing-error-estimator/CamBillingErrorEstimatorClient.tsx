"use client";

import { useState, useEffect, useId, useRef } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToolPageLayout } from "@/components/content/ToolPageLayout";
import { LeadCaptureForm } from "@/components/lead-capture/LeadCaptureForm";
import { buildTrialLink } from "@/lib/auditLink";
import { trackMarketingEvent } from "@/lib/posthog";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildSiteUrl } from "@/lib/site";

const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    applicationCategory: "FinanceApplication",
    name: "CAM Billing Error Estimator",
    description:
      "Estimate the yearly dollar size of CAM billing errors and the hit to property value. Enter your buildings, average rentable SF, and CAM rate. See results fast.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/cam-billing-error-estimator"),
    browserRequirements: "Requires JavaScript",
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Estimate CAM Billing Errors",
    description:
      "Use the free CAM Billing Error Estimator to size your yearly CAM billing errors in under a minute.",
    totalTime: "PT1M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Enter number of buildings",
        text: "Use the slider or input field to set your portfolio building count (1–200 buildings).",
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Enter average rentable SF per building",
        text: "Input the average rentable square footage per building in your portfolio.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Review your billing-error estimate",
        text: "See your estimated yearly CAM billing-error range and property value impact at a 7% cap rate.",
      },
    ],
  },
];

const BILLING_ERROR_FAQS = [
  {
    question: "What are CAM billing errors?",
    answer:
      "CAM billing errors happen when the statement and lease math do not match. They can be over-bills or under-bills. CapVeri checks both before the statement goes out.",
  },
  {
    question: "How large can CAM billing mistakes be?",
    answer:
      "The size changes by portfolio. This tool models 0.25% to 1.5% of total property costs. Your result depends on your leases, billing process, and building mix.",
  },
  {
    question: "What causes CAM billing errors?",
    answer:
      "The most common causes are: (1) gross-up not applied or applied incorrectly, (2) annual CAM cap escalators not tracked, (3) non-recoverable expenses included in tenant billings, (4) pro-rata share calculated on wrong square footage, and (5) base year amounts not adjusted for lease amendments.",
  },
  {
    question: "How do I check my CAM statements?",
    answer:
      "Compare the lease terms, GL export, and billed amounts for each tenant. Check gross-up and caps. Check excluded costs and pro-rata share before you send.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(BILLING_ERROR_FAQS);

const LEAKAGE_LOW_RATE = 0.0025;
const LEAKAGE_HIGH_RATE = 0.015;
const CAP_RATE = 0.07;
const DEFAULT_CAM_PER_SF = 8.5;
const MIN_TRACKABLE_AVG_SF = 1000;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function CamBillingErrorEstimatorPage() {
  const buildingsId = useId();
  const sfId = useId();
  const camId = useId();

  const [buildings, setBuildings] = useState<number | "">(1);
  const [avgSF, setAvgSF] = useState<number | "">("");
  const [camPerSF, setCamPerSF] = useState<number>(DEFAULT_CAM_PER_SF);
  const [hasSeenTrackableResult, setHasSeenTrackableResult] = useState(false);
  const [hasRequestedWorksheet, setHasRequestedWorksheet] = useState(false);
  const hasTrackedResult = useRef(false);

  // True only when the user has typed a value that is not positive
  const avgSFInvalid = typeof avgSF === "number" && !isNaN(avgSF) && avgSF <= 0;

  const isReady =
    typeof buildings === "number" &&
    buildings > 0 &&
    typeof avgSF === "number" &&
    avgSF > 0 &&
    camPerSF > 0;
  const resultAnalyticsReady =
    isReady && (avgSF as number) >= MIN_TRACKABLE_AVG_SF;

  const totalCAMPool = isReady
    ? (buildings as number) * (avgSF as number) * camPerSF
    : 0;
  const leakageLow = totalCAMPool * LEAKAGE_LOW_RATE;
  const leakageHigh = totalCAMPool * LEAKAGE_HIGH_RATE;
  const valuationLow = Math.round(leakageLow / CAP_RATE);
  const valuationHigh = Math.round(leakageHigh / CAP_RATE);

  useEffect(() => {
    if (!resultAnalyticsReady || hasTrackedResult.current) return;

    const trackResult = window.setTimeout(() => {
      hasTrackedResult.current = true;
      const buildingCount = buildings as number;
      const averageSquareFeet = avgSF as number;
      trackMarketingEvent("tool_result_viewed", {
        slug: "cam-leakage-estimator",
        buildings: buildingCount,
        avg_sf_bucket:
          averageSquareFeet < 50_000
            ? "under_50k"
            : averageSquareFeet < 250_000
              ? "50k_249k"
              : averageSquareFeet < 1_000_000
                ? "250k_999k"
                : "1m_plus",
        leakage_low: leakageLow,
        leakage_high: leakageHigh,
        estimate_low: leakageLow,
        estimate_high: leakageHigh,
        valuation_low: valuationLow,
        valuation_high: valuationHigh,
        direction_scope: "over_and_under_bill",
      });
      trackMarketingEvent("lead_form_result_seen", {
        slug: "cam-leakage-estimator",
        result_type: "modeled_estimate",
        source: "cam_billing_error_estimator",
        buildings: buildingCount,
        avg_sf_bucket:
          averageSquareFeet < 50_000
            ? "under_50k"
            : averageSquareFeet < 250_000
              ? "50k_249k"
              : averageSquareFeet < 1_000_000
                ? "250k_999k"
                : "1m_plus",
        estimate_low: leakageLow,
        estimate_high: leakageHigh,
        direction_scope: "over_and_under_bill",
      });
      setHasSeenTrackableResult(true);
    }, 400);

    return () => window.clearTimeout(trackResult);
  }, [
    avgSF,
    buildings,
    resultAnalyticsReady,
    leakageHigh,
    leakageLow,
    valuationHigh,
    valuationLow,
  ]);

  const buildingsNum =
    typeof buildings === "number" && !isNaN(buildings) ? buildings : 1;

  return (
    <ToolPageLayout
      title="Free CAM Billing Error Estimator for Commercial Property Managers | CapVeri"
      description="See how much CAM billing errors could cost your portfolio each year. Enter your buildings, SF, and CAM rate. See results fast. Free tool."
      canonical={buildSiteUrl("/tools/cam-billing-error-estimator")}
      toolName="CAM Billing Error Estimator"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          CAM Billing Error Estimator
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          See the size of CAM billing mistakes. They may be over-bills or
          under-bills. This model uses benchmark rates.
        </p>
        <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
          <p>
            <strong>
              CAM billing mistakes cut both ways: you may bill too much or too
              little.
            </strong>{" "}
            CapVeri checks both before tenants see the statement.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Input card */}
        <Card>
          <CardHeader>
            <CardTitle>Your Portfolio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Buildings - slider + number input */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor={buildingsId}>Number of Buildings</Label>
                <span className="text-sm font-semibold tabular-nums">
                  {buildings === "" ? 0 : buildings}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={200}
                value={buildingsNum}
                aria-label="Buildings count slider"
                className="min-h-[44px] w-full cursor-pointer accent-primary"
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setBuildings(val);
                }}
              />
              <Input
                id={buildingsId}
                type="number"
                min={1}
                max={200}
                className="h-11"
                value={buildings === "" ? "" : buildings}
                aria-label="Number of buildings"
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setBuildings("");
                    return;
                  }
                  const val = Math.min(200, Math.max(1, Number(raw)));
                  setBuildings(val);
                }}
              />
            </div>

            {/* Average SF */}
            <div className="space-y-2">
              <Label htmlFor={sfId}>Average Rentable SF per Building</Label>
              <Input
                id={sfId}
                type="number"
                min={1}
                className="h-11"
                placeholder="e.g. 250,000"
                value={avgSF === "" ? "" : avgSF}
                aria-label="Average rentable SF"
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setAvgSF("");
                    return;
                  }
                  setAvgSF(Number(raw));
                }}
              />
              {avgSFInvalid && (
                <p className="text-sm text-destructive-strong">
                  Enter a square footage greater than zero.
                </p>
              )}
            </div>

            {/* CAM per SF */}
            <div className="space-y-2">
              <Label htmlFor={camId}>CAM per SF ($/year)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  $
                </span>
                <Input
                  id={camId}
                  type="number"
                  min={0.01}
                  step={0.01}
                  className="h-11 pl-7"
                  value={camPerSF}
                  aria-label="CAM per SF"
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val > 0) setCamPerSF(val);
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results card */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Your Estimate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Leakage range */}
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Modeled yearly CAM billing mistakes
              </p>
              {isReady ? (
                <p className="mt-1 text-3xl font-bold tabular-nums">
                  {formatCurrency(leakageLow)}{" "}
                  <span className="text-muted-foreground">to</span>{" "}
                  {formatCurrency(leakageHigh)}
                </p>
              ) : (
                <p className="mt-1 text-3xl font-bold text-muted-foreground/40">
                  -
                </p>
              )}
            </div>

            {/* Valuation impact */}
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Modeled NOI impact at 7% cap rate
              </p>
              {isReady ? (
                <p className="mt-1 text-3xl font-bold tabular-nums">
                  {formatCurrency(valuationLow)}{" "}
                  <span className="text-muted-foreground">to</span>{" "}
                  {formatCurrency(valuationHigh)}
                </p>
              ) : (
                <p className="mt-1 text-3xl font-bold text-muted-foreground/40">
                  -
                </p>
              )}
            </div>

            {!isReady && (
              <p className="text-sm text-muted-foreground">
                Enter your portfolio details above to see your estimate.
              </p>
            )}

            {/* Benchmark note */}
            <p className="text-xs text-muted-foreground border-t pt-4">
              Modeled scenario rates: 0.25% (low) to 1.5% (high). Use your own
              portfolio history to calibrate assumptions.
            </p>

            {hasSeenTrackableResult && (
              <div className="border-t pt-4">
                {hasRequestedWorksheet ? (
                  <div
                    role="status"
                    className="rounded-lg bg-background/80 p-4 text-sm"
                  >
                    Check your inbox for the worksheet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <h2 className="text-base font-semibold">
                        Check this with your files
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Send the worksheet to your inbox. Use it with your GL
                        export.
                      </p>
                    </div>
                    <LeadCaptureForm
                      assetSlug="cam-leakage-estimator"
                      source="cam_billing_error_estimator_result"
                      ctaLabel="Send my worksheet"
                      emailOnly
                      onSuccess={() => setHasRequestedWorksheet(true)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* CTA */}
            <Button asChild className="w-full rounded-full sm:w-auto">
              <Link
                href={`${buildTrialLink({ content: "u_cta" })}`}
                onClick={() =>
                  trackMarketingEvent("cta_clicked", {
                    button_text: "Check my actual GL",
                    location: "cam_billing_error_estimator_result",
                    slug: "cam-leakage-estimator",
                    has_result: resultAnalyticsReady,
                  })
                }
              >
                Check my actual GL
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* FAQ Section */}
      <section className="mt-12 max-w-3xl">
        <h2 className="text-lg md:text-xl lg:text-2xl font-bold mb-8">
          Frequently Asked Questions
        </h2>
        <div className="space-y-2">
          {BILLING_ERROR_FAQS.map((faq) => (
            <details key={faq.question} className="group border rounded-lg">
              <summary className="flex cursor-pointer select-none items-center justify-between p-4 font-medium">
                {faq.question}
                <ChevronDown className="h-4 w-4 flex-shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-4 pb-4 text-muted-foreground text-sm leading-relaxed">
                {faq.answer}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Cross-links */}
      <div className="mt-10 rounded-lg border bg-muted/30 p-5">
        <p className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Related resources
        </p>
        <ul className="space-y-2">
          <li className="flex items-center gap-2 text-sm">
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <Link
              href="/resources/tenant-cam-audit-landlord-side"
              className="text-primary underline-offset-4 hover:underline"
            >
              What Tenant Auditors Look For
            </Link>
          </li>
          <li className="flex items-center gap-2 text-sm">
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <Link
              href="/tools/cam-gross-up-calculator"
              className="text-primary underline-offset-4 hover:underline"
            >
              CAM Gross-Up Calculator
            </Link>
          </li>
        </ul>
      </div>
    </ToolPageLayout>
  );
}
