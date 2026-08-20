/**
 * DenominatorChangePanel: collapsible panel showing denominator changes
 * between reconciliation periods.
 *
 * Surfaces RSF changes, tenant roster changes, and per-tenant pro-rata
 * share impacts. Includes PDF export button.
 */

import { useState } from 'react'
import {
  Scale,
  Loader2,
  FileDown,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorState } from '@/components/ErrorState'
import {
  useDenominatorChangeReport,
  useExportDenominatorChangePdf,
} from '@/api/hooks'
import type { DenominatorChangeReport } from '@/features/reconciliation/types/denominator-change'
import { formatNumber } from '@/lib/number'
import { formatMoney } from '@/lib/money'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export interface DenominatorChangePanelProps {
  propertyId: string
  year: number
  priorYear?: number
}

const CHANGE_TYPE_LABELS: Record<string, string> = {
  rsf_remeasurement: 'RSF Re-measurement',
  tenant_added: 'Tenant Added',
  tenant_removed: 'Tenant Removed',
  self_maintenance_start: 'Self-Maintenance Start',
  self_maintenance_stop: 'Self-Maintenance Stop',
  exclusion_change: 'Exclusion Change',
  boma_standard_change: 'BOMA Standard Change',
  share_recalculation: 'Share Recalculation',
}

