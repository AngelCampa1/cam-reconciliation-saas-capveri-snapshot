/**
 * Analytics utility for GTM data layer events + PostHog
 *
 * Provides type-safe conversion tracking without direct pixel dependencies.
 * Events are pushed to the GTM dataLayer for processing by configured tags,
 * and mirrored to PostHog for funnel analysis, journey context, and CRO.
 */
import posthog from 'posthog-js'

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[]
  }
}

type ConversionEvent =
  | 'sign_up'
  | 'signup_completed'
  | 'generate_lead'
  | 'purchase'
  | 'trial_started'
  | 'checkout_started'
  | 'checkout_completed'
  | 'subscription_started'
  | 'billing_portal_opened'
  | 'cancel_flow_opened'
  | 'cancel_reason_submitted'
  | 'save_offer_shown'
  | 'save_offer_accepted'
  | 'save_offer_declined'
  | 'subscription_cancel_scheduled'
  | 'guarantee_claimed'
  | 'tool_interaction'
  | 'tool_page_view'
  | 'tool_result_viewed'
  | 'tool_lead_gate_opened'
  | 'lead_form_view'
  | 'lead_form_submit'
  | 'exit_intent_sample_offered'
  | 'exit_intent_sample_clicked'
  | 'free_audit_completed'
  | 'upgrade_modal_shown'
  | 'upgrade_modal_cta_clicked'
  | 'dashboard_viewed'
  | 'app_route_viewed'
  | 'activation_completed'
  | 'export_generated'
  | 'reconciliation_page_viewed'
  | 'property_created'
  | 'lease_created'
  | 'lease_document_upload_started'
  | 'lease_document_upload_completed'
  | 'lease_document_upload_failed'
  | 'gl_upload_completed'
  | 'gl_import_started'
  | 'gl_import_source_detected'
  | 'gl_import_mapping_required'
  | 'gl_import_mapping_submitted'
  | 'gl_import_completed'
  | 'gl_import_failed'
  | 'gl_import_preview_failed'
  | 'gl_import_history_loaded'
  | 'gl_import_history_failed'
  | 'gl_import_retry_clicked'
  | 'actual_billed_uploaded'
  | 'reconciliation_calculation_started'
  | 'reconciliation_calculation_completed'
  | 'reconciliation_finalized'
  | 'calculation_trace_opened'
  | 'variance_report_opened'
  | 'demand_letter_panel_opened'
  | 'demand_letter_generated'
  | 'onboard_step_viewed'
  | 'onboard_step_completed'
  | 'onboard_step_transitioned'
  | 'onboard_sample_result_viewed'
  | 'onboard_sample_findings_revealed'
  | 'feedback_submitted'
  | 'feedback_screenshot_captured'
  | 'feedback_screenshot_failed'
  | 'account_deletion_requested'
  | 'account_deletion_blocked'
  | 'account_deletion_completed'
  | 'app_error_boundary_shown'
  | 'app_error_boundary_retry_clicked'
  | 'app_background_query_failed'
  | 'app_mutation_failed'
  | 'lease_extraction_process_started'
  | 'lease_extraction_process_completed'
  | 'lease_extraction_process_failed'
  | 'lease_extraction_review_opened'
  | 'lease_extraction_field_edited'
  | 'lease_extraction_field_confirmed'
  | 'lease_extraction_low_confidence_filter_used'
  | 'lease_extraction_source_highlight_clicked'
  | 'lease_extraction_draft_save_retried'
  | 'lease_extraction_approval_opened'
  | 'lease_extraction_approved'
  | 'lease_extraction_approval_failed'
  | 'lease_extraction_rejection_opened'
  | 'lease_extraction_rejected'
  | 'lease_extraction_rejection_failed'
  | 'tenant_dashboard_viewed'
  | 'tenant_disputes_viewed'
  | 'tenant_dispute_detail_viewed'
  | 'tenant_dispute_create_succeeded'
  | 'tenant_dispute_comment_submit_succeeded'
  | 'landlord_disputes_viewed'
  | 'landlord_dispute_detail_viewed'
  | 'landlord_dispute_status_update_succeeded'
  | 'landlord_dispute_comment_submit_succeeded'
  | 'properties_viewed'
  | 'property_search_used'
  | 'property_add_clicked'
  | 'property_add_blocked'
  | 'property_detail_opened'
  | 'property_create_succeeded'
  | 'property_update_succeeded'
  | 'property_rent_roll_import_succeeded'
  | 'property_detail_viewed'
  | 'property_detail_tab_changed'
  | 'property_delete_succeeded'
  | 'login_completed'
  | 'user_logout'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'profile_update_completed'
  | 'password_change_completed'
  | 'organization_update_completed'
  | 'team_invite_sent'
  | 'team_invite_revoked'
  | 'team_member_removed'
  | 'team_member_role_changed'

