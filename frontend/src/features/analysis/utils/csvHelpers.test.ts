/**
 * Tests for CSV Export Helper Functions
 *
 * Validates CSV generation and escaping logic for year-over-year exports.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  escapeCSVValue,
  generateCSVContent,
  generateCSVFilename,
} from './csvHelpers'
import type { YearOverYearComparison } from '../types'

describe('escapeCSVValue', () => {
  it('returns value unchanged when no special characters', () => {
    expect(escapeCSVValue('Simple Text')).toBe('Simple Text')
    expect(escapeCSVValue('123')).toBe('123')
    expect(escapeCSVValue('Utilities')).toBe('Utilities')
  })

  it('wraps value in quotes when comma present', () => {
    expect(escapeCSVValue('Hello, World')).toBe('"Hello, World"')
    expect(escapeCSVValue('Pool A, Pool B')).toBe('"Pool A, Pool B"')
  })

  it('wraps value in quotes when newline present', () => {
    expect(escapeCSVValue('Line 1\nLine 2')).toBe('"Line 1\nLine 2"')
    expect(escapeCSVValue('Text\n')).toBe('"Text\n"')
  })

  it('wraps value in quotes and escapes internal quotes', () => {
    expect(escapeCSVValue('He said "Hello"')).toBe('"He said ""Hello"""')
    expect(escapeCSVValue('"Quoted"')).toBe('"""Quoted"""')
  })

  it('handles multiple quotes correctly', () => {
    expect(escapeCSVValue('Quote "one" and "two"')).toBe(
      '"Quote ""one"" and ""two"""'
    )
  })

  it('handles combination of comma and quotes', () => {
    expect(escapeCSVValue('Pool "A", "B"')).toBe('"Pool ""A"", ""B"""')
  })
})

describe('generateCSVContent', () => {
  const mockData: YearOverYearComparison = {
    property_id: 'prop-123',
    property_name: 'Test Property',
    years: [2022, 2023, 2024],
    base_year: 2022,
    pool_comparisons: [
      {
        pool_name: 'Utilities',
        amounts: { 2022: 10000, 2023: 10500, 2024: 11000 },
        base_year_amount: 10000,
        variance_amount: 1000,
        variance_percent: 10.0,
        variance_level: 'normal',
        matched_from: null,
      },
      {
        pool_name: 'Janitorial, Cleaning',
        amounts: { 2022: 5000, 2023: 5250, 2024: null },
        base_year_amount: 5000,
        variance_amount: 250,
        variance_percent: 5.0,
        variance_level: 'normal',
        matched_from: null,
      },
    ],
    total_amounts: { 2022: 15000, 2023: 15750, 2024: 11000 },
    total_variance_amount: 1250,
    total_variance_percent: 8.33,
  }

  it('generates CSV with correct headers', () => {
    const csv = generateCSVContent(mockData)
    const lines = csv.split('\n')

    expect(lines[0]).toBe(
      'Pool Name,2022 ($),2023 ($),2024 ($),Variance ($),Variance (%)'
    )
  })

  it('escapes pool names with special characters', () => {
    const csv = generateCSVContent(mockData)
    const lines = csv.split('\n')

    // Second row has pool name with comma
    expect(lines[2]).toContain('"Janitorial, Cleaning"')
  })

  it('formats amounts as strings', () => {
    const csv = generateCSVContent(mockData)
    const lines = csv.split('\n')

    expect(lines[1]).toContain('10000')
    expect(lines[1]).toContain('10500')
    expect(lines[1]).toContain('11000')
  })

  it('uses N/A for null amounts', () => {
    const csv = generateCSVContent(mockData)
    const lines = csv.split('\n')

    // Second row has null for 2024
    expect(lines[2]).toContain('N/A')
  })

  it('formats variance percent to 1 decimal place', () => {
    const csv = generateCSVContent(mockData)
    const lines = csv.split('\n')

    expect(lines[1]).toContain('10.0')
    expect(lines[2]).toContain('5.0')
  })

  it('handles multiple years correctly', () => {
    const csv = generateCSVContent(mockData)
    const lines = csv.split('\n')

    // First row should have all 3 years
    expect(lines[1].split(',').length).toBe(6) // Pool Name + 3 years + 2 variances
  })

  it('generates valid CSV structure', () => {
    const csv = generateCSVContent(mockData)
    const lines = csv.split('\n')

    // Should have header + 2 pool rows
    expect(lines.length).toBe(3)
    expect(lines[0]).toContain('Pool Name')
    expect(lines[1]).toContain('Utilities')
    expect(lines[2]).toContain('Janitorial')
  })
})

describe('generateCSVFilename', () => {
  let dateNowSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Mock Date.now() to return fixed timestamp
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890)
  })

  afterEach(() => {
    dateNowSpy.mockRestore()
  })

  it('includes property name in filename', () => {
    const filename = generateCSVFilename('Test Property')
    expect(filename).toContain('Test Property')
    expect(filename).toMatch(/^yoy-comparison-/)
    expect(filename).toMatch(/\.csv$/)
  })

  it('escapes special characters in property name', () => {
    const filename = generateCSVFilename('Property, "A"')
    // Should remove quotes after escaping
    expect(filename).toContain('Property')
    expect(filename).not.toContain('"')
  })

  it('includes timestamp in filename', () => {
    const filename = generateCSVFilename('Test Property')
    expect(filename).toContain('1234567890')
  })
})
