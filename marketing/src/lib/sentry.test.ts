import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import {
  captureMarketingException,
  isExpectedBrowserTransportError,
} from "./sentry";

const mockCaptureException = vi.mocked(Sentry.captureException);

describe("captureMarketingException", () => {
  it("captures marketing runtime exceptions with context", () => {
    const error = new Error("page failed");

    captureMarketingException(error, {
      operation: "marketing.render",
      path: "/pricing",
    });

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      tags: {
        surface: "marketing",
        operation: "marketing.render",
        path: "/pricing",
      },
    });
  });
});

describe("isExpectedBrowserTransportError", () => {
  it("filters explicit aborts and known third-party script load noise", () => {
    expect(isExpectedBrowserTransportError(new DOMException("aborted", "AbortError"))).toBe(
      true,
    );
    expect(
      isExpectedBrowserTransportError(
        new Error("AI-SDR client failed to load"),
      ),
    ).toBe(true);
  });

  it("does not filter application errors", () => {
    expect(isExpectedBrowserTransportError(new TypeError("Failed to fetch"))).toBe(
      false,
    );
    expect(isExpectedBrowserTransportError(new TypeError("Load failed"))).toBe(
      false,
    );
    expect(isExpectedBrowserTransportError(new Error("API failed with 500"))).toBe(
      false,
    );
  });
});
