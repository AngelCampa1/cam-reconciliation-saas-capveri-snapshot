"use client";

import { useState, useEffect, useId, useCallback } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
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
    name: "BOMA 2024 Rentable Area Calculator",
    description:
      "See the extra billable square footage your building gains under BOMA 2024. Enter existing measurements and outdoor SF to get SF impact instantly. Financial projections with email.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/boma-2024-calculator"),
    browserRequirements: "Requires JavaScript",
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Calculate Additional Rentable SF Under BOMA 2024",
    description:
      "Use the free BOMA 2024 Rentable Area Calculator to see how much extra billable square footage your building gains under the 2024 standard.",
    totalTime: "PT2M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Enter existing measurements",
        text: "Input your current usable SF and rentable SF. The calculator derives the existing load factor automatically.",
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Add outdoor SF",
        text: "Enter balcony, terrace, and outdoor amenity SF that BOMA 2024 now includes in the rentable area calculation.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "See hidden rentable SF instantly",
        text: "Get the additional rentable SF and percentage increase for free. Enter your email to see financial projections.",
      },
    ],
  },
];

const BOMA_FAQS = [
  {
    question: "What changed in BOMA 2024?",
    answer:
      "BOMA 2024 expanded rentable area to include qualifying outdoor tenant spaces: balconies, terraces, rooftop amenity areas, and covered walkways. Previously, only enclosed interior space counted toward rentable area. This change can increase a building's total rentable SF by 2-8% depending on outdoor amenities.",
  },
  {
    question: "Does BOMA 2024 apply to existing leases?",
    answer:
      'It depends on lease language. If a lease references "BOMA standards" without specifying a version, adopting BOMA 2024 may allow re-measurement. If the lease specifies "BOMA 2017" or an earlier standard, re-measurement typically requires a lease amendment or renewal.',
  },
  {
    question: "How does BOMA 2024 affect load factor?",
    answer:
      "When outdoor areas are added to rentable SF, the building's load factor (ratio of rentable to usable area) changes. A higher rentable area with the same usable area means a higher load factor. Each tenant's pro-rata share may shift proportionally.",
  },
  {
    question: "What outdoor spaces qualify under BOMA 2024?",
    answer:
      "Qualifying spaces include private balconies, shared terraces, rooftop amenity areas, covered walkways, and certain outdoor dining areas. Spaces must be accessible, maintained, and allocated to specific tenants or common areas. Unimproved land, parking surfaces, and loading docks are excluded.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(BOMA_FAQS);

interface BomaInputs {
  usableSf: string;
  rentableSf: string;
  balconySf: string;
  terraceSf: string;
  outdoorAmenitySf: string;
  annualRentPerSf: string;
}

interface BomaResult {
  load_factor: string;
  new_usable_sf: string;
  new_rentable_sf: string;
  hidden_sf: string;
  pct_increase: string;
  revenue_lift: string | null;
  asset_value_lift: string | null;
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
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    num,
  );
}

/** Returns a plain-English validation error for area inputs, or null if valid. */
function getAreaValidationError(inputs: BomaInputs): string | null {
  const usable = parseFloat(inputs.usableSf);
  const rentable = parseFloat(inputs.rentableSf);

  if (inputs.usableSf !== "" && (isNaN(usable) || usable <= 0)) {
    return "Usable SF must be a number greater than zero.";
  }
  if (inputs.rentableSf !== "" && (isNaN(rentable) || rentable <= 0)) {
    return "Rentable SF must be a number greater than zero.";
  }
  if (
    inputs.usableSf !== "" &&
    inputs.rentableSf !== "" &&
    !isNaN(usable) &&
    !isNaN(rentable) &&
    rentable < usable
  ) {
    return "Rentable SF cannot be less than usable SF. Check your inputs.";
  }
  return null;
}

export function Boma2024CalculatorPage() {
  const usableSfId = useId();
  const rentableSfId = useId();
  const balconySfId = useId();
  const terraceSfId = useId();
  const outdoorId = useId();
  const rentId = useId();

  const [inputs, setInputs] = useState<BomaInputs>({
    usableSf: "",
    rentableSf: "",
    balconySf: "",
    terraceSf: "",
    outdoorAmenitySf: "",
    annualRentPerSf: "",
  });

  const [result, setResult] = useState<BomaResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [capRate, setCapRate] = useState(6.5);

  const areaValidationError = getAreaValidationError(inputs);

  // SF result is free: only needs usable + rentable (both positive, rentable >= usable).
  const isSfReady =
    inputs.usableSf !== "" &&
    inputs.rentableSf !== "" &&
    areaValidationError === null &&
    parseFloat(inputs.usableSf) > 0 &&
    parseFloat(inputs.rentableSf) > 0 &&
    parseFloat(inputs.rentableSf) >= parseFloat(inputs.usableSf);

  // Financial projections also need a valid rent figure.
  const isFinancialReady =
    isSfReady &&
    inputs.annualRentPerSf !== "" &&
    parseFloat(inputs.annualRentPerSf) > 0;

  const fetchCalculation = useCallback(
    async (currentInputs: BomaInputs, signal: AbortSignal) => {
      setIsLoading(true);
      setApiError(null);
      try {
        // Omit rent when not provided: the API returns SF geometry for free and
        // leaves the financial fields null until a rent figure is supplied.
        const hasRent =
          currentInputs.annualRentPerSf !== "" &&
          parseFloat(currentInputs.annualRentPerSf) > 0;
        const payload = {
          usable_sf: currentInputs.usableSf,
          rentable_sf: currentInputs.rentableSf,
          balcony_sf: currentInputs.balconySf || "0",
          terrace_sf: currentInputs.terraceSf || "0",
          outdoor_amenity_sf: currentInputs.outdoorAmenitySf || "0",
          cap_rate: String(capRate / 100),
          ...(hasRent
            ? { annual_rent_per_sf: currentInputs.annualRentPerSf }
            : {}),
        };
        const res = await fetch(
          marketingApiUrl("/api/v1/tools/boma-2024-calculator"),
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
            (body as { detail?: string }).detail ||
              "Calculation failed. Please check your inputs.",
          );
          setResult(null);
          return;
        }
        const data: BomaResult = await res.json();
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
    [capRate],
  );

  useEffect(() => {
    if (!isSfReady) {
      return;
    }
    const controller = new AbortController();
    // Debounce: wait one tick so rapid keystrokes do not fire multiple requests.
    const timer = setTimeout(
      () => fetchCalculation(inputs, controller.signal),
      0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // inputs and isSfReady are the reactive dependencies; fetchCalculation is
    // stable across renders (memoized via useCallback on capRate only).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, isSfReady]);

  // Re-derive asset value lift locally when cap rate changes (no extra API call).
  const displayedAssetValueLift =
    result && isUnlocked && isFinancialReady && result.revenue_lift !== null
      ? Math.round(parseFloat(result.revenue_lift) / (capRate / 100))
      : null;

  function handleInputChange(field: keyof BomaInputs, value: string) {
    setResult(null);
    setApiError(null);
    setInputs((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <ToolPageLayout
      title="BOMA 2024 Rentable Area Calculator | CapVeri"
      description="See how many extra billable square feet your building gains under BOMA 2024. Enter existing measurements and outdoor tenant spaces to get SF impact instantly. Financial projections with email. Free."
      canonical={buildSiteUrl("/tools/boma-2024-calculator")}
      toolName="BOMA 2024 Rentable Area Calculator"
      structuredData={[...STRUCTURED_DATA, faqSchema]}
    >
      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          BOMA 2024 Rentable Area Calculator
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          See how many additional billable square feet your building gains by
          adopting the BOMA 2024 measurement standard.
        </p>
        <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
          <p>
            <strong>
              BOMA 2024 (BOMA International&apos;s updated measurement standard)
              expands the definition of rentable area to include qualifying
              outdoor spaces like balconies, terraces, and covered walkways.
            </strong>{" "}
            Buildings that adopt the standard can add billable square footage
            without physical construction.
          </p>
        </div>
      </div>

      {/* BOMA certification note */}
      <div className="mb-8 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-primary/90">
        <p className="font-semibold mb-1">On BOMA software compliance claims</p>
        <p>
          BOMA does not certify software. Any vendor claiming
          &quot;BOMA-certified software&quot; is misrepresenting BOMA&apos;s
          position. BOMA publishes a measurement standard, not a software
          certification program. Compliance means the calculation logic
          correctly implements BOMA 2024 methodology: Non-Allocated Tenant Areas
          are measured at 100% of actual area with no load factor applied. That
          is what this calculator does.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Input card */}
        <Card>
          <CardHeader>
            <CardTitle>Your Building Measurements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor={usableSfId}>Existing Usable SF</Label>
              <Input
                id={usableSfId}
                type="number"
                min={1}
                className="h-11"
                placeholder="e.g. 100,000"
                value={inputs.usableSf}
                aria-label="Existing usable SF"
                onChange={(e) => handleInputChange("usableSf", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={rentableSfId}>Existing Rentable SF</Label>
              <Input
                id={rentableSfId}
                type="number"
                min={1}
                className="h-11"
                placeholder="e.g. 125,000"
                value={inputs.rentableSf}
                aria-label="Existing rentable SF"
                onChange={(e) =>
                  handleInputChange("rentableSf", e.target.value)
                }
              />
              <p className="text-xs text-muted-foreground">
                Load factor is derived automatically from these two values.
              </p>
            </div>

            {/* Inline validation error for area inputs */}
            {areaValidationError && (
              <p
                className="text-sm text-destructive-strong"
                role="alert"
                data-testid="area-validation-error"
              >
                {areaValidationError}
              </p>
            )}

            <div className="border-t pt-4 space-y-4">
              <p className="text-sm font-medium">
                Outdoor SF now included under BOMA 2024
              </p>

              <div className="space-y-2">
                <Label htmlFor={balconySfId}>Balcony SF</Label>
                <Input
                  id={balconySfId}
                  type="number"
                  min={0}
                  className="h-11"
                  placeholder="0"
                  value={inputs.balconySf}
                  aria-label="Balcony SF"
                  onChange={(e) =>
                    handleInputChange("balconySf", e.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={terraceSfId}>Terrace SF</Label>
                <Input
                  id={terraceSfId}
                  type="number"
                  min={0}
                  className="h-11"
                  placeholder="0"
                  value={inputs.terraceSf}
                  aria-label="Terrace SF"
                  onChange={(e) =>
                    handleInputChange("terraceSf", e.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={outdoorId}>Outdoor Amenity SF</Label>
                <Input
                  id={outdoorId}
                  type="number"
                  min={0}
                  className="h-11"
                  placeholder="0"
                  value={inputs.outdoorAmenitySf}
                  aria-label="Outdoor amenity SF"
                  onChange={(e) =>
                    handleInputChange("outdoorAmenitySf", e.target.value)
                  }
                />
              </div>
            </div>

            <div className="border-t pt-4 space-y-2">
              <Label htmlFor={rentId}>
                Annual Rent per SF ($/year){" "}
                <span className="text-muted-foreground font-normal text-xs">
                  for financial projections
                </span>
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  $
                </span>
                <Input
                  id={rentId}
                  type="number"
                  min={0.01}
                  step={0.01}
                  className="h-11 pl-7"
                  placeholder="e.g. 35"
                  value={inputs.annualRentPerSf}
                  aria-label="Annual rent per SF"
                  onChange={(e) =>
                    handleInputChange("annualRentPerSf", e.target.value)
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Optional. Add rent to unlock dollar projections below.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Results card */}
        <div className="space-y-4">
          {/* Free results */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle>Your Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {apiError && (
                <p className="text-sm text-destructive-strong">{apiError}</p>
              )}

              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Hidden Rentable SF Found
                </p>
                {isLoading ? (
                  <p className="mt-1 text-3xl font-bold text-muted-foreground/40">
                    ...
                  </p>
                ) : result ? (
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {formatNumber(result.hidden_sf)} SF
                  </p>
                ) : (
                  <p
                    className="mt-1 text-3xl font-bold text-muted-foreground/40"
                    data-testid="hidden-sf-placeholder"
                  >
                    -
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  % Increase in Rentable Area
                </p>
                {isLoading ? (
                  <p className="mt-1 text-3xl font-bold text-muted-foreground/40">
                    ...
                  </p>
                ) : result ? (
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {parseFloat(result.pct_increase).toFixed(2)}%
                  </p>
                ) : (
                  <p
                    className="mt-1 text-3xl font-bold text-muted-foreground/40"
                    data-testid="pct-placeholder"
                  >
                    -
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  New Load Factor
                </p>
                {result ? (
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {parseFloat(result.load_factor).toFixed(4)}x
                  </p>
                ) : (
                  <p className="mt-1 text-lg font-semibold text-muted-foreground/40">
                    -
                  </p>
                )}
              </div>

              {!isSfReady && !apiError && !areaValidationError && (
                <p className="text-sm text-muted-foreground">
                  Enter your usable SF and rentable SF above to see your
                  results.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Gated financial results */}
          <Card className="relative overflow-hidden">
            <CardHeader>
              <CardTitle>Financial Projections</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Blurred overlay when locked */}
              {!isUnlocked && (
                <div className="absolute inset-0 z-10 backdrop-blur-sm bg-background/60 flex flex-col items-center justify-center p-6">
                  <CalculatorUnlockGate
                    slug="boma-2024-calculator"
                    onUnlock={() => setIsUnlocked(true)}
                    source="boma-2024-calculator"
                  />
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Annual Revenue Lift
                </p>
                {result &&
                isUnlocked &&
                isFinancialReady &&
                result.revenue_lift !== null ? (
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {formatCurrency(parseFloat(result.revenue_lift))}
                  </p>
                ) : (
                  <p className="mt-1 text-3xl font-bold text-muted-foreground/40">
                    -
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Asset Value Lift at {capRate.toFixed(1)}% Cap Rate
                </p>
                {displayedAssetValueLift !== null ? (
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {formatCurrency(displayedAssetValueLift)}
                  </p>
                ) : (
                  <p className="mt-1 text-3xl font-bold text-muted-foreground/40">
                    -
                  </p>
                )}
              </div>

              {/* Cap rate slider - only usable after unlock */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Cap Rate</Label>
                  <span className="text-sm font-semibold tabular-nums">
                    {capRate.toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={10}
                  step={0.5}
                  value={capRate}
                  aria-label="Cap rate slider"
                  disabled={!isUnlocked}
                  className="min-h-[44px] w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                  onChange={(e) => setCapRate(parseFloat(e.target.value))}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>3%</span>
                  <span>10%</span>
                </div>
              </div>

              {isUnlocked && !isFinancialReady && (
                <p className="text-sm text-muted-foreground">
                  Add your annual rent per SF above to see dollar projections.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* FAQ Section */}
      <section className="mt-12 max-w-3xl">
        <h2 className="text-lg md:text-xl lg:text-2xl font-bold mb-8">
          Frequently Asked Questions
        </h2>
        <div className="space-y-2">
          {BOMA_FAQS.map((faq) => (
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
              href="/blog/boma-2024-changes"
              className="text-primary underline-offset-4 hover:underline"
            >
              BOMA 2024 vs 2017: What Changed and What It Costs You
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
