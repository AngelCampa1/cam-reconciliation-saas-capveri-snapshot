"use client";

import { useEffect } from "react";
import { captureMarketingException } from "@/lib/sentry";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export function GlobalErrorContent({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    captureMarketingException(error, {
      operation: "marketing.global-error",
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 sm:px-6 text-foreground">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The page could not load correctly. Try again, or contact support if
          this keeps happening.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-button bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:w-auto"
        >
          Try again
        </button>
      </div>
    </main>
  );
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body>
        <GlobalErrorContent error={error} reset={reset} />
      </body>
    </html>
  );
}
