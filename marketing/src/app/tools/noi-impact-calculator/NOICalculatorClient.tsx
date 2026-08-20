"use client";

import { useState, useId, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToolPageLayout } from "@/components/content/ToolPageLayout";
import { getAnnualPrice } from "@/generated/plan-tiers";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildSiteUrl } from "@/lib/site";

const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    applicationCategory: "FinanceApplication",
    name: "NOI Impact Calculator",
    description:
      "See how CAM billing errors change your NOI and asset value. Enter portfolio size, CAM rate, and cap rate. See the dollar impact fast.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/noi-impact-calculator"),
    browserRequirements: "Requires JavaScript",
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Model CAM Billing Impact on NOI",
    description:
      "Use the free NOI Impact Calculator to see how CAM billing errors change your NOI and asset value.",
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
        name: "Enter average rentable SF and CAM rate",
        text: "Input the average rentable square footage per building and your annual CAM rate per SF.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Set your cap rate",
        text: "Adjust the cap rate slider to match your market (3–12%). The calculator uses this to project asset value lift.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Review NOI recovery and asset value lift",
        text: "See your estimated NOI recovered and asset value lift for your portfolio instantly.",
      },
    ],
  },
];

const NOI_FAQS = [
  {
    question: "How does CAM leakage affect NOI?",
    answer:
      "CAM leakage directly reduces Net Operating Income (NOI) because underbilled expenses come out of the landlord\u2019s bottom line. Since commercial property values are calculated as NOI divided by cap rate, even small billing errors get amplified into significant asset value reductions.",
  },
  {
    question: "What is NOI in commercial real estate?",
    answer:
      "Net Operating Income (NOI) is a property\u2019s total revenue minus operating expenses, excluding debt service and capital expenditures. It is the standard metric for valuing commercial properties - a higher NOI means a higher property value at any given cap rate.",
  },
  {
    question: "How does cap rate affect the impact of CAM errors?",
    answer:
      "Cap rate is the divisor in the property valuation formula (Value = NOI / Cap Rate). A lower cap rate amplifies the impact of every dollar of NOI change. At a 5% cap rate, $10,000 of annual CAM leakage reduces asset value by $200,000. At an 8% cap rate, the same leakage reduces value by $125,000.",
  },
  {
    question: "What is a typical cap rate for commercial offices?",
    answer:
      "Office cap rates in the U.S. typically range from 5% to 9% depending on market, class, and occupancy. Class A urban offices tend toward 5\u20136%, while suburban Class B/C properties may be 7\u20139%. The specific cap rate matters because it determines how much NOI changes affect property value.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(NOI_FAQS);

const LEAKAGE_RATE = 0.04;
const STARTING_PLAN_COST = getAnnualPrice("reconcile") ?? 0;
const DEFAULT_CAM_PER_SF = 8.5;
const DEFAULT_CAP_RATE = 7;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function NOICalculatorClient() {
  const buildingsId = useId();
  const sfId = useId();
  const camId = useId();
  const capRateId = useId();

  const [buildings, setBuildings] = useState<number | "">(1);
  const [avgSF, setAvgSF] = useState<number | "">("");
  const [camPerSF, setCamPerSF] = useState<number>(DEFAULT_CAM_PER_SF);
  const [capRate, setCapRate] = useState<number>(DEFAULT_CAP_RATE);

  const resultsRef = useRef<HTMLDivElement>(null);

  const isReady =
    typeof buildings === "number" &&
    buildings > 0 &&
    typeof avgSF === "number" &&
    avgSF > 0 &&
    camPerSF > 0 &&
    capRate > 0;

  useEffect(() => {
    if (!isReady) return;
    const el = resultsRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top > window.innerHeight - 80) {
      el.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
    }
  }, [isReady]);

  const buildingsNum =
    typeof buildings === "number" && !isNaN(buildings) ? buildings : 1;

  const totalCAMPool = isReady
    ? (buildings as number) * (avgSF as number) * camPerSF
    : 0;
  const leakage = totalCAMPool * LEAKAGE_RATE;
  const assetValueLift = leakage / (capRate / 100);

  return (
    <ToolPageLayout
      title="NOI Impact Calculator - CAM Billing Impact on NOI | CapVeri"
      description="See how CAM billing errors change your NOI and asset value. Enter your portfolio size, CAM rate, and cap rate. See the dollar impact fast."
      canonical={buildSiteUrl("/tools/noi-impact-calculator")}
      toolName="NOI Impact Calculator"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          NOI Impact Calculator
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          See how CAM billing errors change your NOI and asset value. Get the
          dollar impact for your portfolio.
        </p>
        <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
          <p>
            <strong>
              Net Operating Income (NOI) is how investors value commercial
              property.
            </strong>{" "}
            CAM billing errors hit NOI directly. Cap rates amplify it. $1 of
            under-billed CAM can cut asset value by $12 to $20. The exact hit
            depends on your cap rate. Over-billing hurts too. It invites
            disputes and refunds.
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
                  setBuildings(Number(e.target.value));
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
                  setBuildings(Math.min(200, Math.max(1, Number(raw))));
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

            {/* Cap rate slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor={capRateId}>Cap Rate</Label>
                <span className="text-sm font-semibold tabular-nums">
                  {capRate}%
                </span>
              </div>
              <input
                id={capRateId}
                type="range"
                min={3}
                max={12}
                step={0.5}
                value={capRate}
                aria-label="Cap rate slider"
                className="min-h-[44px] w-full cursor-pointer accent-primary"
                onChange={(e) => {
                  setCapRate(Number(e.target.value));
                }}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>3%</span>
                <span>12%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results card */}
        <Card ref={resultsRef} className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>NOI Recovery Projection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Total CAM pool */}
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Total CAM pool
              </p>
              {isReady ? (
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {formatCurrency(totalCAMPool)}
                </p>
              ) : (
                <p className="mt-1 text-2xl font-bold text-muted-foreground/40">
                  -
                </p>
              )}
            </div>

            {/* NOI before/after comparison */}
            <div className="rounded-lg border bg-background/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th
                      scope="col"
                      className="px-4 py-2 text-left font-medium text-muted-foreground"
                    >
                      Scenario
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2 text-right font-medium text-muted-foreground"
                    >
                      CAM Leakage Recovered
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="px-4 py-2 text-muted-foreground">
                      Without CapVeri
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-destructive-strong font-medium">
                      {isReady ? formatCurrency(0) : " - "}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium">With CapVeri</td>
                    <td className="px-4 py-2 text-right tabular-nums text-primary font-semibold">
                      {isReady ? formatCurrency(leakage) : " - "}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Summary boxes */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-background/60 p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  NOI Recovered
                </p>
                {isReady ? (
                  <p className="mt-1 text-lg font-bold tabular-nums text-primary">
                    {formatCurrency(leakage)}
                  </p>
                ) : (
                  <p className="mt-1 text-lg font-bold text-muted-foreground/40">
                    -
                  </p>
                )}
              </div>
              <div className="rounded-lg border bg-background/60 p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Asset Value Lift
                </p>
                {isReady ? (
                  <p className="mt-1 text-lg font-bold tabular-nums">
                    {formatCurrency(assetValueLift)}
                  </p>
                ) : (
                  <p className="mt-1 text-lg font-bold text-muted-foreground/40">
                    -
                  </p>
                )}
              </div>
            </div>

            {isReady && STARTING_PLAN_COST > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3">
                <p className="text-sm text-primary">
                  CapVeri plans start at{" "}
                  <span className="font-bold">
                    {formatCurrency(STARTING_PLAN_COST)}
                  </span>{" "}
                  a year. Your price scales with your unit count.{" "}
                  <Link href="/pricing" className="font-medium underline">
                    See pricing
                  </Link>
                  .
                </p>
              </div>
            )}

            {!isReady && (
              <p className="text-sm text-muted-foreground">
                Enter your portfolio details above to see your projection.
              </p>
            )}

            {/* Modeling note */}
            <p className="text-xs text-muted-foreground border-t pt-4">
              Uses a 4% leakage rate we model for this estimate. Actual results
              vary by portfolio. Use your own reconciliation history to
              calibrate.
            </p>

            {/* CTA */}
            <Button asChild className="w-full sm:w-auto">
              <Link
                href={buildTrialLink({
                  content: "tools_noi_impact_calculator_cta",
                  source: "noi-calculator",
                  buildings: buildingsNum,
                })}
              >
                See what CapVeri finds in your actual GL
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* FAQ Section */}
      <section className="mt-10">
        <h2 className="text-lg md:text-xl lg:text-2xl font-bold mb-8">
          Frequently Asked Questions
        </h2>
        <div className="space-y-2">
          {NOI_FAQS.map((faq) => (
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
          <li className="flex items-center gap-2 text-sm">
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <Link
              href="/tools/audit-risk-quiz"
              className="text-primary underline-offset-4 hover:underline"
            >
              Pre-Send Audit Exposure Quiz
            </Link>
          </li>
        </ul>
      </div>
    </ToolPageLayout>
  );
}
