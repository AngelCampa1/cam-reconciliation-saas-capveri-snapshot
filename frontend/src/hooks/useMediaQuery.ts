import { useState, useEffect } from 'react'

/**
 * Hook to check if a media query matches
 * @param query - Media query string (e.g., "(min-width: 768px)")
 * @returns boolean indicating if the query matches
 *
 * @example
 * const isMobile = useMediaQuery('(max-width: 767px)')
 * const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)')
 * const isDesktop = useMediaQuery('(min-width: 1024px)')
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches
    }
    return false
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia(query)

    // Update state if the match status changes
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    // Listen for changes (initial value already set in useState)
    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [query])

  return matches
}
