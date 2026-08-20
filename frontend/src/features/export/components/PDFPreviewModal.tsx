/**
 * PDFPreviewModal component.
 *
 * Modal for previewing generated PDF exports with zoom, navigation, download, and print.
 */

import { useState, useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PDFViewer } from '@/components/hitl/PDFViewer'
import { PDFPreviewControls } from './PDFPreviewControls'
import { useGeneratePDF } from '../hooks/useGeneratePDF'
import { downloadPDF, printPDF } from '../utils/pdfHelpers'
import type { PDFExportOptions } from '../types'

interface PDFPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  snapshotId: string
  options: PDFExportOptions
}

export function PDFPreviewModal({
  isOpen,
  onClose,
  snapshotId,
  options,
}: PDFPreviewModalProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.0)

  // Generate PDF when modal opens
  const { data, isLoading, error, refetch } = useGeneratePDF({
    snapshotId,
    options,
    enabled: isOpen,
  })

  // Reset state when modal closes (prepares for next open)
  useEffect(() => {
    if (!isOpen) {
      // Intentionally reset state on modal close to prepare for next open
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentPage(1)
      setScale(1.0)
    }
  }, [isOpen])

  const handleDownload = () => {
    if (data?.blob && data?.filename) {
      downloadPDF(data.blob, data.filename)
    }
  }

  const handlePrint = () => {
    if (data?.blob) {
      printPDF(data.blob)
    }
  }

  const handleRetry = () => {
    refetch()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>PDF Preview</DialogTitle>
          <DialogDescription>
            Preview the generated reconciliation statement before downloading
          </DialogDescription>
        </DialogHeader>

        {/* Loading State */}
        {isLoading && (
          <div
            className="flex-1 p-6"
            role="status"
            aria-label="Generating PDF preview"
          >
            <Skeleton className="w-full h-full" aria-hidden="true" />
            <p className="text-center text-sm text-muted-foreground mt-4">
              Generating PDF...
            </p>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <AlertCircle
              className="h-12 w-12 text-destructive"
              aria-hidden="true"
            />
            <div className="text-center">
              <p className="font-medium text-destructive-strong">
                Failed to generate PDF
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {error instanceof Error ? error.message : 'An error occurred'}
              </p>
            </div>
            <Button variant="outline" onClick={handleRetry}>
              Retry
            </Button>
          </div>
        )}

        {/* PDF Preview */}
        {data && !isLoading && !error && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <PDFPreviewControls
              scale={scale}
              onScaleChange={setScale}
              onDownload={handleDownload}
              onPrint={handlePrint}
            />

            <div className="flex-1 overflow-hidden">
              <PDFViewer
                url={data.url}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                scale={scale}
                className="h-full"
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
