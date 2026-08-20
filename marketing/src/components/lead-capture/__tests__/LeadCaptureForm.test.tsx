import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeadCaptureForm } from "@/components/lead-capture/LeadCaptureForm";

const {
  mockTrackMarketingEvent,
  mockIdentifyMarketingLead,
  mockIsTurnstileConfigured,
  mockCaptureMarketingException,
  mockIsExpectedBrowserTransportError,
} = vi.hoisted(() => ({
  mockTrackMarketingEvent: vi.fn(),
  mockIdentifyMarketingLead: vi.fn(),
  mockIsTurnstileConfigured: vi.fn(() => false),
  mockCaptureMarketingException: vi.fn(),
  mockIsExpectedBrowserTransportError: vi.fn(() => false),
}));

vi.mock("@/lib/posthog", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/posthog")>("@/lib/posthog");
  return {
    ...actual,
    identifyMarketingLead: mockIdentifyMarketingLead,
    trackMarketingEvent: mockTrackMarketingEvent,
  };
});

vi.mock("@/components/TurnstileWidget", () => ({
  TurnstileWidget: () => <div data-testid="turnstile-widget" />,
  isTurnstileConfigured: mockIsTurnstileConfigured,
}));

vi.mock("@/lib/sentry", () => ({
  captureMarketingException: mockCaptureMarketingException,
  isExpectedBrowserTransportError: mockIsExpectedBrowserTransportError,
}));

const mockFetch = vi.fn();

beforeEach(() => {
  global.fetch = mockFetch;
  mockTrackMarketingEvent.mockClear();
  mockIdentifyMarketingLead.mockClear();
  mockIsTurnstileConfigured.mockReturnValue(false);
  mockCaptureMarketingException.mockClear();
  mockIsExpectedBrowserTransportError.mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

const defaultProps = {
  assetSlug: "cam-leakage-estimator",
  onSuccess: vi.fn(),
};

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/first name/i), "Jane");
  await user.type(screen.getByLabelText(/work email/i), "jane@company.com");
}

