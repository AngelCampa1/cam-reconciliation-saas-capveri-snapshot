/**
 * React Query Hooks for Invoice Operations
 *
 * Provides typed hooks for fetching billing invoices and summaries.
 * Uses React Query for caching and automatic refetching.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { resolveApiUrl } from '@/api/url'

export interface Invoice {
  id: string
  subscription_id: string | null
  stripe_invoice_id: string | null
  amount_due: number
  amount_paid: number
  currency: string
  status: string
  period_start: string | null
  period_end: string | null
  due_date: string | null
  paid_at: string | null
  pdf_url: string | null
  created_at: string
}

export interface InvoiceListResponse {
  invoices: Invoice[]
  total: number
  page: number
  per_page: number
  has_more: boolean
}

export interface InvoiceSummaryResponse {
  total_invoices: number
  paid_invoices: number
  open_invoices: number
  total_paid: number
  currency: string
}

/**
 * Fetch paginated list of invoices with optional status and type filters.
 *
 * @param status - Optional filter by invoice status (e.g., 'paid', 'open')
 * @param page - Page number (1-indexed)
 * @param perPage - Number of invoices per page (1-100)
 */
export function useInvoices(
  status?: string,
  page: number = 1,
  perPage: number = 10
) {
  return useQuery<InvoiceListResponse>({
    queryKey: ['invoices', status, page, perPage],
    // F-133: fail-open soft gate --- keep first-load failures inside query state
    // rather than escalating to the global ErrorBoundary and white-screening.
    throwOnError: false,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
      })
      if (status) {
        params.set('status', status)
      }

      // Get auth session for Authorization header
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('Authentication required')
      }

      const res = await fetch(
        resolveApiUrl(`/api/v1/billing/invoices?${params}`),
        {
          credentials: 'include',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )
      if (!res.ok) {
        throw new Error(`Failed to fetch invoices: ${res.statusText}`)
      }
      return res.json()
    },
  })
}

/**
 * Fetch invoice summary statistics.
 *
 * Returns aggregated totals for all invoices including:
 * - Total invoice count
 * - Paid invoice count
 * - Open invoice count
 * - Total amount paid
 */
export function useInvoiceSummary() {
  return useQuery<InvoiceSummaryResponse>({
    queryKey: ['invoices', 'summary'],
    queryFn: async () => {
      // Get auth session for Authorization header
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('Authentication required')
      }

      const res = await fetch(
        resolveApiUrl('/api/v1/billing/invoices/summary'),
        {
          credentials: 'include',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )
      if (!res.ok) {
        throw new Error(`Failed to fetch summary: ${res.statusText}`)
      }
      return res.json()
    },
  })
}
