/**
 * CTA Section Component
 *
 * Final call-to-action section with dark background and trial CTA.
 * Messaging aligned with business docs: product-led reconciliation positioning.
 */
import { ArrowRight, Shield, Clock, CheckCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { TRIAL_COPY } from '@/lib/domains'
import { cn } from '@/lib/utils'

const trustIndicators = [
  { icon: Shield, text: 'No card to start' },
  { icon: Clock, text: 'Many runs finish in minutes' },
  { icon: CheckCircle, text: TRIAL_COPY },
]

export interface CTASectionProps {
  /** Additional CSS classes */
  className?: string
}

export function CTASection({ className }: CTASectionProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden bg-gradient-to-br from-primary to-primary/80 py-20',
        className
      )}
    >
      {/* Background pattern */}
      <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:40px_40px]" />

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          {/* Headline */}
          <h2 className="mb-6 text-4xl font-bold tracking-tight text-primary-foreground">
            Reconcile CAM Before You Bill Tenants
          </h2>
          <p className="mb-10 text-lg text-primary-foreground/80">
            Run your CAM check before statements go out. Share math your tenants
            can review. Upload your GL exports to catch gross-up and cap issues.
          </p>

          {/* CTA */}
          <div className="flex flex-col items-center gap-3">
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="min-w-[260px] text-base"
            >
              <Link to="/auth/register">
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          {/* Trust indicators */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-8">
            {trustIndicators.map((indicator, index) => (
              <div
                key={index}
                className="flex items-center gap-2 text-sm text-primary-foreground/70"
              >
                <indicator.icon className="h-5 w-5" />
                <span>{indicator.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
