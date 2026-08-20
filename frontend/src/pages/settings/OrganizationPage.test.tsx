/**
 * Tests for OrganizationPage component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrganizationPage } from './OrganizationPage'
import type { User, Session } from '@supabase/supabase-js'

// Mock analytics
const { mockTrackEvent } = vi.hoisted(() => ({ mockTrackEvent: vi.fn() }))
vi.mock('@/lib/analytics', () => ({
  trackEvent: mockTrackEvent,
}))

// Mock useAuth hook
const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

// Mock organization hooks
const mockUseOrganization = vi.fn()
const mockUseUpdateOrganization = vi.fn()
vi.mock('@/hooks/use-organization', () => ({
  useOrganization: () => mockUseOrganization(),
  useUpdateOrganization: () => mockUseUpdateOrganization(),
}))

// Mock subscription hook
const mockUseSubscription = vi.fn()
vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => mockUseSubscription(),
}))

// Mock organization usage hook
const mockUseOrganizationUsage = vi.fn()
vi.mock('@/hooks/use-organization-usage', () => ({
  useOrganizationUsage: () => mockUseOrganizationUsage(),
}))

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Import toast after mocking
import { toast as mockToast } from 'sonner'

// Mock spinner component
vi.mock('@/components/ui/spinner', () => ({
  Spinner: ({ size, className }: { size?: string; className?: string }) => (
    <div data-testid="spinner" data-size={size} className={className}>
      Loading...
    </div>
  ),
}))

// Mock progress component
vi.mock('@/components/ui/progress', () => ({
  Progress: ({ value }: { value: number }) => (
    <div data-testid="progress" data-value={value}>
      Progress: {value}%
    </div>
  ),
}))

describe('OrganizationPage', () => {
  const mockAdminUser = {
    id: 'admin-123',
    email: 'admin@example.com',
    role: 'admin',
  } as User

  const mockRegularUser = {
    id: 'user-123',
    email: 'user@example.com',
    role: 'user',
  } as User

  const mockSession = {
    user: mockAdminUser,
    access_token: 'token-123',
  } as Session

  const mockOrganization = {
    id: 'org-123',
    name: 'Acme Corporation',
    subscription_status: 'active',
    settings: {
      timezone: 'UTC',
      default_currency: 'USD',
      fiscal_year_end_month: 12,
    },
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  }

  const mockSubscription = {
    id: 'sub-123',
    organization_id: 'org-123',
    plan: 'professional',
    status: 'active' as const,
    current_period_start: '2024-01-01',
    current_period_end: '2024-12-31',
    cancel_at_period_end: false,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  }

  const mockUsage = {
    propertiesUsed: 5,
    propertiesLimit: 50,
    usersUsed: 3,
    usersLimit: 15,
  }

  const mockMutate = vi.fn()
  const mockMutateAsync = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Default hook returns
    mockUseOrganization.mockReturnValue({
      data: mockOrganization,
      isLoading: false,
      error: null,
    })

    mockUseUpdateOrganization.mockReturnValue({
      mutate: mockMutate,
      mutateAsync: mockMutateAsync,
      isPending: false,
    })

    mockUseSubscription.mockReturnValue({
      data: mockSubscription,
      isLoading: false,
    })

    mockUseOrganizationUsage.mockReturnValue({
      data: mockUsage,
      isLoading: false,
    })
  })

  describe('Loading State', () => {
    it('shows loading spinner when user is not loaded', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        userRole: null,
      })

      mockUseOrganization.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      })

      render(<OrganizationPage />)

      expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0)
    })
  })

  describe('Organization Display', () => {
    it('displays organization information correctly', () => {
      mockUseAuth.mockReturnValue({
        user: mockAdminUser,
        userRole: 'admin',
        isOwner: false,
      })

      render(<OrganizationPage />)

      expect(screen.getByText('Organization Settings')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Acme Corporation')).toBeInTheDocument()
      expect(screen.getByDisplayValue('org-123')).toBeInTheDocument()
    })

    it('organization ID field is always disabled', () => {
      mockUseAuth.mockReturnValue({
        user: mockAdminUser,
        userRole: 'admin',
        isOwner: false,
      })

      render(<OrganizationPage />)

      const idInput = screen.getByDisplayValue('org-123')
      expect(idInput).toBeDisabled()
    })
  })

  describe('Owner Access', () => {
    const mockOwnerUser = {
      id: 'owner-123',
      email: 'owner@example.com',
      role: 'owner',
    } as User

    it('allows owner users to edit organization name', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockOwnerUser,
        userRole: 'owner',
        isOwner: true,
      })

      render(<OrganizationPage />)

      const nameInput = screen.getByPlaceholderText('Enter organization name')
      expect(nameInput).not.toBeDisabled()

      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Corp')

      expect(nameInput).toHaveValue('Updated Corp')
    })

    it('shows save and cancel buttons for owner users', () => {
      mockUseAuth.mockReturnValue({
        user: mockOwnerUser,
        userRole: 'owner',
        isOwner: true,
      })

      render(<OrganizationPage />)

      expect(
        screen.getByRole('button', { name: 'Save Changes' })
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('validates organization name minimum length', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockOwnerUser,
        userRole: 'owner',
        isOwner: true,
      })

      render(<OrganizationPage />)

      const nameInput = screen.getByPlaceholderText('Enter organization name')
      const saveButton = screen.getByRole('button', { name: 'Save Changes' })

      await user.clear(nameInput)
      await user.type(nameInput, 'A')
      await user.click(saveButton)

      await waitFor(() => {
        expect(
          screen.getByText('Organization name must be at least 2 characters')
        ).toBeInTheDocument()
      })
    })

    it('shows success toast on organization update', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockOwnerUser,
        userRole: 'owner',
        isOwner: true,
      })

      // Mock successful mutation
      mockMutateAsync.mockResolvedValue({
        ...mockOrganization,
        name: 'Updated Corporation',
      })

      render(<OrganizationPage />)

      const nameInput = screen.getByPlaceholderText('Enter organization name')
      const saveButton = screen.getByRole('button', { name: 'Save Changes' })

      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Corporation')
      await user.click(saveButton)

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          name: 'Updated Corporation',
        })
        expect(mockToast.success).toHaveBeenCalledWith(
          'Organization updated successfully'
        )
      })
    })

    it('fires organization_update_completed on successful org update', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockOwnerUser,
        userRole: 'owner',
        isOwner: true,
      })

      mockMutateAsync.mockResolvedValue({
        ...mockOrganization,
        name: 'Updated Corporation',
      })

      render(<OrganizationPage />)

      const nameInput = screen.getByPlaceholderText('Enter organization name')
      const saveButton = screen.getByRole('button', { name: 'Save Changes' })

      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Corporation')
      await user.click(saveButton)

      await waitFor(() => {
        expect(mockTrackEvent).toHaveBeenCalledWith(
          'organization_update_completed'
        )
      })
    })

    it('resets form on cancel', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockOwnerUser,
        userRole: 'owner',
        isOwner: true,
      })

      render(<OrganizationPage />)

      const nameInput = screen.getByPlaceholderText('Enter organization name')
      const cancelButton = screen.getByRole('button', { name: 'Cancel' })

      await user.clear(nameInput)
      await user.type(nameInput, 'Changed Name')
      await user.click(cancelButton)

      expect(nameInput).toHaveValue('Acme Corporation') // Reset to original
    })
  })

  describe('Non-Owner Access', () => {
    it('shows read-only view for member users', () => {
      mockUseAuth.mockReturnValue({
        user: mockRegularUser,
        userRole: 'member',
        isOwner: false,
      })

      render(<OrganizationPage />)

      const nameInput = screen.getByPlaceholderText('Enter organization name')
      expect(nameInput).toBeDisabled()
    })

    // F-072 regression guard: ADMINs are NOT owners. The database RLS policy
    // ("Owners can update organizations") only permits the owner to UPDATE the
    // organizations table, so admins must get the read-only view — otherwise
    // they would see an editable form whose save silently fails at the DB.
    it('shows read-only view for admin (non-owner) users', () => {
      mockUseAuth.mockReturnValue({
        user: mockAdminUser,
        userRole: 'admin',
        isOwner: false,
      })

      render(<OrganizationPage />)

      const nameInput = screen.getByPlaceholderText('Enter organization name')
      expect(nameInput).toBeDisabled()
      expect(
        screen.queryByRole('button', { name: 'Save Changes' })
      ).not.toBeInTheDocument()
    })

    it('shows owner-only message for non-owner users', () => {
      mockUseAuth.mockReturnValue({
        user: mockRegularUser,
        userRole: 'member',
        isOwner: false,
      })

      render(<OrganizationPage />)

      expect(
        screen.getByText(
          'Only the organization owner can edit organization settings'
        )
      ).toBeInTheDocument()
    })

    it('hides save and cancel buttons for non-owner users', () => {
      mockUseAuth.mockReturnValue({
        user: mockRegularUser,
        userRole: 'member',
        isOwner: false,
      })

      render(<OrganizationPage />)

      expect(
        screen.queryByRole('button', { name: 'Save Changes' })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Cancel' })
      ).not.toBeInTheDocument()
    })
  })

  describe('Subscription Status', () => {
    it('displays subscription status badge', () => {
      mockUseAuth.mockReturnValue({
        user: mockAdminUser,
        userRole: 'admin',
        isOwner: false,
      })

      render(<OrganizationPage />)

      expect(screen.getByText('Active')).toBeInTheDocument()
    })

    it('surfaces a retryable error when the subscription load fails', () => {
      mockUseAuth.mockReturnValue({
        user: mockAdminUser,
        userRole: 'admin',
        isOwner: false,
      })

      const refetch = vi.fn()
      mockUseSubscription.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch,
      })

      render(<OrganizationPage />)

      expect(
        screen.getByText(/couldn't load your subscription status/i)
      ).toBeInTheDocument()
    })

    it('surfaces a retryable error when the usage load fails', () => {
      mockUseAuth.mockReturnValue({
        user: mockAdminUser,
        userRole: 'admin',
        isOwner: false,
      })

      mockUseOrganizationUsage.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: vi.fn(),
      })

      render(<OrganizationPage />)

      expect(
        screen.getByText(/couldn't load your usage details/i)
      ).toBeInTheDocument()
    })

    it('displays trial end date when on trial', () => {
      mockUseAuth.mockReturnValue({
        user: mockAdminUser,
        userRole: 'admin',
        isOwner: false,
      })

      // Override subscription to be trialing
      mockUseSubscription.mockReturnValue({
        data: {
          ...mockSubscription,
          status: 'trialing',
        },
        isLoading: false,
      })

      render(<OrganizationPage />)

      expect(screen.getByText('Trial Ends')).toBeInTheDocument()
      // Date format varies by locale, so just check that a date is shown
      expect(screen.getByText(/2024/)).toBeInTheDocument()
    })
  })

  describe('Usage Statistics', () => {
    it('displays user usage statistics', () => {
      mockUseAuth.mockReturnValue({
        user: mockAdminUser,
        userRole: 'admin',
        isOwner: false,
      })

      render(<OrganizationPage />)

      expect(screen.getByText('Users')).toBeInTheDocument()
      expect(screen.getByText('3 / 15')).toBeInTheDocument()
    })

    it('displays property usage statistics', () => {
      mockUseAuth.mockReturnValue({
        user: mockAdminUser,
        userRole: 'admin',
        isOwner: false,
      })

      render(<OrganizationPage />)

      expect(screen.getByText('Properties')).toBeInTheDocument()
      expect(screen.getByText('5 / 50')).toBeInTheDocument()
    })

    it('shows progress bars with correct values', () => {
      mockUseAuth.mockReturnValue({
        user: mockAdminUser,
        userRole: 'admin',
        isOwner: false,
      })

      render(<OrganizationPage />)

      const progressBars = screen.getAllByTestId('progress')
      expect(progressBars).toHaveLength(2)

      // Users: 3/15 = 20%
      expect(progressBars[0]).toHaveAttribute('data-value', '20')

      // Properties: 5/50 = 10%
      expect(progressBars[1]).toHaveAttribute('data-value', '10')
    })
  })

  describe('Responsive Layout', () => {
    it('renders with proper container classes for mobile', () => {
      mockUseAuth.mockReturnValue({
        user: mockAdminUser,
        userRole: 'admin',
        isOwner: false,
      })

      const { container } = render(<OrganizationPage />)

      const mainContainer = container.querySelector('.container')
      expect(mainContainer).toHaveClass('mx-auto', 'max-w-4xl')
    })
  })

  describe('Error States', () => {
    it('shows error message when organization fails to load', () => {
      mockUseAuth.mockReturnValue({
        user: mockAdminUser,
        userRole: 'admin',
        isOwner: false,
      })

      // Mock organization error
      mockUseOrganization.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Failed to fetch organization'),
      })

      render(<OrganizationPage />)

      expect(
        screen.getByText("Couldn't load your organization")
      ).toBeInTheDocument()
      expect(
        screen.getByText('This might be a temporary problem.')
      ).toBeInTheDocument()
    })
  })

  describe('Subscription Status Variants', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: mockAdminUser,
        userRole: 'admin',
        isOwner: false,
      })
    })

    it('displays past_due status correctly', () => {
      mockUseSubscription.mockReturnValue({
        data: {
          ...mockSubscription,
          status: 'past_due',
        },
        isLoading: false,
      })

      render(<OrganizationPage />)

      expect(screen.getByText('Past Due')).toBeInTheDocument()
    })

    it('displays canceled status correctly', () => {
      mockUseSubscription.mockReturnValue({
        data: {
          ...mockSubscription,
          status: 'canceled',
        },
        isLoading: false,
      })

      render(<OrganizationPage />)

      expect(screen.getByText('Canceled')).toBeInTheDocument()
    })

    it('displays paused status correctly', () => {
      mockUseSubscription.mockReturnValue({
        data: {
          ...mockSubscription,
          status: 'paused',
        },
        isLoading: false,
      })

      render(<OrganizationPage />)

      expect(screen.getByText('Paused')).toBeInTheDocument()
    })

    it('handles unknown status gracefully', () => {
      mockUseSubscription.mockReturnValue({
        data: {
          ...mockSubscription,
          status: 'unknown_status' as any,
        },
        isLoading: false,
      })

      render(<OrganizationPage />)

      // Unknown status should be displayed as-is
      expect(screen.getByText('unknown_status')).toBeInTheDocument()
    })
  })
})
