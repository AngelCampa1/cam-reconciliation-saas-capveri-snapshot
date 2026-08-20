/**
 * VarianceReport: collapsible variance comparison panel.
 *
 * Shows year-over-year variance with threshold highlighting and
 * a PDF export button.
 */

import { useState } from 'react'
import { TrendingUp, Loader2, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useExportVariancePdf } from '@/api/hooks'
import { toast } from 'sonner'
import { trackEvent } from '@/lib/analytics'

export interface VarianceReportProps {
  propertyId: string
  year: number
  priorYear?: number
}

export function VarianceReport({
  propertyId,
  year,
  priorYear = year - 1,
}: VarianceReportProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [threshold, setThreshold] = useState(10)

  const exportMutation = useExportVariancePdf({
    onSuccess: () => toast.success('Variance report downloaded'),
    onError: () => toast.error('Failed to export variance report'),
  })

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 rounded-full"
        aria-expanded={isOpen}
        aria-controls="variance-report-panel"
        onClick={() => {
          setIsOpen((prev) => !prev)
          if (!isOpen) {
            trackEvent('variance_report_opened', {
              property_id: propertyId,
              year,
              prior_year: priorYear,
            })
          }
        }}
      >
        <TrendingUp className="h-4 w-4" aria-hidden="true" />
        Statement Check Report
      </Button>

      {isOpen && (
        <Card
          id="variance-report-panel"
          data-testid="variance-report"
          className="mt-3"
        >
          <CardHeader className="pb-2">
            <CardTitle as="h2" className="text-base">
              Statement Check Report
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label className="text-sm">
                Highlight threshold: {threshold}%
              </Label>
              <input
                type="range"
                data-testid="threshold-slider"
                aria-label="Variance highlight threshold"
                min="0"
                max="50"
                step="1"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full cursor-pointer accent-primary rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="text-sm text-muted-foreground">
              <p>
                We checked {priorYear} vs {year} reconciliation data.
              </p>
              <p className="text-xs mt-1">
                Variances above {threshold}% are highlighted.
              </p>
            </div>

            <Button
              data-testid="export-variance-pdf-button"
              variant="outline"
              size="sm"
              className="w-full gap-2 rounded-full"
              disabled={exportMutation.isPending}
              onClick={() =>
                exportMutation.mutate({
                  property_id: propertyId,
                  current_year: year,
                  prior_year: priorYear,
                  threshold_percent: threshold,
                })
              }
            >
              {exportMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileDown className="h-4 w-4" aria-hidden="true" />
              )}
              Download PDF report
            </Button>

            <p className="text-xs text-muted-foreground">
              This report shows what we checked. It shows what changed. Check
              the figures before billing.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
