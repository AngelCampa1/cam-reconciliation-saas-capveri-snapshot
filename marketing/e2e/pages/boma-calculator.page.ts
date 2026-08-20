/**
 * BomaCalculatorPage - marketing BOMA 2024 calculator tool
 *
 * Selectors from Boma2024CalculatorClient.tsx
 */
import { type Page, type Locator } from "@playwright/test";

export class BomaCalculatorPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get usableSfInput(): Locator {
    return this.page.getByRole("spinbutton", { name: "Existing usable SF" });
  }

  get rentableSfInput(): Locator {
    return this.page.getByRole("spinbutton", { name: "Existing rentable SF" });
  }

  get hiddenSfResult(): Locator {
    return this.page.getByText("Hidden Rentable SF Found").locator("..");
  }

  get pctIncreaseResult(): Locator {
    return this.page.getByText("% Increase in Rentable Area").locator("..");
  }

  // Gated results (after email unlock)
  get revenueLiftResult(): Locator {
    return this.page.getByText("Annual Revenue Lift").locator("..");
  }

  get assetLiftResult(): Locator {
    return this.page.getByText("Asset Value Lift").locator("..");
  }

  // Email unlock gate
  get emailUnlockInput(): Locator {
    return this.page.locator('input[type="email"]');
  }

  async submitUnlock(): Promise<void> {
    await this.page
      .getByRole("button", { name: /unlock|submit|get results/i })
      .click();
  }
}
