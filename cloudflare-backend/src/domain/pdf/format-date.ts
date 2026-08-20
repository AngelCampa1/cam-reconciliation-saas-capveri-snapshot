/**
 * Canonical human-facing date formatter for generated PDFs.
 *
 * Kept in its own module (no page-geometry or layout coupling) so every PDF
 * generator — including ones with their own margins like the legal demand
 * letter — can share one source of truth without importing layout constants.
 */

/**
 * Format an ISO date string "YYYY-MM-DD" as "Month D, YYYY" using local date
 * construction (avoids a UTC midnight offset shift). Returns the input
 * unchanged when it is empty or not a recognizable ISO date, so callers can
 * pass optional fields without guarding first.
 */
export function formatDate(iso: string): string {
  const datePart = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(datePart)) {
    return iso;
  }
  const [year, month, day] = datePart.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
