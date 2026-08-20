/**
 * NOIImpactPanel: collapsible board-ready NOI impact panel.
 *
 * Shows only on finalized reconciliations. Translates the final tenant total
 * into NOI lift and asset valuation lift using adjustable cap rate.
 */

import { useState } from 'react'
import {
  TrendingUp,
  Building2,
  DollarSign,
  Loader2,
  FileDown,
  Lock,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoneyWhole } from '@/lib/money'
import { useExportBoardDownload } from '@/api/hooks'

export interface NOIImpactPanelProps {
  propertyId: string
  year: number
  totalRecovery: number
  isLocked?: boolean
  onUpgrade?: () => void
}

export function NOIImpactPanel({
  propertyId,
  year,
  totalRecovery,
  isLocked = false,
  onUpgrade,
}: NOIImpactPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  // Cap rate stored as integer tenths-of-percent to avoid float step issues
  // e.g. 70 = 7.0%, 80 = 8.0%
  const [capRateTenths, setCapRateTenths] = useState(70) // default 7.0%

  // Use toFixed(4) to avoid float imprecision (e.g. 70/1000 = 0.06999...)
  const capRate = parseFloat((capRateTenths / 1000).toFixed(4)) // 70 → 0.0700
  const capRatePercent = capRateTenths / 10 // 70 → 7.0

  // Preview values computed client-side (PDF uses authoritative backend calculation)
  const noiLift = totalRecovery
  const assetValueLift = capRate > 0 ? totalRecovery / capRate : 0

  const downloadMutation = useExportBoardDownload({
    onSuccess: () => toast.success('Board presentation downloaded'),
    onError: (error) =>
      toast.error(
        error.statusCode === 402
          ? 'Subscription required for board presentation export'
          : 'Failed to export board presentation'
      ),
  })

  return (
    <div>
      <Button
        data-testid="noi-impact-button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <TrendingUp className="h-4 w-4" aria-hidden="true" />
        NOI Impact
      </Button>

      {isOpen && (
        <Card data-testid="noi-impact-panel" className="mt-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Board-Ready NOI Impact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLocked ? (
              <div
                data-testid="noi-impact-locked"
                className="rounded-lg border border-warning/30 bg-warning/10 p-4"
              >
                <p className="text-sm text-warning-foreground">
                  Subscription required to access NOI Impact and board-ready
                  asset value lift reporting.
                </p>
                <Button
                  data-testid="noi-upgrade-button"
                  size="sm"
                  className="mt-3"
                  onClick={onUpgrade}
                >
                  <Lock className="mr-2 h-4 w-4" aria-hidden="true" />
                  Upgrade Plan
                </Button>
              </div>
            ) : (
              <>
                {/* Stat cards row */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div
                    data-testid="stat-recovery-amount"
                    className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3"
                  >
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <DollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                      Tenant Total
                    </div>
                    <div className="font-mono text-lg font-semibold tabular-nums">
                      {formatMoneyWhole(totalRecovery)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Annual total
                    </div>
                  </div>

                  <div
                    data-testid="stat-noi-lift"
                    className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3"
                  >
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                      NOI Lift
                    </div>
                    <div className="font-mono text-lg font-semibold tabular-nums">
                      {formatMoneyWhole(noiLift)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Additional annual NOI
                    </div>
                  </div>

                  <div
                    data-testid="stat-asset-value-lift"
                    className="flex flex-col gap-1 rounded-lg border border-primary/20 bg-primary/5 p-3"
                  >
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Asset Value Lift
                    </div>
                    <div className="font-mono text-lg font-semibold tabular-nums text-primary">
                      {formatMoneyWhole(assetValueLift)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      At {capRatePercent.toFixed(1)}% cap rate
                    </div>
                  </div>
                </div>

                {/* Fine-print verification disclaimer */}
                <p className="mt-2 text-xs text-muted-foreground">
                  These are modeled estimates, not your real results. Check your
                  own numbers before you act on them.
                </p>

                {/* Cap rate slider */}
                <div className="space-y-1">
                  <Label className="text-sm">
                    Cap rate assumption:{' '}
                    <span className="font-semibold">
                      {capRatePercent.toFixed(1)}%
                    </span>
                  </Label>
                  <input
                    type="range"
                    data-testid="cap-rate-slider"
                    aria-label="Cap rate assumption"
                    min="20"
                    max="120"
                    step="1"
                    value={capRateTenths}
                    onChange={(e) => setCapRateTenths(Number(e.target.value))}
                    className="w-full cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>2.0%</span>
                    <span>12.0%</span>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  <p>
                    Final tenant total adds to NOI. Dividing by the cap rate
                    gives an estimated increase in building market value.
                  </p>
                </div>

                {/* Export button */}
                <Button
                  data-testid="export-board-button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  disabled={downloadMutation.isPending}
                  onClick={() => {
                    // Guard against a double-download from a rapid second click
                    // that races ahead of the disabled state.
                    if (downloadMutation.isPending) return
                    downloadMutation.mutate({
                      property_id: propertyId,
                      year,
                      cap_rate: capRate,
                    })
                  }}
                >
                  {downloadMutation.isPending ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <FileDown className="h-4 w-4" aria-hidden="true" />
                  )}
                  Export Board Presentation
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
