/**
 * MSW handlers for dashboard endpoint
 */
import { http, HttpResponse } from 'msw'

// Dashboard summary response type matching backend schema
export interface DashboardSummary {
  property_count: number
  unit_count: number
  lease_count: number
  gl_entry_count: number
  pending_reconciliations: number
  pending_verifications: number
  recent_activity: ActivityItem[]
  alerts: AlertItem[]
}

interface ActivityItem {
  id: string
  type: string
  title: string
  description: string
  timestamp: string
  href: string
}

interface AlertItem {
  id: string
  type: 'warning' | 'info' | 'action'
  title: string
  description: string
  href: string
  count?: number
}

// Default dashboard data
// Note: activity.type must match RecentActivityCard's expected types:
// 'upload' | 'verification' | 'reconciliation' | 'export' | 'property' | 'lease'
let dashboardData: DashboardSummary = {
  property_count: 5,
  unit_count: 12,
  lease_count: 8,
  gl_entry_count: 1247,
  pending_reconciliations: 2,
  pending_verifications: 3,
  recent_activity: [
    {
      id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'property',
      title: 'Property added',
      description: 'Test Property',
      timestamp: '2024-01-15T10:30:00Z',
      href: '/properties/123',
    },
  ],
  alerts: [
    {
      id: 'pending-verifications',
      type: 'warning',
      title: 'Documents need review',
      description: '3 document(s) awaiting verification.',
      href: '/extractions',
      count: 3,
    },
  ],
}

/**
 * Reset dashboard data to defaults
 */
export function resetDashboardData(): void {
  dashboardData = {
    property_count: 5,
    unit_count: 12,
    lease_count: 8,
    gl_entry_count: 1247,
    pending_reconciliations: 2,
    pending_verifications: 3,
    recent_activity: [
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'property',
        title: 'Property added',
        description: 'Test Property',
        timestamp: '2024-01-15T10:30:00Z',
        href: '/properties/123',
      },
    ],
    alerts: [
      {
        id: 'pending-verifications',
        type: 'warning',
        title: 'Documents need review',
        description: '3 document(s) awaiting verification.',
        href: '/extractions',
        count: 3,
      },
    ],
  }
}

/**
 * Set custom dashboard data for tests
 */
export function setDashboardData(data: Partial<DashboardSummary>): void {
  dashboardData = { ...dashboardData, ...data }
}

export const dashboardHandlers = [
  // GET /api/v1/dashboard - Get dashboard summary
  http.get('*/api/v1/dashboard', () => {
    return HttpResponse.json(dashboardData)
  }),
]

/**
 * Get a handler that returns an error response for testing error states
 */
export function getDashboardErrorHandler(status: number = 500) {
  return http.get('*/api/v1/dashboard', () => {
    return HttpResponse.json({ detail: 'Internal server error' }, { status })
  })
}
