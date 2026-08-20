import { useState, useEffect } from 'react'
import { useMediaQuery } from './useMediaQuery'

/**
 * Breakpoint definitions matching Tailwind CSS defaults
 */
export const BREAKPOINTS = {
  mobile: 375, // iPhone SE, small phones
  sm: 640, // Large phones
  md: 768, // Tablets
  lg: 1024, // Laptops
  xl: 1280, // Desktops
  '2xl': 1536, // Large desktops
} as const

export type Breakpoint = keyof typeof BREAKPOINTS
export type ViewportSize = 'mobile' | 'tablet' | 'laptop' | 'desktop'

export interface ViewportInfo {
  /** Current viewport width in pixels */
  width: number
  /** Current viewport height in pixels */
  height: number
  /** Is viewport mobile-sized (<768px) */
  isMobile: boolean
  /** Is viewport tablet-sized (768px-1023px) */
  isTablet: boolean
  /** Is viewport laptop-sized (1024px-1279px) */
  isLaptop: boolean
  /** Is viewport desktop-sized (>=1280px) */
  isDesktop: boolean
  /** Current viewport category */
  size: ViewportSize
  /** Is viewport touch-enabled */
  isTouch: boolean
}

/**
 * Hook to get current viewport information
 * @returns ViewportInfo object with current viewport state
 *
 * @example
 * const { isMobile, size } = useViewport()
 * if (isMobile) {
 *   return <MobileNav />
 * }
 */
export function useViewport(): ViewportInfo {
  const isMobile = useMediaQuery(`(max-width: ${BREAKPOINTS.md - 1}px)`)
  const isTablet = useMediaQuery(
    `(min-width: ${BREAKPOINTS.md}px) and (max-width: ${BREAKPOINTS.lg - 1}px)`
  )
  const isLaptop = useMediaQuery(
    `(min-width: ${BREAKPOINTS.lg}px) and (max-width: ${BREAKPOINTS.xl - 1}px)`
  )
  const isDesktop = useMediaQuery(`(min-width: ${BREAKPOINTS.xl}px)`)

  const [dimensions, setDimensions] = useState<{
    width: number
    height: number
  }>(() => {
    if (typeof window !== 'undefined') {
      return {
        width: window.innerWidth,
        height: window.innerHeight,
      }
    }
    return { width: 0, height: 0 }
  })

  // Touch support is static, doesn't need state
  const isTouch =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    // Touch support already set in useState initialization
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  // Determine size category
  let size: ViewportSize = 'mobile'
  if (isDesktop) {
    size = 'desktop'
  } else if (isLaptop) {
    size = 'laptop'
  } else if (isTablet) {
    size = 'tablet'
  }

  return {
    width: dimensions.width,
    height: dimensions.height,
    isMobile,
    isTablet,
    isLaptop,
    isDesktop,
    size,
    isTouch,
  }
}
