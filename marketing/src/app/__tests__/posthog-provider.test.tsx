import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { mockInit } = vi.hoisted(() => ({ mockInit: vi.fn() }));

vi.mock("posthog-js", () => ({
  default: {
    __loaded: false,
    init: mockInit,
  },
}));

vi.mock("posthog-js/react", () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe("PostHogProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    mockInit.mockClear();
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("initializes the Capveri.com PostHog project with masked capture defaults", async () => {
    await import("../posthog-provider");

    expect(mockInit).toHaveBeenCalledWith(
      "phc_REPLACE_WITH_POSTHOG_PROJECT_KEY",
      expect.objectContaining({
        api_host: "https://us.i.posthog.com",
        defaults: "2025-05-24",
        capture_pageview: false,
        autocapture: true,
        rageclick: true,
        mask_all_element_attributes: true,
        session_recording: expect.objectContaining({
          maskAllInputs: true,
          maskTextSelector: expect.stringContaining("[data-ph-mask]"),
        }),
      }),
    );
  });
});
