# Story T4.1: Scaffold marketing-tenant/ Project

## Story Info
- **Epic**: T4 — marketing-tenant/ Scaffold
- **Estimated Hours**: 6
- **Dependencies**: None
- **Status**: `pending`

## User Story
As a developer, I want a standalone `marketing-tenant/` Next.js project forked from `marketing/` so that I can build the tenant CAM audit marketing site without polluting the landlord marketing codebase.

## Acceptance Criteria
- `marketing-tenant/` directory exists at project root with its own `package.json`
- Shared infrastructure copied and functional: `components/ui/`, `components/content/`, `components/mdx/`, `lib/structured-data.ts`, `lib/content/mdx.ts`, `lib/citations/`, `generated/tokens.css`
- Tailwind config, PostCSS config, tsconfig, and Vitest config copied and adapted
- All landlord-specific modules removed: `components/landing/`, `app/checkout/`, `app/vs/`, `app/tools/`, `config/plans.ts`, `data/faq-data.tsx`, `data/pricing-faqs.ts`
- `config/tiers.ts` created with tenant per-audit tier definitions
- Placeholder `app/page.tsx` renders without errors
- `npm run dev` starts the dev server on a different port than `marketing/`
- `npm run build` completes with zero errors
- `npm run typecheck` passes with zero errors
- `npm test` passes (shared utility tests still green)

## Technical Specifications

### Directory Structure

```
marketing-tenant/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── robots.ts
│   │   └── sitemap.ts
│   ├── components/
│   │   ├── ui/              # Copied from marketing/
│   │   ├── content/         # Copied from marketing/
│   │   ├── mdx/             # Copied from marketing/
│   │   ├── landing/         # New: tenant landing sections (T4.2)
│   │   ├── JsonLd.tsx       # Copied from marketing/
│   │   ├── Logo.tsx         # Copied from marketing/
│   │   ├── ThemeProvider.tsx # Copied from marketing/
│   │   ├── ThemeToggle.tsx  # Copied from marketing/
│   │   ├── MarketingNav.tsx # New: tenant version (T4.3)
│   │   └── MarketingFooter.tsx # New: tenant version (T4.3)
│   ├── config/
│   │   └── tiers.ts         # New: tenant tier definitions
│   ├── generated/
│   │   └── tokens.css       # Copied from marketing/
│   ├── lib/
│   │   ├── structured-data.ts # Adapted for tenant site
│   │   ├── content/
│   │   │   └── mdx.ts       # Copied from marketing/
│   │   ├── citations/       # Copied from marketing/
│   │   └── utils.ts         # Copied from marketing/
│   └── test/                # Copied test utilities
├── tailwind.config.ts       # Copied from marketing/
├── postcss.config.mjs       # Copied from marketing/
├── tsconfig.json            # Copied and adapted
├── next.config.ts           # Adapted (different port, site URL)
├── vitest.config.ts         # Copied from marketing/
└── package.json             # Forked, renamed
```

### config/tiers.ts

```typescript
export type TenantTierId = "standard" | "detailed" | "expert";

export interface TenantTier {
  id: TenantTierId;
  name: string;
  price: number; // One-time price in USD
  description: string;
  popular?: boolean;
  categories: string[];
  features: string[];
  cta: string;
}

export const TENANT_TIERS: TenantTier[] = [
  {
    id: "standard",
    name: "Standard",
    price: 49,
    description: "Core CAM checks that catch the most common overcharges.",
    categories: [
      "Pro-rata share verification",
      "Gross-up calculation audit",
      "Cap enforcement check",
      "Base year reconciliation",
    ],
    features: [
      "PDF audit report",
      "Line-item error breakdown",
      "Results in 2 business days",
    ],
    cta: "Audit My CAM Charges",
  },
  {
    id: "detailed",
    name: "Detailed",
    price: 99,
    popular: true,
    description: "Full-spectrum audit covering all 8 CAM charge categories.",
    categories: [
      "Pro-rata share verification",
      "Gross-up calculation audit",
      "Cap enforcement check",
      "Base year reconciliation",
      "Admin fee verification",
      "Exclusion compliance",
      "Occupancy adjustment audit",
      "Capital vs. operating classification",
    ],
    features: [
      "PDF audit report",
      "Line-item error breakdown",
      "Lease clause references",
      "Results in 2 business days",
      "Year-over-year comparison",
    ],
    cta: "Audit My CAM Charges",
  },
  {
    id: "expert",
    name: "Expert",
    price: 199,
    description:
      "CPA-grade audit with dispute-ready documentation and lease citations.",
    categories: [
      "Pro-rata share verification",
      "Gross-up calculation audit",
      "Cap enforcement check",
      "Base year reconciliation",
      "Admin fee verification",
      "Exclusion compliance",
      "Occupancy adjustment audit",
      "Capital vs. operating classification",
    ],
    features: [
      "PDF audit report",
      "Line-item error breakdown",
      "Lease clause references",
      "Results in 2 business days",
      "Year-over-year comparison",
      "CPA-signed audit letter",
      "Dispute-ready language",
      "Priority processing (1 business day)",
    ],
    cta: "Audit My CAM Charges",
  },
];

export function getTierById(id: TenantTierId): TenantTier | undefined {
  return TENANT_TIERS.find((tier) => tier.id === id);
}

export function getTierPrice(id: TenantTierId): number {
  const tier = getTierById(id);
  if (!tier) {
    throw new Error(`Unknown tier: ${id}`);
  }
  return tier.price;
}
```

