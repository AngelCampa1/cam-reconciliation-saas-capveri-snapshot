/**
 * Tests for MSW Analysis Handlers
 *
 * Validates analysis mock handlers match API contract.
 * Uses real fetch calls against MSW server to ensure handlers work correctly.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { resetAnalysisState, seedAvailableYears } from './analysis'

const API_BASE = 'http://localhost:8000'

describe('MSW Analysis Handlers', () => {
  beforeEach(() => {
    resetAnalysisState()
  })

  // State Management Tests
  describe('State Management', () => {
    it('resetAnalysisState clears availableYearsStore', async () => {
      // Seed data first
      seedAvailableYears('prop-1', [2020, 2021, 2022])

      // Verify seeded data works
      const res1 = await fetch(
        `${API_BASE}/api/v1/analysis/properties/prop-1/available-years`
      )
      const data1 = await res1.json()
      expect(data1).toEqual([2020, 2021, 2022])

      // Reset and verify default is returned
      resetAnalysisState()
      const res2 = await fetch(
        `${API_BASE}/api/v1/analysis/properties/prop-1/available-years`
      )
      const data2 = await res2.json()
      expect(data2).toEqual([2022, 2023, 2024]) // DEFAULT_AVAILABLE_YEARS
    })

    it('seedAvailableYears sets years for a property', async () => {
      seedAvailableYears('prop-custom', [2019, 2020, 2021, 2022])

      const res = await fetch(
        `${API_BASE}/api/v1/analysis/properties/prop-custom/available-years`
      )
      const data = await res.json()

      expect(data).toEqual([2019, 2020, 2021, 2022])
    })

    it('seedAvailableYears overwrites existing years for property', async () => {
      seedAvailableYears('prop-1', [2020, 2021])
      seedAvailableYears('prop-1', [2023, 2024, 2025])

      const res = await fetch(
        `${API_BASE}/api/v1/analysis/properties/prop-1/available-years`
      )
      const data = await res.json()

      // Should return latest seeded years, not first ones
      expect(data).toEqual([2023, 2024, 2025])
    })
  })

  // GET /available-years Tests
  describe('GET /available-years', () => {
    it('returns default years when property not seeded', async () => {
      const res = await fetch(
        `${API_BASE}/api/v1/analysis/properties/prop-unseeded/available-years`
      )
      const data = await res.json()

      expect(data).toEqual([2022, 2023, 2024])
    })

    it('returns seeded years for specific property', async () => {
      seedAvailableYears('prop-123', [2018, 2019, 2020])

      const res = await fetch(
        `${API_BASE}/api/v1/analysis/properties/prop-123/available-years`
      )
      const data = await res.json()

      expect(data).toEqual([2018, 2019, 2020])
    })

    it('returns correct years for multiple properties', async () => {
      seedAvailableYears('prop-a', [2020, 2021])
      seedAvailableYears('prop-b', [2022, 2023, 2024])

      const resA = await fetch(
        `${API_BASE}/api/v1/analysis/properties/prop-a/available-years`
      )
      const dataA = await resA.json()

      const resB = await fetch(
        `${API_BASE}/api/v1/analysis/properties/prop-b/available-years`
      )
      const dataB = await resB.json()

      expect(dataA).toEqual([2020, 2021])
      expect(dataB).toEqual([2022, 2023, 2024])
    })

    it('responds with 200 status code', async () => {
      const res = await fetch(
        `${API_BASE}/api/v1/analysis/properties/prop-test/available-years`
      )

      expect(res.status).toBe(200)
      expect(res.ok).toBe(true)
    })

    it('returns array of numbers', async () => {
      const res = await fetch(
        `${API_BASE}/api/v1/analysis/properties/prop-test/available-years`
      )
      const data = await res.json()

      expect(Array.isArray(data)).toBe(true)
      expect(data.every((year) => typeof year === 'number')).toBe(true)
    })
  })

  // POST /year-over-year Tests
  describe('POST /year-over-year', () => {
    it('returns comparison data with valid request', async () => {
      const requestBody = {
        property_id: 'prop-123',
        years: [2022, 2023, 2024],
      }

      const res = await fetch(`${API_BASE}/api/v1/analysis/year-over-year`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('property_id', 'prop-123')
      expect(data).toHaveProperty('property_name', 'Test Property')
      expect(data).toHaveProperty('years', [2022, 2023, 2024])
      expect(data).toHaveProperty('base_year', 2022)
      expect(data).toHaveProperty('pool_comparisons')
      expect(data).toHaveProperty('total_amounts')
      expect(data).toHaveProperty('total_variance_amount')
      expect(data).toHaveProperty('total_variance_percent')
    })

    it('returns 400 when property_id missing', async () => {
      const requestBody = {
        years: [2022, 2023],
      }

      const res = await fetch(`${API_BASE}/api/v1/analysis/year-over-year`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data).toHaveProperty('detail')
      expect(data.detail).toContain('property_id')
    })

    it('returns 400 when years array has less than 2 items', async () => {
      const requestBody = {
        property_id: 'prop-123',
        years: [2022], // Only 1 year
      }

      const res = await fetch(`${API_BASE}/api/v1/analysis/year-over-year`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data).toHaveProperty('detail')
      expect(data.detail).toContain('at least 2 years required')
    })

    it('calculates variance correctly in pool comparisons', async () => {
      const requestBody = {
        property_id: 'prop-123',
        years: [2022, 2023],
      }

      const res = await fetch(`${API_BASE}/api/v1/analysis/year-over-year`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const data = await res.json()

      expect(data.pool_comparisons).toBeDefined()
      expect(data.pool_comparisons.length).toBeGreaterThan(0)

      // Check first pool's variance calculation
      const pool = data.pool_comparisons[0]
      expect(pool).toHaveProperty('base_year_amount')
      expect(pool).toHaveProperty('variance_amount')
      expect(pool).toHaveProperty('variance_percent')

      const baseAmount = pool.amounts[2022]
      const latestAmount = pool.amounts[2023]
      const expectedVariance = latestAmount - baseAmount
      const expectedPercent =
        baseAmount !== 0 ? (expectedVariance / baseAmount) * 100 : 0

      expect(pool.variance_amount).toBe(expectedVariance)
      expect(pool.variance_percent).toBeCloseTo(expectedPercent, 1)
    })
  })

  // Data Generation Tests
  describe('Data Generation', () => {
    it('assigns variance_level based on variance_percent thresholds', async () => {
      const requestBody = {
        property_id: 'prop-123',
        years: [2022, 2023],
      }

      const res = await fetch(`${API_BASE}/api/v1/analysis/year-over-year`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const data = await res.json()

      // Check variance level assignment
      data.pool_comparisons.forEach((pool: any) => {
        const absPercent = Math.abs(pool.variance_percent)
        if (absPercent < 5) {
          expect(pool.variance_level).toBe('normal')
        } else if (absPercent < 15) {
          expect(pool.variance_level).toBe('warning')
        } else {
          expect(pool.variance_level).toBe('critical')
        }
      })
    })

    it('generates pool comparisons with all required fields', async () => {
      const requestBody = {
        property_id: 'prop-123',
        years: [2022, 2023, 2024],
      }

      const res = await fetch(`${API_BASE}/api/v1/analysis/year-over-year`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const data = await res.json()

      expect(data.pool_comparisons.length).toBeGreaterThan(0)

      data.pool_comparisons.forEach((pool: any) => {
        expect(pool).toHaveProperty('pool_name')
        expect(pool).toHaveProperty('amounts')
        expect(pool).toHaveProperty('base_year_amount')
        expect(pool).toHaveProperty('variance_amount')
        expect(pool).toHaveProperty('variance_percent')
        expect(pool).toHaveProperty('variance_level')
        expect(pool).toHaveProperty('matched_from')

        // Verify amounts for all requested years
        requestBody.years.forEach((year) => {
          expect(pool.amounts).toHaveProperty(String(year))
          expect(typeof pool.amounts[year]).toBe('number')
        })

        // Verify variance level is valid
        expect(['normal', 'warning', 'critical']).toContain(pool.variance_level)
      })
    })
  })
})
