import { describe, expect, it } from "vitest";
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
} from "@/config/plans";
import { LAUNCH_OFFER, getLaunchOfferPrice } from "@/config/launch-offer";

describe("marketing pricing config", () => {
  it("defines the unit-priced Reconcile subscription", () => {
    expect(TIERS[0]).toMatchObject({
      id: "reconcile",
      baseAnnual: 4990,
      includedUnits: 25,
      minUnits: 1,
      maxUnits: null,
    });
    expect(TIERS).toHaveLength(1);
  });

  it("keeps a 30-day free trial and includes all features in Reconcile", () => {
    const reconcileFeatures = getFeaturesForTier("reconcile");

    expect(TRIAL_DAYS).toBe(30);
    expect(reconcileFeatures).toContain("camReconciliation");
    expect(reconcileFeatures).toContain("aiLeaseExtraction");
    expect(reconcileFeatures).toContain("tenantPortal");
    expect(reconcileFeatures).toContain("prioritySupport");
    expect(hasFeature("reconcile", "onboardingSupport")).toBe(true);
    expect(
      FEATURES.some((feature) => feature.key === "onboardingSupport"),
    ).toBe(true);
  });

  it("returns base prices, cents, and progressive unit-band totals", () => {
    expect(getAnnualPrice("reconcile")).toBe(4990);
    expect(getAnnualPriceCents("reconcile")).toBe(499000);
    expect(getAnnualTotal("reconcile", 25)).toBe(4990);
    expect(getAnnualTotal("reconcile", 26)).toBe(5169);
    expect(getAnnualTotal("reconcile", 150)).toBe(27365);
    expect(getAnnualTotal("reconcile", 151)).toBe(27534);
    expect(getAnnualTotal("reconcile", 500)).toBe(86515);
    expect(getAnnualTotal("reconcile", 2501)).toBe(404664);
  });

  it("defines 80OFF offer prices separately from list prices", () => {
    expect(LAUNCH_OFFER).toMatchObject({
      code: "80OFF",
      label: "80% off the first year",
      discountPercent: 80,
    });
    expect(getLaunchOfferPrice("reconcile")).toBe(998);
    expect(getLaunchOfferPrice("reconcile", 151)).toBe(5507);
  });

  it("keeps every unit count on Reconcile", () => {
    expect(getBandForCount(1)).toBe("reconcile");
    expect(getBandForCount(50)).toBe("reconcile");
    expect(getBandForCount(2501)).toBe("reconcile");
  });

  it("scales modeled recovery and ROI by unit count", () => {
    expect(estimateAnnualRecovery(1)).toEqual({
      low: 5890,
      high: 35338,
      average: 17669,
    });
    expect(estimateAnnualRecovery(10)).toEqual({
      low: 58897,
      high: 353382,
      average: 176691,
    });
    expect(calculateSubscriptionROI("reconcile", 25)).toBe(
      Math.round(estimateAnnualRecovery(25).average / 4990),
    );
  });
});
