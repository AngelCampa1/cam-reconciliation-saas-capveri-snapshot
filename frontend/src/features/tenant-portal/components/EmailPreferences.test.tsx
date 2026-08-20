/**
 * Tests for EmailPreferences component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query'
import { EmailPreferences } from './EmailPreferences'

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
    getEmailPreferencesApiV1TenantNotificationsPreferencesGet: vi.fn(),
    updateEmailPreferencesApiV1TenantNotificationsPreferencesPut: vi.fn(),
  }
})

import {
  getEmailPreferencesApiV1TenantNotificationsPreferencesGet,
  updateEmailPreferencesApiV1TenantNotificationsPreferencesPut,
} from '@/api/generated/sdk.gen'
import { apiClient } from '@/api/client'
import { toast } from 'sonner'

const mockPreferences = {
  tenant_user_id: '123e4567-e89b-12d3-a456-426614174000',
  new_statement_emails: true,
  dispute_update_emails: true,
  reminder_emails: true,
  marketing_emails: false,
  updated_at: '2024-12-30T10:00:00Z',
}

describe('EmailPreferences', () => {
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
    // Restore the shared online singleton so a paused-fetch test cannot leak
    // into later tests in the run.
    onlineManager.setOnline(true)
  })

  it('shows an offline notice (not a stuck spinner) when the fetch is paused', async () => {
    onlineManager.setOnline(false)
    vi.mocked(
      getEmailPreferencesApiV1TenantNotificationsPreferencesGet
    ).mockResolvedValue({
      data: mockPreferences,
      error: undefined,
      response: {} as Response,
    })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <EmailPreferences />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument()
  })

  it('shows loading state while fetching preferences', () => {
    vi.mocked(
      getEmailPreferencesApiV1TenantNotificationsPreferencesGet
    ).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <EmailPreferences />
      </QueryClientProvider>
    )

    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('renders all preference options', async () => {
    vi.mocked(
      getEmailPreferencesApiV1TenantNotificationsPreferencesGet
    ).mockResolvedValue({
      data: mockPreferences,
      error: undefined,
      response: {} as Response,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <EmailPreferences />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(
        screen.getByText('New Statement Notifications')
      ).toBeInTheDocument()
    })

    expect(
      getEmailPreferencesApiV1TenantNotificationsPreferencesGet
    ).toHaveBeenCalledWith({ client: apiClient })
    expect(screen.getByText('Dispute Updates')).toBeInTheDocument()
    expect(screen.getByText('Payment Reminders')).toBeInTheDocument()
    expect(screen.getByText('Marketing Emails')).toBeInTheDocument()
  })

  it('displays preference descriptions', async () => {
    vi.mocked(
      getEmailPreferencesApiV1TenantNotificationsPreferencesGet
    ).mockResolvedValue({
      data: mockPreferences,
      error: undefined,
      response: {} as Response,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <EmailPreferences />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(
        screen.getByText(/receive an email when a new CAM statement/i)
      ).toBeInTheDocument()
    })

    expect(
      screen.getByText(/receive an email when your dispute status/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/receive reminder emails for pending statements/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/receive updates about new features/i)
    ).toBeInTheDocument()
  })

  it('shows correct switch states based on preferences', async () => {
    vi.mocked(
      getEmailPreferencesApiV1TenantNotificationsPreferencesGet
    ).mockResolvedValue({
      data: mockPreferences,
      error: undefined,
      response: {} as Response,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <EmailPreferences />
      </QueryClientProvider>
    )

    await waitFor(() => {
      const newStatementSwitch = screen.getByRole('switch', {
        name: /new statement/i,
      })
      expect(newStatementSwitch).toHaveAttribute('data-state', 'checked')
    })

    const disputeSwitch = screen.getByRole('switch', { name: /dispute/i })
    expect(disputeSwitch).toHaveAttribute('data-state', 'checked')

    const reminderSwitch = screen.getByRole('switch', { name: /reminder/i })
    expect(reminderSwitch).toHaveAttribute('data-state', 'checked')

    const marketingSwitch = screen.getByRole('switch', { name: /marketing/i })
    expect(marketingSwitch).toHaveAttribute('data-state', 'unchecked')
  })

  it('does not render its own heading (the page provides it)', async () => {
    vi.mocked(
      getEmailPreferencesApiV1TenantNotificationsPreferencesGet
    ).mockResolvedValue({
      data: mockPreferences,
      error: undefined,
      response: {} as Response,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <EmailPreferences />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(
        screen.getByText('New Statement Notifications')
      ).toBeInTheDocument()
    })

    // Avoid a duplicate "Email Preferences" heading: the page header owns it.
    expect(
      screen.queryByRole('heading', { name: 'Email Preferences' })
    ).not.toBeInTheDocument()
  })

  it('toggles new statement emails preference', async () => {
    const mockGet = vi.mocked(
      getEmailPreferencesApiV1TenantNotificationsPreferencesGet
    )
    const mockUpdate = vi.mocked(
      updateEmailPreferencesApiV1TenantNotificationsPreferencesPut
    )

    // Initial fetch
    mockGet.mockResolvedValue({
      data: mockPreferences,
      error: undefined,
      response: {} as Response,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <EmailPreferences />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(
        screen.getByText('New Statement Notifications')
      ).toBeInTheDocument()
    })

    const newStatementSwitch = screen.getByRole('switch', {
      name: /new statement/i,
    })

    // Mock the update request
    mockUpdate.mockResolvedValue({
      data: { ...mockPreferences, new_statement_emails: false },
      error: undefined,
      response: {} as Response,
    })

    // Toggle the switch
    await newStatementSwitch.click()

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        client: apiClient,
        body: { new_statement_emails: false },
      })
    })

    // A successful save confirms itself to the user.
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Preferences saved')
    })
  })

  it('toggles dispute update emails preference', async () => {
    const mockGet = vi.mocked(
      getEmailPreferencesApiV1TenantNotificationsPreferencesGet
    )
    const mockUpdate = vi.mocked(
      updateEmailPreferencesApiV1TenantNotificationsPreferencesPut
    )

    mockGet.mockResolvedValue({
      data: mockPreferences,
      error: undefined,
      response: {} as Response,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <EmailPreferences />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(
        screen.getByText('New Statement Notifications')
      ).toBeInTheDocument()
    })

    const disputeSwitch = screen.getByRole('switch', { name: /dispute/i })

    mockUpdate.mockResolvedValue({
      data: { ...mockPreferences, dispute_update_emails: false },
      error: undefined,
      response: {} as Response,
    })

    await disputeSwitch.click()

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        client: apiClient,
        body: { dispute_update_emails: false },
      })
    })
  })

  it('toggles reminder emails preference', async () => {
    const mockGet = vi.mocked(
      getEmailPreferencesApiV1TenantNotificationsPreferencesGet
    )
    const mockUpdate = vi.mocked(
      updateEmailPreferencesApiV1TenantNotificationsPreferencesPut
    )

    mockGet.mockResolvedValue({
      data: mockPreferences,
      error: undefined,
      response: {} as Response,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <EmailPreferences />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(
        screen.getByText('New Statement Notifications')
      ).toBeInTheDocument()
    })

    const reminderSwitch = screen.getByRole('switch', { name: /reminder/i })

    mockUpdate.mockResolvedValue({
      data: { ...mockPreferences, reminder_emails: false },
      error: undefined,
      response: {} as Response,
    })

    await reminderSwitch.click()

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        client: apiClient,
        body: { reminder_emails: false },
      })
    })
  })

  it('toggles marketing emails preference', async () => {
    const mockGet = vi.mocked(
      getEmailPreferencesApiV1TenantNotificationsPreferencesGet
    )
    const mockUpdate = vi.mocked(
      updateEmailPreferencesApiV1TenantNotificationsPreferencesPut
    )

    mockGet.mockResolvedValue({
      data: mockPreferences,
      error: undefined,
      response: {} as Response,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <EmailPreferences />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(
        screen.getByText('New Statement Notifications')
      ).toBeInTheDocument()
    })

    const marketingSwitch = screen.getByRole('switch', { name: /marketing/i })

    mockUpdate.mockResolvedValue({
      data: { ...mockPreferences, marketing_emails: true },
      error: undefined,
      response: {} as Response,
    })

    await marketingSwitch.click()

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        client: apiClient,
        body: { marketing_emails: true },
      })
    })
  })

  it('disables switches during update', async () => {
    const mockGet = vi.mocked(
      getEmailPreferencesApiV1TenantNotificationsPreferencesGet
    )
    const mockUpdate = vi.mocked(
      updateEmailPreferencesApiV1TenantNotificationsPreferencesPut
    )

    mockGet.mockResolvedValue({
      data: mockPreferences,
      error: undefined,
      response: {} as Response,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <EmailPreferences />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(
        screen.getByText('New Statement Notifications')
      ).toBeInTheDocument()
    })

    // Mock a slow update
    mockUpdate.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: {
                  ...mockPreferences,
                  new_statement_emails: false,
                },
                error: undefined,
                response: {} as Response,
              }),
            1000
          )
        )
    )

    const newStatementSwitch = screen.getByRole('switch', {
      name: /new statement/i,
    })
    await newStatementSwitch.click()

    // Switch should be disabled during update
    await waitFor(() => {
      expect(newStatementSwitch).toBeDisabled()
    })
  })

  it('shows error toast when preference update fails', async () => {
    const mockGet = vi.mocked(
      getEmailPreferencesApiV1TenantNotificationsPreferencesGet
    )
    const mockUpdate = vi.mocked(
      updateEmailPreferencesApiV1TenantNotificationsPreferencesPut
    )

    mockGet.mockResolvedValue({
      data: mockPreferences,
      error: undefined,
      response: {} as Response,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <EmailPreferences />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(
        screen.getByText('New Statement Notifications')
      ).toBeInTheDocument()
    })

    mockUpdate.mockResolvedValue({
      data: undefined,
      error: new Error('Server error'),
      response: {} as Response,
    })

    const newStatementSwitch = screen.getByRole('switch', {
      name: /new statement/i,
    })
    await newStatementSwitch.click()

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to update email preferences. Please try again.'
      )
    })
  })
})
