# Story T4.2: Tenant Landing Page

## Story Info
- **Epic**: T4 — marketing-tenant/ Scaffold
- **Estimated Hours**: 8
- **Dependencies**: T4.1
- **Status**: `pending`

## User Story
As a commercial tenant who suspects CAM overcharges, I want a clear landing page that explains the audit service, shows pricing, and lets me start the process so that I can decide whether to submit my reconciliation statement for review.

## Acceptance Criteria
- Landing page renders six sections in order: Hero, How It Works, What We Check, Pricing, FAQ, Footer
- Hero section displays stat hook ("40% of CAM reconciliations have material errors") and primary CTA ("Audit My CAM Charges")
- How It Works section shows 4 steps: Upload, Pay, Verify, Report
- What We Check section shows 8 audit categories with descriptions
- Pricing section renders 3 tiers from `config/tiers.ts` with the Detailed tier marked as popular
- FAQ section renders at least 6 tenant-focused questions
- JSON-LD structured data present: WebApplication, Service, FAQPage, Organization
- All sections responsive (mobile, tablet, desktop)
- No landlord-specific language anywhere on the page
- Primary CTA links to `/audit/start` (future wizard entry point)
- Lighthouse performance score >= 90

## Technical Specifications

### app/page.tsx (Server Component)

```typescript
import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { structuredDataSchemas } from "@/lib/structured-data";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { WhatWeCheckSection } from "@/components/landing/WhatWeCheckSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { FAQSection, TENANT_FAQS } from "@/components/landing/FAQSection";
import { TrustSignals } from "@/components/landing/TrustSignals";

export const metadata: Metadata = {
  title: { absolute: "CAM Audit for Commercial Tenants | CapVeri" },
  description:
    "Is your landlord overcharging you? 40% of CAM reconciliations have material errors. Upload your statement and get an independent audit starting at $49.",
  alternates: {
    canonical: "https://tenant.capveri.com/",
  },
};

export default function TenantLandingPage() {
  return (
    <>
      <JsonLd data={structuredDataSchemas.webApplication} />
      <JsonLd data={structuredDataSchemas.service} />
      <JsonLd data={structuredDataSchemas.faqPage(TENANT_FAQS)} />

      <HeroSection />
      <TrustSignals />
      <HowItWorksSection />
      <WhatWeCheckSection />
      <PricingSection />
      <FAQSection />
    </>
  );
}
```

### components/landing/HeroSection.tsx

```typescript
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-hero py-20 sm:py-28 lg:py-36">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          {/* Stat hook */}
          <div className="mb-6 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            40% of CAM reconciliations have material errors
          </div>

          <h1 className="text-fluid-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Is Your Landlord Overcharging You?
          </h1>

          <p className="mt-6 text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Upload your CAM reconciliation statement. Get an independent audit
            that checks pro-rata shares, gross-up math, cap enforcement, and 5
            more categories — starting at $49.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/audit/start"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 transition-all no-underline"
            >
              Audit My CAM Charges
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/sample-report"
              className="inline-flex items-center gap-2 rounded-md border border-border px-6 py-3 text-base font-medium text-foreground hover:bg-muted transition-colors no-underline"
            >
              See a Sample Report
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
```

### components/landing/HowItWorksSection.tsx

```typescript
import {
  Upload,
  CreditCard,
  ShieldCheck,
  FileText,
} from "lucide-react";

interface Step {
  icon: React.ElementType;
  number: number;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    icon: Upload,
    number: 1,
    title: "Upload",
    description:
      "Upload your CAM reconciliation statement (PDF or Excel). We accept statements from any property management system.",
  },
  {
    icon: CreditCard,
    number: 2,
    title: "Pay",
    description:
      "Choose your audit tier: Standard ($49), Detailed ($99), or Expert ($199). One-time payment, no subscription.",
  },
  {
    icon: ShieldCheck,
    number: 3,
    title: "Verify",
    description:
      "Our system extracts every line item and runs deterministic checks against your lease terms. No guesswork.",
  },
  {
    icon: FileText,
    number: 4,
    title: "Report",
    description:
      "Receive a detailed audit report with error classifications, dollar impacts, and lease clause references.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 sm:py-28">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-fluid-3xl font-bold tracking-tight">
            How It Works
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            From upload to audit report in 4 steps.
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div key={step.number} className="relative text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <step.icon className="h-6 w-6" />
              </div>
              <div className="mt-1 text-sm font-bold text-primary">
                Step {step.number}
              </div>
              <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

### components/landing/WhatWeCheckSection.tsx

```typescript
import {
  PieChart,
  TrendingUp,
  ShieldAlert,
  CalendarClock,
  Receipt,
  Ban,
  Building2,
  Landmark,
} from "lucide-react";

interface AuditCategory {
  icon: React.ElementType;
  title: string;
  description: string;
  tier: "standard" | "detailed";
}

