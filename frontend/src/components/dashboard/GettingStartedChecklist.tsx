/**
 * Getting Started Checklist Component
 *
 * Shows progress for new users completing initial setup.
 */
import { Check, Circle, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
export interface ChecklistItem {
  id: string
  title: string
  description: string
  completed: boolean
  href: string
}

export interface GettingStartedChecklistProps {
  /** Checklist items with completion status */
  items: ChecklistItem[]
  /** Callback when user dismisses the checklist */
  onDismiss?: () => void
  /** Additional CSS classes */
  className?: string
}

const defaultItems: ChecklistItem[] = [
  {
    id: 'sample',
    title: 'See a sample result',
    description:
      'See how CapVeri catches over-bills and under-bills. Fix them before you send.',
    completed: false,
    // `?demo=1` reaches the sample result for a signed-in user; a bare /onboard
    // bounces logged-in users to checkout.
    href: '/onboard?demo=1',
  },
  {
    id: 'property',
    title: 'Check your own building',
    description: 'Add one building. We check the statement for mistakes.',
    completed: false,
    href: '/properties/new',
  },
  {
    id: 'export',
    title: 'Get your support packet',
    description: 'Save the math and notes. Use them before you send.',
    completed: false,
    href: '/reconciliations',
  },
  {
    id: 'more-properties',
    title: 'Add your other buildings',
    description: 'Have more buildings? Add them and check each one.',
    completed: false,
    href: '/properties/new',
  },
]

export function GettingStartedChecklist({
  items = defaultItems,
  onDismiss,
  className,
}: GettingStartedChecklistProps) {
  // Onboarding is sequential: a later step is only shown as done once every
  // earlier step is done too. This keeps the checkmarks contiguous so the
  // checklist never contradicts its own "property, then unit, then GL, then
  // reconcile" promise — e.g. it won't show "Run reconciliation" complete while
  // "Add units" is still open, which reads as broken to a first-time viewer.
  const firstIncompleteIndex = items.findIndex((item) => !item.completed)
  const completedCount =
    firstIncompleteIndex === -1 ? items.length : firstIncompleteIndex
  const progress =
    items.length === 0 ? 0 : (completedCount / items.length) * 100
  const nextItem =
    firstIncompleteIndex === -1 ? undefined : items[firstIncompleteIndex]
  const isStepComplete = (index: number) =>
    firstIncompleteIndex === -1 || index < firstIncompleteIndex

  return (
    <Card className={cn('border-2 border-primary/20', className)}>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle as="h2" className="text-xl">
              Start here
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Start with the sample. Then check your own building.
            </p>
          </div>
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="self-start text-muted-foreground"
            >
              Dismiss
            </Button>
          )}
        </div>
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {completedCount} of {items.length} completed
            </span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol role="list" className="list-none p-0 m-0 space-y-3">
          {items.map((item, index) => {
            const stepComplete = isStepComplete(index)
            return (
              <li
                key={item.id}
                className={cn(
                  'flex flex-col gap-3 rounded-lg p-3 transition-colors duration-200 sm:flex-row sm:items-start',
                  stepComplete
                    ? 'bg-muted/50'
                    : item.id === nextItem?.id
                      ? 'bg-primary/5 ring-1 ring-primary/20'
                      : 'hover:bg-muted/50'
                )}
              >
                {/* Status icon */}
                <div className="mt-0.5 shrink-0">
                  {stepComplete ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </div>
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground/50" />
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'break-words font-medium',
                      stepComplete && 'text-muted-foreground line-through'
                    )}
                  >
                    {item.title}
                  </div>
                  <div className="break-words text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </div>
                </div>

                {/* Action button for next item */}
                {!stepComplete && item.id === nextItem?.id && (
                  <Button
                    asChild
                    size="sm"
                    className="w-full rounded-full sm:w-auto"
                  >
                    <Link to={item.href}>
                      Start
                      <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
                    </Link>
                  </Button>
                )}
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
