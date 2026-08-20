/**
 * HCAD Tax Base Year Normalizer — free interactive calculator at /tools/hcad-tax-normalizer
 *
 * Texas landlords who win ARB protests often need to recalculate the tax base
 * year used in lease billing. This tool quantifies the tax adjustment.
 */

import { useState, useId } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToolPageLayout } from '@/components/content/ToolPageLayout'
import { resolveApiUrl } from '@/api/url'
import { trackEvent } from '@/lib/analytics'
import { buildSiteUrl } from '@/lib/domains'
import { formatMoneyWhole } from '@/lib/money'

interface HcadApiResponse {
  adjusted_base_year: string
  original_passthrough: string
  corrected_passthrough: string
  recovery_delta: string
  capped_corrected_passthrough: string | null
  capped_recovery: string | null
  cap_was_applied: boolean | null
}

const STRUCTURED_DATA = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    applicationCategory: 'FinanceApplication',
    name: 'HCAD Tax Base Year Normalizer',
    description:
      'Texas landlords: model the CAM tax adjustment. Use it after an HCAD ARB protest lowers the tenant base year expense stop.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    url: buildSiteUrl('/tools/hcad-tax-normalizer'),
    browserRequirements: 'Requires JavaScript',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to Calculate an HCAD ARB Tax Adjustment',
    description:
      'Use the free HCAD Tax Base Year Normalizer. Model the lease billing effect after a successful ARB protest.',
    totalTime: 'PT2M',
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Enter your original base year assessment',
        text: 'Input the original base year property tax assessment used in the tenant lease.',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Enter the ARB retroactive reduction',
        text: 'Enter the dollar amount by which the ARB protest reduced the base year assessment.',
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Enter current year tax and tenant pro-rata',
        text: "Provide the current year tax bill and the tenant's pro-rata share percentage.",
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: 'Review the tax adjustment',
        text: 'See the tax adjustment and what a lease cap does to that number.',
      },
    ],
  },
]

