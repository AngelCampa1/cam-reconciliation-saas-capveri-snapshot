"use client";

import { useState, useEffect, useId, useCallback } from "react";
import Link from "next/link";
import { ExternalLink, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToolPageLayout } from "@/components/content/ToolPageLayout";
import { CalculatorUnlockGate } from "@/components/lead-capture/CalculatorUnlockGate";
import { structuredDataSchemas } from "@/lib/structured-data";
import { marketingApiUrl } from "@/lib/api";
import { buildSiteUrl } from "@/lib/site";

const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    applicationCategory: "FinanceApplication",
    name: "Fixed CAM vs Traditional Reconciliation Modeler",
    description:
      "Compare Fixed CAM (flat $/SF + annual escalator) vs traditional CAM reconciliation recovery over 3-5 years. See which structure recovers more for your building. Free calculator.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/fixed-cam-vs-traditional"),
    browserRequirements: "Requires JavaScript",
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Compare Fixed CAM vs Traditional Reconciliation",
    description:
      "Use the free Fixed CAM Modeler to compare recovery under traditional CAM reconciliation vs a Fixed CAM structure over 3-5 years.",
    totalTime: "PT3M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Enter historical data",
        text: "Input 3-5 years of total operating expenses and building rentable SF.",
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Set Fixed CAM terms",
        text: "Enter tenant SF, pro-rata share, the proposed Fixed CAM rate per SF, and annual escalation percentage.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Compare results",
        text: "See a year-by-year comparison table showing which structure recovers more. Unlock totals and recommendations with your email.",
      },
    ],
  },
];

const FIXED_CAM_FAQS = [
  {
    question: "What is Fixed CAM?",
    answer:
      "Fixed CAM (also called 'flat CAM' or 'CAM cap with no reconciliation') charges tenants a set per-square-foot rate that increases by a fixed percentage each year. Unlike traditional CAM reconciliation, there is no year-end true-up. The tenant pays the same amount regardless of actual expenses.",
  },
  {
    question: "Is Fixed CAM better for landlords or tenants?",
    answer:
      "Fixed CAM benefits tenants by giving expense predictability and removing year-end surprise bills. Landlords get less admin work but take on the risk that actual expenses may exceed the fixed charge, especially in high-inflation years or when operating costs spike.",
  },
  {
    question:
      "When does traditional CAM reconciliation recover more than Fixed CAM?",
    answer:
      "Traditional reconciliation recovers more whenever actual operating expenses grow faster than the fixed escalator rate. For example, if Fixed CAM escalates at 3% annually but actual expenses grow 5 to 7%, the landlord loses the difference each year. That gap compounds over the lease term.",
  },
  {
    question: "Can I convert from Fixed CAM to traditional reconciliation?",
    answer:
      "Conversion typically happens at lease renewal or amendment. Some landlords include a 'look-back' clause that allows switching to traditional reconciliation if actual expenses exceed the fixed charge by more than a defined threshold (often 10 to 15%).",
  },
];

const faqSchema = structuredDataSchemas.faqPage(FIXED_CAM_FAQS);

interface YearInput {
  year: string;
  totalExpenses: string;
  rentableSf: string;
}

interface YearResult {
  year: number;
  total_operating_expenses: string;
  expense_per_sf: string;
  traditional_recovery: string;
  fixed_cam_revenue: string;
  delta: string;
  cumulative_delta: string;
  escalated_rate_per_sf: string;
}

interface ModelerResult {
  years: YearResult[];
  total_traditional_recovery: string;
  total_fixed_cam_revenue: string;
  total_delta: string;
  avg_annual_delta: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return " - ";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(num);
}

const YEAR_COUNT_OPTIONS = [3, 4, 5] as const;
const currentYear = new Date().getFullYear();

function makeDefaultYears(count: number): YearInput[] {
  return Array.from({ length: count }, (_, i) => ({
    year: String(currentYear - count + 1 + i),
    totalExpenses: "",
    rentableSf: "",
  }));
}