const AUDIT_CATEGORIES: AuditCategory[] = [
  {
    icon: PieChart,
    title: "Pro-Rata Share",
    description:
      "Verifies your square footage against the lease and checks that your share percentage matches the total rentable area.",
    tier: "standard",
  },
  {
    icon: TrendingUp,
    title: "Gross-Up Calculation",
    description:
      "Checks whether operating expenses were properly grossed up for occupancy and that the calculation follows BOMA standards.",
    tier: "standard",
  },
  {
    icon: ShieldAlert,
    title: "Cap Enforcement",
    description:
      "Validates that expense caps in your lease were applied correctly, including controllable expense caps and CPI-based limits.",
    tier: "standard",
  },
  {
    icon: CalendarClock,
    title: "Base Year Reconciliation",
    description:
      "Confirms the base year amount matches your lease and that year-over-year escalations are calculated correctly.",
    tier: "standard",
  },
  {
    icon: Receipt,
    title: "Admin Fee Verification",
    description:
      "Checks that the management/admin fee percentage matches your lease terms and is applied to the correct expense base.",
    tier: "detailed",
  },
  {
    icon: Ban,
    title: "Exclusion Compliance",
    description:
      "Identifies expenses that should be excluded per your lease (capital improvements, landlord-specific costs, above-standard services).",
    tier: "detailed",
  },
  {
    icon: Building2,
    title: "Occupancy Adjustment",
    description:
      "Verifies that occupancy-sensitive expenses are adjusted correctly when the building is not fully occupied.",
    tier: "detailed",
  },
  {
    icon: Landmark,
    title: "Capital vs. Operating",
    description:
      "Flags expenses classified as operating that should be capitalized, including HVAC replacements, roof repairs, and structural work.",
    tier: "detailed",
  },
];

