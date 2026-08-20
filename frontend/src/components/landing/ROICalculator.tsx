/**
 * ROI Calculator Component
 */
import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, TrendingUp, DollarSign, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatMoneyWhole } from '@/lib/money'
import {
  estimateAnnualRecovery,
  getAnnualTotal,
  getBandForCount,
  TRIAL_DAYS,
} from '@/config/plans'

export interface ROIResult {
  annualCost: number
  estimatedRecovery: number
  netGain: number
}

// eslint-disable-next-line react-refresh/only-export-components
export function calculateROI(unitCount: number): ROIResult {
  const tierId = getBandForCount(unitCount)
  const annualCost = getAnnualTotal(tierId, unitCount) ?? 0
  const estimatedRecovery = estimateAnnualRecovery(unitCount).average
  const netGain = estimatedRecovery - annualCost

  return { annualCost, estimatedRecovery, netGain }
}

interface AnimatedNumberProps {
  value: number
  format: (n: number) => string
}

function AnimatedNumber({ value, format }: AnimatedNumberProps) {
  const [displayed, setDisplayed] = useState(value)
  const prevValueRef = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const start = prevValueRef.current
    const end = value
    if (start === end) return

    const duration = 600
    const startTime = performance.now()

    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(start + (end - start) * eased)
      setDisplayed(current)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        prevValueRef.current = end
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [value])

  return <span data-testid="animated-number">{format(displayed)}</span>
}

export interface ROICalculatorProps {
  className?: string
  initialUnitCount?: number
}

export function ROICalculator({
  className,
  initialUnitCount = 50,
}: ROICalculatorProps) {
  const [unitCount, setUnitCount] = useState(initialUnitCount)
  const { annualCost, estimatedRecovery, netGain } = calculateROI(unitCount)

  return (
    <section
      id="roi-calculator"
      className={cn('bg-background py-20', className)}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2">
            <Calculator className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-primary">
              Value Check
            </span>
          </div>
          <h2 className="mb-4 text-fluid-3xl font-bold tracking-tight text-foreground">
            Check Your Bill Risk
          </h2>
          <p className="text-fluid-lg text-muted-foreground">
            Model bill errors before statements go out.
          </p>
        </div>

        <Card className="mx-auto max-w-4xl border-2 border-primary/20 bg-card shadow-xl">
          <CardContent className="p-8 md:p-12">
            <div className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <label
                  htmlFor="unit-slider"
                  className="text-fluid-base font-medium text-foreground"
                >
                  Active Rentable Units
                </label>
                <span className="rounded-lg bg-primary/10 px-4 py-2 text-fluid-xl font-bold text-primary">
                  {unitCount}
                </span>
              </div>
              <Slider
                id="unit-slider"
                value={[unitCount]}
                onValueChange={(value) => setUnitCount(value[0] ?? 1)}
                min={1}
                max={500}
                step={1}
                className="py-4"
                aria-valuenow={unitCount}
              />
              <div className="mt-2 flex justify-between text-sm text-muted-foreground">
                <span>1 unit</span>
                <span>500 units</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-muted/50 p-6 text-center">
                <div className="mb-2 flex items-center justify-center gap-2">
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Annual Cost
                  </span>
                </div>
                <p className="text-fluid-2xl font-bold text-foreground font-mono tabular-nums">
                  <AnimatedNumber
                    value={annualCost}
                    format={formatMoneyWhole}
                  />
                </p>
              </div>

              <div className="rounded-xl bg-muted/50 p-6 text-center">
                <div className="mb-2 flex items-center justify-center gap-2">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Modeled Bill Risk
                  </span>
                </div>
                <p className="text-fluid-2xl font-bold text-primary font-mono tabular-nums">
                  <AnimatedNumber
                    value={estimatedRecovery}
                    format={formatMoneyWhole}
                  />
                </p>
              </div>

              <div className="rounded-xl bg-primary/10 p-6 text-center">
                <div className="mb-2 flex items-center justify-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium text-primary">
                    Cost Gap
                  </span>
                </div>
                <p className="text-fluid-2xl font-bold text-primary font-mono tabular-nums">
                  <AnimatedNumber value={netGain} format={formatMoneyWhole} />
                </p>
              </div>

              <div className="rounded-xl bg-primary p-6 text-center">
                <div className="mb-2 flex items-center justify-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary-foreground" />
                  <span className="text-sm font-medium text-primary-foreground">
                    Review Mode
                  </span>
                </div>
                <p className="text-fluid-2xl font-bold text-primary-foreground">
                  Pre-send
                </p>
              </div>
            </div>

            <div className="mt-10 text-center">
              <p className="mb-4 text-muted-foreground">
                This is modeled bill risk, not a promised result.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button asChild size="lg" className="min-w-[200px] gap-2">
                  <Link to="/auth/register">
                    Start Free Trial
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>

                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="min-w-[180px] gap-2"
                >
                  <Link to="/sample-report">
                    See a Sample Report
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                {TRIAL_DAYS}-day free trial on Reconcile
              </p>

              <p className="mx-auto mt-6 max-w-xl text-xs text-muted-foreground">
                This is an estimate, not an audit. We use market figures, not
                your actual GL. Check your own records before you act.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
