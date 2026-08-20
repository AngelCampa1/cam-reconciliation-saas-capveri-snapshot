import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroSection } from "./HeroSection";

describe("HeroSection", () => {
  it("renders concrete CAM reconciliation headline", () => {
    render(<HeroSection />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /bill cam correctly before statements go to tenants/i,
    );
  });

  it("renders primary and secondary CTAs", () => {
    render(<HeroSection />);
    expect(
      screen.getByRole("link", {
        name: /start free trial/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /see the workflow/i }),
    ).toHaveAttribute("href", "#how-it-works");
  });

  it("does not render old persona-led hero copy", () => {
    render(<HeroSection />);
    expect(screen.queryByText(/cre finops platform/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/material errors/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/reclaim 300 hours of cam reconciliation/i),
    ).not.toBeInTheDocument();
  });
});