export function HcadTaxNormalizerPage() {
  const baseYearId = useId()
  const retroAdjId = useId()
  const currentTaxId = useId()
  const proRataId = useId()
  const capRateId = useId()

  const [originalBaseYear, setOriginalBaseYear] = useState<number | ''>('')
  const [retroAdj, setRetroAdj] = useState<number | ''>('')
  const [currentYearTax, setCurrentYearTax] = useState<number | ''>('')
  const [proRata, setProRata] = useState<number | ''>('')
  const [capRate, setCapRate] = useState<number | ''>('')

  const [result, setResult] = useState<HcadApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isReady =
    typeof originalBaseYear === 'number' &&
    originalBaseYear > 0 &&
    typeof retroAdj === 'number' &&
    retroAdj >= 0 &&
    retroAdj <= originalBaseYear &&
    typeof currentYearTax === 'number' &&
    currentYearTax > 0 &&
    typeof proRata === 'number' &&
    proRata > 0 &&
    proRata <= 100

  const handleCalculate = async () => {
    if (!isReady) return
    setIsLoading(true)
    setError(null)

    try {
      const payload = {
        original_base_year_assessment: String(originalBaseYear),
        retroactive_adjustment: String(retroAdj),
        current_year_tax: String(currentYearTax),
        pro_rata_pct: String((proRata as number) / 100),
        ...(typeof capRate === 'number' && capRate > 0
          ? { cap_rate: String(capRate / 100) }
          : {}),
      }

      const response = await fetch(
        resolveApiUrl('/api/v1/tools/hcad-tax-normalizer/calculate'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      if (!response.ok) {
        throw new Error(`Calculation failed (${response.status})`)
      }

      const data: HcadApiResponse = await response.json()
      setResult(data)

      trackEvent('tool_interaction', {
        slug: 'hcad-tax-normalizer',
        result_summary: `tax_adjustment: ${formatMoneyWhole(data.recovery_delta)}`,
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Calculation failed. Please try again.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <ToolPageLayout
      title="HCAD Tax Base Year Normalizer - Free ARB Tax Adjustment Calculator | CapVeri"
      description="Texas landlords: won an HCAD ARB protest? See the tax adjustment and lease-cap effect before you bill. Free tool."
      canonical="/tools/hcad-tax-normalizer"
      toolName="HCAD Tax Base Year Normalizer"
      structuredData={STRUCTURED_DATA}
    >
      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          HCAD Tax Base Year Normalizer
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Won an HCAD ARB protest? Model the retroactive CAM tax adjustment and
          lease-cap effect.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Input card */}
        <Card>
          <CardHeader>
            <CardTitle as="h2">Property &amp; Lease Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Original base year assessment */}
            <div className="space-y-2">
              <Label htmlFor={baseYearId}>
                Original Base Year Assessment ($)
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  $
                </span>
                <Input
                  id={baseYearId}
                  type="number"
                  min={0}
                  step={1}
                  className="h-11 pl-7"
                  placeholder="e.g. 1,200,000"
                  value={originalBaseYear === '' ? '' : originalBaseYear}
                  aria-label="Original base year assessment"
                  onChange={(e) => {
                    const raw = e.target.value
                    setOriginalBaseYear(raw === '' ? '' : Number(raw))
                  }}
                />
              </div>
            </div>

            {/* ARB retroactive reduction */}
            <div className="space-y-2">
              <Label htmlFor={retroAdjId}>ARB Retroactive Reduction ($)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  $
                </span>
                <Input
                  id={retroAdjId}
                  type="number"
                  min={0}
                  step={1}
                  className="h-11 pl-7"
                  placeholder="e.g. 150,000"
                  value={retroAdj === '' ? '' : retroAdj}
                  aria-label="ARB retroactive reduction"
                  onChange={(e) => {
                    const raw = e.target.value
                    setRetroAdj(raw === '' ? '' : Number(raw))
                  }}
                />
              </div>
            </div>

            {/* Current year tax */}
            <div className="space-y-2">
              <Label htmlFor={currentTaxId}>
                Current Year Property Tax ($)
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  $
                </span>
                <Input
                  id={currentTaxId}
                  type="number"
                  min={0}
                  step={1}
                  className="h-11 pl-7"
                  placeholder="e.g. 1,350,000"
                  value={currentYearTax === '' ? '' : currentYearTax}
                  aria-label="Current year property tax"
                  onChange={(e) => {
                    const raw = e.target.value
                    setCurrentYearTax(raw === '' ? '' : Number(raw))
                  }}
                />
              </div>
            </div>

            {/* Tenant pro-rata share */}
            <div className="space-y-2">
              <Label htmlFor={proRataId}>Tenant Pro-Rata Share (%)</Label>
              <div className="relative">
                <Input
                  id={proRataId}
                  type="number"
                  min={0.01}
                  max={100}
                  step={0.01}
                  className="h-11 pr-7"
                  placeholder="e.g. 5.25"
                  value={proRata === '' ? '' : proRata}
                  aria-label="Tenant pro-rata share"
                  onChange={(e) => {
                    const raw = e.target.value
                    setProRata(raw === '' ? '' : Number(raw))
                  }}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
                  %
                </span>
              </div>
            </div>

            {/* Optional cap rate */}
            <div className="space-y-2">
              <Label htmlFor={capRateId}>
                Expense Cap Rate (%) —{' '}
                <span className="font-normal text-muted-foreground">
                  optional
                </span>
              </Label>
              <div className="relative">
                <Input
                  id={capRateId}
                  type="number"
                  min={0.01}
                  max={99}
                  step={0.01}
                  className="h-11 pr-7"
                  placeholder="e.g. 5"
                  value={capRate === '' ? '' : capRate}
                  aria-label="Expense cap rate"
                  onChange={(e) => {
                    const raw = e.target.value
                    setCapRate(raw === '' ? '' : Number(raw))
                  }}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
                  %
                </span>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={!isReady || isLoading}
              onClick={handleCalculate}
            >
              {isLoading ? 'Calculating…' : 'Calculate Tax Adjustment'}
            </Button>
          </CardContent>
        </Card>

        {/* Results card */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle as="h2">Tax Adjustment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Error state */}
            {error && (
              <div
                role="alert"
                className="rounded-md bg-destructive/10 p-3 text-sm text-destructive-strong"
              >
                {error}
              </div>
            )}

            {/* Adjusted base year */}
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Adjusted base year assessment
              </p>
              {result ? (
                <p className="mt-1 text-2xl font-semibold tabular-nums font-mono">
                  {formatMoneyWhole(result.adjusted_base_year)}
                </p>
              ) : (
                <p className="mt-1 text-2xl font-bold text-muted-foreground/40">
                  —
                </p>
              )}
            </div>

            {/* Original passthrough */}
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                What was billed (original base)
              </p>
              {result ? (
                <p className="mt-1 text-2xl font-semibold tabular-nums font-mono">
                  {formatMoneyWhole(result.original_passthrough)}
                </p>
              ) : (
                <p className="mt-1 text-2xl font-bold text-muted-foreground/40">
                  —
                </p>
              )}
            </div>

            {/* Corrected passthrough */}
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                What should have been billed (adjusted base)
              </p>
              {result ? (
                <p className="mt-1 text-2xl font-semibold tabular-nums font-mono">
                  {formatMoneyWhole(result.corrected_passthrough)}
                </p>
              ) : (
                <p className="mt-1 text-2xl font-bold text-muted-foreground/40">
                  —
                </p>
              )}
            </div>

            {/* Recovery delta — prominent */}
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Recovery opportunity
              </p>
              {result ? (
                <p className="mt-1 text-3xl font-bold tabular-nums font-mono text-primary">
                  {formatMoneyWhole(result.recovery_delta)}
                </p>
              ) : (
                <p className="mt-1 text-3xl font-bold text-muted-foreground/40">
                  — – —
                </p>
              )}
            </div>

            {/* Capped adjustment — only when cap was calculated */}
            {result && result.cap_was_applied !== null && (
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Capped adjustment
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums font-mono">
                  {formatMoneyWhole(result.capped_recovery ?? '0')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.cap_was_applied
                    ? 'Lease cap reduced recoverable amount'
                    : 'Recovery is within lease cap limit'}
                </p>
              </div>
            )}

            {!result && !error && (
              <p className="text-sm text-muted-foreground">
                Enter your property details above to calculate the tax
                adjustment.
              </p>
            )}

            <p className="text-xs text-muted-foreground border-t pt-4">
              This is an estimate. It uses your lease's base year expense stop
              and the HCAD ARB retroactive reduction. Run your reconciliation in
              CapVeri for the exact figures.
            </p>

            {/* CTA */}
            <Button asChild className="w-full sm:w-auto">
              <Link to="/auth/register">
                See what CapVeri finds in your actual GL
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
              to="/tools/cam-leakage-estimator"
              className="text-primary underline-offset-4 hover:underline"
            >
              CAM Billing Risk Estimator
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
