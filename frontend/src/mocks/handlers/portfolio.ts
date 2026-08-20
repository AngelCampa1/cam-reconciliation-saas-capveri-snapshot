/**
 * MSW handlers for portfolio summary endpoint
 */
import { http, HttpResponse } from 'msw'

export interface PropertyPortfolioEntry {
  property_id: string
  property_name: string
  total_recoverable: string
  total_billed: string
  leakage: string
  recovery_rate: number | null
}

export interface PortfolioSummaryResponse {
  period_year: number | null
  total_recoverable_cam: string
  total_leakage: string
  recovery_rate: number | null
  properties_with_leakage: number
  has_billing_data: boolean
  total_recovery_all_years: string
  properties: PropertyPortfolioEntry[]
}

const defaultPortfolioData: PortfolioSummaryResponse = {
  period_year: 2024,
  total_recoverable_cam: '350000',
  total_leakage: '105000',
  recovery_rate: 70.0,
  properties_with_leakage: 2,
  has_billing_data: true,
  total_recovery_all_years: '350000',
  properties: [
    {
      property_id: '00000000-0000-0000-0000-000000000001',
      property_name: 'Harbor View Tower',
      total_recoverable: '200000',
      total_billed: '130000',
      leakage: '70000',
      recovery_rate: 65.0,
    },
    {
      property_id: '00000000-0000-0000-0000-000000000002',
      property_name: 'Main Street Plaza',
      total_recoverable: '150000',
      total_billed: '115000',
      leakage: '35000',
      recovery_rate: 76.67,
    },
  ],
}

let portfolioData: PortfolioSummaryResponse = { ...defaultPortfolioData }

export function resetPortfolioData(): void {
  portfolioData = { ...defaultPortfolioData }
}

export function setPortfolioData(
  data: Partial<PortfolioSummaryResponse>
): void {
  portfolioData = { ...portfolioData, ...data }
}

export const portfolioHandlers = [
  http.get('*/api/v1/portfolio/summary', () => {
    return HttpResponse.json(portfolioData)
  }),
]

export function getPortfolioErrorHandler(status: number = 500) {
  return http.get('*/api/v1/portfolio/summary', () => {
    return HttpResponse.json({ detail: 'Internal server error' }, { status })
  })
}
