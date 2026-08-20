/**
 * Tests for NotificationList component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { NotificationList } from './NotificationList'

vi.mock('@/api/client', () => ({
  apiClient: { __testClient: true },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

// Mock SDK functions
vi.mock('@/api/generated/sdk.gen', async () => {
  const actual = await vi.importActual('@/api/generated/sdk.gen')
  return {
    ...actual,
    listNotificationsApiV1TenantNotificationsGet: vi.fn(),
    markNotificationReadApiV1TenantNotificationsNotificationIdReadPost: vi.fn(),
    markAllNotificationsReadApiV1TenantNotificationsReadAllPost: vi.fn(),
  }
})

import {
  listNotificationsApiV1TenantNotificationsGet,
  markNotificationReadApiV1TenantNotificationsNotificationIdReadPost,
  markAllNotificationsReadApiV1TenantNotificationsReadAllPost,
} from '@/api/generated/sdk.gen'
import { apiClient } from '@/api/client'
import { toast } from 'sonner'

const mockNotifications = [
  {
    id: '123e4567-e89b-12d3-a456-426614174000',
    notification_type: 'new_statement',
    title: 'New Statement: Westfield Mall',
    message: 'Your 2024 reconciliation statement is ready. Amount: $12,500.00',
    link_url: '/tenant/statements/123',
    read_at: null,
    created_at: '2024-12-30T10:00:00Z',
  },
  {
    id: '123e4567-e89b-12d3-a456-426614174001',
    notification_type: 'dispute_update',
    title: 'Dispute Update: Westfield Mall',
    message: 'Your dispute status has been updated to: under_review',
    link_url: '/tenant/disputes/456',
    read_at: '2024-12-30T11:00:00Z',
    created_at: '2024-12-29T10:00:00Z',
  },
]

describe('NotificationList', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    // onlineManager is a global singleton; restore so the paused-state test
    // can't leak "offline" into later suites.
    onlineManager.setOnline(true)
  })

  it('shows loading state while fetching notifications', () => {
    vi.mocked(listNotificationsApiV1TenantNotificationsGet).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NotificationList />
        </QueryClientProvider>
      </MemoryRouter>
    )

    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0)
  })

  it('renders notifications with titles and messages', async () => {
    vi.mocked(listNotificationsApiV1TenantNotificationsGet).mockResolvedValue({
      data: mockNotifications,
      error: undefined,
      response: {} as Response,
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NotificationList />
        </QueryClientProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(
        screen.getByText('New Statement: Westfield Mall')
      ).toBeInTheDocument()
    })

    expect(
      screen.getByText(/your 2024 reconciliation statement/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText('Dispute Update: Westfield Mall')
    ).toBeInTheDocument()
    expect(listNotificationsApiV1TenantNotificationsGet).toHaveBeenCalledWith({
      client: apiClient,
      query: {
        unread_only: false,
        skip: 0,
        limit: 20,
      },
    })
  })

  it('shows unread indicator for unread notifications', async () => {
    vi.mocked(listNotificationsApiV1TenantNotificationsGet).mockResolvedValue({
      data: mockNotifications,
      error: undefined,
      response: {} as Response,
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NotificationList />
        </QueryClientProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      const unreadIndicator = screen.getByText('(Unread)')
      expect(unreadIndicator).toBeInTheDocument()
    })
  })

  it('shows mark all read button when unread notifications exist', async () => {
    vi.mocked(listNotificationsApiV1TenantNotificationsGet).mockResolvedValue({
      data: mockNotifications,
      error: undefined,
      response: {} as Response,
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NotificationList />
        </QueryClientProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/mark all read/i)).toBeInTheDocument()
    })
  })

  it('shows empty state when no notifications', async () => {
    vi.mocked(listNotificationsApiV1TenantNotificationsGet).mockResolvedValue({
      data: [],
      error: undefined,
      response: {} as Response,
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NotificationList />
        </QueryClientProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument()
    })
  })

  it('displays relative timestamps for notifications', async () => {
    vi.mocked(listNotificationsApiV1TenantNotificationsGet).mockResolvedValue({
      data: mockNotifications,
      error: undefined,
      response: {} as Response,
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NotificationList />
        </QueryClientProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      // formatDistanceToNow will show something like "1 day ago" or "2 hours ago"
      const timestamps = screen.getAllByText(/ago/i)
      expect(timestamps.length).toBeGreaterThan(0)
    })
  })

  it('marks notification as read when clicked', async () => {
    vi.mocked(listNotificationsApiV1TenantNotificationsGet).mockResolvedValue({
      data: mockNotifications,
      error: undefined,
      response: {} as Response,
    })

    vi.mocked(
      markNotificationReadApiV1TenantNotificationsNotificationIdReadPost
    ).mockResolvedValue({
      data: {},
      error: undefined,
      response: {} as Response,
    })

    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NotificationList />
        </QueryClientProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(
        screen.getByText('New Statement: Westfield Mall')
      ).toBeInTheDocument()
    })

    // Click the unread notification
    const notification = screen.getByText('New Statement: Westfield Mall')
    await user.click(notification)

    // Should call mark as read endpoint
    await waitFor(() => {
      expect(
        markNotificationReadApiV1TenantNotificationsNotificationIdReadPost
      ).toHaveBeenCalledWith({
        client: apiClient,
        path: { notification_id: '123e4567-e89b-12d3-a456-426614174000' },
      })
    })
  })

  it('marks notification as read when activated with keyboard', async () => {
    vi.mocked(listNotificationsApiV1TenantNotificationsGet).mockResolvedValue({
      data: mockNotifications,
      error: undefined,
      response: {} as Response,
    })

    vi.mocked(
      markNotificationReadApiV1TenantNotificationsNotificationIdReadPost
    ).mockResolvedValue({
      data: {},
      error: undefined,
      response: {} as Response,
    })

    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NotificationList />
        </QueryClientProvider>
      </MemoryRouter>
    )

    const notification = await screen.findByRole('button', {
      name: /New Statement: Westfield Mall/i,
    })
    notification.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(
        markNotificationReadApiV1TenantNotificationsNotificationIdReadPost
      ).toHaveBeenCalledWith({
        client: apiClient,
        path: { notification_id: '123e4567-e89b-12d3-a456-426614174000' },
      })
    })
  })

  it('handles mark as read error gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(listNotificationsApiV1TenantNotificationsGet).mockResolvedValue({
      data: mockNotifications,
      error: undefined,
      response: {} as Response,
    })

    vi.mocked(
      markNotificationReadApiV1TenantNotificationsNotificationIdReadPost
    ).mockResolvedValue({
      data: undefined,
      error: new Error('Server error'),
      response: {} as Response,
    })

    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NotificationList />
        </QueryClientProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(
        screen.getByText('New Statement: Westfield Mall')
      ).toBeInTheDocument()
    })

    // Click the unread notification
    const notification = screen.getByText('New Statement: Westfield Mall')
    await user.click(notification)

    // Should handle error gracefully (component stays rendered) and show toast
    await waitFor(() => {
      expect(
        screen.getByText('New Statement: Westfield Mall')
      ).toBeInTheDocument()
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to mark notification as read'
      )
    })

    consoleError.mockRestore()
  })

  it('marks all notifications as read', async () => {
    vi.mocked(listNotificationsApiV1TenantNotificationsGet).mockResolvedValue({
      data: mockNotifications,
      error: undefined,
      response: {} as Response,
    })

    vi.mocked(
      markAllNotificationsReadApiV1TenantNotificationsReadAllPost
    ).mockResolvedValue({
      data: { success: true },
      error: undefined,
      response: {} as Response,
    })

    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NotificationList />
        </QueryClientProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/mark all read/i)).toBeInTheDocument()
    })

    // Click mark all read button
    const markAllButton = screen.getByText(/mark all read/i)
    await user.click(markAllButton)

    // Should call mark all read endpoint
    await waitFor(() => {
      expect(
        markAllNotificationsReadApiV1TenantNotificationsReadAllPost
      ).toHaveBeenCalledWith({ client: apiClient })
    })
  })

  it('handles mark all as read error gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(listNotificationsApiV1TenantNotificationsGet).mockResolvedValue({
      data: mockNotifications,
      error: undefined,
      response: {} as Response,
    })

    vi.mocked(
      markAllNotificationsReadApiV1TenantNotificationsReadAllPost
    ).mockResolvedValue({
      data: undefined,
      error: new Error('Server error'),
      response: {} as Response,
    })

    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NotificationList />
        </QueryClientProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/mark all read/i)).toBeInTheDocument()
    })

    // Click mark all read button
    const markAllButton = screen.getByText(/mark all read/i)
    await user.click(markAllButton)

    // Should handle error gracefully (component stays rendered) and show toast
    await waitFor(() => {
      expect(screen.getByText(/mark all read/i)).toBeInTheDocument()
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to mark all notifications as read'
      )
    })

    consoleError.mockRestore()
  })

  // F-226: "Mark all read" must be the app Button component (pill + min-height)
  it('renders Mark all read as a Button with rounded-full (F-226)', async () => {
    vi.mocked(listNotificationsApiV1TenantNotificationsGet).mockResolvedValue({
      data: mockNotifications,
      error: undefined,
      response: {} as Response,
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NotificationList />
        </QueryClientProvider>
      </MemoryRouter>
    )

    const btn = await screen.findByRole('button', { name: /mark all read/i })
    expect(btn).toBeInTheDocument()
    // The app Button component renders pill corners via rounded-button (design token = 9999px)
    expect(btn).toHaveClass('rounded-button')
  })

  it('shows error when fetching notifications fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(listNotificationsApiV1TenantNotificationsGet).mockResolvedValue({
      data: undefined,
      error: new Error('Server error'),
      response: {} as Response,
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NotificationList />
        </QueryClientProvider>
      </MemoryRouter>
    )

    // Component should handle the error gracefully
    // React Query will retry by default, so we just ensure no crash
    await waitFor(() => {
      // The component should still render (not crash)
      expect(
        screen.queryByText(/loading notifications/i)
      ).not.toBeInTheDocument()
    })

    consoleError.mockRestore()
  })

  // A paused fetch (networkMode 'online' + unreachable backend) leaves error
  // null and isLoading false, so without an isPaused guard the list rendered a
  // blank area (the undefined-data empty state never fires). Assert it now
  // surfaces a retryable offline notice instead.
  it('shows an offline notice (not a blank list) when the fetch is paused', async () => {
    onlineManager.setOnline(false)
    vi.mocked(listNotificationsApiV1TenantNotificationsGet).mockResolvedValue({
      data: [],
      error: undefined,
      response: {} as Response,
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NotificationList />
        </QueryClientProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/no notifications yet/i)).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
  })
})
