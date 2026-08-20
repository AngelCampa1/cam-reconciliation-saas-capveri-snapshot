/**
 * VarianceReport component.
 *
 * Displays variance comparison with configurable threshold and export options.
 */

import { useState } from 'react'
import { Download, Filter, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ErrorState'
import { VarianceTable } from './VarianceTable'
import { useVarianceComparison, VarianceComparisonError } from '../hooks'
import { formatVariancePercent } from '@/lib/variance'
import { formatMoney } from '@/lib/money'

export interface VarianceReportProps {
  propertyId: string
  years: number[]
  useFuzzyMatching?: boolean
  onExportPDF?: () => void
  onExportExcel?: () => void
}

export function VarianceReport({
  propertyId,
  years,
  useFuzzyMatching = true,
  onExportPDF,
  onExportExcel,
}: VarianceReportProps) {
  const [threshold, setThreshold] = useState(10)
  const [showOnlySignificant, setShowOnlySignificant] = useState(false)

  const {
    data: comparison,
    isLoading,
    error,
    refetch,
  } = useVarianceComparison({
    propertyId,
    years,
    useFuzzyMatching,
  })

  const handleThresholdChange = (value: number[]) => {
    setThreshold(value[0] ?? 10)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    // A single-year property, or a year not yet finalized, has nothing to
    // compare against. That is a normal state, not a failure — show a helpful
    // empty-state (mirroring the Denominator Changes panel) instead of a red
    // alert that reads like something broke.
    if (error instanceof VarianceComparisonError && error.isNothingToCompare) {
      const sortedYears = [...years].sort((a, b) => a - b)
      const currentYear = sortedYears[sortedYears.length - 1]
      return (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              {currentYear
                ? `No prior year to compare against ${currentYear} yet`
                : 'No prior year to compare yet'}
            </p>
            <p>
              This view compares two finalized years side by side. Once this
              property has a finalized reconciliation for the year before, you
              can see how each expense pool changed.
            </p>
          </div>
        </div>
      )
    }

    return (
      <ErrorState
        size="sm"
        title="Couldn't load the variance comparison"
        action={{ onClick: () => refetch() }}
      />
    )
  }

  if (!comparison) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No variance data available.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with period info */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Statement Check Report</h3>
          <p className="text-sm text-muted-foreground">
            We checked {comparison.priorPeriod} vs {comparison.currentPeriod}.{' '}
            {comparison.isTotalNew
              ? 'We did not find a prior-year billing total to compare.'
              : `We found the billing total changed by ${formatVariancePercent(
                  comparison.totalVariancePercent
                )}.`}
          </p>
        </div>
        <div className="flex gap-2">
          {onExportPDF && (
            <Button
              onClick={onExportPDF}
              variant="outline"
              className="gap-2 rounded-full"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          )}
          {onExportExcel && (
            <Button
              onClick={onExportExcel}
              variant="outline"
              className="gap-2 rounded-full"
            >
              <Download className="h-4 w-4" />
              Download Excel
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Prior Year Total</p>
          <p className="text-lg md:text-xl lg:text-2xl font-mono tabular-nums font-semibold">
            {formatMoney(comparison.totalPriorAmount)}
          </p>
        </div>
        <div className="border rounded-lg p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Current Year Total</p>
          <p className="text-lg md:text-xl lg:text-2xl font-mono tabular-nums font-semibold">
            {formatMoney(comparison.totalCurrentAmount)}
          </p>
        </div>
        <div className="border rounded-lg p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Total Variance</p>
          <p
            className={`text-lg md:text-xl lg:text-2xl font-mono tabular-nums font-semibold ${
              comparison.isTotalNew
                ? ''
                : comparison.totalVariancePercent > 0
                  ? 'text-destructive-strong'
                  : comparison.totalVariancePercent < 0
                    ? 'text-success-strong'
                    : ''
            }`}
          >
            {formatMoney(comparison.totalVarianceAmount)}{' '}
            {comparison.isTotalNew ? (
              <span className="text-base font-sans font-medium text-muted-foreground">
                New
              </span>
            ) : (
              <>({formatVariancePercent(comparison.totalVariancePercent)})</>
            )}
          </p>
        </div>
      </div>

      {/* Filter controls */}
      <div className="border rounded-lg p-4 space-y-4 shadow-sm bg-muted/10">
        <div className="flex items-center gap-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters</span>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="threshold-slider">
                Highlight threshold: {threshold}%
              </Label>
            </div>
            <Slider
              id="threshold-slider"
              value={[threshold]}
              onValueChange={handleThresholdChange}
              min={0}
              max={100}
              step={5}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Variances exceeding this threshold will be highlighted
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-significant"
              aria-label="Show only significant variances"
              checked={showOnlySignificant}
              onCheckedChange={(checked) =>
                setShowOnlySignificant(checked === true)
              }
            />
            <Label
              htmlFor="show-significant"
              className="text-sm cursor-pointer"
            >
              Show only significant variances (&ge; {threshold}%)
            </Label>
          </div>
        </div>
      </div>

      {/* Variance table */}
      <VarianceTable
        data={comparison.items}
        highlightThreshold={threshold}
        showOnlySignificant={showOnlySignificant}
      />
      {/* Fine-print verification disclaimer */}
      <p className="mt-3 text-xs text-muted-foreground">
        This report shows what we checked. It shows what changed. Check your
        lease and GL first.
      </p>
    </div>
  )
}
