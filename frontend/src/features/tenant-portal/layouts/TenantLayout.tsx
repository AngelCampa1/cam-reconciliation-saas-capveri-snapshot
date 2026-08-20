/**
 * Tenant Portal Layout
 *
 * Provides consistent sidebar navigation and structure for tenant-facing pages.
 * Reuses the existing Sidebar component with tenant-specific navigation items.
 */

import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import {
  Home,
  MessageSquareWarning,
  Bell,
  Settings,
  Menu,
  HelpCircle,
} from 'lucide-react'
import { Sidebar, type NavItem } from '@/components/layout/Sidebar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Navigation items for the tenant portal
 */
const tenantNavItems: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Home,
    href: '/tenant/dashboard',
  },
  {
    id: 'disputes',
    label: 'Disputes',
    icon: MessageSquareWarning,
    href: '/tenant/disputes',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    href: '/tenant/notifications',
  },
  {
    id: 'help',
    label: 'Help',
    icon: HelpCircle,
    href: '/tenant/help',
  },
  {
    id: 'preferences',
    label: 'Preferences',
    icon: Settings,
    href: '/tenant/preferences',
  },
]

export function TenantLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar - reusing existing component */}
      <Sidebar
        navItems={tenantNavItems}
        collapsed={false}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Header with mobile menu toggle */}
      <header
        role="banner"
        className={cn(
          'sticky top-0 z-sticky',
          'bg-background/95 backdrop-blur-sm',
          'border-b border-border-subtle',
          'shadow-sm',
          // Offset for sidebar on desktop
          'md:ml-64'
        )}
      >
        <div className="flex h-14 items-center gap-4 px-4 md:px-6">
          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            data-testid="mobile-menu-toggle"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>

          {/* Portal title */}
          <span className="font-semibold text-foreground">Tenant Portal</span>
        </div>
      </header>

      {/* Main content area. App.tsx already renders the single <main
          id="main-content"> landmark that wraps every route, so this is a
          plain <div> to avoid a duplicate main landmark in the tenant portal. */}
      <div
        data-testid="tenant-content"
        className={cn(
          'min-h-[calc(100vh-3.5rem)]',
          // Offset for sidebar on desktop
          'md:ml-64'
        )}
      >
        <Outlet />
      </div>
    </div>
  )
}
