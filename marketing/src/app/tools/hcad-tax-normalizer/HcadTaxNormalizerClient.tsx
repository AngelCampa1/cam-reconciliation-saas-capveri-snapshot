"use client";

import { useState, useId } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToolPageLayout } from "@/components/content/ToolPageLayout";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";
import { marketingApiUrl } from "@/lib/api";
import { buildSiteUrl } from "@/lib/site";

interface HcadApiResponse {
  adjusted_base_year: string;
  original_passthrough: string;
  corrected_passthrough: string;
  recovery_delta: string;
  capped_corrected_passthrough: string | null;
  capped_recovery: string | null;
  cap_was_applied: boolean | null;
}

function formatCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(num);
}

const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    applicationCategory: "FinanceApplication",
    name: "HCAD Tax Base Year Normalizer",
    description:
      "Texas landlords: model the CAM tax adjustment. Use it after an HCAD ARB protest lowers the tenant base year expense stop.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/hcad-tax-normalizer"),
    browserRequirements: "Requires JavaScript",
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Calculate an HCAD ARB Tax Adjustment",
    description:
      "Use the free HCAD Tax Base Year Normalizer. Model the lease billing effect after a successful ARB protest.",
    totalTime: "PT2M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Enter your original base year assessment",
        text: "Input the original base year property tax assessment used in the tenant lease.",
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Enter the ARB retroactive reduction",
        text: "Enter the dollar amount by which the ARB protest reduced the base year assessment.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Enter current year tax and tenant pro-rata",
        text: "Provide the current year tax bill and the tenant's pro-rata share percentage.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Review the tax adjustment",
        text: "See the tax adjustment and what a lease cap does to that number.",
      },
    ],
  },
];

