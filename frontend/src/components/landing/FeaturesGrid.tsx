/**
 * Features Grid Component
 *
 * Displays a bento grid of product features with icons and descriptions.
 * Spotlight cards span 2 columns; wide cards span 2 columns; standard = 1 col.
 */
import {
  Calculator,
  Shield,
  TrendingUp,
  Layers,
  BarChart3,
  Download,
  FileCheck,
  Building2,
} from 'lucide-react'
import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Feature variants for bento layout
type FeatureVariant = 'spotlight' | 'standard' | 'wide'

const features: Array<{
  icon: LucideIcon
  title: string
  description: string
  variant: FeatureVariant
  metric?: string
}> = [
  {
    icon: Calculator,
    title: 'Gross-Up Calculator',
    description:
      'BOMA 2024 aligned calculation workflows with safety valve protection. Automatically adjusts for occupancy.',
    variant: 'spotlight',
    metric: 'BOMA 2024',
  },
  {
    icon: Shield,
    title: 'Cap Type Support',
    description:
      'Non-cumulative, cumulative, and cumulative compounding caps. Tracks unused capacity across years.',
    variant: 'spotlight',
    metric: '3 cap types',
  },
  {
    icon: Layers,
    title: 'Base Year Normalization',
    description:
      'Automatically normalizes base year expenses for low-occupancy periods.',
    variant: 'standard',
  },
  {
    icon: BarChart3,
    title: 'Expense Pool Management',
    description:
      'Flexible pool hierarchy with split allocations and GL account mapping.',
    variant: 'standard',
  },
  {
    icon: TrendingUp,
    title: 'Historical Variance Analysis',
    description:
      'Year-over-year comparisons with anomaly detection. Color-coded variance indicators.',
    variant: 'standard',
  },
  {
    icon: Download,
    title: 'ERP Export',
    description:
      'Export to Yardi, MRI, or generic CSV. Generate tenant reconciliation packets.',
    variant: 'standard',
  },
  {
    icon: FileCheck,
    title: 'Traceable Audit Records',
    description:
      'Financial data changes are logged with who changed what, when, and from what value, with exports for external review.',
    variant: 'wide',
  },
  {
    icon: FileCheck,
    title: 'California SB 1103 Compliance',
    description:
      'Automatically generate itemized 18-month CAM expense ledgers for Qualified Commercial Tenants. Track 30-day response deadlines.',
    variant: 'standard',
  },
  {
    icon: Building2,
    title: 'NOI Impact Calculator',
    description:
      'Model how fixed CAM statements affect NOI and asset value. This is an estimate, not a promised gain.',
    variant: 'standard',
  },
]

export interface FeaturesGridProps {
  /** Additional CSS classes */
  className?: string
}

export function FeaturesGrid({ className }: FeaturesGridProps) {
  return (
    <section className={cn('bg-foreground py-20', className)}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-fluid-3xl font-bold tracking-tight text-background">
            Everything You Need for CRE FinOps
          </h2>
          <p className="text-fluid-lg text-background/70">
            Purpose-built features for commercial real estate financial
            operations.
          </p>
        </div>

        {/* Features bento grid */}
        <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => (
            <div
              key={index}
              className={cn(
                'group rounded-xl border border-border/20 bg-background/5 p-6 transition-all duration-200',
                'hover:border-primary/50 hover:bg-background/10',
                feature.variant === 'spotlight' && 'lg:col-span-2',
                feature.variant === 'wide' && 'lg:col-span-2 md:col-span-2'
              )}
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 transition-colors duration-200 group-hover:bg-primary/20">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              {feature.metric && (
                <div className="mb-2 text-2xl font-bold text-primary">
                  {feature.metric}
                </div>
              )}
              <h3 className="mb-2 text-lg font-semibold text-background">
                {feature.title}
              </h3>
              <p className="leading-relaxed text-background/70 text-sm">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
