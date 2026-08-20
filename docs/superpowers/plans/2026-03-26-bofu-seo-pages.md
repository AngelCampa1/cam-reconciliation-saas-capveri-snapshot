# BOFU SEO Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create 7 new BOFU page types and optimize 3 existing pages to capture commercial/transactional intent keywords for capveri.com.

**Architecture:** All new pages follow existing Next.js App Router patterns. pSEO templates use JSON data files in `marketing/data/`, loaded via `marketing/src/lib/content/pseo-data.ts` with types in `pseo-types.ts`. Static pages use inline metadata. All pages use `JsonLd` for structured data, `buildTrialLink` for CTAs, Shadcn/UI components, and Tailwind styling.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Shadcn/UI, JSON data files

**Key reference files:**
- pSEO types: `marketing/src/lib/content/pseo-types.ts`
- pSEO data loaders: `marketing/src/lib/content/pseo-data.ts`
- CTA builder: `marketing/src/lib/auditLink.ts` (`buildTrialLink`)
- JsonLd component: `marketing/src/components/JsonLd.tsx`
- RelatedContent component: `marketing/src/components/content/RelatedContent.tsx`
- Reference pSEO page: `marketing/src/app/vs/[slug]/page.tsx` (435 lines)
- Reference static BOFU page: `marketing/src/app/lease-abstraction/page.tsx` (671 lines)
- Reference data file: `marketing/data/comparisons.json` (ComparisonData type)

---

## Task 1: `/cam-reconciliation-software` BOFU Landing Page

**Files:**
- Create: `marketing/src/app/cam-reconciliation-software/page.tsx`

This is a static BOFU product page (not pSEO). Target keyword: "cam reconciliation software" (50 SV, $42 CPC, commercial intent). Model after `/lease-abstraction/page.tsx` structure.

- [ ] **Step 1: Create the page file**

Create `marketing/src/app/cam-reconciliation-software/page.tsx` with:
- Metadata targeting "CAM Reconciliation Software" with canonical `https://www.capveri.com/cam-reconciliation-software`
- SoftwareApplication JSON-LD schema, FAQ schema, BreadcrumbList schema
- H1: "CAM Reconciliation Software That Finds Billing Errors in Minutes"
- Sections: hero with trial CTA, problem statement (manual reconciliation pain), feature grid (6 features: gross-up automation, cap enforcement, pro-rata validation, CapEx detection, audit trail, BOMA 2024), comparison table (CapVeri vs Excel vs ERP modules vs Outsourced), ROI callout (avg $5.9K-$35.3K recovery per building), integration section (works with Yardi/MRI/any CSV), FAQ section (6-8 questions targeting long-tail queries like "what is cam reconciliation software", "how does cam reconciliation software work", "best cam reconciliation software for landlords"), final CTA
- Use `buildTrialLink({ content: "cam-reconciliation-software-hero" })` for primary CTA
- Use `buildTrialLink({ content: "cam-reconciliation-software-bottom" })` for bottom CTA
- Page should be ~500-700 lines following the `/lease-abstraction/page.tsx` pattern

- [ ] **Step 2: Verify typecheck passes**

Run: `cd marketing && npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add marketing/src/app/cam-reconciliation-software/page.tsx
git commit -m "feat(marketing): add /cam-reconciliation-software BOFU landing page"
```

---

## Task 2: Alternatives pSEO Template + Data

**Files:**
- Create: `marketing/data/alternatives.json`
- Modify: `marketing/src/lib/content/pseo-types.ts` (add AlternativeData type)
- Modify: `marketing/src/lib/content/pseo-data.ts` (add getAllAlternatives/getAlternative)
- Create: `marketing/src/app/alternatives/page.tsx` (index page)
- Create: `marketing/src/app/alternatives/[slug]/page.tsx` (detail page)

Target: "[X] alternative for CAM reconciliation" queries. Different from /vs pages: these list multiple alternatives, positioning CapVeri as the recommended option among several.

- [ ] **Step 1: Add AlternativeData type to pseo-types.ts**

Add to the end of `marketing/src/lib/content/pseo-types.ts`:

```typescript
// -- Competitor Alternative Pages (/alternatives/[slug]) --

export interface AlternativeOption {
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  bestFor: string;
  pricing: string;
}

export interface AlternativeData {
  slug: string;
  competitorName: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  datePublished: string;
  dateModified: string;
  introParagraphs: string[];
  whySwitch: { title: string; description: string }[];
  alternatives: AlternativeOption[];
  comparisonTable: {
    columns: { key: string; label: string }[];
    rows: Record<string, string>[];
  };
  capveriPitch: { heading: string; paragraphs: string[] };
  faqs: { question: string; answer: string }[];
  relatedComparisons: { slug: string; title: string }[];
  relatedResources: { href: string; title: string }[];
  ctaHeading: string;
  ctaDescription: string;
}
```