const HCAD_FAQS = [
  {
    question: "What is HCAD tax base year normalization?",
    answer:
      "When a landlord wins a property tax protest at the Appraisal Review Board (ARB), the assessed value and tax bill drop retroactively. Base year normalization adjusts the lease's tax base year to reflect the new, lower assessment. That can change future tenant billing under the lease.",
  },
  {
    question: "How does an ARB protest affect CAM tax billing?",
    answer:
      "A successful ARB protest lowers the building's property taxes. If the lease has a base year expense stop, the lower base year tax creates a larger spread between the base year amount and current-year taxes. This tool models that billing effect before you send statements.",
  },
  {
    question: "What is an expense stop in a Texas lease?",
    answer:
      "An expense stop is the base year operating expense amount set at lease commencement. Tenants pay their share of expenses that exceed the stop. When taxes drop due to an ARB win, the stop effectively decreases, widening the recoverable gap.",
  },
  {
    question: "Does a CAM cap limit the tax adjustment after an ARB protest?",
    answer:
      "Yes. If the lease includes an annual CAM cap, the tax adjustment from a lowered base year may be limited by the cap ceiling. This tool models capped and uncapped scenarios. You can see the billing impact.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(HCAD_FAQS);

export function HcadTaxNormalizerPage() {
  const baseYearId = useId();
  const retroAdjId = useId();
  const currentTaxId = useId();
  const proRataId = useId();
  const capRateId = useId();
  const submitHintId = useId();

  const [originalBaseYear, setOriginalBaseYear] = useState<number | "">("");
  const [retroAdj, setRetroAdj] = useState<number | "">("");
  const [currentYearTax, setCurrentYearTax] = useState<number | "">("");
  const [proRata, setProRata] = useState<number | "">("");
  const [capRate, setCapRate] = useState<number | "">("");

  const [result, setResult] = useState<HcadApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drop a prior result the moment any input changes, so the result card
  // never shows numbers that no longer match what is on screen.
  const clearStaleResult = () => {
    setResult(null);
    setError(null);
  };

  const isReady =
    typeof originalBaseYear === "number" &&
    originalBaseYear > 0 &&
    typeof retroAdj === "number" &&
    retroAdj >= 0 &&
    retroAdj <= originalBaseYear &&
    typeof currentYearTax === "number" &&
    currentYearTax > 0 &&
    typeof proRata === "number" &&
    proRata > 0 &&
    proRata <= 100;

  const missingFields: string[] = [];
  if (!(typeof originalBaseYear === "number" && originalBaseYear > 0)) {
    missingFields.push("original base year assessment");
  }
  if (
    !(
      typeof retroAdj === "number" &&
      retroAdj >= 0 &&
      (typeof originalBaseYear !== "number" || retroAdj <= originalBaseYear)
    )
  ) {
    missingFields.push("ARB retroactive reduction");
  }
  if (!(typeof currentYearTax === "number" && currentYearTax > 0)) {
    missingFields.push("current year tax");
  }
  if (!(typeof proRata === "number" && proRata > 0 && proRata <= 100)) {
    missingFields.push("tenant pro-rata share");
  }

  const handleCalculate = async () => {
    if (!isReady) return;
    setIsLoading(true);
    setError(null);

    try {
      const payload = {
        original_base_year_assessment: String(originalBaseYear),
        retroactive_adjustment: String(retroAdj),
        current_year_tax: String(currentYearTax),
        pro_rata_pct: String((proRata as number) / 100),
        ...(typeof capRate === "number" && capRate > 0
          ? { cap_rate: String(capRate / 100) }
          : {}),
      };

      const response = await fetch(
        marketingApiUrl("/api/v1/tools/hcad-tax-normalizer/calculate"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        throw new Error(`Calculation failed (${response.status})`);
      }

      const data: HcadApiResponse = await response.json();
      setResult(data);
    } catch (err) {
      // A failed fetch surfaces as a TypeError ("Failed to fetch"). Show a
      // friendly network message instead of the raw string, matching the
      // other API-backed tools. HTTP errors keep their explicit message.
      setError(
        err instanceof TypeError
          ? "Network error. Please try again."
          : err instanceof Error
            ? err.message
            : "Calculation failed. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ToolPageLayout
      title="HCAD Tax Base Year Normalizer: Free ARB Tax Adjustment Calculator | CapVeri"
      description="Texas landlords: won an HCAD ARB protest? See the tax adjustment and lease-cap effect before you bill. Free tool."
      canonical={buildSiteUrl("/tools/hcad-tax-normalizer")}
      toolName="HCAD Tax Base Year Normalizer"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          HCAD Tax Base Year Normalizer
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Won an HCAD ARB protest? Model the retroactive CAM tax adjustment and
          lease-cap effect.
        </p>
        <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
          <p>
            <strong>
              When a Texas landlord wins an HCAD (Harris County Appraisal
              District) ARB protest, property taxes decrease. The original base
              year tax amount in tenant leases does not automatically adjust.
            </strong>{" "}
            This normalizer shows the retroactive CAM tax adjustment the lease
            may support.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Input card */}
        <Card>
          <CardHeader>
            <CardTitle>Property &amp; Lease Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Screen-reader explanation of required field indicator */}
            <p className="sr-only" id="required-fields-note">
              Fields marked with an asterisk are required.
            </p>

            {/* Original base year assessment */}
            <div className="space-y-2">
              <Label htmlFor={baseYearId}>
                Original Base Year Assessment ($){" "}
                <span aria-hidden="true" className="text-destructive-strong">
                  *
                </span>
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  $
                </span>
                <Input
                  id={baseYearId}
                  type="number"
                  min={0}
                  step={1}
                  className="h-11 pl-7"
                  placeholder="e.g. 1,200,000"
                  value={originalBaseYear === "" ? "" : originalBaseYear}
                  required
                  aria-required="true"
                  onChange={(e) => {
                    clearStaleResult();
                    const raw = e.target.value;
                    setOriginalBaseYear(raw === "" ? "" : Number(raw));
                  }}
                />
              </div>
            </div>

            {/* ARB retroactive reduction */}
            <div className="space-y-2">
              <Label htmlFor={retroAdjId}>
                ARB Retroactive Reduction ($){" "}
                <span aria-hidden="true" className="text-destructive-strong">
                  *
                </span>
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  $
                </span>
                <Input
                  id={retroAdjId}
                  type="number"
                  min={0}
                  step={1}
                  className="h-11 pl-7"
                  placeholder="e.g. 150,000"
                  value={retroAdj === "" ? "" : retroAdj}
                  required
                  aria-required="true"
                  onChange={(e) => {
                    clearStaleResult();
                    const raw = e.target.value;
                    setRetroAdj(raw === "" ? "" : Number(raw));
                  }}
                />
              </div>
            </div>

            {/* Current year tax */}
            <div className="space-y-2">
              <Label htmlFor={currentTaxId}>
                Current Year Property Tax ($){" "}
                <span aria-hidden="true" className="text-destructive-strong">
                  *
                </span>
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  $
                </span>
                <Input
                  id={currentTaxId}
                  type="number"
                  min={0}
                  step={1}
                  className="h-11 pl-7"
                  placeholder="e.g. 1,350,000"
                  value={currentYearTax === "" ? "" : currentYearTax}
                  required
                  aria-required="true"
                  onChange={(e) => {
                    clearStaleResult();
                    const raw = e.target.value;
                    setCurrentYearTax(raw === "" ? "" : Number(raw));
                  }}
                />
              </div>
            </div>

            {/* Tenant pro-rata share */}
            <div className="space-y-2">
              <Label htmlFor={proRataId}>
                Tenant Pro-Rata Share (%){" "}
                <span aria-hidden="true" className="text-destructive-strong">
                  *
                </span>
              </Label>
              <div className="relative">
                <Input
                  id={proRataId}
                  type="number"
                  min={0.01}
                  max={100}
                  step={0.01}
                  className="h-11 pr-7"
                  placeholder="e.g. 5.25"
                  value={proRata === "" ? "" : proRata}
                  required
                  aria-required="true"
                  onChange={(e) => {
                    clearStaleResult();
                    const raw = e.target.value;
                    setProRata(raw === "" ? "" : Number(raw));
                  }}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
                  %
                </span>
              </div>
            </div>

            {/* Optional cap rate */}
            <div className="space-y-2">
              <Label htmlFor={capRateId}>
                Expense Cap Rate (%),{" "}
                <span className="font-normal text-muted-foreground">
                  optional
                </span>
              </Label>
              <div className="relative">
                <Input
                  id={capRateId}
                  type="number"
                  min={0.01}
                  max={99}
                  step={0.01}
                  className="h-11 pr-7"
                  placeholder="e.g. 5"
                  value={capRate === "" ? "" : capRate}
                  aria-label="Expense cap rate"
                  onChange={(e) => {
                    clearStaleResult();
                    const raw = e.target.value;
                    setCapRate(raw === "" ? "" : Number(raw));
                  }}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
                  %
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                className="w-full rounded-full"
                disabled={!isReady || isLoading}
                onClick={handleCalculate}
                aria-describedby={
                  !isReady ? submitHintId : undefined
                }
              >
                {isLoading ? "Calculating..." : "Calculate Tax Adjustment"}
              </Button>
              {!isReady && (
                <p
                  id={submitHintId}
                  className="text-sm text-muted-foreground text-center"
                  role="status"
                  aria-live="polite"
                >
                  {`To calculate, enter your ${missingFields.join(", ")}.`}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results card */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Tax Adjustment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Error state */}
            {error && (
              <div
                role="alert"
                className="rounded-md bg-destructive/10 p-3 text-sm text-destructive-strong"
              >
                {error}
              </div>
            )}

            {/* Adjusted base year */}
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Adjusted base year assessment
              </p>
              {result ? (
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatCurrency(result.adjusted_base_year)}
                </p>
              ) : (
                <p className="mt-1 text-2xl font-bold text-muted-foreground/40">
                  -
                </p>
              )}
            </div>

            {/* Original passthrough */}
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                What was billed (original base)
              </p>
              {result ? (
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatCurrency(result.original_passthrough)}
                </p>
              ) : (
                <p className="mt-1 text-2xl font-bold text-muted-foreground/40">
                  -
                </p>
              )}
            </div>

            {/* Corrected passthrough */}
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                What should have been billed (adjusted base)
              </p>
              {result ? (
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatCurrency(result.corrected_passthrough)}
                </p>
              ) : (
                <p className="mt-1 text-2xl font-bold text-muted-foreground/40">
                  -
                </p>
              )}
            </div>

            {/* Recovery delta - prominent */}
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Recovery opportunity
              </p>
              {result ? (
                <p className="mt-1 text-3xl font-bold tabular-nums text-primary">
                  {formatCurrency(result.recovery_delta)}
                </p>
              ) : (
                <p className="mt-1 text-3xl font-bold text-muted-foreground/40">
                  -
                </p>
              )}
            </div>

            {/* Capped adjustment - only when cap was calculated */}
            {result && result.cap_was_applied !== null && (
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Capped adjustment
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatCurrency(result.capped_recovery ?? "0")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.cap_was_applied
                    ? "Lease cap reduced recoverable amount"
                    : "Recovery is within lease cap limit"}
                </p>
              </div>
            )}

            {!result && !error && (
              <p className="text-sm text-muted-foreground">
                Enter your property details above to calculate the tax
                adjustment.
              </p>
            )}

            <p className="text-xs text-muted-foreground border-t pt-4">
              Based on your lease's base year expense stop and the HCAD ARB
              retroactive reduction. Use these results in your CAM
              reconciliation.
            </p>

            {/* CTA */}
            <Button asChild className="w-full sm:w-auto rounded-full">
              <Link href={`${buildTrialLink({ content: "u_cta" })}`}>
                See what CapVeri finds in your actual GL
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
          {HCAD_FAQS.map((faq) => (
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
              href="/tools/cam-billing-error-estimator"
              className="text-primary underline-offset-4 hover:underline"
            >
              CAM Billing Error Estimator
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
