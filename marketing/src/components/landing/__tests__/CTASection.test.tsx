import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CTASection } from "../CTASection";

describe("CTASection", () => {
  it("renders universal concrete CTA copy", () => {
    render(<CTASection />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /run one cam file before your next billing/i,
    );
    expect(
      screen.getByText(/upload your gl, rent roll, and lease files/i),
    ).toBeInTheDocument();
  });

  it("renders the primary CTA and non-stat trust indicators", () => {
    render(<CTASection />);
    expect(
      screen.getByRole("link", {
        name: /start free trial/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/works with existing erp exports/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/deterministic cam calculations/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/tenant-ready support packet/i),
    ).toBeInTheDocument();
  });

  it("does not render unsupported bottom CTA claims", () => {
    render(<CTASection />);
    expect(
      screen.queryByText(/most landlords find significant billing errors/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/no tenant disputes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/results in minutes/i)).not.toBeInTheDocument();
  });
});
