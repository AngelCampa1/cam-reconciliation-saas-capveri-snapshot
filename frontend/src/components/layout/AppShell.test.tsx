import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { Home, Settings } from 'lucide-react'
import { AppShell } from './AppShell'
import type { NavItem } from './Sidebar'
import { ThemeProvider } from '@/hooks/useTheme'

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: { id: 'user-123', email: 'john@example.com' },
    isLoading: false,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}))

const mockNavItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home, href: '/' },
  { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
]

// Helper to render with all necessary providers
const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <ThemeProvider>{ui}</ThemeProvider>
    </BrowserRouter>
  )
}

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.style.overflow = ''
  })

  it('renders all layout components', () => {
    renderWithProviders(<AppShell userName="John">Content</AppShell>)

    expect(screen.getByTestId('app-shell')).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-desktop')).toBeInTheDocument()
    expect(screen.getByTestId('main-content')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
    expect(screen.getByText('John')).toBeInTheDocument()
  })

  it('passes navItems and marks active item', () => {
    renderWithProviders(
      <AppShell navItems={mockNavItems} activeNavId="home">
        Content
      </AppShell>
    )

    const desktop = screen.getByTestId('sidebar-desktop')
    expect(within(desktop).getByTestId('nav-item-home')).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('sidebar starts expanded by default', () => {
    renderWithProviders(<AppShell>Content</AppShell>)
    const sidebar = screen.getByTestId('sidebar-desktop')
    expect(sidebar).toHaveClass('w-64')
  })

  it('handles mobile menu open/close', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AppShell>Content</AppShell>)

    await user.click(screen.getByTestId('mobile-menu-button'))
    expect(screen.getByTestId('sidebar-mobile')).toHaveClass('translate-x-0')

    await user.click(screen.getByTestId('sidebar-overlay'))
    expect(screen.getByTestId('sidebar-mobile')).toHaveClass(
      '-translate-x-full'
    )
  })

  it('calls navigation and header callbacks', async () => {
    const user = userEvent.setup()
    const onNavItemClick = vi.fn()
    const onLogout = vi.fn()

    renderWithProviders(
      <AppShell
        navItems={mockNavItems}
        onNavItemClick={onNavItemClick}
        onLogout={onLogout}
      >
        Content
      </AppShell>
    )

    const desktop = screen.getByTestId('sidebar-desktop')
    await user.click(within(desktop).getByTestId('nav-item-home'))
    expect(onNavItemClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'home' })
    )

    await user.click(screen.getByTestId('user-menu-button'))
    await user.click(screen.getByTestId('logout-button'))
    expect(onLogout).toHaveBeenCalled()
  })

  it('controls content padding via contentPadded prop', () => {
    const { rerender } = renderWithProviders(
      <AppShell contentPadded={true}>Content</AppShell>
    )
    expect(screen.getByTestId('main-content')).toHaveClass('p-4')

    rerender(
      <BrowserRouter>
        <ThemeProvider>
          <AppShell contentPadded={false}>Content</AppShell>
        </ThemeProvider>
      </BrowserRouter>
    )
    expect(screen.getByTestId('main-content')).not.toHaveClass('p-4')
  })

  describe('Visual Enhancements', () => {
    it('does not render decorative mesh overlay', () => {
      renderWithProviders(<AppShell>Content</AppShell>)
      const appShell = screen.getByTestId('app-shell')
      const meshOverlay = appShell.querySelector('.bg-gradient-mesh')
      expect(meshOverlay).not.toBeInTheDocument()
    })

    it('applies relative positioning for mesh overlay', () => {
      renderWithProviders(<AppShell>Content</AppShell>)
      const appShell = screen.getByTestId('app-shell')
      expect(appShell).toHaveClass('relative')
    })

    it('main content area has proper z-index layering', () => {
      const { container } = renderWithProviders(<AppShell>Content</AppShell>)
      const appShell = screen.getByTestId('app-shell')
      // Main area wrapper should have semantic z-index
      const mainArea = appShell.querySelector('.z-sticky.flex.flex-1.flex-col')
      expect(mainArea).toBeInTheDocument()
      expect(mainArea).toHaveClass('relative', 'z-sticky')
    })

    it('applies smooth color transitions to root', () => {
      renderWithProviders(<AppShell>Content</AppShell>)
      const appShell = screen.getByTestId('app-shell')
      expect(appShell.className).toContain('transition-colors')
      expect(appShell.className).toContain('duration-normal')
    })

    it('keeps the app shell background quiet', () => {
      renderWithProviders(<AppShell>Content</AppShell>)
      const appShell = screen.getByTestId('app-shell')
      expect(appShell).toHaveClass('bg-background')
      expect(
        appShell.querySelector('.bg-gradient-mesh')
      ).not.toBeInTheDocument()
    })
  })
})
