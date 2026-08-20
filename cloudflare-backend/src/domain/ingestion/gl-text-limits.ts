/**
 * Column-width limits for the text fields of `gl_entries` (see
 * supabase/migrations/20240101000007_create_gl_entries.sql). A CSV cell wider
 * than its target column raises Postgres SQLSTATE 22001 at insert time, which
 * would otherwise surface as an opaque 500 on the whole import. The ingestion
 * routes preflight parsed entries against these limits and reject over-length
 * values with a specific 422 before the DB round-trip.
 *
 * Dependency-free leaf so both the ingestion routes and their tests can import
 * the limits and the pure detector without pulling in HTTP/DB machinery.
 */

export const GL_TEXT_FIELD_LIMITS = {
  account_code: 50,
  account_description: 255,
  vendor_name: 255,
  description: 1000,
} as const;

export type GlTextField = keyof typeof GL_TEXT_FIELD_LIMITS;

/** A GL entry, narrowed to just the length-limited text fields. */
export type GlTextFields = {
  account_code: string;
  account_description: string;
  vendor_name: string | null;
  description: string | null;
};

export type GlTextFieldViolation = {
  index: number;
  field: GlTextField;
  limit: number;
};

/**
 * Returns the first entry whose text field exceeds its column width, or null if
 * every entry fits. Nullable fields are only checked when present. Order of
 * fields is stable so the reported violation is deterministic.
 */
export function findFirstTextFieldTooLong(
  entries: readonly GlTextFields[],
): GlTextFieldViolation | null {
  const fields: readonly GlTextField[] = [
    "account_code",
    "account_description",
    "vendor_name",
    "description",
  ];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) {
      continue;
    }
    for (const field of fields) {
      const value = entry[field];
      // `.length` counts UTF-16 code units; Postgres varchar(N) counts code
      // points. For astral-plane input this over-counts, so the guard is at
      // worst slightly stricter than the column — a fail-safe 422, never a
      // false negative that would reach the DB and 500 on 22001.
      if (typeof value === "string" && value.length > GL_TEXT_FIELD_LIMITS[field]) {
        return { index, field, limit: GL_TEXT_FIELD_LIMITS[field] };
      }
    }
  }

  return null;
}
