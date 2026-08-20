import { test, expect } from "@playwright/test";

const TOOLS_WITH_HOWTO = [
  "/tools/cam-gross-up-calculator",
  "/tools/boma-2024-calculator",
  "/tools/cam-billing-error-estimator",
  "/tools/hcad-tax-normalizer",
];

for (const tool of TOOLS_WITH_HOWTO) {
  test(`${tool} has HowTo schema`, async ({ page }) => {
    await page.goto(tool);
    const schemas = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll('script[type="application/ld+json"]'),
      ).map((el) => JSON.parse(el.textContent || "{}")),
    );
    const types = schemas.flatMap((s: Record<string, unknown>) =>
      s["@graph"]
        ? (s["@graph"] as Array<Record<string, unknown>>).map((n) => n["@type"])
        : [s["@type"]],
    );
    expect(types).toContain("HowTo");
  });
}

test("/tools hub has FAQPage schema", async ({ page }) => {
  await page.goto("/tools");
  const schemas = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll('script[type="application/ld+json"]'),
    ).map((el) => JSON.parse(el.textContent || "{}")),
  );
  const types = schemas.flatMap((s: Record<string, unknown>) =>
    s["@graph"]
      ? (s["@graph"] as Array<Record<string, unknown>>).map((n) => n["@type"])
      : [s["@type"]],
  );
  expect(types).toContain("FAQPage");
});
