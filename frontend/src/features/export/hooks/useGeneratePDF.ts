/**
 * Hook for generating PDF exports.
 *
 * Calls the backend PDF export endpoint and returns a blob URL for preview.
 */

import { useQuery } from '@tanstack/react-query'
import { trackEvent } from '@/lib/analytics'
import { authenticatedFetch } from '@/api/authFetch'
import type { PDFExportOptions } from '../types'

interface UseGeneratePDFOptions {
  snapshotId: string
  options: PDFExportOptions
  enabled?: boolean
}

/**
 * Generate a PDF and return a blob URL for preview.
 */
export function useGeneratePDF({
  snapshotId,
  options,
  enabled = true,
}: UseGeneratePDFOptions) {
  return useQuery({
    queryKey: ['pdf-export', snapshotId, options],
    queryFn: async () => {
      // Build query parameters
      const params = new URLSearchParams()
      params.append('allow_draft', 'true') // Allow preview of draft snapshots

      // Call backend PDF export endpoint
      const response = await authenticatedFetch(
        `/api/v1/exports/reconciliation/snapshots/${snapshotId}/export/pdf?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/pdf',
          },
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to generate PDF: ${errorText}`)
      }

      // Get the PDF blob
      const blob = await response.blob()

      // Create a blob URL for the PDF viewer
      const url = URL.createObjectURL(blob)

      trackEvent('export_generated', {
        format: 'pdf',
        snapshot_id: snapshotId,
      })

      return {
        url,
        blob,
        filename:
          response.headers
            .get('Content-Disposition')
            ?.match(/filename="(.+)"/)?.[1] ||
          `reconciliation_${snapshotId}.pdf`,
      }
    },
    enabled,
    // Keep the PDF in cache for 5 minutes
    staleTime: 5 * 60 * 1000,
    // Clean up blob URL when query is removed
    gcTime: 10 * 60 * 1000,
  })
}
