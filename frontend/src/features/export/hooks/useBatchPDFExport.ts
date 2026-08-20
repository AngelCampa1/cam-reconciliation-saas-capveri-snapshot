/**
 * Hook for batch PDF export with progress tracking.
 *
 * Supports both ZIP (individual PDFs) and combined PDF modes.
 * Provides real-time progress updates and cancellation support.
 */

import { useMutation } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { authenticatedFetch } from '@/api/authFetch'
import type { BatchPDFExportOptions, BatchPDFProgress } from '../types'

interface BatchPDFExportResult {
  url: string
  blob: Blob
  filename: string
}

export function useBatchPDFExport() {
  const [progress, setProgress] = useState<BatchPDFProgress>({
    completed: 0,
    total: 0,
  })
  const abortControllerRef = useRef<AbortController | null>(null)

  const mutation = useMutation<
    BatchPDFExportResult,
    Error,
    BatchPDFExportOptions
  >({
    mutationFn: async (options) => {
      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController()

      // Initialize progress
      setProgress({
        completed: 0,
        total: options.tenantIds.length,
        errors: [],
      })

      const startTime = Date.now()

      // Build query params
      const params = new URLSearchParams({
        mode: options.mode,
        include_cover_page: options.includeCoverPage.toString(),
        include_calculation_details:
          options.includeCalculationDetails.toString(),
      })

      // Add tenant IDs to params
      options.tenantIds.forEach((id) => {
        params.append('tenant_ids', id)
      })

      const endpoint = `/api/v1/exports/reconciliation/snapshots/${options.snapshotId}/export/batch-pdf?${params}`

      const response = await authenticatedFetch(endpoint, {
        method: 'GET',
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData.detail || `Export failed: ${response.statusText}`
        )
      }

      // Get progress from headers if available
      const totalTenants = parseInt(
        response.headers.get('X-Total-Tenants') || '0'
      )
      const completedTenants = parseInt(
        response.headers.get('X-Completed-Tenants') || '0'
      )
      const currentTenant =
        response.headers.get('X-Current-Tenant') || undefined

      // Calculate estimated time remaining
      const elapsedTime = (Date.now() - startTime) / 1000
      const estimatedTimeRemaining =
        completedTenants > 0
          ? ((totalTenants - completedTenants) * elapsedTime) / completedTenants
          : undefined

      setProgress({
        completed: completedTenants,
        total: totalTenants,
        ...(currentTenant && { currentTenant }),
        ...(estimatedTimeRemaining !== undefined && { estimatedTimeRemaining }),
        errors: [],
      })

      const blob = await response.blob()

      // Determine filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = 'reconciliation-export'

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/)
        if (filenameMatch?.[1]) {
          filename = filenameMatch[1]
        }
      } else {
        // Default filename based on mode
        const extension = options.mode === 'zip' ? 'zip' : 'pdf'
        const timestamp = new Date().toISOString().split('T')[0]
        filename = `reconciliation-batch-${timestamp}.${extension}`
      }

      const url = URL.createObjectURL(blob)

      // Mark as complete
      setProgress((prev) => ({
        ...prev,
        completed: totalTenants || options.tenantIds.length,
      }))

      return { url, blob, filename }
    },
    onError: () => {
      // Reset progress on error
      setProgress({ completed: 0, total: 0 })
    },
  })

  const cancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    mutation.reset()
    setProgress({ completed: 0, total: 0 })
  }

  return {
    ...mutation,
    progress,
    cancel,
  }
}
