/**
 * Results Step: PLG onboarding Step 5.
 *
 * Shows the CAM reconciliation result fetched from the backend.
 * CTA: "Continue →" advances to EmailCaptureStep (Step 6)
 * instead of going directly to the dashboard.
 */
import { useState, useEffect } from 'react'
import {
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useOnboarding } from '../OnboardFlowContext'
import { resolveApiUrl } from '@/api/url'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import { formatMoneyWhole } from '@/lib/money'

interface LeakageSummary {
  leakage: number
  leakage_pct: number
  capveri_calculated: number
  actual_billed: number
  has_reconciliation_data: boolean
  has_gl_data: boolean
  has_billing_data: boolean
}

export function ResultsStep() {
  const { nextStep, setStepData, state } = useOnboarding()
  const propertyId = state.data.propertyId as string | undefined
  const glDataYear = state.data.glDataYear as number | undefined
  const [data, setData] = useState<LeakageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    trackEvent('onboard_step_viewed', {
      step: 5,
      step_label: 'Results',
    })
  }, [])

  useEffect(() => {
    if (!propertyId) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchLeakage() {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (token) headers['Authorization'] = `Bearer ${token}`

        // Use glDataYear stored by UploadFileStep (Step 3), fall back to previous year
        const year = glDataYear ?? new Date().getFullYear() - 1
        const periodStart = `${year}-01-01`
        const periodEnd = `${year}-12-31`

        const resp = await fetch(
          resolveApiUrl(
            `/api/v1/leakage/${propertyId}?period_start=${periodStart}&period_end=${periodEnd}&include_drafts=true`
          ),
          { headers }
        )

        if (!resp.ok) throw new Error(`Failed to fetch results: ${resp.status}`)

        const json = (await resp.json()) as LeakageSummary
        if (!cancelled) {
          setData(json)
          setStepData('leakage', json.leakage)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load results'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchLeakage()
    return () => {
      cancelled = true
    }
  }, [propertyId, glDataYear, setStepData, retryCount])

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Spinner size="lg" variant="muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button
          variant="outline"
          onClick={() => {
            setError(null)
            setLoading(true)
            setRetryCount((c) => c + 1)
          }}
          className="w-full"
        >
          Try again
        </Button>
        <Button onClick={nextStep} variant="ghost" className="w-full">
          Continue anyway
        </Button>
      </div>
    )
  }

  // If data was returned but reconciliation hasn't run yet, show a teaser state
  if (data && !data.has_reconciliation_data) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <TrendingUp className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mb-2 text-xl font-bold">We got your files</h2>
          <p className="text-muted-foreground">
            Your result will be on your dashboard soon. Next, set up your
            account. Then you can come back to it.
          </p>
        </div>
        <Button size="lg" className="w-full" onClick={nextStep}>
          Continue →
        </Button>
      </div>
    )
  }

  const leakage = data?.leakage ?? 0
  const leakagePct = data?.leakage_pct ?? 0
  const hasLeakage = leakage > 0
  const hasOverbilling = leakage < 0
  const displayAmount = Math.abs(leakage)

  const heading = 'Here is what we checked'

  const subtitle = hasLeakage
    ? 'We caught under-bills before you sent the statement'
    : hasOverbilling
      ? 'We caught over-bills before you sent the statement'
      : 'Your statement holds up'

  const amountColor =
    hasLeakage || hasOverbilling ? 'text-foreground' : 'text-success'

  const Icon = hasLeakage || hasOverbilling ? AlertTriangle : CheckCircle2
  const hasIssue = hasLeakage || hasOverbilling

  return (
    <div className="mx-auto max-w-lg text-center">
      <div className="mb-6">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Icon className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-xl font-bold">{heading}</h2>
        <p className="text-muted-foreground">{subtitle}</p>
      </div>

      <div className="mb-8 rounded-2xl border bg-card p-8 shadow-sm">
        {hasIssue ? (
          <>
            <p
              className={`text-4xl font-extrabold tabular-nums font-mono ${amountColor}`}
            >
              {formatMoneyWhole(displayAmount)}
            </p>
            <p className="mt-1 text-muted-foreground">
              Amount to fix before sending ({Math.abs(leakagePct).toFixed(1)}%
              of what you charged)
            </p>
          </>
        ) : (
          <>
            <p className={`text-2xl font-bold ${amountColor}`}>
              Statement checks passed
            </p>
            <p className="mt-1 text-muted-foreground">
              No over-bills or under-bills to fix.
            </p>
          </>
        )}
      </div>

      {/* Fine-print verification disclaimer */}
      <p className="mx-auto mb-8 max-w-md text-xs text-muted-foreground">
        This is an early result from your files. Check your lease and your own
        records before you send anything.
      </p>

      <Button
        size="lg"
        className="w-full"
        onClick={() => {
          trackEvent('onboard_step_completed', {
            step: 5,
            step_label: 'Results',
            leakage,
          })
          nextStep()
        }}
      >
        Continue →
      </Button>
    </div>
  )
}