export function DenominatorChangePanel({
  propertyId,
  year,
  priorYear = year - 1,
}: DenominatorChangePanelProps) {
  const [isOpen, setIsOpen] = useState(false)

  const reportMutation = useDenominatorChangeReport({
    onError: () => {
      // "No finalized snapshot to compare" is no longer an error. The backend
      // returns HTTP 200 with comparison_available=false for that case, so any
      // error that reaches here is a genuine fetch failure.
      toast.error('Failed to load denominator change report')
    },
  })

  const exportMutation = useExportDenominatorChangePdf({
    onSuccess: () => toast.success('Denominator change PDF downloaded'),
    onError: () => toast.error('Failed to export denominator change PDF'),
  })

  const handleToggle = () => {
    const next = !isOpen
    setIsOpen(next)
    if (next && !reportMutation.data && !reportMutation.isPending) {
      reportMutation.mutate({
        property_id: propertyId,
        current_period_start: `${year}-01-01`,
        current_period_end: `${year}-12-31`,
        prior_period_start: `${priorYear}-01-01`,
        prior_period_end: `${priorYear}-12-31`,
      })
    }
  }

  const report = reportMutation.data

  // When there is no finalized snapshot to compare against, the backend
  // returns HTTP 200 with `comparison_available: false` (a normal, expected
  // state, not a 4xx). Read it from the report data and guide the user. The
  // two cases need different guidance: the current-period case points the user
  // at this year, the prior-period case at last year.
  const isComparisonUnavailable = report?.comparison_available === false
  const isMissingCurrentPeriod = report?.missing_period === 'current'
  const hasReport = report != null && !isComparisonUnavailable
  const isFetchError = reportMutation.isError

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        aria-expanded={isOpen}
        aria-controls="denominator-change-panel"
        onClick={handleToggle}
        data-testid="denominator-change-toggle"
      >
        <Scale className="h-4 w-4" />
        Denominator Changes
        {isOpen ? (
          <ChevronUp className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        )}
      </Button>

      {isOpen && (
        <Card
          id="denominator-change-panel"
          data-testid="denominator-change-panel"
          className="mt-3"
        >
          <CardHeader className="pb-2">
            <CardTitle as="h2" className="text-base">
              Denominator Changes: {year} vs {priorYear}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {reportMutation.isPending && (
              <div
                className="flex items-center gap-2 text-sm text-muted-foreground"
                data-testid="denominator-change-loading"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Analyzing denominator changes...
              </div>
            )}

            {isComparisonUnavailable && (
              <div
                className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
                data-testid="denominator-change-empty"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  {isMissingCurrentPeriod ? (
                    <>
                      <p className="font-medium text-foreground">
                        No {year} snapshot to compare yet
                      </p>
                      <p>
                        This view compares two finalized years. Finalize the{' '}
                        {year} reconciliation for this property. Then you can
                        see how the rentable area, tenant roster, and pro-rata
                        shares changed.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-foreground">
                        No {priorYear} snapshot to compare
                      </p>
                      <p>
                        This view compares {year} against a finalized{' '}
                        {priorYear} reconciliation. Finalize the {priorYear}{' '}
                        reconciliation for this property. Then you can see how
                        the rentable area, tenant roster, and pro-rata shares
                        changed.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {isFetchError && (
              <ErrorState
                size="sm"
                data-testid="denominator-change-error"
                title="Couldn't load the report"
                description="Please try again."
                action={{
                  onClick: () =>
                    reportMutation.mutate({
                      property_id: propertyId,
                      current_period_start: `${year}-01-01`,
                      current_period_end: `${year}-12-31`,
                      prior_period_start: `${priorYear}-01-01`,
                      prior_period_end: `${priorYear}-12-31`,
                    }),
                }}
              />
            )}

            {hasReport && <ReportContent report={report} />}

            {hasReport && (
              <Button
                data-testid="export-denominator-pdf-button"
                variant="outline"
                size="sm"
                className="w-full gap-2"
                disabled={exportMutation.isPending}
                onClick={() => {
                  // Guard against a double-export from a rapid second click that
                  // races ahead of the disabled state.
                  if (exportMutation.isPending) return
                  exportMutation.mutate({
                    property_id: propertyId,
                    current_period_start: `${year}-01-01`,
                    current_period_end: `${year}-12-31`,
                    prior_period_start: `${priorYear}-01-01`,
                    prior_period_end: `${priorYear}-12-31`,
                  })
                }}
              >
                {exportMutation.isPending ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                )}
                Export Denominator Change PDF
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ReportContent({ report }: { report: DenominatorChangeReport }) {
  const hasChanges = report.changes.length > 0

  return (
    <div className="space-y-4" data-testid="denominator-change-content">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="RSF Delta"
          value={`${report.rsf_delta >= 0 ? '+' : ''}${formatNumber(report.rsf_delta)} SF`}
          subtext={`${report.rsf_delta_percent >= 0 ? '+' : ''}${report.rsf_delta_percent.toFixed(2)}%`}
        />
        <StatCard
          label="Changes Detected"
          value={String(report.changes.length)}
        />
        <StatCard
          label="Tenants Impacted"
          value={String(report.tenant_impacts.length)}
        />
      </div>

      {/* Summary text */}
      <p className="text-sm text-muted-foreground">{report.summary}</p>

      {/* Changes list */}
      {hasChanges ? (
        <div>
          <h4 className="text-sm font-medium mb-2">Changes</h4>
          <div className="space-y-2">
            {report.changes.map((change, i) => (
              <div
                key={i}
                className="rounded-md border p-3 text-sm"
                data-testid={`change-item-${i}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary">
                    {CHANGE_TYPE_LABELS[change.change_type] ??
                      change.change_type}
                  </Badge>
                </div>
                <p className="text-muted-foreground">{change.description}</p>
                <div className="mt-1 text-xs text-muted-foreground">
                  {change.prior_value} → {change.current_value}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p
          className="text-sm text-muted-foreground"
          data-testid="no-changes-message"
        >
          No denominator changes detected between periods.
        </p>
      )}

      {/* Tenant impact table */}
      {report.tenant_impacts.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Per-Tenant Impact</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="tenant-impact-table">
              <caption className="sr-only">
                Per-tenant impact of denominator change
              </caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="pb-2 pr-3">
                    Tenant
                  </th>
                  <th scope="col" className="pb-2 pr-3 text-right">
                    Prior Share
                  </th>
                  <th scope="col" className="pb-2 pr-3 text-right">
                    Current Share
                  </th>
                  <th scope="col" className="pb-2 pr-3 text-right">
                    Delta (ppt)
                  </th>
                  <th scope="col" className="pb-2 pr-3 text-right">
                    Recovery Delta
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.tenant_impacts.map((impact) => (
                  <tr key={impact.lease_id} className="border-b">
                    <td className="py-2 pr-3 max-w-0">
                      <span className="block truncate max-w-[200px]">
                        {impact.tenant_name}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">
                      {(impact.prior_pro_rata_share * 100).toFixed(2)}%
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">
                      {(impact.current_pro_rata_share * 100).toFixed(2)}%
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">
                      {impact.share_delta_pct_points >= 0 ? '+' : ''}
                      {impact.share_delta_pct_points.toFixed(2)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">
                      {formatMoney(impact.recovery_delta, 'usd', {
                        signDisplay: 'exceptZero',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fine-print verification disclaimer */}
      <p className="mt-2 text-xs text-muted-foreground">
        These numbers come from your files and may have errors. Check your lease
        and GL before you act on them.
      </p>
    </div>
  )
}

function StatCard({
  label,
  value,
  subtext,
}: {
  label: string
  value: string
  subtext?: string
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
    </div>
  )
}
