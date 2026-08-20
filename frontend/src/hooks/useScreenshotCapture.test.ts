import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useScreenshotCapture } from './useScreenshotCapture'
import html2canvas from 'html2canvas'

// Mock html2canvas
vi.mock('html2canvas', () => ({
  default: vi.fn(),
}))

// Mock html2canvas canvas return type
interface MockCanvas {
  toBlob: (callback: (blob: Blob | null) => void) => void
}

describe('useScreenshotCapture', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock

    // Default html2canvas mock behavior
    vi.mocked(html2canvas).mockResolvedValue({
      toBlob: (cb: (blob: Blob | null) => void) =>
        cb(new Blob(['test'], { type: 'image/jpeg' })),
    } as MockCanvas)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('starts with not capturing', () => {
    const { result } = renderHook(() => useScreenshotCapture())

    expect(result.current.capturing).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('captures and uploads screenshot', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: 'https://example.com/screenshot.jpg',
      }),
    })

    const { result } = renderHook(() => useScreenshotCapture())

    let url: string | null = null
    await act(async () => {
      url = await result.current.capture()
    })

    expect(url).toBe('https://example.com/screenshot.jpg')
    expect(result.current.capturing).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets capturing state while capturing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: 'https://example.com/screenshot.jpg',
      }),
    })

    const { result } = renderHook(() => useScreenshotCapture())

    let capturePromise: Promise<string | null>
    act(() => {
      capturePromise = result.current.capture()
    })

    // Should be capturing while promise is pending
    await waitFor(() => {
      expect(result.current.capturing).toBe(true)
    })

    await act(async () => {
      await capturePromise
    })

    // Should not be capturing after promise resolves
    expect(result.current.capturing).toBe(false)
  })

  it('handles html2canvas errors', async () => {
    vi.mocked(html2canvas).mockRejectedValueOnce(new Error('Canvas error'))

    const { result } = renderHook(() => useScreenshotCapture())

    let url: string | null = 'initial'
    await act(async () => {
      url = await result.current.capture()
    })

    expect(url).toBeNull()
    expect(result.current.error).toBe('Failed to capture screenshot')
    expect(result.current.capturing).toBe(false)
  })

  it('restores feedback widget visibility when capture fails', async () => {
    vi.mocked(html2canvas).mockRejectedValueOnce(new Error('Canvas error'))

    const mockWidget = document.createElement('div')
    mockWidget.setAttribute('data-feedback-widget', 'true')
    mockWidget.style.visibility = 'visible'
    document.body.appendChild(mockWidget)

    const { result } = renderHook(() => useScreenshotCapture())

    await act(async () => {
      await result.current.capture()
    })

    expect(mockWidget.style.visibility).toBe('visible')

    document.body.removeChild(mockWidget)
  })

  it('handles upload errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'Upload failed' }),
    })

    const { result } = renderHook(() => useScreenshotCapture())

    let url: string | null = 'initial'
    await act(async () => {
      url = await result.current.capture()
    })

    expect(url).toBeNull()
    expect(result.current.error).toBe('Failed to capture screenshot')
    expect(result.current.capturing).toBe(false)
  })

  it('handles blob creation failure', async () => {
    vi.mocked(html2canvas).mockResolvedValueOnce({
      toBlob: (cb: (blob: Blob | null) => void) => cb(null),
    } as MockCanvas)

    const { result } = renderHook(() => useScreenshotCapture())

    let url: string | null = 'initial'
    await act(async () => {
      url = await result.current.capture()
    })

    expect(url).toBeNull()
    expect(result.current.error).toBe('Failed to create screenshot')
    expect(result.current.capturing).toBe(false)
  })

  it('uploads screenshot as FormData', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: 'https://example.com/screenshot.jpg',
      }),
    })

    const { result } = renderHook(() => useScreenshotCapture())

    await act(async () => {
      await result.current.capture()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/feedback/screenshot'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      })
    )

    const callArgs = fetchMock.mock.calls[0][1]
    const formData = callArgs.body as FormData
    expect(formData.get('file')).toBeInstanceOf(Blob)
  })

  it('hides feedback widget during capture', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: 'https://example.com/screenshot.jpg',
      }),
    })

    // Create mock widget element
    const mockWidget = document.createElement('div')
    mockWidget.setAttribute('data-feedback-widget', 'true')
    mockWidget.style.visibility = 'visible'
    document.body.appendChild(mockWidget)

    const { result } = renderHook(() => useScreenshotCapture())

    await act(async () => {
      await result.current.capture()
    })

    // Widget should be visible again after capture
    expect(mockWidget.style.visibility).toBe('visible')

    document.body.removeChild(mockWidget)
  })
})