- [ ] **Step 2: Add data loaders to pseo-data.ts**

Add to the end of `marketing/src/lib/content/pseo-data.ts`:

```typescript
// -- Alternatives --

interface AlternativesFile {
  lastUpdated: string;
  alternatives: AlternativeData[];
}

export async function getAllAlternatives(): Promise<AlternativeData[]> {
  try {
    const data = await loadJsonData<AlternativesFile>("alternatives.json");
    return data.alternatives;
  } catch {
    return [];
  }
}

export async function getAlternative(
  slug: string,
): Promise<AlternativeData | null> {
  const alternatives = await getAllAlternatives();
  return alternatives.find((a) => a.slug === slug) ?? null;
}
```

Add the import of `AlternativeData` to the existing import block at the top of pseo-data.ts.

- [ ] **Step 3: Create alternatives.json data file**

Create `marketing/data/alternatives.json` with 6 entries: `yardi`, `mri`, `excel`, `outsourced-cam`, `appfolio`, `manual-reconciliation`. Each entry follows the `AlternativeData` interface.

For each entry:
- `metaTitle`: "Best [Competitor] Alternatives for CAM Reconciliation (2026)"
- `headline`: "[Competitor] Not Working for CAM? Here Are Your Best Alternatives"
- `alternatives` array: 4-5 options including CapVeri (listed first), other competitors, and the incumbent
- `comparisonTable`: Feature matrix comparing all alternatives on key dimensions (gross-up, caps, setup time, cost, audit trail)
- `capveriPitch`: Why CapVeri is the recommended alternative
- `faqs`: 4-5 questions targeting "[competitor] alternative" long-tail queries
- `ctaHeading` and `ctaDescription`: Competitor-specific CTA copy

- [ ] **Step 4: Create /alternatives/[slug]/page.tsx**

Create `marketing/src/app/alternatives/[slug]/page.tsx` following the exact same pattern as `/vs/[slug]/page.tsx`:
- `export const dynamicParams = false;`
- `generateStaticParams()` using `getAllAlternatives()`
- `generateMetadata()` using `getAlternative(slug)`
- Page component renders: breadcrumb schema + FAQ schema + article schema, back link to /alternatives, H1 from data, author byline, intro paragraphs, "Why switch" section (card grid of pain points), alternatives list (each as a card with pros/cons/bestFor/pricing), comparison table, CapVeri pitch section, FAQ accordion, related content, CTA section with `buildTrialLink`
- Use `params: Promise<{ slug: string }>` pattern (Next.js 15+ async params)

- [ ] **Step 5: Create /alternatives/page.tsx index**

Create `marketing/src/app/alternatives/page.tsx`:
- Static metadata targeting "CAM reconciliation software alternatives"
- Grid of cards linking to each alternative page
- Brief intro text
- BreadcrumbList schema

- [ ] **Step 6: Verify typecheck passes**

Run: `cd marketing && npm run typecheck`

- [ ] **Step 7: Commit**

```bash
git add marketing/data/alternatives.json marketing/src/lib/content/pseo-types.ts marketing/src/lib/content/pseo-data.ts marketing/src/app/alternatives/
git commit -m "feat(marketing): add /alternatives/[slug] pSEO template with 6 competitor alternative pages"
```

---

## Task 3: `/best/cam-reconciliation-software` Comparison Hub

**Files:**
- Create: `marketing/src/app/best/cam-reconciliation-software/page.tsx`

Static BOFU page (not pSEO). Target: "best cam reconciliation software 2026".

- [ ] **Step 1: Create the page**

