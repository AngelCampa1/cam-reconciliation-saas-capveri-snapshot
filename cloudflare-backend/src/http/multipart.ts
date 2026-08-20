import { HttpError } from "./errors";

/**
 * Parse a request body as multipart form data, failing closed with a 400 when
 * the body is not multipart (or is malformed). `c.req.formData()` throws a
 * TypeError for a JSON / wrong-content-type body; unguarded, that falls through
 * to the catch-all 500. Callers that expect a file upload should route the body
 * through here so a malformed request returns a clean, actionable 4xx.
 *
 * Structurally typed on the context so it works with every route's Bindings
 * without importing Hono's generic Context.
 */
export async function readMultipartForm(c: {
  req: { formData(): Promise<FormData> };
}): Promise<FormData> {
  try {
    return await c.req.formData();
  } catch {
    throw new HttpError(
      400,
      "invalid_multipart_body",
      "Request body must be multipart/form-data with a file upload.",
    );
  }
}
