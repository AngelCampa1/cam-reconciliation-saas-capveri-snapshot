/**
 * VarianceTable component.
 *
 * Displays variance comparison with color-coded highlighting.
 */

import { ArrowDown, ArrowUp, Minus, BarChart2, Sparkles } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { VarianceItem } from '../types'
import { formatVariancePercent } from '@/lib/variance'
import { useViewport } from '@/hooks/useViewport'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

export interface VarianceTableProps {
  data: VarianceItem[]
  highlightThreshold: number
  showOnlySignificant?: boolean
}

export function VarianceTable({
  data,
  highlightThreshold,
  showOnlySignificant = false,
}: VarianceTableProps) {
  const { isMobile } = useViewport()

  const getVarianceColor = (variancePercent: number): string => {
    const absPercent = Math.abs(variancePercent)
    if (absPercent < highlightThreshold) return ''
    // Use the AA-passing dark tokens for the variance figures: the bright
    // `text-destructive` (hsl(0 84% 60%)) and `text-success` (hsl(142 76% 36%))
    // both fail WCAG AA on white for normal-size text. Matches the disputes
    // surface (F-287/F-381).
    return variancePercent > 0
      ? 'text-destructive-strong'
      : 'text-success-strong'
  }

  const getVarianceIcon = (variancePercent: number) => {
    if (variancePercent > 0) {
      return <ArrowUp className="h-3 w-3" />
    } else if (variancePercent < 0) {
      return <ArrowDown className="h-3 w-3" />
    }
    return <Minus className="h-3 w-3" />
  }

  const getVarianceLabel = (variancePercent: number): string => {
    const absPercent = Math.abs(variancePercent)
    if (absPercent < 0.01) return 'No Change'
    return variancePercent > 0 ? 'Increase' : 'Decrease'
  }

  const isSignificant = (variancePercent: number): boolean => {
    return Math.abs(variancePercent) >= highlightThreshold
  }

  const filteredData = showOnlySignificant
    ? data.filter((item) => item.isNew || isSignificant(item.variancePercent))
    : data

  if (filteredData.length === 0) {
    return showOnlySignificant ? (
      <EmptyState
        icon={BarChart2}
        title="Nothing above threshold"
        description={`No variances exceed the ${highlightThreshold}% threshold`}
        size="sm"
      />
    ) : (
      <EmptyState
        icon={BarChart2}
        title="No variance data"
        description="No variance data available."
        size="sm"
      />
    )
  }

  if (isMobile) {
    return (
      <div className="space-y-3" data-testid="mobile-cards-view">
        {filteredData.map((item) => {
          const colorClass = item.isNew
            ? ''
            : getVarianceColor(item.variancePercent)
          const isHighlighted =
            !item.isNew && isSignificant(item.variancePercent)

          return (
            <div
              key={item.poolId}
              className={cn(
                'rounded-lg border p-4',
                isHighlighted && 'bg-muted/50'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium">{item.poolName}</span>
                {item.isNew ? (
                  <Badge variant="secondary" className="gap-1 shrink-0">
                    <Sparkles className="h-3 w-3" />
                    New
                  </Badge>
                ) : (
                  <Badge
                    variant={
                      item.variancePercent > 0
                        ? 'destructive'
                        : item.variancePercent < 0
                          ? 'outline'
                          : 'secondary'
                    }
                    className="gap-1 shrink-0"
                  >
                    {getVarianceIcon(item.variancePercent)}
                    {getVarianceLabel(item.variancePercent)}
                  </Badge>
                )}
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prior Year</span>
                  <span className="font-mono tabular-nums">
                    {formatMoney(item.priorAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Year</span>
                  <span className="font-mono tabular-nums">
                    {formatMoney(item.currentAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Variance ($)</span>
                  <span
                    className={cn(
                      'font-mono tabular-nums font-medium',
                      colorClass
                    )}
                  >
                    {formatMoney(item.varianceAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Variance (%)</span>
                  <span className={cn('font-medium', colorClass)}>
                    {item.isNew
                      ? 'New'
                      : formatVariancePercent(item.variancePercent)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className="border rounded-lg shadow-sm"
      data-testid="desktop-table-view"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Expense Pool</TableHead>
            <TableHead className="text-right">Prior Year</TableHead>
            <TableHead className="text-right">Current Year</TableHead>
            <TableHead className="text-right">Variance ($)</TableHead>
            <TableHead className="text-right">Variance (%)</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredData.map((item) => {
            const colorClass = item.isNew
              ? ''
              : getVarianceColor(item.variancePercent)
            const isHighlighted =
              !item.isNew && isSignificant(item.variancePercent)

            return (
              <TableRow
                key={item.poolId}
                className={isHighlighted ? 'bg-muted/50' : ''}
              >
                <TableCell className="font-medium">{item.poolName}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatMoney(item.priorAmount)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatMoney(item.currentAmount)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-mono tabular-nums font-medium',
                    colorClass
                  )}
                >
                  {formatMoney(item.varianceAmount)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-mono tabular-nums font-medium',
                    colorClass
                  )}
                >
                  {item.isNew
                    ? 'New'
                    : formatVariancePercent(item.variancePercent)}
                </TableCell>
                <TableCell>
                  {item.isNew ? (
                    <Badge variant="secondary" className="gap-1">
                      <Sparkles className="h-3 w-3" />
                      New
                    </Badge>
                  ) : (
                    <Badge
                      variant={
                        item.variancePercent > 0
                          ? 'destructive'
                          : item.variancePercent < 0
                            ? 'outline'
                            : 'secondary'
                      }
                      className="gap-1"
                    >
                      {getVarianceIcon(item.variancePercent)}
                      {getVarianceLabel(item.variancePercent)}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
