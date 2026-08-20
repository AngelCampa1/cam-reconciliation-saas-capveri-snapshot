/**
 * Tests for useChartExport hook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useChartExport } from './useChartExport'
import { createRef } from 'react'
import html2canvas from 'html2canvas'

// Mock html2canvas
vi.mock('html2canvas')

describe('useChartExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exports chart as image when ref is available', async () => {
    const mockCanvas = {
      toDataURL: vi.fn(() => 'data:image/png;base64,mockdata'),
    }
    vi.mocked(html2canvas).mockResolvedValue(
      mockCanvas as unknown as HTMLCanvasElement
    )

    const mockElement = document.createElement('div')
    const chartRef = createRef<HTMLDivElement>()
    Object.defineProperty(chartRef, 'current', {
      value: mockElement,
      writable: true,
    })

    const { result } = renderHook(() => useChartExport(chartRef))

    // Mock link click
    const mockClick = vi.fn()
    const createElement = vi.spyOn(document, 'createElement')
    createElement.mockReturnValue({
      click: mockClick,
      download: '',
      href: '',
    } as unknown as HTMLElement)

    await result.current.exportAsImage('test-chart')

    expect(html2canvas).toHaveBeenCalledWith(mockElement, {
      backgroundColor: 'hsl(222.2 84% 4.9%)',
      scale: 2,
    })
    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png')
    expect(mockClick).toHaveBeenCalled()

    createElement.mockRestore()
  })

  it('does nothing when ref is null', async () => {
    const chartRef = createRef<HTMLDivElement>()

    const { result } = renderHook(() => useChartExport(chartRef))

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await result.current.exportAsImage('test-chart')

    expect(html2canvas).not.toHaveBeenCalled()
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('WARN:'),
      expect.objectContaining({ filename: 'test-chart' })
    )

    consoleWarn.mockRestore()
  })

  it('throws error when html2canvas fails', async () => {
    vi.mocked(html2canvas).mockRejectedValue(new Error('Canvas error'))

    const mockElement = document.createElement('div')
    const chartRef = createRef<HTMLDivElement>()
    Object.defineProperty(chartRef, 'current', {
      value: mockElement,
      writable: true,
    })

    const { result } = renderHook(() => useChartExport(chartRef))

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(result.current.exportAsImage('test-chart')).rejects.toThrow(
      'Canvas error'
    )

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('ERROR:'),
      expect.objectContaining({
        filename: 'test-chart',
        error: expect.any(Object),
      })
    )

    consoleError.mockRestore()
  })

  it('returns isExporting as false', () => {
    const chartRef = createRef<HTMLDivElement>()
    const { result } = renderHook(() => useChartExport(chartRef))

    expect(result.current.isExporting).toBe(false)
  })
})