### lib/structured-data.ts (tenant-adapted)

```typescript
const SITE_URL = "https://tenant.capveri.com";

export const structuredDataSchemas = {
  organization: {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://www.capveri.com/#organization",
    name: "CapVeri",
    url: "https://www.capveri.com",
    logo: "https://www.capveri.com/icons/logo.svg",
    description:
      "CAM audit software for commercial real estate. Landlord reconciliation platform and tenant audit service.",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "angel.campa@capveri.com",
    },
  },

  webApplication: {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "CapVeri Tenant Audit",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "CAM Audit Service",
    operatingSystem: "Web",
    description:
      "Upload your CAM reconciliation statement and get an independent audit report. Checks pro-rata shares, gross-up calculations, cap enforcement, and 5 more categories.",
    url: SITE_URL,
    offers: [
      {
        "@type": "Offer",
        name: "Standard Audit",
        price: "49",
        priceCurrency: "USD",
      },
      {
        "@type": "Offer",
        name: "Detailed Audit",
        price: "99",
        priceCurrency: "USD",
      },
      {
        "@type": "Offer",
        name: "Expert Audit",
        price: "199",
        priceCurrency: "USD",
      },
    ],
  },

  service: {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "CAM Charge Audit",
    description:
      "Independent audit of Common Area Maintenance (CAM) reconciliation statements for commercial tenants. Identifies overcharges across 8 categories including pro-rata share, gross-up, caps, and base year.",
    provider: {
      "@type": "Organization",
      name: "CapVeri",
      url: "https://www.capveri.com",
    },
    serviceType: "CAM Audit",
    areaServed: {
      "@type": "Country",
      name: "United States",
    },
  },

  faqPage: (faqs: Array<{ question: string; answer: string }>) => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  }),

  website: {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "CapVeri Tenant Audit",
    url: SITE_URL,
  },
};
```

### app/layout.tsx

```typescript
import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { JsonLd } from "@/components/JsonLd";
import { ThemeProvider } from "@/components/ThemeProvider";
import { structuredDataSchemas } from "@/lib/structured-data";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://tenant.capveri.com"),
  title: {
    default: "CAM Audit for Commercial Tenants | CapVeri",
    template: "%s | CapVeri Tenant Audit",
  },
  description:
    "Is your landlord overcharging you? Upload your CAM reconciliation statement and get an independent audit. 40% of CAM statements have material errors.",
  openGraph: {
    siteName: "CapVeri Tenant Audit",
    images: ["/og-image-tenant.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <JsonLd data={structuredDataSchemas.organization} />
        <JsonLd data={structuredDataSchemas.website} />
      </head>
      <body>
        <ThemeProvider>
          <MarketingNav />
          <main>{children}</main>
          <MarketingFooter />
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### app/page.tsx (placeholder for T4.1, replaced in T4.2)

```typescript
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "CAM Audit for Commercial Tenants | CapVeri" },
  description:
    "Is your landlord overcharging you? Upload your CAM reconciliation statement and get an independent audit report.",
  alternates: {
    canonical: "https://tenant.capveri.com/",
  },
};

export default function TenantLandingPage() {
  return (
    <div className="container mx-auto px-4 py-24 text-center">
      <h1 className="text-fluid-4xl font-bold tracking-tight">
        Is Your Landlord Overcharging You?
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Tenant audit landing page — sections coming in T4.2.
      </p>
    </div>
  );
}
```

### next.config.ts

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizeCss: true,
  },
};

export default nextConfig;
```

### package.json (key fields)

```json
{
  "name": "marketing-tenant",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
    "lint": "next lint",
    "lint:fix": "next lint --fix"
  }
}
```

## Test Cases
- `npm run build` exits 0 with no type errors
- `npm run typecheck` exits 0
- `npm test` passes all copied utility tests
- `getTierById("standard")` returns the Standard tier with price 49
- `getTierById("detailed")` returns the Detailed tier with `popular: true`
- `getTierPrice("expert")` returns 199
- `getTierPrice("invalid" as TenantTierId)` throws an error
- Dev server starts on port 3001 without conflicting with `marketing/` on port 3000
- No imports reference stripped modules (`components/landing/`, `config/plans.ts`, etc.)
- `generated/tokens.css` is identical to `marketing/src/generated/tokens.css`

## Definition of Done
- [ ] `marketing-tenant/` directory created at project root
- [ ] Shared components (`ui/`, `content/`, `mdx/`, `JsonLd`, `Logo`, `ThemeProvider`, `ThemeToggle`) copied and functional
- [ ] Shared lib (`structured-data.ts`, `content/mdx.ts`, `citations/`, `utils.ts`) copied and adapted
- [ ] Design tokens (`generated/tokens.css`) copied
- [ ] Tailwind, PostCSS, tsconfig, Vitest configs copied and adapted
- [ ] Landlord modules stripped (no `components/landing/`, `app/checkout/`, `app/vs/`, `app/tools/`, `config/plans.ts`, `data/faq-data.tsx`, `data/pricing-faqs.ts`)
- [ ] `config/tiers.ts` created with Standard ($49), Detailed ($99), Expert ($199) tier definitions
- [ ] `lib/structured-data.ts` adapted with tenant site URL and tenant-specific schemas
- [ ] `app/layout.tsx` created with tenant metadata, JSON-LD, nav, and footer
- [ ] `app/page.tsx` placeholder renders without errors
- [ ] `npm run build` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm test` passes
- [ ] Unit tests written for `config/tiers.ts` functions
- [ ] Changes committed
