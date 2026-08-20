# Story T6.4: Free CAM Overcharge Calculator

## Story Info
- **Epic**: T6 -- Content & SEO
- **Estimated Hours**: 8
- **Dependencies**: T4.1 (scaffold), T6.1 (schema markup helpers)
- **Status**: `completed`

## User Story
As a commercial tenant wondering if my CAM charges are too high, I want a free calculator that estimates potential overcharges based on my lease size and CAM amount so that I can decide whether a full audit is worth it.

## Acceptance Criteria
- Calculator page renders at `/tools/cam-overcharge-calculator`
- User inputs: leased square footage, annual CAM amount, building total RSF (optional), lease has cap (yes/no + cap rate)
- Calculator shows estimated overcharge range based on common error rates
- Results are gated behind email capture (CalculatorUnlockGate pattern)
- Page includes WebApplication + FAQPage JSON-LD
- Page uses ToolPageLayout wrapper with breadcrumb (Home > Tools > CAM Overcharge Calculator)
- Calculator works entirely client-side (no backend API calls for calculation)
- Results show breakdown by error category with dollar estimates
- CTA below results drives to the paid audit wizard

## Technical Specifications

### Page Structure

```
marketing-tenant/
  src/
    app/
      tools/
        cam-overcharge-calculator/
          page.tsx                        # Metadata + server component
          CamOverchargeCalculatorClient.tsx  # Client component
```

### JSON-LD Schemas

```typescript
const CALCULATOR_SCHEMAS = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    applicationCategory: "FinanceApplication",
    applicationSubCategory: "Calculator",
    name: "CAM Overcharge Calculator",
    description:
      "Estimate potential CAM overcharges based on your lease size, annual CAM amount, and common error rates. Free tool for commercial tenants.",
    operatingSystem: "Any (web-based)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: "https://tenant.capveri.com/tools/cam-overcharge-calculator",
  },
  buildFAQPageSchema(CALCULATOR_FAQS),
];
```

### Calculator Input Form

```typescript
import { z } from "zod";

const calculatorSchema = z.object({
  leasedSF: z
    .number({ required_error: "Required" })
    .min(100, "Must be at least 100 SF")
    .max(1_000_000, "Must be under 1,000,000 SF"),
  annualCAM: z
    .number({ required_error: "Required" })
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
});

type CalculatorInputs = z.infer<typeof calculatorSchema>;
```

### Calculation Logic

The calculator estimates overcharge potential using industry-average error rates. These are not guarantees -- they represent the probability-weighted expected value of common CAM errors.

```typescript
interface ErrorCategory {
  name: string;
  description: string;
  /** Probability this error type is present (0-1) */
  probability: number;
  /** If present, what percentage of annual CAM is typically overcharged (0-1) */
  impactRate: number;
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
    probability: 0.10,
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
    probability: 0.10,
    impactRate: 0.03,
  },
];

interface OverchargeEstimate {
  category: string;
  description: string;
  lowEstimate: number;
  highEstimate: number;
  probability: number;
}

function calculateOverchargeEstimates(
  inputs: CalculatorInputs
): {
  categories: OverchargeEstimate[];
  totalLow: number;
  totalHigh: number;
} {
  const categories = ERROR_CATEGORIES.map((cat) => {
    // Skip cap violation if tenant has no cap
    if (cat.name === "Cap violation" && !inputs.hasCap) {
      return {
        category: cat.name,
        description: cat.description,
        lowEstimate: 0,
        highEstimate: 0,
        probability: 0,
      };
    }

    // Expected value: probability * impact * annual CAM
    const expectedValue =
      cat.probability * cat.impactRate * inputs.annualCAM;
    // Show a range: 0.5x to 2x of expected value
    const lowEstimate = Math.round(expectedValue * 0.5);
    const highEstimate = Math.round(expectedValue * 2.0);

    return {
      category: cat.name,
      description: cat.description,
      lowEstimate,
      highEstimate,
      probability: cat.probability,
    };
  });

  const totalLow = categories.reduce((sum, c) => sum + c.lowEstimate, 0);
  const totalHigh = categories.reduce((sum, c) => sum + c.highEstimate, 0);

  return { categories, totalLow, totalHigh };
}
```

