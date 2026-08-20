import * as Sentry from "@sentry/nextjs";

export interface MarketingErrorContext {
  operation: string;
  path?: string;
}

export function isExpectedBrowserTransportError(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  ) {
    return true;
  }
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message === "ai-sdr client failed to load" ||
    message === "ai-sdr client load timed out"
  );
}

export function captureMarketingException(
  error: Error,
  context: MarketingErrorContext,
): void {
  Sentry.captureException(error, {
    tags: {
      surface: "marketing",
      operation: context.operation,
      ...(context.path ? { path: context.path } : {}),
    },
  });
}
