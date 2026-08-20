/**
 * Tool: BOMA 2024 Calculator (marketing site)
 *
 * Navigate to the BOMA calculator tool page → fill the inputs the component
 * actually requires (usable SF, rentable SF, balcony SF, annual rent per SF)
 * → assert hidden rentable SF + % increase render → pre-unlock the financial
 * gate → assert the gated revenue/asset lift render.
 *
 * Note: This tests the marketing site tool page (Next.js), not the app.
 *
 * Calculation (backend boma_2024.py):
 *   load_factor   = rentable / usable               = 11,200 / 10,000 = 1.12
 *   new_usable    = usable + balcony + terrace + amenity = 10,000 + 1,200 = 11,200
 *   new_rentable  = new_usable * load_factor         = 11,200 * 1.12 = 12,544
 *   hidden_sf     = max(0, new_rentable - rentable)  = 12,544 - 11,200 = 1,344
 *   pct_increase  = hidden_sf / rentable * 100       = 1,344 / 11,200 = 12.00%
 *   revenue_lift  = hidden_sf * rent                 = 1,344 * 35 = $47,040
 * Asset lift is rendered client-side as
 *   round(revenue_lift / (capRate/100))              = 47,040 / 0.065 ≈ $723,692
 * (capRate default 6.5). The component auto-calculates via useEffect on input
 * change, so no submit button / Tab is required to trigger the result.
 */
import { test, expect } from '@playwright/test'
import { BomaCalculatorPage } from '../pages/boma-calculator.page'

const MARKETING_BASE = process.env.MARKETING_BASE_URL || 'http://127.0.0.1:3007'

test.describe('Tool: BOMA 2024 Calculator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${MARKETING_BASE}/tools/boma-2024-calculator`)
    await expect(page.getByRole('heading', { name: /boma/i })).toBeVisible({ timeout: 15000 })
  })

  test('computes hidden rentable SF and % increase from required inputs', async ({ page }) => {
    const calc = new BomaCalculatorPage(page)

    await calc.usableSfInput.fill('10000')
    await calc.rentableSfInput.fill('11200')
    await calc.balconySfInput.fill('1200')
    await calc.annualRentInput.fill('35')

    // Auto-calc runs on input change; wait for the computed SF to render.
    await expect(page.getByText(/1,344\s*SF/)).toBeVisible({ timeout: 10000 })
    // Component renders pct as parseFloat(...).toFixed(2) + '%' → "12.00%".
    await expect(page.getByText(/12\.00\s*%/)).toBeVisible({ timeout: 5000 })
  })

  test('reveals gated revenue and asset lift once the gate is unlocked', async ({ page }) => {
    const calc = new BomaCalculatorPage(page)

    // Unlock the financial-projections gate the way a returning visitor is
    // (localStorage flag → auto-unlock on mount), avoiding the Turnstile /
    // lead-magnet-storage dependencies the real submit path needs locally.
    await calc.preUnlockGate()

    await calc.usableSfInput.fill('10000')
    await calc.rentableSfInput.fill('11200')
    await calc.balconySfInput.fill('1200')
    await calc.annualRentInput.fill('35')

    await expect(page.getByText(/1,344\s*SF/)).toBeVisible({ timeout: 10000 })

    await expect(calc.revenueLiftResult).toContainText('$47,040', { timeout: 10000 })
    await expect(calc.assetLiftResult).toContainText(/\$723,69/)
  })
})
