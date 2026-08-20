/**
 * Year-over-Year Comparison Page
 *
 * Displays side-by-side comparison of expense pools across multiple years
 * with variance calculations and color-coding.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import {
  useAvailableYears,
  useYearOverYearComparison,
} from '@/features/analysis/hooks/useYearOverYear'
import {
  formatAmount,
  formatVarianceAmount,
  formatVariancePercent,
  getVarianceColor,
  getVarianceBgColor,
} from '@/features/analysis/utils/variance'
import {
  AlertTriangle,
  BarChart3,
  Download,
  FileText,
  Loader2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader, PageContainer } from '@/components/layout'

interface Property {
  id: string
  name: string
}

export function YearOverYearPage() {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('')
  const [selectedYears, setSelectedYears] = useState<number[]>([])
  const [useFuzzyMatching, setUseFuzzyMatching] = useState(true)

  // Fetch properties
  const {
    data: propertiesResponse,
    isLoading: loadingProperties,
    isError: propertiesError,
    isPaused: propertiesPaused,
    refetch: refetchProperties,
  } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data, error } = await apiClient.get({
        url: '/api/v1/properties' as never,
      })

      if (error) {
        throw new Error('Failed to fetch properties')
      }

      return data as { data: Property[]; count: number; has_more: boolean }
    },
  })

  const properties = propertiesResponse?.data ?? []
  // A paused fetch (unreachable backend) leaves data undefined without an
  // error — surface it as offline rather than a misleading "No properties yet".
  const isPropertiesOffline = propertiesPaused && !propertiesResponse

  // Fetch available years for selected property
  const {
    data: availableYears,
    isLoading: loadingYears,
    isError: yearsError,
    refetch: refetchYears,
  } = useAvailableYears(selectedPropertyId)

  // Fetch comparison data
  const {
    mutate: fetchComparison,
    data: comparisonData,
    isPending: loadingComparison,
    isError: comparisonError,
  } = useYearOverYearComparison()

  const handleYearToggle = (year: number, checked: boolean) => {
    if (checked) {
      if (selectedYears.length < 4) {
        setSelectedYears([...selectedYears, year].sort())
      }
    } else {
      setSelectedYears(selectedYears.filter((y) => y !== year))
    }
  }

  const handleCompare = () => {
    if (selectedPropertyId && selectedYears.length >= 2) {
      fetchComparison({
        property_id: selectedPropertyId,
        years: selectedYears,
        use_fuzzy_matching: useFuzzyMatching,
      })
    }
  }

  // FIX NEW-FE-4: Escape CSV values to handle commas, quotes, and newlines
  const escapeCSVValue = (value: string): string => {
    // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }

  const handleExportExcel = () => {
    if (!comparisonData) return

    // Create CSV content with proper escaping
    const headers = [
      'Pool Name',
      ...comparisonData.years.map((y) => `${y} ($)`),
      'Variance ($)',
      'Variance (%)',
    ]
    const rows = comparisonData.pool_comparisons.map((pool) => [
      escapeCSVValue(pool.pool_name),
      ...comparisonData.years.map((year) => {
        const amount = pool.amounts[year]
        return amount !== null && amount !== undefined
          ? amount.toString()
          : 'N/A'
      }),
      pool.variance_amount !== null && pool.variance_amount !== undefined
        ? pool.variance_amount.toString()
        : 'N/A',
      pool.variance_percent !== null && pool.variance_percent !== undefined
        ? pool.variance_percent.toFixed(1) + '%'
        : 'N/A',
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n')

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `yoy-comparison-${escapeCSVValue(comparisonData.property_name)}-${Date.now()}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    window.print()
  }

  const canCompare = selectedPropertyId && selectedYears.length >= 2

  return (
    <PageContainer>
      <PageHeader
        title="Year-over-Year Comparison"
        description="Compare expense pools across years and see where costs changed."
      />

      <Card>
        <CardHeader>
          <CardTitle as="h2">Select Property and Years</CardTitle>
          <CardDescription>
            Choose a property and 2-4 years to compare
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Property Selector */}
          <div className="space-y-2">
            <Label htmlFor="yoy-property-select">Property</Label>
            {loadingProperties ? (
              <Skeleton className="h-10 w-full" />
            ) : propertiesError || isPropertiesOffline ? (
              <div className="space-y-2" role="alert">
                <p className="text-sm text-destructive-strong">
                  {isPropertiesOffline
                    ? "Can't reach the server. Check your connection and try again."
                    : "We couldn't load your properties."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchProperties()}
                >
                  Try again
                </Button>
              </div>
            ) : (
              <Select
                value={selectedPropertyId}
                onValueChange={(value) => {
                  setSelectedPropertyId(value)
                  setSelectedYears([])
                }}
              >
                <SelectTrigger
                  id="yoy-property-select"
                  data-testid="property-select-trigger"
                >
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {properties?.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!loadingProperties &&
              !propertiesError &&
              !isPropertiesOffline &&
              (!properties || properties.length === 0) && (
                <p className="text-sm text-muted-foreground">
                  No properties yet.{' '}
                  <Link
                    to="/properties/new"
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    Add one
                  </Link>{' '}
                  to get started.
                </p>
              )}
          </div>

          {/* Year Selector */}
          {selectedPropertyId && (
            <div className="space-y-2">
              <Label id="yoy-years-label">Years (select 2-4)</Label>
              {loadingYears ? (
                <Skeleton className="h-20 w-full" />
              ) : yearsError ? (
                <div className="space-y-2 py-4" role="alert">
                  <p className="text-sm text-destructive-strong">
                    We couldn't load this property's years.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchYears()}
                  >
                    Try again
                  </Button>
                </div>
              ) : availableYears && availableYears.length > 0 ? (
                <div
                  className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                  role="group"
                  aria-labelledby="yoy-years-label"
                >
                  {availableYears.map((year) => (
                    <div key={year} className="flex items-center space-x-2">
                      <Checkbox
                        id={`year-${year}`}
                        aria-label={String(year)}
                        checked={selectedYears.includes(year)}
                        onCheckedChange={(checked) =>
                          handleYearToggle(year, checked === true)
                        }
                        disabled={
                          !selectedYears.includes(year) &&
                          selectedYears.length >= 4
                        }
                      />
                      <Label
                        htmlFor={`year-${year}`}
                        className="cursor-pointer"
                      >
                        {year}
                      </Label>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 flex flex-col items-center gap-2 text-center">
                  <BarChart3
                    className="h-8 w-8 text-muted-foreground/50"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-muted-foreground">
                    No finalized snapshots available for this property
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Fuzzy Matching Option */}
          {selectedYears.length >= 2 && (
            <div className="flex min-h-[44px] items-center space-x-2">
              <Checkbox
                id="fuzzy-matching"
                aria-label="Use fuzzy matching for renamed pools"
                checked={useFuzzyMatching}
                onCheckedChange={(checked) =>
                  setUseFuzzyMatching(checked === true)
                }
              />
              <Label htmlFor="fuzzy-matching" className="cursor-pointer">
                Use fuzzy matching for renamed pools
              </Label>
            </div>
          )}

          {/* Compare Button */}
          {!canCompare && !loadingComparison ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-block w-full rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
                  tabIndex={0}
                >
                  <Button
                    disabled
                    className="pointer-events-none min-h-[44px] w-full sm:w-auto"
                  >
                    Compare
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {!selectedPropertyId
                  ? 'Select a property first, then pick 2-4 years to compare.'
                  : 'Pick at least 2 years to compare.'}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              onClick={handleCompare}
              disabled={loadingComparison}
              className="min-h-[44px] w-full sm:w-auto"
            >
              {loadingComparison && (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              Compare
            </Button>
          )}

          {comparisonError && (
            <p className="text-sm text-destructive-strong" role="alert">
              We couldn't build the comparison. Please try Compare again.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Comparison Results */}
      {comparisonData &&
        (() => {
          // Variances are computed against the base year, so if the base year
          // has no expense data the entire Variance column is N/A and the table
          // reads as broken. Detect that and guide the user instead of letting
          // them stare at an all-N/A grid.
          const baseYearHasData = comparisonData.pool_comparisons.some(
            (pool) =>
              pool.amounts[comparisonData.base_year] !== null &&
              pool.amounts[comparisonData.base_year] !== undefined
          )
          return (
            <>
              {!baseYearHasData && (
                <Card
                  className="border-warning/40 bg-warning/5"
                  data-testid="base-year-empty-warning"
                >
                  <CardContent className="flex items-start gap-3 py-4">
                    <AlertTriangle
                      className="mt-0.5 h-5 w-5 shrink-0 text-warning"
                      aria-hidden="true"
                    />
                    <div className="space-y-1 text-sm">
                      <p className="font-medium text-foreground">
                        No {comparisonData.base_year} data to compare against
                      </p>
                      <p className="text-muted-foreground">
                        The earliest year you picked ({comparisonData.base_year}
                        ) has no finalized expense figures, so every variance
                        below shows N/A. Pick a later base year, or finalize a{' '}
                        {comparisonData.base_year} reconciliation first.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <CardTitle as="h2">
                        {comparisonData.property_name}
                      </CardTitle>
                      <CardDescription>
                        Base year: {comparisonData.base_year} | Comparing{' '}
                        {comparisonData.years.length} years
                      </CardDescription>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto print:hidden">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportExcel}
                        className="min-h-[44px] w-full sm:w-auto"
                      >
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        Export CSV
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrint}
                        className="min-h-[44px] w-full sm:w-auto"
                      >
                        <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                        Print
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="mb-2 text-xs text-muted-foreground sm:hidden">
                    Scroll sideways to see each year.
                  </p>
                  <div className="max-w-full overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[760px] border-collapse text-sm">
                      <caption className="sr-only">
                        Year-over-year expense pool comparison
                      </caption>
                      <thead>
                        <tr className="border-b bg-muted/60">
                          <th
                            scope="col"
                            className="sticky left-0 z-10 min-w-64 bg-muted p-3 text-left font-semibold"
                          >
                            Expense Pool
                          </th>
                          {comparisonData.years.map((year) => (
                            <th
                              key={year}
                              scope="col"
                              className="p-3 text-right font-semibold"
                            >
                              {year}
                            </th>
                          ))}
                          <th
                            scope="col"
                            className="p-3 text-right font-semibold"
                          >
                            Variance
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonData.pool_comparisons.map((pool) => {
                          // A pool present in only one year has no prior-year basis,
                          // so its variance percent is null. Render those rows neutral
                          // instead of the "normal" green, which would read as a calm
                          // <5% change rather than "no comparison available".
                          const hasVariance =
                            pool.variance_percent !== null &&
                            pool.variance_percent !== undefined
                          return (
                            <tr
                              key={pool.pool_name}
                              className={cn(
                                'border-b transition-colors duration-200 hover:bg-muted/50',
                                hasVariance &&
                                  getVarianceBgColor(pool.variance_level)
                              )}
                            >
                              <td className="sticky left-0 z-10 max-w-72 bg-card p-3">
                                <div>
                                  <div
                                    className="truncate font-medium"
                                    title={pool.pool_name}
                                  >
                                    {pool.pool_name}
                                  </div>
                                  {pool.matched_from && (
                                    <div className="text-xs text-muted-foreground">
                                      Matched from: {pool.matched_from}
                                    </div>
                                  )}
                                </div>
                              </td>
                              {comparisonData.years.map((year) => (
                                <td key={year} className="p-3 text-right">
                                  {formatAmount(pool.amounts[year])}
                                </td>
                              ))}
                              <td
                                className={cn(
                                  'p-3 text-right font-semibold',
                                  hasVariance
                                    ? getVarianceColor(pool.variance_level)
                                    : 'text-muted-foreground'
                                )}
                              >
                                <div className="flex items-center justify-end gap-1">
                                  {pool.variance_percent !== null &&
                                    pool.variance_percent !== undefined && (
                                      <>
                                        {pool.variance_percent > 0 ? (
                                          <TrendingUp
                                            className="h-4 w-4"
                                            aria-hidden="true"
                                          />
                                        ) : (
                                          <TrendingDown
                                            className="h-4 w-4"
                                            aria-hidden="true"
                                          />
                                        )}
                                      </>
                                    )}
                                  <div>
                                    <div>
                                      {formatVarianceAmount(
                                        pool.variance_amount
                                      )}
                                    </div>
                                    <div className="text-xs">
                                      {formatVariancePercent(
                                        pool.variance_percent
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                        {/* Total Row */}
                        <tr className="border-t-2 bg-muted/40 font-bold">
                          <td className="sticky left-0 z-10 bg-muted p-3">
                            Total
                          </td>
                          {comparisonData.years.map((year) => {
                            // When no pool reported a figure for this year, the
                            // summed total is a hollow 0. Show "N/A" instead so the
                            // Total row agrees with the "N/A" cells above it rather
                            // than reading as a real $0.00 of spend.
                            const yearHasData =
                              comparisonData.pool_comparisons.some(
                                (pool) =>
                                  pool.amounts[year] !== null &&
                                  pool.amounts[year] !== undefined
                              )
                            return (
                              <td key={year} className="p-3 text-right">
                                {yearHasData ? (
                                  formatAmount(
                                    comparisonData.total_amounts[year]
                                  )
                                ) : (
                                  <span className="text-muted-foreground">
                                    N/A
                                  </span>
                                )}
                              </td>
                            )
                          })}
                          <td className="p-3 text-right">
                            <div>
                              {formatVarianceAmount(
                                comparisonData.total_variance_amount
                              )}
                            </div>
                            <div className="text-xs">
                              {formatVariancePercent(
                                comparisonData.total_variance_percent
                              )}
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Legend */}
              <Card className="print:hidden">
                <CardHeader>
                  <CardTitle as="h2">Variance Color Legend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded bg-success/10 border border-success/20" />
                      <span className="text-sm">Normal (&lt;5%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded bg-warning/10 border border-warning/20" />
                      <span className="text-sm">Warning (5-15%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded bg-destructive/10 border border-destructive/20" />
                      <span className="text-sm">Critical (&gt;15%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded border border-border bg-muted" />
                      <span className="text-sm">N/A (in one year only)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {/* Fine-print verification disclaimer (only meaningful once numbers are shown) */}
              <p className="mt-3 text-xs text-muted-foreground">
                These numbers come from your files and may have errors. Check
                your lease and GL before you act on them.
              </p>
            </>
          )
        })()}
    </PageContainer>
  )
}