describe("LeadCaptureForm", () => {
  it("renders all form fields", () => {
    render(<LeadCaptureForm {...defaultProps} />);
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/company/i)).toBeInTheDocument();
  });

  it("only describes sending the requested resource", () => {
    render(<LeadCaptureForm {...defaultProps} />);
    expect(
      screen.getByText(/we'll send the download link to your inbox/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no spam/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/follow-up/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/unsubscribe/i)).not.toBeInTheDocument();
  });

  it("renders default CTA label", () => {
    render(<LeadCaptureForm {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /download free calculator/i }),
    ).toBeInTheDocument();
  });

  it("renders custom CTA label", () => {
    render(<LeadCaptureForm {...defaultProps} ctaLabel="Get My Report" />);
    expect(
      screen.getByRole("button", { name: /get my report/i }),
    ).toBeInTheDocument();
  });

  it("shows validation error when first_name is empty", async () => {
    const user = userEvent.setup();
    render(<LeadCaptureForm {...defaultProps} />);
    // Only fill email, leave first_name empty
    await user.type(screen.getByLabelText(/work email/i), "jane@company.com");
    await user.click(
      screen.getByRole("button", { name: /download free calculator/i }),
    );
    await waitFor(() => {
      expect(screen.getByText(/first name is required/i)).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCaptureMarketingException).not.toHaveBeenCalled();
  });

  it("shows validation error for invalid email", async () => {
    const user = userEvent.setup();
    render(<LeadCaptureForm {...defaultProps} />);
    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/work email/i), "not-an-email");
    await user.click(
      screen.getByRole("button", { name: /download free calculator/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/please enter a valid work email/i),
      ).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCaptureMarketingException).not.toHaveBeenCalled();
  });

  it("calls fetch with correct payload on valid submission", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <LeadCaptureForm
        {...defaultProps}
        assetSlug="test-slug"
        source="homepage"
        onSuccess={onSuccess}
      />,
    );
    await fillRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: /download free calculator/i }),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(mockTrackMarketingEvent).toHaveBeenCalledWith(
      "form_submit_attempted",
      expect.objectContaining({
        form_type: "lead_capture",
        asset_slug: "test-slug",
        email_domain: "company.com",
      }),
    );
    expect(mockTrackMarketingEvent).not.toHaveBeenCalledWith(
      "lead_form_submit",
      expect.anything(),
    );
    expect(mockIdentifyMarketingLead).toHaveBeenCalledWith(
      "jane@company.com",
      expect.objectContaining({
        lead_type: "content_download",
        asset_slug: "test-slug",
      }),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/leads/content-download"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"asset_slug":"test-slug"'),
      }),
    );
  });

  it("calls onSuccess on 200 response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<LeadCaptureForm {...defaultProps} onSuccess={onSuccess} />);
    await fillRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: /download free calculator/i }),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it("shows 429 error message with detail from server", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        detail: "You already requested this. Check your inbox.",
      }),
    });
    const user = userEvent.setup();
    render(<LeadCaptureForm {...defaultProps} />);
    await fillRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: /download free calculator/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/you already requested this/i),
      ).toBeInTheDocument();
    });
    expect(mockTrackMarketingEvent).toHaveBeenCalledWith(
      "form_submit_failed",
      expect.objectContaining({
        error_type: "rate_limit",
        status_bucket: "rate_limit",
        asset_slug: defaultProps.assetSlug,
      }),
    );
    expect(mockCaptureMarketingException).not.toHaveBeenCalled();
  });

  it("shows fallback 429 message when detail is missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
    });
    const user = userEvent.setup();
    render(<LeadCaptureForm {...defaultProps} />);
    await fillRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: /download free calculator/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/you already requested this/i),
      ).toBeInTheDocument();
    });
    expect(mockCaptureMarketingException).not.toHaveBeenCalled();
  });

  it("reports and shows generic error on 5xx response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    const user = userEvent.setup();
    render(<LeadCaptureForm {...defaultProps} />);
    await fillRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: /download free calculator/i }),
    );
    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
    expect(mockCaptureMarketingException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Lead capture API failed with status 500",
      }),
      {
        operation: "marketing.lead-capture.content-download",
        path: "/api/v1/leads/content-download",
      },
    );
  });

  it("does not report expected 4xx response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ detail: "Please check your email address." }),
    });
    const user = userEvent.setup();
    render(<LeadCaptureForm {...defaultProps} />);
    await fillRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: /download free calculator/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/please check your email address/i),
      ).toBeInTheDocument();
    });
    expect(mockCaptureMarketingException).not.toHaveBeenCalled();
  });

  it("reports and shows network error when fetch throws", async () => {
    const error = new Error("Network failure");
    mockFetch.mockRejectedValueOnce(error);
    const user = userEvent.setup();
    render(<LeadCaptureForm {...defaultProps} />);
    await fillRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: /download free calculator/i }),
    );
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
    expect(mockTrackMarketingEvent).toHaveBeenCalledWith(
      "form_submit_failed",
      expect.objectContaining({
        error_type: "network",
        status_bucket: "network",
      }),
    );
    expect(mockCaptureMarketingException).toHaveBeenCalledWith(error, {
      operation: "marketing.lead-capture.content-download",
      path: "/api/v1/leads/content-download",
    });
  });

  it("does not report explicit abort errors", async () => {
    const error = new DOMException("aborted", "AbortError");
    mockIsExpectedBrowserTransportError.mockReturnValue(true);
    mockFetch.mockRejectedValueOnce(error);
    const user = userEvent.setup();
    render(<LeadCaptureForm {...defaultProps} />);
    await fillRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: /download free calculator/i }),
    );
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
    expect(mockCaptureMarketingException).not.toHaveBeenCalled();
  });

  it("tracks missing Turnstile verification before submit", async () => {
    mockIsTurnstileConfigured.mockReturnValue(true);
    const user = userEvent.setup();
    render(<LeadCaptureForm {...defaultProps} />);
    await fillRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: /download free calculator/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/please complete the verification challenge/i),
      ).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockTrackMarketingEvent).toHaveBeenCalledWith(
      "turnstile_required_missing",
      expect.objectContaining({
        form_type: "lead_capture",
        asset_slug: defaultProps.assetSlug,
        turnstile_configured: true,
      }),
    );
    expect(mockCaptureMarketingException).not.toHaveBeenCalled();
  });

  it("handles non-JSON error response body (json parse fails)", async () => {
    // Tests the .catch(() => ({})) branch in LeadCaptureForm
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("Not JSON");
      },
    });
    const user = userEvent.setup();
    render(<LeadCaptureForm {...defaultProps} />);
    await fillRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: /download free calculator/i }),
    );
    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });
});

describe("LeadCaptureForm (emailOnly)", () => {
  it("renders only the email field", () => {
    render(<LeadCaptureForm {...defaultProps} emailOnly />);
    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/company/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/your work email/i)).toBeInTheDocument();
    expect(screen.queryByText(/no spam/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/follow-up/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/unsubscribe/i)).not.toBeInTheDocument();
  });

  it("submits without first_name in the request body", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <LeadCaptureForm
        {...defaultProps}
        emailOnly
        source="exit_intent_popup"
        onSuccess={onSuccess}
      />,
    );
    await user.type(
      screen.getByLabelText(/your work email/i),
      "jane@company.com",
    );
    await user.click(
      screen.getByRole("button", { name: /download free calculator/i }),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    const body = String(mockFetch.mock.calls[0][1]?.body);
    expect(body).toContain('"email":"jane@company.com"');
    expect(body).not.toContain("first_name");
  });

  it("shows validation error for invalid email in emailOnly mode", async () => {
    const user = userEvent.setup();
    render(<LeadCaptureForm {...defaultProps} emailOnly />);
    await user.type(screen.getByLabelText(/your work email/i), "not-an-email");
    await user.click(
      screen.getByRole("button", { name: /download free calculator/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/please enter a valid work email/i),
      ).toBeInTheDocument();
    });
    expect(mockTrackMarketingEvent).toHaveBeenCalledWith(
      "form_submit_failed",
      expect.objectContaining({
        error_type: "validation",
        status_bucket: "client",
      }),
    );
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCaptureMarketingException).not.toHaveBeenCalled();
  });
});
