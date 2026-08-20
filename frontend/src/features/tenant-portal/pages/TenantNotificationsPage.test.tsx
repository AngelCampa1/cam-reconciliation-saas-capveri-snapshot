/**
 * Tests for TenantNotificationsPage component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TenantNotificationsPage } from './TenantNotificationsPage'

// Mock SDK functions used by NotificationList
vi.mock('@/api/generated/sdk.gen', () => ({
  listNotificationsApiV1TenantNotificationsGet: vi.fn(() =>
    Promise.resolve({
      data: [],
      error: undefined,
      response: {} as Response,
    })
  ),
  markNotificationReadApiV1TenantNotificationsNotificationIdReadPost: vi.fn(),
  markAllNotificationsReadApiV1TenantNotificationsReadAllPost: vi.fn(),
}))

describe('TenantNotificationsPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  it('renders page header with correct title', () => {
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <TenantNotificationsPage />
        </QueryClientProvider>
      </MemoryRouter>
    )

    expect(screen.getByText('Notifications')).toBeInTheDocument()
    expect(
      screen.getByText('View your activity and updates')
    ).toBeInTheDocument()
  })

  it('renders back button with correct navigation target', () => {
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <TenantNotificationsPage />
        </QueryClientProvider>
      </MemoryRouter>
    )

    // PageHeader with showBackButton=true renders a BackButton component
    // BackButton renders as a button with text "Back" and aria-label
    const backButton = screen.getByRole('button', { name: /navigate back/i })
    expect(backButton).toBeInTheDocument()
    expect(backButton).toHaveTextContent('Back')
  })

  it('renders NotificationList component', () => {
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <TenantNotificationsPage />
        </QueryClientProvider>
      </MemoryRouter>
    )

    // NotificationList renders skeleton cards while the async query resolves.
    // Their presence confirms the component mounted.
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0)
  })
})
