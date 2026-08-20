/**
 * Raised when Postgres rejects a value that does not fit a numeric column
 * (SQLSTATE 22003, "numeric_value_out_of_range"). On every current write path
 * this is driven by the value being written — a mis-keyed / concatenated amount
 * or measurement whose magnitude exceeds the column's NUMERIC(precision, scale)
 * ceiling — so the HTTP layer maps it to a 422 (caller must fix the value)
 * instead of a generic 500. It is a fail-closed net: the offending statement
 * never committed. (Caveat: 22003 can also come from in-SQL arithmetic that
 * overflows an intermediate numeric, which would be a server bug — see the note
 * in postgres.ts before adding computed-numeric write paths.)
 *
 * Higher-volume CSV import paths (GL entries, actual-billed amounts) reject
 * out-of-range values at parse time with a specific message before the DB
 * round-trip; this catches every other numeric column (e.g. base-year amounts,
 * square footages) in one place without per-field guards.
 *
 * Lives in a dependency-free leaf module so both the postgres adapter (which
 * throws it) and the HTTP error mapper in `http/errors.ts` (which catches it)
 * can import it without forming an import cycle — mirroring
 * `pool-exhaustion-error.ts`.
 */
export class NumericOverflowError extends Error {
  constructor(cause: unknown) {
    super("A numeric value exceeds the maximum supported range");
    this.name = "NumericOverflowError";
    this.cause = cause;
  }
}
