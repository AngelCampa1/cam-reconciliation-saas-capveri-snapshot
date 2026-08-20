import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalculatorUnlockGate } from "@/components/lead-capture/CalculatorUnlockGate";

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

const storageKey = (slug: string) => `capveri_calculator_unlocked:${slug}`;
const mockFetch = vi.fn();

beforeEach(() => {
  localStorage.clear();
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
  slug: "cam-gross-up-calculator",
  onUnlock: vi.fn(),
};

describe("CalculatorUnlockGate", () => {
  describe("localStorage auto-unlock", () => {
    it("calls onUnlock immediately when already unlocked in localStorage", () => {
      localStorage.setItem(storageKey(defaultProps.slug), "true");
      const onUnlock = vi.fn();
      render(<CalculatorUnlockGate {...defaultProps} onUnlock={onUnlock} />);
      expect(onUnlock).toHaveBeenCalledOnce();
    });

    it("does not unlock one calculator from another calculator's saved unlock", () => {
      localStorage.setItem(storageKey("boma-2024-calculator"), "true");
      const onUnlock = vi.fn();
      render(
        <CalculatorUnlockGate
          slug="fixed-cam-vs-traditional"
          onUnlock={onUnlock}
        />,
      );
      expect(onUnlock).not.toHaveBeenCalled();
    });

    it("does not call onUnlock when localStorage is empty", () => {
      const onUnlock = vi.fn();
      render(<CalculatorUnlockGate {...defaultProps} onUnlock={onUnlock} />);
      expect(onUnlock).not.toHaveBeenCalled();
    });
  });

  describe("lock prompt", () => {
    it("shows unlock prompt with button when not unlocked", () => {
      render(<CalculatorUnlockGate {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: /see financial projections/i }),
      ).toBeInTheDocument();
    });

    it("clicking unlock button shows the form", async () => {
      const user = userEvent.setup();
      render(<CalculatorUnlockGate {...defaultProps} />);
      await user.click(
        screen.getByRole("button", { name: /see financial projections/i }),
      );
      expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
      expect(mockTrackMarketingEvent).toHaveBeenCalledWith(
        "tool_lead_gate_opened",
        expect.objectContaining({ slug: defaultProps.slug }),
      );
      expect(mockTrackMarketingEvent).toHaveBeenCalledWith("lead_form_view", {
        slug: defaultProps.slug,
      });
    });

    it("only describes sending the requested resource", async () => {
      const user = userEvent.setup();
      render(<CalculatorUnlockGate {...defaultProps} />);
      await user.click(
        screen.getByRole("button", { name: /see financial projections/i }),
      );
      expect(
        screen.getByText(/we'll send the resource to your inbox/i),
      ).toBeInTheDocument();
      expect(screen.queryByText(/no spam/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/follow-up/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/unsubscribe/i)).not.toBeInTheDocument();
    });
  });

  describe("form submission", () => {
    async function openAndFillForm(user: ReturnType<typeof userEvent.setup>) {
      await user.click(
        screen.getByRole("button", { name: /see financial projections/i }),
      );
      await user.type(screen.getByLabelText(/first name/i), "Jane");
      await user.type(screen.getByLabelText(/work email/i), "jane@company.com");
    }

    it("calls onUnlock and sets localStorage on 200 response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      const onUnlock = vi.fn();
      const user = userEvent.setup();
      render(
        <CalculatorUnlockGate
          slug="test-slug"
          source="homepage"
          onUnlock={onUnlock}
        />,
      );
      await openAndFillForm(user);
      await user.click(
        screen.getByRole("button", { name: /see financial projections/i }),
      );
      await waitFor(() => expect(onUnlock).toHaveBeenCalledOnce());
      expect(localStorage.getItem(storageKey("test-slug"))).toBe("true");
      expect(localStorage.getItem("boma_calculator_unlocked")).toBeNull();
      expect(mockTrackMarketingEvent).toHaveBeenCalledWith(
        "form_submit_attempted",
        expect.objectContaining({
          form_type: "calculator_unlock",
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
          lead_type: "calculator_unlock",
          asset_slug: "test-slug",
        }),
      );
    });

    it("calls fetch with correct endpoint and payload", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      const user = userEvent.setup();
      render(
        <CalculatorUnlockGate
          slug="my-calculator"
          source="footer"
          onUnlock={vi.fn()}
        />,
      );
      await openAndFillForm(user);
      await user.click(
        screen.getByRole("button", { name: /see financial projections/i }),
      );
      await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "https://api.capveri.com/api/v1/leads/calculator-unlock",
      );
      const body = JSON.parse(opts.body as string);
      expect(body.slug).toBe("my-calculator");
      expect(body.source).toBe("footer");
    });

    it("treats 429 as returning lead and sets slug-specific localStorage", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
      const onUnlock = vi.fn();
      const user = userEvent.setup();
      render(<CalculatorUnlockGate {...defaultProps} onUnlock={onUnlock} />);
      await openAndFillForm(user);
      await user.click(
        screen.getByRole("button", { name: /see financial projections/i }),
      );
      await waitFor(() => expect(onUnlock).toHaveBeenCalledOnce());
      expect(localStorage.getItem(storageKey(defaultProps.slug))).toBe("true");
      expect(mockCaptureMarketingException).not.toHaveBeenCalled();
    });

    it("still unlocks when localStorage writes are blocked", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      const onUnlock = vi.fn();
      const setItemSpy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementationOnce(() => {
          throw new DOMException("Blocked", "SecurityError");
        });
      const user = userEvent.setup();

      render(<CalculatorUnlockGate {...defaultProps} onUnlock={onUnlock} />);
      await openAndFillForm(user);
      await user.click(
        screen.getByRole("button", { name: /see financial projections/i }),
      );

      await waitFor(() => expect(onUnlock).toHaveBeenCalledOnce());
      expect(setItemSpy).toHaveBeenCalledWith(
        storageKey(defaultProps.slug),
        "true",
      );
      setItemSpy.mockRestore();
    });

    it("reports and shows error message on 5xx response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      const user = userEvent.setup();
      render(<CalculatorUnlockGate {...defaultProps} />);
      await openAndFillForm(user);
      await user.click(
        screen.getByRole("button", { name: /see financial projections/i }),
      );
      await waitFor(() => {
        expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      });
      expect(mockTrackMarketingEvent).toHaveBeenCalledWith(
        "form_submit_failed",
        expect.objectContaining({
          error_type: "api_error",
          status_bucket: "5xx",
        }),
      );
      expect(mockCaptureMarketingException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Calculator unlock API failed with status 500",
        }),
        {
          operation: "marketing.lead-capture.calculator-unlock",
          path: "/api/v1/leads/calculator-unlock",
        },
      );
    });

    it("does not report expected 4xx response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });
      const user = userEvent.setup();
      render(<CalculatorUnlockGate {...defaultProps} />);
      await openAndFillForm(user);
      await user.click(
        screen.getByRole("button", { name: /see financial projections/i }),
      );
      await waitFor(() => {
        expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      });
      expect(mockCaptureMarketingException).not.toHaveBeenCalled();
    });

  it("reports and shows network error when fetch throws", async () => {
      const error = new Error("Network down");
      mockFetch.mockRejectedValueOnce(error);
      const user = userEvent.setup();
      render(<CalculatorUnlockGate {...defaultProps} />);
      await openAndFillForm(user);
      await user.click(
        screen.getByRole("button", { name: /see financial projections/i }),
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
      operation: "marketing.lead-capture.calculator-unlock",
      path: "/api/v1/leads/calculator-unlock",
    });
  });

  it("does not report explicit abort errors", async () => {
    const error = new DOMException("aborted", "AbortError");
    mockIsExpectedBrowserTransportError.mockReturnValue(true);
    mockFetch.mockRejectedValueOnce(error);
    const user = userEvent.setup();
    render(<CalculatorUnlockGate {...defaultProps} />);
    await openAndFillForm(user);
    await user.click(
      screen.getByRole("button", { name: /see financial projections/i }),
    );
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
    expect(mockCaptureMarketingException).not.toHaveBeenCalled();
  });

    it("tracks missing Turnstile verification before submit", async () => {
      mockIsTurnstileConfigured.mockReturnValue(true);
      const user = userEvent.setup();
      render(<CalculatorUnlockGate {...defaultProps} />);
      await openAndFillForm(user);
      await user.click(
        screen.getByRole("button", { name: /see financial projections/i }),
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
          form_type: "calculator_unlock",
          asset_slug: defaultProps.slug,
          turnstile_configured: true,
        }),
      );
      expect(mockCaptureMarketingException).not.toHaveBeenCalled();
    });
  });

  describe("custom copy", () => {
    it("renders tailored lockMessage and unlockLabel when provided", async () => {
      const user = userEvent.setup();
      render(
        <CalculatorUnlockGate
          slug="cam-overcharge-calculator"
          onUnlock={vi.fn()}
          lockMessage="Enter your email to see the full overcharge breakdown."
          unlockLabel="See Full Breakdown"
        />,
      );
      expect(
        screen.getByText(
          "Enter your email to see the full overcharge breakdown.",
        ),
      ).toBeInTheDocument();
      // Default copy must not leak through.
      expect(
        screen.queryByText(/revenue and asset value projections/i),
      ).not.toBeInTheDocument();
      const openButton = screen.getByRole("button", {
        name: /see full breakdown/i,
      });
      expect(openButton).toBeInTheDocument();
      // The same label carries into the form's submit button.
      await user.click(openButton);
      expect(
        screen.getByRole("button", { name: /see full breakdown/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /see financial projections/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("validation errors", () => {
    it("shows first_name and work_email validation errors when submitting empty form", async () => {
      const user = userEvent.setup();
      render(<CalculatorUnlockGate {...defaultProps} />);
      // Open form
      await user.click(
        screen.getByRole("button", { name: /see financial projections/i }),
      );
      // Submit without filling fields
      await user.click(
        screen.getByRole("button", { name: /see financial projections/i }),
      );
      await waitFor(() => {
        expect(screen.getByText(/first name is required/i)).toBeInTheDocument();
      });
      expect(
        screen.getByText(/please enter a valid work email/i),
      ).toBeInTheDocument();
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
});
