/**
 * GLAnalysisPanel: Advisory GL narrative analysis panel.
 *
 * Displays Claude's analysis of GL data before reconciliation finalization.
 * Analysis is advisory only. It never modifies calculations.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import { Brain, ChevronDown, ChevronUp, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ErrorState'
import { cn, formatDateTime } from '@/lib/utils'
import {
  useLatestGLAnalysis,
  useRunGLAnalysis,
  useDismissGLAnalysis,
} from '../hooks/useGLAnalysis'

interface GLAnalysisPanelProps {
  propertyId: string
  periodYear: number
  className?: string
}

export function GLAnalysisPanel({
  propertyId,
  periodYear,
  className,
}: GLAnalysisPanelProps) {
  const [expanded, setExpanded] = useState(true)

  const {
    data: analysis,
    isLoading: isLoadingLatest,
    isError: latestError,
    isPaused: isLatestPaused,
    refetch: refetchLatest,
  } = useLatestGLAnalysis(propertyId, periodYear)

  const isOffline = isLatestPaused && !analysis

  const runMutation = useRunGLAnalysis(propertyId, periodYear)
  const dismissMutation = useDismissGLAnalysis(propertyId, periodYear)

  const handleRun = () => {
    runMutation.mutate(undefined, {
      onSuccess: () => toast.success('GL analysis complete'),
    })
  }

  const handleDismiss = () => {
    if (analysis?.id) {
      dismissMutation.mutate(analysis.id)
    }
  }

  const isRunning = runMutation.isPending
  const isDismissing = dismissMutation.isPending
  const runError = runMutation.isError
  const dismissError = dismissMutation.isError

  // ran_at is a true timestamp (local time-of-day is meaningful). Route it
  // through the app-wide date+time SSOT for a stable, readable label
  // ("Jun 14, 2026 5:40 PM") that matches every other timestamp render.
  const ranAt = analysis?.ran_at ? formatDateTime(analysis.ran_at) : null

  return (
    <div
      className={cn(
        'rounded-lg border border-warning/30 bg-warning/5',
        className
      )}
      data-testid="gl-analysis-panel"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Brain
            className="h-4 w-4 flex-shrink-0 text-warning"
            aria-hidden="true"
          />
          <span className="truncate text-sm font-semibold text-warning-foreground">
            GL Narrative Analysis
          </span>
          <span className="flex-shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning-foreground">
            Advisory only
          </span>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {analysis && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRun}
              disabled={isRunning || isDismissing}
              className="h-10 text-xs text-warning-foreground hover:text-warning-foreground/80"
            >
              <RefreshCw
                className={cn('mr-1 h-3 w-3', isRunning && 'animate-spin')}
                aria-hidden="true"
              />
              Re-run
            </Button>
          )}

          {analysis && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              disabled={isRunning || isDismissing}
              className="h-10 w-10 rounded-full text-warning-foreground hover:text-warning-foreground/80"
              aria-label="Dismiss GL analysis"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="h-10 w-10 rounded-full text-warning-foreground hover:text-warning-foreground/80"
            aria-label={
              expanded ? 'Collapse analysis panel' : 'Expand analysis panel'
            }
          >
            {expanded ? (
              <ChevronUp className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="border-t border-warning/20 px-4 py-3">
          {/* Mutation error banners */}
          {runError && (
            <p className="mb-3 text-sm text-destructive-strong">
              Analysis failed. The AI service may be temporarily unavailable.
              Please try again.
            </p>
          )}
          {dismissError && (
            <p className="mb-3 text-sm text-destructive-strong">
              Failed to dismiss analysis. Please try again.
            </p>
          )}

          {/* Failed to load the latest analysis (including offline/paused) */}
          {!isLoadingLatest && (latestError || isOffline) && !isRunning && (
            <ErrorState
              title="Couldn't load GL analysis"
              offline={isOffline}
              action={{ onClick: () => void refetchLatest() }}
              size="sm"
            />
          )}

          {/* No analysis yet */}
          {!isLoadingLatest &&
            !latestError &&
            !isOffline &&
            !analysis &&
            !isRunning && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Review your GL data for possible CapEx/OpEx mix-ups and CAM
                  red flags. Results are advisory. Check them before you
                  finalize.
                </p>
                <Button
                  size="sm"
                  onClick={handleRun}
                  className="bg-warning hover:bg-warning/90 text-warning-foreground"
                >
                  <Brain className="mr-2 h-4 w-4" aria-hidden="true" />
                  Run GL analysis
                </Button>
              </div>
            )}

          {/* Running spinner */}
          {isRunning && (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              Analyzing GL data...
            </div>
          )}

          {/* Analysis result */}
          {analysis && !isRunning && (
            <>
              {ranAt && (
                <p className="mb-3 text-xs text-muted-foreground">
                  Analysis run {ranAt}
                </p>
              )}
              {/* react-markdown v10 does not render raw HTML by default.
                  Do NOT add rehypeRawHtml or remark-html plugins here, as
                  analysis_markdown is AI-generated and would become an XSS vector. */}
              <div className="prose prose-sm prose-amber max-w-none">
                <ReactMarkdown>{analysis.analysis_markdown}</ReactMarkdown>
              </div>
              {/* Fine-print verification disclaimer */}
              <p className="mt-3 text-xs text-muted-foreground">
                This is AI-generated and may be wrong. Check it against your
                source files before you rely on it.
              </p>
            </>
          )}

          {/* Loading state */}
          {isLoadingLatest && (
            <div className="py-3 text-sm text-muted-foreground">
              Loading analysis…
            </div>
          )}
        </div>
      )}
    </div>
  )
}
