/**
 * Anomaly List Component
 *
 * Displays a grouped list of anomalies organized by severity level.
 */

import { useMemo } from 'react'
import { ShieldCheck } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { AnomalyCard } from './AnomalyCard'
import type { DetectedAnomaly } from '../types'

export interface AnomalyListProps {
  anomalies: DetectedAnomaly[]
}

export function AnomalyList({ anomalies }: AnomalyListProps) {
  const grouped = useMemo(() => {
    return {
      critical: anomalies.filter((a) => a.severity === 'critical'),
      warning: anomalies.filter((a) => a.severity === 'warning'),
      info: anomalies.filter((a) => a.severity === 'info'),
    }
  }, [anomalies])

  if (anomalies.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Nothing unusual found"
        description="All expense patterns look normal."
        size="sm"
      />
    )
  }

  return (
    <div className="space-y-6">
      {grouped.critical.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-destructive-strong">
            Critical Anomalies ({grouped.critical.length})
          </h3>
          <div className="space-y-2">
            {grouped.critical.map((anomaly, i) => (
              <AnomalyCard key={i} anomaly={anomaly} />
            ))}
          </div>
        </div>
      )}

      {grouped.warning.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-warning-foreground">
            Warnings ({grouped.warning.length})
          </h3>
          <div className="space-y-2">
            {grouped.warning.map((anomaly, i) => (
              <AnomalyCard key={i} anomaly={anomaly} />
            ))}
          </div>
        </div>
      )}

      {grouped.info.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-primary">
            Information ({grouped.info.length})
          </h3>
          <div className="space-y-2">
            {grouped.info.map((anomaly, i) => (
              <AnomalyCard key={i} anomaly={anomaly} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
