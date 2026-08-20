import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAutoSave } from './useAutoSave'
import { resolveApiUrl } from '@/api/url'
import type { LeaseRecoveryProfile } from '@/types/lease-recovery-profile'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function createMockResponse(
  overrides: Partial<Pick<Response, 'ok' | 'status' | 'statusText'>> = {}
): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({}),
    ...overrides,
  } as Response
}

describe('useAutoSave', () => {
  const mockProfile: LeaseRecoveryProfile = {
    base_year: 2020,
    base_year_amount: '50000',
    gross_up_base_year: false,
    pro_rata_share: '0.15',
    cap_type: 'cumulative',
    cap_rate: '0.03',
    admin_fee_percentage: '0.15',
    excluded_pools: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    global.fetch = vi.fn().mockResolvedValue(createMockResponse())
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  describe('Auto-save Behavior', () => {
    it('does not save when not dirty', async () => {
      renderHook(() => useAutoSave('doc-123', mockProfile, false))

      vi.advanceTimersByTime(2000)

      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('saves after delay when dirty', async () => {
      renderHook(() => useAutoSave('doc-123', mockProfile, true))

      // Should not save immediately
      expect(global.fetch).not.toHaveBeenCalled()

      // Should save after 2 seconds
      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(global.fetch).toHaveBeenCalledWith(
        resolveApiUrl('/api/v1/extractions/doc-123/draft'),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: mockProfile }),
        }
      )
    })

    it('uses custom delay', async () => {
      renderHook(() =>
        useAutoSave('doc-123', mockProfile, true, { delay: 5000 })
      )

      // Should not save after 2 seconds
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(global.fetch).not.toHaveBeenCalled()

      // Should save after 5 seconds
      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(global.fetch).toHaveBeenCalled()
    })

    it('resets delay when profile changes', async () => {
      const { rerender } = renderHook(
        ({ profile }) => useAutoSave('doc-123', profile, true),
        { initialProps: { profile: mockProfile } }
      )

      // Advance partway through delay
      act(() => {
        vi.advanceTimersByTime(1500)
      })

      // Change profile - should reset timer
      const updatedProfile = { ...mockProfile, base_year: 2021 }
      act(() => {
        rerender({ profile: updatedProfile })
      })

      // Original timer should be cancelled
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(global.fetch).not.toHaveBeenCalled()

      // Should save after full delay from reset
      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(global.fetch).toHaveBeenCalledWith(
        resolveApiUrl('/api/v1/extractions/doc-123/draft'),
        expect.objectContaining({
          body: JSON.stringify({ profile: updatedProfile }),
        })
      )
    })

    it('cancels pending save on unmount', async () => {
      const { unmount } = renderHook(() =>
        useAutoSave('doc-123', mockProfile, true)
      )

      act(() => {
        vi.advanceTimersByTime(1500)
      })
      act(() => {
        unmount()
      })

      // Complete the rest of the delay
      act(() => {
        vi.advanceTimersByTime(500)
      })

      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('does not save when disabled', async () => {
      renderHook(() =>
        useAutoSave('doc-123', mockProfile, true, { enabled: false })
      )

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('stops saving when becomes not dirty', async () => {
      const { rerender } = renderHook(
        ({ isDirty }) => useAutoSave('doc-123', mockProfile, isDirty),
        { initialProps: { isDirty: true } }
      )

      act(() => {
        vi.advanceTimersByTime(1500)
      })

      // Mark as not dirty
      act(() => {
        rerender({ isDirty: false })
      })

      // Complete the rest of the delay
      act(() => {
        vi.advanceTimersByTime(500)
      })

      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe('Manual Save', () => {
    it('provides manual save function', async () => {
      const { result } = renderHook(() =>
        useAutoSave('doc-123', mockProfile, true)
      )

      expect(result.current.manualSave).toBeInstanceOf(Function)
    })

    it('manual save triggers immediate save', async () => {
      const { result } = renderHook(() =>
        useAutoSave('doc-123', mockProfile, true)
      )

      await act(async () => {
        await result.current.manualSave()
      })

      expect(global.fetch).toHaveBeenCalledWith(
        resolveApiUrl('/api/v1/extractions/doc-123/draft'),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: mockProfile }),
        }
      )
    })

    it('manual save cancels pending auto-save', async () => {
      const { result } = renderHook(() =>
        useAutoSave('doc-123', mockProfile, true)
      )

      // Start auto-save timer
      act(() => {
        vi.advanceTimersByTime(1500)
      })

      // Manual save should cancel pending auto-save
      await act(async () => {
        await result.current.manualSave()
      })

      // Complete original delay
      act(() => {
        vi.advanceTimersByTime(500)
      })

      // Should only have been called once (from manual save)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('Error Handling', () => {
    it('logs error when save fails', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      const mockError = new Error('Network error')
      global.fetch = vi.fn().mockRejectedValueOnce(mockError)

      renderHook(() => useAutoSave('doc-123', mockProfile, true))

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ERROR:'),
        expect.objectContaining({
          documentId: 'doc-123',
          error: expect.any(Object),
        })
      )

      consoleErrorSpy.mockRestore()
    })

    it('throws error from manual save when it fails', async () => {
      const mockError = new Error('Network error')
      global.fetch = vi.fn().mockRejectedValueOnce(mockError)

      const { result } = renderHook(() =>
        useAutoSave('doc-123', mockProfile, true)
      )

      await expect(
        act(async () => {
          await result.current.manualSave()
        })
      ).rejects.toThrow('Network error')
    })

    it('exposes saveError when a save fails and clears it on the next success', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          createMockResponse({
            ok: false,
            status: 500,
            statusText: 'Server Error',
          })
        )
        .mockResolvedValueOnce(createMockResponse())

      const { result, rerender } = renderHook(
        ({ profile }) => useAutoSave('doc-123', profile, true, { delay: 100 }),
        { initialProps: { profile: mockProfile } }
      )

      expect(result.current.saveError).toBeNull()

      // First save fails -> saveError populated
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(result.current.saveError).toBeInstanceOf(Error)

      // Editing again triggers a new (successful) save -> saveError cleared
      act(() => {
        rerender({ profile: { ...mockProfile } })
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(result.current.saveError).toBeNull()

      consoleErrorSpy.mockRestore()
    })

    it('clears saveError when the document ID changes', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'))

      const { result, rerender } = renderHook(
        ({ docId }) => useAutoSave(docId, mockProfile, true, { delay: 100 }),
        { initialProps: { docId: 'doc-123' } }
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(result.current.saveError).toBeInstanceOf(Error)

      // Switching documents resets the error state
      act(() => {
        rerender({ docId: 'doc-789' })
      })

      expect(result.current.saveError).toBeNull()

      consoleErrorSpy.mockRestore()
    })

    it('treats non-2xx responses as failed saves that can be retried', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          createMockResponse({
            ok: false,
            status: 500,
            statusText: 'Server Error',
          })
        )
        .mockResolvedValueOnce(createMockResponse())

      const { result, rerender } = renderHook(
        ({ profile }) => useAutoSave('doc-123', profile, true, { delay: 100 }),
        { initialProps: { profile: mockProfile } }
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(result.current.lastSaved).toBeNull()

      act(() => {
        rerender({ profile: { ...mockProfile } })
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(result.current.lastSaved).toBeInstanceOf(Date)
    })
  })

  describe('Document ID', () => {
    it('uses correct document ID in API call', async () => {
      renderHook(() => useAutoSave('doc-456', mockProfile, true))

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(global.fetch).toHaveBeenCalledWith(
        resolveApiUrl('/api/v1/extractions/doc-456/draft'),
        expect.any(Object)
      )
    })

    it('updates API call when document ID changes', async () => {
      const { rerender } = renderHook(
        ({ docId }) => useAutoSave(docId, mockProfile, true),
        { initialProps: { docId: 'doc-123' } }
      )

      act(() => {
        rerender({ docId: 'doc-789' })
      })

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(global.fetch).toHaveBeenCalledWith(
        resolveApiUrl('/api/v1/extractions/doc-789/draft'),
        expect.any(Object)
      )
    })

    it('does not schedule repeated auto-saves for unchanged dirty data', async () => {
      const { rerender } = renderHook(
        ({ profile }) => useAutoSave('doc-123', profile, true),
        { initialProps: { profile: mockProfile } }
      )

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(global.fetch).toHaveBeenCalledTimes(1)

      rerender({ profile: { ...mockProfile } })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500)
      })

      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('saves the latest dirty profile after an in-flight save completes', async () => {
      const firstSave = createDeferred<Response>()
      const secondSave = createDeferred<Response>()

      global.fetch = vi
        .fn()
        .mockReturnValueOnce(firstSave.promise)
        .mockReturnValueOnce(secondSave.promise)

      const { rerender } = renderHook(
        ({ profile }) => useAutoSave('doc-123', profile, true, { delay: 100 }),
        { initialProps: { profile: mockProfile } }
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(global.fetch).toHaveBeenCalledTimes(1)

      const updatedProfile = { ...mockProfile, base_year: 2021 }

      act(() => {
        rerender({ profile: updatedProfile })
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(global.fetch).toHaveBeenCalledTimes(1)

      await act(async () => {
        firstSave.resolve(createMockResponse())
        await Promise.resolve()
      })

      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        resolveApiUrl('/api/v1/extractions/doc-123/draft'),
        expect.objectContaining({
          body: JSON.stringify({ profile: updatedProfile }),
        })
      )

      await act(async () => {
        secondSave.resolve(createMockResponse())
        await Promise.resolve()
      })
    })
  })
})
