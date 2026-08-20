import { describe, expect, it } from 'vitest'
import {
  FEATURES,
  TIERS,
  TRIAL_DAYS,
  getAnnualPrice,
  getAnnualPriceCents,
  getAnnualTotal,
  getBandForCount,
  getFeaturesForTier,
  hasFeature,
  estimateAnnualRecovery,
  calculateSubscriptionROI,
  ROI_ASSUMPTIONS_2026,
} from './plans'
import { LAUNCH_OFFER, getLaunchOfferPrice } from './launch-offer'

describe('TIERS', () => {
  it('defines the unit-priced Reconcile subscription', () => {
    expect(TIERS).toEqual([
      expect.objectContaining({
        id: 'reconcile',
        baseAnnual: 4990,
        includedUnits: 25,
        minUnits: 1,
        maxUnits: null,
        unitPricingBands: [
          { minUnits: 26, maxUnits: 150, pricePerUnitAnnual: 179 },
          { minUnits: 151, maxUnits: 500, pricePerUnitAnnual: 169 },
          { minUnits: 501, maxUnits: 2500, pricePerUnitAnnual: 159 },
          { minUnits: 2501, maxUnits: null, pricePerUnitAnnual: 149 },
        ],
      }),
    ])
  })
})

describe('trial and features', () => {
  it('keeps the 30-day trial', () => {
    expect(TRIAL_DAYS).toBe(30)
  })

  it('includes all workflow features in Reconcile', () => {
    const reconcileFeatures = getFeaturesForTier('reconcile')

    expect(reconcileFeatures).toContain('camReconciliation')
    expect(reconcileFeatures).toContain('aiLeaseExtraction')
    expect(reconcileFeatures).toContain('tenantPortal')
    expect(reconcileFeatures).toContain('prioritySupport')
    expect(
      FEATURES.some((feature) => feature.key === 'onboardingSupport')
    ).toBe(true)
    expect(hasFeature('reconcile', 'onboardingSupport')).toBe(true)
  })
})

describe('pricing helpers', () => {
  it('returns the Reconcile base price', () => {
    expect(getAnnualPrice('reconcile')).toBe(4990)
  })

  it('returns cents for Stripe helpers', () => {
    expect(getAnnualPriceCents('reconcile')).toBe(499000)
  })

  it('calculates progressive annual unit-band totals', () => {
    expect(getAnnualTotal('reconcile', 25)).toBe(4990)
    expect(getAnnualTotal('reconcile', 26)).toBe(5169)
    expect(getAnnualTotal('reconcile', 150)).toBe(27365)
    expect(getAnnualTotal('reconcile', 151)).toBe(27534)
    expect(getAnnualTotal('reconcile', 500)).toBe(86515)
    expect(getAnnualTotal('reconcile', 501)).toBe(86674)
    expect(getAnnualTotal('reconcile', 2500)).toBe(404515)
    expect(getAnnualTotal('reconcile', 2501)).toBe(404664)
  })

  it('exposes the 80OFF offer prices used by checkout and pricing surfaces', () => {
    expect(LAUNCH_OFFER).toMatchObject({
      code: '80OFF',
      label: '80% off the first year',
      discountPercent: 80,
    })
    expect(getLaunchOfferPrice('reconcile')).toBe(998)
    expect(getLaunchOfferPrice('reconcile', 151)).toBe(5507)
  })

  it('keeps every unit count on Reconcile', () => {
    expect(getBandForCount(1)).toBe('reconcile')
    expect(getBandForCount(50)).toBe('reconcile')
    expect(getBandForCount(2501)).toBe('reconcile')
  })
})

describe('bill-risk and value-to-cost helpers', () => {
  it('keeps the modeled bill-risk assumptions', () => {
    expect(ROI_ASSUMPTIONS_2026).toMatchObject({
      officeOpexPerSf2023: 11.15,
      cpi2023: 304.7,
      cpi2025: 321.9,
      averageBuildingSf: 200000,
      lowLeakageRate: 0.0025,
      averageLeakageRate: 0.0075,
      highLeakageRate: 0.015,
    })
  })

  it('scales modeled bill risk by unit count', () => {
    expect(estimateAnnualRecovery(1)).toEqual({
      low: 5890,
      high: 35338,
      average: 17669,
    })
    expect(estimateAnnualRecovery(10)).toEqual({
      low: 58897,
      high: 353382,
      average: 176691,
    })
  })

  it('calculates value-to-cost against annual package totals', () => {
    expect(calculateSubscriptionROI('reconcile', 25)).toBe(
      Math.round(estimateAnnualRecovery(25).average / 4990)
    )
    expect(calculateSubscriptionROI('reconcile', 0)).toBe(0)
  })
})
