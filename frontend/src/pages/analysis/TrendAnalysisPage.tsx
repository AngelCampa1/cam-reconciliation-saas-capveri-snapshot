/**
 * Trend Analysis Page
 *
 * Interactive trend charts showing expense patterns over multiple years
 * with anomaly detection and export capabilities.
 */

import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Download, TrendingUp } from 'lucide-react'
import { TrendChart } from '@/features/analysis/components/TrendChart'
import { useChartExport } from '@/features/analysis/hooks/useChartExport'
import {
  useAnomalyDetection,
  useAvailableYears,
  useYearOverYearComparison,
} from '@/features/analysis/hooks/useYearOverYear'
import { apiClient } from '@/api/client'
import type {
  TrendDataPoint,
  DetectedAnomaly,
  AnomalyType,
} from '@/features/analysis/types'
import { PageHeader, PageContainer } from '@/components/layout'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { formatMoney, formatMoneyWhole } from '@/lib/money'

interface Property {
  id: string
  name: string
}

// Every anomaly type gets its own heading. A previous version labelled
// anything that wasn't a spike as "Drop Detected", so a brand-new expense
// category (an increase from nothing) read as a "Drop" — the opposite of what
// happened. Map each type to an accurate heading instead.
const ANOMALY_HEADINGS: Record<AnomalyType, string> = {
  spike: 'Spike Detected',
  drop: 'Drop Detected',
  new_category: 'New Category',
  missing_category: 'Missing Category',
  pattern_break: 'Pattern Break',
  outlier: 'Outlier Detected',
}

