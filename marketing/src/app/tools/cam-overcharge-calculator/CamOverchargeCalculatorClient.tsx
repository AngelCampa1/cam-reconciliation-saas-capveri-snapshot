"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToolPageLayout } from "@/components/content/ToolPageLayout";
import { CalculatorUnlockGate } from "@/components/lead-capture/CalculatorUnlockGate";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildSiteUrl } from "@/lib/site";
import {
  getAnnualCamBucket,
  getLeasedSquareFeetBucket,
  useTrackToolResultViewedOnce,
} from "@/lib/tool-result-tracking";

const calculatorSchema = z
  .object({
    leasedSF: z
      .number({ error: "Required" })
      .min(100, "Must be at least 100 SF")
      .max(1_000_000, "Must be under 1,000,000 SF"),
    annualCAM: z
      .number({ error: "Required" })
      .min(1, "Must be greater than $0")
      .max(50_000_000, "Must be under $50M"),
    buildingTotalSF: z
      .number()
      .min(100, "Must be at least 100 SF")
      .max(10_000_000, "Must be under 10M SF")
      .optional(),
    hasCap: z.boolean(),
    capRate: z
      .number()
      .min(0.01, "Must be at least 1%")
      .max(0.25, "Must be under 25%")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.hasCap && data.capRate === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["capRate"],
        message: "Cap rate is required when your lease has a CAM cap",
      });
    }
  });

export type CalculatorInputs = z.infer<typeof calculatorSchema>;

interface ErrorCategory {
  name: string;
  description: string;
  probability: number;
  impactRate: number;
}

interface OverchargeEstimate {
  category: string;
  description: string;
  lowEstimate: number;
  highEstimate: number;
  probability: number;
}

const ERROR_CATEGORIES: ErrorCategory[] = [
  {
    name: "Capital expense misclassification",
    description:
      "Roof, HVAC, or parking lot replacement billed as operating expense",
    probability: 0.15,
    impactRate: 0.08,
  },
  {
    name: "Gross-up error",
    description:
      "Gross-up applied when building is at or above target occupancy",
    probability: 0.12,
    impactRate: 0.05,
  },
  {
    name: "Admin fee overcharge",
    description:
      "Management fee percentage applied to gross expenses instead of net, or double-billed with staff salaries",
    probability: 0.1,
    impactRate: 0.04,
  },
  {
    name: "Non-CAM expenses in pool",
    description:
      "Landlord legal fees, leasing commissions, or tenant-specific costs included in CAM",
    probability: 0.18,
    impactRate: 0.03,
  },
  {
    name: "Cap violation",
    description:
      "Annual increase exceeds contractual cap without proper bank accounting",
    probability: 0.08,
    impactRate: 0.06,
  },
  {
    name: "Pro-rata share error",
    description:
      "Square footage or building denominator does not match lease terms",
    probability: 0.1,
    impactRate: 0.03,
  },
];

const CALCULATOR_FAQS = [
  {
    question: "How accurate is this challenge exposure estimate?",
    answer:
      "This calculator uses common CAM error patterns to produce a probability-weighted estimate. It is not a substitute for a full review of your own reconciliation statement and lease.",
  },
  {
    question: "What error rates does the calculator use?",
    answer:
      "The calculator applies common CAM error patterns across capital expense misclassification, gross-up errors, admin fee overcharges, non-CAM expenses, cap violations, and pro-rata share errors.",
  },
  {
    question: "Why do I need to enter my email to see results?",
    answer:
      "We use your email to send the results and save your access for future visits.",
  },
  {
    question:
      "What should I do if the calculator shows high challenge exposure?",
    answer:
      "A large estimate means your CAM billing may carry dispute or clawback risk. The next step is a full CAM review that checks your own reconciliation statement and lease terms.",
  },
  {
    question: "Does this calculator work for NNN leases?",
    answer:
      "Yes. CAM overcharges can occur in triple net, modified gross, and full-service gross leases with expense stops.",
  },
];

const CALCULATOR_SCHEMAS = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    applicationCategory: "FinanceApplication",
    applicationSubCategory: "Calculator",
    name: "Tenant Challenge Exposure Calculator",
    description:
      "Estimate CAM challenge exposure based on your lease size, annual CAM amount, and common error patterns.",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/cam-overcharge-calculator"),
  },
  structuredDataSchemas.faqPage(CALCULATOR_FAQS),
];

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const parseOptionalNumber = (value: string) =>
  value === "" ? undefined : Number(value);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

