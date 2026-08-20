# Story T6.1: Schema Markup Implementation

## Story Info
- **Epic**: T6 -- Content & SEO
- **Estimated Hours**: 6
- **Dependencies**: T4.1 (scaffold), T4.2 (landing page)
- **Status**: `pending`

## User Story
As a search engine crawler (or AI assistant), I want structured data on every page so that I can accurately represent CapVeri's tenant audit product in search results, rich snippets, and AI-generated answers.

## Acceptance Criteria
- Landing page includes WebApplication, Service, FAQPage, and Organization JSON-LD
- Pricing page includes Product (one per tier) and FAQPage JSON-LD
- How It Works page includes HowTo and FAQPage JSON-LD
- Sample Report page includes CreativeWork and FAQPage JSON-LD
- Blog post layout includes Article, FAQPage, and BreadcrumbList JSON-LD
- All JSON-LD validates against schema.org (no errors in Google Rich Results Test)
- Shared `structuredData` helper functions exist in `lib/structured-data.ts` for reuse
- `robots.txt` allows all AI bots (Googlebot, GPTBot, ClaudeBot, PerplexityBot)

## Technical Specifications

### Shared Schema Helpers (`lib/structured-data.ts`)

Add tenant-specific schema builder functions alongside existing helpers:

```typescript
// Organization schema (shared with landlord site)
export function buildOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "CapVeri",
    url: "https://www.capveri.com",
    logo: "https://www.capveri.com/logo.png",
    sameAs: ["https://www.linkedin.com/company/capveri"],
  };
}

// WebApplication schema for tenant audit product
export function buildTenantAuditWebAppSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "CapVeri Tenant CAM Audit",
    applicationCategory: "FinanceApplication",
    description:
      "Upload your CAM reconciliation statement and lease. Get an independent audit report identifying overcharges, calculation errors, and non-compliant charges.",
    url: "https://tenant.capveri.com",
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "49",
      highPrice: "199",
      priceCurrency: "USD",
      offerCount: 3,
    },
    operatingSystem: "Any (web-based)",
  };
}

// Service schema for tenant audit
export function buildTenantAuditServiceSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "CAM Reconciliation Audit for Tenants",
    provider: buildOrganizationSchema(),
    description:
      "Automated CAM reconciliation audit that checks pro-rata share, gross-up, cap enforcement, admin fees, exclusions, and capital vs. operating classification.",
    serviceType: "Financial Audit",
    areaServed: { "@type": "Country", name: "US" },
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "49",
      highPrice: "199",
      priceCurrency: "USD",
    },
  };
}

// FAQPage schema from FAQ items array
export function buildFAQPageSchema(
  faqs: Array<{ question: string; answer: string }>
) {
  return {
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
  };
}

// Product schema for a pricing tier
export function buildTierProductSchema(tier: {
  name: string;
  price: number;
  description: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `CapVeri ${tier.name} Audit`,
    description: tier.description,
    offers: {
      "@type": "Offer",
      price: tier.price.toString(),
      priceCurrency: "USD",
      url: tier.url,
      availability: "https://schema.org/InStock",
    },
  };
}

// Article schema for blog posts
export function buildArticleSchema(post: {
  title: string;
  description: string;
  datePublished: string;
  dateModified: string;
  author: string;
  url: string;
  imageUrl?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.datePublished,
    dateModified: post.dateModified,
    author: { "@type": "Person", name: post.author },
    publisher: buildOrganizationSchema(),
    url: post.url,
    ...(post.imageUrl && {
      image: { "@type": "ImageObject", url: post.imageUrl },
    }),
  };
}

// BreadcrumbList schema
export function buildBreadcrumbSchema(
  items: Array<{ name: string; url: string }>
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// HowTo schema
export function buildHowToSchema(data: {
  name: string;
  description: string;
  totalTime: string;
  steps: Array<{ name: string; text: string }>;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: data.name,
    description: data.description,
    totalTime: data.totalTime,
    step: data.steps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

// CreativeWork schema for sample report
export function buildCreativeWorkSchema(data: {
  name: string;
  description: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: data.name,
    description: data.description,
    url: data.url,
    creator: buildOrganizationSchema(),
  };
}
```

