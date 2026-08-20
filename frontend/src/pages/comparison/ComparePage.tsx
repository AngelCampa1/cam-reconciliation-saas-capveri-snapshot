/**
 * System Comparison page (Module B).
 *
 * Compares CapVeri's correct per-tenant recovery against what another system
 * charged, for a chosen property and period. The charged side is either the
 * records CapVeri already holds (default) or a set the user types in by hand.
 * Results show, per tenant and per pool, whether the other system overcharged,
 * undercharged, or matched.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/errors'
import {
  AlertTriangle,
  ArrowLeftRight,
  Loader2,
  Save,
  ScrollText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PageContainer, PageHeader } from '@/components/layout'
import { apiClient } from '@/api/client'
import { formatMoney } from '@/lib/money'
import type {
  ComparisonResult,
  ExplicitCharge,
  TenantVariance,
} from '@/api/comparison'
import {
  useRunComparison,
  useSaveComparisonRun,
  useComparisonRuns,
} from '@/features/comparison/hooks/useComparison'
import { ComparisonSummary } from '@/features/comparison/components/ComparisonSummary'
import { TenantVarianceTable } from '@/features/comparison/components/TenantVarianceTable'
import {
  ExplicitChargesEditor,
  draftsToCharges,
  type ChargeDraft,
} from '@/features/comparison/components/ExplicitChargesEditor'

interface PropertyOption {
  id: string
  name: string
}

interface LeaseOption {
  id: string
  tenant_name: string
}

type ChargedSource = 'records' | 'manual'

export function ComparePage() {
  const [propertyId, setPropertyId] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [includeDrafts, setIncludeDrafts] = useState(false)
  const [source, setSource] = useState<ChargedSource>('records')
  const [charges, setCharges] = useState<ChargeDraft[]>([])
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [matchSelections, setMatchSelections] = useState<
    Record<string, string>
  >({})

  const {
    data: propertiesResponse,
    isLoading: loadingProperties,
    isError: isPropertiesError,
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
      return data as { data: PropertyOption[]; count: number }
    },
  })

  const properties = propertiesResponse?.data ?? []

  const runComparison = useRunComparison()
  const saveRun = useSaveComparisonRun()
  const { data: runs } = useComparisonRuns(propertyId, Boolean(propertyId))
  const reviewCount =
    result?.tenants.filter((tenant) => tenant.match_status === 'needs_review')
      .length ?? 0
  const { data: leases = [], isLoading: loadingLeases } = useQuery({
    queryKey: ['comparison-leases', propertyId],
    enabled: propertyId !== '' && reviewCount > 0,
    queryFn: async () => {
      const allLeases: LeaseOption[] = []
      const limit = 100
      let skip = 0

      for (;;) {
        const { data, error } = await apiClient.get({
          url: '/api/v1/leases' as never,
          query: { property_id: propertyId, skip, limit } as never,
        })
        if (error) {
          throw new Error('Failed to fetch leases')
        }
        const page = data as {
          data: LeaseOption[]
          has_more?: boolean
        }
        allLeases.push(...page.data)
        if (page.has_more !== true) {
          return allLeases
        }
        skip += limit
      }
    },
  })

  const periodValid =
    periodStart !== '' && periodEnd !== '' && periodStart < periodEnd
  const canCompare = propertyId !== '' && periodValid

  const buildCharges = () =>
    source === 'manual' ? draftsToCharges(charges) : undefined

  /**
   * Clear any shown result whenever a run input changes. This stops the user
   * from saving a result that no longer matches the period, source, or charges
   * on screen, which would write a misleading audit record.
   */
  const clearResultOnChange = () => {
    setResult(null)
    setMatchSelections({})
  }

  const handleCompare = () => {
    if (!canCompare) {
      return
    }
    const manualCharges = buildCharges()
    runComparison.mutate(
      {
        propertyId,
        periodStart,
        periodEnd,
        includeDrafts,
        ...(manualCharges !== undefined ? { charges: manualCharges } : {}),
      },
      {
        onSuccess: (data) => {
          setResult(data)
          setMatchSelections({})
        },
        onError: (error) => {
          setResult(null)
          toast.error('Could not run the comparison', {
            description: getErrorMessage(error),
          })
        },
      }
    )
  }

  const handleSaveRun = () => {
    if (!canCompare || !result || reviewCount > 0) {
      return
    }
    const manualCharges = buildCharges()
    saveRun.mutate(
      {
        propertyId,
        body: {
          period_start: periodStart,
          period_end: periodEnd,
          include_drafts: includeDrafts,
          charges: manualCharges ?? null,
        },
      },
      {
        onSuccess: () => toast.success('Saved this comparison'),
        onError: (error) =>
          toast.error('Could not save the comparison', {
            description: getErrorMessage(error),
          }),
      }
    )
  }

  const handleApplyMatches = () => {
    if (!canCompare || !result) {
      return
    }
    const resolvedCharges = buildResolvedCharges(
      result.tenants,
      matchSelections,
      new Map(leases.map((lease) => [lease.id, lease.tenant_name]))
    )
    if (!resolvedCharges) {
      return
    }
    const resolvedDrafts = resolvedCharges.map(chargeToDraft)
    runComparison.mutate(
      {
        propertyId,
        periodStart,
        periodEnd,
        includeDrafts,
        charges: resolvedCharges,
      },
      {
        onSuccess: (data) => {
          setSource('manual')
          setCharges(resolvedDrafts)
          setResult(data)
          setMatchSelections({})
          toast.success('Matches applied')
        },
        onError: (error) =>
          toast.error('Could not apply matches', {
            description: getErrorMessage(error),
          }),
      }
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Compare systems"
        description="Check another system's charges against the right amount, tenant by tenant."
      />

      <Card>
        <CardHeader>
          <CardTitle as="h2">Pick a property and period</CardTitle>
          <CardDescription>
            Choose what to check, then run the comparison.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="compare-property-select">Property</Label>
            {loadingProperties ? (
              <Skeleton className="h-10 w-full" />
            ) : isPropertiesError ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-destructive-strong">
                <span>We couldn't load your properties.</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refetchProperties()}
                >
                  Try again
                </Button>
              </div>
            ) : (
              <Select
                value={propertyId}
                onValueChange={(value) => {
                  setPropertyId(value)
                  setResult(null)
                  setCharges([])
                  setMatchSelections({})
                }}
              >
                <SelectTrigger
                  id="compare-property-select"
                  data-testid="property-select-trigger"
                >
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="compare-period-start">Period start</Label>
              <Input
                id="compare-period-start"
                type="date"
                value={periodStart}
                onChange={(e) => {
                  setPeriodStart(e.target.value)
                  clearResultOnChange()
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="compare-period-end">Period end</Label>
              <Input
                id="compare-period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => {
                  setPeriodEnd(e.target.value)
                  clearResultOnChange()
                }}
              />
            </div>
          </div>
          {periodStart !== '' && periodEnd !== '' && !periodValid && (
            <p role="alert" className="text-sm text-destructive-strong">
              Period start must be before period end.
            </p>
          )}

          <div className="space-y-2">
            <Label id="compare-source-group-label">
              Where do the other charges come from?
            </Label>
            <ToggleGroup
              type="single"
              value={source}
              aria-labelledby="compare-source-group-label"
              onValueChange={(value) => {
                if (value === 'records' || value === 'manual') {
                  setSource(value)
                  setResult(null)
                }
              }}
              className="justify-start"
            >
              <ToggleGroupItem value="records" data-testid="source-records">
                Use saved records
              </ToggleGroupItem>
              <ToggleGroupItem value="manual" data-testid="source-manual">
                Type them in
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {source === 'manual' && (
            <ExplicitChargesEditor
              charges={charges}
              onChange={(next) => {
                setCharges(next)
                clearResultOnChange()
              }}
            />
          )}

          <div className="flex min-h-[44px] items-center space-x-2">
            <Checkbox
              id="compare-include-drafts"
              aria-label="Include draft reconciliations as the correct amount"
              checked={includeDrafts}
              onCheckedChange={(checked) => {
                setIncludeDrafts(checked === true)
                clearResultOnChange()
              }}
            />
            <Label htmlFor="compare-include-drafts" className="cursor-pointer">
              Include draft reconciliations as the correct amount
            </Label>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            {!canCompare && !runComparison.isPending ? (
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
                      <ArrowLeftRight
                        className="mr-2 h-4 w-4"
                        aria-hidden="true"
                      />
                      Run comparison
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {propertyId === ''
                    ? 'Select a property first.'
                    : 'Choose a start and end date (start before end) to run the comparison.'}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button
                onClick={handleCompare}
                disabled={runComparison.isPending}
                className="min-h-[44px] w-full sm:w-auto"
              >
                {runComparison.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowLeftRight className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                Run comparison
              </Button>
            )}
            {result && (
              <div className="space-y-1">
                <Button
                  variant="outline"
                  onClick={handleSaveRun}
                  disabled={saveRun.isPending || reviewCount > 0}
                  aria-describedby={
                    reviewCount > 0 ? 'compare-save-match-warning' : undefined
                  }
                  className="min-h-[44px] w-full sm:w-auto"
                >
                  {saveRun.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  Save this comparison
                </Button>
                {reviewCount > 0 && (
                  <p
                    id="compare-save-match-warning"
                    className="text-xs text-warning-foreground"
                  >
                    Match all rows before you save.
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {result && (
        <>
          <ComparisonSummary result={result} />
          <Card>
            <CardHeader>
              <CardTitle as="h2">Tenant by tenant</CardTitle>
              <CardDescription>
                Open a row to see the split by expense pool.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {reviewCount > 0 && (
                <div className="space-y-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="font-medium">
                        Match{' '}
                        {reviewCount === 1 ? '1 row' : `${reviewCount} rows`}
                      </p>
                      <p className="mt-1">
                        Check these rows before you use this result.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {result.tenants
                      .filter(
                        (tenant) => tenant.match_status === 'needs_review'
                      )
                      .map((tenant) => (
                        <div
                          key={tenant.lease_id}
                          className="grid gap-2 rounded-md bg-background/80 p-3 text-foreground sm:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] sm:items-center"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {tenant.tenant_name ?? 'Unidentified charge'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Charged {formatMoney(tenant.actual_charged)}
                            </p>
                          </div>
                          <Select
                            value={matchSelections[tenant.lease_id] ?? ''}
                            onValueChange={(value) =>
                              setMatchSelections((current) => ({
                                ...current,
                                [tenant.lease_id]: value,
                              }))
                            }
                          >
                            <SelectTrigger
                              aria-label={`Lease match for ${
                                tenant.tenant_name ?? 'unidentified charge'
                              }`}
                            >
                              <SelectValue placeholder="Select a lease" />
                            </SelectTrigger>
                            <SelectContent>
                              {leases.map((lease) => (
                                <SelectItem key={lease.id} value={lease.id}>
                                  {lease.tenant_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleApplyMatches}
                    disabled={
                      loadingLeases ||
                      runComparison.isPending ||
                      reviewCount === 0 ||
                      result.tenants
                        .filter(
                          (tenant) => tenant.match_status === 'needs_review'
                        )
                        .some(
                          (tenant) =>
                            (matchSelections[tenant.lease_id] ?? '') === ''
                        )
                    }
                    className="min-h-[44px] w-full sm:w-auto"
                  >
                    {runComparison.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowLeftRight
                        className="mr-2 h-4 w-4"
                        aria-hidden="true"
                      />
                    )}
                    Apply matches
                  </Button>
                </div>
              )}
              <TenantVarianceTable tenants={result.tenants} />
            </CardContent>
          </Card>
        </>
      )}

      {propertyId && runs && runs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <ScrollText className="h-5 w-5" aria-hidden="true" />
              Saved comparisons
            </CardTitle>
            <CardDescription>
              Past checks you saved for this property.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-full overflow-x-auto rounded-md border">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <caption className="sr-only">Saved comparison runs</caption>
                <thead>
                  <tr className="border-b bg-muted/60">
                    <th scope="col" className="p-3 text-left font-semibold">
                      Period
                    </th>
                    <th scope="col" className="p-3 text-left font-semibold">
                      Source
                    </th>
                    <th scope="col" className="p-3 text-right font-semibold">
                      Net difference
                    </th>
                    <th scope="col" className="p-3 text-right font-semibold">
                      Saved
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-b">
                      <td className="p-3">
                        {run.period_start} to {run.period_end}
                      </td>
                      <td className="p-3">
                        {run.source === 'explicit'
                          ? 'Typed in'
                          : 'Saved records'}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums">
                        {formatMoney(run.total_net_variance)}
                      </td>
                      <td className="p-3 text-right text-muted-foreground">
                        {run.created_at.slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        These numbers come from your files and may have errors. Check your lease
        and GL before you act on them.
      </p>
    </PageContainer>
  )
}

function buildResolvedCharges(
  tenants: TenantVariance[],
  selections: Record<string, string>,
  leaseNames: Map<string, string>
): ExplicitCharge[] | null {
  const charges: ExplicitCharge[] = []

  for (const tenant of tenants) {
    const leaseId =
      tenant.match_status === 'needs_review'
        ? selections[tenant.lease_id]
        : tenant.lease_id
    if (!leaseId) {
      return null
    }
    const tenantName =
      tenant.match_status === 'needs_review'
        ? (leaseNames.get(leaseId) ?? tenant.tenant_name)
        : tenant.tenant_name

    charges.push({
      lease_id: leaseId,
      tenant_name: tenantName ?? null,
      amount: tenant.actual_charged,
    })
  }

  return charges
}

function chargeToDraft(charge: ExplicitCharge): ChargeDraft {
  return {
    leaseId: charge.lease_id ?? null,
    tenantName: charge.tenant_name ?? '',
    poolId: charge.pool_id ?? null,
    amount: charge.amount,
  }
}
