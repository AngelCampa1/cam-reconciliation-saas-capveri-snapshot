import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PricingTeaser } from "../PricingTeaser";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe("PricingTeaser", () => {
  it("renders subscription tier features from catalog", () => {
    render(<PricingTeaser />);
    expect(screen.getAllByText("GL import and parsing").length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("CAM reconciliation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Exception summary").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Expense pool management").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Lease management and versioning").length,
    ).toBeGreaterThan(0);
  });

  it("shows 30-day free trial messaging", () => {
    const { container } = render(<PricingTeaser />);
    expect(container.textContent).toMatch(/30-day free trial/i);
    expect(container.textContent).toMatch(/30-day money-back guarantee/i);
  });
});
