import { Card, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string
  icon?: LucideIcon
  iconColor?:
    | 'primary'
    | 'success'
    | 'warning'
    | 'info'
    | 'chart-1'
    | 'chart-2'
    | 'chart-3'
    | 'chart-4'
    | 'chart-5'
  isLoading?: boolean
  /**
   * When true (and not loading), the value could not be loaded. The card shows
   * a dash and a short caption instead of a stale or misleading number.
   */
  isError?: boolean
  className?: string
  /** HTML heading element to use for the card title. Defaults to "h3". */
  titleAs?: 'h2' | 'h3' | 'h4'
  /** When true, renders the value in monospace with tabular-nums (use for money values). */
  mono?: boolean
}

export function StatCard({
  title,
  value,
  icon: Icon,
  iconColor = 'primary',
  isLoading,
  isError,
  className,
  titleAs: TitleElement = 'h3',
  mono = false,
}: StatCardProps) {
  const iconColorClasses = {
    primary: 'text-primary bg-primary/10',
    success: 'text-success bg-success/10',
    warning: 'text-warning bg-warning/10',
    info: 'text-info bg-info/10',
    'chart-1': 'text-[hsl(var(--chart-1))] bg-[hsl(var(--chart-1))]/10',
    'chart-2': 'text-[hsl(var(--chart-2))] bg-[hsl(var(--chart-2))]/10',
    'chart-3': 'text-[hsl(var(--chart-3))] bg-[hsl(var(--chart-3))]/10',
    'chart-4': 'text-[hsl(var(--chart-4))] bg-[hsl(var(--chart-4))]/10',
    'chart-5': 'text-[hsl(var(--chart-5))] bg-[hsl(var(--chart-5))]/10',
  }

  if (isLoading) {
    return (
      <Card variant="elevated" className={cn('overflow-hidden', className)}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <TitleElement className="text-sm font-medium text-muted-foreground leading-none tracking-tight">
                {title}
              </TitleElement>
              <Skeleton className="h-8 w-32" />
            </div>
            {Icon && <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />}
          </div>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card
      variant="elevated"
      className={cn(
        'overflow-hidden transition-all duration-normal hover:shadow-md',
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <TitleElement className="text-sm font-medium text-muted-foreground leading-none tracking-tight">
              {title}
            </TitleElement>
            <div className="flex items-baseline gap-2">
              {isError ? (
                <p
                  className="text-fluid-2xl font-bold tracking-tight text-muted-foreground"
                  aria-label={`${title} could not be loaded`}
                >
                  &mdash;
                </p>
              ) : (
                <p
                  className={cn(
                    'text-fluid-2xl font-bold tracking-tight',
                    mono && 'font-mono tabular-nums'
                  )}
                >
                  {value}
                </p>
              )}
            </div>
            {isError && (
              <p className="text-xs text-muted-foreground">Couldn't load</p>
            )}
          </div>
          {Icon && (
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                iconColorClasses[iconColor]
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
        </div>
      </CardHeader>
    </Card>
  )
}
