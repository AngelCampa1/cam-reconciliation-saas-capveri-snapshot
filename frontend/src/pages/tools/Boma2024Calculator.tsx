/**
 * BOMA 2024 Rentable Area Calculator — free interactive tool at /tools/boma-2024-calculator
 *
 * Free tier: shows hidden SF and % increase.
 * Gated tier: shows annual revenue lift and asset value lift (email unlock).
 */

import { useState, useEffect, useId, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToolPageLayout } from '@/components/content/ToolPageLayout'
import { CalculatorUnlockGate } from '@/components/lead-capture/CalculatorUnlockGate'
import { trackEvent } from '@/lib/analytics'
import { formatMoneyWhole } from '@/lib/money'
import { resolveApiUrl } from '@/api/url'
import { buildSiteUrl } from '@/lib/domains'

const STRUCTURED_DATA = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    applicationCategory: 'FinanceApplication',
    name: 'BOMA 2024 Rentable Area Calculator',
    description:
      'Calculate hidden billable square footage your building gains under BOMA 2024. Enter existing measurements and outdoor SF. See SF impact before email.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    url: buildSiteUrl('/tools/boma-2024-calculator'),
    browserRequirements: 'Requires JavaScript',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to Calculate BOMA 2024 Hidden Rentable SF',
    description:
      'Use the free BOMA 2024 Rentable Area Calculator to see how much additional billable square footage your building gains under the 2024 standard.',
    totalTime: 'PT2M',
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Enter existing measurements',
        text: 'Input your current usable SF and rentable SF. The calculator derives the existing load factor automatically.',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Add outdoor SF',
        text: 'Enter balcony, terrace, and outdoor amenity SF that BOMA 2024 now includes in the rentable area calculation.',
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'See hidden rentable SF before email',
        text: 'Get the added rentable SF and percentage increase for free. Send your email to see dollar details.',
      },
    ],
  },
]

interface BomaInputs {
  usableSf: string
  rentableSf: string
  balconySf: string
  terraceSf: string
  outdoorAmenitySf: string
  annualRentPerSf: string
}

interface BomaResult {
  load_factor: string
  new_usable_sf: string
  new_rentable_sf: string
  hidden_sf: string
  pct_increase: string
  revenue_lift: string
  asset_value_lift: string
}

function formatNumber(value: string): string {
  const num = parseFloat(value)
  if (isNaN(num)) return '—'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    num
  )
}

