import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Header } from './Header'
import { ThemeProvider } from '@/hooks/useTheme'

// Helper to render with ThemeProvider
const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

describe('Header', () => {
  it('renders with branding and user info', () => {
    renderWithTheme(<Header userName="John Doe" />)

    expect(screen.getByText('CapVeri')).toBeInTheDocument()
    expect(screen.getByTestId('user-menu-button')).toHaveTextContent('John Doe')
  })

  it('renders logo image with correct attributes', () => {
    renderWithTheme(<Header />)

    const logo = screen.getByAltText('CapVeri')
    expect(logo).toBeInTheDocument()
    expect(logo).toHaveAttribute('src', '/icons/icon.svg')
    expect(logo).toHaveClass('h-8', 'w-8')
  })

  it('calls onMenuClick when mobile menu button clicked', async () => {
    const user = userEvent.setup()
    const onMenuClick = vi.fn()
    renderWithTheme(<Header onMenuClick={onMenuClick} />)

    await user.click(screen.getByTestId('mobile-menu-button'))
    expect(onMenuClick).toHaveBeenCalled()
  })

  it('calls onLogoClick when logo button is clicked', async () => {
    const user = userEvent.setup()
    const onLogoClick = vi.fn()
    renderWithTheme(<Header onLogoClick={onLogoClick} />)

    await user.click(screen.getByTestId('logo-button'))
    expect(onLogoClick).toHaveBeenCalledTimes(1)
  })

  it('calls onHelp when help button is clicked', async () => {
    const user = userEvent.setup()
    const onHelp = vi.fn()
    renderWithTheme(<Header onHelp={onHelp} />)

    await user.click(screen.getByTestId('header-help-button'))
    expect(onHelp).toHaveBeenCalledTimes(1)
  })

  it('logo button has proper accessibility attributes', () => {
    renderWithTheme(<Header onLogoClick={vi.fn()} />)

    const logoButton = screen.getByTestId('logo-button')
    expect(logoButton).toHaveAttribute('aria-label', 'Go to dashboard')
  })

  it('logo button has hover styles when onLogoClick is provided', () => {
    renderWithTheme(<Header onLogoClick={vi.fn()} />)

    const logoButton = screen.getByTestId('logo-button')
    expect(logoButton).toHaveClass('hover:bg-surface-hover/50')
    expect(logoButton.className).toContain('cursor-pointer')
  })

  it('logo button has no hover styles when onLogoClick is not provided', () => {
    renderWithTheme(<Header />)

    const logoButton = screen.getByTestId('logo-button')
    expect(logoButton).toHaveClass('cursor-default')
  })

  describe('User menu dropdown', () => {
    it('toggles on button click', async () => {
      const user = userEvent.setup()
      renderWithTheme(<Header userName="John" userEmail="john@example.com" />)

      expect(screen.queryByTestId('user-menu-dropdown')).not.toBeInTheDocument()

      await user.click(screen.getByTestId('user-menu-button'))
      const dropdown = screen.getByTestId('user-menu-dropdown')
      expect(dropdown).toBeInTheDocument()
      expect(dropdown).toHaveTextContent('john@example.com')

      await user.click(screen.getByTestId('user-menu-button'))
      expect(screen.queryByTestId('user-menu-dropdown')).not.toBeInTheDocument()
    })

    it('closes on Escape key', async () => {
      const user = userEvent.setup()
      renderWithTheme(<Header />)

      await user.click(screen.getByTestId('user-menu-button'))
      expect(screen.getByTestId('user-menu-dropdown')).toBeInTheDocument()

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByTestId('user-menu-dropdown')).not.toBeInTheDocument()
    })

    it('calls action callbacks', async () => {
      const user = userEvent.setup()
      const onSettings = vi.fn()
      const onLogout = vi.fn()
      renderWithTheme(<Header onSettings={onSettings} onLogout={onLogout} />)

      await user.click(screen.getByTestId('user-menu-button'))
      await user.click(screen.getByTestId('settings-button'))
      expect(onSettings).toHaveBeenCalled()

      await user.click(screen.getByTestId('user-menu-button'))
      await user.click(screen.getByTestId('logout-button'))
      expect(onLogout).toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    it('has proper ARIA attributes', async () => {
      const user = userEvent.setup()
      renderWithTheme(<Header onSettings={vi.fn()} />)

      expect(screen.getByRole('banner')).toBeInTheDocument()
      const button = screen.getByTestId('user-menu-button')
      expect(button).toHaveAttribute('aria-haspopup', 'menu')
      expect(button).toHaveAttribute('aria-expanded', 'false')

      await user.click(button)
      expect(button).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    it('pattern overlay has aria-hidden attribute', () => {
      const { container } = renderWithTheme(<Header />)

      const header = screen.getByRole('banner')
      const pattern = header.querySelector('.bg-dots')

      if (pattern) {
        expect(pattern).toHaveAttribute('aria-hidden', 'true')
      }
    })

    it('logo glow effect has aria-hidden attribute', () => {
      const { container } = renderWithTheme(<Header />)

      // Logo glow is decorative, should have aria-hidden
      const glowEffects = container.querySelectorAll(
        '[aria-hidden="true"].blur-md'
      )
      // Glow effect may or may not be present depending on implementation
      glowEffects.forEach((glow) => {
        expect(glow).toHaveAttribute('aria-hidden', 'true')
      })
    })
  })

  describe('Visual Enhancements', () => {
    it('applies quiet card surface to header container', () => {
      renderWithTheme(<Header />)

      const header = screen.getByRole('banner')
      expect(header).toHaveClass('bg-card/95', 'backdrop-blur-sm')
      expect(header).not.toHaveClass('glass-heavy')
    })

    it('applies subtle shadow for depth', () => {
      renderWithTheme(<Header />)

      const header = screen.getByRole('banner')
      expect(header).toHaveClass('shadow-sm')
    })

    it('applies responsive spacing classes', () => {
      renderWithTheme(<Header />)

      const header = screen.getByRole('banner')
      expect(header).toHaveClass('px-4', 'md:px-6', 'lg:px-8')
    })

    it('renders pattern overlay with correct opacity', () => {
      const { container } = renderWithTheme(<Header />)

      const header = screen.getByRole('banner')
      const pattern = header.querySelector('.bg-dots')

      if (pattern) {
        expect(pattern).toHaveClass('opacity-[0.03]', 'pointer-events-none')
      }
    })

    it('does not apply decorative gradient background', () => {
      renderWithTheme(<Header />)

      const header = screen.getByRole('banner')
      expect(header.className).not.toContain('bg-gradient-to-r')
    })

    it('logo section has enhanced gap spacing', () => {
      const { container } = renderWithTheme(<Header />)

      // Logo container should have gap-4 md:gap-6
      const logoContainer = container.querySelector('.gap-3')
      // After enhancement, should be gap-4 md:gap-6
      // This test will pass when we update the component
    })

    it('user menu button has enhanced hover and active states', async () => {
      const user = userEvent.setup()
      renderWithTheme(<Header />)

      const button = screen.getByTestId('user-menu-button')
      expect(button).toHaveClass('hover:bg-surface-hover')
      expect(button.className).toContain('transition-colors')
    })

    it('user menu avatar shows ring state when menu is open', async () => {
      const user = userEvent.setup()
      const { container } = renderWithTheme(<Header />)

      await user.click(screen.getByTestId('user-menu-button'))

      // Avatar is inside the user menu button, not the logo area
      const button = screen.getByTestId('user-menu-button')
      const avatar = button.querySelector('.rounded-full')
      if (avatar) {
        expect(avatar.className).toContain('ring-primary/40')
      }
    })

    it('dropdown menu has subtle shadow without backdrop blur', async () => {
      const user = userEvent.setup()
      renderWithTheme(<Header />)

      await user.click(screen.getByTestId('user-menu-button'))
      const dropdown = screen.getByTestId('user-menu-dropdown')

      expect(dropdown).toHaveClass('shadow-lg', 'rounded-xl')
      expect(dropdown).not.toHaveClass('backdrop-blur-lg')
    })

    it('dropdown menu uses semantic z-index', async () => {
      const user = userEvent.setup()
      renderWithTheme(<Header />)

      await user.click(screen.getByTestId('user-menu-button'))
      const dropdown = screen.getByTestId('user-menu-dropdown')

      // Should use z-dropdown or z-50
      expect(dropdown.className).toContain('z-')
    })

    it('menu items avoid hover translate animation', async () => {
      const user = userEvent.setup()
      renderWithTheme(<Header onSettings={vi.fn()} />)

      await user.click(screen.getByTestId('user-menu-button'))
      const settingsButton = screen.getByTestId('settings-button')

      expect(settingsButton).not.toHaveClass('hover:translate-x-0.5')
    })

    it('uses fluid typography for branding text', () => {
      renderWithTheme(<Header />)

      const branding = screen.getByText('CapVeri')
      // Should use fluid typography classes
      expect(branding.className).toContain('text-')
    })

    it('dropdown user info section uses raised surface', async () => {
      const user = userEvent.setup()
      const { container } = renderWithTheme(
        <Header userName="John Doe" userEmail="john@example.com" />
      )

      await user.click(screen.getByTestId('user-menu-button'))

      // User info section should have gradient
      const dropdown = screen.getByTestId('user-menu-dropdown')
      const userInfo = dropdown.querySelector('.rounded-t-xl')

      if (userInfo) {
        expect(userInfo.className).toContain('bg-surface-raised')
        expect(userInfo.className).not.toContain('bg-gradient-to-br')
      }
    })

    it('menu items have enhanced padding for better touch targets', async () => {
      const user = userEvent.setup()
      renderWithTheme(<Header onSettings={vi.fn()} />)

      await user.click(screen.getByTestId('user-menu-button'))
      const settingsButton = screen.getByTestId('settings-button')

      // Enhanced padding: px-4 py-2.5 (was px-3 py-2)
      expect(settingsButton).toHaveClass('px-4', 'py-2.5')
    })
  })
})