function estimateCategoryExposure(
  category: ErrorCategory,
  inputs: CalculatorInputs,
): number {
  const leaseSizeMultiplier = clamp(
    Math.sqrt(inputs.leasedSF / 10_000),
    0.75,
    1.75,
  );

  if (category.name === "Pro-rata share error" && inputs.buildingTotalSF) {
    const tenantShare = inputs.leasedSF / inputs.buildingTotalSF;
    const denominatorRiskMultiplier = clamp(
      1 + Math.abs(tenantShare - 0.1) * 2,
      0.85,
      1.5,
    );
    return (
      category.probability *
      category.impactRate *
      inputs.annualCAM *
      denominatorRiskMultiplier
    );
  }

  if (category.name === "Cap violation") {
    const capRate = inputs.capRate ?? 0.1;
    const capTightnessMultiplier = clamp(1 + (0.1 - capRate) * 10, 0.5, 1.5);
    return (
      category.probability *
      category.impactRate *
      inputs.annualCAM *
      leaseSizeMultiplier *
      capTightnessMultiplier
    );
  }

  return (
    category.probability *
    category.impactRate *
    inputs.annualCAM *
    leaseSizeMultiplier
  );
}

export function calculateOverchargeEstimates(inputs: CalculatorInputs): {
  categories: OverchargeEstimate[];
  totalLow: number;
  totalHigh: number;
} {
  const categories = ERROR_CATEGORIES.map((category) => {
    if (category.name === "Cap violation" && !inputs.hasCap) {
      return {
        category: category.name,
        description: category.description,
        lowEstimate: 0,
        highEstimate: 0,
        probability: 0,
      };
    }

    const expectedValue = estimateCategoryExposure(category, inputs);

    return {
      category: category.name,
      description: category.description,
      lowEstimate: Math.round(expectedValue * 0.5),
      highEstimate: Math.round(expectedValue * 2),
      probability: category.probability,
    };
  });

  return {
    categories,
    totalLow: categories.reduce(
      (sum, category) => sum + category.lowEstimate,
      0,
    ),
    totalHigh: categories.reduce(
      (sum, category) => sum + category.highEstimate,
      0,
    ),
  };
}

