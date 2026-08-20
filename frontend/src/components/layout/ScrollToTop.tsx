/**
 * ScrollToTop Component
 *
 * Scrolls the window to the top whenever the route changes.
 * This ensures navigation from footer links and other routes
 * starts at the top of the new page.
 */
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    // Scroll to top when route changes
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
