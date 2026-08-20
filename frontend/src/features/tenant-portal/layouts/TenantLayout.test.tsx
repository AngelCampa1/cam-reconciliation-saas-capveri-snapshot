/**
 * Tests for TenantLayout component
 *
 * TDD approach: These tests define the expected behavior for the
 * tenant portal layout with sidebar navigation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TenantLayout } from './TenantLayout'
import * as AuthContext from '@/contexts/AuthContext'
import { UserRole } from '@/types/enums'

// Mock AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// Helper to render with router at specific path
function renderAtPath(path: string, childContent?: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tenant" element={<TenantLayout />}>
          <Route path="dashboard" element={<div>Dashboard Content</div>} />
          <Route path="disputes" element={<div>Disputes Content</div>} />
          <Route
            path="notifications"
            element={<div>Notifications Content</div>}
          />
          <Route path="preferences" element={<div>Preferences Content</div>} />
          {childContent && <Route path="*" element={childContent} />}
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('TenantLayout', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
    // Mock useAuth to return TENANT role
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      userRole: UserRole.TENANT,
      isAdmin: false,
      isOwner: false,
      user: { id: 'test-user' },
    } as ReturnType<typeof AuthContext.useAuth>)
  })

  describe('Sidebar Navigation', () => {
    it('renders sidebar with tenant navigation items', () => {
      renderAtPath('/tenant/dashboard')

      const sidebar = screen.getByTestId('sidebar-desktop')
      expect(sidebar).toBeInTheDocument()

      // Check all tenant nav items are present
      expect(
        within(sidebar).getByTestId('nav-item-dashboard')
      ).toBeInTheDocument()
      expect(
        within(sidebar).getByTestId('nav-item-disputes')
      ).toBeInTheDocument()
      expect(
        within(sidebar).getByTestId('nav-item-notifications')
      ).toBeInTheDocument()
      expect(
        within(sidebar).getByTestId('nav-item-preferences')
      ).toBeInTheDocument()
    })

    it('highlights active nav item based on current route', () => {
      renderAtPath('/tenant/disputes')

      const sidebar = screen.getByTestId('sidebar-desktop')
      const disputesItem = within(sidebar).getByTestId('nav-item-disputes')

      // Active item should have aria-current="page"
      expect(disputesItem).toHaveAttribute('aria-current', 'page')
    })

    it('navigates when nav item is clicked', () => {
      renderAtPath('/tenant/dashboard')

      const sidebar = screen.getByTestId('sidebar-desktop')
      const disputesItem = within(sidebar).getByTestId('nav-item-disputes')

      fireEvent.click(disputesItem)

      // After navigation, disputes content should be visible
      expect(screen.getByText('Disputes Content')).toBeInTheDocument()
    })
  })

  describe('Mobile Navigation', () => {
    it('renders mobile menu toggle button', () => {
      renderAtPath('/tenant/dashboard')

      const menuButton = screen.getByTestId('mobile-menu-toggle')
      expect(menuButton).toBeInTheDocument()
    })

    it('opens mobile sidebar when menu button is clicked', () => {
      renderAtPath('/tenant/dashboard')

      const menuButton = screen.getByTestId('mobile-menu-toggle')
      fireEvent.click(menuButton)

      // Mobile sidebar should become visible
      const mobileSidebar = screen.getByTestId('sidebar-mobile')
      expect(mobileSidebar).not.toHaveAttribute('aria-hidden', 'true')
    })

    it('closes mobile sidebar when overlay is clicked', () => {
      renderAtPath('/tenant/dashboard')

      // Open mobile menu
      const menuButton = screen.getByTestId('mobile-menu-toggle')
      fireEvent.click(menuButton)

      // Click overlay to close
      const overlay = screen.getByTestId('sidebar-overlay')
      fireEvent.click(overlay)

      // Mobile sidebar should be hidden
      const mobileSidebar = screen.getByTestId('sidebar-mobile')
      expect(mobileSidebar).toHaveAttribute('aria-hidden', 'true')
    })
  })

  describe('Layout Structure', () => {
    it('renders child routes via Outlet', () => {
      renderAtPath('/tenant/dashboard')

      expect(screen.getByText('Dashboard Content')).toBeInTheDocument()
    })

    it('renders header with portal title', () => {
      renderAtPath('/tenant/dashboard')

      const header = screen.getByRole('banner')
      expect(header).toBeInTheDocument()
      expect(within(header).getByText(/tenant portal/i)).toBeInTheDocument()
    })

    it('main content area has proper layout classes', () => {
      renderAtPath('/tenant/dashboard')

      // TenantLayout renders the content region as a <div>; the single <main>
      // landmark is provided app-wide by App.tsx (#main-content), so we query
      // the content region by test id rather than by the main role.
      const content = screen.getByTestId('tenant-content')
      expect(content).toBeInTheDocument()
      // Main content should be offset for sidebar on desktop
      expect(content).toHaveClass('md:ml-64')
    })
  })
})
