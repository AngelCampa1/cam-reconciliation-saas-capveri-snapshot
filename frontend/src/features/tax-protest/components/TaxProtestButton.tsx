/**
 * TaxProtestButton - opens the TaxProtestPanel sheet.
 *
 * Follows the DemandLetterButton pattern.
 */
import { useState } from 'react'
import { Landmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TaxProtestPanel } from './TaxProtestPanel'

export interface TaxProtestButtonProps {
  snapshotId: string
  disabled?: boolean
}

export function TaxProtestButton({
  snapshotId,
  disabled = false,
}: TaxProtestButtonProps) {
  const [showPanel, setShowPanel] = useState(false)

  return (
    <>
      <Button
        data-testid="tax-protest-button"
        onClick={() => setShowPanel(true)}
        disabled={disabled}
        variant="outline"
        className="gap-2"
      >
        <Landmark className="h-4 w-4" />
        Tax Protest
      </Button>

      <TaxProtestPanel
        open={showPanel}
        onClose={() => setShowPanel(false)}
        snapshotId={snapshotId}
      />
    </>
  )
}
