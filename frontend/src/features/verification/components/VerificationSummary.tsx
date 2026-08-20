import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export interface FieldSourceReference {
  field: string
  confidence: number // 0-1 normalized
  verified: boolean
}

export interface VerificationSummaryProps {
  sourceReferences: FieldSourceReference[]
  onFilterChange: (filter: 'all' | 'low') => void
  currentFilter: 'all' | 'low'
  className?: string
}

/**
 * Displays verification progress summary and low-confidence field filter.
 *
 * Shows:
 * - Progress bar indicating percentage of verified fields
 * - Count of verified vs total fields
 * - Button to filter/show only low-confidence fields (if any exist)
 *
 * Low-confidence fields are those with confidence < 0.7 (70%).
 *
 * Story 16.5: Create Confidence Indicators
 */
export function VerificationSummary({
  sourceReferences,
  onFilterChange,
  currentFilter,
  className,
}: VerificationSummaryProps) {
  const lowConfidenceCount = sourceReferences.filter(
    (r) => r.confidence < 0.7
  ).length
  const totalFields = sourceReferences.length
  const verifiedCount = sourceReferences.filter((r) => r.verified).length

  const progressPercentage =
    totalFields > 0 ? (verifiedCount / totalFields) * 100 : 0

  return (
    <div
      className={cn(
        'flex items-center gap-4 p-4 bg-muted/50 rounded-lg shadow-sm',
        className
      )}
      data-testid="verification-summary"
    >
      <div className="flex-1">
        <div className="text-sm text-muted-foreground">
          Verification Progress
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Progress
            value={progressPercentage}
            aria-label={`Verification progress: ${verifiedCount} of ${totalFields} fields verified`}
            className="flex-1"
            data-testid="progress-bar"
          />
          <span className="text-sm font-medium" data-testid="progress-text">
            {verifiedCount}/{totalFields}
          </span>
        </div>
      </div>

      {lowConfidenceCount > 0 && (
        <Button
          variant={currentFilter === 'low' ? 'default' : 'outline'}
          size="sm"
          onClick={() =>
            onFilterChange(currentFilter === 'low' ? 'all' : 'low')
          }
          className="gap-2"
          data-testid="low-confidence-filter"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {lowConfidenceCount} need review
        </Button>
      )}
    </div>
  )
}
