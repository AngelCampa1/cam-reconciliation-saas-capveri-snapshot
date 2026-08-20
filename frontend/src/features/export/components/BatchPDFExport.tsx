/**
 * BatchPDFExport component.
 *
 * Enables exporting PDFs for multiple tenants at once,
 * either as individual files in a ZIP or as a combined multi-tenant PDF.
 */

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Download, X, AlertCircle, FileArchive, FileText } from 'lucide-react'
import { TenantSelector } from './TenantSelector'
import { useBatchPDFExport } from '../hooks/useBatchPDFExport'
import { downloadPDF } from '../utils/pdfHelpers'
import type { TenantInfo, BatchPDFExportMode, PDFExportOptions } from '../types'

export interface BatchPDFExportProps {
  snapshotId: string
  tenants: TenantInfo[]
  options: PDFExportOptions
}

export function BatchPDFExport({
  snapshotId,
  tenants,
  options,
}: BatchPDFExportProps) {
  const [selectedTenants, setSelectedTenants] = useState<string[]>([])
  const [exportMode, setExportMode] = useState<BatchPDFExportMode>('zip')
  const batchMutation = useBatchPDFExport()

  const handleExport = () => {
    if (selectedTenants.length === 0) return

    batchMutation.mutate({
      snapshotId,
      tenantIds: selectedTenants,
      mode: exportMode,
      ...options,
    })
  }

  const handleCancel = () => {
    batchMutation.cancel()
  }

  // Auto-download when complete
  useEffect(() => {
    if (batchMutation.isSuccess && batchMutation.data) {
      downloadPDF(batchMutation.data.blob, batchMutation.data.filename)
      batchMutation.reset()
    }
  }, [batchMutation.isSuccess, batchMutation.data, batchMutation])

  const progressPercentage =
    batchMutation.progress.total > 0
      ? Math.round(
          (batchMutation.progress.completed / batchMutation.progress.total) *
            100
        )
      : 0

  const formatTimeRemaining = (seconds?: number) => {
    if (!seconds) return null
    if (seconds < 60) return `${Math.round(seconds)}s remaining`
    const minutes = Math.round(seconds / 60)
    return `${minutes}m remaining`
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Select Tenants</h3>
        <TenantSelector
          tenants={tenants}
          selected={selectedTenants}
          onChange={setSelectedTenants}
        />
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Export Format</h3>
        <RadioGroup
          value={exportMode}
          onValueChange={(value) => setExportMode(value as BatchPDFExportMode)}
        >
          <div className="space-y-3">
            <div className="flex items-start space-x-3 p-3 rounded-lg border shadow-sm transition-all duration-fast hover:bg-muted/50 hover:shadow-sm cursor-pointer">
              <RadioGroupItem value="zip" id="mode-zip" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="mode-zip" className="cursor-pointer">
                  <div className="flex items-center gap-2 font-medium">
                    <FileArchive className="h-4 w-4" />
                    Individual PDFs (ZIP)
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Each tenant gets their own PDF file, packaged in a ZIP
                    archive
                  </p>
                </Label>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-lg border shadow-sm transition-all duration-fast hover:bg-muted/50 hover:shadow-sm cursor-pointer">
              <RadioGroupItem
                value="combined"
                id="mode-combined"
                className="mt-1"
              />
              <div className="flex-1">
                <Label htmlFor="mode-combined" className="cursor-pointer">
                  <div className="flex items-center gap-2 font-medium">
                    <FileText className="h-4 w-4" />
                    Combined PDF
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    All tenant reconciliations in a single PDF document
                  </p>
                </Label>
              </div>
            </div>
          </div>
        </RadioGroup>
      </div>

      {batchMutation.isPending && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Exporting{' '}
              {batchMutation.progress.currentTenant ||
                `${batchMutation.progress.completed + 1} of ${batchMutation.progress.total}`}
            </span>
            <span className="text-muted-foreground">
              {formatTimeRemaining(
                batchMutation.progress.estimatedTimeRemaining
              )}
            </span>
          </div>
          <Progress value={progressPercentage} />
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">
              {progressPercentage}% complete
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {batchMutation.isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {batchMutation.error?.message ||
              'Failed to export PDFs. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      {batchMutation.progress.errors &&
        batchMutation.progress.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-medium mb-2">
                {batchMutation.progress.errors.length} tenant(s) failed to
                export:
              </div>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {batchMutation.progress.errors.map((error) => (
                  <li key={error.tenantId}>
                    {tenants.find((t) => t.id === error.tenantId)?.name ||
                      error.tenantId}
                    : {error.error}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

      <div className="flex justify-end gap-3">
        <Button
          onClick={handleExport}
          disabled={selectedTenants.length === 0 || batchMutation.isPending}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Export {selectedTenants.length}{' '}
          {selectedTenants.length === 1 ? 'Tenant' : 'Tenants'}
        </Button>
      </div>
    </div>
  )
}
