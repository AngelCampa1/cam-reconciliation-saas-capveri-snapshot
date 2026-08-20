import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { errorResponse, HttpError } from "../http/errors";
import { NumericOverflowError } from "../adapters/db/numeric-overflow-error";
import { StringTooLongError } from "../adapters/db/string-truncation-error";
import { PoolExhaustionError } from "../adapters/db/pool-exhaustion-error";

function appThatThrows(error: unknown): Hono {
  const app = new Hono();
  app.get("/boom", () => {
    throw error;
  });
  app.onError((err, c) => errorResponse(c, err));

  return app;
}

describe("errorResponse", () => {
  it("maps a NumericOverflowError to a 422 numeric_out_of_range", async () => {
    const app = appThatThrows(new NumericOverflowError({ code: "22003" }));

    const response = await app.request("/boom");

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      detail: "A numeric value exceeds the maximum supported range",
      error: {
        code: "numeric_out_of_range",
        message: "A numeric value exceeds the maximum supported range",
      },
    });
  });

  it("maps a StringTooLongError to a 422 field_too_long", async () => {
    const app = appThatThrows(new StringTooLongError({ code: "22001" }));

    const response = await app.request("/boom");

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      detail: "A text value is too long for its field",
      error: {
        code: "field_too_long",
        message: "A text value is too long for its field",
      },
    });
  });

  it("maps a PoolExhaustionError to a retryable 503", async () => {
    const app = appThatThrows(new PoolExhaustionError({ code: "XX000" }));

    const response = await app.request("/boom");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "service_unavailable" },
    });
  });

  it("passes an HttpError through with its own status and code", async () => {
    const app = appThatThrows(new HttpError(404, "not_found", "Missing"));

    const response = await app.request("/boom");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "not_found", message: "Missing" },
    });
  });
});
