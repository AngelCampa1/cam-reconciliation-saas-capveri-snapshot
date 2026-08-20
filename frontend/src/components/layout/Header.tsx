import * as React from 'react'
import {
  Menu,
  User,
  ChevronDown,
  LogOut,
  Settings,
  HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'

export interface HeaderProps {
  /** Callback when hamburger menu is clicked (mobile only) */
  onMenuClick?: (() => void) | undefined
  /** Whether the mobile nav drawer is currently open (drives the hamburger's
   *  aria-expanded so screen readers announce the toggle state) */
  mobileMenuOpen?: boolean | undefined
  /** User display name for the avatar/menu */
  userName?: string | undefined
  /** User email for display in dropdown */
  userEmail?: string | undefined
  /** Callback when logout is clicked */
  onLogout?: (() => void) | undefined
  /** Callback when settings is clicked */
  onSettings?: (() => void) | undefined
  /** Callback when logo is clicked (navigate to home/dashboard) */
  onLogoClick?: (() => void) | undefined
  /** Callback when help is clicked */
  onHelp?: (() => void) | undefined
  /** Additional CSS classes */
  className?: string | undefined
}

/**
 * Application header component with logo, hamburger menu (mobile), and user menu.
 *
 * Features:
 * - 64px consistent height
 * - Logo/app name on left
 * - Hamburger menu button (visible on mobile)
 * - User avatar with dropdown menu on right
 */
export function Header({
  onMenuClick,
  mobileMenuOpen,
  userName = 'User',
  userEmail,
  onLogout,
  onSettings,
  onLogoClick,
  onHelp,
  className,
}: HeaderProps) {
  const [isUserMenuOpen, setIsUserMenuOpen] = React.useState(false)
  const userMenuRef = React.useRef<HTMLDivElement>(null)

  // Close user menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close user menu on escape key
  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-sticky flex h-16 shrink-0 items-center justify-between',
        'px-4 md:px-6 lg:px-8',
        'border-b border-border-subtle bg-card/95 shadow-sm backdrop-blur-sm',
        'transition-colors duration-normal',
        'relative',
        className
      )}
    >
      {/* Left side: Hamburger menu (mobile) + Logo */}
      <div className="flex items-center gap-4 md:gap-6">
        {/* Hamburger menu - visible on mobile only */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'md:hidden',
            'hover:bg-surface-hover/80 hover:shadow-sm',
            'transition-all duration-fast'
          )}
          onClick={onMenuClick}
          aria-label="Open menu"
          aria-expanded={Boolean(mobileMenuOpen)}
          aria-controls="mobile-nav-drawer"
          data-testid="mobile-menu-button"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Logo - clickable to navigate home. Mobile only: on md+ the
            sidebar's brand header carries the CapVeri lockup, so showing it
            here too would duplicate the wordmark across the top of the app. */}
        <button
          onClick={onLogoClick}
          className={cn(
            'md:hidden',
            'flex items-center gap-3 md:gap-4 rounded-button px-2 py-1.5 -ml-2',
            'transition-all duration-fast ease-out-expo',
            onLogoClick &&
              'hover:bg-surface-hover/50 active:bg-surface-active cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            !onLogoClick && 'cursor-default'
          )}
          aria-label="Go to dashboard"
          data-testid="logo-button"
        >
          <div className="relative">
            <Logo
              size="sm"
              showText={false}
              className="relative z-sticky h-9 w-9"
            />
          </div>

          {/* Brand name only; the sidebar carries the full "CRE FinOps"
              lockup on desktop, so repeating the subtitle here is redundant. */}
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-base font-semibold tracking-tight sm:text-lg">
              CapVeri
            </span>
          </div>
        </button>
      </div>

      {/* Right side: Theme toggle + User menu */}
      <div className="flex items-center gap-2">
        {onHelp && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onHelp}
            aria-label="Open help guide"
            data-testid="header-help-button"
            className="hover:bg-surface-hover"
          >
            <HelpCircle className="h-5 w-5" />
          </Button>
        )}
        <div className="relative" ref={userMenuRef}>
          <Button
            variant="ghost"
            className={cn(
              'flex items-center gap-2.5 px-3 py-2',
              'rounded-button',
              'hover:bg-surface-hover hover:shadow-sm',
              'active:bg-surface-active active:shadow-none',
              'transition-colors duration-normal',
              'border border-transparent hover:border-border-subtle'
            )}
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            aria-expanded={isUserMenuOpen}
            aria-haspopup="menu"
            aria-label="User menu"
            data-testid="user-menu-button"
          >
            {/* Avatar */}
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full',
                'bg-primary/10 text-muted-foreground ring-1 ring-border-subtle',
                'transition-all duration-fast',
                isUserMenuOpen &&
                  'ring-primary/40 ring-offset-2 ring-offset-background'
              )}
            >
              <User className="h-4 w-4" />
            </div>
            {/* Name (hidden on small screens) */}
            <span className="hidden text-sm font-medium text-foreground sm:inline">
              {userName}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform duration-fast',
                isUserMenuOpen && 'rotate-180 text-foreground'
              )}
              aria-hidden="true"
            />
          </Button>

          {/* Dropdown menu */}
          {isUserMenuOpen && (
            <div
              className={cn(
                'absolute right-0 top-full z-dropdown mt-2 w-64',
                'rounded-xl border border-border-subtle',
                'bg-popover shadow-lg',
                'animate-scale-in origin-top-right',
                'ring-1 ring-border-subtle/50'
              )}
              role="menu"
              aria-orientation="vertical"
              aria-label="User account menu"
              data-testid="user-menu-dropdown"
            >
              {/* User info section */}
              <div
                className={cn(
                  'rounded-t-xl border-b border-border-subtle px-5 py-4',
                  'bg-surface-raised'
                )}
              >
                <p className="truncate text-sm font-semibold text-foreground tracking-tight">
                  {userName}
                </p>
                {userEmail && (
                  <p className="mt-1 truncate text-xs text-muted-foreground font-medium">
                    {userEmail}
                  </p>
                )}
              </div>

              {/* Menu items */}
              <div className="p-2">
                {onSettings && (
                  <button
                    className={cn(
                      'flex min-h-[40px] w-full items-center gap-3 rounded-button px-4 py-2.5',
                      'text-sm font-medium text-foreground',
                      'transition-all duration-fast ease-out-expo',
                      'hover:bg-surface-hover hover:shadow-sm',
                      'focus-visible:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                    )}
                    onClick={() => {
                      onSettings()
                      setIsUserMenuOpen(false)
                    }}
                    role="menuitem"
                    data-testid="settings-button"
                  >
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    Settings
                  </button>
                )}
                {onLogout && (
                  <button
                    className={cn(
                      'flex min-h-[40px] w-full items-center gap-3 rounded-button px-4 py-2.5 mt-1',
                      'text-sm font-medium text-destructive',
                      'transition-all duration-fast ease-out-expo',
                      'hover:bg-destructive/10 hover:shadow-sm',
                      'focus-visible:bg-destructive/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2'
                    )}
                    onClick={() => {
                      onLogout()
                      setIsUserMenuOpen(false)
                    }}
                    role="menuitem"
                    data-testid="logout-button"
                  >
                    <LogOut className="h-4 w-4" />
                    Log out
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
