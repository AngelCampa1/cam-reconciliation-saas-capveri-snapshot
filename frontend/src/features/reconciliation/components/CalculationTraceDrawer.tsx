/**
 * Calculation trace drawer component for displaying calculation breakdown.
 *
 * Shows a slide-out drawer with step-by-step calculation details
 * for audit trail verification.
 */

import { Calculator, Printer } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { formatMoney } from '@/lib/money'
import type { CalculationStep } from '@/types/calculation-step'
import { CalculationStepCard } from './CalculationStepCard'

export interface CalculationTraceDrawerProps {
  isOpen: boolean
  onClose: () => void
  steps: CalculationStep[]
  finalValue: string
  tenantName?: string | undefined
  poolName?: string | undefined
  termsNote?: string | undefined
}

/**
 * Calculation trace drawer with step-by-step breakdown.
 *
 * Features:
 * - Slide-out from right side
 * - List of all calculation steps
 * - Final calculated value display
 * - Print summary button
 * - Close button and click-outside dismissal
 * - Tenant and pool context display
 */
export function CalculationTraceDrawer({
  isOpen,
  onClose,
  steps,
  finalValue,
  tenantName,
  poolName,
  termsNote,
}: CalculationTraceDrawerProps) {
  const handlePrint = () => {
    window.print()
  }
  const contextName =
    [tenantName, poolName].filter(Boolean).join(' - ') || 'This calculation'
  const stepLabel =
    steps.length === 1
      ? '1 calculation step'
      : `${steps.length} calculation steps`

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        data-testid="calculation-trace-drawer"
        className="w-full sm:max-w-[500px] overflow-y-auto"
        // The Sheet is a modal drawer (dimmed overlay + focus trap), but the
        // underlying Radix primitive does not emit aria-modal here, so set it
        // explicitly. Without it, screen readers in browse mode may wander into
        // the inert page behind the drawer.
        aria-modal
      >
        <SheetHeader>
          <SheetTitle>Calculation Breakdown</SheetTitle>
          <SheetDescription>
            {tenantName && poolName
              ? `${tenantName} - ${poolName}`
              : tenantName || poolName || 'Step-by-step calculation details'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {termsNote && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <h3 className="font-semibold">Starter lease terms</h3>
              <p className="mt-1">{termsNote}</p>
            </div>
          )}

          {steps.length === 0 ? (
            <EmptyState
              icon={Calculator}
              title="No steps yet"
              description="No calculation steps available."
              size="sm"
            />
          ) : (
            steps.map((step, index) => (
              // Key by position: raw trace steps may omit `step_order` (it is
              // derived during normalization), so it is not a stable key here.
              <CalculationStepCard key={index} step={step} />
            ))
          )}

          {/* Final Value */}
          {steps.length > 0 && (
            <div className="border-t pt-4 mt-6">
              <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg shadow-sm">
                <span className="font-bold text-lg">Final Amount:</span>
                <span className="font-mono font-bold text-lg tabular-nums">
                  {/* finalValue is the backend's exact decimal string; formatMoney
                      parses it directly (no parseFloat round-trip) so a large CAM
                      final amount keeps every digit on the audit trail (F-430). */}
                  {formatMoney(finalValue)}
                </span>
              </div>
            </div>
          )}

          {steps.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h3 className="text-sm font-semibold">Share with support</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {contextName} - {stepLabel}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Send this trace when you escalate a disputed CAM charge. Support
                gets your exact numbers. That includes the tenant, pool, and
                final amount.
              </p>
            </div>
          )}

          {/* Print Button */}
          {steps.length > 0 && (
            <div className="flex justify-end pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="gap-2"
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Print Summary
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
