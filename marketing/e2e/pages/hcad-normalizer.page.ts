/**
 * HcadNormalizerPage - marketing HCAD Tax Normalizer tool
 *
 * Selectors from HcadTaxNormalizerClient.tsx
 */
import { type Page, type Locator } from "@playwright/test";

export class HcadNormalizerPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get baseYearInput(): Locator {
    return this.page.getByRole("spinbutton", {
      name: "Original base year assessment",
    });
  }

  get retroAdjInput(): Locator {
    return this.page.getByRole("spinbutton", {
      name: "ARB retroactive reduction",
    });
  }

  get currentTaxInput(): Locator {
    return this.page.getByRole("spinbutton", {
      name: "Current year property tax",
    });
  }

  get proRataInput(): Locator {
    return this.page.getByRole("spinbutton", { name: "Tenant pro-rata share" });
  }

  get capRateInput(): Locator {
    return this.page.getByRole("spinbutton", { name: "Expense cap rate" });
  }

  get calculateButton(): Locator {
    return this.page.getByRole("button", { name: "Calculate Recovery" });
  }

  get recoveryDeltaResult(): Locator {
    return this.page.getByText("Recovery opportunity").locator("..");
  }

  get cappedRecoveryResult(): Locator {
    return this.page.getByText("Capped recovery").locator("..");
  }

  async calculate(): Promise<void> {
    await this.calculateButton.click();
  }
}
