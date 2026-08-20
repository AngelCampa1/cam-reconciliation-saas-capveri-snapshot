/**
 * PDFPreviewModal: Dialog with iframe PDF viewer and download button.
 *
 * Accepts a blob URL from useExportPdfPreview and displays it in an
 * iframe for inline viewing before downloading.
 */

import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useExportPdfDownload } from '@/api/hooks'

export interface PDFPreviewModalProps {
  open: boolean
  blobUrl?: string | undefined
  propertyId: string
  year: number
  includeCharts?: boolean
  includeNotes?: boolean
  onClose: () => void
}

export function PDFPreviewModal({
  open,
  blobUrl,
  propertyId,
  year,
  includeCharts = false,
  includeNotes = false,
  onClose,
}: PDFPreviewModalProps) {
  const downloadMutation = useExportPdfDownload()

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        data-testid="pdf-preview-modal"
        showCloseButton={false}
        className="max-w-4xl w-full h-[85vh] flex flex-col p-0"
      >
        <DialogHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between">
          <DialogTitle>PDF Preview</DialogTitle>
          <DialogDescription className="sr-only">
            Preview the reconciliation statement before downloading
          </DialogDescription>
          <div className="flex items-center gap-2">
            <Button
              data-testid="download-button"
              size="sm"
              variant="outline"
              disabled={downloadMutation.isPending}
              onClick={() =>
                downloadMutation.mutate({
                  property_id: propertyId,
                  year,
                  include_charts: includeCharts,
                  include_notes: includeNotes,
                })
              }
            >
              <Download className="h-4 w-4 mr-1" aria-hidden="true" />
              Download
            </Button>
            <Button
              data-testid="close-preview"
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close preview"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden px-4 pb-4">
          {blobUrl ? (
            <iframe
              data-testid="pdf-viewer"
              src={blobUrl}
              className="w-full h-full border-0 rounded"
              title="PDF Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No PDF to preview
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
