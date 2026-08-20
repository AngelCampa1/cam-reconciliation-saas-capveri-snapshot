/**
 * Subscription pricing configuration and ROI calculator.
 *
 * Tier definitions and features come from the generated plan-tiers module (auto-generated).
 * Pricing helpers convert to cents for Stripe integration.
 */

import {
  getAnnualPrice as _getAnnualPrice,
  getAnnualTotal as _getAnnualTotal,
} from '@/generated/plan-tiers'

export {
  TIERS,
  FEATURES,
  TRIAL_DAYS,
  getAnnualPrice,
  getAnnualTotal,
  getBandForCount,
  getFeaturesForTier,
  hasFeature,
  type TierId,
  type SubscriptionTier,
  type FeatureKey,
  type PlanFeature,
} from '@/generated/plan-tiers'

export const TIER_ORDER: Record<string, number> = {
  reconcile: 0,
}

export interface RoiAssumptionSet {
  officeOpexPerSf2023: number
  cpi2023: number
  cpi2025: number
  averageBuildingSf: number
  lowLeakageRate: number
  averageLeakageRate: number
  highLeakageRate: number
}

export const ROI_ASSUMPTIONS_2026: RoiAssumptionSet = {
  officeOpexPerSf2023: 11.15,
  cpi2023: 304.7,
  cpi2025: 321.9,
  averageBuildingSf: 200000,
  lowLeakageRate: 0.0025,
  averageLeakageRate: 0.0075,
  highLeakageRate: 0.015,
}

/** Returns annual price in cents for a given tier. */
export function getAnnualPriceCents(
  tierId: Parameters<typeof _getAnnualPrice>[0]
): number | null {
  const price = _getAnnualPrice(tierId)
  return price == null ? null : price * 100
}

/**
 * Estimated CAM billing-error exposure based on industry data.
 * The pricing calculator uses rentable units as the self-serve value metric.
 */
export function estimateAnnualRecovery(unitCount: number): {
  low: number
  high: number
  average: number
} {
  const inflationFactor =
    ROI_ASSUMPTIONS_2026.cpi2025 / ROI_ASSUMPTIONS_2026.cpi2023
  const opexPerSf2025 =
    ROI_ASSUMPTIONS_2026.officeOpexPerSf2023 * inflationFactor
  const annualPoolPerBuilding =
    opexPerSf2025 * ROI_ASSUMPTIONS_2026.averageBuildingSf
  const perAuditLow =
    annualPoolPerBuilding * ROI_ASSUMPTIONS_2026.lowLeakageRate
  const perAuditHigh =
    annualPoolPerBuilding * ROI_ASSUMPTIONS_2026.highLeakageRate
  const perAuditAvg =
    annualPoolPerBuilding * ROI_ASSUMPTIONS_2026.averageLeakageRate

  return {
    low: Math.round(perAuditLow * unitCount),
    high: Math.round(perAuditHigh * unitCount),
    average: Math.round(perAuditAvg * unitCount),
  }
}

/**
 * Calculate value-to-cost multiplier for a subscription tier given rentable unit count.
 * Compares the annual subscription cost vs. modeled billing-error exposure.
 */
export function calculateSubscriptionROI(
  tierId: Parameters<typeof _getAnnualPrice>[0],
  unitCount: number
): number {
  const annualCost = _getAnnualTotal(tierId, unitCount)
  if (annualCost == null || annualCost === 0 || unitCount === 0) return 0
  const recovery = estimateAnnualRecovery(unitCount)
  return Math.round(recovery.average / annualCost)
}
