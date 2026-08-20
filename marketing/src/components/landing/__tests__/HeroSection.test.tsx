import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroSection } from "../HeroSection";

describe("HeroSection", () => {
  it("leads with concrete CAM reconciliation positioning", () => {
    render(<HeroSection />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /bill cam correctly before statements go to tenants/i,
    );
    expect(
      screen.getByText(
        /cam reconciliation software for commercial property teams/i,
      ),
    ).toBeInTheDocument();
  });

  it("names the audience and existing systems", () => {
    render(<HeroSection />);
    expect(
      screen.getByText(/gl, rent roll, billed amounts/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/keep yardi, mri/i)).toBeInTheDocument();
  });

  it("shows the synthetic product preview and CTAs", () => {
    render(<HeroSection />);
    expect(
      screen.getByLabelText(/reconciliation dashboard/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /start free trial/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /see the workflow/i }),
    ).toHaveAttribute("href", "#how-it-works");
  });
});
