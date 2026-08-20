import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface ConfidenceIndicatorProps {
  confidence: number // 0-1 normalized
  sourceText?: string
  className?: string
}

/**
 * Get confidence level category from normalized confidence score.
 *
 * @param confidence - Normalized confidence score (0-1)
 * @returns Confidence level category
 */
export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.9) return 'high'
  if (confidence >= 0.7) return 'medium'
  return 'low'
}

const CONFIDENCE_STYLES: Record<ConfidenceLevel, string> = {
  high: 'bg-success/10 text-success-strong border-success/20',
  medium: 'bg-warning/10 text-warning-foreground border-warning/20',
  low: 'bg-destructive/10 text-destructive-strong border-destructive/20',
}

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence - requires review',
}

/**
 * Displays a color-coded confidence badge with tooltip.
 *
 * Shows confidence percentage as a badge with color indicating the level:
 * - Green (high): ≥90%
 * - Amber (medium): 70-89%
 * - Red (low): <70%
 *
 * Tooltip shows confidence level label and optional source text preview.
 *
 * Story 16.5: Create Confidence Indicators
 */
export function ConfidenceIndicator({
  confidence,
  sourceText,
  className,
}: ConfidenceIndicatorProps) {
  const level = getConfidenceLevel(confidence)
  const percentage = Math.round(confidence * 100)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(CONFIDENCE_STYLES[level], className)}
          data-testid="confidence-badge"
          data-confidence-level={level}
        >
          {percentage}%
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-medium" data-testid="confidence-label">
          {CONFIDENCE_LABELS[level]}
        </p>
        {sourceText && (
          <p
            className="text-sm text-muted-foreground mt-1"
            data-testid="source-preview"
          >
            Source: "
            {sourceText.length > 100
              ? sourceText.slice(0, 100) + '...'
              : sourceText}
            "
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
