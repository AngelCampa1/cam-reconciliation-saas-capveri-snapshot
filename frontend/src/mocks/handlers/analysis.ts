/**
 * MSW handlers for analysis endpoints
 *
 * Provides mock responses for year-over-year analysis features.
 */
import { http, HttpResponse } from 'msw'
import type {
  YearOverYearComparison,
  YearOverYearRequest,
  PoolComparison,
} from '@/features/analysis/types'

// Store for available years per property
let availableYearsStore: Record<string, number[]> = {}

// Default available years
const DEFAULT_AVAILABLE_YEARS = [2022, 2023, 2024]

/**
 * Reset analysis state - call between tests
 */
export function resetAnalysisState(): void {
  availableYearsStore = {}
}

/**
 * Seed available years for a property
 */
export function seedAvailableYears(propertyId: string, years: number[]): void {
  availableYearsStore[propertyId] = years
}

/**
 * Create mock pool comparison data
 */
function createMockPoolComparisons(years: number[]): PoolComparison[] {
  const pools = [
    { name: 'Utilities', base: 25000 },
    { name: 'Janitorial', base: 15000 },
    { name: 'Insurance', base: 8000 },
    { name: 'Property Tax', base: 45000 },
    { name: 'Security', base: 12000 },
  ]

  return pools.map((pool) => {
    const amounts: Record<number, number | null> = {}
    years.forEach((year, index) => {
      // Create some variance year over year
      const variance = 1 + index * 0.05 + (Math.random() * 0.1 - 0.05)
      amounts[year] = Math.round(pool.base * variance)
    })

    const baseYearAmount = amounts[years[0]!] ?? pool.base
    const latestAmount = amounts[years[years.length - 1]!] ?? pool.base
    const varianceAmount = latestAmount - baseYearAmount
    const variancePercent = baseYearAmount
      ? (varianceAmount / baseYearAmount) * 100
      : 0

    return {
      pool_name: pool.name,
      amounts,
      base_year_amount: baseYearAmount,
      variance_amount: varianceAmount,
      variance_percent: variancePercent,
      variance_level:
        Math.abs(variancePercent) < 5
          ? 'normal'
          : Math.abs(variancePercent) < 15
            ? 'warning'
            : 'critical',
      matched_from: null,
    }
  })
}

export const analysisHandlers = [
  // GET /api/v1/analysis/properties/:propertyId/available-years
  http.get(
    '*/api/v1/analysis/properties/:propertyId/available-years',
    ({ params }) => {
      const propertyId = params.propertyId as string
      const years = availableYearsStore[propertyId] ?? DEFAULT_AVAILABLE_YEARS

      return HttpResponse.json(years)
    }
  ),

  // POST /api/v1/analysis/year-over-year
  http.post('*/api/v1/analysis/year-over-year', async ({ request }) => {
    const body = (await request.json()) as YearOverYearRequest

    if (!body.property_id || !body.years || body.years.length < 2) {
      return HttpResponse.json(
        {
          detail: 'Invalid request: property_id and at least 2 years required',
        },
        { status: 400 }
      )
    }

    const poolComparisons = createMockPoolComparisons(body.years)

    // Calculate totals
    const totalAmounts: Record<number, number> = {}
    body.years.forEach((year) => {
      totalAmounts[year] = poolComparisons.reduce(
        (sum, pool) => sum + (pool.amounts[year] ?? 0),
        0
      )
    })

    const baseTotal = totalAmounts[body.years[0]!] ?? 0
    const latestTotal = totalAmounts[body.years[body.years.length - 1]!] ?? 0
    const totalVarianceAmount = latestTotal - baseTotal
    const totalVariancePercent = baseTotal
      ? (totalVarianceAmount / baseTotal) * 100
      : 0

    const response: YearOverYearComparison = {
      property_id: body.property_id,
      property_name: 'Test Property',
      years: body.years,
      base_year: body.years[0]!,
      pool_comparisons: poolComparisons,
      total_amounts: totalAmounts,
      total_variance_amount: totalVarianceAmount,
      total_variance_percent: totalVariancePercent,
    }

    return HttpResponse.json(response)
  }),
]
