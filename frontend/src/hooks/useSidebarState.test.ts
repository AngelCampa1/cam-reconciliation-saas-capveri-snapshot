import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSidebarState } from './useSidebarState'

describe('useSidebarState', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })
  })

  it('initializes with correct defaults', () => {
    const { result } = renderHook(() => useSidebarState())

    expect(result.current.isCollapsed).toBe(false)
    expect(result.current.isMobileMenuOpen).toBe(false)
    expect(result.current.isMobile).toBe(false)
  })

  it('detects mobile viewport', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 500,
    })
    const { result } = renderHook(() => useSidebarState())
    expect(result.current.isMobile).toBe(true)
  })

  it('restores collapsed state from localStorage', () => {
    localStorage.setItem('capveri-sidebar-collapsed', 'true')
    const { result } = renderHook(() => useSidebarState())
    expect(result.current.isCollapsed).toBe(true)
  })

  it('toggles and persists collapsed state', () => {
    const { result } = renderHook(() => useSidebarState())

    act(() => result.current.toggleCollapsed())
    expect(result.current.isCollapsed).toBe(true)
    expect(localStorage.getItem('capveri-sidebar-collapsed')).toBe('true')

    act(() => result.current.toggleCollapsed())
    expect(result.current.isCollapsed).toBe(false)
  })

  it('controls mobile menu state', () => {
    const { result } = renderHook(() => useSidebarState())

    act(() => result.current.openMobileMenu())
    expect(result.current.isMobileMenuOpen).toBe(true)

    act(() => result.current.closeMobileMenu())
    expect(result.current.isMobileMenuOpen).toBe(false)

    act(() => result.current.toggleMobileMenu())
    expect(result.current.isMobileMenuOpen).toBe(true)
  })

  it('updates isMobile and closes menu on resize to desktop', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 500,
    })
    const { result } = renderHook(() => useSidebarState())

    act(() => result.current.openMobileMenu())
    expect(result.current.isMobileMenuOpen).toBe(true)

    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      })
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current.isMobile).toBe(false)
    expect(result.current.isMobileMenuOpen).toBe(false)
  })

  it('cleans up event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useSidebarState())
    unmount()
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'resize',
      expect.any(Function)
    )
  })
})
