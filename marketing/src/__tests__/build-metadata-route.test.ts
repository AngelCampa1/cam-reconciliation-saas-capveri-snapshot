import { afterEach, describe, expect, it, vi } from "vitest";

describe("/build.json", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns public build metadata", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "0.1.0");
    vi.stubEnv("NEXT_PUBLIC_BUILD_COMMIT", "abc123");
    vi.stubEnv("CF_WORKER_ENV", "production");

    const { GET } = await import("../app/build.json/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      app: "marketing",
      version: "0.1.0",
      commit: "abc123",
      environment: "production",
    });
  });
});
