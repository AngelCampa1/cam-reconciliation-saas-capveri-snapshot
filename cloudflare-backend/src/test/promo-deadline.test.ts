import { describe, it, expect } from "vitest";
import publicKnowledge from "../generated/public-knowledge.json";
import { LAUNCH_OFFER } from "../domain/billing/plan-tiers";

describe("launch offer deadline parity", () => {
  it("CF LAUNCH_OFFER matches the generated SSOT (public-knowledge.json)", () => {
    const ssot = publicKnowledge.pricing.launchOffer;
    expect(LAUNCH_OFFER.ends_at).toBe(ssot.endsAt);
    expect(LAUNCH_OFFER.code).toBe(ssot.code);
    expect(LAUNCH_OFFER.discount_percent).toBe(ssot.discountPercent);
  });
});
