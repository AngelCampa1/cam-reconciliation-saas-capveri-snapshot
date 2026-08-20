import { describe, it, expect } from 'vitest'
import {
  cn,
  formatCalendarDate,
  formatDateTime,
  formatTimestampDate,
} from './utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1')
    expect(cn()).toBe('')
  })

  it('handles conditional classes', () => {
    const isActive = true
    const isHidden = false
    expect(cn('base', isActive && 'active', isHidden && 'hidden')).toBe(
      'base active'
    )
    expect(cn('base', { visible: true, hidden: false })).toBe('base visible')
  })

  it('resolves Tailwind conflicts (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })
})

describe('formatCalendarDate', () => {
  it('formats a date-only string without timezone shift', () => {
    // The bug this guards: new Date('2024-01-01') is UTC midnight, which renders
    // as "Dec 31, 2023" in negative-offset locales. The calendar date must hold.
    expect(formatCalendarDate('2024-01-01')).toBe('Jan 1, 2024')
    expect(formatCalendarDate('2026-12-31')).toBe('Dec 31, 2026')
  })

  it('discards the time portion of a full ISO timestamp', () => {
    expect(formatCalendarDate('2024-07-04T23:30:00Z')).toBe('Jul 4, 2024')
  })

  it('honors custom Intl options', () => {
    expect(
      formatCalendarDate('2024-01-01', { month: 'short', year: 'numeric' })
    ).toBe('Jan 2024')
  })

  it('returns an empty string for nullish or blank input', () => {
    expect(formatCalendarDate(null)).toBe('')
    expect(formatCalendarDate(undefined)).toBe('')
    expect(formatCalendarDate('')).toBe('')
  })

  it('returns an empty string for malformed input', () => {
    expect(formatCalendarDate('not-a-date')).toBe('')
    expect(formatCalendarDate('2024-13-40')).toBe('')
  })
})

describe('formatTimestampDate', () => {
  it('renders a timestamp as a short calendar date with no time', () => {
    const out = formatTimestampDate('2024-01-15T18:30:00Z')
    // TZ-robust: a mid-day-UTC instant stays in 2024 in every timezone.
    expect(out).toMatch(/^[A-Za-z]{3} \d{1,2}, 2024$/)
    // It is a date, not a datetime — no time component.
    expect(out).not.toContain(':')
  })

  it('returns an empty string for nullish or blank input', () => {
    expect(formatTimestampDate(null)).toBe('')
    expect(formatTimestampDate(undefined)).toBe('')
    expect(formatTimestampDate('')).toBe('')
  })

  it('honors custom Intl options', () => {
    expect(
      formatTimestampDate('2024-01-15T18:30:00Z', { year: 'numeric' })
    ).toBe('2024')
  })
})

describe('formatDateTime', () => {
  it('renders a local timestamp as short date + 12-hour time', () => {
    // A floating (no-offset) datetime is parsed as local time, so the rendered
    // clock time is deterministic in every timezone.
    expect(formatDateTime('2024-01-15T15:05:00')).toBe('Jan 15, 2024 3:05 PM')
  })

  it('formats midnight and noon on the 12-hour clock', () => {
    expect(formatDateTime('2024-01-15T00:00:00')).toBe('Jan 15, 2024 12:00 AM')
    expect(formatDateTime('2024-07-04T12:00:00')).toBe('Jul 4, 2024 12:00 PM')
  })

  it('uses a single space (not a comma) between date and time', () => {
    // Byte-parity with the date-fns 'MMM d, yyyy h:mm a' token it replaced.
    const out = formatDateTime('2024-03-01T09:07:00')
    expect(out).toBe('Mar 1, 2024 9:07 AM')
    expect(out).not.toContain(', 2024,')
  })

  it('accepts a Date instance as well as an ISO string', () => {
    // Callers holding a Date (e.g. a mapped view model) can pass it directly.
    const asString = formatDateTime('2024-01-15T15:05:00')
    const asDate = formatDateTime(new Date('2024-01-15T15:05:00'))
    expect(asDate).toBe(asString)
    expect(asDate).toBe('Jan 15, 2024 3:05 PM')
  })

  it('returns an empty string for nullish or blank input', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime(undefined)).toBe('')
    expect(formatDateTime('')).toBe('')
  })
})
