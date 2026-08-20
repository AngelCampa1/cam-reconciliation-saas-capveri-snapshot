import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import type { LaunchPhaseData } from "@/lib/launch-phase";

const { mockTrackMarketingEvent, mockUseActiveLaunchPhase } = vi.hoisted(
  () => ({
    mockTrackMarketingEvent: vi.fn(),
    mockUseActiveLaunchPhase: vi.fn<() => LaunchPhaseData>(() => ({
      code: "80OFF",
      label: "80% off the first year",
      discount_percent: 80,
      times_redeemed: 0,
      max_redemptions: 300,
      phase_index: 1,
      all_exhausted: false,
      ends_at: "2026-07-04T07:00:00Z",
      ends_at_display: "Friday, July 3",
    })),
  }),
);

vi.mock("@/lib/posthog", () => ({
  trackMarketingEvent: mockTrackMarketingEvent,
}));

vi.mock("@/lib/launch-phase", () => ({
  useActiveLaunchPhase: mockUseActiveLaunchPhase,
}));

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

import { PricingContent } from "@/components/PricingContent";

describe("PricingContent", () => {
  beforeEach(() => {
    mockUseActiveLaunchPhase.mockReturnValue({
      code: "80OFF",
      label: "80% off the first year",
      discount_percent: 80,
      times_redeemed: 0,
      max_redemptions: 300,
      phase_index: 1,
      all_exhausted: false,
      ends_at: "2026-07-04T07:00:00Z",
      ends_at_display: "Friday, July 3",
    });
  });

  it("renders the pricing positioning headline", () => {
    render(<PricingContent />);

    expect(
      screen.getByRole("heading", {
        name: /start free\. pay only when you keep it\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/keep your current property system/i),
    ).toBeInTheDocument();
  });

  it("shows the Reconcile calculator", () => {
    render(<PricingContent />);

    expect(screen.getByText("Reconcile")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/rentable units/i)[0]).toHaveValue(25);
  });

  it("shows Reconcile prices and unit bands", () => {
    const { container } = render(<PricingContent />);

    expect(screen.getAllByText(/\$998\/yr/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$4,990\/year/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/80OFF/i).length).toBeGreaterThan(0);
    expect(container.textContent).toContain("Limited time offer");
    expect(container.textContent).not.toContain("redemptions only");
    expect(container.textContent).toContain("after the first year");
    expect(screen.getByText(/2,501\+ units/i)).toBeInTheDocument();
  });

  it("shows the money-back guarantee before signup", () => {
    render(<PricingContent />);

    expect(screen.getByText("30-day money-back guarantee")).toBeInTheDocument();
    expect(
      screen.getAllByText(/refund from billing within 30 days/i).length,
    ).toBeGreaterThan(0);
  });

  it("renders the pricing faqs", () => {
    render(<PricingContent />);

    expect(screen.getByText("Is there a free trial?")).toBeInTheDocument();
    expect(screen.getByText("How much does CapVeri cost?")).toBeInTheDocument();
    expect(
      screen.getByText("How does the money-back guarantee work?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Can I see the price before I buy?"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/contact sales/i)).not.toBeInTheDocument();
  });

  it("fires a tracking event when the CTA is clicked", async () => {
    const user = userEvent.setup();
    render(<PricingContent />);

    mockTrackMarketingEvent.mockClear();
    await user.click(
      screen.getAllByRole("link", { name: /start free trial/i })[0],
    );

    expect(mockTrackMarketingEvent).toHaveBeenCalledWith(
      "cta_clicked",
      expect.objectContaining({
        button_text: "Start free trial",
        location: "pricing",
      }),
    );
  });

  it("passes the limited offer to checkout links", () => {
    render(<PricingContent />);

    expect(
      screen.getAllByRole("link", { name: /start free trial/i })[0],
    ).toHaveAttribute("href", expect.stringContaining("offer=80OFF"));
    expect(
      screen.getAllByRole("link", { name: /start free trial/i })[0],
    ).toHaveAttribute("href", expect.stringContaining("units=25"));
  });

  it("shows the offer deadline while the offer is active", () => {
    render(<PricingContent />);

    expect(
      screen.getAllByText(/offer ends friday, july 3\./i).length,
    ).toBeGreaterThan(0);
  });

  it("shows list pricing and omits the offer when the limited offer is exhausted", () => {
    mockUseActiveLaunchPhase.mockReturnValue({
      code: null,
      label: null,
      discount_percent: null,
      times_redeemed: 300,
      max_redemptions: 300,
      phase_index: 1,
      all_exhausted: true,
      ends_at: null,
      ends_at_display: null,
    });

    render(<PricingContent />);

    expect(screen.queryByText(/annual plan with 80OFF/i)).toBeNull();
    expect(screen.queryByText(/\$998\/yr/i)).toBeNull();
    expect(screen.getAllByText(/\$4,990\/yr/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: /start free trial/i })[0],
    ).not.toHaveAttribute("href", expect.stringContaining("offer=80OFF"));
  });
});
