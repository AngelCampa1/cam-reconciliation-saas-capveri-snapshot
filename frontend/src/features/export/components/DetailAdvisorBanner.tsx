import { useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { pluralizeWithCount } from '@/lib/pluralize'
import { Skeleton } from '@/components/ui/skeleton'
import type { DetailLevelAdvisoryResponse, DetailSeverity } from '../types'

export interface DetailAdvisorBannerProps {
  data: DetailLevelAdvisoryResponse | undefined
  isLoading: boolean
  isError: boolean
}

const SEVERITY_CONFIG: Record<
  DetailSeverity,
  { bg: string; border: string; text: string; badge: string; label: string }
> = {
  ok: {
    bg: 'bg-success/5',
    border: 'border-success/30',
    text: 'text-success',
    badge: 'bg-success/15 text-success',
    label: 'Good',
  },
  suggestion: {
    bg: 'bg-primary/5',
    border: 'border-primary/20',
    text: 'text-primary',
    badge: 'bg-primary/10 text-primary',
    label: 'Suggestion',
  },
  warning: {
    bg: 'bg-warning/5',
    border: 'border-warning/30',
    text: 'text-warning',
    badge: 'bg-warning/15 text-warning',
    label: 'Warning',
  },
  critical: {
    bg: 'bg-destructive/5',
    border: 'border-destructive/30',
    text: 'text-destructive',
    badge: 'bg-destructive/15 text-destructive',
    label: 'Critical',
  },
}

function SeverityIcon({ severity }: { severity: DetailSeverity }) {
  if (severity === 'ok')
    return <CheckCircle2 className="h-4 w-4 text-success" />
  if (severity === 'critical' || severity === 'warning')
    return <AlertTriangle className="h-4 w-4 text-warning" />
  return <Info className="h-4 w-4 text-primary" />
}

export function DetailAdvisorBanner({
  data,
  isLoading,
  isError,
}: DetailAdvisorBannerProps) {
  const [expanded, setExpanded] = useState(false)

  if (isLoading) {
    return (
      <div
        data-testid="detail-advisor-loading"
        className="space-y-2 rounded-lg border p-3"
        role="status"
        aria-label="Loading detail advisor"
      >
        <Skeleton className="h-4 w-3/4" aria-hidden="true" />
        <Skeleton className="h-3 w-1/2" aria-hidden="true" />
      </div>
    )
  }

  if (isError || !data) return null

  const config = SEVERITY_CONFIG[data.overall_severity]
  const hasSuggestions = data.grouping_suggestions.length > 0

  return (
    <div
      data-testid="detail-advisor-banner"
      className={cn(
        'rounded-lg border',
        config.border,
        config.bg,
        'p-3 space-y-2'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <SeverityIcon severity={data.overall_severity} />
          <div>
            <div className="flex items-center gap-2">
              <span className={cn('text-sm font-medium', config.text)}>
                Detail Level Advisory
              </span>
              <span
                data-testid="severity-badge"
                className={cn(
                  'text-xs font-medium px-1.5 py-0.5 rounded',
                  config.badge
                )}
              >
                {config.label}
              </span>
            </div>
            <p
              data-testid="advisor-summary"
              className={cn('text-sm mt-0.5', config.text)}
            >
              {data.summary}
            </p>
          </div>
        </div>

        {hasSuggestions && (
          <Button
            variant="ghost"
            size="sm"
            data-testid="toggle-suggestions"
            className="shrink-0 h-6 w-6 p-0"
            aria-label={expanded ? 'Hide suggestions' : 'Show suggestions'}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        )}
      </div>

      {expanded && hasSuggestions && (
        <div data-testid="suggestions-list" className="space-y-2 pt-1">
          {data.grouping_suggestions.map((sg, i) => {
            const sgConfig = SEVERITY_CONFIG[sg.severity]
            return (
              <div
                key={`${sg.category_name}-${i}`}
                className="text-sm border rounded p-2 bg-background/60"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{sg.category_name}</span>
                  <span
                    className={cn(
                      'text-xs px-1.5 py-0.5 rounded',
                      sgConfig.badge
                    )}
                  >
                    {pluralizeWithCount(sg.current_line_count, 'item')}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {sg.explanation}
                </p>
              </div>
            )
          })}
          {data.suggested_total_lines > 0 && (
            <p className="text-xs text-muted-foreground">
              Grouping would reduce to {data.suggested_total_lines} total lines
              (from {data.total_line_items}).
            </p>
          )}
        </div>
      )}
    </div>
  )
}