### Landing Page JSON-LD (4 schemas)

```tsx
// app/page.tsx -- add to landing page
import { JsonLd } from "@/components/JsonLd";

const LANDING_SCHEMAS = [
  buildTenantAuditWebAppSchema(),
  buildTenantAuditServiceSchema(),
  buildFAQPageSchema(LANDING_FAQS),
  buildOrganizationSchema(),
];

// In component body:
{LANDING_SCHEMAS.map((schema, i) => (
  <JsonLd key={i} data={schema} />
))}
```

### Pricing Page JSON-LD

```tsx
const PRICING_SCHEMAS = [
  buildTierProductSchema({
    name: "Standard",
    price: 49,
    description: "Pro-rata, gross-up, cap enforcement, base year checks",
    url: "https://tenant.capveri.com/pricing#standard",
  }),
  buildTierProductSchema({
    name: "Detailed",
    price: 99,
    description: "Standard + admin fee, exclusions, occupancy, capital vs. operating",
    url: "https://tenant.capveri.com/pricing#detailed",
  }),
  buildTierProductSchema({
    name: "Expert",
    price: 199,
    description: "Detailed + CPA-signed letter, lease clause citations, dispute language",
    url: "https://tenant.capveri.com/pricing#expert",
  }),
  buildFAQPageSchema(PRICING_FAQS),
];
```

### Blog Post Layout JSON-LD

```tsx
// app/blog/[slug]/page.tsx
const BLOG_SCHEMAS = [
  buildArticleSchema({
    title: post.title,
    description: post.description,
    datePublished: post.datePublished,
    dateModified: post.dateModified,
    author: post.author,
    url: `https://tenant.capveri.com/blog/${post.slug}`,
    imageUrl: post.ogImage,
  }),
  buildFAQPageSchema(post.faq),
  buildBreadcrumbSchema([
    { name: "Home", url: "https://tenant.capveri.com" },
    { name: "Blog", url: "https://tenant.capveri.com/blog" },
    { name: post.title, url: `https://tenant.capveri.com/blog/${post.slug}` },
  ]),
];
```

### robots.txt

```txt
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

Sitemap: https://tenant.capveri.com/sitemap.xml
```

## Test Cases
- Landing page renders 4 `<script type="application/ld+json">` tags
- Pricing page renders 4 `<script type="application/ld+json">` tags (3 Product + 1 FAQPage)
- Blog post layout renders 3 `<script type="application/ld+json">` tags (Article + FAQPage + BreadcrumbList)
- Each JSON-LD block parses as valid JSON
- FAQPage schema `mainEntity` array length matches the FAQ items count
- Product schema `offers.price` matches tier config values
- BreadcrumbList `itemListElement` positions are sequential (1, 2, 3)
- Article schema `datePublished` is a valid ISO 8601 date string
- `robots.txt` serves at `/robots.txt` and contains `Allow: /` for GPTBot, ClaudeBot, PerplexityBot
- Schema helper functions are unit-tested with snapshot assertions

## Definition of Done
- [ ] `lib/structured-data.ts` exports all schema builder functions
- [ ] Landing page includes WebApplication + Service + FAQPage + Organization JSON-LD
- [ ] Pricing page includes Product (x3) + FAQPage JSON-LD
- [ ] How It Works page includes HowTo + FAQPage JSON-LD
- [ ] Sample Report page includes CreativeWork + FAQPage JSON-LD
- [ ] Blog layout includes Article + FAQPage + BreadcrumbList JSON-LD
- [ ] `robots.txt` allows all AI bots
- [ ] All schemas validate in Google Rich Results Test (manual check)
- [ ] Unit tests pass for all schema builder functions
- [ ] `npm run typecheck` passes with zero errors