export function CamOverchargeCalculator() {
  const [results, setResults] = useState<ReturnType<
    typeof calculateOverchargeEstimates
  > | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const trackToolResultViewed = useTrackToolResultViewedOnce();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<CalculatorInputs>({
    resolver: zodResolver(calculatorSchema),
    defaultValues: { hasCap: false },
  });
  const hasCap = useWatch({ control, name: "hasCap" });
  const visibleCategories =
    results?.categories.filter((category) => category.highEstimate > 0) ?? [];

  // Invalidate a shown result the moment any input changes, so the displayed
  // range never contradicts the numbers on screen. Unlock state is preserved
  // so a re-estimate shows the full breakdown without re-entering an email.
  const clearStaleResults = () => {
    if (results) {
      setResults(null);
    }
  };

  useEffect(() => {
    if (!hasCap) {
      setValue("capRate", undefined);
    }
  }, [hasCap, setValue]);

  return (
    <ToolPageLayout
      toolName="Tenant Challenge Exposure Calculator"
      structuredData={CALCULATOR_SCHEMAS}
    >
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Tenant Challenge Exposure Calculator
        </h1>
        <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
          See how far off a CAM bill can get. Fix it before the statement goes
          to tenants.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Lease Inputs</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-5"
              onSubmit={handleSubmit((data) => {
                setResults(calculateOverchargeEstimates(data));
                trackToolResultViewed({
                  slug: "cam-overcharge-calculator",
                  tool_type: "calculator",
                  has_cap: data.hasCap,
                  annual_cam_bucket: getAnnualCamBucket(data.annualCAM),
                  leased_sf_bucket: getLeasedSquareFeetBucket(data.leasedSF),
                });
              })}
              noValidate
            >
              <div className="space-y-1.5">
                <Label htmlFor="leasedSF">Leased square footage</Label>
                <Input
                  id="leasedSF"
                  type="number"
                  min={100}
                  placeholder="10,000"
                  {...register("leasedSF", {
                    valueAsNumber: true,
                    onChange: clearStaleResults,
                  })}
                  aria-invalid={!!errors.leasedSF}
                  aria-describedby={
                    errors.leasedSF ? "leasedSF_error" : undefined
                  }
                />
                {errors.leasedSF && (
                  <p
                    id="leasedSF_error"
                    className="text-sm text-destructive-strong"
                    role="alert"
                  >
                    {errors.leasedSF.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="annualCAM">Annual CAM amount ($)</Label>
                <Input
                  id="annualCAM"
                  type="number"
                  min={1}
                  placeholder="25,000"
                  {...register("annualCAM", {
                    valueAsNumber: true,
                    onChange: clearStaleResults,
                  })}
                  aria-invalid={!!errors.annualCAM}
                  aria-describedby={
                    errors.annualCAM ? "annualCAM_error" : undefined
                  }
                />
                {errors.annualCAM && (
                  <p
                    id="annualCAM_error"
                    className="text-sm text-destructive-strong"
                    role="alert"
                  >
                    {errors.annualCAM.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="buildingTotalSF">
                  Building total RSF (optional)
                </Label>
                <Input
                  id="buildingTotalSF"
                  type="number"
                  min={100}
                  placeholder="100,000"
                  {...register("buildingTotalSF", {
                    setValueAs: parseOptionalNumber,
                    onChange: clearStaleResults,
                  })}
                  aria-invalid={!!errors.buildingTotalSF}
                  aria-describedby={
                    errors.buildingTotalSF ? "buildingTotalSF_error" : undefined
                  }
                />
                {errors.buildingTotalSF && (
                  <p
                    id="buildingTotalSF_error"
                    className="text-sm text-destructive-strong"
                    role="alert"
                  >
                    {errors.buildingTotalSF.message}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="hasCap"
                  checked={hasCap}
                  onCheckedChange={(checked) => {
                    setValue("hasCap", checked, { shouldValidate: true });
                    clearStaleResults();
                  }}
                />
                <Label htmlFor="hasCap">This lease has a CAM cap</Label>
              </div>

              {hasCap && (
                <div className="space-y-1.5">
                  <Label htmlFor="capRate">
                    CAM cap limit (% per year)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    The max percent your CAM can go up each year under your lease. Enter a number like 5 for 5%.
                  </p>
                  <Input
                    id="capRate"
                    type="number"
                    min={1}
                    max={25}
                    step={1}
                    placeholder="5"
                    {...register("capRate", {
                      setValueAs: (v: string) =>
                        v === "" ? undefined : Number(v) / 100,
                      onChange: clearStaleResults,
                    })}
                    aria-invalid={!!errors.capRate}
                    aria-describedby={
                      errors.capRate ? "capRate_error" : undefined
                    }
                  />
                  {errors.capRate && (
                    <p
                      id="capRate_error"
                      className="text-sm text-destructive-strong"
                      role="alert"
                    >
                      {errors.capRate.message}
                    </p>
                  )}
                </div>
              )}

              <Button type="submit" className="w-full">
                Estimate Overcharge Exposure
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Estimated Overcharge Exposure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {results ? (
              unlocked ? (
                <>
                  <p className="text-3xl font-bold tabular-nums">
                    {formatCurrency(results.totalLow)} -{" "}
                    {formatCurrency(results.totalHigh)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Potential annual overcharge exposure based on
                    industry-average error rates.
                  </p>

                  <div className="overflow-hidden rounded-lg border bg-background">
                    <div className="overflow-x-auto -mx-px px-px">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-3 text-left font-medium">
                            Error Category
                          </th>
                          <th className="p-3 text-right font-medium">
                            Estimated Range
                          </th>
                          <th className="p-3 text-right font-medium">
                            Likelihood
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleCategories.map((category) => (
                          <tr key={category.category} className="border-t">
                            <td className="p-3 align-top">
                              <p className="font-medium">{category.category}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {category.description}
                              </p>
                            </td>
                            <td className="whitespace-nowrap p-3 text-right align-top">
                              {formatCurrency(category.lowEstimate)} -{" "}
                              {formatCurrency(category.highEstimate)}
                            </td>
                            <td className="p-3 text-right align-top">
                              {Math.round(category.probability * 100)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    These estimates use industry-average error rates. They are
                    not a guarantee of actual overcharges. A full CAM audit
                    reviews your own reconciliation statement and lease terms.
                  </p>

                  <div className="rounded-lg border bg-background p-5">
                    <h2 className="text-lg font-semibold">
                      Want your exact numbers?
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      CapVeri runs the full reconciliation. It uses your
                      statement and lease. Every charge comes out right.
                    </p>
                    <Button asChild className="mt-4">
                      <Link href="/cam-audit">Check My CAM Charges</Link>
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center">
                  <div className="select-none rounded-lg border bg-background/80 p-6 blur-sm">
                    <p className="text-3xl font-bold">
                      {formatCurrency(results.totalLow)} -{" "}
                      {formatCurrency(results.totalHigh)}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Category breakdown ready
                    </p>
                  </div>
                  <CalculatorUnlockGate
                    slug="cam-overcharge-calculator"
                    source="cam-overcharge-calculator"
                    lockMessage="Enter your email to see the full overcharge breakdown."
                    unlockLabel="See Full Breakdown"
                    onUnlock={() => setUnlocked(true)}
                  />
                </div>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                Enter the lease and CAM details to estimate overcharge exposure.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="mt-12 max-w-3xl">
        <h2 className="mb-6 text-2xl font-bold">Frequently Asked Questions</h2>
        <div className="space-y-2">
          {CALCULATOR_FAQS.map((faq) => (
            <details key={faq.question} className="group rounded-lg border">
              <summary className="flex cursor-pointer select-none items-center justify-between p-4 font-medium">
                {faq.question}
                <ChevronDown className="h-4 w-4 flex-shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                {faq.answer}
              </div>
            </details>
          ))}
        </div>
      </section>
    </ToolPageLayout>
  );
}
