/**
 * DemandLetterButton. Opens the billing document sheet.
 *
 * Follows the ExportButton.tsx pattern:
 * - Button with icon renders inline
 * - Clicking opens a slide-out Sheet (DemandLetterPanel)
 * - Disabled when not finalized or no tenant snapshots exist
 */

import { useState } from 'react'
import { Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DemandLetterPanel } from './DemandLetterPanel'
import { trackEvent } from '@/lib/analytics'

export interface DemandLetterButtonProps {
  propertyId: string
  year: number
  tenants?: Array<{
    id: string
    name: string
    unit?: string
    total_recovery?: number
  }>
  isFinalized?: boolean
  disabled?: boolean
}

export function DemandLetterButton({
  propertyId,
  year,
  tenants = [],
  isFinalized = false,
  disabled = false,
}: DemandLetterButtonProps) {
  const [showPanel, setShowPanel] = useState(false)

  const isDisabled = disabled || !isFinalized || tenants.length === 0

  return (
    <>
      <Button
        data-testid="demand-letter-button"
        onClick={() => {
          trackEvent('demand_letter_panel_opened', {
            property_id: propertyId,
            year,
            tenant_count: tenants.length,
          })
          setShowPanel(true)
        }}
        disabled={isDisabled}
        variant="outline"
        className="gap-2"
      >
        <Scale className="h-4 w-4" />
        Billing Document
      </Button>

      <DemandLetterPanel
        open={showPanel}
        onClose={() => setShowPanel(false)}
        propertyId={propertyId}
        year={year}
        tenants={tenants}
      />
    </>
  )
}
