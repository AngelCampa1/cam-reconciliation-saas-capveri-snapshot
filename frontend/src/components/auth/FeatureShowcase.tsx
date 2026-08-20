import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const bullets = [
  'Catch lease-term mismatches before tenant statements go out.',
  'Gross-ups, caps, base years, exclusions. The same math every time. You can check every number.',
  'Works with Yardi, MRI, RealPage exports. No integration project.',
  'From GL export to a tenant-ready CAM packet. No spreadsheet required.',
]

const chips = ['Guided setup', 'Built-in reports', 'Flat annual price']

export interface FeatureShowcaseProps {
  /** Additional CSS classes */
  className?: string
}

export function FeatureShowcase({ className }: FeatureShowcaseProps) {
  return (
    <div className={cn('text-primary-foreground', className)}>
      <div className="mb-10">
        <p className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight leading-tight">
          CAM reconciliation errors cost landlords real money every year.
        </p>
        <p className="mt-3 text-base text-primary-foreground/70 leading-relaxed">
          Stop rebuilding the same answer in spreadsheets every year.
        </p>
      </div>

      <div className="space-y-4 mb-10">
        {bullets.map((bullet, i) => (
          <div
            key={i}
            className="flex items-start gap-3"
            style={{
              animationDelay: `${i * 100}ms`,
              animationFillMode: 'both',
            }}
          >
            <CheckCircle2
              className="h-5 w-5 text-primary-foreground/80 mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <p className="text-sm leading-relaxed text-primary-foreground/80">
              {bullet}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center rounded-full bg-primary-foreground/10 ring-1 ring-primary-foreground/20 px-3 py-1 text-xs font-medium text-primary-foreground/90"
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  )
}
