import { expect, test } from "@playwright/test";

test.describe("NOI impact calculator", () => {
  test("NOI calculator URL renders the active tool", async ({ page }) => {
    await page.goto("/tools/noi-impact-calculator");
    await expect(page).toHaveURL(/\/tools\/noi-impact-calculator$/);
    await expect(page.locator("h1").first()).toBeVisible();
  });
});
