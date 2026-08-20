/**
 * Raised when Postgres rejects a string that is too long for its target column
 * (SQLSTATE 22001, "string_data_right_truncation", "value too long for type
 * character varying(N)"). On every current write path this is driven by the
 * value being written — an over-length text field supplied by the caller (a GL
 * memo, account/vendor name, note, filename, etc.) — so the HTTP layer maps it
 * to a 422 (caller must shorten the value) instead of a generic 500. It is a
 * fail-closed net: the offending statement never committed.
 *
 * Caveat: 22001 can also come from an in-SQL narrowing cast (e.g. `::varchar(n)`
 * on a value we build server-side), which would be a server bug wrongly
 * downgraded to 422 and skip Sentry — see the note in postgres.ts before adding
 * any computed/narrowing string write path.
 *
 * The higher-volume GL import path rejects over-length fields at parse time with
 * a specific message before the DB round-trip; this net catches every other text
 * column in one place without per-field guards.
 *
 * Lives in a dependency-free leaf module so both the postgres adapter (which
 * throws it) and the HTTP error mapper in `http/errors.ts` (which catches it)
 * can import it without forming an import cycle — mirroring
 * `numeric-overflow-error.ts` and `pool-exhaustion-error.ts`.
 */
export class StringTooLongError extends Error {
  constructor(cause: unknown) {
    super("A text value is too long for its field");
    this.name = "StringTooLongError";
    this.cause = cause;
  }
}