Create `marketing/src/app/best/cam-reconciliation-software/page.tsx` with:
- Metadata: "Best CAM Reconciliation Software (2026): Ranked & Compared"
- Canonical: `https://www.capveri.com/best/cam-reconciliation-software`
- ItemList JSON-LD schema listing 8-10 software options, FAQ schema, BreadcrumbList
- H1: "Best CAM Reconciliation Software (2026)"
- Sections: intro (what to look for in CAM reconciliation software), ranked list of 8-10 options (CapVeri #1, Yardi Voyager, MRI Software, RealPage, AppFolio, Buildium, Sage Intacct, Excel/manual, outsourced services), each with name/description/pros/cons/pricing/bestFor, feature comparison matrix table, selection criteria guide, FAQ section, CTA
- Each software entry links to the corresponding `/vs/[slug]` page where one exists
- Use `buildTrialLink({ content: "best-cam-software-hero" })` for CTAs

- [ ] **Step 2: Verify typecheck passes**

Run: `cd marketing && npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add marketing/src/app/best/
git commit -m "feat(marketing): add /best/cam-reconciliation-software comparison hub page"
```

---

## Task 4: Optimize `/lease-abstraction` Page

**Files:**
- Modify: `marketing/src/app/lease-abstraction/page.tsx`

Target: "lease abstraction software" (210 SV, $60 CPC). Page exists but needs BOFU optimization.

- [ ] **Step 1: Read the current page**

Read `marketing/src/app/lease-abstraction/page.tsx` in full to understand current content.

- [ ] **Step 2: Add BOFU elements**

Edit `marketing/src/app/lease-abstraction/page.tsx` to add:
- SoftwareApplication JSON-LD schema (if not present)
- A comparison table section comparing CapVeri lease abstraction vs Visual Lease vs LeaseQuery vs manual abstraction (key dimensions: AI-powered extraction, accuracy, cost, setup time, integration with CAM reconciliation)
- Social proof / metrics callout (e.g., "Extracts key lease terms in minutes, not hours")
- Stronger CTA with `buildTrialLink` (if CTA currently uses a different pattern)
- FAQ section targeting "ai lease abstraction software", "lease abstraction automation" (if not present)
- Ensure meta description includes "lease abstraction software" prominently

- [ ] **Step 3: Verify typecheck passes**

Run: `cd marketing && npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add marketing/src/app/lease-abstraction/page.tsx
git commit -m "feat(marketing): optimize /lease-abstraction page for BOFU conversion"
```

---

## Task 5: Solutions pSEO Template + Data

**Files:**
- Create: `marketing/data/solutions.json`
- Modify: `marketing/src/lib/content/pseo-types.ts` (add SolutionData type)
- Modify: `marketing/src/lib/content/pseo-data.ts` (add getAllSolutions/getSolution)
- Create: `marketing/src/app/solutions/page.tsx`
- Create: `marketing/src/app/solutions/[slug]/page.tsx`

Target: Pain-point-specific solution queries from BOFU buyers.

- [ ] **Step 1: Add SolutionData type to pseo-types.ts**

Add to `marketing/src/lib/content/pseo-types.ts`:

```typescript
// -- Solution / Use-Case Pages (/solutions/[slug]) --

export interface SolutionData {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  datePublished: string;
  dateModified: string;
  problem: { heading: string; paragraphs: string[] };
  solution: { heading: string; paragraphs: string[] };
  features: { icon: string; title: string; description: string }[];
  metrics: { value: string; label: string }[];
  howItWorks: { step: number; title: string; description: string }[];
  faqs: { question: string; answer: string }[];
  relatedSolutions: { slug: string; title: string }[];
  relatedResources: { href: string; title: string }[];
  relatedTools: string[];
  ctaHeading: string;
  ctaDescription: string;
}
```

- [ ] **Step 2: Add data loaders to pseo-data.ts**

Add to `marketing/src/lib/content/pseo-data.ts`:

```typescript
// -- Solutions --

interface SolutionsFile {
  lastUpdated: string;
  solutions: SolutionData[];
}

export async function getAllSolutions(): Promise<SolutionData[]> {
  try {
    const data = await loadJsonData<SolutionsFile>("solutions.json");
    return data.solutions;
  } catch {
    return [];
  }
}

export async function getSolution(
  slug: string,
): Promise<SolutionData | null> {
  const solutions = await getAllSolutions();
  return solutions.find((s) => s.slug === slug) ?? null;
}
```

Add the import of `SolutionData` to the existing import block.

- [ ] **Step 3: Create solutions.json data file**

Create `marketing/data/solutions.json` with 5 entries:
- `year-end-cam-reconciliation`: "Automate Year-End CAM Reconciliation"
- `multi-property-cam`: "CAM Reconciliation Across Your Portfolio"
- `acquisition-due-diligence`: "CAM Due Diligence for Property Acquisitions"
- `yardi-cam-errors`: "Find & Fix CAM Errors in Yardi Exports"
- `cam-recovery-optimization`: "Maximize Your CAM Recovery Ratio"

Each entry follows the `SolutionData` interface with full content (no placeholders).

- [ ] **Step 4: Create /solutions/[slug]/page.tsx**

Create `marketing/src/app/solutions/[slug]/page.tsx`:
- `export const dynamicParams = false;`
- `generateStaticParams()` using `getAllSolutions()`
- `generateMetadata()` using `getSolution(slug)`
- Page layout: BreadcrumbList + FAQ + Article schemas, hero section with problem statement and primary CTA, problem detail section, solution overview, feature cards grid, metrics callout strip, "How it works" numbered steps, FAQ section, related solutions and resources, bottom CTA
- Use `params: Promise<{ slug: string }>` pattern

- [ ] **Step 5: Create /solutions/page.tsx index**

Create `marketing/src/app/solutions/page.tsx`:
- Static metadata targeting "CAM reconciliation solutions"
- Card grid of all solutions with descriptions
- BreadcrumbList schema

- [ ] **Step 6: Verify typecheck passes**

Run: `cd marketing && npm run typecheck`

- [ ] **Step 7: Commit**

```bash
git add marketing/data/solutions.json marketing/src/lib/content/pseo-types.ts marketing/src/lib/content/pseo-data.ts marketing/src/app/solutions/
git commit -m "feat(marketing): add /solutions/[slug] pSEO template with 5 use-case pages"
```

---

## Task 6: Integrations pSEO Template + Data

**Files:**
- Create: `marketing/data/integrations.json`
- Modify: `marketing/src/lib/content/pseo-types.ts` (add IntegrationData type)
- Modify: `marketing/src/lib/content/pseo-data.ts` (add getAllIntegrations/getIntegration)
- Create: `marketing/src/app/integrations/page.tsx`
- Create: `marketing/src/app/integrations/[slug]/page.tsx`

Target: "[software] + CAM reconciliation" queries. BOFU product pages (not educational like /resources/software/).

- [ ] **Step 1: Add IntegrationData type to pseo-types.ts**

Add to `marketing/src/lib/content/pseo-types.ts`:

```typescript
// -- Integration Partner Pages (/integrations/[slug]) --

export interface IntegrationStep {
  step: number;
  title: string;
  description: string;
}

export interface IntegrationData {
  slug: string;
  softwareName: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  datePublished: string;
  dateModified: string;
  introParagraphs: string[];
  exportSteps: IntegrationStep[];
  whatCapVeriFinds: { title: string; description: string }[];
  timeSavings: { before: string; after: string; metric: string };
  faqs: { question: string; answer: string }[];
  relatedIntegrations: { slug: string; title: string }[];
  relatedResources: { href: string; title: string }[];
  ctaHeading: string;
  ctaDescription: string;
}
```

- [ ] **Step 2: Add data loaders to pseo-data.ts**

Add to `marketing/src/lib/content/pseo-data.ts`:

```typescript
// -- Integrations --

interface IntegrationsFile {
  lastUpdated: string;
  integrations: IntegrationData[];
}

export async function getAllIntegrations(): Promise<IntegrationData[]> {
  try {
    const data = await loadJsonData<IntegrationsFile>("integrations.json");
    return data.integrations;
  } catch {
    return [];
  }
}

export async function getIntegration(
  slug: string,
): Promise<IntegrationData | null> {
  const integrations = await getAllIntegrations();
  return integrations.find((i) => i.slug === slug) ?? null;
}
```

Add the import of `IntegrationData` to the existing import block.

- [ ] **Step 3: Create integrations.json data file**

Create `marketing/data/integrations.json` with 4 entries:
- `yardi`: "CapVeri + Yardi: Automated CAM Reconciliation Verification"
- `mri`: "CapVeri + MRI: Find CAM Billing Errors Faster"
- `realpage`: "CapVeri + RealPage: Independent CAM Verification"
- `appfolio`: "CapVeri + AppFolio: CAM Reconciliation for Growing Portfolios"

Each entry: full BOFU content with export workflow steps, what CapVeri finds, time savings comparison, FAQs, CTAs.

- [ ] **Step 4: Create /integrations/[slug]/page.tsx**

Create `marketing/src/app/integrations/[slug]/page.tsx`:
- `dynamicParams = false`, `generateStaticParams`, `generateMetadata`
- Page: BreadcrumbList + FAQ + Article schemas, hero ("CapVeri + [Software]"), intro paragraphs, "How to connect" numbered steps section, "What CapVeri finds" feature cards, time savings before/after comparison, FAQ section, related integrations, CTA
- Use `params: Promise<{ slug: string }>` pattern

- [ ] **Step 5: Create /integrations/page.tsx index**

Create `marketing/src/app/integrations/page.tsx`:
- Static metadata
- Card grid linking to each integration
- BreadcrumbList schema

- [ ] **Step 6: Verify typecheck passes**

Run: `cd marketing && npm run typecheck`

- [ ] **Step 7: Commit**

```bash
git add marketing/data/integrations.json marketing/src/lib/content/pseo-types.ts marketing/src/lib/content/pseo-data.ts marketing/src/app/integrations/
git commit -m "feat(marketing): add /integrations/[slug] pSEO template with 4 integration partner pages"
```

---

## Task 7: `/roi` Business Case Page

**Files:**
- Create: `marketing/src/app/roi/page.tsx`

Static BOFU page. Target: "cam reconciliation cost", "ROI of CAM automation".

- [ ] **Step 1: Create the page**

Create `marketing/src/app/roi/page.tsx` with:
- Metadata: "The ROI of CAM Reconciliation Software | CapVeri"
- Canonical: `https://www.capveri.com/roi`
- BreadcrumbList + FAQ schemas
- H1: "The ROI of Automating CAM Reconciliation"
- Sections: hero with value proposition, "Cost of Doing Nothing" section (error rates, average overcharge per building, audit risk), ROI breakdown (3 scenarios: 5 buildings, 20 buildings, 50+ buildings with savings calculations), time savings comparison (manual hours vs CapVeri minutes), pricing context (link to /pricing), FAQ section, CTA
- Use `buildTrialLink({ content: "roi-hero" })` and `buildTrialLink({ content: "roi-bottom" })`
- ~400-500 lines

- [ ] **Step 2: Verify typecheck passes**

Run: `cd marketing && npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add marketing/src/app/roi/page.tsx
git commit -m "feat(marketing): add /roi business case page for CAM reconciliation"
```

---

## Task 8: Optimize Top /vs Pages

**Files:**
- Modify: `marketing/data/comparisons.json` (update yardi, mri, excel entries)

Target: Improve BOFU conversion on highest-value comparison pages.

- [ ] **Step 1: Read current entries for yardi, mri, excel**

Read `marketing/data/comparisons.json` and locate the yardi, mri, and excel entries.

- [ ] **Step 2: Update the three entries**

For each of yardi, mri, and excel:
- Update `dateModified` to `"2026-03-26"`
- Update `ctaDescription` to reflect current annual package pricing and the 30-day free trial
- Ensure `metaDescription` includes the competitor name + "alternative" phrasing
- Add to the `comparisonTable.rows` array a row for "Free trial" if not present (CapVeri: "30-day free trial, no credit card", competitor: their trial policy)
- Add to `faqs` a question about "Is there a free [competitor] alternative for CAM?" if not present

- [ ] **Step 3: Verify typecheck passes**

Run: `cd marketing && npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add marketing/data/comparisons.json
git commit -m "feat(marketing): optimize top /vs pages (Yardi, MRI, Excel) for BOFU conversion"
```

---

## Task 9: Switch/Migration pSEO Template + Data

**Files:**
- Create: `marketing/data/switch.json`
- Modify: `marketing/src/lib/content/pseo-types.ts` (add SwitchData type)
- Modify: `marketing/src/lib/content/pseo-data.ts` (add getAllSwitchGuides/getSwitchGuide)
- Create: `marketing/src/app/switch/page.tsx`
- Create: `marketing/src/app/switch/[slug]/page.tsx`

Target: People actively transitioning.

- [ ] **Step 1: Add SwitchData type to pseo-types.ts**

Add to `marketing/src/lib/content/pseo-types.ts`:

```typescript
// -- Migration/Switch Guides (/switch/[slug]) --

export interface SwitchStep {
  step: number;
  title: string;
  description: string;
  timeEstimate: string;
}

export interface SwitchData {
  slug: string;
  fromName: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  datePublished: string;
  dateModified: string;
  introParagraphs: string[];
  whySwitch: { title: string; description: string }[];
  migrationSteps: SwitchStep[];
  totalTime: string;
  whatChanges: string[];
  whatStays: string[];
  faqs: { question: string; answer: string }[];
  relatedResources: { href: string; title: string }[];
  ctaHeading: string;
  ctaDescription: string;
}
```

- [ ] **Step 2: Add data loaders to pseo-data.ts**

Add to `marketing/src/lib/content/pseo-data.ts`:

```typescript
// -- Switch Guides --

interface SwitchFile {
  lastUpdated: string;
  guides: SwitchData[];
}

export async function getAllSwitchGuides(): Promise<SwitchData[]> {
  try {
    const data = await loadJsonData<SwitchFile>("switch.json");
    return data.guides;
  } catch {
    return [];
  }
}

export async function getSwitchGuide(
  slug: string,
): Promise<SwitchData | null> {
  const guides = await getAllSwitchGuides();
  return guides.find((g) => g.slug === slug) ?? null;
}
```

Add the import of `SwitchData` to the existing import block.

- [ ] **Step 3: Create switch.json data file**

Create `marketing/data/switch.json` with 3 entries:
- `excel`: "Switch from Excel to CapVeri in 15 Minutes"
- `outsourced-cam`: "Bring CAM Reconciliation In-House with CapVeri"
- `manual-process`: "Replace Your Manual CAM Reconciliation Workflow"

Each: full migration steps with time estimates, what changes vs stays the same, FAQs, CTAs.

- [ ] **Step 4: Create /switch/[slug]/page.tsx**

Create `marketing/src/app/switch/[slug]/page.tsx`:
- `dynamicParams = false`, `generateStaticParams`, `generateMetadata`
- Page: BreadcrumbList + FAQ + HowTo schemas, hero, intro, "Why switch" cards, numbered migration steps with time estimates, "What changes" vs "What stays the same" two-column layout, FAQ section, CTA
- Use `params: Promise<{ slug: string }>` pattern

- [ ] **Step 5: Create /switch/page.tsx index**

Create `marketing/src/app/switch/page.tsx`:
- Static metadata
- Card grid linking to each guide
- BreadcrumbList schema

- [ ] **Step 6: Verify typecheck passes**

Run: `cd marketing && npm run typecheck`

- [ ] **Step 7: Commit**

```bash
git add marketing/data/switch.json marketing/src/lib/content/pseo-types.ts marketing/src/lib/content/pseo-data.ts marketing/src/app/switch/
git commit -m "feat(marketing): add /switch/[slug] pSEO template with 3 migration guides"
```

---

## Task 10: `/product-tour` Page

**Files:**
- Create: `marketing/src/app/product-tour/page.tsx`

Static BOFU page. Target: "cam reconciliation software demo".

- [ ] **Step 1: Create the page**

Create `marketing/src/app/product-tour/page.tsx` with:
- Metadata: "Product Tour: See CapVeri CAM Reconciliation in Action"
- Canonical: `https://www.capveri.com/product-tour`
- BreadcrumbList schema
- H1: "See CapVeri in Action: Upload to Audit in Minutes"
- Sections: hero with trial CTA, 4-5 step walkthrough (Step 1: Upload GL Export, Step 2: Map Lease Terms, Step 3: Run Reconciliation, Step 4: Review Flags & Errors, Step 5: Export Audit Report), each step with description and feature highlights, "What You'll Find" section (gross-up errors, cap violations, CapEx in OpEx, pro-rata mistakes), sample report link (`/sample-report`), FAQ, CTA
- Use `buildTrialLink({ content: "product-tour-hero" })` and `buildTrialLink({ content: "product-tour-bottom" })`
- ~300-400 lines

- [ ] **Step 2: Verify typecheck passes**

Run: `cd marketing && npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add marketing/src/app/product-tour/page.tsx
git commit -m "feat(marketing): add /product-tour page"
```

---

## Verification

After all tasks are complete:

- [ ] Run `cd marketing && npm run typecheck` — must pass with zero errors
- [ ] Run `cd marketing && npm run build` — must succeed (validates all generateStaticParams work correctly)
- [ ] Spot-check 3-4 pages in dev server for correct rendering
- [ ] Verify all new routes appear in the build output
- [ ] Final commit with any fixes

---

## Dependency Graph

Tasks 2, 5, 6, and 9 all modify `pseo-types.ts` and `pseo-data.ts`. They MUST run sequentially (or merge carefully).

**Parallelization strategy:**
- **Wave 1 (parallel):** Task 1, Task 3, Task 4, Task 7, Task 8, Task 10 (all independent — static pages or data-only edits)
- **Wave 2 (sequential):** Task 2 → Task 5 → Task 6 → Task 9 (each adds types + loaders to shared files)

Alternatively: Task 2 runs first and establishes the pattern, then Tasks 5, 6, 9 can run in parallel if each agent is given the cumulative state of pseo-types.ts and pseo-data.ts after Task 2.