type DisputeStatusCounts = {
  total_count?: number
  total_count_bucket?: string
  needs_response_count?: number
  needs_response_count_bucket?: string
  open_count?: number
  under_review_count?: number
  resolved_count?: number
  rejected_count?: number
  closed_count?: number
}

type DisputeDetailAnalyticsParams = {
  dispute_id: string
  statement_id?: string
  category?: string
  status?: string
  comment_count?: number
  comment_count_bucket?: string
  attachment_count?: number
  attachment_count_bucket?: string
}

type TenantDisputeMutationAnalyticsParams = {
  dispute_id: string
  statement_id?: string
  category?: string
  status?: string
}

type OnboardStepTransitionedParams = {
  flow_id: 'plg_onboarding'
  flow_mode: 'plg' | 'sso'
  sample_preview: boolean
  step: number
  step_label: string
  total_steps: number
  previous_step: number | null
  previous_step_label: string | null
  direction: 'entered' | 'forward' | 'back'
  elapsed_ms: number
}

interface EventParams {
  sign_up: { method?: string }
  signup_completed: { method?: string }
  generate_lead: { lead_type?: string; source?: string }
  purchase: { value?: number; currency?: string; transaction_id?: string }
  trial_started: Record<string, unknown>
  checkout_started: Record<string, unknown>
  checkout_completed: Record<string, unknown>
  subscription_started: Record<string, unknown>
  billing_portal_opened: Record<string, unknown>
  cancel_flow_opened: Record<string, unknown>
  cancel_reason_submitted: Record<string, unknown>
  save_offer_shown: Record<string, unknown>
  save_offer_accepted: Record<string, unknown>
  save_offer_declined: Record<string, unknown>
  subscription_cancel_scheduled: Record<string, unknown>
  guarantee_claimed: Record<string, unknown>
  tool_interaction: { slug: string; result_summary?: string }
  tool_page_view: { slug: string; referrer?: string }
  tool_result_viewed: Record<string, unknown>
  tool_lead_gate_opened: Record<string, unknown>
  lead_form_view: { slug: string; source?: string }
  lead_form_submit: { slug: string; source?: string; email_domain?: string }
  exit_intent_sample_offered: { source: string }
  exit_intent_sample_clicked: { source: string }
  free_audit_completed: { recovery_amount: number; property_id: string }
  upgrade_modal_shown: { recovery_amount: number; surface?: string }
  upgrade_modal_cta_clicked: { recovery_amount: number; surface?: string }
  dashboard_viewed: Record<string, unknown>
  app_route_viewed: Record<string, unknown>
  activation_completed: Record<string, unknown>
  export_generated: { format: string; snapshot_id?: string }
  reconciliation_page_viewed: { property_id?: string }
  property_created: Record<string, unknown>
  lease_created: Record<string, unknown>
  lease_document_upload_started: Record<string, unknown>
  lease_document_upload_completed: Record<string, unknown>
  lease_document_upload_failed: Record<string, unknown>
  gl_upload_completed: Record<string, unknown>
  gl_import_started: Record<string, unknown>
  gl_import_source_detected: Record<string, unknown>
  gl_import_mapping_required: Record<string, unknown>
  gl_import_mapping_submitted: Record<string, unknown>
  gl_import_completed: Record<string, unknown>
  gl_import_failed: Record<string, unknown>
  gl_import_preview_failed: Record<string, unknown>
  gl_import_history_loaded: Record<string, unknown>
  gl_import_history_failed: Record<string, unknown>
  gl_import_retry_clicked: Record<string, unknown>
  actual_billed_uploaded: Record<string, unknown>
  reconciliation_calculation_started: Record<string, unknown>
  reconciliation_calculation_completed: Record<string, unknown>
  reconciliation_finalized: Record<string, unknown>
  calculation_trace_opened: Record<string, unknown>
  variance_report_opened: Record<string, unknown>
  demand_letter_panel_opened: Record<string, unknown>
  demand_letter_generated: Record<string, unknown>
  onboard_step_viewed: Record<string, unknown>
  onboard_step_completed: Record<string, unknown>
  onboard_step_transitioned: OnboardStepTransitionedParams
  onboard_sample_result_viewed: Record<string, unknown>
  onboard_sample_findings_revealed: Record<string, unknown>
  feedback_submitted: {
    feedback_type: string
    has_screenshot: boolean
    message_length_bucket: string
  }
  feedback_screenshot_captured: { feedback_type: string }
  feedback_screenshot_failed: { feedback_type: string }
  account_deletion_requested: Record<string, unknown>
  account_deletion_blocked: { block_reason: string }
  account_deletion_completed: Record<string, unknown>
  app_error_boundary_shown: {
    error_context?: string
    error_name: string
    error_category: string
    boundary_variant?: string
  }
  app_error_boundary_retry_clicked: {
    error_context?: string
    error_name?: string
    error_category?: string
    boundary_variant?: string
  }
  app_background_query_failed: {
    query_group: string
    error_name: string
    error_category: string
    has_cached_data: boolean
  }
  app_mutation_failed: {
    mutation_group: string
    error_name: string
    error_category: string
  }
  lease_extraction_process_started: Record<string, unknown>
  lease_extraction_process_completed: Record<string, unknown>
  lease_extraction_process_failed: Record<string, unknown>
  lease_extraction_review_opened: Record<string, unknown>
  lease_extraction_field_edited: Record<string, unknown>
  lease_extraction_field_confirmed: Record<string, unknown>
  lease_extraction_low_confidence_filter_used: Record<string, unknown>
  lease_extraction_source_highlight_clicked: Record<string, unknown>
  lease_extraction_draft_save_retried: Record<string, unknown>
  lease_extraction_approval_opened: Record<string, unknown>
  lease_extraction_approved: Record<string, unknown>
  lease_extraction_approval_failed: Record<string, unknown>
  lease_extraction_rejection_opened: Record<string, unknown>
  lease_extraction_rejected: Record<string, unknown>
  lease_extraction_rejection_failed: Record<string, unknown>
  tenant_dashboard_viewed: {
    lease_count?: number
    lease_count_bucket?: string
    statement_count?: number
    statement_count_bucket?: string
    unread_notification_count?: number
    unread_notification_count_bucket?: string
    pending_statement_count?: number
    paid_statement_count?: number
    disputed_statement_count?: number
    overdue_statement_count?: number
  }
  tenant_disputes_viewed: DisputeStatusCounts & {
    status_filter?: string
  }
  tenant_dispute_detail_viewed: DisputeDetailAnalyticsParams
  tenant_dispute_create_succeeded: TenantDisputeMutationAnalyticsParams
  tenant_dispute_comment_submit_succeeded: TenantDisputeMutationAnalyticsParams & {
    comment_count?: number
    comment_count_bucket?: string
  }
  landlord_disputes_viewed: DisputeStatusCounts & {
    status_filter?: string
    page_size?: number
    page_size_bucket?: string
  }
  landlord_dispute_detail_viewed: DisputeDetailAnalyticsParams
  landlord_dispute_status_update_succeeded: {
    dispute_id: string
    statement_id?: string
    category?: string
    previous_status?: string
    new_status: string
  }
  landlord_dispute_comment_submit_succeeded: TenantDisputeMutationAnalyticsParams & {
    is_internal: boolean
    comment_count?: number
    comment_count_bucket?: string
  }
  properties_viewed: {
    property_count?: number
    property_count_bucket?: string
    has_more?: boolean
  }
  property_search_used: {
    result_count: number
    result_count_bucket: string
    total_count?: number
    total_count_bucket?: string
    has_results: boolean
  }
  property_add_clicked: {
    can_add_property: boolean
    has_subscription?: boolean
    free_audit_consumed?: boolean
  }
  property_add_blocked: {
    block_reason: 'free_audit_limit'
    has_subscription?: boolean
    free_audit_consumed?: boolean
  }
  property_detail_opened: { property_id: string }
  property_create_succeeded: {
    property_id: string
    entry_method: 'manual'
    boma_standard_version?: string
    has_tax_protest_county: boolean
    has_tax_protest_deadline_override: boolean
  }
  property_update_succeeded: {
    property_id: string
    boma_standard_version?: string
    has_tax_protest_county: boolean
    has_tax_protest_deadline_override: boolean
  }
  property_rent_roll_import_succeeded: { property_id: string }
  property_detail_viewed: {
    property_id: string
    state?: string
    unit_count?: number
    unit_count_bucket?: string
    active_lease_count?: number
    active_lease_count_bucket?: string
    occupancy_bucket?: string
    initial_tab: string
    has_compliance_tab: boolean
  }
  property_detail_tab_changed: {
    property_id: string
    tab: string
    source: 'tab_click' | 'setup_next_action'
  }
  property_delete_succeeded: { property_id: string }
  login_completed: { method?: string }
  user_logout: Record<string, unknown>
  password_reset_requested: Record<string, unknown>
  password_reset_completed: Record<string, unknown>
  profile_update_completed: Record<string, unknown>
  password_change_completed: Record<string, unknown>
  organization_update_completed: Record<string, unknown>
  team_invite_sent: { role: string }
  team_invite_revoked: { role?: string }
  team_member_removed: { removed_role?: string }
  team_member_role_changed: { previous_role: string; new_role: string }
}

