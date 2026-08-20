import { test, expect } from "@playwright/test";

test.describe("/vs/excel page", () => {
  test("renders with correct H1 containing Excel and CAM reconciliation", async ({
    page,
  }) => {
    await page.goto("/vs/excel");
    await expect(page.locator("h1")).toContainText("Excel");
    await expect(page.locator("h1")).toContainText("CAM");
  });

  test("has structured JSON-LD with Article and FAQPage schemas", async ({
    page,
  }) => {
    await page.goto("/vs/excel");
    const schemas = await page.evaluate(() => {
      return Array.from(
        document.querySelectorAll('script[type="application/ld+json"]'),
      ).map((el) => JSON.parse(el.textContent || "{}"));
    });
    const types = schemas.flatMap((s: Record<string, unknown>) =>
      s["@graph"]
        ? (s["@graph"] as Array<Record<string, unknown>>).map((n) => n["@type"])
        : [s["@type"]],
    );
    expect(types).toContain("Article");
    expect(types).toContain("FAQPage");
    expect(types).toContain("BreadcrumbList");
  });

  test("CTA links have UTM tracking parameters", async ({ page }) => {
    await page.goto("/vs/excel");
    const ctaLinks = page.locator(`a[href*="auth/register"]`);
    await expect(ctaLinks.first()).toBeVisible();
    const href = await ctaLinks.first().getAttribute("href");
    expect(href).toContain("utm_source=marketing_site");
  });

  test("feature comparison table is rendered", async ({ page }) => {
    await page.goto("/vs/excel");
    await expect(page.locator("table")).toBeVisible();
  });
});