export function WhatWeCheckSection() {
  return (
    <section className="bg-muted/30 py-20 sm:py-28">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-fluid-3xl font-bold tracking-tight">
            What We Check
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            8 audit categories. Every line item verified against your lease.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIT_CATEGORIES.map((category) => (
            <div
              key={category.title}
              className="rounded-lg border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <category.icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold">{category.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {category.description}
              </p>
              {category.tier === "detailed" && (
                <span className="mt-3 inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  Detailed+
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

### components/landing/PricingSection.tsx

```typescript
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { TENANT_TIERS, type TenantTier } from "@/config/tiers";
import { cn } from "@/lib/utils";

function TierCard({ tier }: { tier: TenantTier }) {
  const isPopular = tier.popular === true;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border p-8 shadow-sm",
        isPopular
          ? "border-primary bg-card shadow-md ring-1 ring-primary"
          : "border-border bg-card",
      )}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
            Most Popular
          </span>
        </div>
      )}

      <div className="text-center">
        <h3 className="text-lg font-semibold">{tier.name}</h3>
        <div className="mt-4">
          <span className="text-4xl font-bold tracking-tight">
            ${tier.price}
          </span>
          <span className="text-sm text-muted-foreground"> / audit</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {tier.description}
        </p>
      </div>

      <div className="mt-8 space-y-6">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Categories Checked
          </h4>
          <ul className="mt-3 space-y-2">
            {tier.categories.map((category) => (
              <li key={category} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{category}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Included
          </h4>
          <ul className="mt-3 space-y-2">
            {tier.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-auto pt-8">
        <Link
          href={`/audit/start?tier=${tier.id}`}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition-all no-underline",
            isPopular
              ? "bg-primary text-primary-foreground shadow hover:bg-primary/90"
              : "border border-border text-foreground hover:bg-muted",
          )}
        >
          {tier.cta}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

export function PricingSection() {
  return (
    <section id="pricing" className="py-20 sm:py-28">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-fluid-3xl font-bold tracking-tight">
            One-Time Pricing. No Subscription.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Pay per audit. Choose the depth of analysis you need.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl gap-8 lg:grid-cols-3">
          {TENANT_TIERS.map((tier) => (
            <TierCard key={tier.id} tier={tier} />
          ))}
        </div>
      </div>
    </section>
  );
}
```

### components/landing/FAQSection.tsx

```typescript
"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export interface FAQ {
  question: string;
  answer: string;
}

export const TENANT_FAQS: FAQ[] = [
  {
    question: "What documents do I need to upload?",
    answer:
      "Your annual CAM reconciliation statement from your landlord (PDF or Excel). If you have your lease's operating expense section, uploading that improves accuracy for cap enforcement and exclusion checks.",
  },
  {
    question: "How long does the audit take?",
    answer:
      "Standard and Detailed audits are delivered within 2 business days. Expert audits with CPA review are delivered within 1 business day via priority processing.",
  },
  {
    question: "What if no errors are found?",
    answer:
      "You still receive a full audit report confirming your charges are accurate. Knowing your landlord billed correctly has value — and the report is yours to keep.",
  },
  {
    question: "Is this a legal opinion?",
    answer:
      "No. The audit report is a financial analysis, not legal advice. The Expert tier includes a CPA-signed letter and dispute-ready language you can share with your landlord or attorney.",
  },
  {
    question: "What types of leases do you support?",
    answer:
      "We support NNN (triple net), modified gross, and full-service gross leases for office, retail, and industrial properties. The audit adapts to your lease structure.",
  },
  {
    question: "How do you calculate errors?",
    answer:
      "All financial math is deterministic — no AI guessing. We extract line items from your statement, apply your lease terms, and compare the landlord's calculations against the correct figures. Every discrepancy is shown with the dollar impact.",
  },
  {
    question: "Can I use the report to dispute charges with my landlord?",
    answer:
      "Yes. The Detailed and Expert tiers include lease clause references for each finding. The Expert tier adds dispute-ready language drafted for landlord correspondence.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Your documents are encrypted in transit and at rest. We do not share your data with your landlord or any third party. Documents are deleted 90 days after report delivery.",
  },
];

export function FAQSection() {
  return (
    <section id="faq" className="bg-muted/30 py-20 sm:py-28">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-fluid-3xl font-bold tracking-tight">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="mx-auto mt-12 max-w-3xl">
          <Accordion type="single" collapsible className="w-full">
            {TENANT_FAQS.map((faq, index) => (
              <AccordionItem key={index} value={`faq-${index}`}>
                <AccordionTrigger className="text-left text-base font-medium">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
```

### components/landing/TrustSignals.tsx

```typescript
import { ShieldCheck, Lock, Calculator } from "lucide-react";

const SIGNALS = [
  {
    icon: Calculator,
    text: "Deterministic math — no AI guessing on financials",
  },
  {
    icon: ShieldCheck,
    text: "Every finding references your lease clauses",
  },
  {
    icon: Lock,
    text: "Bank-grade encryption. Data deleted after 90 days.",
  },
];

export function TrustSignals() {
  return (
    <section className="border-y border-border/50 bg-muted/20 py-6">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center gap-6 sm:flex-row sm:gap-12">
          {SIGNALS.map((signal) => (
            <div
              key={signal.text}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <signal.icon className="h-4 w-4 shrink-0 text-primary" />
              <span>{signal.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

### components/landing/index.ts

```typescript
export { HeroSection } from "./HeroSection";
export { HowItWorksSection } from "./HowItWorksSection";
export { WhatWeCheckSection } from "./WhatWeCheckSection";
export { PricingSection } from "./PricingSection";
export { FAQSection, TENANT_FAQS } from "./FAQSection";
export type { FAQ } from "./FAQSection";
export { TrustSignals } from "./TrustSignals";
```

## Test Cases
- Landing page renders without hydration errors
- Hero section displays "Is Your Landlord Overcharging You?" heading
- Hero section displays "40% of CAM reconciliations have material errors" stat badge
- Hero CTA links to `/audit/start`
- How It Works section renders 4 steps in correct order (Upload, Pay, Verify, Report)
- What We Check section renders all 8 categories
- What We Check categories with `tier: "detailed"` show "Detailed+" badge
- Pricing section renders 3 tier cards from `TENANT_TIERS`
- Detailed tier card shows "Most Popular" badge
- Each tier card CTA links to `/audit/start?tier={tierId}`
- FAQ section renders all 8 questions
- FAQ accordion expands/collapses on click
- Trust signals section renders 3 trust indicators
- Page includes WebApplication JSON-LD with 3 pricing offers
- Page includes Service JSON-LD with serviceType "CAM Audit"
- Page includes FAQPage JSON-LD with 8 questions
- No text contains "landlord-focused", "commercial landlords", or other landlord product copy
- All sections are responsive at 375px, 768px, and 1280px viewport widths
- Lighthouse performance score >= 90

## Definition of Done
- [ ] `app/page.tsx` renders all 6 sections (Hero, Trust Signals, How It Works, What We Check, Pricing, FAQ)
- [ ] `components/landing/HeroSection.tsx` implemented with stat hook and dual CTAs
- [ ] `components/landing/HowItWorksSection.tsx` implemented with 4 steps
- [ ] `components/landing/WhatWeCheckSection.tsx` implemented with 8 audit categories
- [ ] `components/landing/PricingSection.tsx` implemented with 3 tier cards from `config/tiers.ts`
- [ ] `components/landing/FAQSection.tsx` implemented with 8 tenant-focused FAQs
- [ ] `components/landing/TrustSignals.tsx` implemented with 3 trust indicators
- [ ] `components/landing/index.ts` barrel export created
- [ ] JSON-LD structured data: WebApplication, Service, FAQPage, Organization present in page source
- [ ] All components server-rendered except FAQSection (client for accordion interactivity)
- [ ] No landlord-specific copy leaks (verified by grep)
- [ ] `npm run build` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] Responsive layout verified at mobile, tablet, and desktop breakpoints
- [ ] Changes committed
