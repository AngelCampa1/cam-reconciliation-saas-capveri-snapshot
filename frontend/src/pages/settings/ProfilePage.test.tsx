/**
 * Tests for ProfilePage component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfilePage } from './ProfilePage'
import type { User, Session } from '@supabase/supabase-js'

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}))

const { trackEventMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: trackEventMock,
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock useAuth hook
const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

// Mock useUserRole hook (role field is sourced from the org-scoped role,
// not the Supabase JWT role claim)
const mockUseUserRole = vi.fn()
vi.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => mockUseUserRole(),
}))

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: vi.fn(),
      signInWithPassword: vi.fn(),
      getUser: vi.fn(),
    },
  },
}))

// Import mocked modules after mocking
import { toast as mockToast } from 'sonner'
import { supabase } from '@/lib/supabase'

// Get references to the mock functions for assertions
const mockUpdateUser = vi.mocked(supabase.auth.updateUser)
const mockSignInWithPassword = vi.mocked(supabase.auth.signInWithPassword)
const mockGetUser = vi.mocked(supabase.auth.getUser)

// Mock spinner component
vi.mock('@/components/ui/spinner', () => ({
  Spinner: ({ size, className }: { size?: string; className?: string }) => (
    <div data-testid="spinner" data-size={size} className={className}>
      Loading...
    </div>
  ),
}))

vi.mock('@/components/profile/LinkedAccounts', () => ({
  LinkedAccounts: () => <div data-testid="linked-accounts" />,
}))

describe('ProfilePage', () => {
  const mockLogout = vi.fn()
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    role: 'admin',
    user_metadata: {
      name: 'Test User',
    },
  } as User

  const mockSession = {
    user: mockUser,
    access_token: 'token-123',
  } as Session

  beforeEach(() => {
    vi.clearAllMocks()
    mockLogout.mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn())
    // Default org-scoped role for the role display field
    mockUseUserRole.mockReturnValue({ userRole: 'ADMIN' })
    // Set up default successful responses for Supabase mocks
    mockUpdateUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockSignInWithPassword.mockResolvedValue({
      data: { user: mockUser, session: mockSession },
      error: null,
    })
    mockGetUser.mockResolvedValue({
      data: { user: { ...mockUser, identities: [] } },
      error: null,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('Loading State', () => {
    it('shows skeleton cards when user is not loaded', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        session: null,
        logout: mockLogout,
        isLoading: true,
        isAuthenticated: false,
      })

      render(<ProfilePage />)

      expect(screen.getAllByTestId('skeleton-card')).toHaveLength(2)
    })
  })

  describe('Profile Display', () => {
    it('displays user profile information correctly', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        logout: mockLogout,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      expect(screen.getByText('Profile Settings')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Test User')).toBeInTheDocument()
      // Get visible email input (not the hidden one)
      const emailInputs = screen.getAllByDisplayValue('test@example.com')
      const visibleEmailInput = emailInputs.find(
        (input) => input.getAttribute('type') !== 'hidden'
      )
      expect(visibleEmailInput).toBeInTheDocument()
      expect(screen.getByDisplayValue('ADMIN')).toBeInTheDocument()
    })

    it('displays email from user email when name is not in metadata', () => {
      const userWithoutName = {
        ...mockUser,
        user_metadata: {},
      } as User

      mockUseAuth.mockReturnValue({
        user: userWithoutName,
        session: mockSession,
        logout: mockLogout,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      expect(screen.getByDisplayValue('test')).toBeInTheDocument() // Username from email
    })

    it('email field is disabled', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        logout: mockLogout,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      // Get visible email input (not the hidden one)
      const emailInputs = screen.getAllByDisplayValue('test@example.com')
      const visibleEmailInput = emailInputs.find(
        (input) => input.getAttribute('type') !== 'hidden'
      )
      expect(visibleEmailInput).toBeDisabled()
    })

    it('role field is disabled', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        logout: mockLogout,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const roleInput = screen.getByDisplayValue('ADMIN')
      expect(roleInput).toBeDisabled()
    })

    it('shows message about email changes requiring support', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        logout: mockLogout,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      expect(
        screen.getByText(/Email changes require verification. Contact support/i)
      ).toBeInTheDocument()
    })

    it('associates the Email and Role labels with their inputs', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        logout: mockLogout,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      // getByLabelText only resolves when the <label htmlFor> points at the
      // input's id — the previous FormLabel-outside-FormItem misuse produced a
      // broken `htmlFor="undefined-form-item"` with no matching input.
      expect(screen.getByLabelText('Email')).toHaveValue('test@example.com')
      expect(screen.getByLabelText('Role')).toHaveValue('ADMIN')
    })
  })

  describe('Profile Info Form', () => {
    it('allows name to be edited', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const nameInput = screen.getByPlaceholderText('Enter your name')
      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Name')

      expect(nameInput).toHaveValue('Updated Name')
    })

    it('validates name minimum length', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const nameInput = screen.getByPlaceholderText('Enter your name')
      const saveButton = screen.getAllByText('Save Changes')[0]

      await user.clear(nameInput)
      await user.type(nameInput, 'A')
      await user.click(saveButton)

      await waitFor(() => {
        expect(
          screen.getByText('Name must be at least 2 characters')
        ).toBeInTheDocument()
      })
    })

    it('shows success toast on profile update', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const nameInput = screen.getByPlaceholderText('Enter your name')
      const saveButton = screen.getAllByText('Save Changes')[0]

      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Name')
      await user.click(saveButton)

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith(
          'Profile updated successfully'
        )
      })
    })

    it('fires profile_update_completed on successful profile update', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const nameInput = screen.getByPlaceholderText('Enter your name')
      const saveButton = screen.getAllByText('Save Changes')[0]

      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Name')
      await user.click(saveButton)

      await waitFor(() => {
        expect(trackEventMock).toHaveBeenCalledWith('profile_update_completed')
      })
    })

    it('shows loading state on profile submit', async () => {
      const user = userEvent.setup()

      // Make update slower so we can catch loading state
      mockUpdateUser.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ data: { user: mockUser }, error: null }),
              100
            )
          )
      )

      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const nameInput = screen.getByPlaceholderText('Enter your name')
      const saveButton = screen.getAllByText('Save Changes')[0]

      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Name')
      await user.click(saveButton)

      // Should show spinner briefly while saving
      await waitFor(
        () => {
          const spinners = screen.queryAllByTestId('spinner')
          expect(spinners.length).toBeGreaterThan(0)
        },
        { timeout: 50 }
      )
    })

    it('resets form on cancel', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const nameInput = screen.getByPlaceholderText('Enter your name')
      const cancelButton = screen.getAllByText('Cancel')[0]

      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Name')
      await user.click(cancelButton)

      expect(nameInput).toHaveValue('Test User') // Reset to original
    })
  })

  describe('Password Change Form', () => {
    it('validates password requirements', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const currentPasswordInput = screen.getByPlaceholderText(
        'Enter current password'
      )
      const newPasswordInput = screen.getByPlaceholderText('Enter new password')
      const confirmPasswordInput = screen.getByPlaceholderText(
        'Confirm new password'
      )
      const changeButton = screen.getByRole('button', {
        name: 'Change Password',
      })

      await user.type(currentPasswordInput, 'oldpassword')
      await user.type(newPasswordInput, 'weak')
      await user.type(confirmPasswordInput, 'weak')
      await user.click(changeButton)

      await waitFor(() => {
        expect(
          screen.getByText(/Password must be at least 8 characters/i)
        ).toBeInTheDocument()
      })
    })

    it('validates password uppercase requirement', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const currentPasswordInput = screen.getByPlaceholderText(
        'Enter current password'
      )
      const newPasswordInput = screen.getByPlaceholderText('Enter new password')
      const confirmPasswordInput = screen.getByPlaceholderText(
        'Confirm new password'
      )
      const changeButton = screen.getByRole('button', {
        name: 'Change Password',
      })

      await user.type(currentPasswordInput, 'oldpassword')
      await user.type(newPasswordInput, 'lowercase123')
      await user.type(confirmPasswordInput, 'lowercase123')
      await user.click(changeButton)

      await waitFor(() => {
        expect(
          screen.getByText(
            /Password must contain at least one uppercase letter/i
          )
        ).toBeInTheDocument()
      })
    })

    it('validates password match', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const currentPasswordInput = screen.getByPlaceholderText(
        'Enter current password'
      )
      const newPasswordInput = screen.getByPlaceholderText('Enter new password')
      const confirmPasswordInput = screen.getByPlaceholderText(
        'Confirm new password'
      )
      const changeButton = screen.getByRole('button', {
        name: 'Change Password',
      })

      await user.type(currentPasswordInput, 'OldPassword123')
      await user.type(newPasswordInput, 'NewPassword123')
      await user.type(confirmPasswordInput, 'DifferentPassword123')
      await user.click(changeButton)

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
      })
    })

    it('shows success toast on password change', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const currentPasswordInput = screen.getByPlaceholderText(
        'Enter current password'
      )
      const newPasswordInput = screen.getByPlaceholderText('Enter new password')
      const confirmPasswordInput = screen.getByPlaceholderText(
        'Confirm new password'
      )
      const changeButton = screen.getByRole('button', {
        name: 'Change Password',
      })

      await user.type(currentPasswordInput, 'OldPassword123')
      await user.type(newPasswordInput, 'NewPassword123')
      await user.type(confirmPasswordInput, 'NewPassword123')
      await user.click(changeButton)

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith(
          'Password changed successfully'
        )
      })
    })

    it('fires password_change_completed on successful password change', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const currentPasswordInput = screen.getByPlaceholderText(
        'Enter current password'
      )
      const newPasswordInput = screen.getByPlaceholderText('Enter new password')
      const confirmPasswordInput = screen.getByPlaceholderText(
        'Confirm new password'
      )
      const changeButton = screen.getByRole('button', {
        name: 'Change Password',
      })

      await user.type(currentPasswordInput, 'OldPassword123')
      await user.type(newPasswordInput, 'NewPassword123')
      await user.type(confirmPasswordInput, 'NewPassword123')
      await user.click(changeButton)

      await waitFor(() => {
        expect(trackEventMock).toHaveBeenCalledWith('password_change_completed')
      })
    })

    it('resets password form after successful change', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const currentPasswordInput = screen.getByPlaceholderText(
        'Enter current password'
      )
      const newPasswordInput = screen.getByPlaceholderText('Enter new password')
      const confirmPasswordInput = screen.getByPlaceholderText(
        'Confirm new password'
      )
      const changeButton = screen.getByRole('button', {
        name: 'Change Password',
      })

      await user.type(currentPasswordInput, 'OldPassword123')
      await user.type(newPasswordInput, 'NewPassword123')
      await user.type(confirmPasswordInput, 'NewPassword123')
      await user.click(changeButton)

      await waitFor(() => {
        expect(currentPasswordInput).toHaveValue('')
        expect(newPasswordInput).toHaveValue('')
        expect(confirmPasswordInput).toHaveValue('')
      })
    })

    it('shows password requirements hint', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      expect(
        screen.getByText(
          /Must be at least 8 characters with uppercase, lowercase, and number/i
        )
      ).toBeInTheDocument()
    })

    it('includes hidden username field for accessibility', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      const { container } = render(<ProfilePage />)

      // Find the password change form (second form on the page)
      const forms = container.querySelectorAll('form')
      const passwordForm = forms[1] // Second form is password change

      // Check for hidden username input
      const hiddenInput = passwordForm.querySelector('input[name="username"]')
      expect(hiddenInput).toBeInTheDocument()
      expect(hiddenInput).toHaveAttribute('autocomplete', 'username')
      expect(hiddenInput).toHaveValue('test@example.com')
    })
  })

  describe('Password Change Identity Gating', () => {
    it('shows the password form when the account has an email identity', () => {
      const passwordUser = {
        ...mockUser,
        identities: [{ provider: 'email' }],
      } as unknown as User

      mockUseAuth.mockReturnValue({
        user: passwordUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      expect(
        screen.getByPlaceholderText('Enter current password')
      ).toBeInTheDocument()
      expect(
        screen.queryByText(/signed in with a social provider/i)
      ).not.toBeInTheDocument()
    })

    it('hides the password form for social-only accounts', () => {
      const socialUser = {
        ...mockUser,
        identities: [{ provider: 'google' }],
      } as unknown as User

      mockUseAuth.mockReturnValue({
        user: socialUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      expect(
        screen.getByText(/signed in with a social provider/i)
      ).toBeInTheDocument()
      expect(
        screen.queryByPlaceholderText('Enter current password')
      ).not.toBeInTheDocument()
    })

    it('keeps the password form when identities is empty but app_metadata reports the email provider', () => {
      // Regression: some GoTrue configs return an empty `identities` array for a
      // genuine email/password account while still reporting provider 'email' in
      // app_metadata. An empty array is truthy, so the old `identities.some()`
      // check classified these users as social-only and hid the form, locking a
      // real password user out of changing their password. app_metadata evidence
      // must keep the form visible.
      const passwordUser = {
        ...mockUser,
        identities: [],
        app_metadata: { provider: 'email', providers: ['email'] },
      } as unknown as User

      mockUseAuth.mockReturnValue({
        user: passwordUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      expect(
        screen.getByPlaceholderText('Enter current password')
      ).toBeInTheDocument()
      expect(
        screen.queryByText(/signed in with a social provider/i)
      ).not.toBeInTheDocument()
    })

    it('keeps the password form when there is no provider evidence at all', () => {
      // Empty identities AND no app_metadata providers is not positive evidence
      // of a social-only account, so we preserve the form rather than risk
      // hiding it from a password user.
      const noEvidenceUser = {
        ...mockUser,
        identities: [],
      } as unknown as User

      mockUseAuth.mockReturnValue({
        user: noEvidenceUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      expect(
        screen.getByPlaceholderText('Enter current password')
      ).toBeInTheDocument()
    })

    it('hides the password form when app_metadata reports only a social provider', () => {
      // Positive evidence of social-only (provider google, no email anywhere)
      // even when identities is empty.
      const socialUser = {
        ...mockUser,
        identities: [],
        app_metadata: { provider: 'google', providers: ['google'] },
      } as unknown as User

      mockUseAuth.mockReturnValue({
        user: socialUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      expect(
        screen.getByText(/signed in with a social provider/i)
      ).toBeInTheDocument()
      expect(
        screen.queryByPlaceholderText('Enter current password')
      ).not.toBeInTheDocument()
    })

    it('keeps the password form when identities are unavailable', () => {
      // mockUser has no `identities` field — we preserve the form rather than
      // misclassify the account as social-only.
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      expect(
        screen.getByPlaceholderText('Enter current password')
      ).toBeInTheDocument()
    })
  })

  describe('Responsive Layout', () => {
    it('renders with proper container classes for mobile', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      const { container } = render(<ProfilePage />)

      const mainContainer = container.querySelector('.container')
      expect(mainContainer).toHaveClass('mx-auto', 'max-w-4xl')
    })
  })

  describe('Profile Update Error Handling', () => {
    it('shows error toast when profile update fails', async () => {
      const user = userEvent.setup()
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      mockUpdateUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Update failed'),
      })

      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const nameInput = screen.getByPlaceholderText('Enter your name')
      const saveButton = screen.getAllByText('Save Changes')[0]

      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Name')
      await user.click(saveButton)

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          "Couldn't update your profile",
          {
            description: 'Update failed',
          }
        )
        expect(consoleError).toHaveBeenCalledWith(
          expect.stringContaining('ERROR:'),
          expect.objectContaining({
            error: expect.any(Object),
          })
        )
      })

      consoleError.mockRestore()
    })

    it('shows generic error message for non-Error exceptions during profile update', async () => {
      const user = userEvent.setup()
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      mockUpdateUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'String error' } as any,
      })

      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const nameInput = screen.getByPlaceholderText('Enter your name')
      const saveButton = screen.getAllByText('Save Changes')[0]

      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Name')
      await user.click(saveButton)

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          "Couldn't update your profile",
          {
            description: 'An unexpected error occurred',
          }
        )
      })

      consoleError.mockRestore()
    })
  })

  describe('Password Change Error Handling', () => {
    it('shows error toast when password change fails', async () => {
      const user = userEvent.setup()
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      mockUpdateUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Password update failed'),
      })

      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const currentPasswordInput = screen.getByPlaceholderText(
        'Enter current password'
      )
      const newPasswordInput = screen.getByPlaceholderText('Enter new password')
      const confirmPasswordInput = screen.getByPlaceholderText(
        'Confirm new password'
      )
      const changeButton = screen.getByRole('button', {
        name: 'Change Password',
      })

      await user.type(currentPasswordInput, 'OldPassword123')
      await user.type(newPasswordInput, 'NewPassword123')
      await user.type(confirmPasswordInput, 'NewPassword123')
      await user.click(changeButton)

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          "Couldn't change your password",
          {
            description: 'Password update failed',
          }
        )
        expect(consoleError).toHaveBeenCalledWith(
          expect.stringContaining('ERROR:'),
          expect.objectContaining({
            error: expect.any(Object),
          })
        )
      })

      consoleError.mockRestore()
    })

    it('shows generic error message for non-Error exceptions during password change', async () => {
      const user = userEvent.setup()
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      mockUpdateUser.mockResolvedValue({
        data: { user: null },
        error: { code: 'WEAK_PASSWORD' } as any,
      })

      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const currentPasswordInput = screen.getByPlaceholderText(
        'Enter current password'
      )
      const newPasswordInput = screen.getByPlaceholderText('Enter new password')
      const confirmPasswordInput = screen.getByPlaceholderText(
        'Confirm new password'
      )
      const changeButton = screen.getByRole('button', {
        name: 'Change Password',
      })

      await user.type(currentPasswordInput, 'OldPassword123')
      await user.type(newPasswordInput, 'NewPassword123')
      await user.type(confirmPasswordInput, 'NewPassword123')
      await user.click(changeButton)

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          "Couldn't change your password",
          {
            description: 'An unexpected error occurred',
          }
        )
      })

      consoleError.mockRestore()
    })
  })

  describe('User Field Defaults', () => {
    it('uses empty string when user has no email', () => {
      const userWithoutEmail = {
        ...mockUser,
        email: null,
      } as unknown as User

      mockUseAuth.mockReturnValue({
        user: userWithoutEmail,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const emailInput = screen.getAllByRole('textbox')[1] // Second textbox is email
      expect(emailInput).toHaveValue('')
    })

    it('uses default "User" role when role is unavailable', () => {
      mockUseUserRole.mockReturnValue({ userRole: null })
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      expect(screen.getByDisplayValue('User')).toBeInTheDocument()
    })

    it('uses empty string for name when all metadata is missing', () => {
      const userWithoutMetadata = {
        ...mockUser,
        user_metadata: {},
        email: null,
      } as unknown as User

      mockUseAuth.mockReturnValue({
        user: userWithoutMetadata,
        session: mockSession,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const nameInput = screen.getByPlaceholderText('Enter your name')
      expect(nameInput).toHaveValue('')
    })
  })

  describe('Account Deletion', () => {
    it('renders guarded account deletion controls disabled until confirmation matches', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        logout: mockLogout,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      const deleteButton = screen.getByRole('button', {
        name: /Delete Account/i,
      })
      expect(
        screen.getByText(/tenant history, audit logs/i)
      ).toBeInTheDocument()
      expect(deleteButton).toBeDisabled()

      // The confirmation field is now label-associated (id/htmlFor), so a
      // screen reader announces it; getByLabelText resolves it by accessible name.
      await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE')

      expect(deleteButton).toBeEnabled()
    })

    it('calls the authenticated delete endpoint and logs out on success', async () => {
      const user = userEvent.setup()
      const fetchMock = vi.mocked(fetch)
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'deleted' }),
      } as Response)

      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        logout: mockLogout,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      await user.type(screen.getByPlaceholderText('DELETE'), 'DELETE')
      await user.click(screen.getByRole('button', { name: /Delete Account/i }))

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/auth/account'),
          {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer token-123',
            },
            body: JSON.stringify({ confirmation: 'DELETE' }),
          }
        )
        expect(mockLogout).toHaveBeenCalled()
        expect(mockNavigate).toHaveBeenCalledWith('/auth/login', {
          replace: true,
        })
        expect(trackEventMock).toHaveBeenCalledWith(
          'account_deletion_requested'
        )
        expect(trackEventMock).toHaveBeenCalledWith(
          'account_deletion_completed'
        )
      })
    })

    it('shows backend deletion errors without logging out', async () => {
      const user = userEvent.setup()
      const fetchMock = vi.mocked(fetch)
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({
          detail: 'This account is linked to audit log entries.',
        }),
      } as Response)

      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: mockSession,
        logout: mockLogout,
        isLoading: false,
        isAuthenticated: true,
      })

      render(<ProfilePage />)

      await user.type(screen.getByPlaceholderText('DELETE'), 'DELETE')
      await user.click(screen.getByRole('button', { name: /Delete Account/i }))

      await waitFor(() => {
        expect(
          screen.getByText('This account is linked to audit log entries.')
        ).toBeInTheDocument()
        expect(mockToast.error).toHaveBeenCalledWith(
          'This account is linked to audit log entries.'
        )
        expect(trackEventMock).toHaveBeenCalledWith(
          'account_deletion_requested'
        )
        expect(trackEventMock).toHaveBeenCalledWith(
          'account_deletion_blocked',
          {
            block_reason: 'audit_history',
          }
        )
        expect(mockLogout).not.toHaveBeenCalled()
      })
    })
  })
})