### Client Component

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ToolPageLayout } from "@/components/content/ToolPageLayout";
import { CalculatorUnlockGate } from "@/components/lead-capture/CalculatorUnlockGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function CamOverchargeCalculator() {
  const [results, setResults] = useState<ReturnType<
    typeof calculateOverchargeEstimates
  > | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CalculatorInputs>({
    resolver: zodResolver(calculatorSchema),
    defaultValues: { hasCap: false },
  });

  const hasCap = watch("hasCap");

  const onSubmit = (data: CalculatorInputs) => {
    setResults(calculateOverchargeEstimates(data));
  };

  return (
    <ToolPageLayout
      toolName="CAM Overcharge Calculator"
      structuredData={CALCULATOR_SCHEMAS}
    >
      <h1 className="text-3xl font-bold mb-2">
        Free CAM Overcharge Calculator
      </h1>
      <p className="text-muted-foreground mb-8">
        Estimate how much you might be overpaying on CAM charges based on
        your lease size and common error rates.
      </p>

      {/* Input Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-md">
        <div className="space-y-1.5">
          <Label htmlFor="leasedSF">Leased square footage</Label>
          <Input
            id="leasedSF"
            type="number"
            placeholder="10,000"
            {...register("leasedSF", { valueAsNumber: true })}
            aria-invalid={!!errors.leasedSF}
          />
          {errors.leasedSF && (
            <p className="text-sm text-destructive">
              {errors.leasedSF.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="annualCAM">Annual CAM amount ($)</Label>
          <Input
            id="annualCAM"
            type="number"
            placeholder="25,000"
            {...register("annualCAM", { valueAsNumber: true })}
            aria-invalid={!!errors.annualCAM}
          />
          {errors.annualCAM && (
            <p className="text-sm text-destructive">
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
            placeholder="100,000"
            {...register("buildingTotalSF", { valueAsNumber: true })}
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch id="hasCap" {...register("hasCap")} />
          <Label htmlFor="hasCap">My lease has a CAM cap</Label>
        </div>

        {hasCap && (
          <div className="space-y-1.5">
            <Label htmlFor="capRate">Cap rate (e.g., 0.05 for 5%)</Label>
            <Input
              id="capRate"
              type="number"
              step="0.01"
              placeholder="0.05"
              {...register("capRate", { valueAsNumber: true })}
              aria-invalid={!!errors.capRate}
            />
            {errors.capRate && (
              <p className="text-sm text-destructive">
                {errors.capRate.message}
              </p>
            )}
          </div>
        )}

        <Button type="submit" className="w-full">
          Estimate My Overcharges
        </Button>
      </form>

      {/* Results (gated) */}
      {results && !unlocked && (
        <div className="mt-8 rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">
            Your Estimated Overcharges
          </h2>
          <div className="blur-sm pointer-events-none select-none" aria-hidden>
            {/* Blurred preview of results */}
            <p className="text-2xl font-bold text-primary">
              ${results.totalLow.toLocaleString()} - $
              {results.totalHigh.toLocaleString()}
            </p>
          </div>
          <CalculatorUnlockGate
            slug="cam-overcharge-calculator"
            source="tenant_tools"
            onUnlock={() => setUnlocked(true)}
          />
        </div>
      )}

      {results && unlocked && (
        <div className="mt-8 space-y-6">
          <h2 className="text-xl font-semibold">
            Your Estimated Overcharges
          </h2>
          <p className="text-3xl font-bold text-primary">
            ${results.totalLow.toLocaleString()} - $
            {results.totalHigh.toLocaleString()}
            <span className="text-base font-normal text-muted-foreground ml-2">
              potential annual overcharge
            </span>
          </p>

          {/* Category breakdown table */}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Error Category</th>
                  <th className="text-right p-3 font-medium">
                    Estimated Range
                  </th>
                  <th className="text-right p-3 font-medium">Likelihood</th>
                </tr>
              </thead>
              <tbody>
                {results.categories
                  .filter((c) => c.highEstimate > 0)
                  .map((cat) => (
                    <tr key={cat.category} className="border-t">
                      <td className="p-3">
                        <p className="font-medium">{cat.category}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">
                          {cat.description}
                        </p>
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        ${cat.lowEstimate.toLocaleString()} - $
                        {cat.highEstimate.toLocaleString()}
                      </td>
                      <td className="p-3 text-right">
                        {Math.round(cat.probability * 100)}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-muted-foreground">
            These estimates are based on industry-average error rates and
            are not a guarantee of actual overcharges. A full CAM audit
            reviews your specific reconciliation statement and lease terms.
          </p>

          {/* CTA to paid audit */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 text-center space-y-3">
            <h3 className="text-lg font-semibold">
              Want to know your exact overcharges?
            </h3>
            <p className="text-muted-foreground">
              Upload your reconciliation statement and lease for a full
              audit starting at $49.
            </p>
            <Button asChild>
              <a href="/cam-audit">Audit My CAM Charges</a>
            </Button>
          </div>
        </div>
      )}

      {/* FAQ Section */}
      <FAQSection items={CALCULATOR_FAQS} />
    </ToolPageLayout>
  );
}
```

### FAQ Items

```typescript
const CALCULATOR_FAQS = [
  {
    question: "How accurate is this CAM overcharge estimate?",
    answer:
      "This calculator uses industry-average error rates to produce a probability-weighted estimate. It is not a substitute for a full audit that reviews your actual reconciliation statement and lease. Think of it as a screening tool — if the estimate suggests material overcharges, a detailed audit is likely worth the cost.",
  },
  {
    question: "What error rates does the calculator use?",
    answer:
      "The calculator applies error probabilities derived from industry data: 15% chance of capital expense misclassification, 12% chance of gross-up error, 10% chance of admin fee overcharge, 18% chance of non-CAM expenses in the pool, 8% chance of cap violation, and 10% chance of pro-rata share error. Each category has a typical impact rate applied to your annual CAM amount.",
  },
  {
    question: "Why do I need to enter my email to see results?",
    answer:
      "We use your email to send you a PDF summary of your estimate and to notify you about CAM audit resources. We do not sell your email or send spam. You can unsubscribe at any time.",
  },
  {
    question: "What should I do if the calculator shows a large potential overcharge?",
    answer:
      "A large estimate means there is meaningful financial risk in your current CAM charges. The next step is a full CAM audit — upload your reconciliation statement and lease to CapVeri ($49-$199) for a detailed analysis of your specific charges against your lease terms.",
  },
  {
    question: "Does this calculator work for NNN leases?",
    answer:
      "Yes. CAM overcharges occur in any lease structure that passes through operating expenses — triple net (NNN), modified gross, and full-service gross leases with expense stops. The error categories (CapEx misclassification, gross-up, admin fees) apply to all of these.",
  },
];
```

### Server Component (page.tsx)

```tsx
import type { Metadata } from "next";
import { CamOverchargeCalculator } from "./CamOverchargeCalculatorClient";

export const metadata: Metadata = {
  title: "Free CAM Overcharge Calculator | CapVeri",
  description:
    "Estimate how much you might be overpaying on CAM charges. Enter your lease size and annual CAM amount to see a breakdown by error category.",
  alternates: {
    canonical: "https://tenant.capveri.com/tools/cam-overcharge-calculator",
  },
};

export default CamOverchargeCalculator;
```

## Test Cases
- Calculator page renders at `/tools/cam-overcharge-calculator`
- ToolPageLayout wrapper renders breadcrumb: Home > Tools > CAM Overcharge Calculator
- Form renders all input fields: leasedSF, annualCAM, buildingTotalSF, hasCap toggle, capRate (conditional)
- Cap rate field appears only when `hasCap` is toggled on
- Form validation rejects: leasedSF < 100, annualCAM <= 0, capRate > 0.25
- Form validation accepts: leasedSF = 10000, annualCAM = 25000, hasCap = true, capRate = 0.05
- Submitting valid inputs shows blurred results with CalculatorUnlockGate
- Completing the unlock gate (email submission) reveals full results
- Results table shows 6 error categories (5 if hasCap is false -- cap violation row omitted)
- Cap violation row shows $0 when `hasCap` is false
- Total overcharge range is the sum of all category low/high estimates
- Each category shows name, description, estimated range, and likelihood percentage
- Disclaimer text is visible below the results table
- CTA button below results links to `/cam-audit`
- WebApplication + FAQPage JSON-LD renders as 2 `<script type="application/ld+json">` tags
- FAQPage schema has 5 `mainEntity` entries
- Returning visitors (localStorage `capveri_calculator_unlocked:cam-overcharge-calculator === "true"`) see results immediately
- Calculator produces correct values: $25,000 annual CAM, no cap -> totalLow and totalHigh are within expected bounds
- `calculateOverchargeEstimates` is a pure function (deterministic, no side effects)

## Definition of Done
- [x] Calculator page renders at `/tools/cam-overcharge-calculator`
- [x] ToolPageLayout wrapper with breadcrumb navigation
- [x] Input form with validation (Zod + react-hook-form)
- [x] Conditional cap rate field based on `hasCap` toggle
- [x] `calculateOverchargeEstimates` function produces correct estimates
- [x] Results gated behind CalculatorUnlockGate (email required)
- [x] Blurred preview shown before unlock
- [x] Full results table with category breakdown after unlock
- [x] Disclaimer text visible below results
- [x] CTA to paid audit below results
- [x] WebApplication + FAQPage JSON-LD
- [x] FAQ section with 5 items
- [x] Unit tests for `calculateOverchargeEstimates` function
- [x] Component tests for form validation and result rendering
- [x] `npm run typecheck` passes with zero errors
