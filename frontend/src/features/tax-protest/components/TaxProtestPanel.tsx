/**
 * TaxProtestPanel - slide-out sheet for generating the tax protest data package.
 *
 * Fields:
 *   - tax_year: number (default: currentYear - 1)
 *   - county: optional override
 *   - state: optional override
 */
import { useState } from 'react'
import { Loader2, Landmark } from 'lucide-react'
import { toast } from 'sonner'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

import { useTaxProtestExport } from '@/api/hooks'

export interface TaxProtestPanelProps {
  open: boolean
  onClose: () => void
  snapshotId: string
}

export function TaxProtestPanel({
  open,
  onClose,
  snapshotId,
}: TaxProtestPanelProps) {
  const currentYear = new Date().getFullYear()
  const [taxYear, setTaxYear] = useState(currentYear - 1)
  const [county, setCounty] = useState('')
  const [state, setState] = useState('')

  const exportMutation = useTaxProtestExport({
    onSuccess: () => {
      toast.success('Tax protest package downloaded')
      onClose()
    },
    onError: (err) => {
      if (err.statusCode === 402) {
        toast.error('Subscription required for tax protest package')
      } else {
        toast.error('Failed to generate tax protest package')
      }
    },
  })

  function handleGenerate() {
    exportMutation.mutate({
      snapshot_id: snapshotId,
      tax_year: taxYear,
      ...(county.trim() ? { county: county.trim() } : {}),
      ...(state.trim() ? { state: state.trim() } : {}),
    })
  }

  if (!open) return null

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            <Landmark className="mr-2 inline h-4 w-4" />
            Tax Protest Data Package
          </SheetTitle>
          <SheetDescription>
            Generate the tax protest export package for a reconciliation
            snapshot, with optional county and state overrides.
          </SheetDescription>
        </SheetHeader>

        <div data-testid="tax-protest-panel" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate a ZIP with expense summary, GL by category, year-over-year
            comparison, and county cover sheet for your tax protest filing.
          </p>

          <div className="space-y-2">
            <Label htmlFor="tax-year">Tax Year</Label>
            <Input
              id="tax-year"
              data-testid="tax-year-input"
              type="number"
              value={taxYear}
              min={2000}
              max={currentYear - 1}
              onChange={(e) => setTaxYear(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="county-override">
              County Override{' '}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="county-override"
              data-testid="county-override-input"
              type="text"
              placeholder="e.g. Harris"
              value={county}
              onChange={(e) => setCounty(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="state-override">
              State Override{' '}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="state-override"
              data-testid="state-override-input"
              type="text"
              placeholder="e.g. TX"
              maxLength={2}
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
            />
          </div>

          <Button
            data-testid="generate-button"
            className="w-full"
            disabled={exportMutation.isPending}
            onClick={handleGenerate}
          >
            {exportMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Landmark className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Generate Package
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
