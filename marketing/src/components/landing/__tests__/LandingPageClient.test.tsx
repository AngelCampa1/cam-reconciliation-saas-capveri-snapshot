import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LandingPageClient } from "../LandingPageClient";

// Mock neutral sections to keep tests focused on homepage clarity orchestration.
vi.mock("@/components/landing/SocialProofStrip", () => ({
  SocialProofStrip: () => null,
}));
vi.mock("@/components/landing/HowItWorksSection", () => ({
  HowItWorksSection: () => null,
}));
vi.mock("@/components/landing/ProductDemoSection", () => ({
  ProductDemoSection: () => null,
}));
vi.mock("@/components/landing/FeaturesGrid", () => ({
  FeaturesGrid: () => null,
}));
vi.mock("@/components/landing/FAQSection", () => ({
  FAQSection: () => null,
}));
vi.mock("@/components/landing/PricingTeaser", () => ({
  PricingTeaser: () => null,
}));

describe("LandingPageClient", () => {
  it("renders the universal hero", () => {
    render(<LandingPageClient />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /bill cam correctly before statements go to tenants/i,
    );
  });

  it("shows universal homepage clarity content", () => {
    render(<LandingPageClient />);
    expect(
      screen.getByText(/you fix both before the packet reaches tenants/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cam closeout is too important for spreadsheets/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cam closeout is too important for spreadsheets/i),
    ).toBeInTheDocument();
  });

  it("does not expose hero persona switching controls", () => {
    render(<LandingPageClient />);
    expect(
      screen.queryByRole("group", { name: /select your role/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render the homepage ROI calculator claims", () => {
    render(<LandingPageClient />);
    expect(screen.queryByText(/roi calculator/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/revenue leakage/i)).not.toBeInTheDocument();
  });
});
