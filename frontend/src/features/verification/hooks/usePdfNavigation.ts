import { useCallback, useRef } from 'react'

export interface BoundingBox {
  left: number // 0-1 normalized
  top: number
  width: number
  height: number
}

export interface SourceReference {
  field: string
  bbox: BoundingBox
  pageNumber: number
}

/**
 * Hook for managing PDF navigation and scrolling to source locations.
 *
 * Provides functionality to:
 * - Register page element refs for scroll targeting
 * - Scroll to specific pages with smooth animation
 * - Scroll to specific bounding boxes within pages
 * - Navigate across pages seamlessly
 *
 * Story 16.4: Create Field-to-PDF Linking
 */
export function usePdfNavigation() {
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  /**
   * Scroll to a specific page in the PDF.
   *
   * @param pageNumber - 1-indexed page number
   */
  const scrollToPage = useCallback((pageNumber: number) => {
    const pageElement = pageRefs.current.get(pageNumber)
    if (pageElement) {
      pageElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      return true
    }
    return false
  }, [])

  /**
   * Scroll to a specific bounding box within a page.
   *
   * First scrolls to the page, then scrolls within the page to position
   * the bounding box approximately 1/3 down from the top of the viewport.
   *
   * @param bbox - Normalized bounding box coordinates (0-1)
   * @param pageNumber - 1-indexed page number
   */
  const scrollToBbox = useCallback((bbox: BoundingBox, pageNumber: number) => {
    const pageElement = pageRefs.current.get(pageNumber)
    if (!pageElement) {
      return false
    }

    // First scroll to page
    pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })

    // Then scroll within page to bbox position
    // Use setTimeout to allow the page scroll to complete first
    setTimeout(() => {
      const pageRect = pageElement.getBoundingClientRect()
      const targetY = pageRect.top + bbox.top * pageRect.height

      window.scrollBy({
        top: targetY - window.innerHeight / 3,
        behavior: 'smooth',
      })
    }, 300)

    return true
  }, [])

  /**
   * Register or unregister a page element ref.
   *
   * @param pageNumber - 1-indexed page number
   * @param el - The page element or null to unregister
   */
  const registerPageRef = useCallback(
    (pageNumber: number, el: HTMLDivElement | null) => {
      if (el) {
        pageRefs.current.set(pageNumber, el)
      } else {
        pageRefs.current.delete(pageNumber)
      }
    },
    []
  )

  /**
   * Get all currently registered page numbers.
   */
  const getRegisteredPages = useCallback(() => {
    return Array.from(pageRefs.current.keys()).sort((a, b) => a - b)
  }, [])

  /**
   * Clear all registered page refs.
   */
  const clearPageRefs = useCallback(() => {
    pageRefs.current.clear()
  }, [])

  return {
    scrollToPage,
    scrollToBbox,
    registerPageRef,
    getRegisteredPages,
    clearPageRefs,
  }
}
