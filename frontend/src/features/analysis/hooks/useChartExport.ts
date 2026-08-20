/**
 * Chart export hook for converting charts to downloadable images.
 */

import { useCallback, type RefObject } from 'react'
import html2canvas from 'html2canvas'
import { logger } from '@/lib/logger'

export interface UseChartExportReturn {
  exportAsImage: (filename: string) => Promise<void>
  isExporting: boolean
}

export function useChartExport(
  chartRef: RefObject<HTMLDivElement>
): UseChartExportReturn {
  const exportAsImage = useCallback(
    async (filename: string) => {
      if (!chartRef.current) {
        logger.warn('Chart export skipped - ref not available', { filename })
        return
      }

      try {
        const canvas = await html2canvas(chartRef.current, {
          backgroundColor: getComputedStyle(document.documentElement)
            .getPropertyValue('--background')
            .trim()
            ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--background').trim()})`
            : 'hsl(222.2 84% 4.9%)',
          scale: 2, // Higher resolution
        })

        const link = document.createElement('a')
        link.download = `${filename}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
      } catch (error) {
        logger.error('Chart export failed', { filename, error })
        throw error
      }
    },
    [chartRef]
  )

  return {
    exportAsImage,
    isExporting: false, // Could be enhanced to track export state
  }
}
