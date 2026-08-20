/**
 * Anomaly Card Component
 *
 * Displays a single anomaly with appropriate styling based on severity.
 */

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AlertCircle,
  AlertTriangle,
  InfoIcon,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { DetectedAnomaly } from '../types'
import { cn } from '@/lib/utils'

export interface AnomalyCardProps {
  anomaly: DetectedAnomaly
}

const severityConfig = {
  critical: {
    icon: AlertCircle,
    color: 'text-destructive-strong',
    bg: 'bg-destructive/10 border-destructive/20',
    badgeVariant: 'destructive' as const,
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-warning-foreground',
    bg: 'bg-warning/10 border-warning/20',
    badgeVariant: 'default' as const,
  },
  info: {
    icon: InfoIcon,
    color: 'text-primary',
    bg: 'bg-primary/10 border-primary/20',
    badgeVariant: 'secondary' as const,
  },
}

const anomalyTypeLabels: Record<string, string> = {
  spike: 'Spike',
  drop: 'Drop',
  new_category: 'New Category',
  missing_category: 'Missing Category',
  pattern_break: 'Pattern Break',
  outlier: 'Outlier',
}

export function AnomalyCard({ anomaly }: AnomalyCardProps) {
  const config = severityConfig[anomaly.severity]
  const Icon = config.icon
  const isIncrease = anomaly.variance_percent > 0
  const TrendIcon = isIncrease ? TrendingUp : TrendingDown

  return (
    <Card
      className={cn(
        'border shadow-sm transition-all duration-fast hover:shadow-sm',
        config.bg
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Icon className={cn('h-5 w-5 mt-0.5', config.color)} />
          <div className="flex-1 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-semibold text-sm">{anomaly.pool_name}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={config.badgeVariant} className="text-xs">
                    {anomalyTypeLabels[anomaly.anomaly_type]}
                  </Badge>
                  {anomaly.anomaly_type === 'spike' ||
                  anomaly.anomaly_type === 'drop' ? (
                    <div
                      className={cn(
                        'flex items-center gap-1 text-xs font-medium',
                        config.color
                      )}
                    >
                      <TrendIcon className="h-3 w-3" />
                      {Math.abs(anomaly.variance_percent).toFixed(1)}%
                    </div>
                  ) : null}
                </div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {anomaly.years_affected.join(', ')}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {anomaly.explanation}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
