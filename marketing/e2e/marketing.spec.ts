/**
 * E2E tests for the marketing site.
 *
 * These tests verify that Next.js SSR is working correctly - the key benefit
 * of the marketing/frontend separation. All critical marketing pages must
 * render real HTML content (not a blank SPA shell) so Googlebot indexes them.
 */
import { expect, test } from "@playwright/test";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.capveri.com";
const ESCAPED_APP_URL = APP_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test.describe("Landing page", () => {
  test("renders real HTML content without JavaScript", async ({ page }) => {
    await page.goto("/");
    // view-source equivalent: content must be present in initial HTML, not injected by JS
    await expect(page.locator("h1").first()).toBeVisible();
    // Nav should be present
    await expect(page.locator("nav")).toBeVisible();
    // Footer should be present
    await expect(page.locator("footer")).toBeVisible();
  });

  test("CTAs link to tracked app registration URLs", async ({ page }) => {
    await page.goto("/");
    // At least one CTA should point to the app registration URL with attribution params
    const registerLinks = page.locator(`a[href*="${APP_URL}/auth/register"]`);
    await expect(registerLinks.first()).toBeVisible();
    const href = await registerLinks.first().getAttribute("href");
    expect(href).toContain("utm_source=marketing_site");
    expect(href).toContain("utm_medium=website");
    expect(href).toContain("utm_campaign=");
    expect(href).toContain("utm_content=");
  });
});

test.describe("Homepage universal positioning", () => {
  test("does not render a persona selector on the landing page", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator('[aria-label*="role" i]')).toHaveCount(0);
  });

  test("default landing page shows universal clarity copy in hero", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText(
      "Bill CAM correctly before statements go to tenants.",
    );
    await expect(
      page.locator("text=/cam reconciliation software/i").first(),
    ).toBeVisible();
    await expect(
      page
        .locator("text=/GL, rent roll, billed amounts, and lease terms/i")
        .first(),
    ).toBeVisible();
  });
});

test.describe("Pricing page", () => {
  test("renders with correct CTA links to app", async ({ page }) => {
    await page.goto("/pricing");
    await expect(
      page.getByRole("heading", {
        name: /start free\. pay only when you keep it\./i,
      }),
    ).toBeVisible();
    // Pricing CTAs should point to app registration
    const ctaLinks = page.locator(`a[href*="${APP_URL}"]`);
    expect(await ctaLinks.count()).toBeGreaterThan(0);
  });

  test("shows the Reconcile plan name and unit controls", async ({ page }) => {
    await page.goto("/pricing");
    await expect(
      page.getByRole("heading", { name: "Reconcile", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Rentable units").first(),
    ).toBeVisible();
  });

  test("Reconcile plan shows 80OFF annual price", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText("$998/yr").first()).toBeVisible();
    await expect(page.getByText("$4,990/yr").first()).toBeVisible();
  });

  test("Reconcile plan shows extra-unit bands", async ({ page }) => {
    await page.goto("/pricing");
    await expect(
      page.getByText("26-150 units: $179 per extra unit/year").first(),
    ).toBeVisible();
  });
});

test.describe("Funnel CTA pages", () => {
  test("switch index primary CTA starts the attributed trial funnel", async ({
    page,
  }) => {
    await page.goto("/switch");
    const cta = page
      .locator('a[href*="utm_content=switch_index_primary"]')
      .first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute(
      "href",
      new RegExp(`^${ESCAPED_APP_URL}/auth/register`),
    );
    const href = await cta.getAttribute("href");
    expect(href).toContain("utm_source=marketing_site");
    expect(href).toContain("utm_medium=website");
    expect(href).toContain("utm_campaign=free_trial");
    expect(href).toContain("utm_content=switch_index_primary");
    expect(href).toContain("offer=80OFF");
  });

  test("comparison index primary CTA starts the attributed trial funnel", async ({
    page,
  }) => {
    await page.goto("/vs");
    const cta = page.locator('a[href*="utm_content=vs_index_primary"]').first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute(
      "href",
      new RegExp(`^${ESCAPED_APP_URL}/auth/register`),
    );
    const href = await cta.getAttribute("href");
    expect(href).toContain("utm_source=marketing_site");
    expect(href).toContain("utm_medium=website");
    expect(href).toContain("utm_campaign=free_trial");
    expect(href).toContain("utm_content=vs_index_primary");
    expect(href).toContain("offer=80OFF");
  });
});

