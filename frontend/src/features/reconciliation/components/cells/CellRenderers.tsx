/**
 * Specialized cell renderer components for the reconciliation grid.
 *
 * Handles currency, percentage, text, status, and difference cell types
 * with proper formatting, styling, and null handling.
 */

import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ReconciliationStatus } from '@/types/enums'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'

/**
 * CurrencyCell - Formats decimal string values as USD currency
 */
export interface CurrencyCellProps {
  value: string | null | undefined
}

export function CurrencyCell({ value }: CurrencyCellProps) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">--</span>
  }

  // Format the backend's exact decimal money string directly. Routing through
  // parseFloat first would coerce it to a JS float and reintroduce drift on the
  // large CAM totals landlords reconcile against (F-430).
  const formatted = formatMoney(value, 'usd', { maximumFractionDigits: 2 })

  return <span className="font-mono text-right tabular-nums">{formatted}</span>
}

/**
 * PercentageCell - Formats numeric values as percentages
 */
export interface PercentageCellProps {
  value: number | null | undefined
  is100Scale?: boolean
  decimalPlaces?: number
}

export function PercentageCell({
  value,
  is100Scale = false,
  decimalPlaces = 1,
}: PercentageCellProps) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">--</span>
  }

  const percentValue = is100Scale ? value : value * 100
  const formatted = percentValue.toFixed(decimalPlaces)

  return <span className="font-mono text-right tabular-nums">{formatted}%</span>
}

/**
 * TextCell - Renders text with truncation and tooltip
 */
export interface TextCellProps {
  value: string | null | undefined
  maxLength?: number
}

export function TextCell({ value, maxLength = 50 }: TextCellProps) {
  if (!value) {
    return <span className="text-muted-foreground">--</span>
  }

  const isTruncated = value.length > maxLength
  const displayValue = isTruncated ? value.slice(0, maxLength) + '...' : value

  if (isTruncated) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="truncate block max-w-full">{displayValue}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs break-words">{value}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return <span>{value}</span>
}

/**
 * StatusCell - Displays colored badges for reconciliation status
 */
export interface StatusCellProps {
  status: ReconciliationStatus
}

export function StatusCell({ status }: StatusCellProps) {
  const statusConfig: Record<
    ReconciliationStatus,
    {
      label: string
      variant: 'default' | 'secondary' | 'destructive' | 'outline'
    }
  > = {
    [ReconciliationStatus.DRAFT]: {
      label: 'Draft',
      variant: 'secondary',
    },
    [ReconciliationStatus.FINALIZED]: {
      label: 'Finalized',
      variant: 'default',
    },
  }

  const config = statusConfig[status]

  return (
    <Badge variant={config.variant} data-status={status}>
      {config.label}
    </Badge>
  )
}

/**
 * DifferenceCell - Shows positive (green) vs negative (red) variances
 */
export interface DifferenceCellProps {
  value: string | null | undefined
}

export function DifferenceCell({ value }: DifferenceCellProps) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">--</span>
  }

  // Format the exact decimal magnitude without a float round-trip (F-430). The
  // numeric parse below is used ONLY for the sign/zero comparison that drives
  // color and the +/- prefix, never for the displayed digits.
  const numValue = parseFloat(value)
  const magnitude = value.trim().replace(/^[+-]/, '')
  const formatted = formatMoney(magnitude, 'usd', { maximumFractionDigits: 2 })

  // Determine color and sign. Zero (and signed-zero "-0", which parseFloat
  // yields as -0) falls through to the neutral muted branch with no sign.
  let colorClass = 'text-muted-foreground'
  let sign = ''

  if (numValue > 0) {
    colorClass = 'text-success-strong'
    sign = '+'
  } else if (numValue < 0) {
    colorClass = 'text-destructive-strong'
    sign = '-'
  }

  return (
    <span className={cn('font-mono text-right tabular-nums', colorClass)}>
      {sign}
      {formatted}
    </span>
  )
}
