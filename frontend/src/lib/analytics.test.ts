/**
 * Tests for Analytics Utility
 *
 * These tests verify the GTM data layer event tracking functionality
 * and the PostHog capture dual-write behaviour.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// vi.hoisted ensures mockCapture is available when vi.mock is hoisted above imports
const { mockCapture, mockIdentify, mockGroup, mockReset, mockAlias } =
  vi.hoisted(() => ({
    mockCapture: vi.fn(),
    mockIdentify: vi.fn(),
    mockGroup: vi.fn(),
    mockReset: vi.fn(),
    mockAlias: vi.fn(),
  }))

// Mock posthog-js so we can control __loaded and assert capture calls
vi.mock('posthog-js', () => ({
  default: {
    __loaded: false,
    capture: mockCapture,
    identify: mockIdentify,
    group: mockGroup,
    reset: mockReset,
    alias: mockAlias,
  },
}))

// Import the mocked posthog to manipulate __loaded per test
import posthog from 'posthog-js'
import {
  getAnalyticsErrorCategory,
  getAnalyticsErrorName,
  getAnalyticsKeyGroup,
  getAppRouteTelemetry,
  getConfidenceBucket,
  getCountBucket,
  getFileSizeBucket,
  getFileType,
  getPageTaxonomy,
  getStatusBucket,
  identifyUserForAnalytics,
  groupOrganizationForAnalytics,
  identifyLeadForAnalytics,
  resetAnalyticsIdentity,
  getSafePageSearch,
  setUserProperties,
  trackEvent,
} from './analytics'

describe('analytics', () => {
  beforeEach(() => {
    window.dataLayer = []
    mockCapture.mockClear()
    mockIdentify.mockClear()
    mockGroup.mockClear()
    mockReset.mockClear()
    mockAlias.mockClear()
    window.localStorage.clear()
    // Default: PostHog not loaded
    ;(posthog as unknown as { __loaded: boolean }).__loaded = false
    window.history.replaceState(
      {},
      '',
      '/dashboard?utm_source=linkedin&utm_campaign=q2&ve_product=capveri&ve_icp=cv_property_controllers&ve_campaign_id=capveri-controller-presend-qa-2026_06-01&ve_variant=plain_founder&ve_step=7&ve_branding=plain'
    )
  })

  describe('trackEvent', () => {
    it('pushes sign_up event to dataLayer', () => {
      trackEvent('sign_up', { method: 'email' })

      expect(window.dataLayer).toHaveLength(1)
      expect(window.dataLayer[0]).toEqual({
        event: 'sign_up',
        method: 'email',
      })
    })

    it('pushes standardized founder revenue events to dataLayer', () => {
      trackEvent('signup_completed', { method: 'email' })
      trackEvent('generate_lead', { lead_type: 'demo', source: 'landing' })
      trackEvent('trial_started', { plan: 'control' })
      trackEvent('checkout_started', { plan: 'control' })
      trackEvent('free_audit_completed', {
        recovery_amount: 1000,
        property_id: 'prop-1',
      })

      expect(window.dataLayer.map((entry) => entry.event)).toEqual([
        'signup_completed',
        'generate_lead',
        'trial_started',
        'checkout_started',
        'free_audit_completed',
      ])
    })

    it('pushes generate_lead event to dataLayer', () => {
      trackEvent('generate_lead', { lead_type: 'demo', source: 'landing' })

      expect(window.dataLayer).toHaveLength(1)
      expect(window.dataLayer[0]).toEqual({
        event: 'generate_lead',
        lead_type: 'demo',
        source: 'landing',
      })
    })

    it('pushes purchase event to dataLayer', () => {
      trackEvent('purchase', { transaction_id: 'cs_123' })

      expect(window.dataLayer).toHaveLength(1)
      expect(window.dataLayer[0]).toEqual({
        event: 'purchase',
        transaction_id: 'cs_123',
      })
    })

    it('initializes dataLayer if undefined', () => {
      delete (window as unknown as { dataLayer?: unknown[] }).dataLayer

      trackEvent('sign_up')

      expect(window.dataLayer).toBeDefined()
      expect(window.dataLayer).toHaveLength(1)
    })

    it('handles event without params', () => {
      trackEvent('sign_up')

      expect(window.dataLayer[0]).toEqual({ event: 'sign_up' })
    })

    it('appends to existing dataLayer entries', () => {
      window.dataLayer.push({ existing: 'entry' })

      trackEvent('sign_up', { method: 'google' })

      expect(window.dataLayer).toHaveLength(2)
      expect(window.dataLayer[1]).toEqual({
        event: 'sign_up',
        method: 'google',
      })
    })

    it('calls posthog.capture when posthog is loaded', () => {
      ;(posthog as unknown as { __loaded: boolean }).__loaded = true

      trackEvent('sign_up', { method: 'email' })

      expect(mockCapture).toHaveBeenCalledOnce()
      expect(mockCapture).toHaveBeenCalledWith(
        'sign_up',
        expect.objectContaining({
          method: 'email',
          source_app: 'frontend',
          page_path: '/dashboard',
          utm_source: 'linkedin',
          utm_campaign: 'q2',
          ve_product: 'capveri',
          ve_icp: 'cv_property_controllers',
          ve_campaign_id: 'capveri-controller-presend-qa-2026_06-01',
          ve_variant: 'plain_founder',
          ve_step: '7',
          ve_branding: 'plain',
        })
      )
    })

    it('does not call posthog.capture when posthog is not loaded', () => {
      ;(posthog as unknown as { __loaded: boolean }).__loaded = false

      trackEvent('sign_up', { method: 'email' })

      expect(mockCapture).not.toHaveBeenCalled()
    })

    it('still pushes to dataLayer even when posthog is loaded', () => {
      ;(posthog as unknown as { __loaded: boolean }).__loaded = true

      trackEvent('purchase', { transaction_id: 'cs_123' })

      expect(window.dataLayer).toHaveLength(1)
      expect(window.dataLayer[0]).toEqual({
        event: 'purchase',
        transaction_id: 'cs_123',
      })
      expect(mockCapture).toHaveBeenCalledWith(
        'purchase',
        expect.objectContaining({
          transaction_id: 'cs_123',
          source_app: 'frontend',
          page_path: '/dashboard',
          page_type: 'app',
          funnel_stage: 'retention',
          utm_source: 'linkedin',
          latest_utm_source: 'linkedin',
          first_touch_utm_source: 'linkedin',
          utm_campaign: 'q2',
          ve_product: 'capveri',
          latest_ve_campaign_id: 'capveri-controller-presend-qa-2026_06-01',
          first_touch_ve_campaign_id:
            'capveri-controller-presend-qa-2026_06-01',
        })
      )
    })

    it('removes raw contact details from event properties', () => {
      ;(posthog as unknown as { __loaded: boolean }).__loaded = true

      trackEvent('generate_lead', {
        lead_type: 'demo',
        email: 'owner@example.com',
        nested: {
          customer_email: 'buyer@example.com',
          plan: 'control',
        },
      } as never)

      expect(window.dataLayer[0]).toEqual({
        event: 'generate_lead',
        lead_type: 'demo',
        nested: { plan: 'control' },
      })
      expect(mockCapture).toHaveBeenCalledWith(
        'generate_lead',
        expect.objectContaining({
          lead_type: 'demo',
          nested: { plan: 'control' },
          source_app: 'frontend',
        })
      )
      expect(mockCapture.mock.calls[0][1]).not.toHaveProperty('email')
    })

    it('removes lease extraction document and text details from event properties', () => {
      ;(posthog as unknown as { __loaded: boolean }).__loaded = true

      trackEvent('lease_extraction_field_edited', {
        document_id: 'doc-123',
        filename: 'Acme lease.pdf',
        document_url: 'https://storage.example.com/Acme%20lease.pdf',
        storage_key: 'org-1/Acme lease.pdf',
        tenant_name: 'Acme Corp',
        property_name: 'Downtown Tower',
        address_line1: '100 Main Street',
        old_value: '12.5%',
        new_value: '13.5%',
        notes: 'Tenant-specific rejection note',
        source_text: 'The tenant shall pay operating expenses',
        documentUrl: 'https://storage.example.com/camel.pdf',
        storageKey: 'org-1/camel-key',
        tenantName: 'Camel Tenant',
        propertyName: 'Camel Property',
        sourceText: 'Camel source text',
        oldValue: 'old camel value',
        newValue: 'new camel value',
        editHistory: [{ field: 'base_year', oldValue: '2023' }],
        nested: {
          file_name: 'nested.pdf',
          sourceText: 'Nested source text',
          confidence_bucket: '90-100',
        },
      } as never)

      const capturedProperties = mockCapture.mock.calls[0][1] as Record<
        string,
        unknown
      >
      expect(capturedProperties).toEqual(
        expect.objectContaining({
          document_id: 'doc-123',
          nested: { confidence_bucket: '90-100' },
        })
      )
      expect(capturedProperties).not.toHaveProperty('filename')
      expect(capturedProperties).not.toHaveProperty('document_url')
      expect(capturedProperties).not.toHaveProperty('storage_key')
      expect(capturedProperties).not.toHaveProperty('tenant_name')
      expect(capturedProperties).not.toHaveProperty('property_name')
      expect(capturedProperties).not.toHaveProperty('address_line1')
      expect(capturedProperties).not.toHaveProperty('old_value')
      expect(capturedProperties).not.toHaveProperty('new_value')
      expect(capturedProperties).not.toHaveProperty('notes')
      expect(capturedProperties).not.toHaveProperty('source_text')
      expect(capturedProperties).not.toHaveProperty('documentUrl')
      expect(capturedProperties).not.toHaveProperty('storageKey')
      expect(capturedProperties).not.toHaveProperty('tenantName')
      expect(capturedProperties).not.toHaveProperty('propertyName')
      expect(capturedProperties).not.toHaveProperty('sourceText')
      expect(capturedProperties).not.toHaveProperty('oldValue')
      expect(capturedProperties).not.toHaveProperty('newValue')
      expect(capturedProperties).not.toHaveProperty('editHistory')
    })
  })

  describe('identifyUserForAnalytics', () => {
    it('identifies the user and groups them by organization when posthog is loaded', async () => {
      ;(posthog as unknown as { __loaded: boolean }).__loaded = true

      identifyUserForAnalytics({
        userId: 'user-123',
        email: 'controller@example.com',
        organizationId: 'org-456',
        role: 'owner',
        isPlatformAdmin: true,
      })

      expect(mockIdentify).toHaveBeenCalledWith('user:user-123', {
        user_id: 'user-123',
        email_domain: 'example.com',
        organization_id: 'org-456',
        role: 'owner',
        is_platform_admin: true,
      })
      expect(mockGroup).toHaveBeenCalledWith(
        'organization',
        'org-456',
        expect.objectContaining({
          organization_id: 'org-456',
          first_touch_landing_page: '/dashboard',
        })
      )
      // Settle the fire-and-forget lead->user alias so it can't leak into a
      // later test's mockAlias assertions.
      await vi.waitFor(() => expect(mockAlias).toHaveBeenCalled())
    })

    it('does not leak blank email values into PostHog person properties', () => {
      ;(posthog as unknown as { __loaded: boolean }).__loaded = true

      identifyUserForAnalytics({
        userId: 'user-123',
        email: '',
        organizationId: null,
        role: null,
        isPlatformAdmin: false,
      })

      expect(mockIdentify).toHaveBeenCalledWith('user:user-123', {
        user_id: 'user-123',
        is_platform_admin: false,
      })
      expect(mockGroup).not.toHaveBeenCalled()
    })

    it('is a no-op when posthog is not loaded', () => {
      identifyUserForAnalytics({
        userId: 'user-123',
        email: 'controller@example.com',
        organizationId: 'org-456',
        role: 'owner',
        isPlatformAdmin: false,
      })

      expect(mockIdentify).not.toHaveBeenCalled()
      expect(mockGroup).not.toHaveBeenCalled()
    })

    // The lead -> user merge is the only thing that connects a marketing-sourced
    // lead to the customer they become. alias(newId, originalId) keeps user:{id}
    // canonical and folds the deterministic lead person's history into it.
    it('aliases the deterministic lead person into the signed-in user', async () => {
      ;(posthog as unknown as { __loaded: boolean }).__loaded = true

      identifyUserForAnalytics({
        userId: 'user-alias-1',
        email: 'owner@acme.io',
        organizationId: null,
        role: 'owner',
        isPlatformAdmin: false,
      })

      // linkLeadToUser is fire-and-forget; flush the SHA-256 microtask queue.
      await vi.waitFor(() => expect(mockAlias).toHaveBeenCalledTimes(1))
      expect(mockAlias).toHaveBeenCalledWith(
        'user:user-alias-1',
        'lead:acme.io:c0447413786067df'
      )
    })

    it('does not alias when no email is available (anonymous PLG user)', async () => {
      ;(posthog as unknown as { __loaded: boolean }).__loaded = true

      identifyUserForAnalytics({
        userId: 'anon-user-1',
        organizationId: null,
        role: 'owner',
        isPlatformAdmin: false,
      })

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(mockAlias).not.toHaveBeenCalled()
    })
  })

  describe('resetAnalyticsIdentity', () => {
    it('resets PostHog identity when loaded', () => {
      ;(posthog as unknown as { __loaded: boolean }).__loaded = true
      window.localStorage.setItem('capveri_active_organization_id', 'org-456')

      resetAnalyticsIdentity()

      expect(mockReset).toHaveBeenCalledOnce()
      expect(
        window.localStorage.getItem('capveri_active_organization_id')
      ).toBeNull()
    })
  })

  describe('getSafePageSearch', () => {
    it('drops sensitive query values before pageview capture', () => {
      expect(
        getSafePageSearch(
          '?tab=details&utm_source=owner@example.com&utm_medium=cpc&file_name=lease.pdf'
        )
      ).toBe('?tab=details&utm_medium=cpc')
    })
  })

  describe('getPageTaxonomy', () => {
    it('classifies authenticated app route families as retention pages', () => {
      expect(getPageTaxonomy('/portfolio/pipeline')).toEqual({
        page_type: 'app',
        funnel_stage: 'retention',
      })
      expect(getPageTaxonomy('/tenant/dashboard')).toEqual({
        page_type: 'app',
        funnel_stage: 'retention',
      })
      expect(getPageTaxonomy('/analysis/year-over-year')).toEqual({
        page_type: 'app',
        funnel_stage: 'retention',
      })
      expect(getPageTaxonomy('/disputes/dispute-123')).toEqual({
        page_type: 'app',
        funnel_stage: 'retention',
      })
    })
  })

  describe('getAppRouteTelemetry', () => {
    it('classifies landlord app feature routes with stable templates', () => {
      expect(
        getAppRouteTelemetry('/properties/prop-123/leases/lease-456/edit')
      ).toEqual({
        app_surface: 'landlord_app',
        feature_area: 'leases',
        feature_name: 'lease_edit',
        route_template: '/properties/:propertyId/leases/:leaseId/edit',
      })

      expect(getAppRouteTelemetry('/verify/doc-123')).toEqual({
        app_surface: 'landlord_app',
        feature_area: 'extractions',
        feature_name: 'lease_extraction_verification',
        route_template: '/verify/:documentId',
      })
    })

    it('classifies tenant and public app routes separately', () => {
      expect(getAppRouteTelemetry('/tenant/disputes/dispute-123')).toEqual({
        app_surface: 'tenant_portal',
        feature_area: 'tenant_disputes',
        feature_name: 'tenant_dispute_detail',
        route_template: '/tenant/disputes/:disputeId',
      })

      expect(getAppRouteTelemetry('/resources/cam-presend-checklist')).toEqual({
        app_surface: 'public_app',
        feature_area: 'resources',
        feature_name: 'resources_cam-presend-checklist',
        route_template: '/resources/cam-presend-checklist',
      })
    })
  })

  describe('groupOrganizationForAnalytics', () => {
    it('stores and groups the active organization', () => {
      ;(posthog as unknown as { __loaded: boolean }).__loaded = true

      groupOrganizationForAnalytics('org-789', {
        signup_flow: 'plg_onboarding',
      })

      expect(
        window.localStorage.getItem('capveri_active_organization_id')
      ).toBe('org-789')
      expect(mockGroup).toHaveBeenCalledWith(
        'organization',
        'org-789',
        expect.objectContaining({
          organization_id: 'org-789',
          signup_flow: 'plg_onboarding',
        })
      )

      trackEvent('dashboard_viewed')
      expect(mockCapture).toHaveBeenCalledWith(
        'dashboard_viewed',
        expect.objectContaining({
          organization_id: 'org-789',
        })
      )
    })
  })

  describe('identifyLeadForAnalytics', () => {
    it('identifies leads with email domain and attribution context', async () => {
      ;(posthog as unknown as { __loaded: boolean }).__loaded = true

      await identifyLeadForAnalytics('Controller@Example.com', {
        lead_type: 'content_download',
      })

      expect(mockIdentify).toHaveBeenCalledWith(
        expect.stringMatching(/^lead:example\.com:/),
        expect.objectContaining({
          lead_email_domain: 'example.com',
          lead_type: 'content_download',
          source_app: 'frontend',
          first_touch_landing_page: '/dashboard',
        })
      )
      expect(mockIdentify.mock.calls[0]?.[1]).not.toHaveProperty('email')
    })

    // Locks the deterministic, cross-surface lead distinct_id. This exact value
    // MUST equal marketing/src/lib/posthog.ts and backend
    // _get_lead_distinct_id for the same email, or marketing leads will never
    // merge with their product user. Do not change without changing all three.
    it('produces the canonical SHA-256 lead distinct_id shared with marketing + backend', async () => {
      ;(posthog as unknown as { __loaded: boolean }).__loaded = true

      await identifyLeadForAnalytics('controller@example.com')

      expect(mockIdentify).toHaveBeenCalledWith(
        'lead:example.com:25f36baf342ae85c',
        expect.any(Object)
      )
    })
  })

  describe('new funnel events', () => {
    it('pushes free_audit_completed event to dataLayer', () => {
      trackEvent('free_audit_completed', {
        recovery_amount: 12500,
        property_id: 'prop-abc',
      })

      expect(window.dataLayer).toHaveLength(1)
      expect(window.dataLayer[0]).toEqual({
        event: 'free_audit_completed',
        recovery_amount: 12500,
        property_id: 'prop-abc',
      })
    })

    it('pushes upgrade_modal_shown event to dataLayer', () => {
      trackEvent('upgrade_modal_shown', { recovery_amount: 8750 })

      expect(window.dataLayer).toHaveLength(1)
      expect(window.dataLayer[0]).toEqual({
        event: 'upgrade_modal_shown',
        recovery_amount: 8750,
      })
    })

    it('pushes upgrade_modal_cta_clicked event to dataLayer', () => {
      trackEvent('upgrade_modal_cta_clicked', { recovery_amount: 8750 })

      expect(window.dataLayer).toHaveLength(1)
      expect(window.dataLayer[0]).toEqual({
        event: 'upgrade_modal_cta_clicked',
        recovery_amount: 8750,
      })
    })
  })

  describe('setUserProperties', () => {
    it('pushes user_properties_set event with user and org ids', () => {
      setUserProperties('user-123', 'org-456')

      expect(window.dataLayer).toHaveLength(1)
      expect(window.dataLayer[0]).toEqual({
        event: 'user_properties_set',
        user_id: 'user-123',
        org_id: 'org-456',
      })
    })

    it('handles null values for logout', () => {
      setUserProperties(null, null)

      expect(window.dataLayer).toHaveLength(1)
      expect(window.dataLayer[0]).toEqual({
        event: 'user_properties_set',
        user_id: null,
        org_id: null,
      })
    })

    it('handles undefined values', () => {
      setUserProperties(undefined, undefined)

      expect(window.dataLayer).toHaveLength(1)
      expect(window.dataLayer[0]).toEqual({
        event: 'user_properties_set',
        user_id: null,
        org_id: null,
      })
    })

    it('initializes dataLayer if undefined', () => {
      delete (window as unknown as { dataLayer?: unknown[] }).dataLayer

      setUserProperties('user-123', 'org-456')

      expect(window.dataLayer).toBeDefined()
      expect(window.dataLayer).toHaveLength(1)
    })
  })

  describe('safe error analytics helpers', () => {
    it('classifies HTTP-style errors without using raw messages', () => {
      expect(getAnalyticsErrorName(new TypeError('Failed to fetch'))).toBe(
        'TypeError'
      )
      expect(getAnalyticsErrorCategory({ statusCode: 401 })).toBe('auth')
      expect(getAnalyticsErrorCategory({ statusCode: 408 })).toBe('timeout')
      expect(getAnalyticsErrorCategory({ statusCode: 422 })).toBe('validation')
      expect(getAnalyticsErrorCategory({ statusCode: 429 })).toBe('rate_limit')
      expect(getAnalyticsErrorCategory({ statusCode: 503 })).toBe('server')
    })

    it('derives stable query and mutation groups from keys', () => {
      expect(getAnalyticsKeyGroup(['properties', 'prop-123'])).toBe(
        'properties'
      )
      expect(getAnalyticsKeyGroup(undefined)).toBe('unknown')
      expect(getAnalyticsKeyGroup([{ route: '/settings' }])).toBe('object_key')
    })
  })

  describe('safe import analytics helpers', () => {
    it('builds stable buckets for GL import tracking', () => {
      expect(getFileType('ledger.csv')).toBe('csv')
      expect(getFileType('application/vnd.ms-excel')).toBe('xls')
      expect(
        getFileType(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
      ).toBe('xlsx')
      expect(getFileType('application/pdf')).toBe('pdf')
      expect(getFileSizeBucket(500_000)).toBe('<1mb')
      expect(getFileSizeBucket(60 * 1024 * 1024)).toBe('50mb+')
      expect(getCountBucket(0)).toBe('0')
      expect(getCountBucket(150)).toBe('101-1k')
      expect(getConfidenceBucket(0.95)).toBe('90-100')
      expect(getStatusBucket(409)).toBe('duplicate')
      expect(getStatusBucket(413)).toBe('too_large')
      expect(getStatusBucket(503)).toBe('5xx')
    })
  })
})