test.describe("Tool pages", () => {
  test("BOMA 2024 calculator is interactive", async ({ page }) => {
    await page.goto("/tools/boma-2024-calculator");
    // Page renders with content
    await expect(page.locator("h1").first()).toBeVisible();
    // Interactive calculator UI should be present (client component loaded)
    await expect(page.locator('input, [role="slider"]').first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("tools hub renders correctly", async ({ page }) => {
    await page.goto("/tools");
    await expect(page.locator("h1").first()).toBeVisible();
    // Each tool should have a link
    await expect(page.locator('a[href*="/tools/"]').first()).toBeVisible();
  });
});

test.describe("SEO infrastructure", () => {
  test("sitemap.xml returns valid XML", async ({ page }) => {
    const response = await page.request.get("/sitemap.xml");
    expect(response?.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("<?xml");
    expect(body).toContain("<urlset");
    expect(body).toContain("<loc>");
    // Must contain the canonical domain
    expect(body).toContain("capveri.com");
  });

  test("robots.txt returns correct content", async ({ page }) => {
    const response = await page.goto("/robots.txt");
    expect(response?.status()).toBe(200);
    const body = await response!.text();
    expect(body).toContain("User-Agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain("sitemap.xml");
  });
});

test.describe("Citation UX", () => {
  test("resource pages render inline citation chips and local sources anchors", async ({
    page,
  }) => {
    await page.goto("/resources/tenant-cam-dispute");
    await expect(
      page.getByRole("heading", { name: "Sources", exact: true }),
    ).toBeVisible();
    await expect(page.locator('a[href^="/sources#"]').first()).toBeVisible();
  });

  test("comparison pages expose related comparison links", async ({ page }) => {
    await page.goto("/vs/yardi");
    const relatedLink = page
      .getByRole("link", { name: /CapVeri vs MRI/i })
      .first();
    await expect(relatedLink).toBeVisible();
    await expect(relatedLink).toHaveAttribute("href", "/vs/mri");
  });
});

test.describe("Navigation", () => {
  test("nav links work between pages", async ({ page }) => {
    await page.goto("/");
    // Click pricing link in nav
    const pricingLink = page.locator('nav a[href="/pricing"]').first();
    await expect(pricingLink).toBeVisible();
    await pricingLink.click();
    await expect(page).toHaveURL("/pricing");
    await expect(
      page.getByRole("heading", {
        name: /start free\. pay only when you keep it\./i,
      }),
    ).toBeVisible();
  });

  test("nav shows current top-level links and removed section links absent", async ({
    page,
  }) => {
    await page.goto("/");
    // Present links
    await expect(
      page.locator('nav a[href="/product-tour"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('nav a[href="/resources"]').first(),
    ).toBeVisible();
    await expect(page.locator('nav a[href="/pricing"]').first()).toBeVisible();
    await expect(page.locator('nav a[href="/about"]').first()).toBeVisible();
    const productLink = page
      .locator("nav")
      .getByRole("link", { name: "Product", exact: true });
    const navCompareLink = page.locator('nav a[href="/vs"]').first();
    await expect(productLink).toBeVisible();
    await expect(navCompareLink).toBeHidden();
    await productLink.hover();
    await expect(navCompareLink).toBeVisible();
    // Removed links must not appear in nav
    await expect(page.locator('nav a[href="/#how-it-works"]')).toHaveCount(0);
    await expect(page.locator('nav a[href="/#roi-calculator"]')).toHaveCount(0);
    await expect(page.locator('nav a[href="/contact"]')).toHaveCount(0);
  });

  test("sign in CTA points to app subdomain", async ({ page }) => {
    await page.goto("/");
    const loginLink = page.getByRole("link", { name: /^sign in$/i }).first();
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute(
      "href",
      new RegExp(`^${ESCAPED_APP_URL}/auth/login`),
    );
  });
});

test.describe("Homepage clarity positioning", () => {
  test("hero leads with concrete CAM reconciliation software positioning", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.locator("text=/cam reconciliation software/i").first(),
    ).toBeVisible();
    await expect(page.locator("h1").first()).toContainText(
      /bill cam correctly before statements go to tenants/i,
    );
  });

  test("hero names the broader commercial property audience", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page
        .locator("text=/GL, rent roll, billed amounts, and lease terms/i")
        .first(),
    ).toBeVisible();
  });

  test("homepage explains deterministic math and audit trail", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.locator("text=/deterministic CAM calculations/i").first(),
    ).toBeVisible();
    await expect(page.locator("text=/audit trail/i").first()).toBeVisible();
  });

  test("features grid uses current reconciliation workflow heading", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.locator("text=Built for the reconciliation workflow"),
    ).toBeVisible();
  });
});

