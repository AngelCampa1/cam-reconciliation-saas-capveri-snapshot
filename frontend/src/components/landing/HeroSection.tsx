/**
 * Hero Section Component
 *
 * The main hero section for the landing page with headline,
 * subheadline, and call-to-action buttons.
 * Premium redesign with animated gradient mesh background and mock dashboard.
 */
import { ArrowRight, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { TRIAL_COPY } from '@/lib/domains'
import { cn } from '@/lib/utils'

export interface HeroSectionProps {
  /** Additional CSS classes */
  className?: string
}

export function HeroSection({ className }: HeroSectionProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-900 min-h-[90vh] flex items-center',
        className
      )}
    >
      {/* Animated gradient mesh background, 3 orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-1/4 -left-1/4 h-[60%] w-[60%] rounded-full bg-primary/20 blur-3xl"
          style={{ animation: 'gradient-shift 10s ease-in-out infinite' }}
        />
        <div
          className="absolute -bottom-1/4 -right-1/4 h-[50%] w-[50%] rounded-full bg-primary/10 blur-3xl"
          style={{ animation: 'gradient-shift 14s ease-in-out infinite 2s' }}
        />
        <div
          className="absolute top-1/2 left-1/2 h-[40%] w-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-400/10 blur-3xl"
          style={{ animation: 'gradient-shift 12s ease-in-out infinite 4s' }}
        />
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:60px_60px]" />
      <div className="absolute inset-0 bg-gradient-to-t from-primary-900/50 to-transparent" />

      <div className="container relative mx-auto px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl text-center">
          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm text-primary-foreground/90 backdrop-blur-sm">
            <span
              className="inline-block h-2 w-2 rounded-full bg-success"
              style={{ animation: 'pulse-dot 2s ease-in-out infinite' }}
              aria-hidden="true"
            />
            <span>BOMA 2024 Aligned</span>
          </div>

          {/* Headline */}
          <h1 className="mb-6 text-fluid-4xl font-bold tracking-tight text-primary-foreground lg:text-6xl">
            Reconcile CAM correctly{' '}
            <span className="bg-gradient-to-r from-primary/30 to-primary-200 bg-clip-text text-transparent">
              before statements go out
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mb-10 max-w-2xl text-fluid-lg text-primary-foreground/80">
            CapVeri runs your full CAM reconciliation. It works from the files
            you export from Yardi or MRI. The math is rule-based and easy to
            trace. Many runs finish in minutes.
          </p>

          {/* CTAs */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <Button
                asChild
                size="lg"
                className="min-w-[220px] text-base shadow-lg hover:shadow-xl hover:shadow-primary/25 transition-shadow"
              >
                <Link to="/auth/register">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="min-w-[200px] text-base text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10"
              >
                <a href="#how-it-works">
                  See how it works
                  <ArrowRight className="ml-2 h-4 w-4 opacity-60" />
                </a>
              </Button>
            </div>
            {/* Trust micro-copy */}
            <p className="text-sm text-primary-foreground/60">
              ✓ {TRIAL_COPY}&nbsp;&nbsp;·&nbsp;&nbsp;✓ Results in
              minutes&nbsp;&nbsp;·&nbsp;&nbsp;✓ No Yardi integration required
            </p>
          </div>

          {/* Mock dashboard card */}
          <div className="mt-16 mx-auto max-w-2xl">
            <div
              className="rounded-2xl bg-background border border-border shadow-2xl ring-1 ring-white/10 rotate-1 -translate-y-2 overflow-hidden"
              role="img"
              aria-label="CapVeri dashboard preview"
            >
              {/* Mock header bar */}
              <div className="flex items-center gap-2 px-4 py-3 bg-muted border-b border-border">
                <div
                  className="h-3 w-3 rounded-full bg-destructive/70"
                  aria-hidden="true"
                />
                <div
                  className="h-3 w-3 rounded-full bg-warning/70"
                  aria-hidden="true"
                />
                <div
                  className="h-3 w-3 rounded-full bg-success/70"
                  aria-hidden="true"
                />
                <span className="ml-2 text-xs text-muted-foreground">
                  CapVeri Reconciliation Results
                </span>
              </div>
              {/* Mock metric cards */}
              <div className="p-4 grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted p-3 text-center">
                  <div className="text-lg font-bold text-success font-mono tabular-nums">
                    $31,200
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Bill risk
                  </div>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <div className="text-lg font-bold text-warning">7</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Errors caught
                  </div>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <div className="text-lg font-bold text-primary">Trace</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Rule-based math
                  </div>
                </div>
              </div>
              {/* Mock bar chart */}
              <div
                className="px-4 pb-4 flex items-end gap-1 h-12"
                aria-hidden="true"
              >
                {[40, 65, 45, 80, 55, 90, 60, 75, 50, 85, 70, 95].map(
                  (h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm bg-primary/40"
                      style={{ height: `${h}%` }}
                    />
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <ChevronDown
          className="h-6 w-6 text-primary-foreground/40"
          aria-hidden="true"
        />
      </div>
    </section>
  )
}
