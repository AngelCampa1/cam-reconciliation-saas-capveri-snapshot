/**
 * Tool: HCAD Tax Normalizer (marketing site)
 *
 * Navigate to the HCAD normalizer tool page → fill known inputs → click Calculate
 * → assert recovery delta shows a non-zero dollar amount
 * → fill cap rate → assert capped amount differs from uncapped amount.
 *
 * Note: This tests the marketing site tool page (Next.js), not the app.
 *
 * Inputs model a real ARB recovery scenario. The recovery formula is:
 *   adjusted_base      = original_base - retroactive_adjustment
 *   original_passthru  = max(0, current_tax - original_base) * pro_rata
 *   corrected_passthru = max(0, current_tax - adjusted_base) * pro_rata
 *   recovery_delta     = corrected_passthru - original_passthru
 * current_year_tax must exceed the (adjusted) base year for a non-zero
 * recovery. base=1,000,000 / retro=150,000 (adjusted=850,000) /
 * current=1,350,000 / pro-rata=5% → original=17,500, corrected=25,000,
 * recovery_delta=$7,500.
 */
import { test, expect } from '@playwright/test'
import { HcadNormalizerPage } from '../pages/hcad-normalizer.page'

const MARKETING_BASE = process.env.MARKETING_BASE_URL || 'http://127.0.0.1:3007'

test.describe('Tool: HCAD Tax Normalizer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${MARKETING_BASE}/tools/hcad-tax-normalizer`)
    await expect(page.getByRole('heading', { name: /hcad|tax.*normaliz/i })).toBeVisible({
      timeout: 15000,
    })
  })

  test('calculates and shows non-zero recovery opportunity', async ({ page }) => {
    const normalizer = new HcadNormalizerPage(page)

    await normalizer.baseYearInput.fill('1000000')
    await normalizer.retroAdjInput.fill('150000')
    await normalizer.currentTaxInput.fill('1350000')
    await normalizer.proRataInput.fill('5')
    await normalizer.calculate()

    // Wait for the API result to render a dollar value (placeholder has no "$").
    await expect(normalizer.recoveryDeltaResult).toContainText('$', { timeout: 10000 })
    const deltaText = await normalizer.recoveryDeltaResult.textContent()
    expect(deltaText).toMatch(/\$7,500/)
    expect(deltaText).not.toMatch(/\$0\.?0*$/)
  })

  test('capped recovery differs from uncapped when cap rate is applied', async ({ page }) => {
    const normalizer = new HcadNormalizerPage(page)

    await normalizer.baseYearInput.fill('1000000')
    await normalizer.retroAdjInput.fill('150000')
    await normalizer.currentTaxInput.fill('1350000')
    await normalizer.proRataInput.fill('5')
    await normalizer.calculate()

    await expect(normalizer.recoveryDeltaResult).toContainText('$', { timeout: 10000 })
    const uncappedText = await normalizer.recoveryDeltaResult.textContent()

    // Apply a 3% cap. max_allowed = 17,500 * 1.03 = 18,025 < corrected 25,000,
    // so the cap binds: capped_recovery = 18,025 - 17,500 = $525 (≠ $7,500).
    await normalizer.capRateInput.fill('3')
    await normalizer.calculate()

    // The "Capped recovery" block only renders once a cap rate is supplied.
    await expect(normalizer.cappedRecoveryResult).toBeVisible({ timeout: 10000 })
    await expect(normalizer.cappedRecoveryResult).toContainText('$525')
    const cappedText = await normalizer.cappedRecoveryResult.textContent()
    expect(cappedText).not.toEqual(uncappedText)
  })
})
