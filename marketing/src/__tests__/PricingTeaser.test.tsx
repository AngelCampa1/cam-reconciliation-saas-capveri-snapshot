import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
  }) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

beforeAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.capveri.com";
});

import { PricingTeaser } from "@/components/landing/PricingTeaser";

describe("PricingTeaser", () => {
  it("renders the Reconcile pricing teaser headline", () => {
    render(<PricingTeaser />);

    expect(
      screen.getByText(/one plan, priced by your units/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/30-day free trial/i)).toBeInTheDocument();
  });

  it("shows Reconcile minimum pricing", () => {
    render(<PricingTeaser />);

    expect(screen.getAllByText(/\$998\/yr/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$4,990/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/80OFF/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Limited time offer/i).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(/after the first year/i).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByText(/Reconcile has a 30-day money-back guarantee/i),
    ).toBeInTheDocument();
  });

  it("links to the app trial flow and full pricing page", () => {
    render(<PricingTeaser />);

    const trialLink = screen.getByRole("link", { name: /start free trial/i });
    expect(trialLink).toHaveAttribute(
      "href",
      expect.stringContaining("plan=reconcile"),
    );
    expect(trialLink).toHaveAttribute(
      "href",
      expect.stringContaining("units=25"),
    );
    expect(trialLink).toHaveAttribute(
      "href",
      expect.stringContaining("offer=80OFF"),
    );
    expect(
      screen.getByRole("link", { name: /see full pricing/i }),
    ).toHaveAttribute("href", "/pricing");
  });
});
