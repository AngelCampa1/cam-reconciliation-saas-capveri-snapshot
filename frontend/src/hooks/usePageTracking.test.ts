/**
 * usePageTracking Hook Tests
 *
 * Tests the page view tracking functionality for SPA route changes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePageTracking } from './usePageTracking'

const { mockCapture } = vi.hoisted(() => ({ mockCapture: vi.fn() }))
vi.mock('posthog-js', () => ({
  default: {
    __loaded: false,
    capture: mockCapture,
  },
}))

import posthog from 'posthog-js'

// Mock react-router-dom
const mockLocation = { pathname: '/dashboard', search: '' }
vi.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
}))

describe('usePageTracking', () => {
  beforeEach(() => {
    window.dataLayer = []
    mockCapture.mockClear()
    ;(posthog as unknown as { __loaded: boolean }).__loaded = false
    // Reset mock location
    mockLocation.pathname = '/dashboard'
    mockLocation.search = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pushes page_view event on mount', () => {
    renderHook(() => usePageTracking())

    expect(window.dataLayer).toHaveLength(1)
    expect(window.dataLayer[0]).toMatchObject({
      event: 'page_view',
      page_path: '/dashboard',
      page_search: '',
      app_surface: 'landlord_app',
      feature_area: 'dashboard',
      feature_name: 'dashboard',
      route_template: '/dashboard',
    })
  })

  it('includes page_title in event', () => {
    document.title = 'Test Page'
    renderHook(() => usePageTracking())

    expect(window.dataLayer[0]).toMatchObject({
      event: 'page_view',
      page_title: 'Test Page',
    })
  })

  it('pushes new event when pathname changes', () => {
    const { rerender } = renderHook(() => usePageTracking())

    expect(window.dataLayer).toHaveLength(1)

    // Simulate route change
    mockLocation.pathname = '/properties'
    rerender()

    expect(window.dataLayer).toHaveLength(2)
    expect(window.dataLayer[1]).toMatchObject({
      event: 'page_view',
      page_path: '/properties',
    })
  })

  it('pushes new event when search changes', () => {
    const { rerender } = renderHook(() => usePageTracking())

    expect(window.dataLayer).toHaveLength(1)

    // Simulate search change
    mockLocation.search = '?tab=details'
    rerender()

    expect(window.dataLayer).toHaveLength(2)
    expect(window.dataLayer[1]).toMatchObject({
      event: 'page_view',
      page_search: '?tab=details',
    })
  })

  it('initializes dataLayer if undefined', () => {
    delete (window as unknown as { dataLayer?: unknown[] }).dataLayer

    renderHook(() => usePageTracking())

    expect(window.dataLayer).toBeDefined()
    expect(window.dataLayer).toHaveLength(1)
  })

  it('appends to existing dataLayer entries', () => {
    window.dataLayer.push({ existing: 'entry' })

    renderHook(() => usePageTracking())

    expect(window.dataLayer).toHaveLength(2)
    expect(window.dataLayer[0]).toEqual({ existing: 'entry' })
    expect(window.dataLayer[1]).toMatchObject({
      event: 'page_view',
    })
  })

  it('captures a PostHog pageview with app context when loaded', () => {
    ;(posthog as unknown as { __loaded: boolean }).__loaded = true
    mockLocation.search =
      '?tab=details&utm_source=linkedin&email=owner@example.com'
    window.history.replaceState({}, '', `/dashboard${mockLocation.search}`)

    renderHook(() => usePageTracking())

    expect(mockCapture).toHaveBeenCalledWith(
      '$pageview',
      expect.objectContaining({
        source_app: 'frontend',
        page_path: '/dashboard',
        page_type: 'app',
        funnel_stage: 'retention',
        page_search: '?tab=details&utm_source=linkedin',
        page_title: document.title,
        app_surface: 'landlord_app',
        feature_area: 'dashboard',
        feature_name: 'dashboard',
        route_template: '/dashboard',
        utm_source: 'linkedin',
        latest_utm_source: 'linkedin',
      })
    )
    expect(mockCapture).toHaveBeenCalledWith(
      'app_route_viewed',
      expect.objectContaining({
        source_app: 'frontend',
        page_path: '/dashboard',
        page_search: '?tab=details&utm_source=linkedin',
        app_surface: 'landlord_app',
        feature_area: 'dashboard',
        feature_name: 'dashboard',
        route_template: '/dashboard',
      })
    )
  })

  it('captures tenant portal route views with stable route templates', () => {
    ;(posthog as unknown as { __loaded: boolean }).__loaded = true
    mockLocation.pathname = '/tenant/disputes/dispute-123'

    renderHook(() => usePageTracking())

    expect(mockCapture).toHaveBeenCalledWith(
      'app_route_viewed',
      expect.objectContaining({
        app_surface: 'tenant_portal',
        feature_area: 'tenant_disputes',
        feature_name: 'tenant_dispute_detail',
        route_template: '/tenant/disputes/:disputeId',
      })
    )
  })

  it('retries the initial PostHog pageview when the SDK loads after mount', () => {
    vi.useFakeTimers()

    renderHook(() => usePageTracking())
    expect(mockCapture).not.toHaveBeenCalled()
    ;(posthog as unknown as { __loaded: boolean }).__loaded = true
    act(() => {
      vi.advanceTimersByTime(250)
    })

    expect(mockCapture).toHaveBeenCalledWith(
      '$pageview',
      expect.objectContaining({
        source_app: 'frontend',
        page_path: '/dashboard',
      })
    )
    expect(mockCapture).toHaveBeenCalledWith(
      'app_route_viewed',
      expect.objectContaining({
        source_app: 'frontend',
        page_path: '/dashboard',
        route_template: '/dashboard',
      })
    )
  })
})
