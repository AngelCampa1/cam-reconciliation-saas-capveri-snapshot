/**
 * WelcomeSampleStep: the sample-first front door for the PLG onboarding flow.
 *
 * A brand-new anonymous user lands here FIRST (before any form). The screen is
 * itself a pre-run sample reconciliation with billing exposure, shown in
 * plain English with a big confident number. The 3 findings are behind a
 * progressive-disclosure reveal so the first view stays calm and uncluttered.
 *
 * Primary action ("Check my own building") starts the real-data path by
 * flipping `flowStarted` in the flow context. No upload, no form, no rush, and
 * no auto-advancing timers live on this screen.
 */
import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import { useOnboarding } from '../OnboardFlowContext'
import {
  SAMPLE_PROPERTY_NAME,
  SAMPLE_TOTAL_FOUND_DISPLAY,
  SAMPLE_TOTAL_LABEL,
  SAMPLE_FINDINGS,
  getSampleResultSeenStorageKey,
} from './sampleResult'

export function WelcomeSampleStep() {
  const { setStepData, userId } = useOnboarding()
  const [showFindings, setShowFindings] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(getSampleResultSeenStorageKey(userId), '1')
    } catch {
      // storage unavailable; analytics still records the value moment
    }
    trackEvent('onboard_sample_result_viewed', {
      step_label: 'Welcome Sample',
      sample_version: 'assurance-overbill-first',
    })
    trackEvent('onboard_step_viewed', {
      step: 0,
      step_label: 'Welcome Sample',
    })
  }, [userId])

  const handleStartRealData = () => {
    trackEvent('onboard_step_completed', {
      step: 0,
      step_label: 'Welcome Sample',
    })
    // Flip the flag so the wizard renders the real step machine from step 1.
    setStepData('flowStarted', true)
  }

  const handleToggleFindings = () => {
    setShowFindings((prev) => {
      const next = !prev
      if (next) {
        // Distinct event so the disclosure reveal does not double-count the
        // step-0 view in the onboarding funnel.
        trackEvent('onboard_sample_findings_revealed', {
          step_label: 'Welcome Sample',
        })
      }
      return next
    })
  }

  return (
    <div className="mx-auto max-w-xl">
      {/* Hero: one big number, one plain sentence. The eyebrow is the page's
          top-level heading so the screen always has a heading, even while the
          findings reveal below is collapsed. */}
      <div className="text-center">
        <h1 className="text-sm font-medium text-muted-foreground">
          Modeled sample building check
        </h1>

        <p className="mt-5 font-mono text-6xl font-extrabold tabular-nums tracking-tight text-foreground sm:text-7xl">
          {SAMPLE_TOTAL_FOUND_DISPLAY}
        </p>
        <p className="mt-2 text-sm font-medium text-foreground">
          {SAMPLE_TOTAL_LABEL}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {SAMPLE_PROPERTY_NAME}
        </p>

        <p className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-foreground">
          This modeled example shows charges to fix before tenants see the
          statement.
        </p>

        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          It is sample data, not a customer result.
        </p>
      </div>

      {/* Progressive disclosure: how we found it */}
      <div className="mt-8">
        <button
          type="button"
          onClick={handleToggleFindings}
          aria-expanded={showFindings}
          aria-controls="welcome-sample-findings"
          className="mx-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-primary transition-colors duration-fast hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {showFindings ? 'Hide how we found it' : 'Show me how we found it'}
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform duration-200 motion-reduce:transition-none',
              showFindings && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </button>

        {/* grid-template-rows reveal: animates open without animating height */}
        <div
          id="welcome-sample-findings"
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
            showFindings ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          )}
        >
          <div className="overflow-hidden">
            <div className="pt-5">
              <h2 className="mb-3 text-center text-sm font-semibold text-foreground">
                What we caught
              </h2>
              <ul className="space-y-3">
                {SAMPLE_FINDINGS.map((finding) => (
                  <li
                    key={finding.id}
                    className="rounded-2xl border bg-card p-5 text-left shadow-sm"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="font-medium text-foreground">
                        {finding.title}
                      </p>
                      <p className="shrink-0 font-mono text-base font-bold tabular-nums text-foreground">
                        {finding.amountDisplay}
                      </p>
                    </div>
                    <p className="mt-1 text-xs font-medium uppercase text-muted-foreground">
                      {finding.direction === 'overbill'
                        ? 'Over-bill caught'
                        : 'Under-bill caught'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {finding.explanation}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* One clear next action */}
      <div className="mt-10">
        <Button
          type="button"
          size="xl"
          className="w-full"
          onClick={handleStartRealData}
        >
          Check my own building
        </Button>
      </div>
    </div>
  )
}
