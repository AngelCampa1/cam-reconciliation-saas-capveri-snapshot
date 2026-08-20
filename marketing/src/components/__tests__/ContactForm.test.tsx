import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactForm } from "@/components/ContactForm";

const {
  mockTrackMarketingEvent,
  mockIsTurnstileConfigured,
  mockCaptureMarketingException,
  mockIsExpectedBrowserTransportError,
} = vi.hoisted(() => ({
    mockTrackMarketingEvent: vi.fn(),
    mockIsTurnstileConfigured: vi.fn(() => false),
    mockCaptureMarketingException: vi.fn(),
    mockIsExpectedBrowserTransportError: vi.fn(() => false),
  }));

vi.mock("@/lib/sentry", () => ({
  captureMarketingException: mockCaptureMarketingException,
  isExpectedBrowserTransportError: mockIsExpectedBrowserTransportError,
}));

vi.mock("@/lib/posthog", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/posthog")>("@/lib/posthog");
  return {
    ...actual,
    trackMarketingEvent: mockTrackMarketingEvent,
  };
});

vi.mock("@/components/TurnstileWidget", () => ({
  TurnstileWidget: () => <div data-testid="turnstile-widget" />,
  isTurnstileConfigured: mockIsTurnstileConfigured,
}));

const mockGet = vi.fn<(key: string) => string | null>(() => null);

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: mockGet }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

const mockFetch = vi.fn();

beforeEach(() => {
  mockGet.mockReturnValue(null);
  global.fetch = mockFetch;
  mockTrackMarketingEvent.mockClear();
  mockCaptureMarketingException.mockClear();
  mockIsExpectedBrowserTransportError.mockReturnValue(false);
  mockIsTurnstileConfigured.mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

/** Fill the required base fields (name + email + message). */
async function fillBaseFields(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText(/full name/i));
  fireEvent.change(screen.getByLabelText(/full name/i), {
    target: { value: "Jane Smith" },
  });
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: "jane@company.com" },
  });
  fireEvent.change(screen.getByLabelText(/message/i), {
    target: { value: "I have a question about CAM reconciliation." },
  });
}

function fillCompany(value = "Acme Corp") {
  fireEvent.change(screen.getByLabelText(/company/i), {
    target: { value },
  });
}

