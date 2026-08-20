import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CamBillingErrorEstimatorPage } from "./CamBillingErrorEstimatorClient";

const {
  identifyMarketingLeadMock,
  isTurnstileConfiguredMock,
  trackMarketingEventMock,
} = vi.hoisted(() => ({
  identifyMarketingLeadMock: vi.fn(),
  isTurnstileConfiguredMock: vi.fn(() => false),
  trackMarketingEventMock: vi.fn(),
}));

vi.mock("@/lib/posthog", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/posthog")>("@/lib/posthog");
  return {
    ...actual,
    identifyMarketingLead: identifyMarketingLeadMock,
    trackMarketingEvent: trackMarketingEventMock,
  };
});

vi.mock("@/components/content/ToolPageLayout", () => ({
  ToolPageLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

vi.mock("@/components/TurnstileWidget", () => ({
  TurnstileWidget: () => <div data-testid="turnstile-widget" />,
  isTurnstileConfigured: isTurnstileConfiguredMock,
}));

describe("CamBillingErrorEstimatorPage analytics", () => {
  beforeEach(() => {
    trackMarketingEventMock.mockClear();
    identifyMarketingLeadMock.mockClear();
    isTurnstileConfiguredMock.mockReturnValue(false);
    global.fetch = vi.fn();
  });

  it("tracks first result view after the estimator has enough inputs", async () => {
    const user = userEvent.setup();
    render(<CamBillingErrorEstimatorPage />);

    await user.type(screen.getByLabelText("Average rentable SF"), "250000");

    await waitFor(() => {
      expect(trackMarketingEventMock).toHaveBeenCalledWith(
        "tool_result_viewed",
        expect.objectContaining({
          slug: "cam-leakage-estimator",
          buildings: 1,
          avg_sf_bucket: "250k_999k",
          leakage_low: 5312.5,
          leakage_high: 31875,
          estimate_low: 5312.5,
          estimate_high: 31875,
          direction_scope: "over_and_under_bill",
        }),
      );
      expect(trackMarketingEventMock).toHaveBeenCalledWith(
        "lead_form_result_seen",
        expect.objectContaining({
          slug: "cam-leakage-estimator",
          result_type: "modeled_estimate",
          source: "cam_billing_error_estimator",
          buildings: 1,
          avg_sf_bucket: "250k_999k",
          estimate_low: 5312.5,
          estimate_high: 31875,
          direction_scope: "over_and_under_bill",
        }),
      );
    });
  });

  it("does not track result views for implausibly small partial square-foot inputs", async () => {
    const user = userEvent.setup();
    render(<CamBillingErrorEstimatorPage />);

    await user.type(screen.getByLabelText("Average rentable SF"), "2");

    await new Promise((resolve) => window.setTimeout(resolve, 450));

    expect(trackMarketingEventMock).not.toHaveBeenCalledWith(
      "tool_result_viewed",
      expect.anything(),
    );
  });

  it("tracks the post-result CTA with result state", async () => {
    const user = userEvent.setup();
    render(<CamBillingErrorEstimatorPage />);

    await user.type(screen.getByLabelText("Average rentable SF"), "75000");
    await user.click(
      screen.getByRole("link", {
        name: /check my actual gl/i,
      }),
    );

    expect(trackMarketingEventMock).toHaveBeenCalledWith(
      "cta_clicked",
      expect.objectContaining({
        button_text: "Check my actual GL",
        location: "cam_billing_error_estimator_result",
        slug: "cam-leakage-estimator",
        has_result: true,
      }),
    );
  });

  it("frames the estimate as modeled billing mistakes before email capture", () => {
    render(<CamBillingErrorEstimatorPage />);

    expect(
      screen.getByText(/They may be over-bills or under-bills/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/model uses benchmark rates/i)).toBeInTheDocument();
    expect(
      screen.getByText(/CAM billing mistakes cut both ways/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/work email/i)).not.toBeInTheDocument();
  });

  it("shows worksheet email capture only after the modeled result is tracked", async () => {
    const user = userEvent.setup();
    render(<CamBillingErrorEstimatorPage />);

    await user.type(screen.getByLabelText("Average rentable SF"), "250000");
    expect(screen.queryByLabelText(/your work email/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText(/your work email/i)).toBeInTheDocument();
    });

    const resultSeenIndex = trackMarketingEventMock.mock.calls.findIndex(
      ([event]) => event === "lead_form_result_seen",
    );
    const formViewIndex = trackMarketingEventMock.mock.calls.findIndex(
      ([event, props]) =>
        event === "lead_form_view" &&
        props?.source === "cam_billing_error_estimator_result",
    );

    expect(resultSeenIndex).toBeGreaterThanOrEqual(0);
    expect(formViewIndex).toBeGreaterThanOrEqual(0);
    expect(
      trackMarketingEventMock.mock.invocationCallOrder[formViewIndex],
    ).toBeGreaterThan(
      trackMarketingEventMock.mock.invocationCallOrder[resultSeenIndex],
    );
  });

  it("requests the estimator worksheet from the post-result form", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;
    const user = userEvent.setup();
    render(<CamBillingErrorEstimatorPage />);

    await user.type(screen.getByLabelText("Average rentable SF"), "250000");
    await user.type(
      await screen.findByLabelText(/your work email/i),
      "jane@company.com",
    );
    await user.click(
      screen.getByRole("button", { name: /send my worksheet/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/check your inbox for the worksheet/i),
      ).toBeInTheDocument();
    });
    const body = String(fetchMock.mock.calls[0][1]?.body);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/leads/content-download"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(body).toContain('"asset_slug":"cam-leakage-estimator"');
    expect(body).toContain('"source":"cam_billing_error_estimator_result"');
  });
});
