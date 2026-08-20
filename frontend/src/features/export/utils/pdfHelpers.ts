/**
 * PDF helper utilities for download and print operations.
 */

/**
 * Download a PDF blob to the user's device.
 */
export function downloadPDF(blob: Blob, filename: string): void {
  // Create a temporary anchor element
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.href = url
  link.download = filename
  link.style.display = 'none'

  // Append to body, click, and clean up
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Revoke the object URL to free memory
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

/**
 * Open the browser's print dialog for a PDF blob.
 */
export function printPDF(blob: Blob): void {
  // Create a blob URL
  const url = URL.createObjectURL(blob)

  // Open in a new window
  const printWindow = window.open(url, '_blank')

  if (printWindow) {
    // Wait for PDF to load, then trigger print
    printWindow.addEventListener('load', () => {
      printWindow.print()
    })
  }

  // Clean up the URL after a delay
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/**
 * Zoom level presets for PDF viewing.
 */
export const ZOOM_PRESETS = {
  FIT_WIDTH: 'fit-width',
  FIT_PAGE: 'fit-page',
  ACTUAL_SIZE: 1.0,
  ZOOM_50: 0.5,
  ZOOM_75: 0.75,
  ZOOM_125: 1.25,
  ZOOM_150: 1.5,
  ZOOM_200: 2.0,
} as const

export type ZoomPreset = (typeof ZOOM_PRESETS)[keyof typeof ZOOM_PRESETS]

/**
 * Calculate scale for fit-width or fit-page zoom modes.
 */
export function calculateFitScale(
  mode: 'fit-width' | 'fit-page',
  containerWidth: number,
  containerHeight: number,
  pageWidth: number,
  pageHeight: number
): number {
  if (mode === 'fit-width') {
    // Add some padding (20px on each side)
    return (containerWidth - 40) / pageWidth
  }

  // Fit page - use the smaller scale to ensure entire page fits
  const widthScale = (containerWidth - 40) / pageWidth
  const heightScale = (containerHeight - 40) / pageHeight
  return Math.min(widthScale, heightScale)
}
