/**
 * Subscription pricing configuration and ROI calculator.
 *
 * Tier definitions and features come from the generated plan-tiers module (auto-generated).
 * Pricing helpers convert to cents for Stripe integration.
 */

import {
  getAnnualPrice as _getAnnualPrice,
  getAnnualTotal as _getAnnualTotal,
  TIERS as _TIERS,
} from "@/generated/plan-tiers";
import { publicKnowledge } from "@/generated/public-knowledge";

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
} from "@/generated/plan-tiers";

import type { TierId, SubscriptionTier } from "@/generated/plan-tiers";

/** Returns a tier by id, throws if not found. */
export function getTier(tierId: TierId): SubscriptionTier {
  const tier = _TIERS.find((t) => t.id === tierId);
  if (!tier) throw new Error(`Unknown tier: ${tierId}`);
  return tier;
}

/** Returns display labels for a tier from public-knowledge (annualLabel, limit, etc.). */
export function getTierDisplay(tierId: TierId) {
  const tier = publicKnowledge.pricing.tiers.find((t) => t.id === tierId);
  if (!tier) throw new Error(`Unknown tier: ${tierId}`);
  return tier.display;
}

/** Returns the full extended tier from public-knowledge (tagline, audience, comparisonLabel, primaryCta, display, etc.). */
export function getTierPublic(tierId: TierId) {
  const tier = publicKnowledge.pricing.tiers.find((t) => t.id === tierId);
  if (!tier) throw new Error(`Unknown tier: ${tierId}`);
  return tier;
}

/** Returns the schema.org Offer object for a tier, throws if not found. */
export function getTierSchemaOffer(tierId: TierId) {
  const offer = publicKnowledge.pricing.schemaOffersByTier[tierId];
  if (!offer) throw new Error(`No schema offer for tier: ${tierId}`);
  return offer;
}

/** Returns the primary CTA for a tier. */
export function getTierPrimaryCta(tierId: TierId) {
  const tier = publicKnowledge.pricing.tiers.find((t) => t.id === tierId);
  if (!tier) throw new Error(`Unknown tier: ${tierId}`);
  return tier.primaryCta;
}

const TIER_ORDER: TierId[] = ["reconcile"];

/** Returns all product features available at a given tier (includes features from lower tiers). */
export function getProductFeaturesByTier(tierId: TierId) {
  const targetIndex = TIER_ORDER.indexOf(tierId);
  return publicKnowledge.productFeatures.filter((f) => {
    const tierIndex = TIER_ORDER.indexOf(f.tier as TierId);
    return tierIndex >= 0 && tierIndex <= targetIndex;
  });
}

/** Returns all product features belonging to a specific domain. */
export function getProductFeaturesByDomain(domain: string) {
  return publicKnowledge.productFeatures.filter((f) => f.domain === domain);
}

/** All feature domains with id, label, and summary. */
export const PRODUCT_FEATURE_DOMAINS = publicKnowledge.featureDomains;

/** SEO-ready list of all product feature names. */
export const SEO_FEATURE_LIST = publicKnowledge.seoFeatureList;

export type ClaimClassification = "benchmark" | "modeled" | "internal";

export interface RoiAssumptionSet {
  officeOpexPerSf2023: number;
  cpi2023: number;
  cpi2025: number;
  averageBuildingSf: number;
  lowLeakageRate: number;
  averageLeakageRate: number;
  highLeakageRate: number;
}

export interface MonetaryClaimEvidence {
  id: string;
  label: string;
  classification: ClaimClassification;
  sourcePath: string;
}

export const ROI_ASSUMPTIONS_2026: RoiAssumptionSet = {
  officeOpexPerSf2023: 11.15,
  cpi2023: 304.7,
  cpi2025: 321.9,
  averageBuildingSf: 200_000,
  lowLeakageRate: 0.0025,
  averageLeakageRate: 0.0075,
  highLeakageRate: 0.015,
};

export const ROI_EVIDENCE: MonetaryClaimEvidence[] = [
  {
    id: "irem-office-opex-2023",
    label: "IREM office operating expense benchmark ($11.15/SF, 2023)",
    classification: "benchmark",
    sourcePath: "/sources#irem-office-opex-2023",
  },
  {
    id: "modeled-leakage-scenarios",
    label: "Modeled billing-error scenarios (0.25%, 0.75%, 1.5%)",
    classification: "modeled",
    sourcePath: "/sources#modeled-leakage-scenarios",
  },
];

/** Returns annual price in cents for a given tier. */
export function getAnnualPriceCents(
  tierId: Parameters<typeof _getAnnualPrice>[0],
): number | null {
  const price = _getAnnualPrice(tierId);
  return price !== null ? price * 100 : null;
}

/**
 * Estimated CAM billing-error exposure based on industry data.
 * The pricing calculator uses rentable units as the self-serve value metric.
 */
export function estimateAnnualRecovery(unitCount: number): {
  low: number;
  high: number;
  average: number;
} {
  const inflationFactor =
    ROI_ASSUMPTIONS_2026.cpi2025 / ROI_ASSUMPTIONS_2026.cpi2023;
  const opexPerSf2025 =
    ROI_ASSUMPTIONS_2026.officeOpexPerSf2023 * inflationFactor;
  const annualPoolPerBuilding =
    opexPerSf2025 * ROI_ASSUMPTIONS_2026.averageBuildingSf;
  const perAuditLow =
    annualPoolPerBuilding * ROI_ASSUMPTIONS_2026.lowLeakageRate;
  const perAuditHigh =
    annualPoolPerBuilding * ROI_ASSUMPTIONS_2026.highLeakageRate;
  const perAuditAvg =
    annualPoolPerBuilding * ROI_ASSUMPTIONS_2026.averageLeakageRate;

  return {
    low: Math.round(perAuditLow * unitCount),
    high: Math.round(perAuditHigh * unitCount),
    average: Math.round(perAuditAvg * unitCount),
  };
}

/**
 * Calculate ROI multiplier for a subscription tier given rentable unit count.
 * Compares annual subscription cost vs. modeled billing-error exposure.
 * Returns 0 for 0 rentable units.
 */
export function calculateSubscriptionROI(
  tierId: Parameters<typeof _getAnnualPrice>[0],
  unitCount: number,
): number {
  if (unitCount === 0) return 0;
  const annualCost = _getAnnualTotal(tierId, unitCount);
  if (annualCost === null) return 0;
  if (annualCost === 0) return 0;
  const recovery = estimateAnnualRecovery(unitCount);
  return Math.round(recovery.average / annualCost);
}
