/**
 * How It Works Section Component
 *
 * Displays a 4-step process timeline showing the workflow.
 * Updated to reflect the trial workflow.
 */
import { useRef } from 'react'
import { Upload, Cpu, FileSearch, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useScrollReveal } from '@/hooks/useScrollReveal'

const steps = [
  {
    number: 1,
    icon: Upload,
    title: 'Upload Your Data',
    description:
      'Export your GL, rent roll, and lease docs from Yardi, MRI, or any system. Upload CSV, Excel, and PDF files in one place.',
  },
  {
    number: 2,
    icon: Cpu,
    title: 'We Run the Reconciliation',
    description:
      'Our AI ingestion pipeline and data extraction map each file to the right lease terms. You review every extracted field before any calculation commits.',
  },
  {
    number: 3,
    icon: FileSearch,
    title: 'Review Your Findings',
    description:
      'Many runs finish in minutes with a line-by-line trail. Review gross-up, caps, and pro-rata shares across your buildings. Billing errors are flagged before statements go out.',
  },
  {
    number: 4,
    icon: DollarSign,
    title: 'Close the Reconciliation',
    description:
      'Close CAM reconciliations by sharing the same math your tenants and auditors can check.',
  },
]

export interface HowItWorksSectionProps {
  /** Additional CSS classes */
  className?: string
}

export function HowItWorksSection({ className }: HowItWorksSectionProps) {
  const sectionRef = useRef<HTMLElement>(null)
  useScrollReveal(sectionRef)

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className={cn('bg-background py-20', className)}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-fluid-3xl font-bold tracking-tight text-foreground">
            How CapVeri Works
          </h2>
          <p className="text-fluid-lg text-muted-foreground">
            Upload your data. Check statements before they go out.
          </p>
        </div>

        {/* Steps timeline */}
        <div className="relative">
          {/* Connection line - desktop */}
          <div className="absolute left-1/2 top-24 hidden h-0.5 w-[calc(100%-200px)] -translate-x-1/2 bg-gradient-to-r from-primary/20 via-primary to-primary/20 lg:block" />

          <div className="grid gap-4 md:gap-6 lg:gap-10 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <div
                key={step.number}
                className="animate-on-scroll relative flex flex-col items-center text-center hover:bg-muted/50 transition-colors duration-200 rounded-xl p-4"
                data-delay={String(index * 100) as '0' | '100' | '200' | '300'}
              >
                {/* Step number badge */}
                <div className="relative mb-6">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25">
                    <step.icon className="h-8 w-8" />
                  </div>
                  <div className="absolute -right-2 -top-2 flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">
                    {step.number}
                  </div>
                </div>

                {/* Content */}
                <h3 className="mb-3 text-fluid-xl font-bold text-foreground">
                  {step.title}
                </h3>
                <p className="max-w-xs leading-relaxed text-muted-foreground">
                  {step.description}
                </p>

                {/* Arrow for mobile */}
                {index < steps.length - 1 && (
                  <div className="my-4 text-primary md:hidden">
                    <svg
                      className="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 14l-7 7m0 0l-7-7m7 7V3"
                      />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
