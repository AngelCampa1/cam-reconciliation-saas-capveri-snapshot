/**
 * Value Proposition Section Component
 *
 * Displays the three core value propositions with icons and descriptions.
 * Messaging aligned with business docs: "Fix Yardi, Don't Replace It" positioning.
 */
import { Plug, Calculator, DollarSign } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const valueProps = [
  {
    icon: Plug,
    title: "Fix Yardi, Don't Replace It",
    subtitle: 'Zero Integration Cost',
    description:
      'Works from standard CSV exports. No API connection. No setup call for the first check.',
    metric: '$0',
    metricLabel: 'API integration cost',
  },
  {
    icon: Calculator,
    title: 'Deterministic Accuracy',
    subtitle: 'BOMA 2024 Aligned',
    description:
      'Rule-based calculation logic, not black-box guesswork. Each result includes a trace your team can review.',
    metric: 'Trace',
    metricLabel: 'reviewable math trail',
  },
  {
    icon: DollarSign,
    title: 'Reconcile Down to the Dollar',
    subtitle: '$5.9K-$35.3K modeled',
    description:
      'Check every charge against the lease. Gross-up and cap errors show up before a tenant sees them. One missed error can repeat every year.',
    metric: '$5.9K-$35.3K',
    metricLabel: 'modeled bill-risk range',
  },
]

export interface ValuePropositionSectionProps {
  /** Additional CSS classes */
  className?: string
}

export function ValuePropositionSection({
  className,
}: ValuePropositionSectionProps) {
  return (
    <section className={cn('bg-background py-20', className)}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-fluid-3xl font-bold tracking-tight text-foreground">
            Why Property Managers Choose CapVeri
          </h2>
          <p className="text-fluid-lg text-muted-foreground">
            Stop the spreadsheet madness. Get accurate CAM reconciliation
            without replacing your entire tech stack.
          </p>
        </div>

        {/* Value prop cards */}
        <div className="grid gap-4 md:gap-6 lg:gap-8 md:grid-cols-3">
          {valueProps.map((prop, index) => (
            <Card
              key={index}
              className="group border-0 bg-card shadow-lg hover:-translate-y-1 hover:shadow-xl hover:border-primary/30 transition-all duration-200"
            >
              <CardContent className="p-8">
                {/* Icon */}
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors duration-200">
                  <prop.icon className="h-7 w-7 text-primary" />
                </div>

                {/* Metric */}
                <div className="mb-1 text-3xl font-bold text-primary font-mono tabular-nums">
                  {prop.metric}
                </div>
                <div className="mb-4 text-sm text-muted-foreground">
                  {prop.metricLabel}
                </div>

                {/* Content */}
                <div className="mb-2 text-fluid-sm font-semibold uppercase tracking-wide text-primary">
                  {prop.subtitle}
                </div>
                <h3 className="mb-3 text-fluid-xl font-bold text-foreground">
                  {prop.title}
                </h3>
                <p className="leading-relaxed text-fluid-base text-muted-foreground">
                  {prop.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
