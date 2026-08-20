/**
 * MSW handlers for secondary dashboard and billing endpoints.
 *
 * These keep shared tests from falling through to unhandled network requests
 * when components mount background queries.
 */
import { http, HttpResponse } from 'msw'

interface LeakageSummaryResponse {
  total_recovery_opportunity: string
  properties_with_leakage: number
  total_underbill_exposure: string
  total_overbill_exposure: string
  total_billing_exposure: string
  properties_with_underbill: number
  properties_with_overbill: number
  properties_with_billing_exposure: number
  has_billing_data: boolean
  draft_recovery: string
  draft_property_count: number
}

interface GuaranteeEligibilityResponse {
  eligible: boolean
  days_remaining: number
  first_invoice_amount: number | null
  first_invoice_currency: string
}

interface FreeAuditStatusResponse {
  has_subscription: boolean
  free_audit_consumed: boolean
  can_add_property: boolean
  can_run_reconciliation: boolean
  can_view_draft_report: boolean
  can_download_reports: boolean
  credit_balance: {
    total_purchased: number
    total_used: number
    total_remaining: number
  }
  has_ever_purchased: boolean
}

interface LeakageDetailResponse {
  leakage: number
  leakage_pct: number
  capveri_calculated: number
  actual_billed: number
  has_reconciliation_data: boolean
  has_gl_data: boolean
  has_billing_data: boolean
}

interface EmptyExpensePoolListResponse {
  data: Array<unknown>
  count: number
  has_more: boolean
}

interface EmptyPoolMappingListResponse {
  data: Array<unknown>
  count: number
  has_more: boolean
}

type SupabaseSubscriptionsResponse = Array<unknown>

interface TaxProtestDeadlinesResponse {
  items: Array<{
    property_id: string
    property_name: string
    county: string | null
    state: string | null
    effective_deadline: string | null
    days_remaining: number | null
    is_past: boolean
    is_configured: boolean
  }>
  year: number
}

interface ExportHistoryResponse {
  items: Array<{
    id: string
    file_name: string
    format: string
    status: string
    created_at: string
    expires_at: string | null
    file_size: number | null
    created_by_name: string
    download_url: string | null
  }>
  total: number
  page: number
  page_size: number
}

interface DetailAdvisorResponse {
  total_line_items: number
  total_categories: number
  overall_severity: 'ok' | 'suggestion' | 'warning' | 'critical'
  summary: string
  grouping_suggestions: Array<{
    category_name: string
    current_line_count: number
    suggested_label: string
    severity: 'ok' | 'suggestion' | 'warning' | 'critical'
    explanation: string
  }>
  immaterial_items: Array<{
    account_code: string
    account_description: string
    amount: number
    percent_of_total: number
    pool_name: string
  }>
  suggested_total_lines: number
}

let leakageSummary: LeakageSummaryResponse
let guaranteeEligibility: GuaranteeEligibilityResponse
let taxProtestDeadlines: TaxProtestDeadlinesResponse
let exportHistory: ExportHistoryResponse
let detailAdvisor: DetailAdvisorResponse
let freeAuditStatus: FreeAuditStatusResponse
let leakageDetail: LeakageDetailResponse
let expensePools: EmptyExpensePoolListResponse
let poolMappings: EmptyPoolMappingListResponse
let latestGLAnalysis: Record<string, unknown> | null
let supabaseSubscriptions: SupabaseSubscriptionsResponse

export function resetAuxiliaryData(): void {
  leakageSummary = {
    total_recovery_opportunity: '0',
    properties_with_leakage: 0,
    total_underbill_exposure: '0',
    total_overbill_exposure: '0',
    total_billing_exposure: '0',
    properties_with_underbill: 0,
    properties_with_overbill: 0,
    properties_with_billing_exposure: 0,
    has_billing_data: false,
    draft_recovery: '0',
    draft_property_count: 0,
  }

  guaranteeEligibility = {
    eligible: false,
    days_remaining: 0,
    first_invoice_amount: null,
    first_invoice_currency: 'usd',
  }

  freeAuditStatus = {
    has_subscription: false,
    free_audit_consumed: false,
    can_add_property: true,
    can_run_reconciliation: true,
    can_view_draft_report: true,
    can_download_reports: false,
    credit_balance: { total_purchased: 0, total_used: 0, total_remaining: 0 },
    has_ever_purchased: false,
  }

  leakageDetail = {
    leakage: 0,
    leakage_pct: 0,
    capveri_calculated: 0,
    actual_billed: 0,
    has_reconciliation_data: false,
    has_gl_data: false,
    has_billing_data: false,
  }

  taxProtestDeadlines = {
    items: [],
    year: new Date().getFullYear(),
  }

  exportHistory = {
    items: [],
    total: 0,
    page: 1,
    page_size: 10,
  }

  detailAdvisor = {
    total_line_items: 0,
    total_categories: 0,
    overall_severity: 'ok',
    summary: 'No advisory issues found.',
    grouping_suggestions: [],
    immaterial_items: [],
    suggested_total_lines: 0,
  }

  expensePools = {
    data: [],
    count: 0,
    has_more: false,
  }

  poolMappings = {
    data: [],
    count: 0,
    has_more: false,
  }

  latestGLAnalysis = null
  supabaseSubscriptions = []
}

resetAuxiliaryData()

export const auxiliaryHandlers = [
  http.get('*/api/v1/leakage/summary', () => {
    return HttpResponse.json(leakageSummary)
  }),

  http.get('*/api/v1/leakage/:propertyId', () => {
    return HttpResponse.json(leakageDetail)
  }),

  http.get('*/api/v1/tax-protest/deadlines', () => {
    return HttpResponse.json(taxProtestDeadlines)
  }),

  http.get('*/api/v1/billing/guarantee/eligibility', () => {
    return HttpResponse.json(guaranteeEligibility)
  }),

  http.get('*/api/v1/billing/free-audit-status', () => {
    return HttpResponse.json(freeAuditStatus)
  }),

  http.get('*/api/v1/export/history', () => {
    return HttpResponse.json(exportHistory)
  }),

  http.post('*/api/v1/export/detail-advisor', () => {
    return HttpResponse.json(detailAdvisor)
  }),

  http.get('*/api/v1/properties/:propertyId/expense-pools', () => {
    return HttpResponse.json(expensePools)
  }),

  http.get('*/api/v1/properties/:propertyId/pool-mappings', () => {
    return HttpResponse.json(poolMappings)
  }),

  http.get('*/api/v1/analysis/gl-narrative/:propertyId/:periodYear', () => {
    // Absence of a narrative is a normal state (none run yet), so the API
    // returns 200 with a null body rather than 404.
    if (!latestGLAnalysis) {
      return HttpResponse.json(null)
    }

    return HttpResponse.json(latestGLAnalysis)
  }),

  http.get('https://test.supabase.co/rest/v1/subscriptions', () => {
    return HttpResponse.json(supabaseSubscriptions)
  }),
]
