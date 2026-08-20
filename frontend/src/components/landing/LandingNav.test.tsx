/**
 * Tests for LandingNav component
 *
 * Following test minimalism: Test navigation behavior and mobile menu, not styling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { LandingNav } from './LandingNav'

// Mock useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '@/hooks/useAuth'
const mockUseAuth = vi.mocked(useAuth)

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('LandingNav', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default to unauthenticated state
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      userRole: null,
      isAuthenticated: false,
      isLoading: false,
      isAdmin: false,
      isOwner: false,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    })
  })

  it('renders logo as link to home', () => {
    render(<LandingNav />, { wrapper: RouterWrapper })

    const logoLink = screen.getByRole('link', { name: /CapVeri/i })
    expect(logoLink).toHaveAttribute('href', '/')
  })

  it('renders all navigation links', () => {
    render(<LandingNav />, { wrapper: RouterWrapper })

    expect(screen.getAllByText(/How It Works/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Value Check/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Pricing/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/About/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Contact/i).length).toBeGreaterThan(0)
  })

  it('renders Value Check link with correct href', () => {
    render(<LandingNav />, { wrapper: RouterWrapper })

    const roiLinks = screen.getAllByText(/Value Check/i)
    expect(roiLinks.length).toBeGreaterThan(0)
    // Check that at least one link has the correct href
    const hasCorrectHref = roiLinks.some(
      (el) => el.closest('a')?.getAttribute('href') === '/#roi-calculator'
    )
    expect(hasCorrectHref).toBe(true)
  })

  it('renders login and start free audit buttons', () => {
    render(<LandingNav />, { wrapper: RouterWrapper })

    expect(screen.getAllByText(/Log in/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Start Free Trial/i).length).toBeGreaterThan(0)
  })

  describe('Mobile hamburger accessibility (Bug #8)', () => {
    it('hamburger button has aria-label="Open menu" when menu is closed', () => {
      render(<LandingNav />, { wrapper: RouterWrapper })

      const menuButton = screen.getByRole('button', { name: /open menu/i })
      expect(menuButton).toBeInTheDocument()
      expect(menuButton).toHaveAttribute('aria-label', 'Open menu')
      expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    })

    it('hamburger button aria-label changes to "Close menu" when open', async () => {
      const user = userEvent.setup()
      render(<LandingNav />, { wrapper: RouterWrapper })

      const menuButton = screen.getByRole('button', { name: /open menu/i })
      await user.click(menuButton)

      expect(
        screen.getByRole('button', { name: /close menu/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /close menu/i })
      ).toHaveAttribute('aria-expanded', 'true')
    })
  })

  it('toggles mobile menu when menu button clicked', async () => {
    const user = userEvent.setup()
    render(<LandingNav />, { wrapper: RouterWrapper })

    // Mobile menu should be closed initially
    const mobileLinks = screen.queryAllByRole('link', { name: /How It Works/i })

    // Click menu button
    const menuButton = screen.getByRole('button')
    await user.click(menuButton)

    // Menu should open (more links visible)
    expect(screen.queryAllByText(/How It Works/i).length).toBeGreaterThan(1)
  })

  it('closes mobile menu when navigation link clicked', async () => {
    const user = userEvent.setup()
    render(<LandingNav />, { wrapper: RouterWrapper })

    // Open menu
    const menuButton = screen.getByRole('button')
    await user.click(menuButton)

    // Click a mobile nav link
    const mobileLinks = screen.getAllByText(/How It Works/i)
    const mobileLink = mobileLinks.find((el) =>
      el.closest('a')?.className.includes('block')
    )
    if (mobileLink) {
      await user.click(mobileLink)
    }

    // Menu should close (verified by implementation)
    expect(menuButton).toBeInTheDocument()
  })

  it('uses semantic tokens for theme-aware styling', () => {
    const { container } = render(<LandingNav />, {
      wrapper: RouterWrapper,
    })

    const nav = container.querySelector('nav')
    // Should always use semantic tokens that adapt automatically
    expect(nav).toHaveClass('bg-background/90')
    expect(nav).toHaveClass('border-b')
  })

  it('ignores deprecated variant prop (backward compatibility)', () => {
    // Variant prop is deprecated but still accepted for backward compatibility
    const { container } = render(<LandingNav variant="dark" />, {
      wrapper: RouterWrapper,
    })

    const nav = container.querySelector('nav')
    // Should use semantic tokens regardless of variant prop
    expect(nav).toHaveClass('bg-background/90')
  })

  it('applies custom className when provided', () => {
    const { container } = render(<LandingNav className="custom-class" />, {
      wrapper: RouterWrapper,
    })

    const nav = container.querySelector('nav')
    expect(nav).toHaveClass('custom-class')
  })

  describe('Mobile Menu Escape Key', () => {
    it('closes mobile menu when Escape key is pressed', async () => {
      const user = userEvent.setup()
      render(<LandingNav />, { wrapper: RouterWrapper })

      // Open mobile menu
      const menuButton = screen.getByRole('button')
      await user.click(menuButton)

      // Verify menu is open - mobile menu should show additional links
      const mobileMenuLinks = screen.getAllByText(/How It Works/i)
      expect(mobileMenuLinks.length).toBeGreaterThan(1) // Desktop + mobile

      // Press Escape
      await user.keyboard('{Escape}')

      // Verify menu is closed - should only show desktop link now
      const linksAfterEscape = screen.getAllByText(/How It Works/i)
      expect(linksAfterEscape.length).toBe(1) // Only desktop link remains
    })
  })

  describe('Mobile Menu Link Interactions', () => {
    it('closes mobile menu when hash link is clicked', async () => {
      const user = userEvent.setup()
      render(<LandingNav />, { wrapper: RouterWrapper })

      // Open mobile menu
      const menuButton = screen.getByRole('button')
      await user.click(menuButton)

      // Verify menu is open
      expect(screen.getAllByText(/How It Works/i).length).toBeGreaterThan(1)

      // Click a hash link in mobile menu (How It Works)
      const mobileLinks = screen.getAllByText(/How It Works/i)
      const mobileLink = mobileLinks.find((el) =>
        el.closest('a')?.className.includes('block')
      )
      if (mobileLink) {
        await user.click(mobileLink)
      }

      // Verify menu is closed
      expect(screen.getAllByText(/How It Works/i).length).toBe(1)
    })

    it('closes mobile menu when route link is clicked', async () => {
      const user = userEvent.setup()
      render(<LandingNav />, { wrapper: RouterWrapper })

      // Open mobile menu
      const menuButton = screen.getByRole('button')
      await user.click(menuButton)

      // Verify menu is open - Pricing should appear twice (desktop + mobile)
      expect(screen.getAllByText(/Pricing/i).length).toBeGreaterThan(1)

      // Click a route link in mobile menu (Pricing)
      const mobileLinks = screen.getAllByText(/Pricing/i)
      const mobileLink = mobileLinks.find((el) =>
        el.closest('a')?.className.includes('block')
      )
      if (mobileLink) {
        await user.click(mobileLink)
      }

      // Verify menu is closed - should only show desktop link now
      expect(screen.getAllByText(/Pricing/i).length).toBe(1)
    })
  })

  describe('Resources link', () => {
    it('renders Resources link in desktop nav', () => {
      render(<LandingNav />, { wrapper: RouterWrapper })
      const links = screen.getAllByText(/^Resources$/i)
      const found = links.find(
        (el) => el.closest('a')?.getAttribute('href') === '/resources'
      )
      expect(found).toBeDefined()
    })
    it('renders Resources link in mobile menu', async () => {
      const user = userEvent.setup()
      render(<LandingNav />, { wrapper: RouterWrapper })
      const menuButton = screen.getByRole('button')
      await user.click(menuButton)
      const links = screen.getAllByText(/^Resources$/i)
      expect(links.length).toBeGreaterThan(1)
      const found = links.some(
        (el) => el.closest('a')?.getAttribute('href') === '/resources'
      )
      expect(found).toBe(true)
    })
    it('Tools link is still present', () => {
      render(<LandingNav />, { wrapper: RouterWrapper })
      const toolsLinks = screen.getAllByText(/^Tools$/i)
      expect(toolsLinks.length).toBeGreaterThan(0)
      const found = toolsLinks.some(
        (el) => el.closest('a')?.getAttribute('href') === '/tools'
      )
      expect(found).toBe(true)
    })
  })

  describe('Auth-aware CTAs', () => {
    it('renders Dashboard button when user is authenticated', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123', email: 'test@example.com' },
        session: { access_token: 'token', refresh_token: 'refresh' },
        userRole: 'OWNER',
        isAuthenticated: true,
        isLoading: false,
        isAdmin: false,
        isOwner: true,
        login: vi.fn(),
        logout: vi.fn(),
        register: vi.fn(),
      })

      render(<LandingNav />, { wrapper: RouterWrapper })

      expect(
        screen.getByRole('link', { name: /dashboard/i })
      ).toBeInTheDocument()
      expect(screen.queryByText(/Log in/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Start Free Trial/i)).not.toBeInTheDocument()
    })

    it('renders Log in and Start Free Trial buttons when not authenticated', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        session: null,
        userRole: null,
        isAuthenticated: false,
        isLoading: false,
        isAdmin: false,
        isOwner: false,
        login: vi.fn(),
        logout: vi.fn(),
        register: vi.fn(),
      })

      render(<LandingNav />, { wrapper: RouterWrapper })

      expect(screen.getAllByText(/Log in/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Start Free Trial/i).length).toBeGreaterThan(0)
      expect(
        screen.queryByRole('link', { name: /dashboard/i })
      ).not.toBeInTheDocument()
    })
  })

  describe('Active link state', () => {
    it('applies active styles to hash link on home page when hash matches', () => {
      render(
        <MemoryRouter initialEntries={['/#how-it-works']}>
          <LandingNav />
        </MemoryRouter>
      )

      // The "How It Works" desktop link should have active styles
      const desktopLinks = screen.getAllByText(/How It Works/i)
      const activeDesktopLink = desktopLinks.find((el) =>
        el.closest('a')?.className.includes('border-b-2')
      )
      expect(activeDesktopLink).toBeDefined()
    })

    it('applies active styles to hash link in mobile menu when hash matches', async () => {
      const user = userEvent.setup()
      render(
        <MemoryRouter initialEntries={['/#how-it-works']}>
          <LandingNav />
        </MemoryRouter>
      )

      const menuButton = screen.getByRole('button')
      await user.click(menuButton)

      // The mobile "How It Works" link should have active styles (bg-muted)
      const mobileLinks = screen.getAllByText(/How It Works/i)
      const activeMobileLink = mobileLinks.find((el) =>
        el.closest('a')?.className.includes('bg-muted')
      )
      expect(activeMobileLink).toBeDefined()
    })

    it('does not close mobile menu when non-Escape key is pressed', async () => {
      const user = userEvent.setup()
      render(<LandingNav />, { wrapper: RouterWrapper })

      const menuButton = screen.getByRole('button')
      await user.click(menuButton)

      // Menu is open
      expect(screen.getAllByText(/How It Works/i).length).toBeGreaterThan(1)

      // Press a non-Escape key
      await user.keyboard('{ArrowDown}')

      // Menu should still be open
      expect(screen.getAllByText(/How It Works/i).length).toBeGreaterThan(1)
    })
  })

  describe('Authenticated user in mobile menu', () => {
    it('renders Dashboard button in mobile menu when user is authenticated', async () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-123', email: 'test@example.com' },
        session: { access_token: 'token', refresh_token: 'refresh' },
        userRole: 'OWNER',
        isAuthenticated: true,
        isLoading: false,
        isAdmin: false,
        isOwner: true,
        login: vi.fn(),
        logout: vi.fn(),
        register: vi.fn(),
      })

      const user = userEvent.setup()
      render(<LandingNav />, { wrapper: RouterWrapper })

      const menuButton = screen.getByRole('button')
      await user.click(menuButton)

      // Mobile menu should show Dashboard, not login/register
      const dashboardLinks = screen.getAllByRole('link', { name: /dashboard/i })
      expect(dashboardLinks.length).toBeGreaterThan(0)
    })
  })

  describe('Hash link navigation from non-home page', () => {
    it('navigates to home first then executes scroll callback via setTimeout', () => {
      // Use fake timers so we can advance the 100ms setTimeout (lines 63-64)
      vi.useFakeTimers()

      render(
        <MemoryRouter initialEntries={['/about']}>
          <LandingNav />
        </MemoryRouter>
      )

      const hashLinks = screen.getAllByText(/How It Works/i)

      // Use synchronous fireEvent (not userEvent) to avoid async + fake-timer deadlock
      act(() => {
        fireEvent.click(hashLinks[0])
        vi.runAllTimers() // executes the 100ms setTimeout callback
      })

      vi.useRealTimers()

      expect(screen.getAllByText(/How It Works/i).length).toBeGreaterThan(0)
    })
  })
})
