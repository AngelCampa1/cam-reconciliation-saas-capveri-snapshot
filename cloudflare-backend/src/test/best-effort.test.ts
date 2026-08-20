import { Hono } from "hono";
import { describe, expect, it, vi, afterEach } from "vitest";
import type { AppEnv } from "../env";
import { scheduleBestEffort } from "../platform/best-effort";

const sentryDsn = "https://public@example.ingest.sentry.io/12345";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("scheduleBestEffort", () => {
  it("keeps successful side effects silent", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const app = new Hono<{ Bindings: Partial<AppEnv> }>();

    app.get("/ok", (c) => {
      scheduleBestEffort(c, Promise.resolve(), {
        operation: "worker.best_effort.test",
      });
      return c.json({ ok: true });
    });

    const response = await app.request(
      "/ok",
      {},
      { SENTRY_DSN: sentryDsn, ENVIRONMENT: "development", APP_VERSION: "0.1.0" },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports failed side effects without changing the response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const app = new Hono<{ Bindings: Partial<AppEnv> }>();

    app.get("/scheduled", (c) => {
      scheduleBestEffort(c, Promise.reject(new Error("email failed")), {
        operation: "worker.best_effort.test",
      });
      return c.json({ ok: true });
    });

    const response = await app.request(
      "/scheduled",
      {},
      { SENTRY_DSN: sentryDsn, ENVIRONMENT: "development", APP_VERSION: "0.1.0" },
    );

    expect(response.status).toBe(200);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(body).toContain("\"operation\":\"worker.best_effort.test\"");
    expect(body).toContain("\"path\":\"/scheduled\"");
  });
});
