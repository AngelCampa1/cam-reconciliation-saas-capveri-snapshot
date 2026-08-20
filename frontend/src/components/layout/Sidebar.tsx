import * as React from 'react'
import { useLocation, Link } from 'react-router-dom'
import { ChevronDown, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/ui/logo'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { type UserRole as UserRoleType } from '@/types/enums'
import { useAuth } from '@/contexts/AuthContext'
import { getAllNavigation } from '@/config/navigation'

/**
 * Filter navigation items based on user role
 * @param items - Navigation items to filter
 * @param userRole - Current user's role (null if not authenticated)
 * @returns Filtered navigation items
 */
function filterNavItemsByRole(
  items: NavItem[],
  userRole: UserRoleType | null
): NavItem[] {
  return items
    .filter((item) => {
      // If no user role, only show items without role requirements
      if (!userRole) {
        return !item.requiredRoles || item.requiredRoles.length === 0
      }

      // Check if item is hidden for this role
      if (item.hideForRoles && item.hideForRoles.includes(userRole)) {
        return false
      }
      // Check if item requires specific roles
      if (item.requiredRoles && item.requiredRoles.length > 0) {
        if (!item.requiredRoles.includes(userRole)) {
          return false
        }
      }
      return true
    })
    .map((item) => {
      const filtered: NavItem = { ...item }
      // Recursively filter children
      if (item.children) {
        filtered.children = filterNavItemsByRole(item.children, userRole)
      }
      return filtered
    })
}

export interface NavItem {
  /** Unique identifier for the nav item */
  id: string
  /** Display label */
  label: string
  /** Lucide icon component */
  icon: LucideIcon
  /** Navigation path/URL */
  href: string
  /** Whether this item is currently active */
  isActive?: boolean
  /** Child navigation items for nested/expandable sections */
  children?: NavItem[]
  /** Only these roles can see this item (if empty, all roles can see) */
  requiredRoles?: UserRoleType[]
  /** These roles CANNOT see this item */
  hideForRoles?: UserRoleType[]
}

export interface SidebarProps {
  /** Whether the sidebar is collapsed (icon-only mode) */
  collapsed?: boolean | undefined
  /** Whether the mobile menu is open */
  mobileOpen?: boolean | undefined
  /** Callback when mobile menu should close */
  onMobileClose?: (() => void) | undefined
  /** Navigation items to display */
  navItems?: NavItem[] | undefined
  /** Callback when a nav item is clicked */
  onNavItemClick?: ((item: NavItem) => void) | undefined
  /** Additional CSS classes */
  className?: string | undefined
}

/** Default navigation items for CapVeri */
const defaultNavItems: NavItem[] = getAllNavigation()

interface NavItemButtonProps {
  item: NavItem
  collapsed: boolean
  isExpanded: boolean
  depth: number
  /** Called for link side-effects (onNavItemClick + onMobileClose) — no navigate */
  onNavLinkClick?: ((item: NavItem) => void) | undefined
  onToggleExpand?: ((item: NavItem) => void) | undefined
}

/**
 * Individual navigation item.
 *
 * - Disclosure toggle (hasChildren && !collapsed): rendered as a <button> with
 *   aria-expanded. Clicking opens/closes the submenu; it does NOT navigate.
 * - Navigation leaf (everything else, including collapsed parents): rendered as
 *   a react-router <Link to={item.href}> so the browser treats it as a real
 *   anchor — users get ctrl/middle-click, right-click "open in new tab", and
 *   screen-reader link-rotor exposure that a <button> cannot provide.
 */
function NavItemButton({
  item,
  collapsed,
  isExpanded,
  depth,
  onNavLinkClick,
  onToggleExpand,
}: NavItemButtonProps) {
  const Icon = item.icon
  const hasChildren = item.children && item.children.length > 0
  const isNested = depth > 0

  // Disclosure toggle: has children AND sidebar is expanded (children are visible)
  const isDisclosureToggle = Boolean(hasChildren && !collapsed)

  const sharedClassName = cn(
    'group relative flex w-full items-center gap-3 rounded-full text-sm font-medium',
    'transition-all duration-fast ease-out-expo',
    // min-h-10 holds nested sub-nav items at the 40px touch floor (py-1.5
    // alone rendered them at 32px); these are full nav buttons, not compact
    // [role=tab] triggers, so the floor applies.
    isNested ? 'px-3 py-1.5 min-h-10' : 'px-3 py-2.5',
    isNested && !collapsed && 'pl-[2.75rem]',
    'hover:bg-surface-hover',
    // Focus state
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    // Active state with enhanced gradient
    item.isActive
      ? [
          'bg-primary/10 text-primary font-semibold',
          // Left border indicator (not in collapsed mode)
          !collapsed &&
            'border-l-[3px] border-l-primary -ml-px pl-[calc(0.75rem-1px)]',
          isNested && !collapsed && 'pl-[calc(2.75rem-3px)]',
        ]
      : 'text-muted-foreground hover:text-foreground',
    collapsed && 'justify-center px-2 md:px-2'
  )

  const innerContent = (
    <>
      {/* Icon with container styling when active */}
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full transition-colors duration-fast',
          !isNested &&
            item.isActive &&
            !collapsed &&
            'bg-primary/10 p-1.5 -ml-1.5',
          !isNested &&
            !item.isActive &&
            !collapsed &&
            'p-1.5 -ml-1.5 group-hover:bg-muted/50'
        )}
      >
        <Icon
          className={cn(
            'shrink-0 transition-colors duration-fast',
            isNested ? 'h-4 w-4' : 'h-[18px] w-[18px]',
            item.isActive
              ? 'text-primary'
              : 'text-muted-foreground group-hover:text-foreground'
          )}
          aria-hidden="true"
        />
      </span>
      <span
        className={cn(
          'flex-1 text-left transition-opacity duration-fast',
          collapsed ? 'hidden md:hidden' : 'block'
        )}
      >
        {item.label}
      </span>
      {hasChildren && !collapsed && (
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-fast',
            isExpanded && 'rotate-180',
            item.isActive && 'text-primary/70'
          )}
          aria-hidden="true"
        />
      )}
    </>
  )

  let navElement: React.ReactElement

  if (isDisclosureToggle) {
    // Parent with visible children: button that toggles the submenu.
    // aria-expanded communicates the open/closed state of the controlled region.
    navElement = (
      <button
        type="button"
        onClick={() => onToggleExpand?.(item)}
        className={sharedClassName}
        aria-expanded={isExpanded}
        aria-label={collapsed ? item.label : undefined}
        title={collapsed ? item.label : undefined}
        data-testid={`nav-item-${item.id}`}
      >
        {innerContent}
      </button>
    )
  } else {
    // Navigation leaf (or collapsed parent): real anchor so the browser exposes
    // ctrl/middle-click, right-click menu, and screen-reader link rotor.
    navElement = (
      <Link
        to={item.href}
        onClick={() => onNavLinkClick?.(item)}
        className={sharedClassName}
        aria-current={item.isActive ? 'page' : undefined}
        aria-label={collapsed ? item.label : undefined}
        title={collapsed ? item.label : undefined}
        data-testid={`nav-item-${item.id}`}
      >
        {innerContent}
      </Link>
    )
  }

  // Wrap in tooltip when collapsed
  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>{navElement}</TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {item.label}
            {hasChildren && (
              <span className="text-xs text-muted-foreground">
                (+{item.children!.length})
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return navElement
}

interface NavListProps {
  items: NavItem[]
  collapsed: boolean
  expandedIds: Set<string>
  depth: number
  onNavLinkClick?: ((item: NavItem) => void) | undefined
  onToggleExpand?: ((item: NavItem) => void) | undefined
}

/**
 * Recursive navigation list component
 */
function NavList({
  items,
  collapsed,
  expandedIds,
  depth,
  onNavLinkClick,
  onToggleExpand,
}: NavListProps) {
  return (
    <ul className="space-y-1" role="list">
      {items.map((item) => {
        const isExpanded = expandedIds.has(item.id)
        const hasChildren = item.children && item.children.length > 0

        return (
          <li key={item.id}>
            <NavItemButton
              item={item}
              collapsed={collapsed}
              isExpanded={isExpanded}
              depth={depth}
              onNavLinkClick={onNavLinkClick}
              onToggleExpand={onToggleExpand}
            />
            {/* Render nested children */}
            {hasChildren && isExpanded && !collapsed && (
              <NavList
                items={item.children!}
                collapsed={collapsed}
                expandedIds={expandedIds}
                depth={depth + 1}
                onNavLinkClick={onNavLinkClick}
                onToggleExpand={onToggleExpand}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Application sidebar with navigation items.
 *
 * Features:
 * - Collapsible on desktop (icon-only mode)
 * - Hidden on mobile with overlay when opened
 * - Navigation items with icons and active state
 * - Nested/expandable navigation items
 * - Keyboard navigation (Tab, Enter, Arrow keys)
 * - Tooltips in collapsed mode
 * - Smooth 200ms transitions
 */
export function Sidebar({
  collapsed = false,
  mobileOpen = false,
  onMobileClose,
  navItems = defaultNavItems,
  onNavItemClick,
  className,
}: SidebarProps) {
  const location = useLocation()
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())
  const navRef = React.useRef<HTMLElement>(null)
  const mobileAsideRef = React.useRef<HTMLElement>(null)
  const previousFocusRef = React.useRef<HTMLElement | null>(null)
  const { userRole } = useAuth()

  // Mark items as active based on current route
  const navItemsWithActiveState = React.useMemo(() => {
    const markActive = (items: NavItem[]): NavItem[] => {
      return items.map((item) => {
        const marked: NavItem = {
          ...item,
          isActive:
            location.pathname === item.href ||
            location.pathname.startsWith(item.href + '/'),
        }
        if (item.children) {
          marked.children = markActive(item.children)
        }
        return marked
      })
    }
    return markActive(navItems)
  }, [navItems, location.pathname])

  // Side-effect callback for Link clicks: fires onNavItemClick + closes mobile
  // drawer. Does NOT call navigate() — the <Link to> handles navigation natively.
  const handleNavLinkClick = React.useCallback(
    (item: NavItem) => {
      onNavItemClick?.(item)
      onMobileClose?.()
    },
    [onNavItemClick, onMobileClose]
  )

  // Filter navigation items based on user role
  const filteredNavItems = React.useMemo(() => {
    return filterNavItemsByRole(navItemsWithActiveState, userRole)
  }, [navItemsWithActiveState, userRole])

  // Auto-expand parent sections that contain the active route so deep links
  // (e.g. /analysis/trends) reveal the active child instead of staying
  // collapsed. Union-only: never collapses a section the user opened.
  React.useEffect(() => {
    const idsToExpand: string[] = []
    const visit = (items: NavItem[]) => {
      for (const item of items) {
        if (item.children && item.children.length > 0) {
          const hasActiveDescendant = item.children.some(
            (child) =>
              location.pathname === child.href ||
              location.pathname.startsWith(child.href + '/')
          )
          if (hasActiveDescendant) {
            idsToExpand.push(item.id)
          }
          visit(item.children)
        }
      }
    }
    visit(filteredNavItems)
    if (idsToExpand.length === 0) {
      return
    }
    setExpandedIds((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const id of idsToExpand) {
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [filteredNavItems, location.pathname])

  // Toggle expanded state for nested items
  const handleToggleExpand = React.useCallback((item: NavItem) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(item.id)) {
        next.delete(item.id)
      } else {
        next.add(item.id)
      }
      return next
    })
  }, [])

  // Get all visible (flattened) items for keyboard navigation
  const getFlattenedItems = React.useCallback((): NavItem[] => {
    const result: NavItem[] = []

    const flatten = (items: NavItem[]) => {
      for (const item of items) {
        result.push(item)
        if (item.children && expandedIds.has(item.id) && !collapsed) {
          flatten(item.children)
        }
      }
    }

    flatten(filteredNavItems)
    return result
  }, [filteredNavItems, expandedIds, collapsed])

  // Handle keyboard navigation
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const flatItems = getFlattenedItems()
      const currentElement = document.activeElement
      // Use e.currentTarget to get the nav element that received the event
      // This ensures we get the correct nav (desktop or mobile)
      const navElement = e.currentTarget as HTMLElement
      // Match both <button> disclosure toggles and <a> navigation leaves by
      // their shared data-testid prefix so arrow/home/end key movement works
      // across the mixed set in DOM order.
      const navItems = navElement.querySelectorAll(
        'button[data-testid^="nav-item-"], a[data-testid^="nav-item-"]'
      )

      if (!navItems || navItems.length === 0) return

      const currentIndex = Array.from(navItems).findIndex(
        (el) => el === currentElement
      )

      if (currentIndex === -1) return

      let nextIndex = currentIndex

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          nextIndex = currentIndex < navItems.length - 1 ? currentIndex + 1 : 0
          break
        case 'ArrowUp':
          e.preventDefault()
          nextIndex = currentIndex > 0 ? currentIndex - 1 : navItems.length - 1
          break
        case 'ArrowRight':
          // Expand if has children and not expanded
          if (currentIndex < flatItems.length) {
            const item = flatItems[currentIndex]
            if (
              item &&
              item.children &&
              item.children.length > 0 &&
              !expandedIds.has(item.id) &&
              !collapsed
            ) {
              e.preventDefault()
              handleToggleExpand(item)
            }
          }
          break
        case 'ArrowLeft':
          // Collapse if has children and is expanded
          if (currentIndex < flatItems.length) {
            const item = flatItems[currentIndex]
            if (
              item &&
              item.children &&
              item.children.length > 0 &&
              expandedIds.has(item.id)
            ) {
              e.preventDefault()
              handleToggleExpand(item)
            }
          }
          break
        case 'Home':
          e.preventDefault()
          nextIndex = 0
          break
        case 'End':
          e.preventDefault()
          nextIndex = navItems.length - 1
          break
        default:
          return
      }

      if (nextIndex !== currentIndex && nextIndex >= 0) {
        ;(navItems[nextIndex] as HTMLElement).focus()
      }
    },
    [getFlattenedItems, expandedIds, collapsed, handleToggleExpand]
  )

  // Close on escape key
  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && mobileOpen) {
        onMobileClose?.()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [mobileOpen, onMobileClose])

  // Prevent body scroll when mobile menu is open
  React.useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  // Move focus into the mobile drawer when it opens, and restore it to the
  // trigger (the hamburger button) when it closes. Without this, a keyboard or
  // screen-reader user who opens the drawer stays focused on the page behind it
  // and, on close, loses their place entirely.
  React.useEffect(() => {
    if (mobileOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null
      // Match both <button> disclosure toggles and <a> navigation leaves so the
      // first focusable nav item (whichever type it is) receives focus when the
      // drawer opens.
      const firstItem = mobileAsideRef.current?.querySelector<HTMLElement>(
        'button[data-testid^="nav-item-"], a[data-testid^="nav-item-"]'
      )
      firstItem?.focus()
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus()
      previousFocusRef.current = null
    }
  }, [mobileOpen])

  // Trap Tab focus inside the open mobile drawer so keyboard users can't tab out
  // to the page hidden behind the overlay (it acts as a modal dialog on mobile).
  // The [href] selector already catches <a> links, so this handler needs no change.
  const handleMobileTabKey = React.useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'Tab' || !mobileOpen) return
      const container = mobileAsideRef.current
      if (!container) return
      const focusables = container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [mobileOpen]
  )

  const sidebarContent = (
    <>
      {/* Brand header, 64px (h-16) to align with the app Header on the right */}
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b border-border-subtle',
          collapsed ? 'justify-center px-2' : 'px-4 gap-3'
        )}
      >
        <Logo size="sm" showText={false} />
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold tracking-tight text-foreground truncate">
              CapVeri
            </span>
          </div>
        )}
        {/* Close button for the mobile drawer. Hidden on desktop (md+), where
            the sidebar is always docked. Backdrop-tap and Escape already close
            the drawer, but a visible control is what a non-technical user
            looks for first. */}
        <button
          type="button"
          onClick={onMobileClose}
          className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation items */}
      <nav
        ref={navRef}
        className="flex-1 overflow-y-auto p-3 pt-4"
        role="navigation"
        // Two <nav> landmarks render (the bottom bar also has one); name this
        // one so they're distinguishable in a screen reader's landmark list.
        aria-label="Main"
        onKeyDown={handleKeyDown}
      >
        <NavList
          items={filteredNavItems}
          collapsed={collapsed}
          expandedIds={expandedIds}
          depth={0}
          onNavLinkClick={handleNavLinkClick}
          onToggleExpand={handleToggleExpand}
        />
      </nav>
    </>
  )

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-dropdown bg-background/80 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
          data-testid="sidebar-overlay"
        />
      )}

      {/* Sidebar - Desktop */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-overlay hidden h-full flex-col md:flex',
          'border-r border-border-subtle bg-card shadow-sm',
          'transition-all duration-normal ease-out-expo',
          collapsed ? 'w-16' : 'w-64',
          className
        )}
        role="complementary"
        aria-label="Sidebar"
        data-testid="sidebar-desktop"
      >
        {sidebarContent}
      </aside>

      {/* Sidebar - Mobile */}
      <aside
        ref={mobileAsideRef}
        id="mobile-nav-drawer"
        className={cn(
          'fixed inset-y-0 left-0 z-modal flex w-64 flex-col',
          'border-r border-border-subtle bg-card shadow-lg',
          'transition-transform duration-normal ease-out-expo',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'md:hidden'
        )}
        // Open, this is a focus-trapped modal drawer over a dimmed overlay, so
        // expose it as a dialog (aria-modal confines AT to it). Closed, it's an
        // inert off-screen complementary region.
        role={mobileOpen ? 'dialog' : 'complementary'}
        aria-modal={mobileOpen ? true : undefined}
        aria-label="Main navigation"
        // When closed, the drawer sits off-screen (-translate-x-full). `inert`
        // removes it from the tab order and the accessibility tree, so keyboard
        // and screen-reader users can't land on its invisible buttons (a
        // focusable element inside an aria-hidden region is a WCAG 4.1.2 trap).
        inert={!mobileOpen}
        aria-hidden={!mobileOpen}
        onKeyDown={handleMobileTabKey}
        data-testid="sidebar-mobile"
      >
        {sidebarContent}
      </aside>
    </>
  )
}
