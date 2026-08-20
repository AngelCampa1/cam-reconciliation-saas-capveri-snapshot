import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError, z } from "zod";
import type { AppEnv } from "../env";
import { errorResponse, HttpError } from "../http/errors";
import { captureWorkerException } from "../platform/sentry";

const sentryDsn = "https://public@example.ingest.sentry.io/12345";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("worker Sentry capture", () => {
  it("does not call Sentry when SENTRY_DSN is unset", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await captureWorkerException(
      { ENVIRONMENT: "development", APP_VERSION: "0.1.0" },
      new Error("boom"),
      { operation: "test.operation", statusCode: 500 },
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports unexpected failures with scrubbed messages and tags", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);

    await captureWorkerException(
      {
        ENVIRONMENT: "development",
        APP_VERSION: "0.1.0",
        SENTRY_DSN: sentryDsn,
      },
      new Error("failed for jane@example.com with token eyJabc.eyJdef.sig"),
      {
        operation: "worker.unhandled_exception",
        method: "POST",
        path: "/api/v1/imports",
        statusCode: 500,
      },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://example.ingest.sentry.io/api/12345/envelope/");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/x-sentry-envelope",
    });

    const body = String(init?.body);
    expect(body).toContain("\"operation\":\"worker.unhandled_exception\"");
    expect(body).toContain("\"path\":\"/api/v1/imports\"");
    expect(body).toContain("[email]");
    expect(body).toContain("[token]");
    expect(body).not.toContain("jane@example.com");
  });

  it("does not report expected validation or client errors", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const env = { SENTRY_DSN: sentryDsn } as Partial<AppEnv>;

    await captureWorkerException(env, new HttpError(404, "not_found", "Nope"), {
      operation: "test.client_error",
      statusCode: 404,
    });

    await captureWorkerException(
      env,
      new ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ["name"],
          message: "Required",
        },
      ]),
      { operation: "test.validation", statusCode: 422 },
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows Sentry transport failures so reporting never breaks the caller", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("dns"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      captureWorkerException(
        {
          ENVIRONMENT: "development",
          APP_VERSION: "0.1.0",
          SENTRY_DSN: sentryDsn,
        },
        new Error("boom"),
        { operation: "test.operation", statusCode: 500 },
      ),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reports centralized Worker route 500s while returning graceful JSON", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const app = new Hono<{ Bindings: Partial<AppEnv> }>();

    app.onError((error, c) => errorResponse(c, error));
    app.get("/explode", () => {
      throw new Error("database down for 192.168.1.5");
    });

    const response = await app.request(
      "/explode",
      {},
      {
        SENTRY_DSN: sentryDsn,
        ENVIRONMENT: "development",
        APP_VERSION: "0.1.0",
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      detail: "Unexpected server error",
      error: { code: "internal_error", message: "Unexpected server error" },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("[ip]");
  });
});
