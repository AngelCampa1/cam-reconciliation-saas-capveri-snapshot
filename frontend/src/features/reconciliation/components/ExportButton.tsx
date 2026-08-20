/**
 * Export button component. Opens the ExportPanel sheet.
 *
 * Follows the FinalizeButton.tsx pattern:
 * - Button with icon renders inline
 * - Clicking opens a slide-out Sheet (ExportPanel)
 */

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExportPanel } from './ExportPanel'

export interface TenantSummary {
  id: string
  name: string
  unit?: string
}

export interface ExportButtonProps {
  propertyId: string
  year: number
  tenants?: TenantSummary[]
  disabled?: boolean
  defaultTab?: string
  isBoardLocked?: boolean
  onUpgradeBoard?: () => void
}

export function ExportButton({
  propertyId,
  year,
  tenants = [],
  disabled = false,
  defaultTab,
  isBoardLocked = false,
  onUpgradeBoard,
}: ExportButtonProps) {
  const [showPanel, setShowPanel] = useState(false)

  return (
    <>
      <Button
        data-testid="export-button"
        onClick={() => setShowPanel(true)}
        disabled={disabled}
        variant="outline"
        className="gap-2"
      >
        <Download className="h-4 w-4" />
        <span>Export</span>
      </Button>

      <ExportPanel
        open={showPanel}
        onClose={() => setShowPanel(false)}
        propertyId={propertyId}
        year={year}
        tenants={tenants}
        isBoardLocked={isBoardLocked}
        {...(defaultTab !== undefined && { defaultTab })}
        {...(onUpgradeBoard !== undefined && { onUpgradeBoard })}
      />
    </>
  )
}
