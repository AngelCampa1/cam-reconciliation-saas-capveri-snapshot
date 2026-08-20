/**
 * Tests for PermissionDenied page
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { PermissionDeniedPage } from './PermissionDenied'
import * as AuthContext from '@/contexts/AuthContext'
import { UserRole } from '@/types/enums'

// Mock AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>)
}

describe('PermissionDeniedPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders permission denied heading', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      userRole: UserRole.VIEWER,
      isAdmin: false,
      isOwner: false,
    } as any)

    renderWithRouter(<PermissionDeniedPage />)

    expect(screen.getByText('Permission Denied')).toBeInTheDocument()
  })

  it('renders descriptive message', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      userRole: UserRole.VIEWER,
      isAdmin: false,
      isOwner: false,
    } as any)

    renderWithRouter(<PermissionDeniedPage />)

    expect(
      screen.getByText("You don't have permission to access this page.")
    ).toBeInTheDocument()
  })

  it('displays current user role', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      userRole: UserRole.MEMBER,
      isAdmin: false,
      isOwner: false,
    } as any)

    renderWithRouter(<PermissionDeniedPage />)

    expect(screen.getByText(/Your role:/i)).toBeInTheDocument()
    expect(screen.getByText(/member/i)).toBeInTheDocument()
  })

  it('displays "Unknown" when userRole is null', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      userRole: null,
      isAdmin: false,
      isOwner: false,
    } as any)

    renderWithRouter(<PermissionDeniedPage />)

    expect(screen.getByText(/Your role:/i)).toBeInTheDocument()
    expect(screen.getByText(/Unknown/i)).toBeInTheDocument()
  })

  it('renders ShieldAlert icon', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      userRole: UserRole.VIEWER,
      isAdmin: false,
      isOwner: false,
    } as any)

    const { container } = renderWithRouter(<PermissionDeniedPage />)

    // Check for SVG with ShieldAlert characteristics
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('renders Go Back button', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      userRole: UserRole.VIEWER,
      isAdmin: false,
      isOwner: false,
    } as any)

    renderWithRouter(<PermissionDeniedPage />)

    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument()
  })

  it('renders Go to Dashboard button', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      userRole: UserRole.VIEWER,
      isAdmin: false,
      isOwner: false,
    } as any)

    renderWithRouter(<PermissionDeniedPage />)

    expect(
      screen.getByRole('button', { name: /go to dashboard/i })
    ).toBeInTheDocument()
  })

  it('calls navigate(-1) when Go Back button clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      userRole: UserRole.VIEWER,
      isAdmin: false,
      isOwner: false,
    } as any)

    renderWithRouter(<PermissionDeniedPage />)

    await user.click(screen.getByRole('button', { name: /go back/i }))

    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('calls navigate("/dashboard") when Go to Dashboard button clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      userRole: UserRole.VIEWER,
      isAdmin: false,
      isOwner: false,
    } as any)

    renderWithRouter(<PermissionDeniedPage />)

    await user.click(screen.getByRole('button', { name: /go to dashboard/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('navigates a tenant to /tenant/dashboard, not the landlord /dashboard (no 403 loop)', async () => {
    const user = userEvent.setup()
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      userRole: UserRole.TENANT,
      isAdmin: false,
      isOwner: false,
    } as any)

    renderWithRouter(<PermissionDeniedPage />)

    await user.click(screen.getByRole('button', { name: /go to dashboard/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/tenant/dashboard')
  })

  // Every non-tenant role lands on the landlord /dashboard. Pins the
  // isTenantUser check so a broader exclusion can't silently regress it.
  it.each([UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER])(
    'navigates a %s to the landlord /dashboard',
    async (role) => {
      const user = userEvent.setup()
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: role,
        isAdmin: false,
        isOwner: false,
      } as any)

      renderWithRouter(<PermissionDeniedPage />)

      await user.click(screen.getByRole('button', { name: /go to dashboard/i }))

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    }
  )
})
