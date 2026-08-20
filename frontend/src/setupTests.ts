import '@testing-library/jest-dom'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server, resetAllStores } from './mocks'

// ============================================================
// Environment Variables
// ============================================================
// Set Supabase environment variables for tests
import.meta.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
import.meta.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key'

// ============================================================
// MSW Setup for API Mocking
// ============================================================
// Start MSW server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' })
})

// Reset handlers and stores after each test
afterEach(() => {
  server.resetHandlers()
  resetAllStores()

  // Clean up DOM to prevent memory leaks
  document.body.innerHTML = ''

  // Clear all timers to prevent test interference
  vi.clearAllTimers()
})

// Stop server after all tests
afterAll(() => {
  server.close()
})

// ============================================================
// JSDOM Polyfills
// ============================================================
// Mock pointer capture methods that are not available in JSDOM
// Required for Radix UI components that use pointer events
Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = () => {}
Element.prototype.releasePointerCapture = () => {}

// Programmatic download links call anchor.click(), which makes JSDOM attempt a
// full navigation and emits noisy "Not implemented: navigation" errors. Tests
// only need the click event side-effect, not real navigation.
HTMLAnchorElement.prototype.click = function click() {
  if (this.hasAttribute('download') || this.href.startsWith('blob:')) {
    return
  }

  const MouseEventCtor =
    this.ownerDocument?.defaultView?.MouseEvent ?? window.MouseEvent
  this.dispatchEvent(
    new MouseEventCtor('click', {
      bubbles: true,
      cancelable: true,
    })
  )
}

// Mock scrollIntoView which is not available in JSDOM
Element.prototype.scrollIntoView = () => {}
window.scrollTo = () => {}

// Allow download-style anchors to no-op in tests while preserving normal
// click behavior for non-download links.
const nativeAnchorClick = HTMLAnchorElement.prototype.click
HTMLAnchorElement.prototype.click = function click() {
  const href = this.getAttribute('href') ?? this.href ?? ''
  if (this.hasAttribute('download') || href.startsWith('blob:')) {
    return
  }
  nativeAnchorClick.call(this)
}

// Mock ResizeObserver for components that use it
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock IntersectionObserver for scroll reveal and visibility hooks.
global.IntersectionObserver = class IntersectionObserver {
  readonly root: Element | Document | null = null
  readonly rootMargin = ''
  readonly thresholds: ReadonlyArray<number> = []

  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

// Mock matchMedia for components like sonner that check for color-scheme preference
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// JSDOM does not implement pseudo-element styles; html2canvas probes them
// during cloning, which otherwise floods test output with not-implemented
// warnings. Falling back to the element style is sufficient for unit tests.
const originalGetComputedStyle = window.getComputedStyle.bind(window)
Object.defineProperty(window, 'getComputedStyle', {
  writable: true,
  value: (element: Element, _pseudoElt?: string) =>
    originalGetComputedStyle(element),
})

// Mock DOMMatrix for PDF.js

global.DOMMatrix = class DOMMatrix {
  constructor() {
    this.a = 1
    this.b = 0
    this.c = 0
    this.d = 1
    this.e = 0
    this.f = 0
  }
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
} as unknown as typeof DOMMatrix