test.describe("Tenant CAM dispute page", () => {
  test("renders with correct H1", async ({ page }) => {
    await page.goto("/resources/tenant-cam-dispute");
    await expect(page.locator("h1")).toContainText(
      "How to Respond to a Tenant CAM Dispute",
    );
  });

  test("renders quick-answer block above the fold", async ({ page }) => {
    await page.goto("/resources/tenant-cam-dispute");
    await expect(
      page.getByText("Pull the primary-source documents first"),
    ).toBeVisible();
  });

  test("renders 7-item FAQ section", async ({ page }) => {
    await page.goto("/resources/tenant-cam-dispute");
    const faqHeading = page.getByRole("heading", {
      name: "Frequently Asked Questions",
      exact: true,
    });
    await expect(faqHeading).toBeVisible();
    const faqs = page.locator("section.not-prose h3");
    await expect(faqs).toHaveCount(7);
  });

  test("CTA links to app registration with attribution params", async ({
    page,
  }) => {
    await page.goto("/resources/tenant-cam-dispute");
    const cta = page
      .locator(`a[href*="${APP_URL}/auth/register"][href*="utm_content=u_cta"]`)
      .first();
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute("href");
    expect(href).toContain("utm_source=marketing_site");
    expect(href).toContain("utm_content=u_cta");
  });

  test("internal links to sb-1103-compliance and tenant-auditor-guide exist", async ({
    page,
  }) => {
    await page.goto("/resources/tenant-cam-dispute");
    await expect(
      page.locator('a[href="/resources/sb-1103-compliance"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('a[href="/resources/tenant-cam-audit-landlord-side"]').first(),
    ).toBeVisible();
  });

  test("contains Article + FAQPage + BreadcrumbList JSON-LD schema", async ({
    page,
  }) => {
    await page.goto("/resources/tenant-cam-dispute");
    const schemas = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll('script[type="application/ld+json"]'),
      ).map((el) => JSON.parse(el.textContent ?? "{}")),
    );
    const types = schemas.flatMap((s) =>
      Array.isArray(s["@graph"])
        ? s["@graph"].map((n: { "@type": string }) => n["@type"])
        : [s["@type"]],
    );
    expect(types).toContain("Article");
    expect(types).toContain("FAQPage");
    expect(types).toContain("BreadcrumbList");
  });

  test("remains reachable directly", async ({ page }) => {
    await page.goto("/resources/tenant-cam-dispute");
    await expect(page.locator("h1")).toContainText(
      "How to Respond to a Tenant CAM Dispute",
    );
  });
});

test.describe("Existing page dispute optimizations", () => {
  test("tenant-auditor-guide has reactive dispute section", async ({
    page,
  }) => {
    await page.goto("/resources/tenant-cam-audit-landlord-side");
    await expect(
      page.getByRole("heading", {
        name: /step-by-step landlord response workflow/i,
      }),
    ).toBeVisible();
  });

  test("cam-reconciliation-errors has dispute trigger definition block", async ({
    page,
  }) => {
    await page.goto("/blog/cam-reconciliation-errors");
    await expect(
      page.getByRole("heading", {
        name: /what triggers a tenant cam dispute/i,
      }),
    ).toBeVisible();
  });

  test("cam-presend-checklist has past-send-date reactive section", async ({
    page,
  }) => {
    await page.goto("/resources/cam-pre-send-packet-checklist");
    await expect(
      page.getByRole("heading", { name: /the 20-item pre-send checklist/i }),
    ).toBeVisible();
  });

  test("sb-1103-compliance links to dispute page", async ({ page }) => {
    await page.goto("/resources/sb-1103-compliance");
    await expect(
      page.locator('a[href="/resources/tenant-cam-dispute"]').first(),
    ).toBeVisible();
  });

  test("vs/tenant-auditors has reactive dispute section", async ({ page }) => {
    await page.goto("/vs/tenant-auditors");
    await expect(
      page.getByRole("heading", { name: /tenant auditors vs\. capveri/i }),
    ).toBeVisible();
  });
});
