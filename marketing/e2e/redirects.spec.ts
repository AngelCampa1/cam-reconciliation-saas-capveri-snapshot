/**
 * Production redirect tests - verify non-www → www redirects via Cloudflare Worker middleware.
 * These tests call absolute production URLs and do NOT use the local dev server.
 * Run manually with: npm run test:e2e:production:manual
 *
 * Known limitation: query parameters (e.g. ?ref=google) are NOT forwarded to the
 * destination URL. This is a canonical-host policy - the `source`
 * pattern matches only the pathname, so `$1` never includes query strings.
 * Requests to https://capveri.com/?utm_source=x redirect to https://www.capveri.com/
 * (query string dropped). This is acceptable because capveri.com is not a
 * direct link target for UTM-tagged campaigns.
 */
import { test, expect } from "@playwright/test";

const PRODUCTION_URL = "https://capveri.com";

test.describe("Non-www → www redirects", () => {
  test.skip(
    !process.env.RUN_PRODUCTION_TESTS || !!process.env.CI,
    "Skipped unless manually run outside CI - these tests call live production URLs",
  );

  test("root path redirects to www", async ({ request }) => {
    const response = await request.get(`${PRODUCTION_URL}/`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(308);
    expect(response.headers()["location"]).toBe("https://www.capveri.com/");
  });

  test("deep path redirects preserve path to www", async ({ request }) => {
    const response = await request.get(`${PRODUCTION_URL}/pricing`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(308);
    expect(response.headers()["location"]).toBe(
      "https://www.capveri.com/pricing",
    );
  });

  test("deep path with trailing slash reaches canonical www path", async ({
    request,
  }) => {
    const slashResponse = await request.get(`${PRODUCTION_URL}/pricing/`, {
      maxRedirects: 0,
    });
    expect(slashResponse.status()).toBe(308);
    expect(slashResponse.headers()["location"]).toBe("/pricing");

    const canonicalHostResponse = await request.get(
      `${PRODUCTION_URL}${slashResponse.headers()["location"]}`,
      {
        maxRedirects: 0,
      },
    );
    expect(canonicalHostResponse.status()).toBe(308);
    expect(canonicalHostResponse.headers()["location"]).toBe(
      "https://www.capveri.com/pricing",
    );
  });
});
