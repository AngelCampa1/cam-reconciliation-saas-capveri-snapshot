import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sentry", () => ({
  captureMarketingException: vi.fn(),
}));

import { captureMarketingException } from "@/lib/sentry";
import { GlobalErrorContent } from "./global-error";

const mockCaptureMarketingException = vi.mocked(captureMarketingException);

describe("GlobalError", () => {
  it("reports the exception and shows helpful recovery copy", async () => {
    const error = new Error("marketing crashed");
    render(<GlobalErrorContent error={error} reset={vi.fn()} />);

    await waitFor(() => {
      expect(mockCaptureMarketingException).toHaveBeenCalledWith(error, {
        operation: "marketing.global-error",
      });
    });
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});
