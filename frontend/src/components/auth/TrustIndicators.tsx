/**
 * Trust Indicators Component
 *
 * Displays security badges and certifications for building trust.
 * Features:
 * - Compact badge display
 * - Icons with labels
 * - Muted styling for non-intrusive placement
 */
import * as React from 'react'
import { Lock, Award, Clock, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TrustIndicator {
  /** Badge icon */
  icon: React.ReactNode
  /** Badge label */
  label: string
}

export interface TrustIndicatorsProps {
  /** Custom trust indicators */
  indicators?: TrustIndicator[]
  /** Additional CSS classes */
  className?: string
}

/** Default trust indicators */
const defaultIndicators: TrustIndicator[] = [
  {
    icon: <Lock className="h-3.5 w-3.5" />,
    label: 'Encrypted records',
  },
  {
    icon: <Award className="h-3.5 w-3.5" />,
    label: 'BOMA 2024 aligned',
  },
  {
    icon: <Clock className="h-3.5 w-3.5" />,
    label: 'Audit trail for every change',
  },
  {
    icon: <EyeOff className="h-3.5 w-3.5" />,
    label: 'Logs never store PII',
  },
]

export function TrustIndicators({
  indicators = defaultIndicators,
  className,
}: TrustIndicatorsProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-center gap-4 text-muted-foreground',
        className
      )}
    >
      {indicators.map((indicator, index) => (
        <div key={index} className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground/70" aria-hidden="true">
            {indicator.icon}
          </span>
          <span>{indicator.label}</span>
        </div>
      ))}
    </div>
  )
}
