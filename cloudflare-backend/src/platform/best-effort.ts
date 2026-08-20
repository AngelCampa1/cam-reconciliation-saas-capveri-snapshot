import type { AppEnv } from "../env";
import { captureWorkerException } from "./sentry";

type WaitUntilContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type BestEffortContext = {
  env: Partial<AppEnv>;
  req: {
    method: string;
    url: string;
  };
  readonly executionCtx: WaitUntilContext;
};

type BestEffortOptions = {
  operation: string;
};

function executionContextOrNull(c: BestEffortContext): WaitUntilContext | null {
  try {
    return c.executionCtx;
  } catch {
    return null;
  }
}

export function scheduleBestEffort(
  c: BestEffortContext,
  promise: Promise<unknown>,
  options: BestEffortOptions,
): void {
  const scheduled = promise.catch((error: unknown) =>
    captureWorkerException(c.env, error, {
      operation: options.operation,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      statusCode: 500,
    }),
  );

  const executionCtx = executionContextOrNull(c);
  if (executionCtx) {
    executionCtx.waitUntil(scheduled);
    return;
  }

  void scheduled;
}