export function TrendAnalysisPage() {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [yAxisMode, setYAxisMode] = useState<'absolute' | 'percentage'>(
    'absolute'
  )
  const [showTrendline, setShowTrendline] = useState(true)
  const chartRef = useRef<HTMLDivElement>(null)
  const { exportAsImage } = useChartExport(
    chartRef as React.RefObject<HTMLDivElement>
  )

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

  // Fetch available years for selected property
  const {
    data: availableYears,
    isLoading: loadingYears,
    isError: yearsError,
    isPaused: yearsPaused,
    refetch: refetchYears,
  } = useAvailableYears(selectedPropertyId)

  // A paused fetch (unreachable backend) leaves data undefined without an
  // error — surface it as offline rather than a misleading "no data" empty state.
  const isPropertiesOffline = propertiesPaused && !propertiesResponse
  const isOffline = isPropertiesOffline || (yearsPaused && !availableYears)

  // Fetch year-over-year comparison data
  const {
    mutate: fetchComparison,
    data: comparisonData,
    isPending: loadingComparison,
  } = useYearOverYearComparison()

  const { mutate: detectAnomalies, data: anomalyResult } = useAnomalyDetection()

  // Auto-fetch comparison when property selected and years available
  useEffect(() => {
    if (selectedPropertyId && availableYears && availableYears.length >= 2) {
      fetchComparison({
        property_id: selectedPropertyId,
        years: availableYears,
        use_fuzzy_matching: true,
      })
      const sortedYears = [...availableYears].sort((a, b) => a - b)
      const targetYear = sortedYears[sortedYears.length - 1]
      const comparisonYears = sortedYears.slice(0, -1)
      if (targetYear !== undefined && comparisonYears.length > 0) {
        detectAnomalies({
          property_id: selectedPropertyId,
          target_year: targetYear,
          comparison_years: comparisonYears,
        })
      }
    }
  }, [selectedPropertyId, availableYears, fetchComparison, detectAnomalies])

  // Reset category when property changes
  const prevPropertyIdRef = useRef(selectedPropertyId)
  useEffect(() => {
    if (prevPropertyIdRef.current !== selectedPropertyId) {
      prevPropertyIdRef.current = selectedPropertyId
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedCategory('')
    }
  }, [selectedPropertyId])

  // Set default category when data loads
  const prevComparisonDataRef = useRef(comparisonData)
  useEffect(() => {
    const firstPool = comparisonData?.pool_comparisons[0]
    const dataChanged = prevComparisonDataRef.current !== comparisonData
    prevComparisonDataRef.current = comparisonData

    if (dataChanged && firstPool && !selectedCategory) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedCategory(firstPool.pool_name.toLowerCase())
    }
  }, [comparisonData, selectedCategory])

  // Get expense categories from API data
  const expenseCategories = useMemo(() => {
    if (!comparisonData) return []
    return comparisonData.pool_comparisons.map((p) => ({
      value: p.pool_name.toLowerCase(),
      label: p.pool_name,
    }))
  }, [comparisonData])

  // Transform API data to TrendDataPoint[]
  const chartData: TrendDataPoint[] = useMemo(() => {
    if (!comparisonData || !selectedCategory) return []
    const pool = comparisonData.pool_comparisons.find(
      (p) => p.pool_name.toLowerCase() === selectedCategory
    )
    if (!pool) return []
    return comparisonData.years.map((year) => ({
      year,
      value: pool.amounts[year] ?? 0,
    }))
  }, [comparisonData, selectedCategory])

  const anomalies: DetectedAnomaly[] = useMemo(() => {
    if (!anomalyResult || !selectedCategory) return []
    return anomalyResult.anomalies.filter(
      (a) => a.pool_name.toLowerCase() === selectedCategory
    )
  }, [anomalyResult, selectedCategory])

  // Calculate year range from data
  const firstDataPoint = chartData[0]
  const lastDataPoint = chartData[chartData.length - 1]
  const yearRange =
    firstDataPoint && lastDataPoint
      ? `${firstDataPoint.year} to ${lastDataPoint.year}`
      : ''
  const trendSummary = useMemo(() => {
    if (chartData.length < 2) return null
    const first = chartData[0]
    const last = chartData[chartData.length - 1]
    if (!first || !last) return null

    const delta = last.value - first.value
    const percent = first.value > 0 ? delta / first.value : null
    const average =
      chartData.reduce((sum, point) => sum + point.value, 0) / chartData.length

    return { delta, percent, average }
  }, [chartData])

  const handleExport = async () => {
    const filename = `trend-analysis-${selectedCategory}-${Date.now()}`
    await exportAsImage(filename)
  }

  const selectedCategoryLabel =
    expenseCategories.find((c) => c.value === selectedCategory)?.label ||
    selectedCategory

  const isLoading = loadingProperties || loadingYears || loadingComparison

  return (
    <PageContainer>
      <PageHeader
        title="Trend Analysis"
        description="See how your expenses have changed year to year and spot unusual patterns."
      />

      {/* Filters Card */}
      <Card className="shadow-sm">
        <CardHeader variant="muted">
          <CardTitle as="h2">Filters & Options</CardTitle>
          <CardDescription>
            Filter the data and adjust how the chart looks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {/* Property Selector */}
            <div className="space-y-2">
              <Label htmlFor="property">Property</Label>
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
                  }}
                >
                  <SelectTrigger id="property">
                    <SelectValue placeholder="Select a property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Category Selector */}
            <div className="space-y-2">
              <Label htmlFor="category">Expense Category</Label>
              {loadingComparison ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  value={selectedCategory}
                  onValueChange={setSelectedCategory}
                  disabled={!comparisonData || expenseCategories.length === 0}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseCategories.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Y-Axis Mode */}
            <div className="space-y-2">
              <Label htmlFor="yaxis">Y-Axis Scale</Label>
              <Select
                value={yAxisMode}
                onValueChange={(value) =>
                  setYAxisMode(value as 'absolute' | 'percentage')
                }
              >
                <SelectTrigger id="yaxis">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="absolute">Absolute ($)</SelectItem>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Trendline Toggle */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Display Options</Label>
              <div className="flex items-center space-x-2 min-h-[44px]">
                <Checkbox
                  id="trendline"
                  aria-label="Show trendline"
                  checked={showTrendline}
                  onCheckedChange={(checked) =>
                    setShowTrendline(checked === true)
                  }
                />
                <Label
                  htmlFor="trendline"
                  className="cursor-pointer text-sm font-normal"
                >
                  Show trendline
                </Label>
              </div>
            </div>

            {/* Export Button. When there is no chart yet, the button is
                disabled; a tooltip on a focusable span explains why (disabled
                buttons emit no hover/focus events of their own). */}
            <div className="flex items-end">
              {chartData.length === 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block w-full" tabIndex={0}>
                      <Button
                        variant="outline"
                        className="pointer-events-none w-full min-h-[44px]"
                        disabled
                      >
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        Export PNG
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Select a property to load the chart before exporting.
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  onClick={handleExport}
                  variant="outline"
                  className="w-full min-h-[44px]"
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  Export PNG
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart Card */}
      <Card className="shadow-sm">
        <CardHeader variant="gradient">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle as="h2" className="flex items-center gap-2">
                <TrendingUp
                  className="h-5 w-5 text-primary"
                  aria-hidden="true"
                />
                {selectedCategoryLabel
                  ? `${selectedCategoryLabel} Trend`
                  : 'Expense Trend'}
              </CardTitle>
              <CardDescription>
                {yearRange
                  ? `Historical expense trend from ${yearRange}`
                  : 'Select a property to view trends'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedPropertyId ? (
            <div className="py-8 flex flex-col items-center gap-2 text-center">
              <TrendingUp
                className="h-8 w-8 text-muted-foreground/50"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">
                Select a property to view expense trends
              </p>
            </div>
          ) : isLoading ? (
            <Skeleton className="h-[400px] w-full" />
          ) : propertiesError || yearsError || isOffline ? (
            <ErrorState
              size="sm"
              title="Couldn't load trend data"
              offline={isOffline}
              action={{
                onClick: () => {
                  refetchProperties()
                  refetchYears()
                },
              }}
            />
          ) : availableYears && availableYears.length < 2 ? (
            <EmptyState
              icon={TrendingUp}
              size="sm"
              title="No snapshots found"
              description="No finalized reconciliation snapshots found."
            />
          ) : expenseCategories.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              size="sm"
              title="No expense data"
              description="No expense data found. Finalize at least one reconciliation for this property first."
            />
          ) : chartData.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              size="sm"
              title="No data for this category"
              description="Pick a different expense category from the dropdown above."
            />
          ) : (
            <div ref={chartRef}>
              {trendSummary && (
                <div
                  className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
                  data-testid="trend-metric-summary"
                >
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">
                      Period Change
                    </p>
                    <p className="text-lg font-semibold tabular-nums font-mono">
                      {formatMoney(trendSummary.delta, 'usd', {
                        signDisplay: 'exceptZero',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">
                      Percent Change
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {trendSummary.percent === null
                        ? 'N/A'
                        : `${trendSummary.percent >= 0 ? '+' : ''}${(
                            trendSummary.percent * 100
                          ).toFixed(1)}%`}
                    </p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">
                      Annual Average
                    </p>
                    <p className="text-lg font-semibold tabular-nums font-mono">
                      {formatMoneyWhole(trendSummary.average)}
                    </p>
                  </div>
                </div>
              )}
              <TrendChart
                data={chartData}
                anomalies={anomalies}
                showTrendline={showTrendline}
                yAxisMode={yAxisMode}
              />
            </div>
          )}

          {/* Anomalies Summary */}
          {anomalies.length > 0 && (
            <div className="mt-6 space-y-2">
              <h3 className="text-sm font-semibold">Detected Anomalies</h3>
              <div className="space-y-2">
                {anomalies.map((anomaly, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-warning/50 bg-warning/5 p-3 text-sm shadow-sm"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          anomaly.severity === 'critical'
                            ? 'bg-destructive'
                            : anomaly.severity === 'warning'
                              ? 'bg-warning'
                              : 'bg-primary'
                        } mt-1.5`}
                      />
                      <span className="sr-only">
                        {anomaly.severity} severity
                      </span>
                      <div>
                        <p className="font-medium">
                          {ANOMALY_HEADINGS[anomaly.anomaly_type] ??
                            'Anomaly Detected'}{' '}
                          ({anomaly.years_affected.join(', ')})
                        </p>
                        <p className="text-muted-foreground">
                          {anomaly.explanation}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      {anomalies.length > 0 && (
        <Card className="shadow-sm print:hidden">
          <CardHeader>
            <CardTitle as="h2">Chart Legend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-primary" />
                <span className="text-sm">Normal values</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-warning" />
                <span className="text-sm">Warning anomalies (10-20%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-destructive" />
                <span className="text-sm">Critical anomalies (&gt;20%)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Fine-print verification disclaimer */}
      <p className="mt-3 text-xs text-muted-foreground">
        Anomaly labels come from AI and may be wrong. All expense figures come
        from your files. Check both against your source data before you act on
        them.
      </p>
    </PageContainer>
  )
}
