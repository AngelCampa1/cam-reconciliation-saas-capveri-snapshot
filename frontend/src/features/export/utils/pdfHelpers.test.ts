/**
 * Tests for PDF helper utilities.
 *
 * Validates PDF download, print, and zoom calculation functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  downloadPDF,
  printPDF,
  calculateFitScale,
  ZOOM_PRESETS,
} from './pdfHelpers'

describe('pdfHelpers', () => {
  describe('downloadPDF', () => {
    let createElementSpy: ReturnType<typeof vi.spyOn>
    let appendChildSpy: ReturnType<typeof vi.spyOn>
    let removeChildSpy: ReturnType<typeof vi.spyOn>
    let mockAnchor: HTMLAnchorElement

    beforeEach(() => {
      mockAnchor = {
        href: '',
        download: '',
        style: { display: '' },
        click: vi.fn(),
      } as unknown as HTMLAnchorElement

      createElementSpy = vi
        .spyOn(document, 'createElement')
        .mockReturnValue(mockAnchor)
      appendChildSpy = vi
        .spyOn(document.body, 'appendChild')
        .mockImplementation(() => mockAnchor)
      removeChildSpy = vi
        .spyOn(document.body, 'removeChild')
        .mockImplementation(() => mockAnchor)

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.restoreAllMocks()
      vi.useRealTimers()
    })

    it('creates a download link and triggers download', () => {
      const blob = new Blob(['test'], { type: 'application/pdf' })
      const filename = 'test.pdf'

      downloadPDF(blob, filename)

      expect(createElementSpy).toHaveBeenCalledWith('a')
      expect(mockAnchor.download).toBe(filename)
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(appendChildSpy).toHaveBeenCalledWith(mockAnchor)
      expect(removeChildSpy).toHaveBeenCalledWith(mockAnchor)
    })

    it('revokes object URL after timeout', () => {
      const blob = new Blob(['test'], { type: 'application/pdf' })

      downloadPDF(blob, 'test.pdf')

      expect(URL.revokeObjectURL).not.toHaveBeenCalled()

      vi.advanceTimersByTime(100)

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    })
  })

  describe('printPDF', () => {
    let mockPrintWindow: Window

    beforeEach(() => {
      mockPrintWindow = {
        print: vi.fn(),
        addEventListener: vi.fn((event, callback) => {
          if (event === 'load') {
            // Simulate immediate load for testing
            setTimeout(callback, 0)
          }
        }),
      } as unknown as Window

      vi.spyOn(window, 'open').mockReturnValue(mockPrintWindow)
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.restoreAllMocks()
      vi.useRealTimers()
    })

    it('opens print window with PDF blob', () => {
      const blob = new Blob(['test'], { type: 'application/pdf' })

      printPDF(blob)

      expect(window.open).toHaveBeenCalledWith('blob:mock-url', '_blank')
    })

    it('triggers print when window loads', async () => {
      const blob = new Blob(['test'], { type: 'application/pdf' })

      printPDF(blob)

      // Advance timers to trigger the load event callback
      await vi.advanceTimersByTimeAsync(1)

      expect(mockPrintWindow.print).toHaveBeenCalled()
    })

    it('revokes object URL after delay', () => {
      const blob = new Blob(['test'], { type: 'application/pdf' })

      printPDF(blob)

      expect(URL.revokeObjectURL).not.toHaveBeenCalled()

      vi.advanceTimersByTime(10000)

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    })
  })

  describe('ZOOM_PRESETS', () => {
    it('exports zoom preset constants', () => {
      expect(ZOOM_PRESETS.FIT_WIDTH).toBe('fit-width')
      expect(ZOOM_PRESETS.FIT_PAGE).toBe('fit-page')
      expect(ZOOM_PRESETS.ACTUAL_SIZE).toBe(1.0)
      expect(ZOOM_PRESETS.ZOOM_50).toBe(0.5)
      expect(ZOOM_PRESETS.ZOOM_200).toBe(2.0)
    })
  })

  describe('calculateFitScale', () => {
    it('calculates fit-width scale with padding', () => {
      const scale = calculateFitScale('fit-width', 1000, 800, 800, 1000)

      // (1000 - 40) / 800 = 1.2
      expect(scale).toBe(1.2)
    })

    it('calculates fit-page scale using smaller dimension', () => {
      const scale = calculateFitScale('fit-page', 1000, 600, 800, 1000)

      // Width scale: (1000 - 40) / 800 = 1.2
      // Height scale: (600 - 40) / 1000 = 0.56
      // Should use smaller scale (0.56)
      expect(scale).toBe(0.56)
    })

    it('calculates fit-page scale when width is limiting', () => {
      const scale = calculateFitScale('fit-page', 500, 1000, 800, 600)

      // Width scale: (500 - 40) / 800 = 0.575
      // Height scale: (1000 - 40) / 600 = 1.6
      // Should use smaller scale (0.575)
      expect(scale).toBe(0.575)
    })
  })
})
