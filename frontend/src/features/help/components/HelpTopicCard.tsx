import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { HelpTopic } from '../types'

interface HelpTopicCardProps {
  topic: HelpTopic
  compact?: boolean
  className?: string
}

export function HelpTopicCard({
  topic,
  compact = false,
  className,
}: HelpTopicCardProps) {
  const Icon = topic.icon

  return (
    <article
      className={cn(
        'rounded-lg border border-border bg-card p-5 shadow-sm',
        'transition-colors duration-fast hover:border-primary/30',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            {topic.category}
          </p>
          <h3 className="mt-1 text-base font-semibold text-foreground">
            {topic.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {topic.summary}
          </p>
        </div>
      </div>

      {!compact && (
        <ol className="mt-4 space-y-3">
          {topic.steps.map((step, index) => (
            <li key={step.title} className="flex gap-3 text-sm">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                {index + 1}
              </span>
              <span>
                <span className="font-medium text-foreground">
                  {step.title}:{' '}
                </span>
                <span className="text-muted-foreground">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {topic.href && topic.ctaLabel && (
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to={topic.href}>
            {topic.ctaLabel}
            {/* Disambiguate links that share a ctaLabel across topic cards
                (e.g. several "View reconciliations") for screen-reader users. */}
            <span className="sr-only"> for {topic.title}</span>
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      )}
    </article>
  )
}
