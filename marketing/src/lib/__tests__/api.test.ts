import { afterEach, describe, expect, it, vi } from "vitest";
import { getMarketingApiBaseUrl, marketingApiUrl } from "@/lib/api";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("marketing API URL helpers", () => {
  it("falls back to the production API origin", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");

    expect(getMarketingApiBaseUrl()).toBe("https://api.capveri.com");
    expect(marketingApiUrl("/api/v1/leads/content-download")).toBe(
      "https://api.capveri.com/api/v1/leads/content-download",
    );
  });

  it("uses a configured origin without trailing slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://staging-api.capveri.com///");

    expect(getMarketingApiBaseUrl()).toBe("https://staging-api.capveri.com");
    expect(marketingApiUrl("api/v1/tools/fixed-cam-modeler")).toBe(
      "https://staging-api.capveri.com/api/v1/tools/fixed-cam-modeler",
    );
  });
});
