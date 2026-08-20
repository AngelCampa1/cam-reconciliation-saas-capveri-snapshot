/**
 * GLAnalysisTeaserCard: CRO teaser for the PLG results paywall.
 *
 * Shows 3 static, blurred placeholder GL analysis findings to communicate
 * the value of the paid GL Narrative Analysis feature.
 *
 * IMPORTANT: This is entirely static. It does NOT call the Claude GL
 * analysis API. Running real analysis for unconverted PLG users would
 * waste tokens. The blurred findings are illustrative only.
 */

import { Brain, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const PLACEHOLDER_FINDINGS = [
  {
    icon: '⚠️',
    text: 'CapEx misclassification risk. Roof repair ($42,800) expensed to CAM in Q2. IRS TPR rules require capitalization for structural improvements.',
  },
  {
    icon: '📈',
    text: 'Mid-year spike: HVAC vendor charges in Q3 up 42% vs prior year with no lease amendment on file. May trigger a tenant audit dispute.',
  },
  {
    icon: '🔒',
    text: 'Management fee ($18,200) applied before gross-up calculation. Per BOMA 2024, admin fees should be excluded from the grossed-up expense pool.',
  },
]

export function GLAnalysisTeaserCard() {
  return (
    <div
      className="rounded-lg border border-warning/30 bg-warning/5 mb-6"
      data-testid="gl-analysis-teaser-card"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <Brain className="h-4 w-4 text-warning" aria-hidden="true" />
        <span className="text-sm font-semibold text-warning-foreground">
          GL Narrative Analysis
        </span>
        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning-foreground">
          Advisory only
        </span>
        <span className="ml-auto rounded-full bg-warning px-2 py-0.5 text-xs font-medium text-warning-foreground">
          3 issues identified
        </span>
      </div>

      {/* Blurred findings */}
      <div className="border-t border-warning/20 px-4 py-3 space-y-2">
        {PLACEHOLDER_FINDINGS.map((finding, i) => (
          <div
            key={i}
            data-testid="gl-teaser-finding"
            className={cn(
              'flex items-start gap-2 rounded-md bg-background/60 px-3 py-2 text-sm text-warning-foreground',
              'blur-sm pointer-events-none select-none'
            )}
            aria-hidden="true"
          >
            <span className="shrink-0">{finding.icon}</span>
            <span>{finding.text}</span>
          </div>
        ))}

        {/* Lock overlay hint */}
        <div className="flex items-center justify-center gap-1.5 pt-1 text-xs text-warning-foreground">
          <Lock className="h-3 w-3" aria-hidden="true" />
          <span>Subscribe to see full GL analysis</span>
        </div>
      </div>

      {/* CTA */}
      <div className="border-t border-warning/20 px-4 py-3">
        <Button
          className="w-full bg-warning hover:bg-warning/90 text-warning-foreground"
          asChild
        >
          <Link to="/pricing">Unlock full GL analysis →</Link>
        </Button>
      </div>
    </div>
  )
}
