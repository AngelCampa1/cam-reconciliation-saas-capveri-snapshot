import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useScrollReveal } from './useScrollReveal'

// Mock IntersectionObserver
class MockIntersectionObserver {
  callback: IntersectionObserverCallback
  elements: Element[] = []

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }

  observe(el: Element) {
    this.elements.push(el)
  }
  unobserve(el: Element) {
    this.elements = this.elements.filter((e) => e !== el)
  }
  disconnect() {
    this.elements = []
  }

  // Simulate intersection
  trigger(isIntersecting: boolean) {
    this.callback(
      this.elements.map((el) => ({
        isIntersecting,
        target: el,
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRatio: isIntersecting ? 1 : 0,
        intersectionRect: {} as DOMRectReadOnly,
        rootBounds: null,
        time: 0,
      })),
      this as unknown as IntersectionObserver
    )
  }
}

let mockObserverInstance: MockIntersectionObserver | null = null

beforeEach(() => {
  mockObserverInstance = null
  vi.stubGlobal(
    'IntersectionObserver',
    // Regular function (not arrow) so it can be invoked with `new`.
    // Returning an object from a constructor function causes `new` to
    // yield that object rather than the implicit `this`, which is what
    // lets us track the instance without aliasing `this`.
    function MockIO(cb: IntersectionObserverCallback) {
      mockObserverInstance = new MockIntersectionObserver(cb)
      return mockObserverInstance
    } as unknown as typeof IntersectionObserver
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useScrollReveal', () => {
  it('observes elements with animate-on-scroll class', () => {
    const container = document.createElement('div')
    const el = document.createElement('div')
    el.className = 'animate-on-scroll'
    container.appendChild(el)
    document.body.appendChild(container)

    const ref = { current: container }
    renderHook(() => useScrollReveal(ref))

    expect(mockObserverInstance?.elements).toContain(el)

    document.body.removeChild(container)
  })

  it('adds is-visible class when element intersects', () => {
    const container = document.createElement('div')
    const el = document.createElement('div')
    el.className = 'animate-on-scroll'
    container.appendChild(el)
    document.body.appendChild(container)

    const ref = { current: container }
    renderHook(() => useScrollReveal(ref))

    mockObserverInstance?.trigger(true)

    expect(el.classList.contains('is-visible')).toBe(true)

    document.body.removeChild(container)
  })

  it('does not add is-visible when not intersecting', () => {
    const container = document.createElement('div')
    const el = document.createElement('div')
    el.className = 'animate-on-scroll'
    container.appendChild(el)
    document.body.appendChild(container)

    const ref = { current: container }
    renderHook(() => useScrollReveal(ref))

    mockObserverInstance?.trigger(false)

    expect(el.classList.contains('is-visible')).toBe(false)

    document.body.removeChild(container)
  })

  it('does nothing when container ref is null', () => {
    const ref = { current: null }
    // Should not throw
    expect(() => renderHook(() => useScrollReveal(ref))).not.toThrow()
  })

  it('does nothing when no animate-on-scroll elements found', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const ref = { current: container }
    renderHook(() => useScrollReveal(ref))

    // Observer should not be created since no elements
    expect(mockObserverInstance).toBeNull()

    document.body.removeChild(container)
  })

  it('unobserves element after it becomes visible', () => {
    const container = document.createElement('div')
    const el = document.createElement('div')
    el.className = 'animate-on-scroll'
    container.appendChild(el)
    document.body.appendChild(container)

    const ref = { current: container }
    renderHook(() => useScrollReveal(ref))

    mockObserverInstance?.trigger(true)

    expect(mockObserverInstance?.elements).not.toContain(el)

    document.body.removeChild(container)
  })

  it('disconnects observer on unmount', () => {
    const container = document.createElement('div')
    const el = document.createElement('div')
    el.className = 'animate-on-scroll'
    container.appendChild(el)
    document.body.appendChild(container)

    const ref = { current: container }
    const { unmount } = renderHook(() => useScrollReveal(ref))

    unmount()

    expect(mockObserverInstance?.elements.length).toBe(0)

    document.body.removeChild(container)
  })
})
