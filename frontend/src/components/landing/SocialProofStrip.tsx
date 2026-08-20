/**
 * Social Proof Strip Component
 *
 * A horizontal band of 4 key statistics that establishes immediate credibility.
 * Sits between the hero and value props to anchor messaging with evidence.
 */
import { cn } from '@/lib/utils'

const stats = [
  { value: '~40%', label: 'of CAM reconciliations may contain errors' },
  { value: 'Decimal', label: 'exact math, never rounded' },
  { value: 'BOMA 2024', label: 'aligned calculation engine' },
  { value: 'Minutes', label: 'to your first reconciliation' },
]

export interface SocialProofStripProps {
  className?: string
}

export function SocialProofStrip({ className }: SocialProofStripProps) {
  return (
    <section
      className={cn('bg-muted/50 border-y border-border py-8', className)}
      aria-label="Key statistics"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <div
              key={index}
              className={cn(
                'text-center',
                index < stats.length - 1 && 'lg:border-r lg:border-border/50'
              )}
            >
              <div className="text-2xl font-bold text-foreground">
                {stat.value}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
