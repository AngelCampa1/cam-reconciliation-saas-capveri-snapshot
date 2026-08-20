import { render, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUsePathname = vi.fn(() => "/pricing");
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

const {
  mockCaptureMarketingException,
  mockIsExpectedBrowserTransportError,
  posthogMock,
} = vi.hoisted(() => ({
  mockCaptureMarketingException: vi.fn(),
  mockIsExpectedBrowserTransportError: vi.fn(() => false),
  posthogMock: {
    capture: vi.fn(),
    get_distinct_id: vi.fn<() => string | undefined>(() => "ph-distinct-1"),
  },
}));
vi.mock("posthog-js", () => ({ default: posthogMock }));
vi.mock("@/lib/sentry", () => ({
  captureMarketingException: mockCaptureMarketingException,
  isExpectedBrowserTransportError: mockIsExpectedBrowserTransportError,
}));

import { AiSdrSalesWidget } from "../AiSdrSalesWidget";

type InitConfig = Parameters<NonNullable<Window["AiSdr"]>["init"]>[0];

const destroy = vi.fn();
const init = vi.fn<(config: InitConfig) => { destroy: () => void }>(() => ({
  destroy,
}));

beforeEach(() => {
  mockUsePathname.mockReturnValue("/pricing");
  posthogMock.capture.mockClear();
  posthogMock.get_distinct_id.mockReturnValue("ph-distinct-1");
  mockIsExpectedBrowserTransportError.mockReturnValue(false);
  mockCaptureMarketingException.mockClear();
  init.mockClear();
  destroy.mockClear();
  window.AiSdr = { init };
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ timestamp: "t", nonce: "n", signature: "s" }),
    ),
  );
});

afterEach(() => {
  cleanup();
  delete window.AiSdr;
  vi.unstubAllGlobals();
  document.getElementById("ventora-ai-sdr-client")?.remove();
});

describe("AiSdrSalesWidget", () => {
  it("initialises the widget on a high-intent page", async () => {
    render(<AiSdrSalesWidget />);
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));

    const config = init.mock.calls[0][0];
    expect(config.session.productId).toBe("capveri");
    expect(config.session.visitorId).toBe("ph-distinct-1");
    expect(config.session.metadata?.entryPath).toBe("/pricing");
    expect(config.baseUrl).toContain("https://");
  });

  it("does not initialise on a non-high-intent page", async () => {
    mockUsePathname.mockReturnValue("/blog/some-post");
    render(<AiSdrSalesWidget />);
    await Promise.resolve();
    expect(init).not.toHaveBeenCalled();
  });

  it("covers nested high-intent routes by prefix", async () => {
    mockUsePathname.mockReturnValue("/tools/cam-billing-error-estimator");
    render(<AiSdrSalesWidget />);
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));
  });

  it("signs worker requests through the first-party BFF", async () => {
    render(<AiSdrSalesWidget />);
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));

    const { signRequest } = init.mock.calls[0][0];
    const assertion = await signRequest({
      method: "POST",
      path: "/v1/sessions",
      body: { productId: "capveri" },
      serializedBody: "{}",
    });

    expect(assertion).toEqual({ timestamp: "t", nonce: "n", signature: "s" });
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ai-sdr/sign");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({
      method: "POST",
      path: "/v1/sessions",
      body: { productId: "capveri" },
    });
  });

  it("throws when the sign endpoint rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 })),
    );
    render(<AiSdrSalesWidget />);
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));

    const { signRequest } = init.mock.calls[0][0];
    await expect(
      signRequest({
        method: "POST",
        path: "/v1/chat",
        body: {},
        serializedBody: "{}",
      }),
    ).rejects.toThrow(/503/);
    expect(mockCaptureMarketingException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "AI-SDR sign request failed: 503",
      }),
      {
        operation: "marketing.ai_sdr.sign",
        path: "/api/ai-sdr/sign",
      },
    );
  });

  it("does not report expected sign endpoint 4xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 403 })),
    );
    render(<AiSdrSalesWidget />);
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));

    const { signRequest } = init.mock.calls[0][0];
    await expect(
      signRequest({
        method: "POST",
        path: "/v1/chat",
        body: {},
        serializedBody: "{}",
      }),
    ).rejects.toThrow(/403/);
    expect(mockCaptureMarketingException).not.toHaveBeenCalled();
  });

  it("reports sign endpoint network errors", async () => {
    const error = new Error("network down");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(error)));
    render(<AiSdrSalesWidget />);
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));

    const { signRequest } = init.mock.calls[0][0];
    await expect(
      signRequest({
        method: "POST",
        path: "/v1/chat",
        body: {},
        serializedBody: "{}",
      }),
    ).rejects.toThrow(/network down/);
    expect(mockCaptureMarketingException).toHaveBeenCalledWith(error, {
      operation: "marketing.ai_sdr.sign",
      path: "/api/ai-sdr/sign",
    });
  });

  it("keeps client script load failures out of Sentry noise", async () => {
    delete window.AiSdr;
    mockIsExpectedBrowserTransportError.mockReturnValue(true);

    render(<AiSdrSalesWidget />);
    const script = await waitFor(() => {
      const element = document.getElementById("ventora-ai-sdr-client");
      expect(element).toBeTruthy();
      return element as HTMLScriptElement;
    });
    script.dispatchEvent(new Event("error"));

    await Promise.resolve();
    expect(mockCaptureMarketingException).not.toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
  });

  it("falls back to a persisted visitor id when PostHog has none", async () => {
    posthogMock.get_distinct_id.mockReturnValue(undefined);
    render(<AiSdrSalesWidget />);
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));

    const firstId = init.mock.calls[0][0].session.visitorId;
    expect(firstId).toBeTruthy();
    expect(window.localStorage.getItem("capveri.ai-sdr.visitor-id")).toBe(
      firstId,
    );
  });

  it("destroys the widget on unmount", async () => {
    const { unmount } = render(<AiSdrSalesWidget />);
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