type AppSource = 'frontend' | 'marketing'

interface AnalyticsIdentity {
  userId: string
  email?: string | null
  organizationId?: string | null
  role?: string | null
  isPlatformAdmin?: boolean
  organizationProperties?: Record<string, unknown>
}

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  've_product',
  've_icp',
  've_campaign_id',
  've_variant',
  've_step',
  've_offer',
  've_instantly_campaign_id',
  've_lead_list_id',
  've_sender_pool',
  've_sequence_day',
  've_branding',
] as const

const FIRST_TOUCH_STORAGE_KEY = 'capveri_first_touch_attribution'
const ACTIVE_ORGANIZATION_STORAGE_KEY = 'capveri_active_organization_id'

type UtmKey = (typeof UTM_KEYS)[number]

type FirstTouchAttribution = {
  first_touch_landing_page: string
  first_touch_referrer_domain?: string
} & Partial<Record<`first_touch_${UtmKey}`, string>>

interface AppRouteTelemetry {
  app_surface: 'landlord_app' | 'tenant_portal' | 'public_app' | 'system'
  feature_area: string
  feature_name: string
  route_template: string
}

function getReferrerDomain(): string | undefined {
  if (!document.referrer) return undefined
  try {
    return new URL(document.referrer).hostname
  } catch {
    return undefined
  }
}

