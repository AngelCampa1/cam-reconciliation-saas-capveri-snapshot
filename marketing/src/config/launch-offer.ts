import { publicKnowledge } from "@/generated/public-knowledge";
import {
  getAnnualTotal,
  getLaunchOfferAnnualPrice,
  type TierId,
} from "@/generated/plan-tiers";

type SelfServeTierId = Extract<TierId, "reconcile">;

export const LAUNCH_OFFER_CODE = publicKnowledge.pricing.launchOffer.code;

export const LAUNCH_OFFER = {
  code: LAUNCH_OFFER_CODE,
  label: publicKnowledge.pricing.launchOffer.label,
  discountPercent: publicKnowledge.pricing.launchOffer.discountPercent,
  checkoutParam: publicKnowledge.pricing.launchOffer.checkoutParam,
  maxRedemptions:
    publicKnowledge.pricing.launchOffer.phases[0]?.maxRedemptions ?? 300,
  terms: `${publicKnowledge.pricing.launchOffer.label}.`,
  endsAt: publicKnowledge.pricing.launchOffer.endsAt ?? null,
  endsAtDisplay: publicKnowledge.pricing.launchOffer.endsAtDisplay ?? null,
  endsLabel: publicKnowledge.pricing.display.launchOfferEndsLabel ?? null,
} as const;

/**
 * Whether the launch offer is still within its deadline window.
 * Mirrors the backend gate (offer is live only strictly before `endsAt`;
 * at the exact UTC boundary it is over). A null `endsAt` means no deadline.
 */
export function isLaunchOfferLive(now: Date = new Date()): boolean {
  if (!LAUNCH_OFFER.endsAt) return true;
  return now.getTime() < new Date(LAUNCH_OFFER.endsAt).getTime();
}

export function isLaunchOfferTier(tierId: TierId): tierId is SelfServeTierId {
  return tierId === "reconcile";
}

export function getLaunchOfferPrice(
  tierId: TierId,
  unitCount = 1,
): number | null {
  if (!isLaunchOfferTier(tierId)) return null;
  return getLaunchOfferAnnualPrice(tierId, unitCount);
}

export function formatLaunchOfferPrice(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Compute limited-offer price from the configured discount percent. */
export function getLaunchOfferPriceForPercent(
  tierId: TierId,
  discountPercent: number,
  unitCount = 1,
): number | null {
  const annualTotal = getAnnualTotal(tierId, unitCount);
  if (annualTotal == null) return null;
  return Math.ceil(annualTotal * (1 - discountPercent / 100));
}
