import { useState, useCallback, useEffect } from 'react'

const SIDEBAR_COLLAPSED_KEY = 'capveri-sidebar-collapsed'
const MOBILE_BREAKPOINT = 768

export interface SidebarState {
  /** Whether the sidebar is collapsed (icon-only mode) on desktop */
  isCollapsed: boolean
  /** Whether the mobile menu is open */
  isMobileMenuOpen: boolean
  /** Whether we're currently on a mobile viewport */
  isMobile: boolean
  /** Toggle the sidebar collapsed state */
  toggleCollapsed: () => void
  /** Set the sidebar collapsed state */
  setCollapsed: (collapsed: boolean) => void
  /** Open the mobile menu */
  openMobileMenu: () => void
  /** Close the mobile menu */
  closeMobileMenu: () => void
  /** Toggle the mobile menu */
  toggleMobileMenu: () => void
}

/**
 * Custom hook to manage sidebar state across desktop and mobile viewports.
 *
 * Features:
 * - Persists collapsed state to localStorage
 * - Tracks mobile/desktop breakpoint
 * - Separate state for mobile menu overlay
 * - Auto-closes mobile menu on viewport change to desktop
 */
export function useSidebarState(): SidebarState {
  // Initialize collapsed state from localStorage or default to false
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    return stored === 'true'
  })

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < MOBILE_BREAKPOINT
  })

  // Persist collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed))
  }, [isCollapsed])

  // Track viewport size and close mobile menu when transitioning to desktop
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT
      setIsMobile(mobile)

      // Close mobile menu when transitioning to desktop
      if (!mobile && isMobileMenuOpen) {
        setIsMobileMenuOpen(false)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isMobileMenuOpen])

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => !prev)
  }, [])

  const setCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsed(collapsed)
  }, [])

  const openMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(true)
  }, [])

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false)
  }, [])

  const toggleMobileMenu = useCallback(() => {
    setIsMobileMenuOpen((prev) => !prev)
  }, [])

  return {
    isCollapsed,
    isMobileMenuOpen,
    isMobile,
    toggleCollapsed,
    setCollapsed,
    openMobileMenu,
    closeMobileMenu,
    toggleMobileMenu,
  }
}