function getCurrentUtmParams(): Partial<Record<UtmKey, string>> {
  const searchParams = new URLSearchParams(window.location.search)
  return UTM_KEYS.reduce<Partial<Record<UtmKey, string>>>((acc, key) => {
    const value = searchParams.get(key)
    if (value) acc[key] = value
    return acc
  }, {})
}

function getFirstTouchAttribution(): FirstTouchAttribution {
  const referrerDomain = getReferrerDomain()
  const fallback: FirstTouchAttribution = {
    first_touch_landing_page: window.location.pathname,
    ...Object.fromEntries(
      Object.entries(getCurrentUtmParams()).map(([key, value]) => [
        `first_touch_${key}`,
        value,
      ])
    ),
    ...(referrerDomain ? { first_touch_referrer_domain: referrerDomain } : {}),
  }

  try {
    const stored = window.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY)
    if (stored) return JSON.parse(stored) as FirstTouchAttribution
    window.localStorage.setItem(
      FIRST_TOUCH_STORAGE_KEY,
      JSON.stringify(fallback)
    )
  } catch {
    return fallback
  }

  return fallback
}

function getActiveOrganizationId(): string | undefined {
  try {
    return (
      window.localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY) || undefined
    )
  } catch {
    return undefined
  }
}

export function getEmailDomain(email: string): string | undefined {
  const domain = email.trim().toLowerCase().split('@')[1]
  return domain || undefined
}

export function getAmountBucket(
  amount: number | string | null | undefined
):
  | 'unknown'
  | '0-10k'
  | '10k-50k'
  | '50k-100k'
  | '100k-500k'
  | '500k-1m'
  | '1m+' {
  const numericAmount =
    typeof amount === 'string' ? Number.parseFloat(amount) : amount
  if (typeof numericAmount !== 'number' || Number.isNaN(numericAmount)) {
    return 'unknown'
  }
  if (numericAmount < 10_000) return '0-10k'
  if (numericAmount < 50_000) return '10k-50k'
  if (numericAmount < 100_000) return '50k-100k'
  if (numericAmount < 500_000) return '100k-500k'
  if (numericAmount < 1_000_000) return '500k-1m'
  return '1m+'
}

export function getCountBucket(value: number | string | null | undefined) {
  const numericValue =
    typeof value === 'string' ? Number.parseInt(value, 10) : value
  if (
    typeof numericValue !== 'number' ||
    Number.isNaN(numericValue) ||
    numericValue < 0
  ) {
    return 'unknown'
  }
  if (numericValue === 0) return '0'
  if (numericValue <= 10) return '1-10'
  if (numericValue <= 100) return '11-100'
  if (numericValue <= 1_000) return '101-1k'
  if (numericValue <= 10_000) return '1k-10k'
  return '10k+'
}

export function getFileSizeBucket(sizeBytes: number | null | undefined) {
  if (
    typeof sizeBytes !== 'number' ||
    Number.isNaN(sizeBytes) ||
    sizeBytes < 0
  ) {
    return 'unknown'
  }
  const sizeMb = sizeBytes / (1024 * 1024)
  if (sizeMb < 1) return '<1mb'
  if (sizeMb < 5) return '1-5mb'
  if (sizeMb < 10) return '5-10mb'
  if (sizeMb < 25) return '10-25mb'
  if (sizeMb <= 50) return '25-50mb'
  return '50mb+'
}

