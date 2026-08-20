/**
 * CAM Billing Risk Estimator - free calculator at /tools/cam-leakage-estimator
 *
 * Estimates modeled CAM billing exposure based on portfolio inputs.
 */

import { useState, useEffect, useId, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToolPageLayout } from '@/components/content/ToolPageLayout'
import { CalculatorUnlockGate } from '@/components/lead-capture/CalculatorUnlockGate'
import { trackEvent } from '@/lib/analytics'
import { buildSiteUrl } from '@/lib/domains'
import { formatMoneyWhole } from '@/lib/money'

const STRUCTURED_DATA = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    applicationCategory: 'FinanceApplication',
    name: 'CAM Billing Risk Estimator',
    description:
      'Estimate modeled annual CAM billing exposure. Enter your buildings, average rentable SF, and CAM rate to see a result before email.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    url: buildSiteUrl('/tools/cam-leakage-estimator'),
    browserRequirements: 'Requires JavaScript',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to Estimate CAM Billing Risk',
    description:
      'Use the free CAM Billing Risk Estimator to model annual billing exposure from your own inputs.',
    totalTime: 'PT1M',
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Enter number of buildings',
        text: 'Use the slider or input field to set your portfolio building count from 1 to 200 buildings.',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Enter average rentable SF per building',
        text: 'Input the average rentable square footage per building in your portfolio.',
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Review your billing-risk estimate',
        text: 'See a modeled annual CAM billing-risk range and a 7% cap-rate check before email.',
      },
    ],
  },
]

const LEAKAGE_LOW_RATE = 0.0025
const LEAKAGE_HIGH_RATE = 0.015
const CAP_RATE = 0.07
const DEFAULT_CAM_PER_SF = 8.5
const MIN_TRACKABLE_AVG_SF = 1000

