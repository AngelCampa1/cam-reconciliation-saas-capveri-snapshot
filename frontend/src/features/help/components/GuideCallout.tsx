import { Lightbulb } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface GuideCalloutProps {
  title: string
  children: ReactNode
  className?: string
}

export function GuideCallout({
  title,
  children,
  className,
}: GuideCalloutProps) {
  return (
    <section
      className={cn(
        'rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm',
        className
      )}
    >
      <div className="flex gap-3">
        <Lightbulb
          className="mt-0.5 h-5 w-5 shrink-0 text-primary"
          aria-hidden="true"
        />
        <div className="min-w-0">
          {/* F-288: a tip-callout label is a contextual notice, not document
              structure. An h3 here landed directly under the page h1 on several
              pages (e.g. the reconciliation workspace), creating an illegal
              h1 -> h3 heading skip. Render a styled non-heading element. */}
          <p className="font-semibold text-foreground">{title}</p>
          <div className="mt-2 space-y-2 leading-relaxed text-muted-foreground">
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}