export function getFileType(value: string | null | undefined) {
  const normalizedValue = value?.trim().toLowerCase() ?? ''
  if (normalizedValue.includes('pdf') || normalizedValue.endsWith('.pdf')) {
    return 'pdf'
  }
  if (normalizedValue.includes('csv') || normalizedValue.endsWith('.csv')) {
    return 'csv'
  }
  if (
    normalizedValue.includes('spreadsheetml') ||
    normalizedValue.endsWith('.xlsx')
  ) {
    return 'xlsx'
  }
  if (normalizedValue.includes('excel') || normalizedValue.endsWith('.xls')) {
    return 'xls'
  }
  return 'unknown'
}

export function getConfidenceBucket(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'unknown'
  if (value >= 0.9) return '90-100'
  if (value >= 0.75) return '75-89'
  if (value >= 0.5) return '50-74'
  if (value > 0) return '1-49'
  return '0'
}

export function getStatusBucket(status: number | null | undefined) {
  if (typeof status !== 'number' || Number.isNaN(status)) return 'unknown'
  if (status < 200) return 'informational'
  if (status < 300) return '2xx'
  if (status < 400) return '3xx'
  if (status === 401 || status === 403) return 'auth'
  if (status === 404) return 'not_found'
  if (status === 408) return 'timeout'
  if (status === 409) return 'duplicate'
  if (status === 413) return 'too_large'
  if (status === 422) return 'validation'
  if (status === 429) return 'rate_limit'
  if (status < 500) return '4xx'
  return '5xx'
}

/**
 * Compute the deterministic, cross-device lead distinct_id for an email.
 *
 * MUST stay byte-identical to the marketing site
 * (`marketing/src/lib/posthog.ts` getLeadDistinctId) and the backend
 * (`backend/app/api/v1/leads.py` _get_lead_distinct_id): salted SHA-256, first
 * 16 hex chars. This is the only thing that lets the same lead's PostHog person
 * span marketing -> tool -> app -> signup. Changing the algorithm here (only
 * here) is what previously split every lead into separate persons.
 */
async function getLeadDistinctId(email: string): Promise<string | undefined> {
  const normalizedEmail = email.trim().toLowerCase()
  const domain = getEmailDomain(normalizedEmail)
  if (!normalizedEmail || !domain) return undefined
  if (!globalThis.crypto?.subtle) return undefined

  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`capveri-lead:${normalizedEmail}`)
  )
  const digestHex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  return `lead:${domain}:${digestHex.slice(0, 16)}`
}

export function getPageTaxonomy(pathname = window.location.pathname) {
  const segments = pathname.split('/').filter(Boolean)
  const [first, second] = segments

  if (first === 'tools') {
    return {
      page_type: 'tool',
      tool_slug: second,
      content_cluster: 'free_tools',
      funnel_stage: 'activation',
    }
  }

  if (first === 'resources' || first === 'blog') {
    return {
      page_type: 'content',
      content_cluster: second ?? first,
      funnel_stage: 'education',
    }
  }

  if (first === 'pricing') {
    return { page_type: 'pricing', funnel_stage: 'decision' }
  }

  if (first === 'auth') {
    return { page_type: 'auth', funnel_stage: 'signup' }
  }

  if (first === 'onboard') {
    return { page_type: 'onboarding', funnel_stage: 'activation' }
  }

  if (
    first === 'dashboard' ||
    first === 'portfolio' ||
    first === 'properties' ||
    first === 'reconciliation' ||
    first === 'reconciliations' ||
    first === 'settings' ||
    first === 'ingestion' ||
    first === 'leases' ||
    first === 'extractions' ||
    first === 'verify' ||
    first === 'rent-roll' ||
    first === 'pools' ||
    first === 'analysis' ||
    first === 'compare' ||
    first === 'tax-protest' ||
    first === 'disputes' ||
    first === 'tenant' ||
    first === 'admin' ||
    first === 'help'
  ) {
    return { page_type: 'app', funnel_stage: 'retention' }
  }

  if (!first) {
    return { page_type: 'home', funnel_stage: 'awareness' }
  }

  return { page_type: first, funnel_stage: 'awareness' }
}

function hasSecondSegment(segments: string[]): boolean {
  return segments.length >= 2 && Boolean(segments[1])
}

