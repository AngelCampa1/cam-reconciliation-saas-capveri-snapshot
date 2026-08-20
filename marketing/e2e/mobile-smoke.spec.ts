import { test, expect, type Page } from "@playwright/test";

/**
 * Mobile smoke suite. Runs only under the `mobile-iphone` / `mobile-android`
 * Playwright projects (see playwright.config.ts testMatch). Asserts the core
 * mobile invariants on every representative marketing surface so regressions
 * surface in CI before they ship.
 *
 * Invariants per route:
 *  - No horizontal page scroll (document scrollWidth fits viewport).
 *  - Every visible <a>/<button> has a tap target of at least 44 px on its
 *    shorter dimension (Apple HIG / WCAG 2.5.5 AAA-adjacent threshold).
 *  - The marketing nav exposes a working hamburger that reveals the primary
 *    nav links.
 *  - A primary CTA pointing at the app (audit / trial / signup) is reachable.
 */

const ROUTES = [
  { path: "/", name: "home" },
  { path: "/pricing", name: "pricing" },
  { path: "/solutions", name: "solutions" },
  { path: "/integrations", name: "integrations" },
  { path: "/vs", name: "compare-hub" },
  { path: "/case-studies", name: "case-studies" },
  { path: "/contact", name: "contact" },
  { path: "/sample-report", name: "sample-report" },
  { path: "/tools/cam-gross-up-calculator", name: "tool-gross-up" },
  { path: "/tools/cam-cap-calculator", name: "tool-cap" },
  { path: "/resources", name: "resources-hub" },
  {
    path: "/resources/cam-reconciliation-process",
    name: "resource-reconciliation",
  },
  { path: "/blog", name: "blog-index" },
  { path: "/help", name: "help" },
  { path: "/glossary", name: "glossary" },
] as const;

const TAP_TARGET_MIN_PX = 44;

async function assertNoHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scroll: doc.scrollWidth,
      client: doc.clientWidth,
      inner: window.innerWidth,
    };
  });
  // 1 px tolerance for subpixel rounding.
  expect(
    overflow.scroll,
    `horizontal overflow at ${label} (scroll=${overflow.scroll}, viewport=${overflow.inner})`,
  ).toBeLessThanOrEqual(overflow.inner + 1);
}

async function assertTapTargets(page: Page, label: string) {
  const undersized = await page.evaluate((min: number) => {
    const offenders: Array<{
      tag: string;
      text: string;
      href: string | null;
      className: string;
      w: number;
      h: number;
    }> = [];
    const nodes = document.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [role="button"], input[type="submit"], input[type="button"]',
    );
    for (const el of nodes) {
      const style = window.getComputedStyle(el);
      if (
        style.visibility === "hidden" ||
        style.display === "none" ||
        style.pointerEvents === "none" ||
        el.classList.contains("sr-only")
      ) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      // Ignore offscreen / collapsed elements (e.g. mobile menu when closed,
      // sr-only skip links). We only check what a user can actually tap.
      if (rect.width === 0 || rect.height === 0) continue;
      // Skip inline links inside flowing prose - body links wrap and a 44 px
      // line-height is impractical. We bound this to interactive controls
      // that live outside <p>/<li>/<h*> text blocks.
      const inProse = el.closest("p, li, h1, h2, h3, h4, h5, h6, blockquote");
      if (inProse && el.tagName === "A") continue;
      const short = Math.min(rect.width, rect.height);
      if (short < min) {
        offenders.push({
          tag: el.tagName,
          text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 60),
          href: el.getAttribute("href"),
          className:
            typeof el.className === "string"
              ? el.className.slice(0, 120)
              : "",
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        });
      }
    }
    return offenders;
  }, TAP_TARGET_MIN_PX);

  expect(
    undersized,
    `${label}: ${undersized.length} tap targets below ${TAP_TARGET_MIN_PX}px - ${JSON.stringify(undersized.slice(0, 6))}`,
  ).toEqual([]);
}

async function assertMobileNavOpens(page: Page, label: string) {
  const toggle = page.getByRole("button", { name: /open menu/i });
  await expect(toggle, `${label}: mobile menu button missing`).toBeVisible();
  await toggle.click();
  // After opening, the close-state aria-label should be present.
  await expect(
    page.getByRole("button", { name: /close menu/i }),
    `${label}: mobile menu did not toggle to close state`,
  ).toBeVisible();
  // Primary nav link is reachable in the open menu.
  await expect(
    page.getByRole("link", { name: /pricing/i }).first(),
    `${label}: Pricing link not visible in mobile menu`,
  ).toBeVisible();
  await page.getByRole("button", { name: /close menu/i }).click();
}

async function assertPrimaryCtaPresent(page: Page, label: string) {
  // Any link/button that points at the app onboarding/trial counts.
  const cta = page
    .locator("a:visible,button:visible")
    .filter({
      hasText:
        /audit|free trial|start free|get started|try capveri/i,
    })
    .first();
  await expect(cta, `${label}: no primary CTA visible`).toBeVisible();

  const badTrialLinks = await page.evaluate(() => {
    const badHrefs: string[] = [];
    const trialCtaPattern =
      /^(start\s+(free|your)\s+trial|start\s+free|get\s+started\s+free|try\s+capveri)/i;
    for (const link of document.querySelectorAll<HTMLAnchorElement>(
      "a[href]",
    )) {
      const style = window.getComputedStyle(link);
      const rect = link.getBoundingClientRect();
      if (
        style.visibility === "hidden" ||
        style.display === "none" ||
        rect.width === 0 ||
        rect.height === 0
      ) {
        continue;
      }
      const labelText = (
        link.getAttribute("aria-label") ||
        link.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
      if (
        labelText.length <= 80 &&
        trialCtaPattern.test(labelText) &&
        !link.getAttribute("href")?.includes("/auth/register")
      ) {
        badHrefs.push(link.getAttribute("href") || "");
      }
    }
    return badHrefs;
  });

  expect(
    badTrialLinks,
    `${label}: free trial CTA links should point to app registration`,
  ).toEqual([]);
}

for (const route of ROUTES) {
  test.describe(`mobile :: ${route.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      // Let layout settle (web fonts, hydration, lazy images registering).
      await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
    });

    test("does not horizontally overflow", async ({ page }) => {
      await assertNoHorizontalScroll(page, route.path);
    });

    test("all visible tap targets are at least 44px", async ({ page }) => {
      await assertTapTargets(page, route.path);
    });

    test("hamburger menu opens and exposes Pricing", async ({ page }) => {
      await assertMobileNavOpens(page, route.path);
    });

    test("a primary CTA is reachable", async ({ page }) => {
      await assertPrimaryCtaPresent(page, route.path);
    });
  });
}
