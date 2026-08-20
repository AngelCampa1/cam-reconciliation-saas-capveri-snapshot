import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHash, createHmac, randomUUID } from "node:crypto";

import {
  PUBLIC_CALENDAR_TEXT,
  assertAiSdrWidgetReadyAndOpened,
  assertNoPublicCalendarExposure,
  assertSitemapHasNoPublicCalendarExposure,
} from "./no-public-calendar.shared";
import {
  HIGH_INTENT_AI_SDR_ROUTES,
  PUBLIC_CALENDAR_ROUTES,
} from "./no-public-calendar-routes";

const PRODUCTION_ORIGIN = "https://www.capveri.com";
const PRODUCTION_API_ORIGIN =
  process.env.E2E_PROD_API_URL ?? "https://api.capveri.com";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableJson(entryValue)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function signedHeaders(input: {
  path: string;
  secret: string;
  body: unknown;
}): Record<string, string> {
  const timestamp = new Date().toISOString();
  const nonce = randomUUID().replace(/-/gu, "");
  const bodyHash = createHash("sha256")
    .update(stableJson(input.body))
    .digest("hex");
  const signature = createHmac("sha256", input.secret)
    .update(`${timestamp}.${nonce}.GET.${input.path}.${bodyHash}`)
    .digest("hex");

  return {
    "X-Ventora-Timestamp": timestamp,
    "X-Ventora-Nonce": nonce,
    "X-Ventora-Signature": signature,
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  expect(value, `${name} is required for production calendar verification`)
    .toBeTruthy();
  return value ?? "";
}

function requiredFirstEnv(names: string[]): string {
  const value = names.map((name) => process.env[name]?.trim()).find(Boolean);
  expect(
    value,
    `${names.join(" or ")} is required for production calendar verification`,
  ).toBeTruthy();
  return value ?? "";
}

async function resolveProductionAuth(
  request: APIRequestContext,
): Promise<{ accessToken: string; userId: string }> {
  const accessToken = process.env.E2E_PROD_ACCESS_TOKEN?.trim();
  const userId = process.env.E2E_PROD_USER_ID?.trim();
  expect(
    !accessToken === !userId,
    "E2E_PROD_ACCESS_TOKEN and E2E_PROD_USER_ID must be supplied together",
  ).toBe(true);
  if (accessToken && userId) {
    return { accessToken, userId };
  }

  const supabaseUrl = requiredEnv("VITE_SUPABASE_URL").replace(/\/+$/u, "");
  const supabaseAnonKey = requiredEnv("VITE_SUPABASE_ANON_KEY");
  const email = requiredEnv("E2E_PROD_EMAIL");
  const password = requiredEnv("E2E_PROD_PASSWORD");
  const response = await request.post(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      headers: {
        apikey: supabaseAnonKey,
        "content-type": "application/json",
      },
      data: { email, password },
    },
  );
  expect(response.status(), "production Supabase password grant should work")
    .toBe(200);
  const body = (await response.json()) as {
    access_token?: string;
    user?: { id?: string };
  };
  expect(body.access_token, "production auth response should include a token")
    .toBeTruthy();
  expect(body.user?.id, "production auth response should include a user id")
    .toBeTruthy();

  return {
    accessToken: body.access_token ?? "",
    userId: body.user?.id ?? "",
  };
}

test.describe("production public calendar exposure", () => {
  test.skip(
    !process.env.RUN_PRODUCTION_TESTS || !!process.env.CI,
    "Skipped unless manually run outside CI - these tests call live production URLs",
  );

  for (const route of PUBLIC_CALENDAR_ROUTES) {
    test(`does not expose Cal.com on ${route}`, async ({ page }) => {
      await assertNoPublicCalendarExposure(
        page,
        `${PRODUCTION_ORIGIN}${route}`,
        route,
      );
    });
  }

  for (const route of HIGH_INTENT_AI_SDR_ROUTES) {
    test(`loads AI-SDR client without calendar requests on ${route}`, async ({
      page,
    }) => {
      await assertNoPublicCalendarExposure(
        page,
        `${PRODUCTION_ORIGIN}${route}`,
        route,
        async () => {
          await assertAiSdrWidgetReadyAndOpened(page, route);
        },
      );
    });
  }

  test("production sitemap routes do not expose public calendar domains", async ({
    request,
  }) => {
    test.setTimeout(180000);
    await assertSitemapHasNoPublicCalendarExposure(request, {
      sitemapUrl: `${PRODUCTION_ORIGIN}/sitemap.xml`,
      routeOrigin: PRODUCTION_ORIGIN,
      label: "production sitemap",
    });
  });

  test("signed marketing AI-SDR product context does not expose calendar links", async ({
    request,
  }) => {
    const secret = requiredFirstEnv([
      "AI_SDR_CONTEXT_SECRET",
      "AI_SDR_PRODUCT_CONTEXT_SECRET",
    ]);

    const path = "/api/ai-sdr/product-context?productId=capveri";
    const response = await request.get(`${PRODUCTION_ORIGIN}${path}`, {
      headers: signedHeaders({
        path,
        secret,
        body: { productId: "capveri" },
      }),
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.meetingLinks).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(PUBLIC_CALENDAR_TEXT);
  });

  test("signed backend AI-SDR product context does not expose calendar links", async ({
    request,
  }) => {
    const secret = requiredFirstEnv([
      "AI_SDR_PRODUCT_CONTEXT_SECRET",
      "AI_SDR_CONTEXT_SECRET",
    ]);

    const path = "/api/v1/ai-sdr/product-context?productId=capveri";
    const response = await request.get(`${PRODUCTION_API_ORIGIN}${path}`, {
      headers: signedHeaders({
        path,
        secret,
        body: { productId: "capveri" },
      }),
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.meetingLinks).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(PUBLIC_CALENDAR_TEXT);
  });

  test("signed backend AI-CS app context does not expose calendar links", async ({
    request,
  }) => {
    const secret = requiredEnv("AI_CS_CONTEXT_SECRET");
    const { accessToken, userId } = await resolveProductionAuth(request);
    const currentPath =
      "https://app.capveri.com/properties/33333333-3333-3333-3333-333333333333/reconciliations";
    const path = `/api/v1/ai-cs/app-context?appId=capveri&userId=${encodeURIComponent(userId)}&currentPath=${encodeURIComponent(currentPath)}`;
    const response = await request.get(`${PRODUCTION_API_ORIGIN}${path}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...signedHeaders({
          path,
          secret,
          body: { appId: "capveri", userId },
        }),
      },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.meetingLinks).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(PUBLIC_CALENDAR_TEXT);
  });
});