describe("ContactForm", () => {
  describe("non-audit inquiry (default)", () => {
    it("renders the form", () => {
      render(<ContactForm />);
      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /send message/i }),
      ).toBeInTheDocument();
    });

    it("does NOT show audit-specific fields when type is not audit", () => {
      render(<ContactForm />);
      expect(
        screen.queryByLabelText(/current system/i),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
    });

    it("shows the inquiry-type placeholder when nothing is preset", () => {
      render(<ContactForm />);
      expect(screen.getByText("Select inquiry type")).toBeInTheDocument();
    });

    it("calls fetch and shows success state on 200 response", async () => {
      // Set inquiry type via URL param so the form can submit (Radix Select can't be driven with selectOptions)
      mockGet.mockImplementation((key: string) =>
        key === "type" ? "demo" : null,
      );
      mockFetch.mockResolvedValueOnce({ ok: true });
      const user = userEvent.setup();
      render(<ContactForm />);
      await fillBaseFields(user);
      await user.click(screen.getByRole("button", { name: /send message/i }));
      await waitFor(() => {
        expect(screen.getByText(/message received/i)).toBeInTheDocument();
      });
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockTrackMarketingEvent).toHaveBeenCalledWith(
        "form_submit_attempted",
        expect.objectContaining({
          form_type: "demo",
          location: "contact_page",
          email_domain: "company.com",
        }),
      );
      expect(mockTrackMarketingEvent).toHaveBeenCalledWith(
        "form_submitted",
        expect.objectContaining({
          form_type: "demo",
          location: "contact_page",
        }),
      );
    });
  });

  describe("audit inquiry (source param present)", () => {
    beforeEach(() => {
      // source param sets defaultType to "audit"
      mockGet.mockImplementation((key: string) =>
        key === "source" ? "roi" : null,
      );
    });

    it("shows audit-specific fields when inquiry type is audit", () => {
      render(<ContactForm />);
      // "Current System" uses Radix Select (not a native input), so query by label text
      expect(screen.getByText("Current System")).toBeInTheDocument();
      // Phone field was removed
      expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
    });

    it("displays the preset inquiry label in the trigger (not blank)", () => {
      // Radix Select renders no label for a value set before its items mount
      // unless SelectValue is given explicit children. Guard that fix here.
      const { container } = render(<ContactForm />);
      const trigger = container.querySelector("#inquiryType");
      expect(trigger).toHaveTextContent("Audit Request");
      expect(trigger).not.toHaveTextContent("Select inquiry type");
    });

    it("calls fetch and shows success on 200 response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const user = userEvent.setup();
      render(<ContactForm />);
      await fillBaseFields(user);
      fillCompany();
      await user.click(screen.getByRole("button", { name: /send message/i }));
      await waitFor(() => {
        expect(screen.getByText(/message received/i)).toBeInTheDocument();
      });
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("shows error message on non-ok API response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ detail: "Server validation failed" }),
      });
      const user = userEvent.setup();
      render(<ContactForm />);
      await fillBaseFields(user);
      fillCompany();
      await user.click(screen.getByRole("button", { name: /send message/i }));
      await waitFor(() => {
        expect(
          screen.getByText("Server validation failed"),
        ).toBeInTheDocument();
      });
      expect(mockTrackMarketingEvent).toHaveBeenCalledWith(
        "form_submit_failed",
        expect.objectContaining({
          form_type: "audit",
          error_type: "api_error",
          status_bucket: "400",
          building_count_bucket: "unknown",
        }),
      );
      expect(mockCaptureMarketingException).not.toHaveBeenCalled();
    });

    it("reports audit API 5xx failures to Sentry while showing the API message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ detail: "Service unavailable" }),
      });
      const user = userEvent.setup();
      render(<ContactForm />);
      await fillBaseFields(user);
      fillCompany();
      await user.click(screen.getByRole("button", { name: /send message/i }));
      await waitFor(() => {
        expect(screen.getByText("Service unavailable")).toBeInTheDocument();
      });
      expect(mockCaptureMarketingException).toHaveBeenCalledWith(
        expect.any(Error),
        {
          operation: "marketing.contact.audit-submit",
          path: "/contact",
        },
      );
    });

    it("shows fallback error when API detail is missing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });
      const user = userEvent.setup();
      render(<ContactForm />);
      await fillBaseFields(user);
      fillCompany();
      await user.click(screen.getByRole("button", { name: /send message/i }));
      await waitFor(() => {
        expect(
          screen.getByText(/failed to submit audit request/i),
        ).toBeInTheDocument();
      });
    });

    it("shows network error message when fetch throws", async () => {
      const networkError = new Error("Network failure");
      mockFetch.mockRejectedValueOnce(networkError);
      const user = userEvent.setup();
      render(<ContactForm />);
      await fillBaseFields(user);
      fillCompany();
      await user.click(screen.getByRole("button", { name: /send message/i }));
      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
      expect(mockTrackMarketingEvent).toHaveBeenCalledWith(
        "form_submit_failed",
        expect.objectContaining({
          form_type: "audit",
          error_type: "network",
          status_bucket: "network",
        }),
      );
      expect(mockCaptureMarketingException).toHaveBeenCalledWith(
        networkError,
        {
          operation: "marketing.contact.audit-submit",
          path: "/contact",
        },
      );
    });

    it("does not report explicit abort errors", async () => {
      const abortError = new DOMException("aborted", "AbortError");
      mockIsExpectedBrowserTransportError.mockReturnValue(true);
      mockFetch.mockRejectedValueOnce(abortError);
      const user = userEvent.setup();
      render(<ContactForm />);
      await fillBaseFields(user);
      fillCompany();
      await user.click(screen.getByRole("button", { name: /send message/i }));
      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
      expect(mockCaptureMarketingException).not.toHaveBeenCalled();
    });

    it("tracks missing Turnstile verification before submit", async () => {
      mockIsTurnstileConfigured.mockReturnValue(true);
      const user = userEvent.setup();
      render(<ContactForm />);
      await fillBaseFields(user);
      await user.click(screen.getByRole("button", { name: /send message/i }));
      await waitFor(() => {
        expect(
          screen.getByText(/please complete the verification challenge/i),
        ).toBeInTheDocument();
      });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockTrackMarketingEvent).toHaveBeenCalledWith(
        "turnstile_required_missing",
        expect.objectContaining({
          form_type: "audit",
          turnstile_configured: true,
        }),
      );
    });

    it("clears previous error on resubmit", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ detail: "First error" }),
        })
        .mockResolvedValueOnce({ ok: true });
      const user = userEvent.setup();
      render(<ContactForm />);
      await fillBaseFields(user);
      fillCompany();
      // First submit → error
      await user.click(screen.getByRole("button", { name: /send message/i }));
      await waitFor(() => {
        expect(screen.getByText("First error")).toBeInTheDocument();
      });
      // Second submit → success, error should be gone
      await user.click(screen.getByRole("button", { name: /send message/i }));
      await waitFor(() => {
        expect(screen.getByText(/message received/i)).toBeInTheDocument();
      });
      expect(screen.queryByText("First error")).not.toBeInTheDocument();
    });
  });

  describe("success state", () => {
    it("renders Return to Home link in success state", async () => {
      mockGet.mockImplementation((key: string) =>
        key === "type" ? "demo" : null,
      );
      mockFetch.mockResolvedValueOnce({ ok: true });
      const user = userEvent.setup();
      render(<ContactForm />);
      await fillBaseFields(user);
      await user.click(screen.getByRole("button", { name: /send message/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("link", { name: /return to home/i }),
        ).toBeInTheDocument();
      });
    });
  });

  describe("onChange handlers coverage", () => {
    it("updates buildingCount field", async () => {
      mockGet.mockImplementation((key: string) =>
        key === "source" ? "roi" : null,
      );
      const user = userEvent.setup();
      render(<ContactForm />);
      await user.type(screen.getByLabelText(/number of buildings/i), "5");
      expect(screen.getByLabelText(/number of buildings/i)).toHaveValue(5);
    });

    it("updates message field", async () => {
      const user = userEvent.setup();
      render(<ContactForm />);
      await user.type(screen.getByLabelText(/message/i), "Test message");
      expect(screen.getByLabelText(/message/i)).toHaveValue("Test message");
      expect(mockTrackMarketingEvent).toHaveBeenCalledWith(
        "form_started",
        expect.objectContaining({
          form_type: "unknown",
          location: "contact_page",
        }),
      );
    });
  });
});