export function CamLeakageEstimatorPage() {
  const buildingsId = useId()
  const sfId = useId()
  const camId = useId()

  const [buildings, setBuildings] = useState<number | ''>(1)
  const [avgSF, setAvgSF] = useState<number | ''>('')
  const [camPerSF, setCamPerSF] = useState<number>(DEFAULT_CAM_PER_SF)
  const [camPerSFRaw, setCamPerSFRaw] = useState<string>(
    String(DEFAULT_CAM_PER_SF)
  )
  const [estimateSent, setEstimateSent] = useState(false)
  const hasTrackedResult = useRef(false)

  const camPerSFInvalid =
    camPerSFRaw !== '' &&
    (isNaN(Number(camPerSFRaw)) || Number(camPerSFRaw) <= 0)

  const isReady =
    typeof buildings === 'number' &&
    buildings > 0 &&
    typeof avgSF === 'number' &&
    avgSF > 0 &&
    camPerSF > 0
  const resultAnalyticsReady =
    isReady && (avgSF as number) >= MIN_TRACKABLE_AVG_SF

  const totalCAMPool = isReady
    ? (buildings as number) * (avgSF as number) * camPerSF
    : 0
  const leakageLow = totalCAMPool * LEAKAGE_LOW_RATE
  const leakageHigh = totalCAMPool * LEAKAGE_HIGH_RATE
  const valuationLow = Math.round(leakageLow / CAP_RATE)
  const valuationHigh = Math.round(leakageHigh / CAP_RATE)

  useEffect(() => {
    if (!resultAnalyticsReady || hasTrackedResult.current) return

    const trackResult = window.setTimeout(() => {
      hasTrackedResult.current = true
      const buildingCount = buildings as number
      const averageSquareFeet = avgSF as number
      trackEvent('tool_result_viewed', {
        slug: 'cam-leakage-estimator',
        buildings: buildingCount,
        avg_sf_bucket:
          averageSquareFeet < 50_000
            ? 'under_50k'
            : averageSquareFeet < 250_000
              ? '50k_249k'
              : averageSquareFeet < 1_000_000
                ? '250k_999k'
                : '1m_plus',
        leakage_low: leakageLow,
        leakage_high: leakageHigh,
        valuation_low: valuationLow,
        valuation_high: valuationHigh,
      })
    }, 400)

    return () => window.clearTimeout(trackResult)
  }, [
    avgSF,
    buildings,
    resultAnalyticsReady,
    leakageHigh,
    leakageLow,
    valuationHigh,
    valuationLow,
  ])

  const buildingsNum =
    typeof buildings === 'number' && !isNaN(buildings) ? buildings : 1

  return (
    <ToolPageLayout
      title="Free CAM Billing Risk Estimator for Commercial Property Managers | CapVeri"
      description="Estimate modeled CAM billing risk for your portfolio. Enter your buildings, SF, and CAM rate to see a result before email."
      canonical="/tools/cam-leakage-estimator"
      toolName="CAM Billing Risk Estimator"
      structuredData={STRUCTURED_DATA}
    >
      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          CAM Billing Risk Estimator
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          See bill risk before email.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Input card */}
        <Card>
          <CardHeader>
            <CardTitle as="h2">Your Portfolio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Buildings — slider + number input */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor={buildingsId}>Number of Buildings</Label>
                <span className="text-sm font-semibold tabular-nums">
                  {buildings === '' ? 0 : buildings}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={200}
                value={buildingsNum}
                aria-label="Buildings count slider"
                className="min-h-[44px] w-full cursor-pointer accent-primary"
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setBuildings(val)
                }}
              />
              <Input
                id={buildingsId}
                type="number"
                min={1}
                max={200}
                className="h-11"
                value={buildings === '' ? '' : buildings}
                aria-label="Number of buildings"
                onChange={(e) => {
                  const raw = e.target.value
                  if (raw === '') {
                    setBuildings('')
                    return
                  }
                  const val = Math.min(200, Math.max(1, Number(raw)))
                  setBuildings(val)
                }}
              />
            </div>

            {/* Average SF */}
            <div className="space-y-2">
              <Label htmlFor={sfId}>Average Rentable SF per Building</Label>
              <Input
                id={sfId}
                type="number"
                min={1}
                className="h-11"
                placeholder="e.g. 250,000"
                value={avgSF === '' ? '' : avgSF}
                aria-label="Average rentable SF"
                onChange={(e) => {
                  const raw = e.target.value
                  if (raw === '') {
                    setAvgSF('')
                    return
                  }
                  setAvgSF(Number(raw))
                }}
              />
            </div>

            {/* CAM per SF */}
            <div className="space-y-2">
              <Label htmlFor={camId}>CAM per SF ($/year)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  $
                </span>
                <Input
                  id={camId}
                  type="number"
                  min={0.01}
                  step={0.01}
                  className="h-11 pl-7"
                  value={camPerSFRaw}
                  aria-label="CAM per SF"
                  onChange={(e) => {
                    const raw = e.target.value
                    setCamPerSFRaw(raw)
                    const val = Number(raw)
                    if (!isNaN(val) && val > 0) setCamPerSF(val)
                  }}
                />
              </div>
              {camPerSFInvalid && (
                <p role="alert" className="text-sm text-destructive-strong">
                  Enter a number above 0 to see your estimate.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results card */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle as="h2">Your Estimate</CardTitle>
          </CardHeader>
          <CardContent aria-live="polite" className="space-y-6">
            {/* Billing-risk range */}
            <div>
              <p className="text-sm font-medium text-foreground uppercase tracking-wide">
                Modeled annual CAM bill risk
              </p>
              {isReady ? (
                <p className="mt-1 text-3xl font-bold tabular-nums font-mono">
                  {formatMoneyWhole(leakageLow)}{' '}
                  <span className="text-muted-foreground">to</span>{' '}
                  {formatMoneyWhole(leakageHigh)}
                </p>
              ) : (
                <p className="mt-1 text-3xl font-bold text-muted-foreground/40">
                  $0 to $0
                </p>
              )}
            </div>

            {/* Valuation impact */}
            <div>
              <p className="text-sm font-medium text-foreground uppercase tracking-wide">
                7% cap-rate check
              </p>
              {isReady ? (
                <p className="mt-1 text-3xl font-bold tabular-nums font-mono">
                  {formatMoneyWhole(valuationLow)}{' '}
                  <span className="text-muted-foreground">to</span>{' '}
                  {formatMoneyWhole(valuationHigh)}
                </p>
              ) : (
                <p className="mt-1 text-3xl font-bold text-muted-foreground/40">
                  $0 to $0
                </p>
              )}
            </div>

            {!isReady && (
              <p className="text-sm text-muted-foreground">
                Enter your portfolio details above to see your estimate.
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Modeled rates: 0.25% (low) to 1.5% (high). Use your own portfolio
              history to tune the model.
            </p>

            {isReady && (
              <div className="rounded-md border bg-background p-4">
                {estimateSent ? (
                  <p className="text-sm font-medium">
                    Done. Check your inbox for the worksheet.
                  </p>
                ) : (
                  <CalculatorUnlockGate
                    slug="cam-leakage-estimator"
                    source="cam_leakage_estimator_result"
                    storageKey="cam_leakage_estimator_estimate_sent"
                    teaserText="Send yourself the worksheet."
                    buttonLabel="Send me the worksheet"
                    submitLabel="Send me the worksheet"
                    onUnlock={() => setEstimateSent(true)}
                  />
                )}
              </div>
            )}

            {/* CTA */}
            <Button asChild className="w-full sm:w-auto">
              <Link to="/auth/register">
                Start actual GL check
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Cross-links */}
      <div className="mt-10 rounded-lg border bg-muted/30 p-5">
        <p className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Related resources
        </p>
        <ul className="space-y-2">
          <li className="flex items-center gap-2 text-sm">
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <Link
              to="/resources/tenant-auditor-guide"
              className="text-primary underline-offset-4 hover:underline"
            >
              What Tenant Auditors Look For
            </Link>
          </li>
          <li className="flex items-center gap-2 text-sm">
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <Link
              to="/tools/cam-gross-up-calculator"
              className="text-primary underline-offset-4 hover:underline"
            >
              CAM Gross-Up Calculator
            </Link>
          </li>
        </ul>
      </div>
    </ToolPageLayout>
  )
}