export function Boma2024CalculatorPage() {
  const usableSfId = useId()
  const rentableSfId = useId()
  const balconySfId = useId()
  const terraceSfId = useId()
  const outdoorId = useId()
  const rentId = useId()
  const capRateId = useId()
  const assetLiftId = useId()

  const [inputs, setInputs] = useState<BomaInputs>({
    usableSf: '',
    rentableSf: '',
    balconySf: '',
    terraceSf: '',
    outdoorAmenitySf: '',
    annualRentPerSf: '',
  })

  const [result, setResult] = useState<BomaResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [capRate, setCapRate] = useState(6.5)

  // Keep the latest cap rate available to the (stable) fetch callback without
  // re-creating it — the cap rate only affects locally-derived asset value, so
  // changing it should not trigger a new API call.
  const capRateRef = useRef(capRate)
  capRateRef.current = capRate

  const isReady =
    inputs.usableSf !== '' &&
    inputs.rentableSf !== '' &&
    inputs.annualRentPerSf !== '' &&
    parseFloat(inputs.usableSf) > 0 &&
    parseFloat(inputs.rentableSf) > 0 &&
    parseFloat(inputs.rentableSf) >= parseFloat(inputs.usableSf) &&
    parseFloat(inputs.annualRentPerSf) > 0

  const rentableTooSmall =
    inputs.usableSf !== '' &&
    inputs.rentableSf !== '' &&
    parseFloat(inputs.usableSf) > 0 &&
    parseFloat(inputs.rentableSf) > 0 &&
    parseFloat(inputs.rentableSf) < parseFloat(inputs.usableSf)

  const fetchCalculation = useCallback(
    async (currentInputs: BomaInputs, signal: AbortSignal) => {
      setIsLoading(true)
      setApiError(null)
      try {
        const payload = {
          usable_sf: currentInputs.usableSf,
          rentable_sf: currentInputs.rentableSf,
          balcony_sf: currentInputs.balconySf || '0',
          terrace_sf: currentInputs.terraceSf || '0',
          outdoor_amenity_sf: currentInputs.outdoorAmenitySf || '0',
          annual_rent_per_sf: currentInputs.annualRentPerSf,
          cap_rate: String(capRateRef.current / 100),
        }
        const res = await fetch(
          resolveApiUrl('/api/v1/tools/boma-2024-calculator'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal,
          }
        )
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setApiError(
            body.detail || 'Calculation failed. Please check your inputs.'
          )
          setResult(null)
          return
        }
        const data: BomaResult = await res.json()
        setResult(data)
        trackEvent('tool_interaction', {
          slug: 'boma-2024-calculator',
          result_summary: `hidden_sf: ${data.hidden_sf}, pct: ${data.pct_increase}%`,
        })
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setApiError('Network error. Please try again.')
          setResult(null)
        }
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (!isReady) {
      setResult(null)
      setApiError(null)
      return
    }
    const controller = new AbortController()
    const timerId = setTimeout(
      () => fetchCalculation(inputs, controller.signal),
      350
    )
    return () => {
      clearTimeout(timerId)
      controller.abort()
    }
  }, [inputs, isReady, fetchCalculation])

  useEffect(() => {
    trackEvent('tool_page_view', { slug: 'boma-2024-calculator' })
  }, [])

  // Re-derive asset value lift locally when cap rate changes (no extra API call)
  const displayedAssetValueLift =
    result && isUnlocked
      ? Math.round(parseFloat(result.revenue_lift) / (capRate / 100))
      : null

  function handleInputChange(field: keyof BomaInputs, value: string) {
    setInputs((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <ToolPageLayout
      title="BOMA 2024 Rentable Area Calculator — Find Hidden Billable SF | CapVeri"
      description="See how much hidden billable square footage BOMA 2024 unlocks for your building. Enter existing measurements and outdoor tenant spaces. Get SF impact before email."
      canonical="/tools/boma-2024-calculator"
      toolName="BOMA 2024 Rentable Area Calculator"
      structuredData={STRUCTURED_DATA}
    >
      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          BOMA 2024 Rentable Area Calculator
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          See how many additional billable square feet your building gains by
          adopting the BOMA 2024 measurement standard.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Input card */}
        <Card>
          <CardHeader>
            <CardTitle as="h2">Your Building Measurements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor={usableSfId}>Existing Usable SF</Label>
              <Input
                id={usableSfId}
                type="number"
                min={1}
                className="h-11"
                placeholder="e.g. 100,000"
                value={inputs.usableSf}
                aria-label="Existing usable SF"
                onChange={(e) => handleInputChange('usableSf', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={rentableSfId}>Existing Rentable SF</Label>
              <Input
                id={rentableSfId}
                type="number"
                min={1}
                className="h-11"
                placeholder="e.g. 125,000"
                value={inputs.rentableSf}
                aria-label="Existing rentable SF"
                onChange={(e) =>
                  handleInputChange('rentableSf', e.target.value)
                }
              />
              <p className="text-xs text-muted-foreground">
                Load factor is derived automatically from these two values.
              </p>
              {rentableTooSmall && (
                <p role="alert" className="text-sm text-destructive-strong">
                  Rentable area must be the same size or larger than usable
                  area.
                </p>
              )}
            </div>

            <div className="border-t pt-4 space-y-4">
              <p className="text-sm font-medium">
                Outdoor SF now included under BOMA 2024
              </p>

              <div className="space-y-2">
                <Label htmlFor={balconySfId}>Balcony SF</Label>
                <Input
                  id={balconySfId}
                  type="number"
                  min={0}
                  className="h-11"
                  placeholder="0"
                  value={inputs.balconySf}
                  aria-label="Balcony SF"
                  onChange={(e) =>
                    handleInputChange('balconySf', e.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={terraceSfId}>Terrace SF</Label>
                <Input
                  id={terraceSfId}
                  type="number"
                  min={0}
                  className="h-11"
                  placeholder="0"
                  value={inputs.terraceSf}
                  aria-label="Terrace SF"
                  onChange={(e) =>
                    handleInputChange('terraceSf', e.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={outdoorId}>Outdoor Amenity SF</Label>
                <Input
                  id={outdoorId}
                  type="number"
                  min={0}
                  className="h-11"
                  placeholder="0"
                  value={inputs.outdoorAmenitySf}
                  aria-label="Outdoor amenity SF"
                  onChange={(e) =>
                    handleInputChange('outdoorAmenitySf', e.target.value)
                  }
                />
              </div>
            </div>

            <div className="border-t pt-4 space-y-2">
              <Label htmlFor={rentId}>Annual Rent per SF ($/year)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  $
                </span>
                <Input
                  id={rentId}
                  type="number"
                  min={0.01}
                  step={0.01}
                  className="h-11 pl-7"
                  placeholder="e.g. 35"
                  value={inputs.annualRentPerSf}
                  aria-label="Annual rent per SF"
                  onChange={(e) =>
                    handleInputChange('annualRentPerSf', e.target.value)
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results card */}
        <div className="space-y-4">
          {/* Free results */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle as="h2">Your Results</CardTitle>
            </CardHeader>
            <CardContent aria-live="polite" className="space-y-5">
              {apiError && (
                <p role="alert" className="text-sm text-destructive-strong">
                  {apiError}
                </p>
              )}

              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Hidden Rentable SF Found
                </p>
                {isLoading ? (
                  <p className="mt-1 text-3xl font-bold text-muted-foreground/40">
                    …
                  </p>
                ) : result ? (
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {formatNumber(result.hidden_sf)} SF
                  </p>
                ) : (
                  <p
                    className="mt-1 text-3xl font-bold text-muted-foreground/40"
                    data-testid="hidden-sf-placeholder"
                  >
                    —
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  % Increase in Rentable Area
                </p>
                {isLoading ? (
                  <p className="mt-1 text-3xl font-bold text-muted-foreground/40">
                    …
                  </p>
                ) : result ? (
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {parseFloat(result.pct_increase).toFixed(2)}%
                  </p>
                ) : (
                  <p
                    className="mt-1 text-3xl font-bold text-muted-foreground/40"
                    data-testid="pct-placeholder"
                  >
                    —
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  New Load Factor
                </p>
                {result ? (
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {parseFloat(result.load_factor).toFixed(4)}x
                  </p>
                ) : (
                  <p className="mt-1 text-lg font-semibold text-muted-foreground/40">
                    —
                  </p>
                )}
              </div>

              {!isReady && !apiError && (
                <p className="text-sm text-muted-foreground">
                  Enter usable SF, rentable SF, and annual rent per SF above to
                  see your results.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Gated dollar details */}
          <Card className="relative overflow-hidden">
            <CardHeader>
              <CardTitle as="h2">Dollar Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Blurred overlay when locked */}
              {!isUnlocked && (
                <div className="absolute inset-0 z-10 backdrop-blur-sm bg-background/60 flex flex-col items-center justify-center p-6">
                  <CalculatorUnlockGate
                    slug="boma-2024-calculator"
                    onUnlock={() => setIsUnlocked(true)}
                    source="boma-2024-calculator"
                  />
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Annual Revenue Lift
                </p>
                {result && isUnlocked ? (
                  <p className="mt-1 text-3xl font-bold tabular-nums font-mono">
                    {/* revenue_lift is the backend's exact decimal string;
                        formatMoneyWhole parses it directly (no parseFloat
                        round-trip) so the headline figure keeps every digit.
                        Whole-dollar to match the tool's presentation (F-430). */}
                    {formatMoneyWhole(result.revenue_lift)}
                  </p>
                ) : (
                  <p className="mt-1 text-3xl font-bold text-muted-foreground/40">
                    —
                  </p>
                )}
              </div>

              <div id={assetLiftId}>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Asset Value Lift at {capRate.toFixed(1)}% Cap Rate
                </p>
                {displayedAssetValueLift !== null ? (
                  <p className="mt-1 text-3xl font-bold tabular-nums font-mono">
                    {formatMoneyWhole(displayedAssetValueLift)}
                  </p>
                ) : (
                  <p className="mt-1 text-3xl font-bold text-muted-foreground/40">
                    —
                  </p>
                )}
              </div>

              {/* Cap rate slider — only usable after unlock */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={capRateId}>Cap Rate</Label>
                  <span className="text-sm font-semibold tabular-nums">
                    {capRate.toFixed(1)}%
                  </span>
                </div>
                <input
                  id={capRateId}
                  type="range"
                  min={3}
                  max={10}
                  step={0.5}
                  value={capRate}
                  aria-label="Cap rate slider"
                  aria-controls={assetLiftId}
                  disabled={!isUnlocked}
                  className="w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                  onChange={(e) => setCapRate(parseFloat(e.target.value))}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>3%</span>
                  <span>10%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
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
              to="/resources/boma-2024-changes"
              className="text-primary underline-offset-4 hover:underline"
            >
              BOMA 2024 vs 2017: What Changed and What It Costs You
            </Link>
          </li>
          <li className="flex items-center gap-2 text-sm">
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <Link
              to="/tools/cam-leakage-estimator"
              className="text-primary underline-offset-4 hover:underline"
            >
              CAM Billing Risk Estimator
            </Link>
          </li>
        </ul>
      </div>
    </ToolPageLayout>
  )
}
