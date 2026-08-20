import { describe, it, expect } from "vitest";
import * as landing from "@/components/landing";

describe("landing/index barrel exports", () => {
  it("exports HeroSection", () => {
    expect(landing.HeroSection).toBeDefined();
  });

  it("exports LandingPageClient", () => {
    expect(landing.LandingPageClient).toBeDefined();
  });

  it("exports ValuePropositionSection", () => {
    expect(landing.ValuePropositionSection).toBeDefined();
  });

  it("exports HowItWorksSection", () => {
    expect(landing.HowItWorksSection).toBeDefined();
  });

  it("exports FeaturesGrid", () => {
    expect(landing.FeaturesGrid).toBeDefined();
  });

  it("exports CTASection", () => {
    expect(landing.CTASection).toBeDefined();
  });

  it("exports FAQSection", () => {
    expect(landing.FAQSection).toBeDefined();
  });

  it("exports LANDING_FAQS as an array", () => {
    expect(Array.isArray(landing.LANDING_FAQS)).toBe(true);
    expect(landing.LANDING_FAQS.length).toBeGreaterThan(0);
  });

  it("exports SocialProofStrip", () => {
    expect(landing.SocialProofStrip).toBeDefined();
  });

  it("exports PricingTeaser", () => {
    expect(landing.PricingTeaser).toBeDefined();
  });
});
