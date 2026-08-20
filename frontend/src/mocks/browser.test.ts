/**
 * Tests for MSW browser worker setup
 *
 * Verifies that the browser worker is configured correctly for development use.
 * Following test minimalism: just test our wrapper functions, not MSW internals.
 */
import { describe, it, expect, vi } from 'vitest'
import { setupWorker } from 'msw/browser'

// Mock MSW's setupWorker to avoid browser environment issues in tests
vi.mock('msw/browser', () => ({
  setupWorker: vi.fn(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    use: vi.fn(),
    resetHandlers: vi.fn(),
  })),
}))

// Import after mocking
import { worker, startWorker } from './browser'
import { handlers } from './handlers'

describe('MSW Browser Setup', () => {
  it('creates worker with all handlers', () => {
    expect(setupWorker).toHaveBeenCalledWith(...handlers)
    expect(worker).toBeDefined()
  })

  it('startWorker calls worker.start with correct options', async () => {
    await startWorker()

    expect(worker.start).toHaveBeenCalledWith({
      onUnhandledRequest: 'bypass',
      quiet: false,
    })
  })

  it('startWorker handles async operation', async () => {
    const startPromise = startWorker()
    expect(startPromise).toBeInstanceOf(Promise)
    await startPromise
  })
})
