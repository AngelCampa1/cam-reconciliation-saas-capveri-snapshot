/**
 * Tests for NotFoundPage component.
 *
 * Validates 404 error page rendering and navigation.
 * Tests both authenticated and unauthenticated user states.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { NotFoundPage } from './NotFound'
import { UserRole } from '@/types/enums'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock useAuth
const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('NotFoundPage', () => {
  let historyLengthSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Default to unauthenticated state
    mockUseAuth.mockReturnValue({ user: null })
  })

  afterEach(() => {
    // Clean up history length spy if it exists
    if (historyLengthSpy) {
      historyLengthSpy.mockRestore()
    }
  })

  it('renders 404 heading', () => {
    render(<NotFoundPage />, { wrapper: RouterWrapper })

    expect(screen.getByRole('heading', { name: /404/i })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /page not found/i })
    ).toBeInTheDocument()
  })

  it('displays error message', () => {
    render(<NotFoundPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByText(/this page doesn't exist or has moved/i)
    ).toBeInTheDocument()
  })

  it('navigates back when Go Back button is clicked and history exists', async () => {
    const user = userEvent.setup()
    // Spy on window.history.length to indicate there is a page to go back to
    historyLengthSpy = vi.spyOn(window.history, 'length', 'get')
    historyLengthSpy.mockReturnValue(2)

    render(<NotFoundPage />, { wrapper: RouterWrapper })

    const goBackButton = screen.getByRole('button', { name: /go back/i })
    await user.click(goBackButton)

    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('navigates to home when Go Back button is clicked with no history (unauthenticated)', async () => {
    const user = userEvent.setup()
    mockUseAuth.mockReturnValue({ user: null })
    // Spy on window.history.length to indicate this is the first page
    historyLengthSpy = vi.spyOn(window.history, 'length', 'get')
    historyLengthSpy.mockReturnValue(1)

    render(<NotFoundPage />, { wrapper: RouterWrapper })

    const goBackButton = screen.getByRole('button', { name: /go back/i })
    await user.click(goBackButton)

    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('navigates to dashboard when Go Back button is clicked with no history (authenticated)', async () => {
    const user = userEvent.setup()
    mockUseAuth.mockReturnValue({
      user: { id: '123', email: 'test@test.com' },
      userRole: UserRole.OWNER,
    })
    // Spy on window.history.length to indicate this is the first page
    historyLengthSpy = vi.spyOn(window.history, 'length', 'get')
    historyLengthSpy.mockReturnValue(1)

    render(<NotFoundPage />, { wrapper: RouterWrapper })

    const goBackButton = screen.getByRole('button', { name: /go back/i })
    await user.click(goBackButton)

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  describe('unauthenticated users', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({ user: null })
    })

    it('shows Go to Home button', async () => {
      const user = userEvent.setup()
      render(<NotFoundPage />, { wrapper: RouterWrapper })

      const homeButton = screen.getByRole('button', { name: /go to home/i })
      await user.click(homeButton)

      expect(mockNavigate).toHaveBeenCalledWith('/')
    })

    it('renders public quick links', () => {
      render(<NotFoundPage />, { wrapper: RouterWrapper })

      // Check for quick link descriptions which are unique to the cards
      expect(screen.getByText('Go to the home page')).toBeInTheDocument()
      expect(screen.getByText('View our pricing plans')).toBeInTheDocument()
      expect(screen.getByText('Get in touch with us')).toBeInTheDocument()
      expect(screen.getByText('Learn how CapVeri works')).toBeInTheDocument()
    })

    it('activates quick link card navigation when Enter is pressed', () => {
      render(<NotFoundPage />, { wrapper: RouterWrapper })

      const pricingCard = screen.getByRole('button', {
        name: /view our pricing plans/i,
      })
      fireEvent.keyDown(pricingCard, { key: 'Enter' })

      expect(mockNavigate).toHaveBeenCalledWith('/pricing')
    })

    it('navigates to pricing when quick link is clicked', async () => {
      const user = userEvent.setup()
      render(<NotFoundPage />, { wrapper: RouterWrapper })

      // Find by description text which is unique to the quick link card
      const pricingCard = screen
        .getByText('View our pricing plans')
        .closest('div[class*="cursor-pointer"]')
      expect(pricingCard).toBeInTheDocument()

      if (pricingCard) {
        await user.click(pricingCard)
        expect(mockNavigate).toHaveBeenCalledWith('/pricing')
      }
    })
  })

  describe('authenticated users', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: { id: '123', email: 'test@test.com' },
        userRole: UserRole.OWNER,
      })
    })

    it('shows Go to Dashboard button', async () => {
      const user = userEvent.setup()
      render(<NotFoundPage />, { wrapper: RouterWrapper })

      const dashboardButton = screen.getByRole('button', {
        name: /go to dashboard/i,
      })
      await user.click(dashboardButton)

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })

    it('renders authenticated quick links', () => {
      render(<NotFoundPage />, { wrapper: RouterWrapper })

      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Properties')).toBeInTheDocument()
      expect(screen.getByText('Upload Rent Roll')).toBeInTheDocument()
      expect(screen.getByText('Data Ingestion')).toBeInTheDocument()
      expect(screen.queryByText('Extractions')).not.toBeInTheDocument()
    })

    it('navigates to properties when quick link is clicked', async () => {
      const user = userEvent.setup()
      render(<NotFoundPage />, { wrapper: RouterWrapper })

      const propertiesCard = screen
        .getByText('Properties')
        .closest('div[class*="cursor-pointer"]')
      expect(propertiesCard).toBeInTheDocument()

      if (propertiesCard) {
        await user.click(propertiesCard)
        expect(mockNavigate).toHaveBeenCalledWith('/properties')
      }
    })
  })

  describe('tenant users', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: { id: 't1', email: 'tenant@store.com' },
        userRole: UserRole.TENANT,
      })
    })

    it('sends "Go to Dashboard" to the tenant portal, not the landlord /dashboard', async () => {
      const user = userEvent.setup()
      render(<NotFoundPage />, { wrapper: RouterWrapper })

      await user.click(screen.getByRole('button', { name: /go to dashboard/i }))

      expect(mockNavigate).toHaveBeenCalledWith('/tenant/dashboard')
    })

    it('sends the no-history Go Back fallback to the tenant portal', async () => {
      const user = userEvent.setup()
      historyLengthSpy = vi.spyOn(window.history, 'length', 'get')
      historyLengthSpy.mockReturnValue(1)

      render(<NotFoundPage />, { wrapper: RouterWrapper })

      await user.click(screen.getByRole('button', { name: /go back/i }))

      expect(mockNavigate).toHaveBeenCalledWith('/tenant/dashboard')
    })

    it('renders tenant quick links, not the landlord-only ones', () => {
      render(<NotFoundPage />, { wrapper: RouterWrapper })

      expect(screen.getByText('Disputes')).toBeInTheDocument()
      expect(screen.getByText('Notifications')).toBeInTheDocument()
      expect(screen.getByText('Help')).toBeInTheDocument()
      // Landlord routes 403 a tenant, so they must not be offered here.
      expect(screen.queryByText('Properties')).not.toBeInTheDocument()
      expect(screen.queryByText('Upload Rent Roll')).not.toBeInTheDocument()
      expect(screen.queryByText('Data Ingestion')).not.toBeInTheDocument()
    })

    it('navigates to tenant disputes when that quick link is clicked', async () => {
      const user = userEvent.setup()
      render(<NotFoundPage />, { wrapper: RouterWrapper })

      const disputesCard = screen
        .getByText('See your disputes')
        .closest('div[class*="cursor-pointer"]')
      expect(disputesCard).toBeInTheDocument()

      if (disputesCard) {
        await user.click(disputesCard)
        expect(mockNavigate).toHaveBeenCalledWith('/tenant/disputes')
      }
    })
  })

  it('renders support contact link', () => {
    render(<NotFoundPage />, { wrapper: RouterWrapper })

    const supportLink = screen.getByRole('link', { name: /contact support/i })
    expect(supportLink).toBeInTheDocument()
    expect(supportLink).toHaveAttribute(
      'href',
      'mailto:angel.campa@capveri.com'
    )
  })

  it('renders minimal footer for authenticated users', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '123', email: 'test@test.com' },
      userRole: UserRole.OWNER,
    })
    render(<NotFoundPage />, { wrapper: RouterWrapper })

    // Footer should be present with copyright
    expect(screen.getByText(/© 2026 CapVeri/i)).toBeInTheDocument()
    // Minimal footer should have legal links
    expect(
      screen.getByRole('link', { name: /privacy policy/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /terms of service/i })
    ).toBeInTheDocument()
    // Should NOT have marketing content (Product, Resources sections)
    expect(screen.queryByText(/How It Works/i)).not.toBeInTheDocument()
  })

  it('renders full footer for unauthenticated users', () => {
    mockUseAuth.mockReturnValue({ user: null })
    render(<NotFoundPage />, { wrapper: RouterWrapper })

    // Footer should be present with copyright
    expect(screen.getByText(/© 2026 CapVeri/i)).toBeInTheDocument()
    // Full footer should have all sections including marketing
    expect(screen.getByText(/Product/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Resources/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Company/i)).toBeInTheDocument()
  })
})
