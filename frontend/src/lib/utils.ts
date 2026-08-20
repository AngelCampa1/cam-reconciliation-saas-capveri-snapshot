import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility function for merging Tailwind CSS classes with proper precedence.
 * Combines clsx for conditional classes and tailwind-merge for deduplication.
 *
 * @example
 * cn('px-2 py-1', condition && 'bg-primary', 'px-4') // => 'py-1 bg-primary px-4'
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a calendar date (a date-only value such as "2024-01-01") for display
 * WITHOUT applying a timezone shift.
 *
 * `new Date('2024-01-01')` parses the string as UTC midnight; rendering that with
 * `toLocaleDateString` in a negative-offset timezone (most of the US) yields the
 * PREVIOUS day ("Dec 31, 2023"). Lease start/end dates, reconciliation periods,
 * tax-protest deadlines, and RSF measurement dates are calendar dates with no
 * meaningful time-of-day, so they must be parsed from their local date parts to
 * show the date the user actually entered. Use this for date-only fields; keep
 * timezone-aware `new Date(...)` formatting only for true timestamps such as
 * `created_at`/`updated_at`.
 *
 * Accepts a bare "YYYY-MM-DD" string or a full ISO timestamp (the time portion is
 * discarded). Returns an empty string for nullish/blank/malformed input.
 *
 * @example
 * formatCalendarDate('2024-01-01') // => 'Jan 1, 2024' in any timezone
 */
export function formatCalendarDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  if (!value) return ''
  const datePart = value.split('T')[0] ?? ''
  const parts = datePart.split('-')
  const year = parseInt(parts[0] ?? '', 10)
  const month = parseInt(parts[1] ?? '', 10)
  const day = parseInt(parts[2] ?? '', 10)
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return ''
  }
  return new Date(year, month - 1, day).toLocaleDateString('en-US', options)
}

/**
 * Formats a true timestamp (a `*_at` instant such as `created_at`,
 * `updated_at`, or `expires_at`) as a short calendar date in the viewer's
 * local timezone.
 *
 * This is the timestamp companion to {@link formatCalendarDate}. Unlike a
 * date-only value, a timestamp carries a meaningful time of day, so the
 * timezone-aware `new Date(value)` is exactly what we want: the displayed day
 * is the local day of that instant. A record created at 11pm UTC should read
 * as the local day it happened, not the UTC date part. Do NOT use this for
 * date-only fields (lease start/end, effective dates) — use
 * `formatCalendarDate` there to avoid an off-by-one shift.
 *
 * Returns an empty string for nullish input.
 *
 * @example
 * formatTimestampDate('2024-01-15T18:30:00Z') // => 'Jan 15, 2024' (local)
 */
export function formatTimestampDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }
): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-US', options)
}

/**
 * Formats a true timestamp (a `*_at` instant) as a short calendar date plus the
 * time of day, in the viewer's local timezone — e.g. `Jan 15, 2024 3:05 PM`.
 *
 * This is the date+time companion to {@link formatTimestampDate}. Use it when a
 * render needs both the day and the clock time of an instant (upload history,
 * activity feeds). Like `formatTimestampDate`, it is timezone-aware, so the
 * displayed day and time are the local day and time of that instant. Do NOT use
 * it for date-only fields — use `formatCalendarDate` there.
 *
 * The output is intentionally byte-identical to the date-fns
 * `'MMM d, yyyy h:mm a'` token it replaces: a short month, no zero-padded hour,
 * an uppercase AM/PM, and a single space (not a comma) between date and time.
 * Note the single-call `toLocaleString`/`Intl.DateTimeFormat` with the same
 * options inserts a COMMA before the time ("Jan 15, 2024, 3:05 PM"); this helper
 * composes the two parts to keep the single space, so route those inline calls
 * through here for a consistent app-wide date+time format.
 *
 * Accepts an ISO timestamp string or a `Date`. Returns an empty string for
 * nullish input.
 *
 * @example
 * formatDateTime('2024-01-15T15:05:00Z') // => 'Jan 15, 2024 3:05 PM' (local)
 */
export function formatDateTime(
  value: string | Date | null | undefined
): string {
  if (!value) return ''
  const date = new Date(value)
  const datePart = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const timePart = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${datePart} ${timePart}`
}