export function getAppRouteTelemetry(pathname: string): AppRouteTelemetry {
  const segments = pathname.split('/').filter(Boolean)
  const [first, second, third, fourth] = segments

  if (!first) {
    return {
      app_surface: 'public_app',
      feature_area: 'home',
      feature_name: 'landing_home',
      route_template: '/',
    }
  }

  if (first === 'tenant') {
    if (!second) {
      return {
        app_surface: 'tenant_portal',
        feature_area: 'tenant',
        feature_name: 'tenant_index',
        route_template: '/tenant',
      }
    }

    if (second === 'disputes' && third === 'new') {
      return {
        app_surface: 'tenant_portal',
        feature_area: 'tenant_disputes',
        feature_name: 'tenant_dispute_create',
        route_template: '/tenant/disputes/new',
      }
    }

    if (second === 'disputes' && third) {
      return {
        app_surface: 'tenant_portal',
        feature_area: 'tenant_disputes',
        feature_name: 'tenant_dispute_detail',
        route_template: '/tenant/disputes/:disputeId',
      }
    }

    return {
      app_surface: 'tenant_portal',
      feature_area: `tenant_${second}`,
      feature_name: `tenant_${second}`,
      route_template: `/tenant/${second}`,
    }
  }

  if (first === 'properties') {
    if (!second) {
      return {
        app_surface: 'landlord_app',
        feature_area: 'properties',
        feature_name: 'property_list',
        route_template: '/properties',
      }
    }

    if (second === 'new') {
      return {
        app_surface: 'landlord_app',
        feature_area: 'properties',
        feature_name: 'property_create',
        route_template: '/properties/new',
      }
    }

    if (third === 'edit') {
      return {
        app_surface: 'landlord_app',
        feature_area: 'properties',
        feature_name: 'property_edit',
        route_template: '/properties/:propertyId/edit',
      }
    }

    if (third === 'leases' && fourth === 'new') {
      return {
        app_surface: 'landlord_app',
        feature_area: 'leases',
        feature_name: 'lease_create',
        route_template: '/properties/:propertyId/leases/new',
      }
    }

    if (third === 'leases' && fourth) {
      return {
        app_surface: 'landlord_app',
        feature_area: 'leases',
        feature_name: segments[4] === 'edit' ? 'lease_edit' : 'lease_detail',
        route_template:
          segments[4] === 'edit'
            ? '/properties/:propertyId/leases/:leaseId/edit'
            : '/properties/:propertyId/leases/:leaseId',
      }
    }

    if (third === 'reconciliations') {
      return {
        app_surface: 'landlord_app',
        feature_area: 'reconciliation',
        feature_name: 'property_reconciliation',
        route_template: '/properties/:propertyId/reconciliations',
      }
    }

    return {
      app_surface: 'landlord_app',
      feature_area: 'properties',
      feature_name: 'property_detail',
      route_template: '/properties/:propertyId',
    }
  }

  if (first === 'settings') {
    return {
      app_surface: 'landlord_app',
      feature_area: 'settings',
      feature_name: second ? `settings_${second}` : 'settings_index',
      route_template: second ? `/settings/${second}` : '/settings',
    }
  }

  if (first === 'admin') {
    return {
      app_surface: 'landlord_app',
      feature_area: 'admin',
      feature_name: second ? `admin_${second}` : 'admin_index',
      route_template: second ? `/admin/${second}` : '/admin',
    }
  }

  if (first === 'analysis') {
    return {
      app_surface: 'landlord_app',
      feature_area: 'analysis',
      feature_name: second ? `analysis_${second}` : 'analysis_index',
      route_template: second ? `/analysis/${second}` : '/analysis',
    }
  }

  if (first === 'portfolio') {
    return {
      app_surface: 'landlord_app',
      feature_area: 'portfolio',
      feature_name: second === 'pipeline' ? 'portfolio_pipeline' : 'portfolio',
      route_template:
        second === 'pipeline' ? '/portfolio/pipeline' : '/portfolio',
    }
  }

  if (first === 'disputes') {
    return {
      app_surface: 'landlord_app',
      feature_area: 'disputes',
      feature_name: hasSecondSegment(segments)
        ? 'dispute_detail'
        : 'dispute_list',
      route_template: hasSecondSegment(segments)
        ? '/disputes/:disputeId'
        : '/disputes',
    }
  }

  if (first === 'verify') {
    return {
      app_surface: 'landlord_app',
      feature_area: 'extractions',
      feature_name: 'lease_extraction_verification',
      route_template: '/verify/:documentId',
    }
  }

  const landlordFeatureAreas = new Set([
    'dashboard',
    'reconciliations',
    'pools',
    'compare',
    'extractions',
    'rent-roll',
    'ingestion',
    'leases',
    'tax-protest',
    'documents',
    'help',
  ])

  if (landlordFeatureAreas.has(first)) {
    return {
      app_surface: 'landlord_app',
      feature_area: first,
      feature_name: second ? `${first}_${second}` : first,
      route_template: second ? `/${first}/${second}` : `/${first}`,
    }
  }

  const publicFeatureAreas = new Set([
    'auth',
    'onboard',
    'pricing',
    'checkout',
    'contact',
    'about',
    'privacy',
    'terms',
    'cookies',
    'compliance',
    'sample-report',
    'resources',
    'tools',
    'vs',
    'team',
    'login',
    'register',
    'forgot-password',
  ])

  if (publicFeatureAreas.has(first)) {
    return {
      app_surface: 'public_app',
      feature_area: first,
      feature_name: second ? `${first}_${second}` : first,
      route_template: second ? `/${first}/${second}` : `/${first}`,
    }
  }

  return {
    app_surface: 'system',
    feature_area: 'unknown_route',
    feature_name: first,
    route_template: `/${first}`,
  }
}

