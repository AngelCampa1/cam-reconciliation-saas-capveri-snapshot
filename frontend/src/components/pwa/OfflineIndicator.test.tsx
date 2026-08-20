/**
 * OfflineIndicator Component Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { OfflineIndicator } from './OfflineIndicator'

describe('OfflineIndicator', () => {
  let onlineGetter: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Mock navigator.onLine
    onlineGetter = vi.spyOn(navigator, 'onLine', 'get')
  })

  afterEach(() => {
    onlineGetter.mockRestore()
  })

  it('does not render when online', () => {
    onlineGetter.mockReturnValue(true)
    render(<OfflineIndicator />)

    expect(screen.queryByTestId('offline-indicator')).not.toBeInTheDocument()
  })

  it('renders when offline', () => {
    onlineGetter.mockReturnValue(false)
    render(<OfflineIndicator />)

    expect(screen.getByTestId('offline-indicator')).toBeInTheDocument()
    expect(screen.getByText(/you are offline/i)).toBeInTheDocument()
  })

  it('shows offline message when network is lost', () => {
    onlineGetter.mockReturnValue(true)
    const { rerender } = render(<OfflineIndicator />)

    // Initially online - no indicator
    expect(screen.queryByTestId('offline-indicator')).not.toBeInTheDocument()

    // Simulate going offline
    onlineGetter.mockReturnValue(false)
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    rerender(<OfflineIndicator />)

    expect(screen.getByTestId('offline-indicator')).toBeInTheDocument()
  })

  it('hides offline message when network is restored', () => {
    onlineGetter.mockReturnValue(false)
    const { rerender } = render(<OfflineIndicator />)

    // Initially offline - indicator visible
    expect(screen.getByTestId('offline-indicator')).toBeInTheDocument()

    // Simulate going online
    onlineGetter.mockReturnValue(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    rerender(<OfflineIndicator />)

    expect(screen.queryByTestId('offline-indicator')).not.toBeInTheDocument()
  })

  it('has proper accessibility attributes', () => {
    onlineGetter.mockReturnValue(false)
    render(<OfflineIndicator />)

    const indicator = screen.getByTestId('offline-indicator')
    expect(indicator).toHaveAttribute('role', 'status')
    expect(indicator).toHaveAttribute('aria-live', 'polite')
  })
})
