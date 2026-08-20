import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";

import { middleware } from "../middleware";

function request(url: string): NextRequest {
  return new NextRequest(url, {
    headers: { host: new URL(url).host },
  });
}

describe("Cloudflare host redirects", () => {
  test("keeps app routes on the app subdomain", () => {
    const appRoutes = [
      "dashboard",
      "auth",
      "settings",
      "properties",
      "reconciliations",
      "admin",
      "tenant",
      "organization",
      "portfolio",
    ];

    for (const route of appRoutes) {
      const response = middleware(
        request(`https://www.capveri.com/${route}/example?from=marketing`),
      );

      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        `https://app.capveri.com/${route}/example?from=marketing`,
      );
    }
  });

  test("keeps apex domain redirect configured without calling production", () => {
    const response = middleware(
      request("https://capveri.com/pricing?utm_source=test"),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://www.capveri.com/pricing",
    );
  });
});