export function getPostHogContext(
  sourceApp: AppSource,
  pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
): Record<string, unknown> {
  if (typeof window === 'undefined') return { source_app: sourceApp }

  const latestUtmParams = getCurrentUtmParams()
  const latestTouchParams = Object.fromEntries(
    Object.entries(latestUtmParams).map(([key, value]) => [
      `latest_${key}`,
      value,
    ])
  )
  const organizationId = getActiveOrganizationId()

  return sanitizeEventParams({
    source_app: sourceApp,
    page_path: pathname,
    ...getPageTaxonomy(pathname),
    ...latestUtmParams,
    ...latestTouchParams,
    ...getFirstTouchAttribution(),
    ...(organizationId ? { organization_id: organizationId } : {}),
  })
}

const SENSITIVE_EVENT_PROPERTY_KEY =
  /(^|_)(email|customer_email|billing_email|receipt_email|phone|password|token|secret|file_name|filename|fileName|tenant_name|tenantName|property_name|propertyName|address|document_url|documentUrl|storage_key|storageKey|storage_bucket|storageBucket|source_text|sourceText|text|notes|note|old_value|oldValue|new_value|newValue|edit_history|editHistory)($|_)/i
const EMAIL_VALUE_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FILE_OR_URL_VALUE_PATTERN =
  /(\.pdf(\?|$)|\.csv(\?|$)|\.xlsx?(\?|$)|https?:\/\/|s3:\/\/|blob:)/i

function sanitizeEventValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const sanitized = value
      .map((item) => sanitizeEventValue(item))
      .filter((item) => item !== undefined)
    return sanitized.length > 0 ? sanitized : undefined
  }

  if (value && typeof value === 'object') {
    return sanitizeEventParams(value as Record<string, unknown>)
  }

  if (typeof value === 'string' && EMAIL_VALUE_PATTERN.test(value.trim())) {
    return undefined
  }

  if (
    typeof value === 'string' &&
    FILE_OR_URL_VALUE_PATTERN.test(value.trim())
  ) {
    return undefined
  }

  return value
}

function sanitizeEventParams(
  params?: Record<string, unknown>
): Record<string, unknown> {
  if (!params) return {}

  const safeParams: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    if (SENSITIVE_EVENT_PROPERTY_KEY.test(key)) continue
    const sanitizedValue = sanitizeEventValue(value)
    if (sanitizedValue !== undefined) safeParams[key] = sanitizedValue
  }

  return safeParams
}

export function getSafePageSearch(search: string): string {
  if (!search) return ''

  const safeSearchParams = new URLSearchParams()
  const sourceSearchParams = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search
  )

  for (const [key, value] of sourceSearchParams.entries()) {
    const sanitized = sanitizeEventParams({ [key]: value })
    if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
      safeSearchParams.append(key, String(sanitized[key]))
    }
  }

  const safeSearch = safeSearchParams.toString()
  return safeSearch ? `?${safeSearch}` : ''
}

export function getAnalyticsErrorName(error: unknown): string {
  if (error instanceof Error && error.name.trim()) return error.name
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    typeof error.name === 'string' &&
    error.name.trim()
  ) {
    return error.name
  }
  return 'UnknownError'
}

export function getAnalyticsErrorCategory(error: unknown): string {
  const statusCode =
    error && typeof error === 'object' && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : undefined

  if (typeof statusCode === 'number' && !Number.isNaN(statusCode)) {
    if (statusCode === 401 || statusCode === 403) return 'auth'
    if (statusCode === 404) return 'not_found'
    if (statusCode === 408) return 'timeout'
    if (statusCode === 422) return 'validation'
    if (statusCode === 429) return 'rate_limit'
    if (statusCode >= 500) return 'server'
    return 'http'
  }

  const errorName = getAnalyticsErrorName(error).toLowerCase()
  if (errorName.includes('timeout') || errorName.includes('abort')) {
    return 'timeout'
  }
  if (errorName.includes('network') || errorName.includes('fetch')) {
    return 'network'
  }

  return 'unknown'
}

export function getAnalyticsKeyGroup(key: unknown): string {
  const firstKey = Array.isArray(key) ? key[0] : key
  if (typeof firstKey === 'string' && firstKey.trim()) return firstKey
  if (typeof firstKey === 'number') return 'numeric_key'
  if (typeof firstKey === 'boolean') return 'boolean_key'
  if (firstKey === undefined || firstKey === null) return 'unknown'
  return 'object_key'
}

