import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePdfNavigation, type BoundingBox } from './usePdfNavigation'

describe('usePdfNavigation', () => {
  let mockElement: HTMLDivElement
  let scrollIntoViewMock: ReturnType<typeof vi.fn>
  let scrollByMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Create mock element with scrollIntoView
    scrollIntoViewMock = vi.fn()
    mockElement = document.createElement('div')
    mockElement.scrollIntoView = scrollIntoViewMock

    // Mock getBoundingClientRect
    vi.spyOn(mockElement, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      left: 0,
      width: 800,
      height: 1000,
      bottom: 1100,
      right: 800,
      x: 0,
      y: 100,
      toJSON: () => {},
    })

    // Mock window.scrollBy
    scrollByMock = vi.fn()
    window.scrollBy = scrollByMock

    // Mock window.innerHeight
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 600,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  describe('Page Registration', () => {
    it('registers page refs', () => {
      const { result } = renderHook(() => usePdfNavigation())

      act(() => {
        result.current.registerPageRef(1, mockElement)
      })

      expect(result.current.getRegisteredPages()).toEqual([1])
    })

    it('registers multiple page refs', () => {
      const { result } = renderHook(() => usePdfNavigation())
      const mockElement2 = document.createElement('div')

      act(() => {
        result.current.registerPageRef(1, mockElement)
        result.current.registerPageRef(2, mockElement2)
      })

      expect(result.current.getRegisteredPages()).toEqual([1, 2])
    })

    it('unregisters page refs when passed null', () => {
      const { result } = renderHook(() => usePdfNavigation())

      act(() => {
        result.current.registerPageRef(1, mockElement)
        result.current.registerPageRef(1, null)
      })

      expect(result.current.getRegisteredPages()).toEqual([])
    })

    it('returns sorted page numbers', () => {
      const { result } = renderHook(() => usePdfNavigation())
      const mockElement2 = document.createElement('div')
      const mockElement3 = document.createElement('div')

      act(() => {
        result.current.registerPageRef(3, mockElement3)
        result.current.registerPageRef(1, mockElement)
        result.current.registerPageRef(2, mockElement2)
      })

      expect(result.current.getRegisteredPages()).toEqual([1, 2, 3])
    })

    it('clears all page refs', () => {
      const { result } = renderHook(() => usePdfNavigation())
      const mockElement2 = document.createElement('div')

      act(() => {
        result.current.registerPageRef(1, mockElement)
        result.current.registerPageRef(2, mockElement2)
        result.current.clearPageRefs()
      })

      expect(result.current.getRegisteredPages()).toEqual([])
    })
  })

  describe('Scroll to Page', () => {
    it('scrolls to registered page', () => {
      const { result } = renderHook(() => usePdfNavigation())

      act(() => {
        result.current.registerPageRef(1, mockElement)
      })

      let scrollResult: boolean = false
      act(() => {
        scrollResult = result.current.scrollToPage(1)
      })

      expect(scrollResult).toBe(true)
      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      })
    })

    it('returns false when page not registered', () => {
      const { result } = renderHook(() => usePdfNavigation())

      let scrollResult: boolean = true
      act(() => {
        scrollResult = result.current.scrollToPage(99)
      })

      expect(scrollResult).toBe(false)
      expect(scrollIntoViewMock).not.toHaveBeenCalled()
    })

    it('scrolls to different pages independently', () => {
      const { result } = renderHook(() => usePdfNavigation())
      const mockElement2 = document.createElement('div')
      const scrollIntoViewMock2 = vi.fn()
      mockElement2.scrollIntoView = scrollIntoViewMock2

      act(() => {
        result.current.registerPageRef(1, mockElement)
        result.current.registerPageRef(2, mockElement2)
      })

      act(() => {
        result.current.scrollToPage(1)
      })
      expect(scrollIntoViewMock).toHaveBeenCalledOnce()
      expect(scrollIntoViewMock2).not.toHaveBeenCalled()

      act(() => {
        result.current.scrollToPage(2)
      })
      expect(scrollIntoViewMock2).toHaveBeenCalledOnce()
    })
  })

  describe('Scroll to Bounding Box', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('scrolls to page first, then to bbox', () => {
      const { result } = renderHook(() => usePdfNavigation())
      const bbox: BoundingBox = {
        left: 0.1,
        top: 0.2,
        width: 0.1,
        height: 0.02,
      }

      act(() => {
        result.current.registerPageRef(1, mockElement)
      })

      let scrollResult: boolean = false
      act(() => {
        scrollResult = result.current.scrollToBbox(bbox, 1)
      })

      expect(scrollResult).toBe(true)
      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      })

      // Fast-forward to trigger the setTimeout callback
      act(() => {
        vi.advanceTimersByTime(300)
      })

      expect(scrollByMock).toHaveBeenCalled()
    })

    it('calculates correct scroll position within page', () => {
      const { result } = renderHook(() => usePdfNavigation())
      const bbox: BoundingBox = {
        left: 0.1,
        top: 0.5, // 50% down the page
        width: 0.1,
        height: 0.02,
      }

      act(() => {
        result.current.registerPageRef(1, mockElement)
      })

      act(() => {
        result.current.scrollToBbox(bbox, 1)
      })

      act(() => {
        vi.advanceTimersByTime(300)
      })

      // targetY = pageRect.top (100) + bbox.top (0.5) * pageRect.height (1000) = 600
      // scrollY = targetY (600) - window.innerHeight/3 (600/3 = 200) = 400
      expect(scrollByMock).toHaveBeenCalledWith({
        top: 400,
        behavior: 'smooth',
      })
    })

    it('returns false when page not registered', () => {
      const { result } = renderHook(() => usePdfNavigation())
      const bbox: BoundingBox = {
        left: 0.1,
        top: 0.2,
        width: 0.1,
        height: 0.02,
      }

      let scrollResult: boolean = true
      act(() => {
        scrollResult = result.current.scrollToBbox(bbox, 99)
      })

      expect(scrollResult).toBe(false)
      expect(scrollIntoViewMock).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(300)
      })
      expect(scrollByMock).not.toHaveBeenCalled()
    })

    it('handles bbox at top of page', () => {
      const { result } = renderHook(() => usePdfNavigation())
      const bbox: BoundingBox = {
        left: 0.1,
        top: 0, // Top of page
        width: 0.1,
        height: 0.02,
      }

      act(() => {
        result.current.registerPageRef(1, mockElement)
      })

      act(() => {
        result.current.scrollToBbox(bbox, 1)
      })

      act(() => {
        vi.advanceTimersByTime(300)
      })

      // targetY = 100 + 0 * 1000 = 100
      // scrollY = 100 - 200 = -100
      expect(scrollByMock).toHaveBeenCalledWith({
        top: -100,
        behavior: 'smooth',
      })
    })

    it('handles bbox at bottom of page', () => {
      const { result } = renderHook(() => usePdfNavigation())
      const bbox: BoundingBox = {
        left: 0.1,
        top: 1.0, // Bottom of page
        width: 0.1,
        height: 0.02,
      }

      act(() => {
        result.current.registerPageRef(1, mockElement)
      })

      act(() => {
        result.current.scrollToBbox(bbox, 1)
      })

      act(() => {
        vi.advanceTimersByTime(300)
      })

      // targetY = 100 + 1.0 * 1000 = 1100
      // scrollY = 1100 - 200 = 900
      expect(scrollByMock).toHaveBeenCalledWith({
        top: 900,
        behavior: 'smooth',
      })
    })
  })

  describe('Cross-Page Navigation', () => {
    it('can navigate from one page to another', () => {
      const { result } = renderHook(() => usePdfNavigation())
      const mockElement2 = document.createElement('div')
      const scrollIntoViewMock2 = vi.fn()
      mockElement2.scrollIntoView = scrollIntoViewMock2

      act(() => {
        result.current.registerPageRef(1, mockElement)
        result.current.registerPageRef(2, mockElement2)
      })

      // Navigate to page 1
      act(() => {
        result.current.scrollToPage(1)
      })
      expect(scrollIntoViewMock).toHaveBeenCalledOnce()

      // Navigate to page 2
      act(() => {
        result.current.scrollToPage(2)
      })
      expect(scrollIntoViewMock2).toHaveBeenCalledOnce()
    })

    it('can scroll to bbox on different page', () => {
      vi.useFakeTimers()

      const { result } = renderHook(() => usePdfNavigation())
      const mockElement2 = document.createElement('div')
      const scrollIntoViewMock2 = vi.fn()
      mockElement2.scrollIntoView = scrollIntoViewMock2

      vi.spyOn(mockElement2, 'getBoundingClientRect').mockReturnValue({
        top: 1200,
        left: 0,
        width: 800,
        height: 1000,
        bottom: 2200,
        right: 800,
        x: 0,
        y: 1200,
        toJSON: () => {},
      })

      const bbox: BoundingBox = {
        left: 0.1,
        top: 0.3,
        width: 0.1,
        height: 0.02,
      }

      act(() => {
        result.current.registerPageRef(1, mockElement)
        result.current.registerPageRef(2, mockElement2)
      })

      act(() => {
        result.current.scrollToBbox(bbox, 2)
      })

      expect(scrollIntoViewMock2).toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(300)
      })

      expect(scrollByMock).toHaveBeenCalled()

      vi.useRealTimers()
    })
  })

  describe('Hook Stability', () => {
    it('maintains stable function references across renders', () => {
      const { result, rerender } = renderHook(() => usePdfNavigation())

      const firstRenderFunctions = {
        scrollToPage: result.current.scrollToPage,
        scrollToBbox: result.current.scrollToBbox,
        registerPageRef: result.current.registerPageRef,
        getRegisteredPages: result.current.getRegisteredPages,
        clearPageRefs: result.current.clearPageRefs,
      }

      rerender()

      expect(result.current.scrollToPage).toBe(
        firstRenderFunctions.scrollToPage
      )
      expect(result.current.scrollToBbox).toBe(
        firstRenderFunctions.scrollToBbox
      )
      expect(result.current.registerPageRef).toBe(
        firstRenderFunctions.registerPageRef
      )
      expect(result.current.getRegisteredPages).toBe(
        firstRenderFunctions.getRegisteredPages
      )
      expect(result.current.clearPageRefs).toBe(
        firstRenderFunctions.clearPageRefs
      )
    })
  })
})
