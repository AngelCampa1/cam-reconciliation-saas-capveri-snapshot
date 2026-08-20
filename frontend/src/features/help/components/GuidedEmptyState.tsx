import { ArrowRight, HelpCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface GuidedEmptyStateProps {
  title: string
  description: string
  nextActionLabel?: string
  nextActionHref?: string
  children?: ReactNode
  className?: string
}

export function GuidedEmptyState({
  title,
  description,
  nextActionLabel,
  nextActionHref,
  children,
  className,
}: GuidedEmptyStateProps) {
  return (
    <section
      className={cn(
        'rounded-lg border border-dashed border-border bg-card p-6 text-center',
        className
      )}
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <HelpCircle className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {children && <div className="mt-4">{children}</div>}
      {nextActionLabel && nextActionHref && (
        <Button asChild className="mt-5">
          <Link to={nextActionHref}>
            {nextActionLabel}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      )}
    </section>
  )
}
