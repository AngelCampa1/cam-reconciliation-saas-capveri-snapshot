import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { captureWorkerException } from "../platform/sentry";
import { PoolExhaustionError } from "../adapters/db/pool-exhaustion-error";
import { NumericOverflowError } from "../adapters/db/numeric-overflow-error";
import { StringTooLongError } from "../adapters/db/string-truncation-error";

export class HttpError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function scheduleSentryCapture(
  c: Context,
  error: unknown,
  context: {
    operation: string;
    statusCode: number;
  },
): void {
  const capture = captureWorkerException(c.env, error, {
    ...context,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
  });

  try {
    c.executionCtx.waitUntil(capture);
  } catch {
    void capture;
  }
}

export function errorResponse(c: Context, error: unknown): Response {
  if (error instanceof HttpError) {
    if (error.status >= 500) {
      scheduleSentryCapture(c, error, {
        operation: "worker.http_error",
        statusCode: error.status,
      });
    }

    return c.json(
      {
        detail: error.message,
        error: { code: error.code, message: error.message },
      },
      error.status,
    );
  }

  if (error instanceof NumericOverflowError) {
    return c.json(
      {
        detail: error.message,
        error: { code: "numeric_out_of_range", message: error.message },
      },
      422,
    );
  }

  if (error instanceof StringTooLongError) {
    return c.json(
      {
        detail: error.message,
        error: { code: "field_too_long", message: error.message },
      },
      422,
    );
  }

  if (error instanceof PoolExhaustionError) {
    return c.json(
      {
        detail: "Service is busy. Please retry in a moment.",
        error: {
          code: "service_unavailable",
          message: "Service is busy. Please retry in a moment.",
        },
      },
      503,
    );
  }

  if (error instanceof ZodError) {
    const message = error.issues
      .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
      .join("; ");

    return c.json(
      {
        detail: message,
        error: { code: "validation_error", message },
      },
      422,
    );
  }

  scheduleSentryCapture(c, error, {
    operation: "worker.unhandled_exception",
    statusCode: 500,
  });

  return c.json(
    {
      detail: "Unexpected server error",
      error: { code: "internal_error", message: "Unexpected server error" },
    },
    500,
  );
}