/**
 * Track a conversion event by pushing to the GTM dataLayer.
 *
 * @param event - The event name to track
 * @param params - Optional parameters for the event
 *
 * @example
 * // Track a signup
 * trackEvent('sign_up', { method: 'email' })
 *
 * @example
 * // Track a lead generation
 * trackEvent('generate_lead', { lead_type: 'demo', source: 'landing' })
 *
 * @example
 * // Track a purchase
 * trackEvent('purchase', { transaction_id: 'cs_123' })
 */
export function trackEvent<T extends ConversionEvent>(
  event: T,
  params?: EventParams[T]
): void {
  if (typeof window === 'undefined') return

  const safeParams = sanitizeEventParams(params as Record<string, unknown>)

  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({
    event,
    ...safeParams,
  })

  if (posthog.__loaded) {
    posthog.capture(event, {
      ...safeParams,
      ...getPostHogContext('frontend'),
    })
  }
}

export function groupOrganizationForAnalytics(
  organizationId: string,
  properties?: Record<string, unknown>
): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, organizationId)
  } catch {
    // Ignore storage failures; PostHog grouping below still carries the org.
  }

  if (posthog.__loaded) {
    posthog.group('organization', organizationId, {
      organization_id: organizationId,
      ...getFirstTouchAttribution(),
      ...properties,
    })
  }
}

export async function identifyLeadForAnalytics(
  email: string,
  properties?: Record<string, unknown>
): Promise<void> {
  if (typeof window === 'undefined') return
  if (!posthog.__loaded) return

  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return
  const leadEmailDomain = getEmailDomain(normalizedEmail)
  const leadDistinctId = await getLeadDistinctId(normalizedEmail)
  if (!leadDistinctId) return

  posthog.identify(leadDistinctId, {
    ...(leadEmailDomain ? { lead_email_domain: leadEmailDomain } : {}),
    ...getPostHogContext('frontend'),
    ...properties,
  })
}

// Guards against re-aliasing on every onAuthStateChange / token refresh.
const aliasedLeadLinks = new Set<string>()

/**
 * Merge the deterministic pre-signup lead person (`lead:{domain}:{hash}`, set on
 * the marketing site and in-app lead forms) into the signed-in `user:{id}` person.
 *
 * PostHog `identify` refuses to merge two already-identified persons, so this is
 * the only thing that connects a marketing-sourced lead to the customer they
 * become. `alias(newId, originalId)` keeps the first arg (`user:{id}`) as the
 * canonical person and folds the lead's history into it.
 */
async function linkLeadToUser(userId: string, email: string): Promise<void> {
  if (!posthog.__loaded) return
  const leadDistinctId = await getLeadDistinctId(email)
  if (!leadDistinctId) return
  const linkKey = `user:${userId}|${leadDistinctId}`
  if (aliasedLeadLinks.has(linkKey)) return
  aliasedLeadLinks.add(linkKey)
  posthog.alias(`user:${userId}`, leadDistinctId)
}

/**
 * Set user properties in the GTM dataLayer.
 *
 * Call this when user logs in or when user context changes.
 * Pass undefined/null to clear properties on logout.
 *
 * @param userId - The authenticated user's ID (or null/undefined to clear)
 * @param orgId - The user's organization ID (or null/undefined to clear)
 *
 * @example
 * // On login
 * setUserProperties(user.id, user.org_id)
 *
 * @example
 * // On logout
 * setUserProperties(null, null)
 */
export function setUserProperties(
  userId?: string | null,
  orgId?: string | null
): void {
  if (typeof window === 'undefined') return

  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({
    event: 'user_properties_set',
    user_id: userId ?? null,
    org_id: orgId ?? null,
  })
}

export function identifyUserForAnalytics(identity: AnalyticsIdentity): void {
  if (typeof window === 'undefined') return
  if (!posthog.__loaded) return

  posthog.identify(`user:${identity.userId}`, {
    user_id: identity.userId,
    ...(identity.email?.trim()
      ? { email_domain: getEmailDomain(identity.email) }
      : {}),
    ...(identity.organizationId
      ? { organization_id: identity.organizationId }
      : {}),
    ...(identity.role ? { role: identity.role } : {}),
    is_platform_admin: identity.isPlatformAdmin ?? false,
  })

  if (identity.email?.trim()) {
    void linkLeadToUser(identity.userId, identity.email)
  }

  if (identity.organizationId) {
    groupOrganizationForAnalytics(
      identity.organizationId,
      identity.organizationProperties
    )
  }
}

export function resetAnalyticsIdentity(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(ACTIVE_ORGANIZATION_STORAGE_KEY)
  } catch {
    // Ignore storage failures; identity reset below is still useful.
  }
  if (posthog.__loaded) posthog.reset()
}