export function FixedCamModelerPage() {
  const tenantSfId = useId();
  const proRataId = useId();
  const fixedRateId = useId();
  const escalationId = useId();
  const yearExpensesBaseId = useId();
  const yearRentableSfBaseId = useId();

  const [yearCount, setYearCount] = useState<number>(5);
  const [years, setYears] = useState<YearInput[]>(makeDefaultYears(5));
  const [tenantSqft, setTenantSqft] = useState("");
  const [proRataShare, setProRataShare] = useState("");
  const [fixedCamRate, setFixedCamRate] = useState("8.50");
  const [escalationPct, setEscalationPct] = useState(3.0);

  const [result, setResult] = useState<ModelerResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  const isReady =
    tenantSqft !== "" &&
    parseFloat(tenantSqft) > 0 &&
    proRataShare !== "" &&
    parseFloat(proRataShare) > 0 &&
    fixedCamRate !== "" &&
    parseFloat(fixedCamRate) > 0 &&
    years.every(
      (y) =>
        y.totalExpenses !== "" &&
        y.rentableSf !== "" &&
        parseFloat(y.totalExpenses) >= 0 &&
        parseFloat(y.rentableSf) > 0,
    );

  const fetchCalculation = useCallback(
    async (signal: AbortSignal) => {
      setIsLoading(true);
      setApiError(null);
      try {
        const payload = {
          years: years.map((y) => ({
            year: parseInt(y.year),
            total_operating_expenses: y.totalExpenses,
            rentable_sf: y.rentableSf,
          })),
          fixed_cam_rate_per_sf: fixedCamRate,
          annual_escalation_pct: String(escalationPct),
          tenant_sqft: tenantSqft,
          pro_rata_share: proRataShare,
        };
        const res = await fetch(
          marketingApiUrl("/api/v1/tools/fixed-cam-modeler"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal,
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setApiError(
            body.detail || "Calculation failed. Please check your inputs.",
          );
          setResult(null);
          return;
        }
        const data: ModelerResult = await res.json();
        setResult(data);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setApiError("Network error. Please try again.");
          setResult(null);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [years, fixedCamRate, escalationPct, tenantSqft, proRataShare],
  );

  useEffect(() => {
    if (!isReady) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => fetchCalculation(controller.signal), 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fetchCalculation, isReady]);

  function handleYearCountChange(count: number) {
    setYearCount(count);
    setYears(makeDefaultYears(count));
    clearResultState();
  }

  function clearResultState() {
    setResult(null);
    setApiError(null);
  }

  function handleYearChange(
    index: number,
    field: keyof YearInput,
    value: string,
  ) {
    clearResultState();
    setYears((prev) =>
      prev.map((y, i) => (i === index ? { ...y, [field]: value } : y)),
    );
  }

  return (
    <ToolPageLayout
      title="Fixed CAM vs Traditional Reconciliation Modeler | CapVeri"
      description="Compare Fixed CAM (flat $/SF + annual escalator) vs traditional CAM reconciliation recovery over 3-5 years. See which structure recovers more for your building. Free calculator."
      canonical={buildSiteUrl("/tools/fixed-cam-vs-traditional")}
      toolName="Fixed CAM vs Traditional Reconciliation Modeler"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Fixed CAM vs Traditional Reconciliation Modeler
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Compare what you would recover under traditional CAM reconciliation vs
          a Fixed CAM structure (flat $/SF + annual escalator) over 3-5 years.
        </p>
        <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
          <p>
            <strong>
              Fixed CAM charges tenants a flat per-SF rate that escalates
              annually (typically 3 to 5%), replacing the traditional
              reconciliation process.
            </strong>{" "}
            Fixed CAM removes year-end true-ups and cuts admin work. But when
            actual expenses grow faster than the escalator, recovery falls
            short.
          </p>
        </div>
      </div>

      {/* Context note */}
      <div className="mb-8 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm text-warning-foreground">
        <p className="font-semibold mb-1">Why this matters</p>
        <p>
          Fixed CAM is common because it removes reconciliation complexity. But
          when expenses grow faster than the fixed escalator, you recover less.
          This modeler shows the dollar impact year by year.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Input column */}
        <div className="space-y-4">
          {/* Year count selector */}
          <Card>
            <CardHeader>
              <CardTitle>Modeling Period</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {YEAR_COUNT_OPTIONS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => handleYearCountChange(count)}
                    className={`px-4 py-2 rounded-button text-sm font-medium transition-colors duration-200 ${
                      yearCount === count
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {count} Years
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Per-year inputs */}
          <Card>
            <CardHeader>
              <CardTitle>Historical Data (Per Year)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {years.map((year, i) => {
                const expensesId = `${yearExpensesBaseId}-${i}`;
                const rentableSfId = `${yearRentableSfBaseId}-${i}`;
                return (
                  <div key={i} className="space-y-3 border-b pb-4 last:border-0">
                    <p className="text-sm font-semibold">Year {year.year}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor={expensesId} className="text-xs">Total Expenses</Label>
                        <Input
                          id={expensesId}
                          type="number"
                          min={0}
                          className="h-11"
                          placeholder="1,000,000"
                          value={year.totalExpenses}
                          onChange={(e) =>
                            handleYearChange(i, "totalExpenses", e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={rentableSfId} className="text-xs">Rentable SF</Label>
                        <Input
                          id={rentableSfId}
                          type="number"
                          min={1}
                          className="h-11"
                          placeholder="100,000"
                          value={year.rentableSf}
                          onChange={(e) =>
                            handleYearChange(i, "rentableSf", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Tenant + Fixed CAM params */}
          <Card>
            <CardHeader>
              <CardTitle>Fixed CAM Terms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={tenantSfId}>Tenant SF</Label>
                  <Input
                    id={tenantSfId}
                    type="number"
                    min={1}
                    className="h-11"
                    placeholder="5,000"
                    value={tenantSqft}
                    onChange={(e) => {
                      clearResultState();
                      setTenantSqft(e.target.value);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={proRataId}>Pro-Rata Share %</Label>
                  <Input
                    id={proRataId}
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    className="h-11"
                    placeholder="5.0"
                    value={proRataShare}
                    onChange={(e) => {
                      clearResultState();
                      setProRataShare(e.target.value);
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={fixedRateId}>Fixed CAM Rate ($/SF/year)</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                    $
                  </span>
                  <Input
                    id={fixedRateId}
                    type="number"
                    min={0.01}
                    step={0.01}
                    className="h-11 pl-7"
                    placeholder="8.50"
                    value={fixedCamRate}
                    onChange={(e) => {
                      clearResultState();
                      setFixedCamRate(e.target.value);
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={escalationId}>Annual Escalation</Label>
                  <span className="text-sm font-semibold tabular-nums">
                    {escalationPct.toFixed(1)}%
                  </span>
                </div>
                <input
                  id={escalationId}
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={escalationPct}
                  aria-label="Annual escalation percentage"
                  className="min-h-[44px] w-full cursor-pointer accent-primary"
                  onChange={(e) => {
                    clearResultState();
                    setEscalationPct(parseFloat(e.target.value));
                  }}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0%</span>
                  <span>10%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results column */}
        <div className="space-y-4">
          {/* Free: year-by-year comparison table */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle>Year-by-Year Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              {apiError && (
                <p className="text-sm text-destructive-strong mb-4">{apiError}</p>
              )}

              {result ? (
                <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th
                          scope="col"
                          className="py-2 text-left font-semibold"
                        >
                          Year
                        </th>
                        <th
                          scope="col"
                          className="py-2 text-right font-semibold"
                        >
                          $/SF
                        </th>
                        <th
                          scope="col"
                          className="py-2 text-right font-semibold"
                        >
                          Traditional
                        </th>
                        <th
                          scope="col"
                          className="py-2 text-right font-semibold"
                        >
                          Fixed CAM
                        </th>
                        <th
                          scope="col"
                          className="py-2 text-right font-semibold"
                        >
                          Delta
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.years.map((yr) => {
                        const delta = parseFloat(yr.delta);
                        return (
                          <tr key={yr.year} className="border-b last:border-0">
                            <td className="py-2 font-medium">{yr.year}</td>
                            <td className="py-2 text-right tabular-nums text-muted-foreground">
                              ${parseFloat(yr.expense_per_sf).toFixed(2)}
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              {formatNumber(yr.traditional_recovery)}
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              {formatNumber(yr.fixed_cam_revenue)}
                            </td>
                            <td
                              className={`py-2 text-right tabular-nums font-medium ${
                                delta > 0
                                  ? "text-success-strong"
                                  : delta < 0
                                    ? "text-destructive-strong"
                                    : ""
                              }`}
                            >
                              {delta > 0 ? "+" : ""}
                              {formatNumber(yr.delta)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : isLoading ? (
                <p className="text-muted-foreground/40 text-center py-8">
                  Calculating...
                </p>
              ) : (
                <p className="text-sm text-muted-foreground py-4">
                  Fill in historical data and Fixed CAM terms above to see the
                  year-by-year comparison.
                </p>
              )}

              {result && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Positive delta (green) = traditional reconciliation recovers
                  more. Negative delta (red) = Fixed CAM structure recovers
                  more.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Gated: totals + recommendation */}
          <Card className="relative overflow-hidden">
            <CardHeader>
              <CardTitle>Summary &amp; Recommendation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {!isUnlocked && (
                <div className="absolute inset-0 z-10 backdrop-blur-sm bg-background/60 flex flex-col items-center justify-center p-6">
                  <CalculatorUnlockGate
                    slug="fixed-cam-vs-traditional"
                    onUnlock={() => setIsUnlocked(true)}
                    source="fixed-cam-vs-traditional"
                    lockMessage="Enter your email to see your fixed CAM savings."
                    unlockLabel="See My Savings"
                  />
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Total Traditional Recovery
                </p>
                {result && isUnlocked ? (
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {formatCurrency(
                      parseFloat(result.total_traditional_recovery),
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-2xl font-bold text-muted-foreground/40">
                    {" - "}
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Total Fixed CAM Revenue
                </p>
                {result && isUnlocked ? (
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {formatCurrency(parseFloat(result.total_fixed_cam_revenue))}
                  </p>
                ) : (
                  <p className="mt-1 text-2xl font-bold text-muted-foreground/40">
                    {" - "}
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Cumulative Delta Over Period
                </p>
                {result && isUnlocked ? (
                  <p
                    className={`mt-1 text-3xl font-bold tabular-nums ${
                      parseFloat(result.total_delta) > 0
                        ? "text-success-strong"
                        : parseFloat(result.total_delta) < 0
                          ? "text-destructive-strong"
                          : ""
                    }`}
                  >
                    {parseFloat(result.total_delta) > 0 ? "+" : ""}
                    {formatCurrency(parseFloat(result.total_delta))}
                  </p>
                ) : (
                  <p className="mt-1 text-3xl font-bold text-muted-foreground/40">
                    {" - "}
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Average Annual Difference
                </p>
                {result && isUnlocked ? (
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {formatCurrency(parseFloat(result.avg_annual_delta))}/year
                  </p>
                ) : (
                  <p className="mt-1 text-lg font-semibold text-muted-foreground/40">
                    {" - "}
                  </p>
                )}
              </div>

              {result && isUnlocked && (
                <div className="rounded-lg border bg-muted/30 p-4 mt-4">
                  <p className="text-sm font-semibold mb-1">Recommendation</p>
                  <p className="text-sm text-muted-foreground">
                    {parseFloat(result.total_delta) > 0
                      ? `Traditional reconciliation recovered ${formatCurrency(parseFloat(result.total_delta))} more over this period. With the right tools, you can keep that higher recovery without the extra admin work.`
                      : parseFloat(result.total_delta) < 0
                        ? `Fixed CAM recovered ${formatCurrency(Math.abs(parseFloat(result.total_delta)))} more over this period. In a low-expense-growth environment, Fixed CAM gives more predictable revenue. If expenses rise, check these numbers again.`
                        : "Both structures produced the same recovery over this period."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* FAQ Section */}
      <section className="mt-10">
        <h2 className="text-lg md:text-xl lg:text-2xl font-bold mb-8">
          Frequently Asked Questions
        </h2>
        <div className="space-y-2">
          {FIXED_CAM_FAQS.map((faq) => (
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
          Related tools
        </p>
        <ul className="space-y-2">
          <li className="flex items-center gap-2 text-sm">
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <Link
              href="/tools/noi-impact-calculator"
              className="text-primary underline-offset-4 hover:underline"
            >
              NOI Impact Calculator
            </Link>
          </li>
          <li className="flex items-center gap-2 text-sm">
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <Link
              href="/tools/cam-billing-error-estimator"
              className="text-primary underline-offset-4 hover:underline"
            >
              CAM Billing Error Estimator
            </Link>
          </li>
        </ul>
      </div>
    </ToolPageLayout>
  );
}
