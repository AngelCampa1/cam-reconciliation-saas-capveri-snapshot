import { AlertTriangle, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  TIERS,
  TIER_ORDER,
  getFeaturesForTier,
  type TierId,
  type FeatureKey,
} from '@/config/plans'
import type { UsedFeature } from '@/hooks/use-feature-usage'
import { formatTimestampDate } from '@/lib/utils'

function getTierName(tierId: string): string {
  return TIERS.find((t) => t.id === tierId)?.name ?? tierId
}

function isDowngrade(from: string | null | undefined, to: string): boolean {
  if (!from) return false
  return (TIER_ORDER[from] ?? 0) > (TIER_ORDER[to] ?? 0)
}

function getBlockedFeatures(
  targetTierId: TierId,
  usedFeatures: UsedFeature[]
): UsedFeature[] {
  const includedKeys = new Set(getFeaturesForTier(targetTierId))
  return usedFeatures.filter((f) => !includedKeys.has(f.key as FeatureKey))
}

interface ConfirmPlanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetTierId: TierId
  currentTierId: string | null | undefined
  usedFeatures: UsedFeature[]
  onConfirm: () => void
  isLoading?: boolean
}

export function ConfirmPlanDialog({
  open,
  onOpenChange,
  targetTierId,
  currentTierId,
  usedFeatures,
  onConfirm,
  isLoading,
}: ConfirmPlanDialogProps) {
  const downgrade = isDowngrade(currentTierId, targetTierId)
  const blockedFeatures = downgrade
    ? getBlockedFeatures(targetTierId, usedFeatures)
    : []
  const hasBlockedFeatures = blockedFeatures.length > 0

  const targetTierName = getTierName(targetTierId)
  const currentTierName = currentTierId ? getTierName(currentTierId) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {downgrade
              ? `Downgrade to ${targetTierName}?`
              : `Switch to ${targetTierName}`}
          </DialogTitle>
          <DialogDescription>
            {downgrade
              ? `You're currently on ${currentTierName ?? 'a higher tier'}.`
              : `You'll be taken to Stripe checkout to add billing for the ${targetTierName} plan.`}
          </DialogDescription>
        </DialogHeader>

        {hasBlockedFeatures && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-4 space-y-3">
            <div className="flex items-start gap-2 text-warning-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm font-medium">
                These features will lock when you downgrade:
              </p>
            </div>
            <ul className="space-y-1.5 pl-6">
              {blockedFeatures.map((f) => (
                <li key={f.key} className="text-sm">
                  <span className="font-medium">{f.label}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    (first used {formatTimestampDate(f.first_used_at)})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!hasBlockedFeatures && !downgrade && (
          <div className="rounded-md bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              All features in {targetTierName} are included with your current
              usage.
            </p>
          </div>
        )}

        {hasBlockedFeatures && !downgrade && (
          <div className="rounded-md bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">
              All previously used features remain accessible on {targetTierName}
              .
            </p>
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          {hasBlockedFeatures && currentTierName && (
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Keep {currentTierName}
            </Button>
          )}
          {!hasBlockedFeatures && (
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
          )}
          <Button onClick={onConfirm} disabled={isLoading}>
            {isLoading
              ? 'Opening checkout…'
              : downgrade
                ? `Continue with ${targetTierName}`
                : `Confirm and add billing`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
