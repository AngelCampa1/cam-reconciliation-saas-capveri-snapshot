import { test, expect, type Page } from "@playwright/test";

/**
 * Mobile horizontal-overflow sweep. Runs under the `mobile-iphone` and
 * `mobile-android` Playwright projects (testMatch `mobile-.*\.spec\.ts`).
 *
 * `mobile-smoke.spec.ts` deeply asserts tap targets, hamburger nav, and
 * primary-CTA presence on ~15 curated routes. This file extends coverage with
 * a single - but the most important - invariant across the entire marketing
 * surface area: the page must not produce horizontal scroll on a phone.
 *
 * Keeping the assertion to one cheap check lets us cover many more routes
 * without exploding the CI runtime.
 */

const ROUTES = [
  // Top-level marketing
  "/about",
  "/about/angel-campa",
  "/solutions",
  "/integrations",
  "/pricing",
  "/product-tour",
  "/contact",
  "/help",
  "/docs",
  "/sample-report",
  "/roi",
  "/switch",
  "/vs",
  "/case-studies",

  // Hero SEO landings (table-heavy / grid-heavy)
  "/cam-audit",
  "/cam-charges",
  "/cam-reconciliation-guide",
  "/cam-reconciliation-software",
  "/cam-audit-software",
  "/commercial-lease-audit-software",
  "/lease-abstraction",
  "/mri-cam-reconciliation",
  "/yardi-cam-reconciliation",
  "/best/cam-reconciliation-software",

  // Resource hubs (long content, MDX layouts)
  "/resources",
  "/resources/cam-guides",
  "/resources/compliance-leases",
  "/resources/solutions",
  "/resources/tools-calculators",
  "/resources/cam-reconciliation-process",
  "/resources/cam-gross-up-guide",
  "/resources/cam-reconciliation-checklist",
  "/resources/cam-close-checklist",
  "/resources/cam-close-calendar",
  "/resources/cam-recovery-ratio",
  "/resources/nnn-reconciliation",
  "/resources/office-cam-reconciliation",
  "/resources/retail-cam-reconciliation",
  "/resources/industrial-cam-reconciliation",
  "/resources/mixed-use-cam-reconciliation",
  "/resources/pro-rata-denominator-explained",
  "/resources/pro-rata-share-validation",
  "/resources/gross-up-clause-explained",
  "/resources/management-fee-cam-disputes",
  "/resources/property-tax-pass-through-cam",
  "/resources/boma-2024-cam-reconciliation",
  "/resources/cam-glossary-cre-finops",

  // Tools (calculators / checklists / generators)
  "/tools/cam-gross-up-calculator",
  "/tools/cam-cap-calculator",
  "/tools/cam-billing-error-estimator",
  "/tools/cam-estimate-forecaster",
  "/tools/pro-rata-calculator",
  "/tools/boma-2024-calculator",
  "/tools/boma-remeasurement-impact",
  "/tools/admin-fee-calculator",
  "/tools/base-year-escalation",
  "/tools/recovery-gap-analyzer",
  "/tools/hcad-tax-normalizer",
  "/tools/sb-1103-checker",
  "/tools/noi-impact-calculator",
  "/tools/fixed-cam-vs-traditional",
  "/tools/lease-abstract-matrix",
  "/tools/audit-risk-quiz",
  "/tools/audit-risk-scorecard",
  "/tools/cam-recovery-ratio-worksheet",
  "/tools/cumulative-cap-bank-calculator",
  "/tools/property-tax-appeal-recovery-calculator",
  "/tools/yardi-export-qa-checklist",
  "/tools/mri-recovery-billing-qa-checklist",

  // Comparison / programmatic SEO
  "/alternatives",
  "/glossary",
  "/blog",

  // Checkout flow & legal
  "/checkout",
  "/privacy",
  "/terms",
  "/cookies",
  "/unsubscribe",
  "/sources",
] as const;

async function assertNoHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scroll: doc.scrollWidth,
      inner: window.innerWidth,
    };
  });
  expect(
    overflow.scroll,
    `horizontal overflow at ${label} (scroll=${overflow.scroll}, viewport=${overflow.inner})`,
  ).toBeLessThanOrEqual(overflow.inner + 1);
}

for (const route of ROUTES) {
  test(`mobile no-overflow :: ${route}`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    // Skip 404/redirect-only routes - overflow assertion is meaningless if the
    // page never rendered. Real 404s should be caught by separate tests.
    if (response && response.status() >= 400) {
      test.skip(true, `${route} returned ${response.status()}`);
    }
    await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
    await assertNoHorizontalScroll(page, route);
  });
}
