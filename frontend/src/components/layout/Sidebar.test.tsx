import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { Home, Settings, Calculator } from 'lucide-react'
import { Sidebar, type NavItem } from './Sidebar'
import * as AuthContext from '@/contexts/AuthContext'
import { UserRole } from '@/types/enums'

// Helper to render with Router context
function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>)
}

// Mock AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

const mockNavItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home, href: '/' },
  { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
]

const nestedNavItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home, href: '/' },
  {
    id: 'reports',
    label: 'Reports',
    icon: Calculator,
    href: '/reports',
    children: [
      {
        id: 'reports-daily',
        label: 'Daily',
        icon: Calculator,
        href: '/reports/daily',
      },
    ],
  },
]

describe('Sidebar', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
    // Mock useAuth to return OWNER role by default
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      userRole: UserRole.OWNER,
      isAdmin: true,
      isOwner: true,
    } as any)
  })
  afterEach(() => {
    document.body.style.overflow = ''
  })

  describe('Desktop sidebar', () => {
    it('renders with navigation items', () => {
      renderWithRouter(<Sidebar navItems={mockNavItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')
      expect(within(desktop).getByTestId('nav-item-home')).toBeInTheDocument()
      expect(
        within(desktop).getByTestId('nav-item-settings')
      ).toBeInTheDocument()
    })

    it('applies correct width class when collapsed', () => {
      renderWithRouter(<Sidebar collapsed={true} />)
      const sidebar = screen.getByTestId('sidebar-desktop')
      expect(sidebar).toHaveClass('w-16')
    })

    it('applies correct width class when expanded', () => {
      renderWithRouter(<Sidebar collapsed={false} />)
      const sidebar = screen.getByTestId('sidebar-desktop')
      expect(sidebar).toHaveClass('w-64')
    })

    describe('Brand header', () => {
      it('renders the CapVeri logo in expanded state', () => {
        renderWithRouter(<Sidebar collapsed={false} />)
        const desktop = screen.getByTestId('sidebar-desktop')
        expect(
          within(desktop).getByRole('img', { name: 'CapVeri' })
        ).toBeInTheDocument()
      })

      it('shows wordmark text when expanded', () => {
        renderWithRouter(<Sidebar collapsed={false} />)
        const desktop = screen.getByTestId('sidebar-desktop')
        expect(within(desktop).getByText('CapVeri')).toBeInTheDocument()
        // "CRE FinOps" subtitle removed (F-285: contrast failure + internal jargon)
        expect(
          within(desktop).queryByText('CRE FinOps')
        ).not.toBeInTheDocument()
      })

      it('hides wordmark text when collapsed', () => {
        renderWithRouter(<Sidebar collapsed={true} />)
        const desktop = screen.getByTestId('sidebar-desktop')
        expect(
          within(desktop).queryByText('CRE FinOps')
        ).not.toBeInTheDocument()
      })

      it('still renders logo when collapsed', () => {
        renderWithRouter(<Sidebar collapsed={true} />)
        const desktop = screen.getByTestId('sidebar-desktop')
        expect(
          within(desktop).getByRole('img', { name: 'CapVeri' })
        ).toBeInTheDocument()
      })
    })

    it('calls onNavItemClick when leaf item clicked', async () => {
      const user = userEvent.setup()
      const onNavItemClick = vi.fn()
      renderWithRouter(
        <Sidebar navItems={mockNavItems} onNavItemClick={onNavItemClick} />
      )

      const desktop = screen.getByTestId('sidebar-desktop')
      // Leaf items are now <a> links; clicking one fires the side-effect callback.
      await user.click(within(desktop).getByTestId('nav-item-home'))
      expect(onNavItemClick).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockNavItems[0].id,
          label: mockNavItems[0].label,
          href: mockNavItems[0].href,
        })
      )
    })

    it('leaf nav items render as links with the correct href', () => {
      renderWithRouter(<Sidebar navItems={mockNavItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')
      // Leaves must be real anchors so users get ctrl/middle-click and right-click menu.
      const homeLink = within(desktop).getByRole('link', { name: 'Home' })
      expect(homeLink).toHaveAttribute('href', '/')
      const settingsLink = within(desktop).getByRole('link', {
        name: 'Settings',
      })
      expect(settingsLink).toHaveAttribute('href', '/settings')
    })

    it('shows active state for active item', () => {
      const activeNavItems: NavItem[] = [
        { ...mockNavItems[0], isActive: true },
        mockNavItems[1],
      ]
      renderWithRouter(<Sidebar navItems={activeNavItems} />)

      const desktop = screen.getByTestId('sidebar-desktop')
      // Active leaf is a link; aria-current="page" must be on the link element.
      const activeItem = within(desktop).getByTestId('nav-item-home')
      expect(activeItem).toHaveAttribute('aria-current', 'page')
    })

    it('shows document upload and extraction destinations in Documents', async () => {
      const user = userEvent.setup()
      renderWithRouter(<Sidebar />)
      const desktop = screen.getByTestId('sidebar-desktop')

      // "Documents" is a parent with children — clicking it is a disclosure toggle (button).
      await user.click(within(desktop).getByTestId('nav-item-documents'))

      await waitFor(() => {
        expect(
          within(desktop).getByTestId('nav-item-documents-upload-rent-roll')
        ).toBeInTheDocument()
      })
      expect(
        within(desktop).getByTestId('nav-item-documents-extractions')
      ).toBeInTheDocument()
    })

    it('shows Help in the default navigation', () => {
      renderWithRouter(<Sidebar />)
      const desktop = screen.getByTestId('sidebar-desktop')
      expect(within(desktop).getByTestId('nav-item-help')).toBeInTheDocument()
    })
  })

  describe('Mobile sidebar', () => {
    it('shows/hides based on mobileOpen prop', () => {
      const { rerender } = renderWithRouter(<Sidebar mobileOpen={false} />)
      expect(screen.getByTestId('sidebar-mobile')).toHaveClass(
        '-translate-x-full'
      )

      rerender(
        <BrowserRouter>
          <Sidebar mobileOpen={true} />
        </BrowserRouter>
      )
      expect(screen.getByTestId('sidebar-mobile')).toHaveClass('translate-x-0')
    })

    it('calls onMobileClose when overlay clicked', async () => {
      const user = userEvent.setup()
      const onMobileClose = vi.fn()
      renderWithRouter(
        <Sidebar mobileOpen={true} onMobileClose={onMobileClose} />
      )

      await user.click(screen.getByTestId('sidebar-overlay'))
      expect(onMobileClose).toHaveBeenCalled()
    })

    it('closes on Escape key', () => {
      const onMobileClose = vi.fn()
      renderWithRouter(
        <Sidebar mobileOpen={true} onMobileClose={onMobileClose} />
      )
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onMobileClose).toHaveBeenCalled()
    })

    it('prevents body scroll when open', () => {
      const { rerender } = renderWithRouter(<Sidebar mobileOpen={false} />)
      expect(document.body.style.overflow).toBe('')

      rerender(
        <BrowserRouter>
          <Sidebar mobileOpen={true} />
        </BrowserRouter>
      )
      expect(document.body.style.overflow).toBe('hidden')
    })

    it('makes the closed drawer inert so its off-screen buttons are not focusable', () => {
      const { rerender } = renderWithRouter(<Sidebar mobileOpen={false} />)
      // Closed: inert removes the off-screen drawer from the tab order + a11y
      // tree, so a keyboard user can't land on its invisible nav items.
      expect(screen.getByTestId('sidebar-mobile')).toHaveAttribute('inert')

      rerender(
        <BrowserRouter>
          <Sidebar mobileOpen={true} />
        </BrowserRouter>
      )
      expect(screen.getByTestId('sidebar-mobile')).not.toHaveAttribute('inert')
    })

    it('moves focus into the drawer on open and restores it on close', async () => {
      const trigger = document.createElement('button')
      document.body.appendChild(trigger)
      trigger.focus()
      expect(document.activeElement).toBe(trigger)

      const { rerender } = renderWithRouter(<Sidebar mobileOpen={false} />)
      rerender(
        <BrowserRouter>
          <Sidebar mobileOpen={true} />
        </BrowserRouter>
      )
      // On open, focus lands on the first nav item inside the drawer
      // (may be a <button> disclosure toggle or an <a> link leaf).
      await waitFor(() => {
        const drawer = screen.getByTestId('sidebar-mobile')
        expect(drawer.contains(document.activeElement)).toBe(true)
      })

      rerender(
        <BrowserRouter>
          <Sidebar mobileOpen={false} />
        </BrowserRouter>
      )
      // On close, focus returns to whatever opened the drawer.
      await waitFor(() => {
        expect(document.activeElement).toBe(trigger)
      })
      trigger.remove()
    })

    it('traps Tab focus inside the open drawer (wraps last → first)', () => {
      renderWithRouter(<Sidebar mobileOpen={true} navItems={mockNavItems} />)
      const drawer = screen.getByTestId('sidebar-mobile')
      // Collect ALL focusable nav items (mix of <button> and <a> elements).
      const navItems = drawer.querySelectorAll(
        'button[data-testid^="nav-item-"], a[data-testid^="nav-item-"]'
      )
      // The close button also sits in the drawer; get all focusables the trap sees.
      const focusables = drawer.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const last = focusables[focusables.length - 1]!
      last.focus()
      fireEvent.keyDown(drawer, { key: 'Tab' })
      // Forward-tabbing off the last item wraps back to the first focusable.
      expect(document.activeElement).toBe(focusables[0])
      // Sanity: there are nav items in the drawer (both links and buttons).
      expect(navItems.length).toBeGreaterThan(0)
    })
  })

  describe('Nested navigation', () => {
    it('expands children when parent clicked', async () => {
      renderWithRouter(<Sidebar navItems={nestedNavItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')

      expect(
        within(desktop).queryByTestId('nav-item-reports-daily')
      ).not.toBeInTheDocument()

      // "Reports" has children → it is a <button> disclosure toggle.
      fireEvent.click(within(desktop).getByTestId('nav-item-reports'))

      await waitFor(() => {
        expect(
          within(desktop).getByTestId('nav-item-reports-daily')
        ).toBeInTheDocument()
      })
    })

    it('has aria-expanded attribute on parent items (disclosure button)', () => {
      renderWithRouter(<Sidebar navItems={nestedNavItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')
      // Parent with children is a <button> with aria-expanded.
      expect(within(desktop).getByTestId('nav-item-reports')).toHaveAttribute(
        'aria-expanded',
        'false'
      )
    })

    it('auto-expands the parent of the active route on deep link (F-097)', async () => {
      render(
        <MemoryRouter initialEntries={['/reports/daily']}>
          <Sidebar navItems={nestedNavItems} />
        </MemoryRouter>
      )
      const desktop = screen.getByTestId('sidebar-desktop')

      // Child should be visible without any click because its parent
      // section is auto-expanded from the active route.
      await waitFor(() => {
        expect(
          within(desktop).getByTestId('nav-item-reports-daily')
        ).toBeInTheDocument()
      })
      expect(within(desktop).getByTestId('nav-item-reports')).toHaveAttribute(
        'aria-expanded',
        'true'
      )
    })
  })

  describe('Keyboard navigation', () => {
    it('navigates with ArrowDown/ArrowUp across mixed button+link set', () => {
      renderWithRouter(<Sidebar navItems={mockNavItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')
      // Collect nav items regardless of element type (button or link).
      const nav = within(desktop).getByRole('navigation')
      const homeItem = within(desktop).getByTestId('nav-item-home')
      const settingsItem = within(desktop).getByTestId('nav-item-settings')

      homeItem.focus()
      fireEvent.keyDown(nav, { key: 'ArrowDown', bubbles: true })
      expect(document.activeElement).toBe(settingsItem)

      fireEvent.keyDown(nav, { key: 'ArrowUp', bubbles: true })
      expect(document.activeElement).toBe(homeItem)
    })
  })

  describe('Accessibility', () => {
    it('has proper ARIA roles', () => {
      renderWithRouter(<Sidebar />)
      expect(screen.getAllByRole('complementary').length).toBeGreaterThan(0)
      expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0)
    })
  })

  describe('Collapsed mode with tooltips', () => {
    it('navigates to item when clicking collapsed parent with children', async () => {
      const user = userEvent.setup()
      const onNavItemClick = vi.fn()
      renderWithRouter(
        <Sidebar
          collapsed={true}
          navItems={nestedNavItems}
          onNavItemClick={onNavItemClick}
        />
      )

      const desktop = screen.getByTestId('sidebar-desktop')
      // In collapsed mode, a parent with children is a navigation leaf (Link),
      // because its children are hidden and clicking navigates to its own href.
      const reportsItem = within(desktop).getByTestId('nav-item-reports')
      expect(reportsItem.tagName).toBe('A')

      await user.click(reportsItem)

      // Side-effect callback must fire with the item.
      expect(onNavItemClick).toHaveBeenCalledWith(
        expect.objectContaining({
          id: nestedNavItems[1].id,
          label: nestedNavItems[1].label,
          href: nestedNavItems[1].href,
        })
      )
    })

    it('collapsed parent link has correct href', () => {
      renderWithRouter(<Sidebar collapsed={true} navItems={nestedNavItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')
      const reportsItem = within(desktop).getByTestId('nav-item-reports')
      expect(reportsItem).toHaveAttribute('href', '/reports')
    })
  })

  describe('Advanced keyboard navigation', () => {
    it('expands nested items with ArrowRight', async () => {
      renderWithRouter(<Sidebar navItems={nestedNavItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')
      const nav = within(desktop).getByRole('navigation')
      const reportsItem = within(desktop).getByTestId('nav-item-reports')

      reportsItem.focus()
      fireEvent.keyDown(nav, { key: 'ArrowRight' })

      await waitFor(() => {
        expect(
          within(desktop).getByTestId('nav-item-reports-daily')
        ).toBeInTheDocument()
      })
    })

    it('collapses nested items with ArrowLeft', async () => {
      renderWithRouter(<Sidebar navItems={nestedNavItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')
      const nav = within(desktop).getByRole('navigation')
      const reportsItem = within(desktop).getByTestId('nav-item-reports')

      // First expand with click
      fireEvent.click(reportsItem)

      await waitFor(() => {
        expect(
          within(desktop).getByTestId('nav-item-reports-daily')
        ).toBeInTheDocument()
      })

      // Then collapse with ArrowLeft
      reportsItem.focus()
      fireEvent.keyDown(nav, { key: 'ArrowLeft' })

      await waitFor(() => {
        expect(
          within(desktop).queryByTestId('nav-item-reports-daily')
        ).not.toBeInTheDocument()
      })
    })

    it('navigates to first item with Home key', () => {
      renderWithRouter(<Sidebar navItems={mockNavItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')
      const homeItem = within(desktop).getByTestId('nav-item-home')
      const settingsItem = within(desktop).getByTestId('nav-item-settings')
      const nav = within(desktop).getByRole('navigation')

      // Focus on settings (last item)
      settingsItem.focus()
      expect(document.activeElement).toBe(settingsItem)

      // Press Home to jump to first item
      fireEvent.keyDown(nav, { key: 'Home' })
      expect(document.activeElement).toBe(homeItem)
    })

    it('navigates to last item with End key', () => {
      renderWithRouter(<Sidebar navItems={mockNavItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')
      const homeItem = within(desktop).getByTestId('nav-item-home')
      const settingsItem = within(desktop).getByTestId('nav-item-settings')
      const nav = within(desktop).getByRole('navigation')

      // Focus on home (first item)
      homeItem.focus()
      expect(document.activeElement).toBe(homeItem)

      // Press End to jump to last item
      fireEvent.keyDown(nav, { key: 'End' })
      expect(document.activeElement).toBe(settingsItem)
    })
  })

  describe('Role-based filtering', () => {
    const roleBasedNavItems: NavItem[] = [
      { id: 'home', label: 'Home', icon: Home, href: '/' },
      {
        id: 'admin',
        label: 'Admin',
        icon: Settings,
        href: '/admin',
        requiredRoles: [UserRole.OWNER, UserRole.ADMIN],
      },
      {
        id: 'member-only',
        label: 'Member Area',
        icon: Calculator,
        href: '/member',
        hideForRoles: [UserRole.VIEWER],
      },
    ]

    it('shows admin items for OWNER role', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.OWNER,
        isAdmin: true,
        isOwner: true,
      } as any)

      renderWithRouter(<Sidebar navItems={roleBasedNavItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')

      expect(within(desktop).getByTestId('nav-item-home')).toBeInTheDocument()
      expect(within(desktop).getByTestId('nav-item-admin')).toBeInTheDocument()
      expect(
        within(desktop).getByTestId('nav-item-member-only')
      ).toBeInTheDocument()
    })

    it('shows admin items for ADMIN role', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.ADMIN,
        isAdmin: true,
        isOwner: false,
      } as any)

      renderWithRouter(<Sidebar navItems={roleBasedNavItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')

      expect(within(desktop).getByTestId('nav-item-home')).toBeInTheDocument()
      expect(within(desktop).getByTestId('nav-item-admin')).toBeInTheDocument()
      expect(
        within(desktop).getByTestId('nav-item-member-only')
      ).toBeInTheDocument()
    })

    it('hides admin items for MEMBER role', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.MEMBER,
        isAdmin: false,
        isOwner: false,
      } as any)

      renderWithRouter(<Sidebar navItems={roleBasedNavItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')

      expect(within(desktop).getByTestId('nav-item-home')).toBeInTheDocument()
      expect(
        within(desktop).queryByTestId('nav-item-admin')
      ).not.toBeInTheDocument()
      expect(
        within(desktop).getByTestId('nav-item-member-only')
      ).toBeInTheDocument()
    })

    it('hides items with hideForRoles for VIEWER role', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.VIEWER,
        isAdmin: false,
        isOwner: false,
      } as any)

      renderWithRouter(<Sidebar navItems={roleBasedNavItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')

      expect(within(desktop).getByTestId('nav-item-home')).toBeInTheDocument()
      expect(
        within(desktop).queryByTestId('nav-item-admin')
      ).not.toBeInTheDocument()
      expect(
        within(desktop).queryByTestId('nav-item-member-only')
      ).not.toBeInTheDocument()
    })

    it('shows only items without role requirements when userRole is null', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: null,
        isAdmin: false,
        isOwner: false,
      } as any)

      renderWithRouter(<Sidebar navItems={roleBasedNavItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')

      // Items without requiredRoles should be visible
      expect(within(desktop).getByTestId('nav-item-home')).toBeInTheDocument()
      expect(
        within(desktop).getByTestId('nav-item-member-only')
      ).toBeInTheDocument()

      // Items with requiredRoles should NOT be visible
      expect(
        within(desktop).queryByTestId('nav-item-admin')
      ).not.toBeInTheDocument()
    })

    it('filters nested children based on role', () => {
      const nestedRoleItems: NavItem[] = [
        {
          id: 'admin',
          label: 'Admin',
          icon: Settings,
          href: '/admin',
          requiredRoles: [UserRole.OWNER, UserRole.ADMIN],
          children: [
            {
              id: 'admin-users',
              label: 'Users',
              icon: Settings,
              href: '/admin/users',
              requiredRoles: [UserRole.OWNER],
            },
            {
              id: 'admin-settings',
              label: 'Settings',
              icon: Settings,
              href: '/admin/settings',
            },
          ],
        },
      ]

      // ADMIN should see parent but not OWNER-only child
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.ADMIN,
        isAdmin: true,
        isOwner: false,
      } as any)

      renderWithRouter(<Sidebar navItems={nestedRoleItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')

      // Expand admin section
      fireEvent.click(within(desktop).getByTestId('nav-item-admin'))

      waitFor(() => {
        expect(
          within(desktop).getByTestId('nav-item-admin')
        ).toBeInTheDocument()
        expect(
          within(desktop).queryByTestId('nav-item-admin-users')
        ).not.toBeInTheDocument()
        expect(
          within(desktop).getByTestId('nav-item-admin-settings')
        ).toBeInTheDocument()
      })
    })
  })

  describe('Visual Enhancements', () => {
    it('applies quiet card surface to desktop sidebar', () => {
      renderWithRouter(<Sidebar />)
      const desktop = screen.getByTestId('sidebar-desktop')
      expect(desktop).toHaveClass('bg-card')
      expect(desktop).not.toHaveClass('glass')
    })

    it('applies quiet card surface to mobile sidebar', () => {
      renderWithRouter(<Sidebar mobileOpen={true} />)
      const mobile = screen.getByTestId('sidebar-mobile')
      expect(mobile).toHaveClass('bg-card')
      expect(mobile).not.toHaveClass('glass')
    })

    it('applies subtle shadow to desktop sidebar', () => {
      renderWithRouter(<Sidebar />)
      const desktop = screen.getByTestId('sidebar-desktop')
      expect(desktop).toHaveClass('shadow-sm')
    })

    it('applies stronger shadow to mobile sidebar', () => {
      renderWithRouter(<Sidebar mobileOpen={true} />)
      const mobile = screen.getByTestId('sidebar-mobile')
      expect(mobile).toHaveClass('shadow-lg')
    })

    it('does not render grid pattern overlay on desktop', () => {
      renderWithRouter(<Sidebar />)
      const desktop = screen.getByTestId('sidebar-desktop')
      const pattern = desktop.querySelector('.bg-grid')
      expect(pattern).not.toBeInTheDocument()
    })

    it('does not render grid pattern overlay on mobile', () => {
      renderWithRouter(<Sidebar mobileOpen={true} />)
      const mobile = screen.getByTestId('sidebar-mobile')
      const pattern = mobile.querySelector('.bg-grid')
      expect(pattern).not.toBeInTheDocument()
    })

    it('does not apply decorative gradient background to desktop sidebar', () => {
      renderWithRouter(<Sidebar />)
      const desktop = screen.getByTestId('sidebar-desktop')
      expect(desktop.className).not.toContain('bg-gradient-to-b')
    })

    it('does not apply decorative gradient background to mobile sidebar', () => {
      renderWithRouter(<Sidebar mobileOpen={true} />)
      const mobile = screen.getByTestId('sidebar-mobile')
      expect(mobile.className).not.toContain('bg-gradient-to-b')
    })

    it('applies standard border to desktop sidebar', () => {
      renderWithRouter(<Sidebar />)
      const desktop = screen.getByTestId('sidebar-desktop')
      expect(desktop).toHaveClass('border-r', 'border-border-subtle')
    })

    it('applies standard border to mobile sidebar', () => {
      renderWithRouter(<Sidebar mobileOpen={true} />)
      const mobile = screen.getByTestId('sidebar-mobile')
      expect(mobile).toHaveClass('border-r', 'border-border-subtle')
    })

    it('applies quiet active navigation surface', () => {
      // Use MemoryRouter with initialEntries to set the current location to '/'
      // This will make the home nav item active
      render(
        <MemoryRouter initialEntries={['/']}>
          <Sidebar navItems={mockNavItems} />
        </MemoryRouter>
      )
      const desktop = screen.getByTestId('sidebar-desktop')
      const activeItem = within(desktop).getByTestId('nav-item-home')
      expect(activeItem).toHaveClass('bg-primary/10')
      expect(activeItem.className).not.toContain('bg-gradient-to-r')
    })

    it('avoids hover translate animation on navigation items', () => {
      renderWithRouter(<Sidebar navItems={mockNavItems} />)
      const desktop = screen.getByTestId('sidebar-desktop')
      const navItem = within(desktop).getByTestId('nav-item-home')
      expect(navItem).not.toHaveClass('hover:translate-x-0.5')
    })

    it('uses responsive spacing classes', () => {
      renderWithRouter(<Sidebar />)
      const desktop = screen.getByTestId('sidebar-desktop')
      expect(desktop.className).toContain('transition-all')
      expect(desktop.className).toContain('duration-normal')
    })
  })
})
