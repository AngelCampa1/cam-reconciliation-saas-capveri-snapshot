import * as React from 'react'
import { cn } from '@/lib/utils'
import { useSidebarState } from '@/hooks/useSidebarState'
import { Header } from './Header'
import { Sidebar, type NavItem } from './Sidebar'
import { MainContent } from './MainContent'

export interface AppShellProps {
  /** Content to render in the main area */
  children: React.ReactNode
  /** Navigation items for the sidebar */
  navItems?: NavItem[]
  /** Currently active navigation item ID */
  activeNavId?: string
  /** Callback when a nav item is clicked */
  onNavItemClick?: (item: NavItem) => void
  /** User display name for the header */
  userName?: string
  /** User email for display in header dropdown */
  userEmail?: string
  /** Callback when logout is clicked */
  onLogout?: () => void
  /** Callback when settings is clicked */
  onSettings?: () => void
  /** Callback when logo is clicked (navigate to home/dashboard) */
  onLogoClick?: () => void
  /** Whether to add default padding to main content */
  contentPadded?: boolean
  /** Additional CSS classes for the root element */
  className?: string
}

/**
 * Application shell component that provides the main layout structure.
 *
 * Features:
 * - Header with logo, hamburger menu, and user menu
 * - Collapsible sidebar on desktop
 * - Mobile-friendly with overlay sidebar
 * - Independent scrolling for main content
 * - Responsive breakpoints:
 *   - Desktop (>1024px): full sidebar
 *   - Tablet (768-1024px): collapsible sidebar
 *   - Mobile (<768px): hidden sidebar with hamburger
 */
export function AppShell({
  children,
  navItems,
  activeNavId,
  onNavItemClick,
  userName,
  userEmail,
  onLogout,
  onSettings,
  onLogoClick,
  contentPadded = true,
  className,
}: AppShellProps) {
  const { isCollapsed, isMobileMenuOpen, openMobileMenu, closeMobileMenu } =
    useSidebarState()

  // Add isActive flag to nav items based on activeNavId
  const navItemsWithActive = React.useMemo(() => {
    if (!navItems) return undefined
    return navItems.map((item) => ({
      ...item,
      isActive: item.id === activeNavId,
    }))
  }, [navItems, activeNavId])

  // Handle nav item click - close mobile menu and call callback
  const handleNavItemClick = React.useCallback(
    (item: NavItem) => {
      closeMobileMenu()
      onNavItemClick?.(item)
    },
    [closeMobileMenu, onNavItemClick]
  )

  return (
    <div
      className={cn(
        'flex h-screen bg-background',
        'relative',
        'transition-colors duration-normal',
        className
      )}
      data-testid="app-shell"
    >
      {/* Sidebar with proper z-index */}
      <Sidebar
        collapsed={isCollapsed}
        mobileOpen={isMobileMenuOpen}
        onMobileClose={closeMobileMenu}
        navItems={navItemsWithActive}
        onNavItemClick={handleNavItemClick}
      />

      {/* Main area (header + content) with proper z-index layering */}
      <div className="relative z-sticky flex flex-1 flex-col overflow-hidden">
        <Header
          onMenuClick={openMobileMenu}
          mobileMenuOpen={isMobileMenuOpen}
          userName={userName}
          userEmail={userEmail}
          onLogout={onLogout}
          onSettings={onSettings}
          onLogoClick={onLogoClick}
        />
        <MainContent padded={contentPadded}>{children}</MainContent>
      </div>
    </div>
  )
}
