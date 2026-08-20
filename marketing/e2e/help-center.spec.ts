import { test, expect } from "@playwright/test";

test.describe("Help Center Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/help");
  });

  test("page loads with Help Center heading and all categories visible", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: /help center/i, level: 1 }),
    ).toBeVisible();

    // All 10 category headings should be visible
    const expectedCategories = [
      "Getting Started",
      "CAM Reconciliation Basics",
      "Financial Calculations",
      "Working with Your ERP",
      "Pricing and Value",
      "Compliance & Legal",
      "AI & Lease Extraction",
      "Tenant Portal & Disputes",
      "Security & Data Privacy",
      "Switching & Migration",
    ];
    for (const category of expectedCategories) {
      await expect(page.getByRole("heading", { name: category })).toBeVisible();
    }
  });

  test("search filters content correctly", async ({ page }) => {
    const searchInput = page.getByRole("searchbox", {
      name: /search help articles/i,
    });
    await searchInput.fill("gross-up safety valve");

    // The matching question should remain visible
    await expect(
      page.getByText(/What is the gross-up safety valve/i),
    ).toBeVisible();

    // Unrelated categories should be hidden
    await expect(
      page.getByRole("heading", { name: "Switching & Migration" }),
    ).not.toBeVisible();
  });

  test("accordion expand/collapse works", async ({ page }) => {
    const firstButton = page
      .getByRole("button", { name: /What is CapVeri/i })
      .first();

    // Initially collapsed
    await expect(firstButton).toHaveAttribute("aria-expanded", "false");

    // Click to expand
    await firstButton.click();
    await expect(firstButton).toHaveAttribute("aria-expanded", "true");

    // Click again to collapse
    await firstButton.click();
    await expect(firstButton).toHaveAttribute("aria-expanded", "false");
  });

  test("multiple FAQ items can be open simultaneously", async ({ page }) => {
    const faqButtons = page.locator("main button[aria-expanded]").filter({
      hasText: /\?/,
    });
    const firstButton = faqButtons.nth(0);
    const secondButton = faqButtons.nth(1);

    await expect(firstButton).toBeVisible();
    await expect(secondButton).toBeVisible();

    await firstButton.click();
    await secondButton.click();

    await expect(firstButton).toHaveAttribute("aria-expanded", "true");
    await expect(secondButton).toHaveAttribute("aria-expanded", "true");
  });

  test("FAQPage structured data is present in page source", async ({
    page,
  }) => {
    const scripts = page.locator('script[type="application/ld+json"]');
    const count = await scripts.count();

    let hasFaqPage = false;
    for (let i = 0; i < count; i++) {
      const content = await scripts.nth(i).textContent();
      if (content && content.includes('"FAQPage"')) {
        hasFaqPage = true;
        const data = JSON.parse(content);
        expect(data["@type"]).toBe("FAQPage");
        expect(data.mainEntity.length).toBeGreaterThanOrEqual(60);
        break;
      }
    }
    expect(hasFaqPage).toBe(true);
  });

  test("breadcrumb structured data is present", async ({ page }) => {
    const scripts = page.locator('script[type="application/ld+json"]');
    const count = await scripts.count();

    let hasBreadcrumb = false;
    for (let i = 0; i < count; i++) {
      const content = await scripts.nth(i).textContent();
      if (content && content.includes('"BreadcrumbList"')) {
        hasBreadcrumb = true;
        break;
      }
    }
    expect(hasBreadcrumb).toBe(true);
  });

  test("Contact Support CTA links to /contact", async ({ page }) => {
    const contactLink = page.getByRole("link", {
      name: /contact support/i,
    });
    await expect(contactLink).toHaveAttribute("href", "/contact");
  });
});

test.describe("Footer Help Center link", () => {
  test("footer contains Help Center link", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    const helpLink = footer.getByRole("link", { name: /help center/i }).first();
    await expect(helpLink).toBeVisible();
    await expect(helpLink).toHaveAttribute("href", "/help");
  });
});

test.describe("Landing page FAQ cross-link", () => {
  test('FAQ section has "View all FAQs" link', async ({ page }) => {
    await page.goto("/");
    const faqSection = page.locator("#faq");
    const viewAllLink = faqSection.getByRole("link", {
      name: /view all.*faqs/i,
    });
    await expect(viewAllLink).toBeVisible();
    await expect(viewAllLink).toHaveAttribute("href", "/help");
  });
});
